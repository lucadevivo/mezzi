import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { hash } from '@node-rs/argon2';

/**
 * Imposta la password di un utente, in produzione:
 *   docker exec mezzi-app node scripts/set-password.mjs <email> <password>
 *
 * Esiste in JavaScript semplice, non in TypeScript, perché l'immagine di produzione
 * non contiene `tsx`: serve a far entrare il primo admin e a rimediare a una password
 * persa senza dover ricostruire l'immagine. In sviluppo c'è `npm run user:password`.
 */
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Uso: node scripts/set-password.mjs <email> <password>');
  process.exit(1);
}
if (password.length < 10) {
  console.error('La password deve avere almeno 10 caratteri.');
  process.exit(1);
}

const db = new Database(process.env.DATABASE_PATH ?? '/app/data/mezzi.db');
db.pragma('foreign_keys = ON');

const target = db.prepare('select id, name from user where email = ?').get(email.toLowerCase());
if (!target) {
  console.error(`Nessun utente con email ${email}`);
  process.exit(1);
}

// Stessi parametri di src/lib/auth/hash.ts: Argon2id, 19 MiB, 2 iterazioni.
const passwordHash = await hash(password, {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const existing = db
  .prepare("select id from account where user_id = ? and provider_id = 'credential'")
  .get(target.id);

if (existing) {
  db.prepare('update account set password = ? where id = ?').run(passwordHash, existing.id);
} else {
  db.prepare(
    `insert into account (id, account_id, provider_id, user_id, password, updated_at)
     values (?, ?, 'credential', ?, ?, ?)`,
  ).run(randomUUID(), target.id, target.id, passwordHash, Date.now());
}

db.prepare('update user set can_login = 1 where id = ?').run(target.id);
console.log(`Password impostata per ${target.name} (${email}).`);
