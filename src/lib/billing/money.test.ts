import { describe, expect, it } from 'vitest';
import { formatEuro, MoneyError, roundCents, splitCents, splitCentsAmong, splitCentsByWeight } from './money';

describe('roundCents', () => {
  it('arrotonda half-up in modo simmetrico sui negativi', () => {
    expect(roundCents(10.5)).toBe(11);
    expect(roundCents(-10.5)).toBe(-11);
    expect(roundCents(10.4)).toBe(10);
  });

  it('rifiuta valori non finiti', () => {
    expect(() => roundCents(Number.NaN)).toThrow(MoneyError);
  });
});

describe('splitCents', () => {
  it('distribuisce il resto senza perdere centesimi', () => {
    const parts = splitCents(1000, 3);
    expect(parts).toEqual([334, 333, 333]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('mantiene la somma esatta anche sui negativi', () => {
    const parts = splitCents(-1000, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000);
  });

  it('rifiuta un numero di quote non valido', () => {
    expect(() => splitCents(100, 0)).toThrow(MoneyError);
  });
});

describe('splitCentsByWeight', () => {
  it('divide in proporzione ai km percorsi', () => {
    const shares = splitCentsByWeight(30000, new Map([['a', 100], ['b', 200]]));
    expect(shares.get('a')).toBe(10000);
    expect(shares.get('b')).toBe(20000);
  });

  it('assegna i resti a chi ha la frazione più alta e conserva il totale', () => {
    const shares = splitCentsByWeight(1000, new Map([['a', 1], ['b', 1], ['c', 1]]));
    expect([...shares.values()].reduce((a, b) => a + b, 0)).toBe(1000);
  });

  it('ricade sulle parti uguali se nessuno ha percorso km', () => {
    const shares = splitCentsByWeight(900, new Map([['a', 0], ['b', 0]]));
    expect(shares.get('a')).toBe(450);
    expect(shares.get('b')).toBe(450);
  });
});

describe('formatEuro', () => {
  it('usa la virgola come separatore decimale', () => {
    expect(formatEuro(2340)).toBe('23,40 €');
  });
});

describe('splitCentsAmong', () => {
  it('rifiuta la ripartizione senza destinatari', () => {
    expect(() => splitCentsAmong(100, [])).toThrow(MoneyError);
  });
});
