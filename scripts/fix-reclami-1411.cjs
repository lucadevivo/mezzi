/* Fix dati 14/11/2026 — eseguito dentro il container mezzi-app.
 * A) Reclami Fiesta 96473a70 (56,7 km) e 500 5a95b5d0 (166 km): annullata la divisione
 *    automatica (storno ledger + cancellazione corse sintetiche) e riportati a 'pending'.
 * B) Rifornimento Fiesta: Luca, 20 € a 2,169 €/l (arrotondato 217 c/l come fa l'app).
 * C) 5 reclami vacanti Fiesta dalle foto del contachilometri (69252,5 -> 69368,7).
 * Odometro Fiesta portato a 69368,7 (verità dall'ultima foto). Tutto in una transazione.
 */
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const db = new Database('/app/data/mezzi.db');

const FIESTA = 'v-fiesta', CINQUE = 'v-500', LUCA = 'u-luca';
const SPLIT_FIESTA = '96473a70-83aa-447e-bb4d-83530d16cfff';
const SPLIT_500 = '5a95b5d0-10b3-4f8f-a01e-4f0e47face40';
const KML_FIESTA = 18.6;           // declared (computed = null)
const round1 = (x) => Math.round(x * 10) / 10;
const ms = (iso) => new Date(iso).getTime();
const now = Date.now();

const balances = () => db.prepare(
  `SELECT vehicle_id v, user_id u, ROUND(SUM(amount_km),1) km
   FROM ledger_entries GROUP BY vehicle_id, user_id ORDER BY vehicle_id, user_id`).all();
const names = Object.fromEntries(db.prepare('SELECT id,name FROM user').all().map(r => [r.id, r.name]));
const show = (title) => {
  console.log(`\n--- ${title} ---`);
  for (const b of balances()) console.log(`  ${b.v}  ${names[b.u] || b.u}: ${b.km} km`);
  for (const r of db.prepare("SELECT id,name,current_odometer_km o FROM vehicles WHERE id IN ('v-fiesta','v-500')").all())
    console.log(`  odo ${r.id} = ${r.o}`);
};

show('PRIMA');

