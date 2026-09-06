import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  evaluateOdometerReading,
  splitTripCost,
  tripCost,
  validateTrip,
  type DiscrepancyOutcome,
  type TripWarning,
} from '@/lib/billing';
import { db } from '@/lib/db';
import { tripPassengers, trips, vehicles } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';
import { logAudit } from './audit';
import { addLedgerEntries } from './ledger';
import { createUnclaimedTrip, type UnclaimedAnswer } from './unclaimed';
import { getOpenTrip, getVehicleState } from './vehicles';

export class TripServiceError extends Error {}

/** Anteprima per la UI: cosa succede se confermo questo contachilometri? */
export function checkOdometer(vehicleId: string, odometerKm: number, now = new Date()) {
  const state = getVehicleState(vehicleId, now);
  if (!state) throw new TripServiceError('Mezzo inesistente');

  const env = getEnv();
  const outcome = evaluateOdometerReading({
    savedOdometerKm: state.vehicle.currentOdometerKm,
    realOdometerKm: odometerKm,
    thresholdKm: state.vehicle.discrepancyThresholdKm,
    driftBufferKm: state.vehicle.driftBufferKm,
    openTrip: state.openTrip
      ? {
          id: state.openTrip.id,
          userId: state.openTrip.userId,
          startedAt: state.openTrip.startedAt,
        }
      : null,
    lastEventAt: state.lastEventAt,
    now,
    openTripAbsorbHours: env.OPEN_TRIP_ABSORB_HOURS,
  });

  return { state, outcome };
}

export interface StartTripInput {
  vehicleId: string;
  userId: string;
  odometerKm: number;
  /** Risposta alla discrepanza rilevata, se ce n'è una. */
  unclaimedAnswer?: UnclaimedAnswer;
  /**
   * Id deciso dal client. Serve alle corse avviate offline: il telefono lo genera
   * subito, così può anche chiuderle prima che la coda arrivi al server.
   */
  tripId?: string;
  now?: Date;
}

export interface StartTripResult {
  tripId: string;
  outcome: DiscrepancyOutcome;
  unclaimedTripId?: string;
}

/**
 * Avvia una corsa dopo aver sistemato i conti col contachilometri:
 * il valore letto sul cruscotto è l'unica fonte di verità, quindi prima si
 * attribuisce (o si mette in reclamo) tutto quello che non risulta registrato.
 */
export function startTrip(input: StartTripInput): StartTripResult {
  const now = input.now ?? new Date();
  const { state, outcome } = checkOdometer(input.vehicleId, input.odometerKm, now);

  if (outcome.kind === 'negative_delta') {
    throw new TripServiceError(
      `Il contachilometri non può tornare indietro: ultimo valore ${state.vehicle.currentOdometerKm} km. Serve una correzione dell'admin.`,
    );
  }
  if (outcome.kind === 'propose_close_open_trip') {
    throw new TripServiceError('C’è una corsa aperta su questo mezzo: va chiusa prima.');
  }

  let unclaimedTripId: string | undefined;
  const tripId = input.tripId ?? randomUUID();

  db.transaction((tx) => {
    if (outcome.kind === 'drift_absorbed') {
      tx.update(vehicles)
        .set({ driftBufferKm: outcome.driftBufferKm })
        .where(eq(vehicles.id, input.vehicleId))
        .run();
    }

    if (outcome.kind === 'unclaimed_trip') {
      unclaimedTripId = createUnclaimedTrip(
        {
          vehicleId: input.vehicleId,
          detectedByUserId: input.userId,
          distanceKm: outcome.distanceKm,
          odometerEndKm: input.odometerKm,
          windowStartAt: outcome.windowStartAt,
          detectedAt: now,
          answer: input.unclaimedAnswer ?? 'unknown',
        },
        tx,
      );
      tx.update(vehicles).set({ driftBufferKm: 0 }).where(eq(vehicles.id, input.vehicleId)).run();
    }

    tx.insert(trips)
      .values({
        id: tripId,
        vehicleId: input.vehicleId,
        userId: input.userId,
        odometerStartKm: input.odometerKm,
        startedAt: now,
        status: 'open',
      })
      .run();

    tx.update(vehicles)
      .set({ currentOdometerKm: input.odometerKm })
      .where(eq(vehicles.id, input.vehicleId))
      .run();
  });

  return { tripId, outcome, unclaimedTripId };
}

