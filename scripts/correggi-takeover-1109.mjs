/*
 * Correzione una tantum (20/09/2026).
 *
 * L'11/09 Luca ha lasciato aperta una corsa sulla Fiesta; Gabriele ha preso il mezzo,
 * ha premuto «Prendila comunque» e la corsa ha semplicemente cambiato intestatario:
 * i 59,9 km percorsi da Luca (66.904,2 → 66.964,1) sono finiti sul saldo di Gabriele.
 * Il codice adesso spezza la corsa al contachilometri di chi subentra; qui si rimedia
 * al dato già scritto.
 *
 * Il ledger è append-only: la riga sbagliata resta, si aggiungono lo storno a Gabriele
 * e l'addebito a Luca. La corsa torna intestata a Luca, che l'ha fatta davvero.
 * È rieseguibile: se lo storno c'è già, non fa niente.
 *
 *   docker exec -i mezzi-app node < scripts/correggi-takeover-1109.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');

const TRIP_ID = '2ea7a1f3-46b7-4cc7-be6a-130666e92d40';
const DRIVER_ID = 'u-luca'; // chi guidava davvero
const MOTIVO = 'Corsa di Luca chiusa da Gabriele col «prendila comunque»';

const entry = db
  .prepare(
    "select * from ledger_entries where source_id = ? and source_type = 'trip' and reverses_entry_id is null",
  )
  .get(TRIP_ID);

if (!entry) {
  console.log('Riga di addebito non trovata: niente da correggere.');
  process.exit(0);
}

const giaStornata = db
  .prepare('select 1 from ledger_entries where reverses_entry_id = ?')
  .get(entry.id);

if (giaStornata) {
  console.log('Correzione già applicata.');
  process.exit(0);
}

const now = Date.now();
const insert = db.prepare(
  `insert into ledger_entries
     (id, user_id, vehicle_id, type, amount_cents, amount_km, source_type, source_id,
      reverses_entry_id, occurred_at, description, created_at)
   values (?, ?, ?, ?, ?, ?, 'trip', ?, ?, ?, ?, ?)`,
);

db.transaction(() => {
  insert.run(
    randomUUID(),
    entry.user_id,
    entry.vehicle_id,
    'adjustment',
    -entry.amount_cents,
    -entry.amount_km,
    TRIP_ID,
    entry.id,
    now,
    `Storno: ${MOTIVO}`,
    now,
  );

  insert.run(
    randomUUID(),
    DRIVER_ID,
    entry.vehicle_id,
    'consumption_charge',
    entry.amount_cents,
    entry.amount_km,
    TRIP_ID,
    null,
    entry.occurred_at,
    entry.description,
    now,
  );

  db.prepare('update trips set user_id = ? where id = ?').run(DRIVER_ID, TRIP_ID);

  db.prepare(
    `insert into audit_log (id, user_id, action, entity_type, entity_id, payload, occurred_at)
     values (?, ?, 'trip.reassign', 'trip', ?, ?, ?)`,
  ).run(
    randomUUID(),
    DRIVER_ID,
    TRIP_ID,
    JSON.stringify({ from: entry.user_id, to: DRIVER_ID, amountKm: entry.amount_km, MOTIVO }),
    now,
  );
})();

const saldi = db
  .prepare(
    'select u.name, round(sum(l.amount_km), 1) km from ledger_entries l join user u on u.id = l.user_id group by l.user_id',
  )
  .all();

console.log('Fatto. Saldi (km):', saldi);
