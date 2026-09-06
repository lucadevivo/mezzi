import { and, desc, eq, gt, isNotNull, lte } from 'drizzle-orm';
import { burnedBetween, reconcileConsumption } from '@/lib/billing';
import { db } from '@/lib/db';
import { refuels, trips, vehicles } from '@/lib/db/schema';
import { logAudit } from './audit';
import { addLedgerEntries } from './ledger';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export interface ReconciliationResult {
  applied: boolean;
  deltaLiters: number;
  reason?: 'no_previous_anchor' | 'no_data' | 'implausible' | 'nothing_to_adjust';
}

/**
 * Da lanciare dopo ogni rifornimento di cui si conosce il livello raggiunto.
 *
 * Non serve il pieno — che in questa famiglia non fa quasi mai nessuno: bastano due
 * letture della lancetta. Quello che manca nel serbatoio è il carburante bruciato in
 * quel tratto; confrontandolo con i litri stimati che abbiamo addebitato si scopre di
 * quanto la stima era sbagliata, e la differenza va a chi ha guidato. È questo che
 * tiene i saldi ancorati alla realtà invece di lasciarli scivolare.
 */
export function reconcileAfterRefuel(
  refuelId: string,
  now = new Date(),
  tx: Db = db,
): ReconciliationResult {
  const current = tx.select().from(refuels).where(eq(refuels.id, refuelId)).get();
  if (!current || current.tankFractionAfter === null) {
    return { applied: false, deltaLiters: 0, reason: 'no_previous_anchor' };
  }

  const vehicle = tx.select().from(vehicles).where(eq(vehicles.id, current.vehicleId)).get();
  if (!vehicle) return { applied: false, deltaLiters: 0, reason: 'no_data' };

  // L'ancora precedente: l'ultimo rifornimento con la lancetta segnata, pieno o no.
  const previous = tx
    .select()
    .from(refuels)
    .where(
      and(
        eq(refuels.vehicleId, current.vehicleId),
        isNotNull(refuels.tankFractionAfter),
        lte(refuels.odometerKm, current.odometerKm),
      ),
    )
    .orderBy(desc(refuels.odometerKm))
    .limit(2)
    .all()
    .find((row) => row.id !== current.id);

  if (!previous) return { applied: false, deltaLiters: 0, reason: 'no_previous_anchor' };

  const actualLiters = burnedBetween(
    { ...previous, tankFractionAfter: previous.tankFractionAfter },
    { ...current, tankFractionAfter: current.tankFractionAfter },
    vehicle.tankCapacityL,
  );

  // Ogni attribuzione di km — corsa normale o corsa reclamata — è una riga in `trips`,
  // quindi qui c'è tutto il consumo del tratto, senza doppioni.
  const window = tx
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.vehicleId, current.vehicleId),
        eq(trips.status, 'closed'),
        gt(trips.odometerEndKm, previous.odometerKm),
        lte(trips.odometerEndKm, current.odometerKm),
      ),
    )
    .all();

  const chargedLitersByUser = new Map<string, number>();
  let weightedPrice = 0;
  let totalLiters = 0;

  for (const trip of window) {
    if (!trip.litersEstimated) continue;
    chargedLitersByUser.set(
      trip.userId,
      (chargedLitersByUser.get(trip.userId) ?? 0) + trip.litersEstimated,
    );
    totalLiters += trip.litersEstimated;
    weightedPrice += trip.litersEstimated * (trip.unitPriceUsedCents ?? current.pricePerLiterCents);
  }

  const unitPriceCents =
    totalLiters > 0 ? Math.round(weightedPrice / totalLiters) : current.pricePerLiterCents;

  const { adjustments, deltaLiters, skipped } = reconcileConsumption({
    chargedLitersByUser,
    actualLiters,
    unitPriceCents,
  });

  if (skipped) return { applied: false, deltaLiters, reason: skipped };
  if (adjustments.size === 0) {
    return { applied: false, deltaLiters, reason: 'nothing_to_adjust' };
  }

  addLedgerEntries(
    [...adjustments].map(([userId, amountCents]) => ({
      userId,
      vehicleId: current.vehicleId,
      type: 'adjustment' as const,
      amountCents,
      sourceType: 'refuel' as const,
      sourceId: current.id,
      occurredAt: now,
      description:
        deltaLiters > 0
          ? `Conguaglio consumo: ${deltaLiters.toFixed(2)} l in più del previsto`
          : `Conguaglio consumo: ${Math.abs(deltaLiters).toFixed(2)} l in meno del previsto`,
    })),
    tx,
  );

  logAudit(
    {
      userId: null,
      action: 'refuel.reconcile',
      entityType: 'refuel',
      entityId: current.id,
      payload: { deltaLiters, unitPriceCents, users: [...adjustments.keys()] },
      occurredAt: now,
    },
    tx,
  );

  return { applied: true, deltaLiters };
}
