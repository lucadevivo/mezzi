import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';

export class GuestError extends Error {}

/** Chi c'è già tra i non fatturabili: la nonna, e chiunque sia stato aggiunto al volo. */
export function listGuests() {
  return db
    .select()
    .from(user)
    .where(eq(user.billable, false))
    .orderBy(asc(user.name))
    .all();
}

/**
 * L'ospite occasionale: papà che prende la macchina, un amico, la mamma.
 *
 * Non è un utente dell'app — non entra, non ha password, non divide i costi tra i
 * fratelli — ma i suoi chilometri devono esistere lo stesso, o il contachilometri non
 * torna. Si crea al volo scrivendo un nome, come le categorie: se il nome c'è già si
 * riusa quello, altrimenti nasce adesso.
 */
export function resolveGuest(nome: string): string {
  const pulito = nome.trim().replace(/\s+/g, ' ');
  if (pulito.length === 0) throw new GuestError('Serve un nome');
  if (pulito.length > 40) throw new GuestError('Nome troppo lungo');

  const esistente = listGuests().find((g) => g.name.toLowerCase() === pulito.toLowerCase());
  if (esistente) return esistente.id;

  const id = `u-ospite-${randomUUID().slice(0, 8)}`;
  db.insert(user)
    .values({
      id,
      name: pulito,
      // Better Auth vuole un'email: è finta e non serve a niente, non si accede.
      email: `${id}@ospiti.local`,
      emailVerified: false,
      role: 'member',
      billable: false,
      canLogin: false,
    })
    .run();
  return id;
}
