/**
 * Le migrazioni girano all'avvio del server: aggiornare l'app deve voler dire
 * `docker compose up -d --build` e basta, senza passi manuali da ricordare.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const { db } = await import('@/lib/db');

  migrate(db, { migrationsFolder: './drizzle' });
}
