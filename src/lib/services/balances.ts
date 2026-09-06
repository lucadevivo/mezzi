import { eq } from 'drizzle-orm';
import { balances, refuelSuggestion } from '@/lib/billing';
import { db } from '@/lib/db';
import { ledgerEntries, user } from '@/lib/db/schema';

export interface UserBalance {
  userId: string;
  name: string;
  color: string;
  billable: boolean;
  /** Positivo = autonomia già pagata. Negativo = km fatti e non ancora coperti. */
  balanceKm: number;
}

function allBalances(): Map<string, number> {
  return balances(
    db
      .select()
      .from(ledgerEntries)
      .all()
      .map((row) => ({
        userId: row.userId,
        amountKm: row.amountKm,
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
      balanceKm: byUser.get(row.id) ?? 0,
    }))
    .sort((a, b) => a.balanceKm - b.balanceKm);
}

export function getBalance(userId: string): number {
  return allBalances().get(userId) ?? 0;
}

/**
 * "Quanto devo mettere?" — la domanda per cui esiste l'app. Il debito è in
 * chilometri, ma alla pompa servono euro: prezzo e consumo del mezzo fanno il resto.
 */
export function getRefuelSuggestion(
  userId: string,
  pricePerLiterCents: number,
  kmPerLiter: number,
) {
  return refuelSuggestion(getBalance(userId), pricePerLiterCents, kmPerLiter);
}
