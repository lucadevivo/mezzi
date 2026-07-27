import { roundCents, splitCentsByWeight } from './money';
import type { Cents, UserId } from './types';

export interface ReconciliationInput {
  /** Litri stimati e già addebitati a ciascuno nella finestra tra due pieni. */
  chargedLitersByUser: ReadonlyMap<UserId, number>;
  /** Litri realmente entrati nel serbatoio al secondo pieno: il carburante davvero bruciato. */
  actualLiters: number;
  /** Prezzo medio del carburante bruciato nella finestra. */
  unitPriceCents: Cents;
  /**
   * Oltre questo scostamento relativo la riconciliazione si ferma: quasi sempre
   * significa un rifornimento marcato "pieno" che pieno non era, non un consumo diverso.
   */
  maxDeviation?: number;
}

export interface Reconciliation {
  /** Rettifiche a ledger: negativo = addebito aggiuntivo, positivo = rimborso. */
  adjustments: Map<UserId, Cents>;
  /** Litri di differenza tra reale e stimato (positivo = avevamo addebitato troppo poco). */
  deltaLiters: number;
  skipped: 'no_data' | 'implausible' | null;
}

const DEFAULT_MAX_DEVIATION = 0.5;

/**
 * Chiude il cerchio tra stima e realtà.
 *
 * Le corse addebitano litri *stimati* dal consumo, i rifornimenti accreditano euro *reali*:
 * se il consumo stimato è sbagliato, la differenza non finisce a carico di nessuno e i saldi
 * scivolano via per sempre. A ogni pieno sappiamo però quanti litri sono stati bruciati sul
 * serio, e la differenza si redistribuisce a chi ha guidato, in proporzione a quanto ha
 * consumato. Senza questo passaggio i conti sono solo approssimativi.
 */
export function reconcileConsumption(input: ReconciliationInput): Reconciliation {
  const { chargedLitersByUser, actualLiters, unitPriceCents } = input;
  const maxDeviation = input.maxDeviation ?? DEFAULT_MAX_DEVIATION;

  const weights = new Map([...chargedLitersByUser].filter(([, liters]) => liters > 0));
  const totalCharged = [...weights.values()].reduce((a, b) => a + b, 0);

  const empty = (skipped: Reconciliation['skipped']): Reconciliation => ({
    adjustments: new Map(),
    deltaLiters: 0,
    skipped,
  });

  if (totalCharged <= 0 || actualLiters <= 0) return empty('no_data');

  const deltaLiters = actualLiters - totalCharged;
  if (Math.abs(deltaLiters) / totalCharged > maxDeviation) return empty('implausible');

  const deltaCents = roundCents(deltaLiters * unitPriceCents);
  if (deltaCents === 0) return { adjustments: new Map(), deltaLiters, skipped: null };

  // Abbiamo addebitato meno del dovuto (delta positivo) → altri addebiti, quindi segno negativo.
  return { adjustments: splitCentsByWeight(-deltaCents, weights), deltaLiters, skipped: null };
}
