import type { Cents } from './types';

export class MoneyError extends Error {}

/** Arrotondamento half-up su interi, stabile anche per valori negativi. */
export function roundCents(value: number): Cents {
  if (!Number.isFinite(value)) throw new MoneyError(`Importo non finito: ${value}`);
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/**
 * Divide un importo in `n` parti intere. Il resto (in centesimi) viene distribuito
 * una unità alla volta alle prime parti, così la somma delle quote è SEMPRE uguale
 * al totale: è questo che tiene in piedi l'invariante "somma dei saldi = 0".
 */
export function splitCents(total: Cents, n: number): Cents[] {
  if (!Number.isInteger(total)) throw new MoneyError(`Importo non intero: ${total}`);
  if (!Number.isInteger(n) || n <= 0) throw new MoneyError(`Numero di quote non valido: ${n}`);

  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / n);
  const remainder = abs - base * n;

  return Array.from({ length: n }, (_, i) => sign * (base + (i < remainder ? 1 : 0)));
}

/** Come `splitCents`, ma restituisce le quote associate agli id passati. */
export function splitCentsAmong<T extends string>(total: Cents, ids: readonly T[]): Map<T, Cents> {
  if (ids.length === 0) throw new MoneyError('Nessun destinatario per la ripartizione');
  const parts = splitCents(total, ids.length);
  return new Map(ids.map((id, i) => [id, parts[i]]));
}

/**
 * Ripartizione proporzionale a dei pesi (es. km percorsi). I resti vanno a chi ha
 * la parte frazionaria più alta (metodo dei resti massimi), così la somma torna esatta.
 * Se tutti i pesi sono zero si ricade sulla divisione in parti uguali.
 */
export function splitCentsByWeight<T extends string>(
  total: Cents,
  weights: ReadonlyMap<T, number>,
): Map<T, Cents> {
  const ids = [...weights.keys()];
  if (ids.length === 0) throw new MoneyError('Nessun destinatario per la ripartizione');
  if (ids.some((id) => weights.get(id)! < 0)) throw new MoneyError('Pesi negativi non ammessi');

  const totalWeight = ids.reduce((sum, id) => sum + weights.get(id)!, 0);
  if (totalWeight === 0) return splitCentsAmong(total, ids);

  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);

  const exact = ids.map((id) => (abs * weights.get(id)!) / totalWeight);
  const floors = exact.map(Math.floor);
  let remainder = abs - floors.reduce((a, b) => a + b, 0);

  const order = ids
    .map((id, i) => ({ i, frac: exact[i] - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const shares = [...floors];
  for (const { i } of order) {
    if (remainder <= 0) break;
    shares[i] += 1;
    remainder -= 1;
  }

  return new Map(ids.map((id, i) => [id, sign * shares[i]]));
}

/** Formatta i centesimi in euro con la virgola, per la UI italiana. */
export function formatEuro(cents: Cents): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}
