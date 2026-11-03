/*
 * Fiesta: corse dal 23/10 al 02/11/2026 ricostruite dalle foto del contachilometri (02/11/2026).
 *
 * Luca non le aveva registrate. Da 68.339,2 (ultima corsa nell'app, 23/10 02:29) a
 * 68.861,1 (foto del 02/11 18:00) = 521,9 km. Ripartizione decisa da Luca:
 *   - a Marco: la sua corsa (68.545,5 -> 68.604,2) + i viaggi per la fisioterapia di
 *     Gabriele, stimati su un ciclo completo di ~30 km (porta, torna, va, riporta:
 *     4 tratte da ~7,5 km), mezzo ciclo = 15 km;
 *   - tutto il resto a Luca.
 * Totali: Marco 201,2 km, Luca 320,7 km.
 *
 * Replica di closeTrip come aggiorna-500.mjs: corse già chiuse, retrodatate con gli orari
 * delle foto, consumo dichiarato 18,6 km/l, prezzo 220 c/l (serbatoio dall'ultimo pieno),
 * ledger consumption_charge con amount_km = -distanza. Le corse fisio hanno la categoria
 * "fisioterapia". Rieseguibile: se la prima corsa c'è già, non fa niente.
 *
 *   docker exec -i mezzi-app node < scripts/fiesta-foto-2310-0211.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');
db.pragma('foreign_keys = ON');

const VID = 'v-fiesta';
const L = 'u-luca';
const M = 'u-marco';
const CONSUMO_KM_L = 18.6;
const PREZZO_CENTS = 220;
const INIZIO_KM = 68339.2;
const FINE_KM = 68861.1;
const FISIO = 'fisioterapia';

// [utente, km fine, inizio, fine, fisio?]  (orari Europe/Rome; ora solare dal 25/10 03:00)
const CORSE = [
  [M, 68369.2, '2026-10-23T09:30+02:00', '2026-10-23T11:45+02:00', true],  // 1 fisio ven 23
  [L, 68375.1, '2026-10-24T18:00+02:00', '2026-10-24T18:53+02:00'],        // 1 resto
  [L, 68435.6, '2026-10-24T18:53+02:00', '2026-10-25T18:53+01:00'],        // 2
  [L, 68447.8, '2026-10-25T18:53+01:00', '2026-10-27T01:40+01:00'],        // 3
  [M, 68477.8, '2026-10-27T17:20+01:00', '2026-10-27T19:20+01:00', true],  // 4 fisio mar 27
  [L, 68495.6, '2026-10-27T19:30+01:00', '2026-10-27T22:29+01:00'],        // 4 resto
  [L, 68515.5, '2026-10-27T22:35+01:00', '2026-10-28T09:00+01:00'],        // 5 resto
  [M, 68545.5, '2026-10-28T10:10+01:00', '2026-10-28T13:00+01:00', true],  // 5 fisio mer 28
  [M, 68604.2, '2026-10-28T13:05+01:00', '2026-10-29T15:27+01:00'],        // 6 corsa di Marco
  [M, 68611.7, '2026-10-29T15:27+01:00', '2026-10-29T15:45+01:00', true],  // 7 ritorno fisio
  [L, 68621.7, '2026-10-29T15:45+01:00', '2026-10-29T15:59+01:00'],        // 7 resto
  [M, 68636.7, '2026-10-29T16:50+01:00', '2026-10-29T17:40+01:00', true],  // 8 ritiro fisio
  [L, 68665.3, '2026-10-29T17:40+01:00', '2026-10-29T22:20+01:00'],        // 8 resto
  [M, 68680.3, '2026-10-30T09:40+01:00', '2026-10-30T11:30+01:00', true],  // 9 idroterapia
  [L, 68683.2, '2026-10-30T11:30+01:00', '2026-10-30T18:56+01:00'],        // 9 resto
  [L, 68711.5, '2026-10-30T18:56+01:00', '2026-10-30T22:22+01:00'],        // 10
  [L, 68723.4, '2026-10-31T11:10+01:00', '2026-10-31T13:06+01:00'],        // 11
  [L, 68802.1, '2026-10-31T13:06+01:00', '2026-11-01T18:30+01:00'],        // 12
  [L, 68833.7, '2026-11-01T18:30+01:00', '2026-11-01T22:10+01:00'],        // 13
  [L, 68843.3, '2026-11-01T22:10+01:00', '2026-11-02T01:44+01:00'],        // 14
  [L, 68846.1, '2026-11-02T01:44+01:00', '2026-11-02T12:00+01:00'],        // 15 resto
  [M, 68861.1, '2026-11-02T16:40+01:00', '2026-11-02T18:00+01:00', true],  // 15 fisio lun 2 (andata)
];

const round1 = (n) => Math.round(n * 10) / 10;
const ID = (i) => `f1e5f070-0211-4000-8000-${String(i).padStart(12, '0')}`;

// Controlli prima di scrivere: contachilometri contiguo, orari crescenti, totali attesi.
let km = INIZIO_KM, t = 0;
const tot = { [L]: 0, [M]: 0 };
for (const [u, end, s, e] of CORSE) {
  const [ts, te] = [Date.parse(s), Date.parse(e)];
  if (!(end > km) || !(te > ts) || ts < t) throw new Error(`Corsa incoerente: ${km} -> ${end} ${s}`);
  tot[u] = round1(tot[u] + end - km);
  km = end; t = te;
}
if (km !== FINE_KM || tot[M] !== 201.2 || tot[L] !== 320.7) throw new Error(`Totali: ${JSON.stringify(tot)} fine ${km}`);

const vehicle = db.prepare('select * from vehicles where id = ?').get(VID);
if (db.prepare('select 1 from trips where id = ?').get(ID(0))) {
  console.log('Corse già inserite: niente da fare.');
  process.exit(0);
}
if (vehicle.current_odometer_km !== INIZIO_KM) throw new Error(`Contachilometri Fiesta = ${vehicle.current_odometer_km}, atteso ${INIZIO_KM}`);
if (db.prepare("select 1 from trips where vehicle_id = ? and status != 'closed'").get(VID)) throw new Error('Corsa aperta sulla Fiesta');

const now = Date.now();
const insertTrip = db.prepare(
  `insert into trips
     (id, vehicle_id, user_id, odometer_start_km, odometer_end_km, distance_km, started_at,
      ended_at, status, note, cost_cents, liters_estimated, unit_price_used_cents, price_source,
      consumption_km_l_used, consumption_source, category_id, created_at, updated_at)
   values (?, ?, ?, ?, ?, ?, ?, ?, 'closed', ?, ?, ?, ?, 'tank_weighted', ?, 'declared', ?, ?, ?)`,
);
const ledger = db.prepare(
  `insert into ledger_entries
     (id, user_id, vehicle_id, type, amount_cents, amount_km, source_type, source_id,
      reverses_entry_id, occurred_at, description, created_at)
   values (?, ?, ?, 'consumption_charge', 0, ?, 'trip', ?, null, ?, ?, ?)`,
);
const audit = db.prepare(
  `insert into audit_log (id, user_id, action, entity_type, entity_id, payload, occurred_at, created_at)
   values (?, 'u-luca', 'trip.close', 'trip', ?, ?, ?, ?)`,
);

db.transaction(() => {
  let cat = db.prepare('select id from trip_categories where name = ?').get(FISIO)?.id;
  if (!cat) {
    cat = randomUUID();
    db.prepare('insert into trip_categories (id, name, created_by_user_id, created_at) values (?, ?, ?, ?)')
      .run(cat, FISIO, L, now);
  }
  let start = INIZIO_KM;
  CORSE.forEach(([u, end, s, e, fisio], i) => {
    const id = ID(i);
    const distanceKm = round1(end - start);
    const liters = distanceKm / CONSUMO_KM_L;
    const costCents = Math.round(liters * PREZZO_CENTS);
    const note = fisio ? 'Fisioterapia Gabriele (stima), ricostruita da foto' : 'Ricostruita da foto del contachilometri';
    insertTrip.run(id, VID, u, start, end, distanceKm, Date.parse(s), Date.parse(e), note, costCents,
      liters, PREZZO_CENTS, CONSUMO_KM_L, fisio ? cat : null, now, now);
    ledger.run(randomUUID(), u, VID, -distanceKm, id, Date.parse(e), `${Math.round(distanceKm)} km su ${vehicle.name}`, now);
    audit.run(randomUUID(), id, JSON.stringify({ distanceKm, costCents, priceSource: 'tank_weighted' }), Date.parse(e), now);
    start = end;
  });
  db.prepare('update vehicles set current_odometer_km = ?, updated_at = ? where id = ?').run(FINE_KM, now, VID);
})();

console.log(`Inserite ${CORSE.length} corse. Marco ${tot[M]} km, Luca ${tot[L]} km.`);
for (const r of db.prepare(
  `select u.name, round(sum(l.amount_km), 1) km from ledger_entries l join user u on u.id = l.user_id
   where l.vehicle_id = ? group by u.id order by u.name`).all(VID)) console.log(`  ${r.name}: ${r.km}`);
