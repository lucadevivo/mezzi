import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ledgerEntries } from '@/lib/db/schema';
import type { Cents } from '@/lib/billing';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Db = typeof db | Tx;

export type LedgerSourceType = (typeof ledgerEntries.$inferInsert)['sourceType'];
export type LedgerEntryType = (typeof ledgerEntries.$inferInsert)['type'];

export interface NewLedgerEntry {
  userId: string;
  vehicleId?: string | null;
  type: LedgerEntryType;
  /** Chilometri: è questo che fa il saldo. */
  amountKm: number;
  /** Euro, solo come memoria di quanto è stato speso: non entra nel saldo. */
  amountCents?: Cents;
  sourceType: LedgerSourceType;
  sourceId?: string | null;
  occurredAt: Date;
  description: string;
}

/** Il ledger è append-only: qui si scrive e basta, non esiste un update. */
export function addLedgerEntries(entries: readonly NewLedgerEntry[], tx: Db = db): string[] {
  const rows = entries.map((entry) => ({ id: randomUUID(), ...entry }));
  if (rows.length > 0) tx.insert(ledgerEntries).values(rows).run();
  return rows.map((r) => r.id);
}

/**
 * Correggere vuol dire stornare: si scrive una riga uguale e contraria che punta
 * all'originale. Nessuna riga viene mai modificata o cancellata.
 */
export function reverseLedgerEntries(
  sourceType: LedgerSourceType,
  sourceId: string,
  reason: string,
  occurredAt = new Date(),
  tx: Db = db,
): number {
  const originals = tx
    .select()
    .from(ledgerEntries)
    .where(eq(ledgerEntries.sourceId, sourceId))
    .all()
    .filter((e) => e.sourceType === sourceType && !e.reversesEntryId);

  const reversals = originals.map((original) => ({
    id: randomUUID(),
    userId: original.userId,
    vehicleId: original.vehicleId,
    type: 'adjustment' as const,
    amountCents: -original.amountCents,
    sourceType,
    sourceId,
    reversesEntryId: original.id,
    occurredAt,
    description: `Storno: ${reason}`,
  }));

  if (reversals.length > 0) tx.insert(ledgerEntries).values(reversals).run();
  return reversals.length;
}
