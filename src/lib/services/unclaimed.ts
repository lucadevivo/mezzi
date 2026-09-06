import { randomUUID } from 'node:crypto';
import { and, eq, lte } from 'drizzle-orm';
import {
  claimDeadline,
  resolveUnclaimed,
  splitCentsAmong,
  tripCost,
  type ClaimResponse,
  type UnclaimedResolution,
} from '@/lib/billing';
import { db } from '@/lib/db';
import { trips, unclaimedTripResponses, unclaimedTrips, user } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';
import { logAudit } from './audit';
import { addLedgerEntries } from './ledger';
import { billableMemberIds, getVehicleState } from './vehicles';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export class UnclaimedError extends Error {}

export type UnclaimedAnswer = 'mine' | 'not_mine' | 'unknown';
export type UnclaimedTrip = typeof unclaimedTrips.$inferSelect;

export interface CreateUnclaimedInput {
  vehicleId: string;
  detectedByUserId: string;
  distanceKm: number;
  odometerEndKm: number;
  windowStartAt: Date;
  detectedAt: Date;
  answer: UnclaimedAnswer;
}

/**
 * Apre una corsa da reclamare. Costo, litri e prezzo si congelano adesso:
 * se domani cambia il prezzo del carburante, questa corsa vale sempre uguale.
 */
export function createUnclaimedTrip(input: CreateUnclaimedInput, tx: Db = db): string {
  const state = getVehicleState(input.vehicleId, input.detectedAt);
  if (!state) throw new UnclaimedError('Mezzo inesistente');

  const { litersEstimated, costCents } = tripCost({
    distanceKm: input.distanceKm,
    consumptionKmPerLiter: state.consumption.kmPerLiter,
    unitPriceCents: state.price.pricePerLiterCents,
  });

  const id = randomUUID();
  tx.insert(unclaimedTrips)
    .values({
      id,
      vehicleId: input.vehicleId,
      odometerStartKm: input.odometerEndKm - input.distanceKm,
      odometerEndKm: input.odometerEndKm,
      distanceKm: input.distanceKm,
      windowStartAt: input.windowStartAt,
      detectedAt: input.detectedAt,
      detectedByUserId: input.detectedByUserId,
      litersEstimated,
      unitPriceUsedCents: state.price.pricePerLiterCents,
      costCents,
      status: 'pending',
      deadlineAt: claimDeadline(input.detectedAt, getEnv().CLAIM_DEADLINE_HOURS),
    })
    .run();

  if (input.answer !== 'unknown') {
    tx.insert(unclaimedTripResponses)
      .values({
        id: randomUUID(),
        unclaimedTripId: id,
        userId: input.detectedByUserId,
        answer: input.answer,
        answeredAt: input.detectedAt,
      })
      .run();
  }

  logAudit(
    {
      userId: input.detectedByUserId,
      action: 'unclaimed.create',
      entityType: 'unclaimed_trip',
      entityId: id,
      payload: { distanceKm: input.distanceKm, costCents, answer: input.answer },
      occurredAt: input.detectedAt,
    },
    tx,
  );

  // Chi dice subito "li ho fatti io" chiude la questione senza disturbare nessun altro.
  if (input.answer === 'mine') {
    applyResolution(
      id,
      { status: 'claimed', chargedTo: [input.detectedByUserId], reason: 'claimed' },
      input.detectedAt,
      tx,
    );
  }

  return id;
}

function responsesFor(unclaimedTripId: string, tx: Db = db): ClaimResponse[] {
  return tx
    .select()
    .from(unclaimedTripResponses)
    .where(eq(unclaimedTripResponses.unclaimedTripId, unclaimedTripId))
    .all()
    .map((row) => ({ userId: row.userId, answer: row.answer, answeredAt: row.answeredAt }));
}

export function currentResolution(
  row: UnclaimedTrip,
  now = new Date(),
  tx: Db = db,
): UnclaimedResolution {
  return resolveUnclaimed({
    billableMemberIds: billableMemberIds(row.vehicleId),
    detectedByUserId: row.detectedByUserId,
    responses: responsesFor(row.id, tx),
    deadlineAt: row.deadlineAt,
    now,
  });
}

/**
 * Scrive l'esito: una corsa per ogni utente addebitato (così i km restano
 * attribuiti e l'invariante col contachilometri regge) più le righe a ledger.
 */