export interface CloseTripInput {
  tripId: string;
  odometerEndKm: number;
  passengerIds?: readonly string[];
  note?: string;
  /** L'utente ha già confermato i warning di plausibilità. */
  confirmWarnings?: boolean;
  now?: Date;
}

export interface CloseTripResult {
  distanceKm: number;
  costCents: number;
  warnings: TripWarning[];
}

/** Chiude la corsa e congela costo, litri e prezzo: lo storico non cambia più. */
export function closeTrip(input: CloseTripInput): CloseTripResult {
  const now = input.now ?? new Date();
  const trip = db.select().from(trips).where(eq(trips.id, input.tripId)).get();
  if (!trip) throw new TripServiceError('Corsa inesistente');
  if (trip.status === 'closed') throw new TripServiceError('Corsa già chiusa');

  // Il prezzo lo decide il serbatoio al momento della corsa, non quello di adesso.
  const state = getVehicleState(trip.vehicleId, now);
  if (!state) throw new TripServiceError('Mezzo inesistente');

  const warnings = validateTrip({
    startKm: trip.odometerStartKm,
    endKm: input.odometerEndKm,
    startedAt: trip.startedAt,
    endedAt: now,
  });
  if (warnings.length > 0 && !input.confirmWarnings) {
    throw new TripServiceError(
      warnings[0].code === 'implausible_distance'
        ? 'Più di 1.000 km in una corsa: confermi?'
        : 'Media oltre 200 km/h: confermi?',
    );
  }

  const distanceKm = input.odometerEndKm - trip.odometerStartKm;
  const { litersEstimated, costCents } = tripCost({
    distanceKm,
    consumptionKmPerLiter: state.consumption.kmPerLiter,
    unitPriceCents: state.price.pricePerLiterCents,
  });

  const passengerIds = [...new Set(input.passengerIds ?? [])].filter((id) => id !== trip.userId);
  const shares = splitTripCost(costCents, trip.userId, passengerIds);

  db.transaction((tx) => {
    tx.update(trips)
      .set({
        odometerEndKm: input.odometerEndKm,
        distanceKm,
        endedAt: now,
        status: 'closed',
        note: input.note ?? trip.note,
        costCents,
        litersEstimated,
        unitPriceUsedCents: state.price.pricePerLiterCents,
        priceSource: state.price.source,
        consumptionKmLUsed: state.consumption.kmPerLiter,
        consumptionSource: state.consumption.source,
      })
      .where(eq(trips.id, trip.id))
      .run();

    for (const userId of passengerIds) {
      tx.insert(tripPassengers)
        .values({ id: randomUUID(), tripId: trip.id, userId })
        .onConflictDoNothing()
        .run();
    }

    addLedgerEntries(
      [...shares].map(([userId, amount]) => ({
        userId,
        vehicleId: trip.vehicleId,
        type: 'consumption_charge' as const,
        amountCents: -amount,
        sourceType: 'trip' as const,
        sourceId: trip.id,
        occurredAt: now,
        description: `${Math.round(distanceKm)} km su ${state.vehicle.name}`,
      })),
      tx,
    );

    if (input.odometerEndKm > state.vehicle.currentOdometerKm) {
      tx.update(vehicles)
        .set({ currentOdometerKm: input.odometerEndKm })
        .where(eq(vehicles.id, trip.vehicleId))
        .run();
    }

    logAudit(
      {
        userId: trip.userId,
        action: 'trip.close',
        entityType: 'trip',
        entityId: trip.id,
        payload: { distanceKm, costCents, priceSource: state.price.source },
        occurredAt: now,
      },
      tx,
    );
  });

  return { distanceKm, costCents, warnings };
}

/** Corsa dimenticata aperta da un altro: la si prende comunque, ma resta tracciato. */
export function takeOverOpenTrip(vehicleId: string, newUserId: string, actorId: string): void {
  const open = getOpenTrip(vehicleId);
  if (!open) throw new TripServiceError('Nessuna corsa aperta su questo mezzo');

  db.transaction((tx) => {
    tx.update(trips).set({ userId: newUserId }).where(eq(trips.id, open.id)).run();
    logAudit(
      {
        userId: actorId,
        action: 'trip.takeover',
        entityType: 'trip',
        entityId: open.id,
        payload: { from: open.userId, to: newUserId },
      },
      tx,
    );
  });
}
