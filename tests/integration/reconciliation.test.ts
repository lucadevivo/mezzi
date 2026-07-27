import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/**
 * La riconciliazione al pieno è l'unico pezzo che tiene i saldi ancorati alla realtà,
 * e passa da DB: qui si verifica sul giro completo, non solo sulla formula pura.
 */
const dir = mkdtempSync(join(tmpdir(), 'mezzi-test-'));
process.env.DATABASE_PATH = join(dir, 'test.db');
process.env.AUTH_SECRET = 'integration-secret-integration-secret';

type Module<T> = Promise<T>;
let db: typeof import('@/lib/db').db;
let schema: typeof import('@/lib/db/schema');
let recordRefuel: typeof import('@/lib/services/refuels').recordRefuel;
let startTrip: typeof import('@/lib/services/trips').startTrip;
let closeTrip: typeof import('@/lib/services/trips').closeTrip;
let getBalance: typeof import('@/lib/services/balances').getBalance;

beforeAll(async () => {
  const { migrate } = await import('drizzle-orm/better-sqlite3/migrator');
  const dbModule: Module<typeof import('@/lib/db')> = import('@/lib/db');
  ({ db, schema } = await dbModule);
  migrate(db, { migrationsFolder: './drizzle' });

  ({ recordRefuel } = await import('@/lib/services/refuels'));
  ({ startTrip, closeTrip } = await import('@/lib/services/trips'));
  ({ getBalance } = await import('@/lib/services/balances'));

  db.insert(schema.user)
    .values({ id: 'u1', name: 'Luca', email: 'luca@test.local', role: 'admin' })
    .run();
  db.insert(schema.vehicles)
    .values({
      id: 'v1',
      name: 'Fiesta',
      type: 'car',
      fuelType: 'benzina',
      // 16 km/l dichiarati contro 12,8 reali: è esattamente lo scarto che va recuperato.
      declaredConsumptionKmL: 16,
      tankCapacityL: 42,
      currentOdometerKm: 0,
      discrepancyThresholdKm: 5,
    })
    .run();
  db.insert(schema.vehicleMembers).values({ id: 'vm1', vehicleId: 'v1', userId: 'u1' }).run();
});

describe('riconciliazione al pieno', () => {
  it('recupera la differenza tra litri stimati e litri davvero bruciati', () => {
    recordRefuel({
      vehicleId: 'v1',
      userId: 'u1',
      liters: 40,
      pricePerLiterCents: 180,
      totalCents: 7200,
      odometerKm: 0,
      tankLevelAfter: 'full',
      refueledAt: new Date(2026, 6, 1),
    });

    const { tripId } = startTrip({
      vehicleId: 'v1',
      userId: 'u1',
      odometerKm: 0,
      now: new Date(2026, 6, 2, 8),
    });
    // 320 km stimati a 16 km/l = 20 litri addebitati.
    closeTrip({
      tripId,
      odometerEndKm: 320,
      confirmWarnings: true,
      now: new Date(2026, 6, 2, 18),
    });

    const balanceBefore = getBalance('u1');

    // Il pieno ne richiede 25: ne sono stati bruciati 5 più del previsto.
    recordRefuel({
      vehicleId: 'v1',
      userId: 'u1',
      liters: 25,
      pricePerLiterCents: 180,
      totalCents: 4500,
      odometerKm: 320,
      tankLevelAfter: 'full',
      refueledAt: new Date(2026, 6, 10),
    });

    const adjustments = db
      .select()
      .from(schema.ledgerEntries)
      .all()
      .filter((entry) => entry.type === 'adjustment');

    expect(adjustments).toHaveLength(1);
    expect(adjustments[0].amountCents).toBe(-900); // 5 litri × 1,80 €
    expect(adjustments[0].description).toContain('Conguaglio consumo');

    // Accredito del secondo pieno (+4500) meno il conguaglio (−900).
    expect(getBalance('u1')).toBe(balanceBefore + 4500 - 900);
  });

  it('non tocca niente al secondo pieno se non c’è stata alcuna corsa', () => {
    const before = db.select().from(schema.ledgerEntries).all().length;

    recordRefuel({
      vehicleId: 'v1',
      userId: 'u1',
      liters: 10,
      pricePerLiterCents: 180,
      totalCents: 1800,
      odometerKm: 320,
      tankLevelAfter: 'full',
      refueledAt: new Date(2026, 6, 11),
    });

    // Solo l'accredito del rifornimento: nessun conguaglio senza km da riconciliare.
    expect(db.select().from(schema.ledgerEntries).all().length).toBe(before + 1);
  });
});
