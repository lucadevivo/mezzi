import { describe, expect, it } from 'vitest';
import { deadlineMessage, deadlineStatus } from './deadlines';

const now = new Date(2026, 6, 27);
const inDays = (days: number) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

const base = { currentOdometerKm: 100_000, notifyDaysBefore: 15, now };

describe('deadlineStatus', () => {
  it('sta zitta finché la scadenza è lontana', () => {
    expect(deadlineStatus({ ...base, dueDate: inDays(60) }).state).toBe('ok');
  });

  it('avvisa quando si entra nella finestra configurata', () => {
    expect(deadlineStatus({ ...base, dueDate: inDays(10) }).state).toBe('soon');
  });

  it('segnala le scadenze passate', () => {
    const status = deadlineStatus({ ...base, dueDate: inDays(-3) });
    expect(status.state).toBe('overdue');
    expect(status.daysLeft).toBe(-3);
  });

  it('gestisce il tagliando a chilometri', () => {
    expect(deadlineStatus({ ...base, dueOdometerKm: 100_300 }).state).toBe('soon');
    expect(deadlineStatus({ ...base, dueOdometerKm: 105_000 }).state).toBe('ok');
    expect(deadlineStatus({ ...base, dueOdometerKm: 99_000 }).state).toBe('overdue');
  });

  it('con entrambi i criteri vince il più vicino', () => {
    // Data lontana, ma i km sono quasi finiti: è quello che scatta davvero.
    const status = deadlineStatus({ ...base, dueDate: inDays(300), dueOdometerKm: 100_100 });
    expect(status.state).toBe('soon');
    expect(status.kmLeft).toBe(100);
    expect(status.daysLeft).toBe(300);
  });

  it('non inventa scadenze se non ne ha nessuna', () => {
    expect(deadlineStatus(base).state).toBe('ok');
  });
});

describe('deadlineMessage', () => {
  it('dice quanto manca, non solo che manca', () => {
    expect(deadlineMessage(deadlineStatus({ ...base, dueDate: inDays(10) }))).toBe(
      'mancano 10 giorni',
    );
    expect(deadlineMessage(deadlineStatus({ ...base, dueOdometerKm: 100_200 }))).toBe(
      'mancano 200 km',
    );
    expect(deadlineMessage(deadlineStatus({ ...base, dueDate: inDays(-1) }))).toBe(
      'scaduta da 1 giorno',
    );
  });

  it('unisce i due criteri quando ci sono entrambi', () => {
    expect(
      deadlineMessage(deadlineStatus({ ...base, dueDate: inDays(20), dueOdometerKm: 100_400 })),
    ).toBe('mancano 20 giorni o 400 km');
  });
});
