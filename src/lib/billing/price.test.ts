import { describe, expect, it } from 'vitest';
import { referencePrice, tankState, type TankEvent } from './price';
import type { Refuel } from './types';

function refuelEvent(
  at: Date,
  liters: number,
  pricePerLiterCents: number,
  tankFractionAfter: number | null = null,
): TankEvent {
  const refuel: Refuel = {
    id: `r-${at.getTime()}`,
    liters,
    pricePerLiterCents,
    odometerKm: 0,
    tankFractionAfter,
    refueledAt: at,
  };
  return { kind: 'refuel', at, refuel };
}

const day = (n: number) => new Date(2026, 6, n);

describe('tankState', () => {
  it('mescola i rifornimenti a media ponderata sui litri', () => {
    const state = tankState([refuelEvent(day(1), 30, 180), refuelEvent(day(2), 10, 200)], 45);
    expect(state.litersInTank).toBe(40);
    expect(state.avgPriceCents).toBeCloseTo((30 * 180 + 10 * 200) / 40, 6);
  });

  it('brucia i litri delle corse senza cambiare il prezzo medio', () => {
    const state = tankState(
      [refuelEvent(day(1), 30, 180), { kind: 'consumption', at: day(2), liters: 10 }],
      45,
    );
    expect(state.litersInTank).toBe(20);
    expect(state.avgPriceCents).toBe(180);
  });

  it('non scende sotto zero litri anche se il consumo stimato eccede', () => {
    const state = tankState(
      [refuelEvent(day(1), 10, 180), { kind: 'consumption', at: day(2), liters: 40 }],
      45,
    );
    expect(state.litersInTank).toBe(0);
  });

  it('usa il livello dichiarato come ancora, più affidabile della stima', () => {
    const state = tankState([refuelEvent(day(1), 5, 180, 1)], 45);
    expect(state.litersInTank).toBe(45);
    expect(state.estimated).toBe(false);
  });

  it('ordina gli eventi cronologicamente a prescindere dall input', () => {
    const events = [refuelEvent(day(3), 10, 200), refuelEvent(day(1), 30, 180)];
    expect(tankState(events, 45).avgPriceCents).toBeCloseTo(
      tankState([...events].reverse(), 45).avgPriceCents,
      6,
    );
  });
});

describe('referencePrice', () => {
  const fallbackPricePerLiterCents = 175;

  it('preferisce la media ponderata del carburante in serbatoio', () => {
    const result = referencePrice({
      events: [refuelEvent(day(1), 30, 180), refuelEvent(day(2), 10, 200)],
      tankCapacityL: 45,
      fallbackPricePerLiterCents,
    });
    expect(result.source).toBe('tank_weighted');
    expect(result.pricePerLiterCents).toBe(185);
  });

  it('ripiega sull ultimo rifornimento se il serbatoio risulta vuoto', () => {
    const result = referencePrice({
      events: [refuelEvent(day(1), 30, 180), { kind: 'consumption', at: day(2), liters: 30 }],
      tankCapacityL: 45,
      fallbackPricePerLiterCents,
    });
    expect(result).toEqual({ pricePerLiterCents: 180, source: 'last_refuel' });
  });

  it('usa il valore configurato quando non c è alcuno storico', () => {
    const result = referencePrice({ events: [], tankCapacityL: 45, fallbackPricePerLiterCents });
    expect(result).toEqual({ pricePerLiterCents: 175, source: 'fallback' });
  });
});

describe('referencePrice — corse che precedono ogni rifornimento', () => {
  const refuel: Refuel = {
    id: 'r-1',
    liters: 10,
    pricePerLiterCents: 210,
    odometerKm: 1000,
    tankFractionAfter: null,
    refueledAt: new Date('2026-08-01T10:00:00Z'),
  };

  it('usa il primo rifornimento noto invece del valore di ripiego', () => {
    const result = referencePrice({
      events: [],
      tankCapacityL: 45,
      firstRefuelPriceCents: 210,
      fallbackPricePerLiterCents: 180,
    });

    expect(result).toEqual({ pricePerLiterCents: 210, source: 'first_refuel' });
  });

  it('ripiega sulla costante solo se il mezzo non ha mai visto un rifornimento', () => {
    const result = referencePrice({
      events: [],
      tankCapacityL: 45,
      firstRefuelPriceCents: null,
      fallbackPricePerLiterCents: 180,
    });

    expect(result).toEqual({ pricePerLiterCents: 180, source: 'fallback' });
  });

  it('il serbatoio, quando c’è, batte il primo rifornimento noto', () => {
    const result = referencePrice({
      events: [{ kind: 'refuel', at: new Date('2026-08-01T10:00:00Z'), refuel }],
      tankCapacityL: 45,
      firstRefuelPriceCents: 999,
      fallbackPricePerLiterCents: 180,
    });

    expect(result.source).toBe('tank_weighted');
    expect(result.pricePerLiterCents).toBe(210);
  });
});
