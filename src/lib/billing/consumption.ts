import { TANK_FULL, type Consumption, type Refuel } from './types';

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
 * Campioni di consumo reale calcolati col metodo pieno-a-pieno: tra due rifornimenti
 * consecutivi entrambi marcati `full`, i litri del secondo pieno sono esattamente il
 * carburante bruciato nei km che li separano.
 */
export function fullTankSamples(refuels: readonly Refuel[]): number[] {
  const fulls = refuels
    .filter((r) => r.tankFractionAfter === TANK_FULL)
    .sort((a, b) => a.odometerKm - b.odometerKm);

  const samples: number[] = [];
  for (let i = 1; i < fulls.length; i++) {
    const km = fulls[i].odometerKm - fulls[i - 1].odometerKm;
    const liters = fulls[i].liters;
    // Un pieno a zero km (o senza litri) non dice niente sul consumo: si scarta.
    if (km > 0 && liters > 0) samples.push(km / liters);
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
 * Consumo in uso per un mezzo: media mobile dei campioni pieno-a-pieno recenti,
 * scartati gli outlier; se non bastano, il consumo dichiarato da libretto.
 */
export function resolveConsumption(
  refuels: readonly Refuel[],
  declaredKmPerLiter: number,
  options: ConsumptionOptions = {},
): Consumption {
  const { window, outlierTolerance, minSamples } = { ...DEFAULTS, ...options };
  const declared: Consumption = {
    kmPerLiter: declaredKmPerLiter,
    source: 'declared',
    sampleCount: 0,
  };

  const recent = fullTankSamples(refuels).slice(-window);
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
