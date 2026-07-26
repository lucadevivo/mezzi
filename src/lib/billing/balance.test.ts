import { describe, expect, it } from 'vitest';
import { balances, ledgerTotal, refuelSuggestion, settlementPlan, unconsumedFuelValueCents } from './balance';
import type { LedgerEntry } from './types';

const at = new Date(2026, 6, 20);

function entry(userId: string, amountCents: number, type: LedgerEntry['type']): LedgerEntry {
  return { userId, amountCents, type, occurredAt: at };
}

describe('balances', () => {
  it('somma accrediti e addebiti per utente', () => {
    const result = balances([
      entry('luca', 5000, 'refuel_credit'),
      entry('luca', -1200, 'consumption_charge'),
      entry('marco', -3800, 'consumption_charge'),
    ]);
    expect(result.get('luca')).toBe(3800);
    expect(result.get('marco')).toBe(-3800);
  });
});

describe('ledgerTotal', () => {
  it('vale zero quando tutto il carburante pagato è stato consumato', () => {
    expect(
      ledgerTotal([
        entry('luca', 5000, 'refuel_credit'),
        entry('luca', -2500, 'consumption_charge'),
        entry('marco', -2500, 'consumption_charge'),
      ]),
    ).toBe(0);
  });

  it('vale il carburante pagato e non ancora bruciato', () => {
    expect(ledgerTotal([entry('luca', 5000, 'refuel_credit')])).toBe(5000);
  });
});

describe('unconsumedFuelValueCents', () => {
  it('valorizza i litri in serbatoio al prezzo medio ponderato', () => {
    expect(unconsumedFuelValueCents(27.5, 180)).toBe(4950);
  });
});

describe('refuelSuggestion', () => {
  it('traduce il debito in euro da mettere, arrotondati a 5', () => {
    const suggestion = refuelSuggestion(-2340, 180);
    expect(suggestion.debtCents).toBe(2340);
    expect(suggestion.suggestedCents).toBe(2500);
    expect(suggestion.message).toBe('Sei indietro di 23,40 € — al prossimo pieno metti circa 25,00 €.');
  });

  it('non arrotonda in eccesso un debito già multiplo di 5 euro', () => {
    expect(refuelSuggestion(-2000, 180).suggestedCents).toBe(2000);
  });

  it('non chiede niente a chi è in credito o in pari', () => {
    expect(refuelSuggestion(1500, 180).suggestedCents).toBe(0);
    expect(refuelSuggestion(0, 180).message).toBe('Sei in pari.');
  });
});

describe('settlementPlan', () => {
  it('azzera i saldi con i passaggi minimi', () => {
    const transfers = settlementPlan(
      new Map([
        ['luca', 3000],
        ['marco', -2000],
        ['giulia', -1000],
      ]),
    );
    expect(transfers).toEqual([
      { from: 'marco', to: 'luca', amountCents: 2000 },
      { from: 'giulia', to: 'luca', amountCents: 1000 },
    ]);
  });

  it('non propone niente se sono tutti in pari', () => {
    expect(settlementPlan(new Map([['luca', 0], ['marco', 0]]))).toEqual([]);
  });
});
