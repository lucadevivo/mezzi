import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { getEnv } from '../env';
import * as schema from './schema';

export function openDatabase(path: string): Database.Database {
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = new Database(path);
  // WAL regge letture e scritture concorrenti senza bloccarsi; i foreign key in
  // SQLite sono disattivati di default e senza di loro il ledger perde i riferimenti.
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return sqlite;
}

// ponytail: `drizzle-orm/node-sqlite` (stdlib, zero moduli nativi) è documentato ma non
// ancora esportato in drizzle-orm 0.45.2. Quando esce, questo file è l'unico da cambiare.
export const sqlite = openDatabase(getEnv().DATABASE_PATH);

export const db = drizzle({ client: sqlite, schema });

export { schema };
