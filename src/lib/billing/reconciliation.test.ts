import { describe, expect, it } from 'vitest';
import { reconcileConsumption } from './reconciliation';

const price = 180;

describe('reconcileConsumption', () => {
  it('addebita la differenza quando il consumo reale è peggiore della stima', () => {
    const result = reconcileConsumption({
      chargedLitersByUser: new Map([
        ['luca', 20],
        ['matteo', 20],
      ]),
      actualLiters: 44, // 4 litri in più di quelli addebitati
      unitPriceCents: price,
    });

    expect(result.deltaLiters).toBeCloseTo(4, 6);
    expect(result.adjustments.get('luca')).toBe(-360);
    expect(result.adjustments.get('matteo')).toBe(-360);
  });

  it('rimborsa quando il mezzo consuma meno di quanto stimato', () => {
    const result = reconcileConsumption({
      chargedLitersByUser: new Map([['luca', 30]]),
      actualLiters: 27,
      unitPriceCents: price,
    });

    expect(result.adjustments.get('luca')).toBe(540);
  });

  it('divide in proporzione a quanto ha consumato ciascuno', () => {
    const result = reconcileConsumption({
      chargedLitersByUser: new Map([
        ['luca', 30],
        ['matteo', 10],
      ]),
      actualLiters: 44,
      unitPriceCents: price,
    });

    expect(result.adjustments.get('luca')).toBe(-540);
    expect(result.adjustments.get('matteo')).toBe(-180);
  });

  it('non tocca niente se la stima era esatta', () => {
    const result = reconcileConsumption({
      chargedLitersByUser: new Map([['luca', 40]]),
      actualLiters: 40,
      unitPriceCents: price,
    });

    expect(result.adjustments.size).toBe(0);
    expect(result.skipped).toBeNull();
  });

  it('si ferma davanti a uno scostamento assurdo: è un pieno che pieno non era', () => {
    const result = reconcileConsumption({
      chargedLitersByUser: new Map([['luca', 40]]),
      actualLiters: 5,
      unitPriceCents: price,
    });

    expect(result.skipped).toBe('implausible');
    expect(result.adjustments.size).toBe(0);
  });

  it('non fa niente senza corse da riconciliare', () => {
    expect(
      reconcileConsumption({
        chargedLitersByUser: new Map(),
        actualLiters: 40,
        unitPriceCents: price,
      }).skipped,
    ).toBe('no_data');
  });

  it('le rettifiche sommano esattamente alla differenza in euro', () => {
    const result = reconcileConsumption({
      chargedLitersByUser: new Map([
        ['luca', 10],
        ['matteo', 10],
        ['gabriele', 10],
      ]),
      actualLiters: 31,
      unitPriceCents: 179,
    });

    const total = [...result.adjustments.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(-179);
  });
});
