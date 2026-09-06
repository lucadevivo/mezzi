import type { Consumption, Refuel } from './types';

export interface ConsumptionOptions {
  /** Quanti campioni recenti considerare per la media mobile. */
  window?: number;
  /** Scarto massimo dalla mediana oltre il quale il campione è un outlier. */
  outlierTolerance?: number;
  /** Sotto questo numero di campioni validi si continua a usare il consumo da libretto. */
  minSamples?: number;
}

const DEFAULTS = { window: 5, outlierTolerance: 0.3, minSamples: 3 } as const;

/**
 * Carburante bruciato tra due rifornimenti di cui si conosce il livello raggiunto.
 *
 * Il metodo classico è pieno-a-pieno: se il serbatoio riparte pieno tutte e due le
 * volte, i litri del secondo rifornimento sono esattamente quelli bruciati. Ma qui
 * **il pieno non lo fa mai nessuno**: si mettono venti euro alla volta. Allora si
 * usa la lancetta: quello che manca nel serbatoio all'arrivo del secondo
 * rifornimento è quello che si è bruciato.
 *
 *   bruciati = capacità × (livello dopo il primo − livello dopo il secondo) + litri del secondo
 *
 * Con due pieni (livelli entrambi 1) la formula si riduce ai litri del secondo, cioè
 * al metodo di prima: è una generalizzazione, non un metodo diverso.
 */
export function burnedBetween(previous: Refuel, current: Refuel, tankCapacityL: number): number {
  if (previous.tankFractionAfter === null || current.tankFractionAfter === null) return 0;
  return (
    tankCapacityL * (previous.tankFractionAfter - current.tankFractionAfter) + current.liters
  );
}

/**
 * Campioni di consumo reale, serbatoio-a-serbatoio. La lancetta si legge a occhio,
 * quindi ogni campione è rumoroso: è `resolveConsumption` a difendersi, con mediana,
 * scarto degli outlier e un minimo di campioni.
 */
export function tankToTankSamples(refuels: readonly Refuel[], tankCapacityL: number): number[] {
  const anchors = refuels
    .filter((r) => r.tankFractionAfter !== null)
    .sort((a, b) => a.odometerKm - b.odometerKm);

  const samples: number[] = [];
  for (let i = 1; i < anchors.length; i++) {
    const km = anchors[i].odometerKm - anchors[i - 1].odometerKm;
    const burned = burnedBetween(anchors[i - 1], anchors[i], tankCapacityL);
    // Km a zero, o un conto che dice che il serbatoio si è riempito da solo: si scarta.
    if (km > 0 && burned > 0) samples.push(km / burned);
  }
  return samples;
}

export function median(values: readonly number[]): number {
  if (values.length === 0) throw new Error('Mediana di un insieme vuoto');
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Consumo in uso per un mezzo: media mobile dei campioni serbatoio-a-serbatoio
 * recenti, scartati gli outlier; se non bastano, il consumo dichiarato da libretto.
 */
export function resolveConsumption(
  refuels: readonly Refuel[],
  declaredKmPerLiter: number,
  tankCapacityL: number,
  options: ConsumptionOptions = {},
): Consumption {
  const { window, outlierTolerance, minSamples } = { ...DEFAULTS, ...options };
  const declared: Consumption = {
    kmPerLiter: declaredKmPerLiter,
    source: 'declared',
    sampleCount: 0,
  };

  const recent = tankToTankSamples(refuels, tankCapacityL).slice(-window);
  if (recent.length < minSamples) return declared;

  const med = median(recent);
  const kept = recent.filter((s) => Math.abs(s - med) / med <= outlierTolerance);
  if (kept.length < minSamples) return declared;

  return {
    kmPerLiter: kept.reduce((a, b) => a + b, 0) / kept.length,
    source: 'measured',
    sampleCount: kept.length,
  };
}
