import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tripCategories } from '@/lib/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export class CategoryError extends Error {}

/** Etichette in minuscolo: «Consegne» e «consegne» sono la stessa cosa. */
function normalizza(nome: string): string {
  return nome.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function listCategories() {
  return db.select().from(tripCategories).orderBy(asc(tripCategories.name)).all();
}

/**
 * Trova l'etichetta o la crea al volo.
 *
 * Non c'è una schermata per gestire le categorie: si scrivono chiudendo la corsa, e
 * la prima volta che una parola compare diventa un'etichetta. Con quattro persone e
 * una manciata di etichette, una schermata di gestione sarebbe una cerimonia inutile.
 */
export function resolveCategory(nome: string, userId: string, tx: Db = db): string {
  const pulito = normalizza(nome);
  if (pulito.length === 0) throw new CategoryError('Categoria vuota');
  if (pulito.length > 30) throw new CategoryError('Categoria troppo lunga (max 30 caratteri)');

  const esistente = tx
    .select()
    .from(tripCategories)
    .where(eq(tripCategories.name, pulito))
    .get();
  if (esistente) return esistente.id;

  const id = randomUUID();
  tx.insert(tripCategories).values({ id, name: pulito, createdByUserId: userId }).run();
  return id;
}
