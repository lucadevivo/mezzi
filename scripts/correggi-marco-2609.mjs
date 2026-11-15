/*
 * Correzione una tantum (27/09/2026).
 *
 * Tra il 24 e il 26/09 la Fiesta l'ha guidata papà (Marco), non Gabriele:
 *   - la corsa da 759,3 km (67.269,2 → 68.028,5) registrata a Gabriele;
 *   - i 21,1 km non registrati (68.061 → 68.082,1), ancora da reclamare;
 *   - un rifornimento: 63 € di diesel a 2,34 €/l.
 * Marco diventa un utente vero (entra e divide i conti come i figli) e prende tutte e tre.
 *
 * Ledger append-only: l'addebito di Gabriele si storna, a Marco si scrive un addebito nuovo.
 * Il rifornimento va alla fine della sua corsa (l'ora vera non si sa): contachilometri
 * 68.028,5, un minuto prima della chiusura. Rieseguibile: se Marco esiste già, non fa niente.
 * La password si imposta dopo, con scripts/set-password.mjs.
 *
 *   docker exec -i mezzi-app node < scripts/correggi-marco-2609.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');
db.pragma('foreign_keys = ON');

const MARCO = 'u-marco';
const TRIP_ID = '3a31f110-7622-4ff3-8017-53b42ca349ea';
const UNCLAIMED_ID = '2e14380a-8cdd-449f-af76-31788b21f3ff';
const EURO_CENTS = 6300;
const PREZZO_CENTS = 234;

if (db.prepare('select 1 from user where id = ?').get(MARCO)) {
  console.log('Marco esiste già: niente da fare.');
  process.exit(0);
}

const trip = db.prepare('select * from trips where id = ?').get(TRIP_ID);
const unclaimed = db.prepare('select * from unclaimed_trips where id = ?').get(UNCLAIMED_ID);
const vehicle = db.prepare('select * from vehicles where id = ?').get(trip.vehicle_id);
if (trip.user_id !== 'u-gabriele' || unclaimed.status !== 'pending') {
  console.error('I dati non sono più quelli attesi: controlla a mano.');
  process.exit(1);
}

const now = Date.now();
const round = (km) => Math.round(km * 10) / 10;
const ledger = db.prepare(
  `insert into ledger_entries
     (id, user_id, vehicle_id, type, amount_cents, amount_km, source_type, source_id,
      reverses_entry_id, occurred_at, description, created_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const audit = db.prepare(
  `insert into audit_log (id, user_id, action, entity_type, entity_id, payload, occurred_at, created_at)
   values (?, 'u-luca', ?, ?, ?, ?, ?, ?)`,
);

db.transaction(() => {
  // 1. Marco: fatturabile, può entrare (la password arriva dopo), membro della Fiesta.
  db.prepare(
    `insert into user (id, name, email, email_verified, role, color, billable, can_login, active,
       created_at, updated_at)
     values (?, 'Marco', 'marco@mezzi.local', 0, 'member', '#8a5cc2', 1, 1, 1, ?, ?)`,
  ).run(MARCO, now, now);
  db.prepare(
    `insert into vehicle_members (id, vehicle_id, user_id, share_fixed_costs, created_at)
     values (?, ?, ?, 1, ?)`,
  ).run(randomUUID(), vehicle.id, MARCO, now);

  // 2. La corsa da 759,3 km: storno a Gabriele, addebito a Marco.
  const tripKm = round(trip.distance_km);
  for (const e of db
    .prepare(`select * from ledger_entries where source_type = 'trip' and source_id = ?
                and reverses_entry_id is null`)
    .all(TRIP_ID)) {
    ledger.run(randomUUID(), e.user_id, e.vehicle_id, 'adjustment', -e.amount_cents, -e.amount_km,
      'trip', TRIP_ID, e.id, now, 'Storno: corsa guidata da Marco', now);
  }
  ledger.run(randomUUID(), MARCO, vehicle.id, 'consumption_charge', 0, -tripKm, 'trip', TRIP_ID,
    null, trip.ended_at, `${Math.round(tripKm)} km su ${vehicle.name}`, now);
  db.prepare('update trips set user_id = ?, note = ?, updated_at = ? where id = ?')
    .run(MARCO, 'Guidata da Marco, registrata per sbaglio a Gabriele', now, TRIP_ID);
  audit.run(randomUUID(), 'trip.reassign', 'trip', TRIP_ID,
    JSON.stringify({ da: 'u-gabriele', a: MARCO, km: tripKm }), now, now);

  // 3. I 21,1 km non registrati: reclamati da Marco (come applyResolution in unclaimed.ts).
  const unclaimedKm = round(unclaimed.distance_km);
  db.prepare(
    `insert into trips (id, vehicle_id, user_id, odometer_start_km, odometer_end_km, distance_km,
       started_at, ended_at, status, note, cost_cents, liters_estimated, unit_price_used_cents,
       unclaimed_trip_id, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'closed', 'Corsa reclamata', ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), vehicle.id, MARCO, unclaimed.odometer_start_km, unclaimed.odometer_end_km,
    unclaimedKm, unclaimed.window_start_at, unclaimed.detected_at, unclaimed.cost_cents,
    unclaimed.liters_estimated, unclaimed.unit_price_used_cents, UNCLAIMED_ID, now, now);
  ledger.run(randomUUID(), MARCO, vehicle.id, 'consumption_charge', -unclaimed.cost_cents,
    -unclaimedKm, 'unclaimed_trip', UNCLAIMED_ID, null, now,
    `${Math.round(unclaimedKm)} km non registrati`, now);
  db.prepare(
    `update unclaimed_trips set status = 'claimed', claimed_by_user_id = ?, resolved_at = ?,
       resolution_note = 'Reclamata', updated_at = ? where id = ?`,
  ).run(MARCO, now, now, UNCLAIMED_ID);
  audit.run(randomUUID(), 'unclaimed.claimed', 'unclaimed_trip', UNCLAIMED_ID,
    JSON.stringify({ chargedTo: [MARCO] }), now, now);

  // 4. Il rifornimento, accreditato come recordRefuel: litri × consumo in uso.
  const refuelId = randomUUID();
  const refueledAt = trip.ended_at - 60_000;
  const litri = EURO_CENTS / PREZZO_CENTS;
  const kmL = vehicle.computed_consumption_km_l ?? vehicle.declared_consumption_km_l;
  const km = round(litri * kmL);
  db.prepare(
    `insert into refuels (id, vehicle_id, user_id, liters, price_per_liter_cents, total_cents,
       odometer_km, tank_fraction_after, refueled_at, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, null, ?, ?, ?)`,
  ).run(refuelId, vehicle.id, MARCO, litri, PREZZO_CENTS, EURO_CENTS, trip.odometer_end_km,
    refueledAt, now, now);
  ledger.run(randomUUID(), MARCO, vehicle.id, 'refuel_credit', EURO_CENTS, km, 'refuel', refuelId,
    null, refueledAt, `${litri.toFixed(2)} l su ${vehicle.name}: ${km.toFixed(0)} km`, now);
  audit.run(randomUUID(), 'refuel.create', 'refuel', refuelId,
    JSON.stringify({ liters: litri, totalCents: EURO_CENTS, per: MARCO }), refueledAt, now);
})();

for (const r of db
  .prepare(`select u.name, round(sum(l.amount_km), 1) km from ledger_entries l
            join user u on u.id = l.user_id group by u.id order by u.name`)
  .all()) {
  console.log(`${r.name}: ${r.km} km`);
}
