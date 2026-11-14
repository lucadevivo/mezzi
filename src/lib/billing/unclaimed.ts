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
 * Niente più divisione automatica: la corsa resta da reclamare finché qualcuno non la
 * prende («sono miei») o l'admin non la assegna. Non c'è un termine che la chiuda da sé.
 * Il solo caso che risolve qui è il reclamo esplicito; tutto il resto resta `pending`.
 * Quando resta un solo silenzioso lo si segnala come probabile autore (solo un suggerimento
 * per l'admin, nessun addebito automatico).
 */
export function resolveUnclaimed(input: ResolveUnclaimedInput): UnclaimedResolution {
  const members = [...new Set(input.billableMemberIds)];
  if (members.length === 0) {
    throw new Error('Corsa da reclamare senza membri fatturabili');
  }

  // A parità di utente vale l'ultima risposta data.
  const latest = new Map<UserId, ClaimResponse>();
  for (const response of [...input.responses].sort(
    (a, b) => a.answeredAt.getTime() - b.answeredAt.getTime(),
  )) {
    latest.set(response.userId, response);
  }

  const claimants = members.filter((id) => latest.get(id)?.answer === 'mine');
  if (claimants.length > 0) return { status: 'claimed', chargedTo: claimants, reason: 'claimed' };

  const awaiting = members.filter((id) => !latest.has(id));
  return { status: 'pending', awaiting, autoAssignCandidate: awaiting.length === 1 ? awaiting[0] : null };
}
