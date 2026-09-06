import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { kmBought, resolveConsumption } from '@/lib/billing';
import { db } from '@/lib/db';
import { refuels, vehicles } from '@/lib/db/schema';
import { logAudit } from './audit';
import { addLedgerEntries } from './ledger';
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

    /*
     * Chi mette carburante compra autonomia, e l'autonomia gli viene accreditata tutta:
     * i litri messi, moltiplicati per il consumo del mezzo, sono i chilometri che quel
     * pieno può fare. È così che i soldi entrano nel conto — l'unico posto dove il
     * denaro diventa chilometri.
     */
    // Il consumo in uso adesso: quello misurato se ce n'è abbastanza, altrimenti il
    // libretto. Chi rifornisce oggi viene accreditato al meglio di quel che si sa oggi.
    const kmPerLiter = vehicle.computedConsumptionKmL ?? vehicle.declaredConsumptionKmL;
    const km = kmBought(input.liters, kmPerLiter);

    addLedgerEntries(
      [
        {
          userId: input.userId,
          vehicleId: input.vehicleId,
          type: 'refuel_credit',
          amountKm: km,
          amountCents: input.totalCents,
          sourceType: 'refuel',
          sourceId: refuelId,
          occurredAt: refueledAt,
          description: `${input.liters.toFixed(2)} l su ${vehicle.name}: ${km.toFixed(0)} km`,
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

  /*
   * Non c'è niente da riconciliare: il saldo è in chilometri, e i chilometri delle
   * corse sono misurati, non stimati. La lancetta serve ancora, ma per un'altra cosa:
   * misurare il consumo reale, che decide quanti km vale un litro nei prossimi
   * accrediti. Per questo il ricalcolo resta, e resta qui.
   */
  recomputeConsumption(input.vehicleId);

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
    vehicle.tankCapacityL,
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
