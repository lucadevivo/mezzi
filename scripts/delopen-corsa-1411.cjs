const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');
const db = new Database('/app/data/mezzi.db');
const T='e43e673f-c485-47dd-8df3-3f42f2f3ff5a', now=Date.now();
const r = db.prepare("SELECT * FROM trips WHERE id=? AND status='open'").get(T);
if(!r){ console.log('corsa aperta non trovata (già tolta?)'); process.exit(0); }
db.transaction(()=>{
  db.prepare("DELETE FROM trips WHERE id=?").run(T);
  db.prepare("INSERT INTO audit_log (id,user_id,action,entity_type,entity_id,payload,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?)")
    .run(randomUUID(),'u-luca','trip.delete','trip',T,JSON.stringify({reason:'corsa aperta mai chiusa dal 12/11; i km sono nei reclami vacanti'}),now,now);
})();
console.log('corsa aperta cancellata; OPEN restanti:', db.prepare("SELECT count(*) c FROM trips WHERE status='open'").get().c);
db.close();
