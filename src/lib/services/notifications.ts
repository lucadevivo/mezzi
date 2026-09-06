import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog, trips, unclaimedTrips, user, vehicles } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';
import { formatEuro, formatKm } from '@/lib/format';
import { logAudit } from './audit';
import { notify } from './push';
import { billableMemberIds } from './vehicles';

/**
 * Le notifiche che l'app manda davvero. Stanno insieme qui perché il testo conta
 * quanto il meccanismo: una notifica che non dice cosa fare è solo un fastidio.
 */

const nameOf = (id: string) => db.select().from(user).where(eq(user.id, id)).get()?.name ?? '?';

/** Chiede a tutti gli altri se quei km sono loro, col conto alla rovescia. */
export async function notifyUnclaimedTrip(unclaimedTripId: string): Promise<void> {
  const row = db.select().from(unclaimedTrips).where(eq(unclaimedTrips.id, unclaimedTripId)).get();
  if (!row) return;

  const vehicle = db.select().from(vehicles).where(eq(vehicles.id, row.vehicleId)).get();
  const targets = billableMemberIds(row.vehicleId).filter((id) => id !== row.detectedByUserId);
  const hours = Math.round((row.deadlineAt.getTime() - row.detectedAt.getTime()) / 3_600_000);

  await notify(targets, {
    title: `${vehicle?.name ?? 'Mezzo'} — ${formatKm(row.distanceKm)} non registrati`,
    body: `≈ ${formatEuro(row.costCents)}. Sono tuoi? Hai ${hours} ore per rispondere.`,
    url: '/reclami',
    tag: `unclaimed-${row.id}`,
    requireInteraction: true,
  });
}

/** Quando la questione si chiude, lo sanno tutti: è metà del deterrente. */
export async function notifyUnclaimedResolved(
  unclaimedTripId: string,
  chargedTo: readonly string[],
  status: 'claimed' | 'split',
): Promise<void> {
  const row = db.select().from(unclaimedTrips).where(eq(unclaimedTrips.id, unclaimedTripId)).get();
  if (!row) return;

  const vehicle = db.select().from(vehicles).where(eq(vehicles.id, row.vehicleId)).get();
  const targets = billableMemberIds(row.vehicleId);

  await notify(targets, {
    title: `${vehicle?.name ?? 'Mezzo'} — ${formatKm(row.distanceKm)} risolti`,
    body:
      status === 'claimed'
        ? `Li ha presi ${chargedTo.map(nameOf).join(' e ')}.`
        : `Non li ha reclamati nessuno: divisi tra ${chargedTo.length}.`,
    url: '/reclami',
    tag: `unclaimed-${row.id}`,
  });
}


const REMINDER_ACTION = 'trip.reminder';

/**
 * Promemoria per le corse rimaste aperte da più di 24 ore. Gira quando qualcuno apre
 * l'app, come la chiusura dei reclami scaduti: con quattro utenti non serve uno scheduler.
 * L'audit log fa da segnaposto, così il promemoria parte una volta sola per corsa.
 */
export async function remindOpenTrips(now = new Date()): Promise<number> {
  const threshold = new Date(now.getTime() - getEnv().OPEN_TRIP_ABSORB_HOURS * 3_600_000);

  const stale = db
    .select()
    .from(trips)
    .where(and(eq(trips.status, 'open'), lt(trips.startedAt, threshold)))
    .all();

  let sent = 0;
  for (const trip of stale) {
    const alreadySent = db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, trip.id), eq(auditLog.action, REMINDER_ACTION)))
      .get();
    if (alreadySent) continue;

    const vehicle = db.select().from(vehicles).where(eq(vehicles.id, trip.vehicleId)).get();
    await notify([trip.userId], {
      title: `Corsa aperta sulla ${vehicle?.name ?? 'macchina'}`,
      body: 'È aperta da più di un giorno: chiudila, altrimenti i km finiscono in mezzo.',
      url: `/mezzi/${trip.vehicleId}`,
      tag: `open-trip-${trip.id}`,
    });

    logAudit({
      userId: null,
      action: REMINDER_ACTION,
      entityType: 'trip',
      entityId: trip.id,
      occurredAt: now,
    });
    sent += 1;
  }

  return sent;
}
