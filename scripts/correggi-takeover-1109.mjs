/*
 * Correzione una tantum (20/09/2026).
 *
 * L'11/09 Luca ha lasciato aperta una corsa sulla Fiesta; Gabriele ha ripreso il mezzo
 * col contachilometri a 66.917,2 e ha premuto «Prendila comunque»: la corsa ha solo
 * cambiato intestatario, tenendosi la partenza di Luca (66.904,2). Risultato: tutti i
 * 59,9 km fino a 66.964,1 addebitati a Gabriele, anche i 13 km guidati da Luca.
 *
 * Qui si spezza la corsa dove andava spezzata, cioè al contachilometri del subentro —
 * la stessa cosa che il codice adesso fa da solo:
 *   Luca     66.904,2 → 66.917,2   13,0 km
 *   Gabriele 66.917,2 → 66.964,1   46,9 km
 *
 * Il ledger è append-only: la riga sbagliata resta, si aggiungono lo storno e i due
 * addebiti giusti. È rieseguibile: se lo storno c'è già, non fa niente.
 *
 *   docker exec -i mezzi-app node < scripts/correggi-takeover-1109.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');

const TRIP_ID = '2ea7a1f3-46b7-4cc7-be6a-130666e92d40';
/** Contachilometri letto da Gabriele quando ha ripreso il mezzo. */
const SUBENTRO_KM = 66917.2;
/** Istante del «prendila comunque», dall'audit log. */
const SUBENTRO_AT = 1789158797722;
const MOTIVO = 'Corsa di Luca proseguita da Gabriele: km separati al subentro';

const km1 = (v) => Math.round(v * 10) / 10;

const trip = db.prepare('select * from trips where id = ?').get(TRIP_ID);
const entry = db
  .prepare(
    "select * from ledger_entries where source_id = ? and source_type = 'trip' and reverses_entry_id is null",
  )
  .get(TRIP_ID);

if (!trip || !entry) {
  console.log('Corsa o riga di addebito non trovata: niente da correggere.');
  process.exit(0);
}
if (db.prepare('select 1 from ledger_entries where reverses_entry_id = ?').get(entry.id)) {
  console.log('Correzione già applicata.');
  process.exit(0);
}

// Il prezzo e il consumo restano quelli congelati sulla corsa: il passato non si ricalcola,
// si ridistribuisce soltanto tra due persone.
const kmLuca = km1(SUBENTRO_KM - trip.odometer_start_km);
const kmGabriele = km1(trip.odometer_end_km - SUBENTRO_KM);
const costo = (km) => {
  const litri = km / trip.consumption_km_l_used;
  return { litri, cents: Math.round(litri * trip.unit_price_used_cents) };
};
const cLuca = costo(kmLuca);
const cGabriele = costo(kmGabriele);

const now = Date.now();
const nuovaCorsaId = randomUUID();

const insertLedger = db.prepare(
  `insert into ledger_entries
     (id, user_id, vehicle_id, type, amount_cents, amount_km, source_type, source_id,
      reverses_entry_id, occurred_at, description, created_at)
   values (?, ?, ?, ?, ?, ?, 'trip', ?, ?, ?, ?, ?)`,
);

db.transaction(() => {
  // 1. storno dell'addebito sbagliato
  insertLedger.run(
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

  // 2. la corsa originale torna a Luca e finisce dove ha ripreso Gabriele
  db.prepare(
    `update trips set user_id = 'u-luca', odometer_end_km = ?, distance_km = ?, ended_at = ?,
       cost_cents = ?, liters_estimated = ?, note = ?, updated_at = ? where id = ?`,
  ).run(
    SUBENTRO_KM,
    kmLuca,
    SUBENTRO_AT,
    cLuca.cents,
    cLuca.litri,
    'Corsa lasciata aperta: chiusa al contachilometri del subentro',
    now,
    TRIP_ID,
  );

  insertLedger.run(
    randomUUID(),
    'u-luca',
    trip.vehicle_id,
    'consumption_charge',
    cLuca.cents,
    -kmLuca,
    TRIP_ID,
    null,
    entry.occurred_at,
    `${Math.round(kmLuca)} km su Ford Fiesta`,
    now,
  );

  // 3. il tratto di Gabriele diventa una corsa sua, dal subentro in poi
  db.prepare(
    `insert into trips
       (id, vehicle_id, user_id, odometer_start_km, odometer_end_km, distance_km, started_at,
        ended_at, status, note, cost_cents, liters_estimated, unit_price_used_cents, price_source,
        consumption_km_l_used, consumption_source, created_at, updated_at)
     values (?, ?, 'u-gabriele', ?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    nuovaCorsaId,
    trip.vehicle_id,
    SUBENTRO_KM,
    trip.odometer_end_km,
    kmGabriele,
    SUBENTRO_AT,
    trip.ended_at,
    'Ripresa del mezzo dopo una corsa lasciata aperta',
    cGabriele.cents,
    cGabriele.litri,
    trip.unit_price_used_cents,
    trip.price_source,
    trip.consumption_km_l_used,
    trip.consumption_source,
    now,
    now,
  );

  insertLedger.run(
    randomUUID(),
    'u-gabriele',
    trip.vehicle_id,
    'consumption_charge',
    cGabriele.cents,
    -kmGabriele,
    nuovaCorsaId,
    null,
    entry.occurred_at,
    `${Math.round(kmGabriele)} km su Ford Fiesta`,
    now,
  );

  db.prepare(
    `insert into audit_log (id, user_id, action, entity_type, entity_id, payload, occurred_at)
     values (?, 'u-luca', 'trip.split', 'trip', ?, ?, ?)`,
  ).run(
    randomUUID(),
    TRIP_ID,
    JSON.stringify({ motivo: MOTIVO, subentroKm: SUBENTRO_KM, kmLuca, kmGabriele, nuovaCorsaId }),
    now,
  );
})();

console.log(`Luca ${kmLuca} km · Gabriele ${kmGabriele} km`);
console.log(
  'Saldi (km):',
  db
    .prepare(
      'select u.name, round(sum(l.amount_km), 1) km from ledger_entries l join user u on u.id = l.user_id group by l.user_id',
    )
    .all(),
);