const tx = db.transaction(() => {
  // ---------- A) riapri i due reclami come vacanti ----------
  for (const [uid, label] of [[SPLIT_FIESTA, 'Fiesta 56,7 km'], [SPLIT_500, '500 166 km']]) {
    const row = db.prepare('SELECT * FROM unclaimed_trips WHERE id=?').get(uid);
    if (!row) throw new Error('reclamo assente: ' + uid);
    if (row.status !== 'split') throw new Error(`${uid} non è split ma ${row.status}`);
    // storno delle righe a ledger (append-only): una riga uguale e contraria per ciascuna
    const originals = db.prepare(
      "SELECT * FROM ledger_entries WHERE source_id=? AND source_type='unclaimed_trip' AND reverses_entry_id IS NULL").all(uid);
    if (originals.length !== 3) throw new Error(`${uid}: attese 3 righe ledger, trovate ${originals.length}`);
    const insLedger = db.prepare(
      `INSERT INTO ledger_entries (id,user_id,vehicle_id,type,amount_cents,amount_km,source_type,source_id,reverses_entry_id,description,occurred_at,created_at)
       VALUES (@id,@user_id,@vehicle_id,'adjustment',@amount_cents,@amount_km,'unclaimed_trip',@source_id,@reverses_entry_id,@description,@occurred_at,@created_at)`);
    for (const o of originals) {
      insLedger.run({ id: randomUUID(), user_id: o.user_id, vehicle_id: o.vehicle_id,
        amount_cents: -o.amount_cents, amount_km: -o.amount_km, source_id: uid,
        reverses_entry_id: o.id, description: 'Storno: reclamo reso vacante (annullata la divisione automatica)', occurred_at: now, created_at: now });
    }
    // via le corse sintetiche nate dalla divisione
    const del = db.prepare('DELETE FROM trips WHERE unclaimed_trip_id=?').run(uid);
    if (del.changes !== 3) throw new Error(`${uid}: attese 3 corse sintetiche, cancellate ${del.changes}`);
    // il reclamo torna vacante
    db.prepare(
      "UPDATE unclaimed_trips SET status='pending', claimed_by_user_id=NULL, resolved_at=NULL, resolution_note=NULL, updated_at=? WHERE id=?").run(now, uid);
    db.prepare(
      `INSERT INTO audit_log (id,user_id,action,entity_type,entity_id,payload,occurred_at,created_at)
       VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), LUCA, 'unclaimed.reopen', 'unclaimed_trip', uid,
       JSON.stringify({ reason: 'tolta la divisione automatica, reso vacante', label }), now, now);
    console.log(`A) riaperto ${label} -> pending`);
  }

  // ---------- B) rifornimento Fiesta di Luca ----------
  const priceC = 217, totalC = 2000;      // 2,169 €/l -> 217 c/l come Math.round(2.169*100)
  const liters = totalC / priceC;          // completeRefuelAmounts: liters = total/price
  const kmCredit = round1(liters * KML_FIESTA);   // kmBought
  const ODO_FINE = 69368.7;
  const refuelId = randomUUID();
  db.prepare(
    `INSERT INTO refuels (id,vehicle_id,user_id,liters,price_per_liter_cents,total_cents,odometer_km,tank_fraction_after,station_name,refueled_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    refuelId, FIESTA, LUCA, liters, priceC, totalC, ODO_FINE, null, null, now, now, now);
  db.prepare(
    `INSERT INTO ledger_entries (id,user_id,vehicle_id,type,amount_cents,amount_km,source_type,source_id,description,occurred_at,created_at)
     VALUES (?,?,?,'refuel_credit',?,?,'refuel',?,?,?,?)`).run(
    randomUUID(), LUCA, FIESTA, totalC, kmCredit, refuelId,
    `${liters.toFixed(2)} l su Ford Fiesta: ${kmCredit.toFixed(0)} km`, now, now);
  db.prepare('UPDATE vehicles SET current_odometer_km=?, updated_at=? WHERE id=?').run(ODO_FINE, now, FIESTA);
  db.prepare(
    `INSERT INTO audit_log (id,user_id,action,entity_type,entity_id,payload,occurred_at,created_at)
     VALUES (?,?,?,?,?,?,?,?)`).run(randomUUID(), LUCA, 'refuel.create', 'refuel', refuelId,
     JSON.stringify({ liters, totalCents: totalC }), now, now);
  console.log(`B) rifornimento: ${liters.toFixed(3)} l, +${kmCredit} km a Luca, odo Fiesta -> ${ODO_FINE}`);

  // ---------- C) 5 reclami vacanti Fiesta dalle foto ----------
  const segs = [
    { s: 69252.5, e: 69261.8, det: '2026-11-12T16:05:00+01:00' },
    { s: 69261.8, e: 69281.8, det: '2026-11-13T03:26:00+01:00' },
    { s: 69281.8, e: 69310.6, det: '2026-11-13T15:55:00+01:00' },
    { s: 69310.6, e: 69356.7, det: '2026-11-14T16:08:00+01:00' },
    { s: 69356.7, e: 69368.7, det: '2026-11-14T17:16:00+01:00' },
  ];
  let winStart = 1794475701206;    // momento in cui il contakm era a 69252,5 (reclamo Fiesta precedente)
  const insUn = db.prepare(
    `INSERT INTO unclaimed_trips
       (id,vehicle_id,odometer_start_km,odometer_end_km,distance_km,window_start_at,detected_at,detected_by_user_id,
        liters_estimated,unit_price_used_cents,cost_cents,status,deadline_at,created_at,updated_at)
     VALUES (@id,@v,@s,@e,@d,@w,@det,@by,@liters,@price,@cost,'pending',@deadline,@now,@now)`);
  let totalGap = 0;
  for (const seg of segs) {
    const d = round1(seg.e - seg.s);
    const litersEst = d / KML_FIESTA;
    const cost = Math.round(litersEst * 217);
    const det = ms(seg.det);
    insUn.run({ id: randomUUID(), v: FIESTA, s: seg.s, e: seg.e, d, w: winStart, det, by: LUCA,
      liters: litersEst, price: 217, cost, deadline: det + 48 * 3_600_000, now });
    totalGap += d;
    winStart = det;
    console.log(`C) reclamo vacante ${seg.s}->${seg.e} (${d} km) il ${seg.det}`);
  }
  console.log(`C) totale km vacanti: ${round1(totalGap)}`);
});

tx();
show('DOPO');
console.log('\nReclami pendenti:');
for (const r of db.prepare(
  "SELECT substr(id,1,8) id,vehicle_id v,distance_km km,status FROM unclaimed_trips WHERE status='pending' ORDER BY detected_at").all())
  console.log(`  ${r.id} ${r.v} ${r.km} km ${r.status}`);
db.close();
console.log('\nOK');
