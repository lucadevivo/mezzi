import { randomUUID } from 'node:crypto';
import { and, desc, eq, gt, lte } from 'drizzle-orm';
import { splitExpense, type SplitRule } from '@/lib/billing';
import { db } from '@/lib/db';
import { expenses, trips, user, vehicleMembers } from '@/lib/db/schema';
import { logAudit } from './audit';
import { addLedgerEntries, reverseLedgerEntries } from './ledger';
import { getVehicle } from './vehicles';

export class ExpenseServiceError extends Error {}

export type ExpenseCategory = (typeof expenses.$inferInsert)['category'];
export type Expense = typeof expenses.$inferSelect;

/** Membri che partecipano ai costi fissi di quel mezzo: la nonna resta fuori. */
function fixedCostMemberIds(vehicleId: string): string[] {
  return db
    .select({ id: user.id })
    .from(vehicleMembers)
    .innerJoin(user, eq(vehicleMembers.userId, user.id))
    .where(
      and(
        eq(vehicleMembers.vehicleId, vehicleId),
        eq(vehicleMembers.shareFixedCosts, true),
        eq(user.billable, true),
        eq(user.active, true),
      ),
    )
    .all()
    .map((row) => row.id);
}

/** Km percorsi da ciascuno nel periodo: è il criterio giusto per bollo e assicurazione. */
export function kmByUserInPeriod(vehicleId: string, from: Date, to: Date): Map<string, number> {
  const rows = db
    .select()
    .from(trips)
    .where(
      and(
        eq(trips.vehicleId, vehicleId),
        eq(trips.status, 'closed'),
        gt(trips.endedAt, from),
        lte(trips.endedAt, to),
      ),
    )
    .all();

  const result = new Map<string, number>();
  for (const trip of rows) {
    if (!trip.distanceKm) continue;
    result.set(trip.userId, (result.get(trip.userId) ?? 0) + trip.distanceKm);
  }
  return result;
}

export interface RecordExpenseInput {
  vehicleId: string;
  paidByUserId: string;
  category: ExpenseCategory;
  amountCents: number;
  date?: Date;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  splitRule: SplitRule;
  note?: string | null;
}

/**
 * Registra una spesa fissa: chi l'ha anticipata viene accreditato per intero,
 * gli altri addebitati per la loro quota secondo la regola scelta.
 */
export function recordExpense(input: RecordExpenseInput): { expenseId: string } {
  const vehicle = getVehicle(input.vehicleId);
  if (!vehicle) throw new ExpenseServiceError('Mezzo inesistente');
  if (input.amountCents <= 0) throw new ExpenseServiceError('L’importo deve essere positivo');

  const date = input.date ?? new Date();
  const periodStart = input.periodStart ?? null;
  const periodEnd = input.periodEnd ?? null;

  if (input.splitRule === 'by_km' && (!periodStart || !periodEnd)) {
    throw new ExpenseServiceError('La ripartizione a km ha bisogno del periodo coperto');
  }

  const memberIds = fixedCostMemberIds(input.vehicleId);
  const shares = splitExpense({
    amountCents: input.amountCents,
    rule: input.splitRule,
    memberIds,
    kmByUser:
      input.splitRule === 'by_km'
        ? kmByUserInPeriod(input.vehicleId, periodStart!, periodEnd!)
        : undefined,
  });

  const expenseId = randomUUID();

  db.transaction((tx) => {
    tx.insert(expenses)
      .values({
        id: expenseId,
        vehicleId: input.vehicleId,
        paidByUserId: input.paidByUserId,
        category: input.category,
        amountCents: input.amountCents,
        date,
        periodStart,
        periodEnd,
        splitRule: input.splitRule,
        note: input.note ?? null,
      })
      .run();

    // `none`: la paga chi l'ha anticipata e basta, nessun movimento a ledger.
    if (shares.size === 0) return;

    addLedgerEntries(
      [
        {
          userId: input.paidByUserId,
          vehicleId: input.vehicleId,
          type: 'expense_credit',
          amountCents: input.amountCents,
          sourceType: 'expense',
          sourceId: expenseId,
          occurredAt: date,
          description: `${input.category} ${vehicle.name}`,
        },
        ...[...shares].map(([userId, amount]) => ({
          userId,
          vehicleId: input.vehicleId,
          type: 'expense_charge' as const,
          amountCents: -amount,
          sourceType: 'expense' as const,
          sourceId: expenseId,
          occurredAt: date,
          description: `Quota ${input.category} ${vehicle.name}`,
        })),
      ],
      tx,
    );

    logAudit(
      {
        userId: input.paidByUserId,
        action: 'expense.create',
        entityType: 'expense',
        entityId: expenseId,
        payload: { amountCents: input.amountCents, rule: input.splitRule },
        occurredAt: date,
      },
      tx,
    );
  });

  return { expenseId };
}

export function listExpenses(vehicleId?: string, limit = 50): Expense[] {
  const query = db.select().from(expenses).orderBy(desc(expenses.date)).limit(limit);
  return vehicleId ? query.where(eq(expenses.vehicleId, vehicleId)).all() : query.all();
}

/** Correggere una spesa vuol dire stornarla: la riga originale resta dov'è. */
export function reverseExpense(expenseId: string, actorId: string, reason: string): void {
  const expense = db.select().from(expenses).where(eq(expenses.id, expenseId)).get();
  if (!expense) throw new ExpenseServiceError('Spesa inesistente');

  db.transaction((tx) => {
    const count = reverseLedgerEntries('expense', expenseId, reason, new Date(), tx);
    if (count === 0) throw new ExpenseServiceError('Questa spesa è già stata stornata');
    logAudit(
      {
        userId: actorId,
        action: 'expense.reverse',
        entityType: 'expense',
        entityId: expenseId,
        payload: { reason },
      },
      tx,
    );
  });
}
