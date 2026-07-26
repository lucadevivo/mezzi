import { describe, expect, it } from 'vitest';
import { DiscrepancyError, evaluateOdometerReading, type DiscrepancyInput } from './discrepancy';

const now = new Date(2026, 6, 24, 18, 0);
const lastEventAt = new Date(2026, 6, 20, 9, 0);

function read(overrides: Partial<DiscrepancyInput> = {}) {
  return evaluateOdometerReading({
    savedOdometerKm: 100_000,
    realOdometerKm: 100_000,
    thresholdKm: 5,
    driftBufferKm: 0,
    openTrip: null,
    lastEventAt,
    now,
    ...overrides,
  });
}

describe('evaluateOdometerReading', () => {
  it('non fa niente se il contachilometri combacia', () => {
    expect(read()).toEqual({ kind: 'no_change', driftBufferKm: 0 });
  });

  it('rifiuta un delta negativo invece di inventarsi una corsa', () => {
    expect(read({ realOdometerKm: 99_990 })).toEqual({ kind: 'negative_delta', deltaKm: -10 });
  });

  it('propone di chiudere la corsa aperta recente, senza addebitare d ufficio', () => {
    const openTrip = { id: 't1', userId: 'luca', startedAt: new Date(2026, 6, 24, 15, 0) };
    const outcome = read({ realOdometerKm: 100_072, openTrip });
    expect(outcome).toEqual({ kind: 'propose_close_open_trip', openTrip, deltaKm: 72 });
  });

  it('non lascia che una corsa dimenticata aperta si prenda i km di tutti', () => {
    const openTrip = { id: 't1', userId: 'luca', startedAt: new Date(2026, 6, 21, 8, 0) };
    const outcome = read({ realOdometerKm: 100_400, openTrip });
    expect(outcome.kind).toBe('unclaimed_trip');
  });

  it('assorbe in silenzio il rumore sotto soglia', () => {
    expect(read({ realOdometerKm: 100_003 })).toEqual({
      kind: 'drift_absorbed',
      deltaKm: 3,
      driftBufferKm: 3,
    });
  });

  it('apre una corsa da reclamare quando il rumore accumulato supera la soglia', () => {
    const outcome = read({ realOdometerKm: 100_003, driftBufferKm: 3 });
    expect(outcome).toEqual({
      kind: 'unclaimed_trip',
      distanceKm: 6,
      driftBufferKm: 0,
      windowStartAt: lastEventAt,
      windowEndAt: now,
    });
  });

  it('include il rumore accumulato nella corsa da reclamare: nessun km si perde', () => {
    const outcome = read({ realOdometerKm: 100_072, driftBufferKm: 4 });
    expect(outcome).toMatchObject({ kind: 'unclaimed_trip', distanceKm: 76, driftBufferKm: 0 });
  });

  it('porta con sé la finestra temporale in cui la corsa è avvenuta', () => {
    const outcome = read({ realOdometerKm: 100_072 });
    expect(outcome).toMatchObject({ windowStartAt: lastEventAt, windowEndAt: now });
  });

  it('rifiuta parametri incoerenti', () => {
    expect(() => read({ thresholdKm: -1 })).toThrow(DiscrepancyError);
    expect(() => read({ driftBufferKm: -1 })).toThrow(DiscrepancyError);
  });
});
