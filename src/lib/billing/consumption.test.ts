import { describe, expect, it } from 'vitest';
import { burnedBetween, median, resolveConsumption, tankToTankSamples } from './consumption';
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

const CAPACITY = 40;

describe('tankToTankSamples', () => {
  it('tra due pieni si riduce ai litri del secondo, come il metodo classico', () => {
    const samples = tankToTankSamples([refuel(10000, 40, 1), refuel(10600, 50, 1)], CAPACITY);
    expect(samples).toEqual([600 / 50]);
  });

  it('funziona anche senza mai fare il pieno', () => {
    // Riparte da mezzo serbatoio (20 l), arriva con 10 l in meno e ne mette 15:
    // bruciati = 40 × (0,5 − 0,625) + 15 = 10 litri in 200 km.
    const samples = tankToTankSamples([refuel(10000, 15, 0.5), refuel(10200, 15, 0.625)], CAPACITY);
    expect(samples).toEqual([200 / 10]);
  });

  it('salta i rifornimenti senza lancetta segnata', () => {
    const samples = tankToTankSamples(
      [refuel(10000, 40, 1), refuel(10300, 10, null), refuel(10600, 50, 1)],
      CAPACITY,
    );
    expect(samples).toEqual([600 / 50]);
  });

  it('scarta gli intervalli impossibili: km fermi o serbatoio che si riempie da solo', () => {
    expect(tankToTankSamples([refuel(10000, 40, 1), refuel(10000, 5, 1)], CAPACITY)).toEqual([]);
    // Livello salito piu' dei litri messi: la lancetta e' stata letta male.
    expect(tankToTankSamples([refuel(10000, 5, 0.25), refuel(10100, 5, 1)], CAPACITY)).toEqual([]);
  });

  it('non produce campioni con una sola ancora', () => {
    expect(tankToTankSamples([refuel(10000, 40, 1)], CAPACITY)).toEqual([]);
  });
});

describe('burnedBetween', () => {
  it('senza lancetta su uno dei due rifornimenti non dice niente', () => {
    expect(burnedBetween(refuel(10000, 40, null), refuel(10600, 50, 1), CAPACITY)).toBe(0);
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
    const result = resolveConsumption([refuel(10000, 40, 1), refuel(10500, 40, 1)], 15, CAPACITY);
    expect(result).toEqual({ kmPerLiter: 15, source: 'declared', sampleCount: 0 });
  });

  it('passa al consumo misurato con abbastanza pieni', () => {
    const refuels = [
      refuel(10000, 40, 1),
      refuel(10400, 40, 1), // 10 km/l
      refuel(10800, 40, 1), // 10 km/l
      refuel(11200, 40, 1), // 10 km/l
    ];
    const result = resolveConsumption(refuels, 15, CAPACITY);
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
    const result = resolveConsumption(refuels, 15, CAPACITY);
    expect(result.sampleCount).toBe(3);
    expect(result.kmPerLiter).toBeCloseTo(10, 6);
  });
});
