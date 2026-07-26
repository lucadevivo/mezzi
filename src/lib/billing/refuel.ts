import { roundCents } from './money';
import type { Cents } from './types';

export class RefuelError extends Error {}

export interface RefuelAmounts {
  liters: number;
  pricePerLiterCents: Cents;
  totalCents: Cents;
}

/**
 * Al distributore si leggono due valori su tre (di solito litri e totale, oppure
 * prezzo al litro e totale): il terzo si ricava. Chiedere tutti e tre è un tap di troppo
 * con una mano sola davanti alla pompa.
 */
export function completeRefuelAmounts(input: {
  liters?: number | null;
  pricePerLiterCents?: Cents | null;
  totalCents?: Cents | null;
}): RefuelAmounts {
  const { liters, pricePerLiterCents, totalCents } = input;
  const known = [liters, pricePerLiterCents, totalCents].filter(
    (v) => v !== null && v !== undefined && v > 0,
  ).length;

  if (known < 2) throw new RefuelError('Servono almeno due valori tra litri, €/litro e totale');

  if (liters && pricePerLiterCents) {
    return { liters, pricePerLiterCents, totalCents: roundCents(liters * pricePerLiterCents) };
  }
  if (liters && totalCents) {
    return { liters, pricePerLiterCents: roundCents(totalCents / liters), totalCents };
  }
  if (pricePerLiterCents && totalCents) {
    return { liters: totalCents / pricePerLiterCents, pricePerLiterCents, totalCents };
  }

  throw new RefuelError('Combinazione di valori non valida');
}
