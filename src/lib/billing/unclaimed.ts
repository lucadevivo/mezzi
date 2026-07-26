import type { UserId } from './types';

export type ClaimAnswer = 'mine' | 'not_mine';

export interface ClaimResponse {
  userId: UserId;
  answer: ClaimAnswer;
  answeredAt: Date;
}

export interface ResolveUnclaimedInput {
  /** Membri fatturabili del mezzo: sono gli unici che possono reclamare o pagare. */
  billableMemberIds: readonly UserId[];
  /** Chi ha rilevato la discrepanza. */
  detectedByUserId: UserId;
  responses: readonly ClaimResponse[];
  /** Termine entro cui rispondere (default 48h dal rilevamento). */
  deadlineAt: Date;
  now: Date;
}

export const DEFAULT_CLAIM_DEADLINE_HOURS = 48;

export type UnclaimedResolution =
  /** Si aspettano ancora risposte. */
  | { status: 'pending'; awaiting: UserId[]; autoAssignCandidate: UserId | null }
  /** Qualcuno ha detto "sono miei": il costo va a chi ha reclamato (diviso, se in più). */
  | { status: 'claimed'; chargedTo: UserId[]; reason: 'claimed' | 'elimination' }
  /** Nessuno se li prende: si divide tra i membri fatturabili. */
  | { status: 'split'; chargedTo: UserId[] };

export function claimDeadline(detectedAt: Date, hours = DEFAULT_CLAIM_DEADLINE_HOURS): Date {
  return new Date(detectedAt.getTime() + hours * 3_600_000);
}

/**
 * Macchina a stati della corsa da reclamare (Sezione 4.5).
 *
 * Sullo split: chi ha rilevato la discrepanza ed è l'unico ad averla dichiarata non sua
 * viene escluso dalla divisione. È voluto ed è il deterrente: chi si accorge del problema
 * e lo segnala non ci rimette. Se questo lascia l'insieme vuoto, pagano tutti.
 */
export function resolveUnclaimed(input: ResolveUnclaimedInput): UnclaimedResolution {
  const { billableMemberIds, detectedByUserId, responses, deadlineAt, now } = input;

  const members = [...new Set(billableMemberIds)];
  if (members.length === 0) {
    throw new Error('Corsa da reclamare senza membri fatturabili');
  }

  // A parità di utente vale l'ultima risposta data.
  const latest = new Map<UserId, ClaimResponse>();
  for (const response of [...responses].sort(
    (a, b) => a.answeredAt.getTime() - b.answeredAt.getTime(),
  )) {
    latest.set(response.userId, response);
  }

  const claimants = members.filter((id) => latest.get(id)?.answer === 'mine');
  if (claimants.length > 0) return { status: 'claimed', chargedTo: claimants, reason: 'claimed' };

  const awaiting = members.filter((id) => !latest.has(id));
  const expired = now.getTime() >= deadlineAt.getTime();

  // Eliminazione: se resta un solo membro che non ha risposto, la corsa è verosimilmente sua.
  // Gli si propone l'attribuzione e, se lascia scadere il termine senza contestare, gli viene addebitata.
  if (awaiting.length === 1) {
    return expired
      ? { status: 'claimed', chargedTo: awaiting, reason: 'elimination' }
      : { status: 'pending', awaiting, autoAssignCandidate: awaiting[0] };
  }

  if (awaiting.length > 1 && !expired) {
    return { status: 'pending', awaiting, autoAssignCandidate: null };
  }

  const detectorDenied = latest.get(detectedByUserId)?.answer === 'not_mine';
  const withoutDetector = members.filter((id) => id !== detectedByUserId);
  const chargedTo = detectorDenied && withoutDetector.length > 0 ? withoutDetector : members;

  return { status: 'split', chargedTo };
}
