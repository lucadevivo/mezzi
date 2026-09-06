import type { LedgerEntry, UserId } from './types';

/**
 * Saldo per utente, **in chilometri**: somma algebrica delle righe di ledger.
 *
 * Il conto non è in denaro. Guidare toglie chilometri, mettere carburante ne
 * aggiunge — tanti quanti ne compri con quei soldi. Positivo = autonomia già
 * pagata e non ancora usata; negativo = chilometri fatti senza aver messo niente.
 */
export function balances(entries: readonly LedgerEntry[]): Map<UserId, number> {
  const result = new Map<UserId, number>();
  for (const entry of entries) {
    result.set(entry.userId, round(round(result.get(entry.userId) ?? 0) + entry.amountKm));
  }
  return result;
}

/** I km stanno in decimi: senza arrotondare, i float lasciano code di 0,0000001. */
const round = (km: number) => Math.round(km * 10) / 10;

/**
 * Somma di TUTTI i saldi, utenti fatturabili e non.
 *
 * Non è zero, e non deve esserlo: chi rifornisce riceve subito l'autonomia comprata,
 * ma la consuma un po' alla volta. La somma dei saldi vale quindi i chilometri che il
 * carburante nel serbatoio può ancora fare — vedi `autonomyInTankKm`. È l'invariante
 * contabile dell'app: se i due valori divergono, c'è una scrittura sbagliata.
 */
export function ledgerTotalKm(entries: readonly LedgerEntry[]): number {
  return round(entries.reduce((sum, e) => sum + e.amountKm, 0));
}

/** Chilometri che il carburante presente nel serbatoio può ancora fare. */
export function autonomyInTankKm(litersInTank: number, kmPerLiter: number): number {
  return round(litersInTank * kmPerLiter);
}

/** Chilometri comprati con una certa spesa: è così che il denaro entra nel conto. */
export function kmBought(liters: number, kmPerLiter: number): number {
  return round(liters * kmPerLiter);
}

export interface RefuelSuggestion {
  /** Chilometri di debito (0 se in pari o in credito). */
  debtKm: number;
  /** Euro da mettere per tornare in pari, arrotondati ai 5 € superiori. */
  suggestedCents: number;
  message: string;
}

const ROUNDING_STEP_CENTS = 500;

/**
 * "Quanto devo mettere?" — traduce il saldo in un'azione al distributore.
 * Il debito è in chilometri, ma alla pompa si mettono euro: la conversione usa il
 * prezzo di adesso, perché è quello che pagherai adesso. Arrotonda ai 5 € in eccesso.
 */
export function refuelSuggestion(
  balanceKm: number,
  pricePerLiterCents: number,
  kmPerLiter: number,
): RefuelSuggestion {
  if (balanceKm >= 0) {
    return {
      debtKm: 0,
      suggestedCents: 0,
      message:
        balanceKm === 0
          ? 'Sei in pari.'
          : `Hai ${formatKmShort(balanceKm)} di autonomia già pagata.`,
    };
  }

  const debtKm = round(-balanceKm);
  const litri = kmPerLiter > 0 ? debtKm / kmPerLiter : 0;
  const dovuti = Math.round(litri * pricePerLiterCents);
  const suggestedCents = Math.ceil(dovuti / ROUNDING_STEP_CENTS) * ROUNDING_STEP_CENTS;

  return {
    debtKm,
    suggestedCents,
    message: `Sei indietro di ${formatKmShort(debtKm)} — al prossimo pieno metti circa ${(suggestedCents / 100).toFixed(0)} €.`,
  };
}

/** Solo per i messaggi: la formattazione vera sta in `@/lib/format`, che qui non entra. */
function formatKmShort(km: number): string {
  return `${km.toFixed(km % 1 === 0 ? 0 : 1).replace('.', ',')} km`;
}
