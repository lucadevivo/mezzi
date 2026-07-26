import { describe, expect, it } from 'vitest';
import { splitTripCost, TripError, tripCost, validateTrip } from './trip';

describe('tripCost', () => {
  it('stima litri e costo dalla distanza e dal consumo', () => {
    const { litersEstimated, costCents } = tripCost({
      distanceKm: 72,
      consumptionKmPerLiter: 15,
      unitPriceCents: 180,
    });
    expect(litersEstimated).toBeCloseTo(4.8, 6);
    expect(costCents).toBe(864);
  });

  it('restituisce sempre centesimi interi', () => {
    const { costCents } = tripCost({
      distanceKm: 7,
      consumptionKmPerLiter: 13,
      unitPriceCents: 179,
    });
    expect(Number.isInteger(costCents)).toBe(true);
  });

  it('rifiuta un consumo non positivo', () => {
    expect(() =>
      tripCost({ distanceKm: 10, consumptionKmPerLiter: 0, unitPriceCents: 180 }),
    ).toThrow(TripError);
  });
});

describe('splitTripCost', () => {
  it('addebita tutto al guidatore se non ci sono passeggeri', () => {
    const shares = splitTripCost(1000, 'luca');
    expect(shares).toEqual(new Map([['luca', 1000]]));
  });

  it('divide tra i presenti conservando il totale', () => {
    const shares = splitTripCost(1000, 'luca', ['marco', 'nonna']);
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1000);
    expect(shares.size).toBe(3);
  });

  it('ignora il guidatore ripetuto tra i passeggeri', () => {
    const shares = splitTripCost(1000, 'luca', ['luca', 'marco']);
    expect(shares.size).toBe(2);
  });
});

describe('validateTrip', () => {
  const startedAt = new Date(2026, 6, 20, 10, 0);

  it('rifiuta km finali non superiori agli iniziali', () => {
    expect(() =>
      validateTrip({ startKm: 100, endKm: 100, startedAt, endedAt: new Date(2026, 6, 20, 11, 0) }),
    ).toThrow(TripError);
  });

  it('rifiuta una chiusura precedente all apertura', () => {
    expect(() =>
      validateTrip({ startKm: 100, endKm: 120, startedAt, endedAt: new Date(2026, 6, 20, 9, 0) }),
    ).toThrow(TripError);
  });

  it('non segnala nulla per una corsa normale', () => {
    expect(
      validateTrip({ startKm: 100, endKm: 172, startedAt, endedAt: new Date(2026, 6, 20, 12, 0) }),
    ).toEqual([]);
  });

  it('avvisa oltre i 1000 km e oltre i 200 km/h medi', () => {
    const warnings = validateTrip({
      startKm: 0,
      endKm: 1200,
      startedAt,
      endedAt: new Date(2026, 6, 20, 12, 0),
    });
    expect(warnings.map((w) => w.code)).toEqual(['implausible_distance', 'implausible_speed']);
  });
});
