import { describe, expect, it } from 'vitest';
import { ExpenseError, splitExpense } from './expenses';

const memberIds = ['luca', 'marco', 'giulia'];

describe('splitExpense', () => {
  it('divide in parti uguali con la regola equal', () => {
    const shares = splitExpense({ amountCents: 30000, rule: 'equal', memberIds });
    expect([...shares.values()]).toEqual([10000, 10000, 10000]);
  });

  it('divide in proporzione ai km con la regola by_km', () => {
    const shares = splitExpense({
      amountCents: 30000,
      rule: 'by_km',
      memberIds,
      kmByUser: new Map([['luca', 500], ['marco', 300], ['giulia', 200]]),
    });
    expect(shares.get('luca')).toBe(15000);
    expect(shares.get('marco')).toBe(9000);
    expect(shares.get('giulia')).toBe(6000);
  });

  it('non addebita nessuno con la regola none', () => {
    expect(splitExpense({ amountCents: 30000, rule: 'none', memberIds }).size).toBe(0);
  });

  it('accetta quote custom solo se sommano alla spesa', () => {
    const customShares = new Map([['luca', 20000], ['marco', 10000]]);
    expect(splitExpense({ amountCents: 30000, rule: 'custom', memberIds, customShares }).get('luca')).toBe(
      20000,
    );
    expect(() =>
      splitExpense({
        amountCents: 30000,
        rule: 'custom',
        memberIds,
        customShares: new Map([['luca', 20000]]),
      }),
    ).toThrow(ExpenseError);
  });

  it('rifiuta by_km senza i km del periodo', () => {
    expect(() => splitExpense({ amountCents: 100, rule: 'by_km', memberIds })).toThrow(ExpenseError);
  });

  it('conserva sempre il totale', () => {
    const shares = splitExpense({
      amountCents: 10000,
      rule: 'by_km',
      memberIds,
      kmByUser: new Map([['luca', 1], ['marco', 1], ['giulia', 1]]),
    });
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(10000);
  });
});
