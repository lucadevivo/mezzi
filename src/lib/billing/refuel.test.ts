import { describe, expect, it } from 'vitest';
import { completeRefuelAmounts, RefuelError } from './refuel';

describe('completeRefuelAmounts', () => {
  it('ricava il totale da litri e prezzo al litro', () => {
    expect(completeRefuelAmounts({ liters: 30, pricePerLiterCents: 180 })).toEqual({
      liters: 30,
      pricePerLiterCents: 180,
      totalCents: 5400,
    });
  });

  it('ricava il prezzo al litro da litri e totale', () => {
    expect(completeRefuelAmounts({ liters: 30, totalCents: 5400 })).toEqual({
      liters: 30,
      pricePerLiterCents: 180,
      totalCents: 5400,
    });
  });

  it('ricava i litri da prezzo al litro e totale', () => {
    const result = completeRefuelAmounts({ pricePerLiterCents: 180, totalCents: 5400 });
    expect(result.liters).toBeCloseTo(30, 6);
  });

  it('non inventa niente con un solo valore', () => {
    expect(() => completeRefuelAmounts({ liters: 30 })).toThrow(RefuelError);
  });
});
