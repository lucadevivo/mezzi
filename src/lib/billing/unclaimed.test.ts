import { describe, expect, it } from 'vitest';
import { claimDeadline, resolveUnclaimed, type ClaimResponse } from './unclaimed';

const detectedAt = new Date(2026, 6, 24, 18, 0);
const deadlineAt = claimDeadline(detectedAt);
const beforeDeadline = new Date(2026, 6, 25, 9, 0);
const afterDeadline = new Date(2026, 6, 27, 9, 0);

const members = ['luca', 'marco', 'giulia'];

function answer(userId: string, value: ClaimResponse['answer'], hours = 1): ClaimResponse {
  return {
    userId,
    answer: value,
    answeredAt: new Date(detectedAt.getTime() + hours * 3_600_000),
  };
}

function resolve(responses: ClaimResponse[], now: Date, detectedByUserId = 'luca') {
  return resolveUnclaimed({
    billableMemberIds: members,
    detectedByUserId,
    responses,
    deadlineAt,
    now,
  });
}

describe('resolveUnclaimed', () => {
  it('resta in attesa finché mancano più risposte', () => {
    expect(resolve([answer('luca', 'not_mine')], beforeDeadline)).toEqual({
      status: 'pending',
      awaiting: ['marco', 'giulia'],
      autoAssignCandidate: null,
    });
  });

  it('intesta la corsa a chi la reclama', () => {
    expect(resolve([answer('marco', 'mine')], beforeDeadline)).toEqual({
      status: 'claimed',
      chargedTo: ['marco'],
      reason: 'claimed',
    });
  });

  it('divide il costo se in due reclamano la stessa corsa', () => {
    const resolution = resolve(
      [answer('marco', 'mine'), answer('giulia', 'mine', 2)],
      beforeDeadline,
    );
    expect(resolution).toEqual({
      status: 'claimed',
      chargedTo: ['marco', 'giulia'],
      reason: 'claimed',
    });
  });

  it('propone l attribuzione automatica quando resta un solo silenzioso', () => {
    const resolution = resolve(
      [answer('luca', 'not_mine'), answer('marco', 'not_mine')],
      beforeDeadline,
    );
    expect(resolution).toEqual({
      status: 'pending',
      awaiting: ['giulia'],
      autoAssignCandidate: 'giulia',
    });
  });

  it('chiude per eliminazione se il silenzioso lascia scadere il termine', () => {
    const resolution = resolve(
      [answer('luca', 'not_mine'), answer('marco', 'not_mine')],
      afterDeadline,
    );
    expect(resolution).toEqual({ status: 'claimed', chargedTo: ['giulia'], reason: 'elimination' });
  });

  it('divide tra tutti tranne chi ha rilevato e negato, se negano tutti', () => {
    const resolution = resolve(
      [answer('luca', 'not_mine'), answer('marco', 'not_mine'), answer('giulia', 'not_mine')],
      beforeDeadline,
    );
    expect(resolution).toEqual({ status: 'split', chargedTo: ['marco', 'giulia'] });
  });

  it('divide tra tutti se nessuno risponde entro il termine', () => {
    expect(resolve([], afterDeadline)).toEqual({ status: 'split', chargedTo: members });
  });

  it('divide tra tutti se chi ha rilevato non è un membro fatturabile', () => {
    const resolution = resolve(
      [answer('marco', 'not_mine'), answer('giulia', 'not_mine'), answer('luca', 'not_mine')],
      afterDeadline,
      'nonna',
    );
    expect(resolution).toEqual({ status: 'split', chargedTo: members });
  });

  it('tiene buona l ultima risposta se un utente cambia idea', () => {
    const resolution = resolve(
      [answer('marco', 'mine', 1), answer('marco', 'not_mine', 3)],
      beforeDeadline,
    );
    expect(resolution.status).toBe('pending');
  });

  it('fissa il termine a 48 ore dal rilevamento', () => {
    expect(deadlineAt.getTime() - detectedAt.getTime()).toBe(48 * 3_600_000);
  });
});
