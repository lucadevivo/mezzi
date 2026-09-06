import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { balances, distributeGuestKm, kmBought, resolveConsumption } from '@/lib/billing';
import { db } from '@/lib/db';
import { ledgerEntries, refuels, user, vehicles } from '@/lib/db/schema';
import { logAudit } from './audit';
import { addLedgerEntries } from './ledger';
import { billableMemberIds, getVehicle } from './vehicles';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export class RefuelServiceError extends Error {}

/** I saldi in km di chi divide i costi, letti dentro la transazione in corso. */
function saldiCorrenti(userIds: readonly string[], tx: Db): Map<string, number> {
  const tutti = balances(
    tx
      .select()
      .from(ledgerEntries)
      .all()
      .map((row) => ({
        userId: row.userId,
        amountKm: row.amountKm,
        type: row.type,
        occurredAt: row.occurredAt,
      })),
  );
  return new Map(userIds.map((id) => [id, tutti.get(id) ?? 0]));
}

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

    /*
     * Se a pagare è qualcuno che non sta nei conti — papà, la nonna, un amico —
     * l'autonomia non resta sul suo saldo: lui non guida abbastanza da consumarla e
     * quei chilometri resterebbero fermi lì per sempre. Va dove serve: prima tappa i
     * buchi di chi è indietro, poi l'avanzo si divide in parti uguali.
     */
    const pagante = tx.select().from(user).where(eq(user.id, input.userId)).get();
    const membri = billableMemberIds(input.vehicleId);
    const regalo = pagante && !pagante.billable && membri.length > 0;

    const quote = regalo
      ? distributeGuestKm(km, saldiCorrenti(membri, tx))
      : new Map([[input.userId, km]]);

    addLedgerEntries(
      [...quote].map(([userId, quotaKm]) => ({
        userId,
        vehicleId: input.vehicleId,
        type: 'refuel_credit' as const,
        amountKm: quotaKm,
        amountCents: userId === input.userId ? input.totalCents : 0,
        sourceType: 'refuel' as const,
        sourceId: refuelId,
        occurredAt: refueledAt,
        description: regalo
          ? `${input.liters.toFixed(2)} l pagati da ${pagante?.name}: ${quotaKm.toFixed(0)} km`
          : `${input.liters.toFixed(2)} l su ${vehicle.name}: ${quotaKm.toFixed(0)} km`,
      })),
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
