import { formatEuro } from './money';
import type { Cents, LedgerEntry, UserId } from './types';

/** Saldo per utente: somma algebrica delle righe di ledger. Niente altro, mai. */
export function balances(entries: readonly LedgerEntry[]): Map<UserId, Cents> {
  const result = new Map<UserId, Cents>();
  for (const entry of entries) {
    result.set(entry.userId, (result.get(entry.userId) ?? 0) + entry.amountCents);
  }
  return result;
}

/**
 * Somma di TUTTI i saldi, utenti fatturabili e non.
 *
 * Non è zero: chi rifornisce viene accreditato subito, ma il carburante viene addebitato
 * mano a mano che si brucia. La somma dei saldi vale quindi il carburante già pagato e
 * ancora nel serbatoio — vedi `unconsumedFuelValueCents`. È l'invariante contabile
 * dell'app: se i due valori divergono, c'è una scrittura sbagliata da qualche parte.
 */
export function ledgerTotal(entries: readonly LedgerEntry[]): Cents {
  return entries.reduce((sum, e) => sum + e.amountCents, 0);
}

/** Valore del carburante pagato e non ancora consumato, in centesimi. */
export function unconsumedFuelValueCents(litersInTank: number, avgPriceCents: Cents): Cents {
  return Math.round(litersInTank * avgPriceCents);
}

export interface RefuelSuggestion {
  /** Debito in centesimi (0 se l'utente è in pari o in credito). */
  debtCents: Cents;
  /** Importo suggerito, arrotondato ai 5 € superiori. */
  suggestedCents: Cents;
  suggestedLiters: number;
  message: string;
}

const ROUNDING_STEP_CENTS = 500;

/**
 * "Quanto devo mettere?" — traduce il saldo in un'azione concreta al distributore.
 * Arrotonda ai 5 € in eccesso perché al distributore si mettono cifre tonde.
 */
export function refuelSuggestion(balanceCents: Cents, pricePerLiterCents: Cents): RefuelSuggestion {
  if (balanceCents >= 0) {
    return {
      debtCents: 0,
      suggestedCents: 0,
      suggestedLiters: 0,
      message:
        balanceCents === 0
          ? 'Sei in pari.'
          : `Sei in credito di ${formatEuro(balanceCents)}: hai anticipato più di quanto hai consumato.`,
    };
  }

  const debtCents = -balanceCents;
  const suggestedCents = Math.ceil(debtCents / ROUNDING_STEP_CENTS) * ROUNDING_STEP_CENTS;
  const suggestedLiters = pricePerLiterCents > 0 ? suggestedCents / pricePerLiterCents : 0;

  return {
    debtCents,
    suggestedCents,
    suggestedLiters,
    message: `Sei indietro di ${formatEuro(debtCents)} — al prossimo pieno metti circa ${formatEuro(suggestedCents)}.`,
  };
}

export interface Transfer {
  from: UserId;
  to: UserId;
  amountCents: Cents;
}

/**
 * Chi deve cosa a chi, col numero minimo di passaggi: si accoppiano il debitore
 * più grande e il creditore più grande finché non resta niente. Con 3-5 persone
 * l'euristica greedy dà sempre il risultato ottimo o a un passaggio da esso.
 *
 * ponytail: greedy, non ottimo in teoria; con 4 utenti non serve di meglio.
 */
export function settlementPlan(userBalances: ReadonlyMap<UserId, Cents>): Transfer[] {
  const debtors = [...userBalances].filter(([, c]) => c < 0).map(([id, c]) => ({ id, amount: -c }));
  const creditors = [...userBalances]
    .filter(([, c]) => c > 0)
    .map(([id, c]) => ({ id, amount: c }));

  debtors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));
  creditors.sort((a, b) => b.amount - a.amount || a.id.localeCompare(b.id));

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].amount, creditors[j].amount);
    if (amount > 0)
      transfers.push({ from: debtors[i].id, to: creditors[j].id, amountCents: amount });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }

  return transfers;
}
