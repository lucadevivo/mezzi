/*
 * Correzione una tantum (06/09/2026).
 *
 * I primi tragitti caricati a posteriori sono stati addebitati al prezzo di ripiego
 * (1,80 €/l) perché sul mezzo non esisteva ancora nessun rifornimento: il serbatoio,
 * per il modello, era vuoto. Il codice adesso usa il prezzo del primo rifornimento
 * noto, ma i costi delle corse sono congelati alla riga e non si ricalcolano.
 *
 * Quindi qui non si tocca nessuna corsa: si aggiunge al ledger, che è append-only,
 * una riga `adjustment` con la differenza. È rieseguibile: le corse già corrette
 * vengono saltate.
 *
 *   docker exec -i mezzi-app node < scripts/correggi-prezzo-ripiego.mjs
 */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const db = require('better-sqlite3')('/app/data/mezzi.db');

const first = db
  .prepare('select price_per_liter_cents p from refuels order by refueled_at limit 1')
  .get();

if (!first) {
  console.log('Nessun rifornimento sul mezzo: niente da correggere.');
  process.exit(0);
}

const rows = db
  .prepare(
    "select id,user_id,vehicle_id,liters_estimated l,cost_cents c,ended_at e from trips where price_source='fallback' order by ended_at",
  )
  .all();

const gia = db.prepare(
  "select count(*) n from ledger_entries where type='adjustment' and source_type='trip' and source_id=?",
);
const ins = db.prepare(
  'insert into ledger_entries (id,user_id,vehicle_id,type,amount_cents,source_type,source_id,occurred_at,description) values (?,?,?,?,?,?,?,?,?)',
);
const aud = db.prepare(
  'insert into audit_log (id,user_id,action,entity_type,entity_id,payload,occurred_at) values (?,?,?,?,?,?,?)',
);

db.transaction(() => {
  for (const r of rows) {
    if (gia.get(r.id).n > 0) {
      console.log(r.id, 'gia corretta, salto');
      continue;
    }
    const target = Math.round(r.l * first.p);
    const delta = target - r.c;
    if (!delta) continue;

    const desc =
      'Ricalcolo prezzo corsa: ' +
      (r.c / 100).toFixed(2) +
      ' -> ' +
      (target / 100).toFixed(2) +
      ' EUR (primo pieno noto ' +
      (first.p / 100).toFixed(2) +
      ' EUR/l invece del valore di ripiego)';

    ins.run(randomUUID(), r.user_id, r.vehicle_id, 'adjustment', -delta, 'trip', r.id, r.e, desc);
    aud.run(
      randomUUID(),
      'u-luca',
      'adjust_price',
      'trip',
      r.id,
      JSON.stringify({ from: r.c, to: target, priceCents: first.p }),
      Date.now(),
    );
    console.log(r.user_id, 'addebito aggiuntivo', (delta / 100).toFixed(2), 'EUR');
  }
})();

console.log(
  db
    .prepare(
      'select u.name, sum(l.amount_cents) saldo_centesimi from ledger_entries l join user u on u.id=l.user_id group by u.name',
    )
    .all(),
);
