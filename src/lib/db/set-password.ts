import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/hash';
import { db } from './index';
import { account, user } from './schema';

/**
 * Imposta o reimposta la password di un utente:
 *   npm run user:password -- luca@mezzi.local "password lunga"
 *
 * Serve a far entrare il primo admin (il seed crea gli utenti senza credenziali)
 * e a rimediare a una password persa senza email di recupero.
 */
async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Uso: npm run user:password -- <email> <password>');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('La password deve avere almeno 10 caratteri.');
    process.exit(1);
  }

  const target = db.select().from(user).where(eq(user.email, email.toLowerCase())).get();
  if (!target) {
    console.error(`Nessun utente con email ${email}`);
    process.exit(1);
  }

  const hash = await hashPassword(password);
  const existing = db
    .select()
    .from(account)
    .where(and(eq(account.userId, target.id), eq(account.providerId, 'credential')))
    .get();

  if (existing) {
    db.update(account).set({ password: hash }).where(eq(account.id, existing.id)).run();
  } else {
    db.insert(account)
      .values({
        id: randomUUID(),
        accountId: target.id,
        providerId: 'credential',
        userId: target.id,
        password: hash,
      })
      .run();
  }

  db.update(user).set({ canLogin: true }).where(eq(user.id, target.id)).run();
  console.log(`Password impostata per ${target.name} (${email}).`);
}

void main();
