const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const db = new Database('/app/data/mezzi.db');
const FIESTA='v-fiesta', LUCA='u-luca', KML=18.6, now=Date.now();
const round1=x=>Math.round(x*10)/10;
const v=db.prepare("SELECT current_odometer_km o FROM vehicles WHERE id=?").get(FIESTA);
const S=v.o, E=69405.7;
if(E<=S) throw new Error(`contakm non avanza: ${S} -> ${E}`);
const d=round1(E-S), liters=d/KML, cost=Math.round(liters*217);
const win=new Date('2026-11-14T17:16:00+01:00').getTime(); // momento dell'ultima foto (69368,7)
const id=randomUUID();
db.transaction(()=>{
  db.prepare(`INSERT INTO unclaimed_trips
    (id,vehicle_id,odometer_start_km,odometer_end_km,distance_km,window_start_at,detected_at,detected_by_user_id,
     liters_estimated,unit_price_used_cents,cost_cents,status,deadline_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?, ?)`)
    .run(id,FIESTA,S,E,d,win,now,LUCA,liters,217,cost,now+48*3600000,now,now);
  db.prepare("UPDATE vehicles SET current_odometer_km=?, updated_at=? WHERE id=?").run(E,now,FIESTA);
  db.prepare("INSERT INTO audit_log (id,user_id,action,entity_type,entity_id,payload,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(),LUCA,'unclaimed.create','unclaimed_trip',id,JSON.stringify({distanceKm:d,manual:'vacante da foto'}),now,now);
})();
console.log(`reclamo vacante Fiesta ${S} -> ${E} = ${d} km (pending). odo -> ${E}`);
console.log('pending Fiesta:', db.prepare("SELECT substr(id,1,8) id,distance_km km FROM unclaimed_trips WHERE vehicle_id=? AND status='pending' ORDER BY detected_at").all(FIESTA));
db.close();