function applyResolution(
  unclaimedTripId: string,
  resolution: Extract<UnclaimedResolution, { status: 'claimed' | 'split' }>,
  now: Date,
  tx: Db = db,
): void {
  const row = tx.select().from(unclaimedTrips).where(eq(unclaimedTrips.id, unclaimedTripId)).get();
  if (!row) throw new UnclaimedError('Corsa da reclamare inesistente');
  if (row.status !== 'pending') return;

  const shares = splitCentsAmong(row.costCents, resolution.chargedTo);
  const distanceEach = row.distanceKm / resolution.chargedTo.length;
  const litersEach = row.litersEstimated / resolution.chargedTo.length;

  for (const [userId, amountCents] of shares) {
    const tripId = randomUUID();
    // Corsa sintetica: gli odometri sono quelli della finestra, uguali per tutti
    // gli addebitati. Servono a tenere i km nello storico, non a dire chi era dove.
    tx.insert(trips)
      .values({
        id: tripId,
        vehicleId: row.vehicleId,
        userId,
        odometerStartKm: row.odometerStartKm,
        odometerEndKm: row.odometerEndKm,
        distanceKm: distanceEach,
        startedAt: row.windowStartAt,
        endedAt: row.detectedAt,
        status: 'closed',
        note: resolution.status === 'split' ? 'Corsa non reclamata, divisa' : 'Corsa reclamata',
        costCents: amountCents,
        litersEstimated: litersEach,
        unitPriceUsedCents: row.unitPriceUsedCents,
        unclaimedTripId: row.id,
      })
      .run();

    addLedgerEntries(
      [
        {
          userId,
          vehicleId: row.vehicleId,
          type: 'consumption_charge',
          amountCents: -amountCents,
          sourceType: 'unclaimed_trip',
          sourceId: row.id,
          occurredAt: now,
          description: `${Math.round(row.distanceKm)} km non registrati`,
        },
      ],
      tx,
    );
  }

  tx.update(unclaimedTrips)
    .set({
      status: resolution.status,
      claimedByUserId: resolution.status === 'claimed' ? resolution.chargedTo[0] : null,
      resolvedAt: now,
      resolutionNote:
        resolution.status === 'claimed'
          ? resolution.reason === 'elimination'
            ? 'Attribuita per esclusione allo scadere del termine'
            : 'Reclamata'
          : 'Nessuno l’ha reclamata: divisa tra i membri',
    })
    .where(eq(unclaimedTrips.id, row.id))
    .run();

  logAudit(
    {
      userId: null,
      action: `unclaimed.${resolution.status}`,
      entityType: 'unclaimed_trip',
      entityId: row.id,
      payload: { chargedTo: resolution.chargedTo, costCents: row.costCents },
      occurredAt: now,
    },
    tx,
  );
}

/** Risposta di un membro: se basta a chiudere la partita, si chiude subito. */
export function respondToUnclaimed(
  unclaimedTripId: string,
  userId: string,
  answer: 'mine' | 'not_mine',
  now = new Date(),
): UnclaimedResolution {
  const row = db.select().from(unclaimedTrips).where(eq(unclaimedTrips.id, unclaimedTripId)).get();
  if (!row) throw new UnclaimedError('Corsa da reclamare inesistente');
  if (row.status !== 'pending') throw new UnclaimedError('Questa corsa è già stata risolta');

  let resolution!: UnclaimedResolution;

  db.transaction((tx) => {
    tx.delete(unclaimedTripResponses)
      .where(
        and(
          eq(unclaimedTripResponses.unclaimedTripId, unclaimedTripId),
          eq(unclaimedTripResponses.userId, userId),
        ),
      )
      .run();

    tx.insert(unclaimedTripResponses)
      .values({ id: randomUUID(), unclaimedTripId, userId, answer, answeredAt: now })
      .run();

    resolution = currentResolution(row, now, tx);
    if (resolution.status !== 'pending') applyResolution(row.id, resolution, now, tx);
  });

  return resolution;
}

/**
 * Chiude le corse il cui termine è scaduto. Gira su richiesta, quando qualcuno apre
 * l'app: con quattro utenti non serve uno scheduler per una cosa che accade due volte l'anno.
 */
export interface ResolvedUnclaimed {
  id: string;
  status: 'claimed' | 'split';
  chargedTo: string[];
}

export function resolveExpiredUnclaimed(now = new Date()): ResolvedUnclaimed[] {
  const expired = db
    .select()
    .from(unclaimedTrips)
    .where(and(eq(unclaimedTrips.status, 'pending'), lte(unclaimedTrips.deadlineAt, now)))
    .all();

  const closed: ResolvedUnclaimed[] = [];
  for (const row of expired) {
    const resolution = currentResolution(row, now);
    if (resolution.status === 'pending') continue;
    db.transaction((tx) => applyResolution(row.id, resolution, now, tx));
    closed.push({ id: row.id, status: resolution.status, chargedTo: resolution.chargedTo });
  }
  return closed;
}

/** Km della nonna (o di chiunque non sia fatturabile): registrati, addebitati a lei. */
export function assignUnclaimedToNonBillable(
  unclaimedTripId: string,
  nonBillableUserId: string,
  actorId: string,
  now = new Date(),
): void {
  const target = db.select().from(user).where(eq(user.id, nonBillableUserId)).get();
  if (!target || target.billable) {
    throw new UnclaimedError('Questa azione vale solo per utenti non fatturabili');
  }

  db.transaction((tx) => {
    applyResolution(
      unclaimedTripId,
      { status: 'claimed', chargedTo: [nonBillableUserId], reason: 'claimed' },
      now,
      tx,
    );
    tx.update(unclaimedTrips)
      .set({ status: 'non_billable', resolutionNote: `Assegnata a ${target.name}` })
      .where(eq(unclaimedTrips.id, unclaimedTripId))
      .run();
    logAudit(
      {
        userId: actorId,
        action: 'unclaimed.non_billable',
        entityType: 'unclaimed_trip',
        entityId: unclaimedTripId,
        payload: { assignedTo: nonBillableUserId },
        occurredAt: now,
      },
      tx,
    );
  });
}

export function listPendingUnclaimed(): UnclaimedTrip[] {
  return db.select().from(unclaimedTrips).where(eq(unclaimedTrips.status, 'pending')).all();
}
