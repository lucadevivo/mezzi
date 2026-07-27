import { randomUUID } from 'node:crypto';
import { desc, eq, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { settlements, user } from '@/lib/db/schema';
import { logAudit } from './audit';
import { addLedgerEntries } from './ledger';

export class SettlementError extends Error {}

export type Settlement = typeof settlements.$inferSelect;
export type SettlementMethod = (typeof settlements.$inferInsert)['method'];

export interface CreateSettlementInput {
  fromUserId: string;
  toUserId: string;
  amountCents: number;
  method: SettlementMethod;
  date?: Date;
  note?: string | null;
}

/**
 * Registra un pagamento tra due persone. Non tocca i saldi finché chi riceve non conferma:
 * è l'unico modo per chiudere la discussione dei "ti ho dato 20 euro" mai arrivati.
 */
export function createSettlement(input: CreateSettlementInput): { settlementId: string } {
  if (input.fromUserId === input.toUserId) {
    throw new SettlementError('Non puoi registrare un pareggio con te stesso');
  }
  if (input.amountCents <= 0) throw new SettlementError('L’importo deve essere positivo');

  const settlementId = randomUUID();
  db.insert(settlements)
    .values({
      id: settlementId,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      amountCents: input.amountCents,
      method: input.method,
      date: input.date ?? new Date(),
      note: input.note ?? null,
      confirmedByRecipient: false,
    })
    .run();

  logAudit({
    userId: input.fromUserId,
    action: 'settlement.create',
    entityType: 'settlement',
    entityId: settlementId,
    payload: { to: input.toUserId, amountCents: input.amountCents },
  });

  return { settlementId };
}

/** Solo chi riceve può confermare, ed è la conferma a muovere i saldi. */
export function confirmSettlement(settlementId: string, userId: string, now = new Date()): void {
  const settlement = db.select().from(settlements).where(eq(settlements.id, settlementId)).get();
  if (!settlement) throw new SettlementError('Pareggio inesistente');
  if (settlement.toUserId !== userId) {
    throw new SettlementError('Può confermare solo chi ha ricevuto i soldi');
  }
  if (settlement.confirmedByRecipient) throw new SettlementError('Pareggio già confermato');

  const names = new Map(
    db
      .select()
      .from(user)
      .all()
      .map((u) => [u.id, u.name]),
  );

  db.transaction((tx) => {
    tx.update(settlements)
      .set({ confirmedByRecipient: true, confirmedAt: now })
      .where(eq(settlements.id, settlementId))
      .run();

    // Chi paga risale, chi incassa scende: la somma dei due movimenti è zero.
    addLedgerEntries(
      [
        {
          userId: settlement.fromUserId,
          type: 'settlement',
          amountCents: settlement.amountCents,
          sourceType: 'settlement',
          sourceId: settlementId,
          occurredAt: settlement.date,
          description: `Pareggio a ${names.get(settlement.toUserId) ?? '?'} (${settlement.method})`,
        },
        {
          userId: settlement.toUserId,
          type: 'settlement',
          amountCents: -settlement.amountCents,
          sourceType: 'settlement',
          sourceId: settlementId,
          occurredAt: settlement.date,
          description: `Pareggio da ${names.get(settlement.fromUserId) ?? '?'} (${settlement.method})`,
        },
      ],
      tx,
    );

    logAudit(
      {
        userId,
        action: 'settlement.confirm',
        entityType: 'settlement',
        entityId: settlementId,
        payload: { amountCents: settlement.amountCents },
        occurredAt: now,
      },
      tx,
    );
  });
}

export function listSettlements(userId?: string, limit = 30): Settlement[] {
  const query = db.select().from(settlements).orderBy(desc(settlements.date)).limit(limit);
  return userId
    ? query.where(or(eq(settlements.fromUserId, userId), eq(settlements.toUserId, userId))).all()
    : query.all();
}

export function pendingConfirmationsFor(userId: string): Settlement[] {
  return db
    .select()
    .from(settlements)
    .where(eq(settlements.toUserId, userId))
    .all()
    .filter((s) => !s.confirmedByRecipient);
}
