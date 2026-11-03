/*
 * Ospite «Marco» doppione (03/11/2026).
 *
 * Il 19/10 una corsa non registrata della 500 (18,5 km, 133.681 -> 133.699,5) è stata
 * assegnata scrivendo «Marco» nella casella degli ospiti: è nato un ospite non fatturabile
 * accanto al Marco vero e quei km non sono finiti addosso a nessuno. Qui, in una transazione:
 *   1. storno della riga di ledger dell'ospite (append-only: riga di storno, niente UPDATE);
 *   2. corsa + addebito a u-marco, come applyResolution di un reclamo;
 *   3. corsa dell'ospite marcata «Stornata», corsa non registrata intestata a Marco;
 *   4. ospite disattivato (active = 0): le sue righe di ledger restano, lui sparisce dalle liste.
 *
 * Rieseguibile: se lo storno c'è già, non fa niente.
 *
 *   docker exec -i mezzi-app node --input-type=module < scripts/unisci-ospite-marco.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');
db.pragma('foreign_keys = ON');

const OSPITE = 'u-ospite-f4547e03';
const MARCO = 'u-marco';
const UNCLAIMED = '0a79c4ce-138f-4077-b8e4-0114d9512735';
const MOTIVO = "ospite «Marco» doppione: i km vanno al Marco vero";

const originale = db
  .prepare(
    `select * from ledger_entries where user_id = ? and source_type = 'unclaimed_trip'
     and source_id = ? and reverses_entry_id is null`,
  )
  .get(OSPITE, UNCLAIMED);
if (!originale) throw new Error("Riga di ledger dell'ospite non trovata");
if (db.prepare('select 1 from ledger_entries where reverses_entry_id = ?').get(originale.id)) {
  console.log('Già fatto: niente da fare.');
  process.exit(0);
}
const viaggio = db
  .prepare('select * from trips where unclaimed_trip_id = ? and user_id = ?')
  .get(UNCLAIMED, OSPITE);
if (!viaggio) throw new Error("Corsa dell'ospite non trovata");

const now = Date.now();
const insLedger = db.prepare(
  `insert into ledger_entries
     (id, user_id, vehicle_id, type, amount_cents, amount_km, source_type, source_id,
      reverses_entry_id, occurred_at, description, created_at)
   values (?, ?, ?, ?, ?, ?, 'unclaimed_trip', ?, ?, ?, ?, ?)`,
);

db.transaction(() => {
  // 1. Storno sull'ospite.
  insLedger.run(randomUUID(), OSPITE, originale.vehicle_id, 'adjustment', -originale.amount_cents,
    -originale.amount_km, UNCLAIMED, originale.id, now, `Storno: ${MOTIVO}`, now);

  // 2. Corsa e addebito al Marco vero.
  const tripId = randomUUID();
  db.prepare(
    `insert into trips
       (id, vehicle_id, user_id, odometer_start_km, odometer_end_km, distance_km, started_at,
        ended_at, status, note, cost_cents, liters_estimated, unit_price_used_cents,
        unclaimed_trip_id, created_at, updated_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?)`,
  ).run(tripId, viaggio.vehicle_id, MARCO, viaggio.odometer_start_km, viaggio.odometer_end_km,
    viaggio.distance_km, viaggio.started_at, viaggio.ended_at, "Corsa assegnata dall'admin",
    viaggio.cost_cents, viaggio.liters_estimated, viaggio.unit_price_used_cents, UNCLAIMED, now, now);
  insLedger.run(randomUUID(), MARCO, originale.vehicle_id, 'consumption_charge',
    originale.amount_cents, originale.amount_km, UNCLAIMED, null, now, originale.description, now);

  // 3. Note e intestazione.
  db.prepare('update trips set note = ?, updated_at = ? where id = ?')
    .run([viaggio.note, `Stornata: ${MOTIVO}`].filter(Boolean).join(' · '), now, viaggio.id);
  db.prepare(
    `update unclaimed_trips set status = 'claimed', claimed_by_user_id = ?, resolution_note = ?,
     updated_at = ? where id = ?`,
  ).run(MARCO, "Assegnata a Marco dall'admin", now, UNCLAIMED);

  // 4. Ospite fuori dalle liste.
  db.prepare('update user set active = 0 where id = ?').run(OSPITE);

  db.prepare(
    `insert into audit_log (id, user_id, action, entity_type, entity_id, payload, occurred_at, created_at)
     values (?, 'u-luca', 'unclaimed.assign', 'unclaimed_trip', ?, ?, ?, ?)`,
  ).run(randomUUID(), UNCLAIMED, JSON.stringify({ from: OSPITE, assignedTo: MARCO, reason: MOTIVO }), now, now);
})();

for (const r of db.prepare(
  `select u.name, u.active, round(sum(l.amount_km), 1) km from ledger_entries l join user u on u.id = l.user_id
   where l.vehicle_id = 'v-500' group by u.id`).all()) console.log(`  ${r.name}${r.active ? '' : ' (disattivo)'}: ${r.km}`);
