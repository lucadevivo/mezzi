/*
 * Setup della Fiat 500 coi dati veri (19/10/2026).
 *
 * La 500 (v-500) era a zero: valori di libretto inventati a luglio e contachilometri 0.
 * Luca ha mandato libretto, polizza e cruscotto. Qui, in una transazione sola:
 *   1. consumo di libretto: combinato 5,10 l/100km = 19,6 km/l (era 17 inventato).
 *      Serbatoio 35 l era già giusto.
 *   2. due corse precedenti di Marco, inserite già chiuse (retrodatate: il flusso
 *      normale rifiuterebbe un contachilometri che "torna indietro"), che portano il
 *      mezzo fino al valore letto adesso sul cruscotto, 133.681 km:
 *        A) 6,2 km   133.660,4 -> 133.666,6
 *        B) 14,4 km  133.666,6 -> 133.681,0
 *      Replica di closeTrip: nessun rifornimento sul 500, quindi prezzo di ripiego
 *      (fallback 180 c/l) e consumo dichiarato 19,6 km/l; ledger consumption_charge
 *      con amount_km = -distanza (il saldo è in km, amount_cents = 0 come fa l'app).
 *      Marco va reso membro del 500.
 *   3. contachilometri del mezzo = 133.681.
 *
 * Rieseguibile: se le corse ci sono già, non fa niente.
 *
 *   docker exec -i mezzi-app node < scripts/aggiorna-500.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');
db.pragma('foreign_keys = ON');

const VID = 'v-500';
const MARCO = 'u-marco';
const CONSUMO_KM_L = 19.6;
const PREZZO_CENTS = 180; // FALLBACK_FUEL_PRICE_CENTS: nessun rifornimento sul 500.
const FINE_KM = 133681;

// Id fissi: rilanciare lo script non duplica le corse.
const TRIP_A = 'e5005000-0000-4000-8000-0000000006a2';
const TRIP_B = 'e5005000-0000-4000-8000-00000000144b';

const CORSE = [
  { id: TRIP_A, startKm: 133660.4, endKm: 133666.6, offMin: 40 }, // 6,2 km
  { id: TRIP_B, startKm: 133666.6, endKm: 133681.0, offMin: 35 }, // 14,4 km
];

const vehicle = db.prepare('select * from vehicles where id = ?').get(VID);
if (!vehicle) {
  console.error(`Mezzo ${VID} non trovato.`);
  process.exit(1);
}
if (!db.prepare('select 1 from user where id = ?').get(MARCO)) {
  console.error(`Utente ${MARCO} non trovato: la 500 non ha a chi attribuire le corse.`);
  process.exit(1);
}
if (db.prepare('select 1 from trips where id = ?').get(TRIP_A)) {
  console.log('Corse del 500 già inserite: niente da fare.');
  process.exit(0);
}

const now = Date.now();
const round1 = (n) => Math.round(n * 10) / 10;
const roundCents = (n) => (n < 0 ? -Math.round(-n) : Math.round(n));

const ledger = db.prepare(
  `insert into ledger_entries
     (id, user_id, vehicle_id, type, amount_cents, amount_km, source_type, source_id,
      reverses_entry_id, occurred_at, description, created_at)
   values (?, ?, ?, 'consumption_charge', 0, ?, 'trip', ?, null, ?, ?, ?)`,
);
const insertTrip = db.prepare(
  `insert into trips
     (id, vehicle_id, user_id, odometer_start_km, odometer_end_km, distance_km, started_at,
      ended_at, status, note, cost_cents, liters_estimated, unit_price_used_cents, price_source,
      consumption_km_l_used, consumption_source, created_at, updated_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?, 'fallback', ?, 'declared', ?, ?)`,
);
const audit = db.prepare(
  `insert into audit_log (id, user_id, action, entity_type, entity_id, payload, occurred_at, created_at)
   values (?, 'u-luca', 'trip.close', 'trip', ?, ?, ?, ?)`,
);

db.transaction(() => {
  // 1. Dati di libretto.
  db.prepare('update vehicles set declared_consumption_km_l = ?, updated_at = ? where id = ?')
    .run(CONSUMO_KM_L, now, VID);

  // 2. Marco membro del 500 (se non lo è già).
  if (!db.prepare('select 1 from vehicle_members where vehicle_id = ? and user_id = ?').get(VID, MARCO)) {
    db.prepare(
      'insert into vehicle_members (id, vehicle_id, user_id, share_fixed_costs, created_at) values (?, ?, ?, 1, ?)',
    ).run(randomUUID(), VID, MARCO, now);
  }

  // 3. Le due corse chiuse + ledger.
  for (const c of CORSE) {
    const distanceKm = round1(c.endKm - c.startKm);
    const liters = distanceKm / CONSUMO_KM_L;
    const costCents = roundCents(liters * PREZZO_CENTS);
    const startedAt = now - c.offMin * 60_000;
    const endedAt = now - (c.offMin - 5) * 60_000;
    insertTrip.run(c.id, VID, MARCO, c.startKm, c.endKm, distanceKm, startedAt, endedAt,
      null, costCents, liters, PREZZO_CENTS, CONSUMO_KM_L, now, now);
    ledger.run(randomUUID(), MARCO, VID, -distanceKm, c.id, endedAt,
      `${Math.round(distanceKm)} km su ${vehicle.name}`, now);
    audit.run(randomUUID(), c.id, JSON.stringify({ distanceKm, costCents, priceSource: 'fallback' }), endedAt, now);
  }

  // 4. Contachilometri al valore letto sul cruscotto.
  db.prepare('update vehicles set current_odometer_km = ?, updated_at = ? where id = ?')
    .run(FINE_KM, now, VID);
})();

console.log('--- Fiat 500 ---');
console.log(db.prepare('select name, declared_consumption_km_l, tank_capacity_l, current_odometer_km from vehicles where id = ?').get(VID));
console.log('Saldi (km):');
for (const r of db
  .prepare(`select u.name, round(sum(l.amount_km), 1) km from ledger_entries l
            join user u on u.id = l.user_id where u.billable = 1 group by u.id order by u.name`)
  .all()) {
  console.log(`  ${r.name}: ${r.km}`);
}
