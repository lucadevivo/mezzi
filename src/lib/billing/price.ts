import { roundCents } from './money';
import { TANK_FULL, type Cents, type ReferencePrice, type Refuel } from './types';

/** Un evento che tocca il serbatoio: un rifornimento lo riempie, una corsa lo svuota. */
export type TankEvent =
  { kind: 'refuel'; at: Date; refuel: Refuel } | { kind: 'consumption'; at: Date; liters: number };

export interface TankState {
  litersInTank: number;
  /** Costo medio ponderato del carburante attualmente nel serbatoio. */
  avgPriceCents: Cents;
  /** `true` se nessun rifornimento ha ancora dato un livello certo del serbatoio. */
  estimated: boolean;
}

/**
 * Ricostruisce il contenuto del serbatoio come pool a media ponderata: ogni rifornimento
 * mescola litri nuovi a un prezzo nuovo, ogni corsa brucia litri al prezzo medio corrente.
 *
 * Non esiste un sensore di livello: quando un rifornimento dice dov'è la lancetta,
 * quel valore è più affidabile della nostra stima e viene usato come ancora.
 */
export function tankState(
  events: readonly TankEvent[],
  tankCapacityL: number,
  initial?: Partial<TankState>,
): TankState {
  let liters = initial?.litersInTank ?? 0;
  let avg = initial?.avgPriceCents ?? 0;
  let estimated = initial?.estimated ?? true;

  const ordered = [...events].sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const event of ordered) {
    if (event.kind === 'consumption') {
      liters = Math.max(0, liters - event.liters);
      continue;
    }

    const { liters: added, pricePerLiterCents, tankFractionAfter } = event.refuel;
    const total = liters + added;
    avg = total > 0 ? (liters * avg + added * pricePerLiterCents) / total : pricePerLiterCents;
    liters = total;

    if (tankFractionAfter !== null) {
      liters = tankFractionAfter * tankCapacityL;
      estimated = tankFractionAfter === TANK_FULL ? false : estimated;
    }
  }

  return { litersInTank: liters, avgPriceCents: avg, estimated };
}

export interface ReferencePriceInput {
  events: readonly TankEvent[];
  tankCapacityL: number;
  /**
   * Prezzo del primo rifornimento mai registrato sul mezzo, anche se successivo alla
   * corsa che si sta valutando. Serve alle corse che stanno prima di ogni rifornimento:
   * quel gasolio qualcuno l'ha comprato, e il prezzo vicino nel tempo lo stima molto
   * meglio di una costante di configurazione che invecchia.
   */
  firstRefuelPriceCents?: Cents | null;
  /** Prezzo di ripiego configurabile (o media regionale, quando ci sarà). */
  fallbackPricePerLiterCents: Cents;
}

/**
 * Prezzo al litro da usare per addebitare una corsa, nell'ordine della spec:
 * 1. media ponderata del carburante effettivamente in serbatoio,
 * 2. prezzo dell'ultimo rifornimento del mezzo,
 * 3. prezzo del primo rifornimento noto, per le corse che vengono prima di tutti,
 * 4. valore di ripiego.
 */
export function referencePrice(input: ReferencePriceInput): ReferencePrice {
  const { events, tankCapacityL, firstRefuelPriceCents, fallbackPricePerLiterCents } = input;

  const state = tankState(events, tankCapacityL);
  if (state.litersInTank > 0 && state.avgPriceCents > 0) {
    return { pricePerLiterCents: roundCents(state.avgPriceCents), source: 'tank_weighted' };
  }

  const refuels = events
    .filter((e): e is Extract<TankEvent, { kind: 'refuel' }> => e.kind === 'refuel')
    .sort((a, b) => a.at.getTime() - b.at.getTime());

  const last = refuels.at(-1);
  if (last) {
    return { pricePerLiterCents: last.refuel.pricePerLiterCents, source: 'last_refuel' };
  }

  if (firstRefuelPriceCents && firstRefuelPriceCents > 0) {
    return { pricePerLiterCents: firstRefuelPriceCents, source: 'first_refuel' };
  }

  return { pricePerLiterCents: fallbackPricePerLiterCents, source: 'fallback' };
}
