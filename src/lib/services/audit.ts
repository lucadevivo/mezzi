import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Ogni scrittura sensibile lascia una traccia: è così che le discussioni finiscono. */
export function logAudit(
  entry: {
    userId: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    payload?: unknown;
    occurredAt?: Date;
  },
  tx: typeof db | Tx = db,
): void {
  tx.insert(auditLog)
    .values({
      id: randomUUID(),
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      payload: entry.payload ?? null,
      occurredAt: entry.occurredAt ?? new Date(),
    })
    .run();
}
