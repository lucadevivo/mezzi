import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte, lte, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  auditLog,
  ledgerEntries,
  refuels,
  trips,
  unclaimedTripResponses,
  unclaimedTrips,
  user,
} from '@/lib/db/schema';
import { logAudit } from './audit';
import { reverseLedgerEntries } from './ledger';

export class HistoryError extends Error {}

export interface HistoryFilters {
  categoryId?: string;
  vehicleId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export function listTrips(filters: HistoryFilters = {}) {
  const where: SQL[] = [eq(trips.status, 'closed')];
  if (filters.vehicleId) where.push(eq(trips.vehicleId, filters.vehicleId));
  if (filters.userId) where.push(eq(trips.userId, filters.userId));
  if (filters.categoryId) where.push(eq(trips.categoryId, filters.categoryId));
  if (filters.from) where.push(gte(trips.endedAt, filters.from));
  if (filters.to) where.push(lte(trips.endedAt, filters.to));

  return db
    .select()
    .from(trips)
    .where(and(...where))
    .orderBy(desc(trips.endedAt))
    .limit(filters.limit ?? 50)
    .all();
}

export function listAllRefuels(filters: HistoryFilters = {}) {
  const where: SQL[] = [];
  if (filters.vehicleId) where.push(eq(refuels.vehicleId, filters.vehicleId));
  if (filters.userId) where.push(eq(refuels.userId, filters.userId));
  if (filters.from) where.push(gte(refuels.refueledAt, filters.from));
  if (filters.to) where.push(lte(refuels.refueledAt, filters.to));

  return db
    .select()
    .from(refuels)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(refuels.refueledAt))
    .limit(filters.limit ?? 50)
    .all();
}

/**
 * Correggere una corsa non vuol dire modificarla: si stornano le sue righe a ledger.
 * La corsa resta nello storico, marcata, e i km attribuiti non cambiano — perché i km
 * sono stati percorsi davvero, è solo l'addebito a essere sbagliato.
 */
export function reverseTrip(tripId: string, actorId: string, reason: string): void {
  const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
  if (!trip) throw new HistoryError('Corsa inesistente');

  db.transaction((tx) => {
    const count = reverseLedgerEntries('trip', tripId, reason, new Date(), tx);
    if (count === 0) throw new HistoryError('Questa corsa è già stata stornata');

    tx.update(trips)
      .set({ note: [trip.note, `Stornata: ${reason}`].filter(Boolean).join(' · ') })
      .where(eq(trips.id, tripId))
      .run();

    logAudit(
      {
        userId: actorId,
        action: 'trip.reverse',
        entityType: 'trip',
        entityId: tripId,
        payload: { reason },
      },
      tx,
    );
  });
}

/**
 * La corsa l'ha guidata un altro: la quota del guidatore passa al nuovo, con storno
 * e riga nuova (il ledger non si tocca). Le quote dei passeggeri restano dove sono.
 */
export function moveTrip(tripId: string, toUserId: string, actorId: string): void {
  const trip = db.select().from(trips).where(eq(trips.id, tripId)).get();
  if (!trip) throw new HistoryError('Corsa inesistente');
  if (trip.status !== 'closed') throw new HistoryError('Si sposta solo una corsa chiusa');
  if (trip.userId === toUserId) throw new HistoryError('La corsa è già sua');
  const target = db.select().from(user).where(eq(user.id, toUserId)).get();
  if (!target?.active) throw new HistoryError('Utente inesistente');

  const now = new Date();
  db.transaction((tx) => {
    const rows = tx
      .select()
      .from(ledgerEntries)
      .where(and(eq(ledgerEntries.sourceType, 'trip'), eq(ledgerEntries.sourceId, tripId)))
      .all();
    const reversed = new Set(rows.map((r) => r.reversesEntryId).filter(Boolean));
    const live = rows.filter(
      (r) => r.userId === trip.userId && !r.reversesEntryId && !reversed.has(r.id),
    );
    if (live.length === 0) throw new HistoryError('Questa corsa è stata stornata');

    const reason = `corsa spostata a ${target.name}`;
    for (const r of live) {
      const base = {
        vehicleId: r.vehicleId,
        sourceType: r.sourceType,
        sourceId: r.sourceId,
      };
      tx.insert(ledgerEntries)
        .values([
          {
            ...base,
            id: randomUUID(),
            userId: r.userId,
            type: 'adjustment',
            amountKm: -r.amountKm,
            amountCents: -r.amountCents,
            reversesEntryId: r.id,
            occurredAt: now,
            description: `Storno: ${reason}`,
          },
          {
            ...base,
            id: randomUUID(),
            userId: toUserId,
            type: r.type,
            amountKm: r.amountKm,
            amountCents: r.amountCents,
            occurredAt: r.occurredAt,
            description: r.description,
          },
        ])
        .run();
    }

    tx.update(trips)
      .set({
        userId: toUserId,
        note: [trip.note, `Spostata a ${target.name}`].filter(Boolean).join(' · '),
        updatedAt: now,
      })
      .where(eq(trips.id, tripId))
      .run();

    logAudit(
      {
        userId: actorId,
        action: 'trip.move',
        entityType: 'trip',
        entityId: tripId,
        payload: { from: trip.userId, to: toUserId },
      },
      tx,
    );
  });
}

export function reverseRefuel(refuelId: string, actorId: string, reason: string): void {
  const refuel = db.select().from(refuels).where(eq(refuels.id, refuelId)).get();
  if (!refuel) throw new HistoryError('Rifornimento inesistente');

  db.transaction((tx) => {
    const count = reverseLedgerEntries('refuel', refuelId, reason, new Date(), tx);
    if (count === 0) throw new HistoryError('Questo rifornimento è già stato stornato');
    logAudit(
      {
        userId: actorId,
        action: 'refuel.reverse',
        entityType: 'refuel',
        entityId: refuelId,
        payload: { reason },
      },
      tx,
    );
  });
}

export function listAuditLog(limit = 100) {
  return db.select().from(auditLog).orderBy(desc(auditLog.occurredAt)).limit(limit).all();
}

export interface ClaimStats {
  detected: number;
  claimed: number;
  denied: number;
}

/**
 * La statistica che rende inutile mentire: chi guida 400 km al mese e non ha mai
 * una corsa registrata, prima o poi si vede.
 */
export function claimStatsFor(userId: string): ClaimStats {
  const responses = db
    .select()
    .from(unclaimedTripResponses)
    .where(eq(unclaimedTripResponses.userId, userId))
    .all();

  const detected = db
    .select()
    .from(unclaimedTrips)
    .where(eq(unclaimedTrips.detectedByUserId, userId))
    .all().length;

  return {
    detected,
    claimed: responses.filter((r) => r.answer === 'mine').length,
    denied: responses.filter((r) => r.answer === 'not_mine').length,
  };
}
