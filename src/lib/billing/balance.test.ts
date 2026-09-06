import { describe, expect, it } from 'vitest';
import {
  autonomyInTankKm,
  balances,
  distributeGuestKm,
  kmBought,
  ledgerTotalKm,
  refuelSuggestion,
} from './balance';
import { splitTripKm } from './trip';
import type { LedgerEntry } from './types';

function riga(userId: string, amountKm: number): LedgerEntry {
  return { userId, amountKm, type: 'consumption_charge', occurredAt: new Date(2026, 0, 1) };
}

describe('balances', () => {
  it('somma i chilometri per utente', () => {
    const risultato = balances([riga('u1', -50), riga('u2', -20), riga('u1', 300)]);
    expect(risultato.get('u1')).toBe(250);
    expect(risultato.get('u2')).toBe(-20);
  });

  it('non lascia code di virgola: i km stanno in decimi', () => {
    const risultato = balances([riga('u1', 0.1), riga('u1', 0.2)]);
    expect(risultato.get('u1')).toBe(0.3);
  });
});

describe('ledgerTotalKm', () => {
  it('vale i chilometri che il carburante nel serbatoio può ancora fare', () => {
    // Comprati 400 km, guidati 250: restano 150 km di autonomia pagata.
    const entries = [riga('u1', 400), riga('u1', -150), riga('u2', -100)];
    expect(ledgerTotalKm(entries)).toBe(150);
    expect(autonomyInTankKm(8.0645, 18.6)).toBeCloseTo(150, 0);
  });
});

describe('kmBought', () => {
  it('i litri diventano chilometri col consumo del mezzo', () => {
    expect(kmBought(9.4834, 18.6)).toBe(176.4);
  });
});

describe('refuelSuggestion', () => {
  it('in credito dice quanta autonomia resta', () => {
    const s = refuelSuggestion(122, 214, 18.6);
    expect(s.debtKm).toBe(0);
    expect(s.suggestedCents).toBe(0);
    expect(s.message).toContain('122 km');
  });

  it('in pari lo dice e basta', () => {
    expect(refuelSuggestion(0, 214, 18.6).message).toBe('Sei in pari.');
  });

  it('in debito converte i km in euro col prezzo di adesso, arrotondando ai 5 €', () => {
    // 186 km a 18,6 km/l fanno 10 litri: a 2,14 €/l sono 21,40 €, arrotondati a 25.
    const s = refuelSuggestion(-186, 214, 18.6);
    expect(s.debtKm).toBe(186);
    expect(s.suggestedCents).toBe(2500);
    expect(s.message).toContain('186 km');
  });
});

describe('splitTripKm', () => {
  it('divide i km tra chi era a bordo senza perderne per strada', () => {
    const quote = splitTripKm(100, 'guidatore', ['a', 'b']);
    const somma = [...quote.values()].reduce((x, y) => x + y, 0);
    expect(Math.round(somma * 10) / 10).toBe(100);
    expect(quote.size).toBe(3);
  });

  it('senza passeggeri i km sono tutti del guidatore', () => {
    expect(splitTripKm(41.3, 'guidatore').get('guidatore')).toBe(41.3);
  });
});

describe('distributeGuestKm', () => {
  it('prima tappa i buchi, in proporzione a quanto ognuno è indietro', () => {
    // 100 km comprati da papà, con 40 km di debiti in giro: 40 vanno a coprirli
    // (30 a chi è a −30, 10 a chi è a −10), i 60 che avanzano si dividono in tre.
    const quote = distributeGuestKm(100, new Map([['a', -30], ['b', -10], ['c', 50]]));
    expect(quote.get('a')).toBeCloseTo(30 + 20, 1);
    expect(quote.get('b')).toBeCloseTo(10 + 20, 1);
    expect(quote.get('c')).toBeCloseTo(20, 1);
    const somma = [...quote.values()].reduce((x, y) => x + y, 0);
    expect(Math.round(somma * 10) / 10).toBe(100);
  });

  it('se i debiti superano il regalo, si dividono in proporzione e basta', () => {
    const quote = distributeGuestKm(50, new Map([['a', -150], ['b', -50]]));
    expect(quote.get('a')).toBeCloseTo(37.5, 1);
    expect(quote.get('b')).toBeCloseTo(12.5, 1);
  });

  it('se sono tutti in pari, parti uguali', () => {
    const quote = distributeGuestKm(30, new Map([['a', 0], ['b', 10]]));
    expect(quote.get('a')).toBe(15);
    expect(quote.get('b')).toBe(15);
  });

  it('senza nessuno a cui darla, non inventa quote', () => {
    expect(distributeGuestKm(100, new Map()).size).toBe(0);
  });
});
