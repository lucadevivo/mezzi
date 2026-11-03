/*
 * 03/11/2026: la corsa Fiesta 68.906,5 -> 68.924,1 (17,6 km) l'ha fatta Marco, è finita a Luca.
 * Ledger append-only: storno della riga di Luca + addebito uguale a Marco; la corsa passa a Marco.
 * Rieseguibile: se lo storno c'è già non fa niente.
 *   docker exec -i mezzi-app node --input-type=module < scripts/sposta-corsa-a-marco.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');
db.pragma('foreign_keys = ON');

const TRIP = 'fa40e69b-9996-4e89-b22e-008f22323c2d';
const DA = 'u-luca', A = 'u-marco';
const orig = db.prepare(
  `select * from ledger_entries where source_type='trip' and source_id=? and user_id=? and reverses_entry_id is null`,
).get(TRIP, DA);
if (!orig) throw new Error('Riga di Luca non trovata');
if (db.prepare('select 1 from ledger_entries where reverses_entry_id=?').get(orig.id)) {
  console.log('Già fatto.'); process.exit(0);
}
const now = Date.now();
const ins = db.prepare(
  `insert into ledger_entries (id,user_id,vehicle_id,type,amount_cents,amount_km,source_type,source_id,
   reverses_entry_id,occurred_at,description,created_at) values (?,?,?,?,?,?,'trip',?,?,?,?,?)`,
);
db.transaction(() => {
  ins.run(randomUUID(), DA, orig.vehicle_id, 'adjustment', -orig.amount_cents, -orig.amount_km, TRIP,
    orig.id, now, 'Storno: corsa di Marco registrata a Luca', now);
  ins.run(randomUUID(), A, orig.vehicle_id, 'consumption_charge', orig.amount_cents, orig.amount_km, TRIP,
    null, orig.occurred_at, orig.description, now);
  db.prepare('update trips set user_id=?, note=?, updated_at=? where id=?')
    .run(A, 'Registrata da Luca, spostata a Marco', now, TRIP);
  db.prepare(`insert into audit_log (id,user_id,action,entity_type,entity_id,payload,occurred_at,created_at)
    values (?, 'u-luca', 'trip.reassign', 'trip', ?, ?, ?, ?)`)
    .run(randomUUID(), TRIP, JSON.stringify({ from: DA, to: A }), now, now);
})();
for (const r of db.prepare(`select u.name, round(sum(l.amount_km),1) km from ledger_entries l join user u on u.id=l.user_id
  where l.vehicle_id='v-fiesta' group by u.id`).all()) console.log(`  ${r.name}: ${r.km}`);
