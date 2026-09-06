import { describe, expect, it } from 'vitest';
import { fullTankSamples, median, resolveConsumption } from './consumption';
import type { Refuel } from './types';

function refuel(odometerKm: number, liters: number, tankFractionAfter: number | null): Refuel {
  return {
    id: `r-${odometerKm}`,
    liters,
    pricePerLiterCents: 180,
    odometerKm,
    tankFractionAfter,
    refueledAt: new Date(2026, 0, 1),
  };
}

describe('fullTankSamples', () => {
  it('calcola il consumo solo tra due pieni consecutivi', () => {
    const samples = fullTankSamples([
      refuel(10000, 40, 1),
      refuel(10500, 10, 0.5), // rifornimento parziale: non chiude un intervallo
      refuel(10600, 50, 1),
    ]);
    expect(samples).toEqual([600 / 50]);
  });

  it('ignora i pieni senza km percorsi', () => {
    expect(fullTankSamples([refuel(10000, 40, 1), refuel(10000, 5, 1)])).toEqual([]);
  });

  it('non produce campioni con meno di due pieni', () => {
    expect(fullTankSamples([refuel(10000, 40, 1)])).toEqual([]);
  });
});

describe('median', () => {
  it('gestisce insiemi pari e dispari', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe('resolveConsumption', () => {
  it('usa il dato di libretto finché i campioni non bastano', () => {
    const result = resolveConsumption([refuel(10000, 40, 1), refuel(10500, 40, 1)], 15);
    expect(result).toEqual({ kmPerLiter: 15, source: 'declared', sampleCount: 0 });
  });

  it('passa al consumo misurato con abbastanza pieni', () => {
    const refuels = [
      refuel(10000, 40, 1),
      refuel(10400, 40, 1), // 10 km/l
      refuel(10800, 40, 1), // 10 km/l
      refuel(11200, 40, 1), // 10 km/l
    ];
    const result = resolveConsumption(refuels, 15);
    expect(result.source).toBe('measured');
    expect(result.kmPerLiter).toBeCloseTo(10, 6);
    expect(result.sampleCount).toBe(3);
  });

  it('scarta gli outlier oltre il 30% dalla mediana', () => {
    const refuels = [
      refuel(10000, 40, 1),
      refuel(10400, 40, 1), // 10 km/l
      refuel(10800, 40, 1), // 10 km/l
      refuel(11600, 40, 1), // 20 km/l: outlier (rifornimento non davvero pieno)
      refuel(12000, 40, 1), // 10 km/l
    ];
    const result = resolveConsumption(refuels, 15);
    expect(result.sampleCount).toBe(3);
    expect(result.kmPerLiter).toBeCloseTo(10, 6);
  });
});
