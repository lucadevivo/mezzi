import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db } from './index';

/** Girano all'avvio del container: un aggiornamento non deve richiedere passi manuali. */
migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrazioni applicate.');
