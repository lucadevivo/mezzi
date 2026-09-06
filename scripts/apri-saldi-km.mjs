/*
 * Apertura dei saldi in chilometri (una tantum, 06/09/2026).
 *
 * Il conto è passato dagli euro all'autonomia. Le righe di ledger già scritte restano
 * dove sono — il ledger è append-only e lo storico in euro serve ancora — ma hanno
 * `amount_km` a zero, quindi da sole darebbero saldi tutti a zero.
 *
 * Qui si scrive una riga `opening` per utente: il saldo in euro di prima, convertito
 * al costo per chilometro di adesso (prezzo del carburante in serbatoio ÷ consumo in
 * uso). Nessuno ci perde: chi aveva anticipato si ritrova l'autonomia corrispondente.
 *
 * È rieseguibile: se l'apertura c'è già, non la rifà.
 *
 *   docker exec -i mezzi-app node < scripts/apri-saldi-km.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');

const gia = db.prepare("select count(*) n from ledger_entries where type='opening'").get();
if (gia.n > 0) {
  console.log('Apertura già fatta: non tocco niente.');
  process.exit(0);
}

// Il mezzo che ha i movimenti: prezzo e consumo di riferimento vengono da lì.
const mezzo = db
  .prepare(
    `select v.* from vehicles v
     join ledger_entries l on l.vehicle_id = v.id
     group by v.id order by count(*) desc limit 1`,
  )
  .get();

if (!mezzo) {
  console.log('Nessun movimento: non c’è niente da aprire.');
  process.exit(0);
}

const ultimoPrezzo = db
  .prepare('select price_per_liter_cents p from refuels where vehicle_id=? order by refueled_at desc limit 1')
  .get(mezzo.id);

const kmPerLitro = mezzo.computed_consumption_km_l ?? mezzo.declared_consumption_km_l;
const centesimiPerKm = ultimoPrezzo.p / kmPerLitro;

const saldi = db
  .prepare('select user_id, sum(amount_cents) c from ledger_entries group by user_id')
  .all();

const ins = db.prepare(
  'insert into ledger_entries (id,user_id,vehicle_id,type,amount_cents,amount_km,source_type,source_id,occurred_at,description) values (?,?,?,?,?,?,?,?,?,?)',
);
const aud = db.prepare(
  'insert into audit_log (id,user_id,action,entity_type,entity_id,payload,occurred_at) values (?,?,?,?,?,?,?)',
);

db.transaction(() => {
  for (const { user_id, c } of saldi) {
    const km = Math.round((c / centesimiPerKm) * 10) / 10;
    if (km === 0) continue;
    const desc =
      'Apertura saldo in chilometri: ' +
      (c / 100).toFixed(2) +
      ' EUR al costo di ' +
      (centesimiPerKm / 100).toFixed(4) +
      ' EUR/km';
    ins.run(randomUUID(), user_id, mezzo.id, 'opening', 0, km, 'manual', null, Date.now(), desc);
    aud.run(
      randomUUID(),
      'u-luca',
      'ledger.opening_km',
      'user',
      user_id,
      JSON.stringify({ fromCents: c, km, centesimiPerKm }),
      Date.now(),
    );
    console.log(user_id, (c / 100).toFixed(2), 'EUR ->', km, 'km');
  }
})();

console.log(
  db
    .prepare(
      'select u.name, round(sum(l.amount_km),1) km from ledger_entries l join user u on u.id=l.user_id group by u.name',
    )
    .all(),
);
