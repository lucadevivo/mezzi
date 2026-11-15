/*
 * Correzione una tantum (23/09/2026).
 *
 * Il 22/09 Luca ha chiuso la corsa sulla Fiesta a 67.266 invece che a 67.253,7 e poi l'ha
 * stornata per sbaglio. Qui la corsa torna attiva col contachilometri giusto:
 *   67.214,1 → 67.253,7   39,6 km
 *
 * Ledger append-only: addebito e storno sbagliati restano, si aggiunge l'addebito giusto.
 * Il contachilometri del mezzo torna a 67.253,7. Rieseguibile: se la corsa è già corretta,
 * non fa niente.
 *
 *   docker exec -i mezzi-app node < scripts/correggi-corsa-2209.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');

const TRIP_ID = '265bb0e9-3086-4532-8301-f3c488bf5c9a';
const FINE_KM = 67253.7;
const NOTA = 'Contachilometri di fine corretto: 67.266 → 67.253,7';

const trip = db.prepare('select * from trips where id = ?').get(TRIP_ID);
if (!trip || trip.odometer_end_km === FINE_KM) {
  console.log('Niente da correggere.');
  process.exit(0);
}

const km = Math.round((FINE_KM - trip.odometer_start_km) * 10) / 10;
const litri = km / trip.consumption_km_l_used;
const now = Date.now();

db.transaction(() => {
  db.prepare(
    `update trips set odometer_end_km = ?, distance_km = ?, cost_cents = ?, liters_estimated = ?,
       note = ?, updated_at = ? where id = ?`,
  ).run(FINE_KM, km, Math.round(litri * trip.unit_price_used_cents), litri, NOTA, now, TRIP_ID);

  db.prepare(
    `insert into ledger_entries
       (id, user_id, vehicle_id, type, amount_cents, amount_km, source_type, source_id,
        reverses_entry_id, occurred_at, description, created_at)
     values (?, ?, ?, 'consumption_charge', 0, ?, 'trip', ?, null, ?, ?, ?)`,
  ).run(randomUUID(), trip.user_id, trip.vehicle_id, -km, TRIP_ID, trip.ended_at,
    `${Math.round(km)} km su Ford Fiesta`, now);

  // Nessuna corsa dopo questa: il mezzo riparte dal contachilometri vero.
  db.prepare('update vehicles set current_odometer_km = ?, updated_at = ? where id = ?')
    .run(FINE_KM, now, trip.vehicle_id);

  db.prepare(
    `insert into audit_log (id, user_id, action, entity_type, entity_id, payload, occurred_at, created_at)
     values (?, 'u-luca', 'trip.fix_odometer', 'trip', ?, ?, ?, ?)`,
  ).run(randomUUID(), TRIP_ID, JSON.stringify({ da: trip.odometer_end_km, a: FINE_KM, km }), now, now);
})();

console.log(`Corsa riattivata: ${km} km a ${trip.user_id}, mezzo a ${FINE_KM}`);
