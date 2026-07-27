import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { deadlineMessage, deadlineStatus, type DeadlineStatus } from '@/lib/billing';
import { db } from '@/lib/db';
import { auditLog, deadlines, vehicles } from '@/lib/db/schema';
import { logAudit } from './audit';
import { notify } from './push';
import { billableMemberIds } from './vehicles';

export class DeadlineServiceError extends Error {}

export type Deadline = typeof deadlines.$inferSelect;
export type DeadlineType = (typeof deadlines.$inferInsert)['type'];

export interface DeadlineWithStatus {
  deadline: Deadline;
  vehicleName: string;
  vehicleColor: string;
  status: DeadlineStatus;
  message: string;
}

export interface CreateDeadlineInput {
  vehicleId: string;
  type: DeadlineType;
  dueDate?: Date | null;
  dueOdometerKm?: number | null;
  notifyDaysBefore?: number;
}

export function createDeadline(input: CreateDeadlineInput, actorId: string): { id: string } {
  if (!input.dueDate && !input.dueOdometerKm) {
    throw new DeadlineServiceError('Serve una data o un chilometraggio');
  }

  const id = randomUUID();
  db.insert(deadlines)
    .values({
      id,
      vehicleId: input.vehicleId,
      type: input.type,
      dueDate: input.dueDate ?? null,
      dueOdometerKm: input.dueOdometerKm ?? null,
      notifyDaysBefore: input.notifyDaysBefore ?? 15,
    })
    .run();

  logAudit({
    userId: actorId,
    action: 'deadline.create',
    entityType: 'deadline',
    entityId: id,
    payload: { type: input.type, dueDate: input.dueDate, dueOdometerKm: input.dueOdometerKm },
  });

  return { id };
}

/** Fatta: resta nello storico, sparisce dagli avvisi. */
export function completeDeadline(id: string, actorId: string): void {
  const deadline = db.select().from(deadlines).where(eq(deadlines.id, id)).get();
  if (!deadline) throw new DeadlineServiceError('Scadenza inesistente');

  db.update(deadlines).set({ completed: true }).where(eq(deadlines.id, id)).run();
  logAudit({ userId: actorId, action: 'deadline.complete', entityType: 'deadline', entityId: id });
}

export function listDeadlines(includeCompleted = false, now = new Date()): DeadlineWithStatus[] {
  const rows = db
    .select()
    .from(deadlines)
    .innerJoin(vehicles, eq(deadlines.vehicleId, vehicles.id))
    .where(includeCompleted ? undefined : eq(deadlines.completed, false))
    .orderBy(asc(deadlines.dueDate))
    .all();

  return rows
    .map(({ deadlines: deadline, vehicles: vehicle }) => {
      const status = deadlineStatus({
        dueDate: deadline.dueDate,
        dueOdometerKm: deadline.dueOdometerKm,
        currentOdometerKm: vehicle.currentOdometerKm,
        notifyDaysBefore: deadline.notifyDaysBefore,
        now,
      });
      return {
        deadline,
        vehicleName: vehicle.name,
        vehicleColor: vehicle.color,
        status,
        message: deadlineMessage(status),
      };
    })
    .sort((a, b) => {
      // Prima quelle che bruciano: scadute, poi in avvicinamento, poi il resto.
      const order = { overdue: 0, soon: 1, ok: 2 } as const;
      return order[a.status.state] - order[b.status.state];
    });
}

const NOTIFIED_ACTION = 'deadline.notified';

/**
 * Avvisa una volta sola per scadenza entrata in finestra. Come per i reclami scaduti,
 * gira quando qualcuno apre l'app: l'audit log fa da segnaposto.
 */
export async function notifyDueDeadlines(now = new Date()): Promise<number> {
  const due = listDeadlines(false, now).filter((row) => row.status.state !== 'ok');

  let sent = 0;
  for (const { deadline, vehicleName, status, message } of due) {
    const already = db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.entityId, deadline.id), eq(auditLog.action, NOTIFIED_ACTION)))
      .get();
    if (already) continue;

    await notify(billableMemberIds(deadline.vehicleId), {
      title: `${vehicleName} — ${deadline.type}`,
      body: status.state === 'overdue' ? `È ${message}.` : `${message}.`,
      url: '/scadenze',
      tag: `deadline-${deadline.id}`,
    });

    logAudit({
      userId: null,
      action: NOTIFIED_ACTION,
      entityType: 'deadline',
      entityId: deadline.id,
      occurredAt: now,
    });
    sent += 1;
  }

  return sent;
}
