import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, test } from 'vitest';

// Un DB usa e getta: il servizio apre il file che trova in DATABASE_PATH al primo import,
// quindi l'ambiente va messo a posto prima di importare qualsiasi cosa.
process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'mezzi-test-')), 'test.db');
process.env.AUTH_SECRET ??= 'x'.repeat(32);

const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
const { db } = await import('@/lib/db');
const { ledgerEntries, vehicles } = await import('@/lib/db/schema');
const { seed } = await import('@/lib/db/seed');
const { closeTrip, startTrip, takeOverOpenTrip } = await import('./trips');

migrate(db, { migrationsFolder: './drizzle' });
seed();
db.update(vehicles).set({ currentOdometerKm: 66904.2 }).where(eq(vehicles.id, 'v-fiesta')).run();

const kmDi = (userId: string) =>
  db
    .select()
    .from(ledgerEntries)
    .all()
    .filter((e) => e.userId === userId)
    .reduce((sum, e) => sum + e.amountKm, 0);

/** Il caso vero dell'11/09/2026: corsa lasciata aperta, i 59,9 km finiti sul fratello. */
test('chi prende una corsa lasciata aperta non eredita i km dell’altro', () => {
  startTrip({
    vehicleId: 'v-fiesta',
    userId: 'u-luca',
    odometerKm: 66904.2,
    now: new Date('2026-09-11T10:00:00Z'),
  });

  const tripId = takeOverOpenTrip(
    'v-fiesta',
    'u-gabriele',
    66964.1,
    new Date('2026-09-11T20:33:00Z'),
  );
  closeTrip({ tripId, odometerEndKm: 66974.1, now: new Date('2026-09-11T21:30:00Z') });

  expect(kmDi('u-luca')).toBeCloseTo(-59.9, 1);
  expect(kmDi('u-gabriele')).toBeCloseTo(-10, 1);
});
