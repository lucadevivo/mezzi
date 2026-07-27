import { describe, expect, it } from 'vitest';
import { centsToEuro, toCsv } from './csv';

describe('toCsv', () => {
  it('separa con punto e virgola e mette la virgola sui decimali', () => {
    const csv = toCsv(['mezzo', 'costo'], [['Fiesta', 11.25]]);
    expect(csv).toContain('mezzo;costo');
    expect(csv).toContain('Fiesta;11,25');
  });

  it('protegge i campi che contengono il separatore o le virgolette', () => {
    const csv = toCsv(['nota'], [['gita a Ostia; con "soste"']]);
    expect(csv).toContain('"gita a Ostia; con ""soste"""');
  });

  it('esporta le date in formato ISO senza orario', () => {
    expect(toCsv(['data'], [[new Date(Date.UTC(2026, 6, 27))]])).toContain('2026-07-27');
  });

  it('lascia vuote le celle senza valore', () => {
    expect(toCsv(['a', 'b'], [[null, undefined]])).toContain(';');
  });

  it('comincia col BOM, altrimenti Excel storpia gli accenti', () => {
    expect(toCsv(['città'], [])).toMatch(/^﻿/);
  });
});

describe('centsToEuro', () => {
  it('converte i centesimi in euro e lascia stare i vuoti', () => {
    expect(centsToEuro(1125)).toBe(11.25);
    expect(centsToEuro(null)).toBeNull();
  });
});
