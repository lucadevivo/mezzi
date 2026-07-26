import { eq } from 'drizzle-orm';
import { balances, refuelSuggestion, settlementPlan, type Cents } from '@/lib/billing';
import { db } from '@/lib/db';
import { ledgerEntries, user } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';

export interface UserBalance {
  userId: string;
  name: string;
  color: string;
  billable: boolean;
  balanceCents: Cents;
}

function allBalances(): Map<string, Cents> {
  return balances(
    db
      .select()
      .from(ledgerEntries)
      .all()
      .map((row) => ({
        userId: row.userId,
        amountCents: row.amountCents,
        type: row.type,
        occurredAt: row.occurredAt,
      })),
  );
}

export function listBalances(): UserBalance[] {
  const byUser = allBalances();
  return db
    .select()
    .from(user)
    .where(eq(user.active, true))
    .all()
    .map((row) => ({
      userId: row.id,
      name: row.name,
      color: row.color,
      billable: row.billable,
      balanceCents: byUser.get(row.id) ?? 0,
    }))
    .sort((a, b) => a.balanceCents - b.balanceCents);
}

export function getBalance(userId: string): Cents {
  return allBalances().get(userId) ?? 0;
}

/** "Quanto devo mettere?" — la domanda per cui esiste l'app. */
export function getRefuelSuggestion(userId: string, pricePerLiterCents?: number) {
  return refuelSuggestion(
    getBalance(userId),
    pricePerLiterCents ?? getEnv().FALLBACK_FUEL_PRICE_CENTS,
  );
}

/** Chi deve cosa a chi, solo tra utenti fatturabili: la nonna resta fuori. */
export function getSettlementPlan() {
  const billableIds = new Set(
    db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.billable, true))
      .all()
      .map((r) => r.id),
  );

  const byUser = new Map([...allBalances()].filter(([id]) => billableIds.has(id)));
  return settlementPlan(byUser);
}
