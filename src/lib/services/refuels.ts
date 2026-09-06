import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { resolveConsumption, TANK_FULL } from '@/lib/billing';
import { db } from '@/lib/db';
import { refuels, vehicles } from '@/lib/db/schema';
import { logAudit } from './audit';
import { addLedgerEntries } from './ledger';
import { reconcileAfterFullTank } from './reconciliation';
import { getVehicle } from './vehicles';

export class RefuelServiceError extends Error {}

export interface RecordRefuelInput {
  vehicleId: string;
  /** Chi ha pagato: può essere un utente non fatturabile (nonna, papà). */
  userId: string;
  liters: number;
  pricePerLiterCents: number;
  totalCents: number;
  odometerKm: number;
  tankFractionAfter: number | null;
  stationName?: string | null;
  refueledAt?: Date;
  /** L'utente ha confermato di aver messo più litri della capacità dichiarata. */
  confirmOverCapacity?: boolean;
}

export function recordRefuel(input: RecordRefuelInput): { refuelId: string } {
  const vehicle = getVehicle(input.vehicleId);
  if (!vehicle) throw new RefuelServiceError('Mezzo inesistente');
  if (input.liters <= 0) throw new RefuelServiceError('I litri devono essere positivi');
  if (input.liters > vehicle.tankCapacityL && !input.confirmOverCapacity) {
    throw new RefuelServiceError(
      `${input.liters} litri superano la capacità del serbatoio (${vehicle.tankCapacityL} l): confermi?`,
    );
  }
  if (input.odometerKm < vehicle.currentOdometerKm) {
    throw new RefuelServiceError(
      `Il contachilometri non può tornare indietro: ultimo valore ${vehicle.currentOdometerKm} km.`,
    );
  }

  const refueledAt = input.refueledAt ?? new Date();
  const refuelId = randomUUID();

  db.transaction((tx) => {
    tx.insert(refuels)
      .values({
        id: refuelId,
        vehicleId: input.vehicleId,
        userId: input.userId,
        liters: input.liters,
        pricePerLiterCents: input.pricePerLiterCents,
        totalCents: input.totalCents,
        odometerKm: input.odometerKm,
        tankFractionAfter: input.tankFractionAfter,
        stationName: input.stationName ?? null,
        refueledAt,
      })
      .run();

    // Chi mette benzina anticipa per tutti: l'importo speso gli viene accreditato per intero.
    addLedgerEntries(
      [
        {
          userId: input.userId,
          vehicleId: input.vehicleId,
          type: 'refuel_credit',
          amountCents: input.totalCents,
          sourceType: 'refuel',
          sourceId: refuelId,
          occurredAt: refueledAt,
          description: `Rifornimento ${input.liters.toFixed(2)} l su ${vehicle.name}`,
        },
      ],
      tx,
    );

    tx.update(vehicles)
      .set({ currentOdometerKm: input.odometerKm })
      .where(eq(vehicles.id, input.vehicleId))
      .run();

    logAudit(
      {
        userId: input.userId,
        action: 'refuel.create',
        entityType: 'refuel',
        entityId: refuelId,
        payload: { liters: input.liters, totalCents: input.totalCents },
        occurredAt: refueledAt,
      },
      tx,
    );
  });

  recomputeConsumption(input.vehicleId);
  // Un pieno dice quanto carburante è stato davvero bruciato dal pieno precedente:
  // è il momento in cui la stima si può correggere con un dato vero.
  if (input.tankFractionAfter === TANK_FULL) reconcileAfterFullTank(refuelId, refueledAt);

  return { refuelId };
}

/**
 * Ricalibra il consumo del mezzo sui pieni registrati. Gira dopo ogni rifornimento:
 * il dato misurato sul campo vale molto più di quello di libretto.
 */
export function recomputeConsumption(vehicleId: string): number | null {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return null;

  const rows = db.select().from(refuels).where(eq(refuels.vehicleId, vehicleId)).all();
  const consumption = resolveConsumption(
    rows.map((row) => ({
      id: row.id,
      liters: row.liters,
      pricePerLiterCents: row.pricePerLiterCents,
      odometerKm: row.odometerKm,
      tankFractionAfter: row.tankFractionAfter,
      refueledAt: row.refueledAt,
    })),
    vehicle.declaredConsumptionKmL,
  );

  const value = consumption.source === 'measured' ? consumption.kmPerLiter : null;
  db.update(vehicles)
    .set({ computedConsumptionKmL: value })
    .where(eq(vehicles.id, vehicleId))
    .run();

  return value;
}

export function listRefuels(vehicleId: string, limit = 20) {
  return db
    .select()
    .from(refuels)
    .where(eq(refuels.vehicleId, vehicleId))
    .orderBy(desc(refuels.refueledAt))
    .limit(limit)
    .all();
}
