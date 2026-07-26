import type { UserId } from './types';

export class DiscrepancyError extends Error {}

export interface OpenTripRef {
  id: string;
  userId: UserId;
  startedAt: Date;
}

export interface DiscrepancyInput {
  /** Ultimo contachilometri salvato per il mezzo. */
  savedOdometerKm: number;
  /** Contachilometri appena letto sul cruscotto: l'unica fonte di verità. */
  realOdometerKm: number;
  /** Oltre questa differenza si apre una corsa da reclamare. */
  thresholdKm: number;
  /** Km di rumore accumulati e non ancora attribuiti a nessuno. */
  driftBufferKm: number;
  /** Corsa eventualmente rimasta aperta sul mezzo. */
  openTrip?: OpenTripRef | null;
  /** Ultimo evento registrato sul mezzo: apre la finestra temporale del reclamo. */
  lastEventAt: Date;
  now: Date;
  /**
   * Oltre questo tempo una corsa aperta non assorbe più il delta: dopo tre giorni
   * i km sul mezzo possono essere di chiunque, non solo di chi ha dimenticato aperta la corsa.
   */
  openTripAbsorbHours?: number;
}

export const DEFAULT_OPEN_TRIP_ABSORB_HOURS = 24;

export type DiscrepancyOutcome =
  /** Nessuna differenza: si può procedere. */
  | { kind: 'no_change'; driftBufferKm: number }
  /** Contachilometri che torna indietro: errore di battitura o correzione da admin. */
  | { kind: 'negative_delta'; deltaKm: number }
  /** C'è una corsa aperta abbastanza recente: i km sono probabilmente suoi, ma va confermato. */
  | { kind: 'propose_close_open_trip'; openTrip: OpenTripRef; deltaKm: number }
  /** Rumore sotto soglia: si accumula in silenzio, senza disturbare nessuno. */
  | { kind: 'drift_absorbed'; deltaKm: number; driftBufferKm: number }
  /** Km di cui non si sa niente: si apre una corsa da reclamare. */
  | {
      kind: 'unclaimed_trip';
      distanceKm: number;
      driftBufferKm: 0;
      windowStartAt: Date;
      windowEndAt: Date;
    };

/**
 * Valuta la lettura del contachilometri secondo la Sezione 4.5 della spec.
 * L'ordine dei casi è vincolante e non va invertito.
 *
 * I km del drift buffer confluiscono nella corsa da reclamare quando questa si apre:
 * sono km reali che qualcuno ha percorso, e devono restare dentro l'invariante
 * "km attribuiti + km non fatturabili = km reali del mezzo".
 */
export function evaluateOdometerReading(input: DiscrepancyInput): DiscrepancyOutcome {
  const {
    savedOdometerKm,
    realOdometerKm,
    thresholdKm,
    driftBufferKm,
    openTrip,
    lastEventAt,
    now,
    openTripAbsorbHours = DEFAULT_OPEN_TRIP_ABSORB_HOURS,
  } = input;

  if (thresholdKm < 0) throw new DiscrepancyError(`Soglia negativa: ${thresholdKm}`);
  if (driftBufferKm < 0) throw new DiscrepancyError(`Drift buffer negativo: ${driftBufferKm}`);

  const deltaKm = realOdometerKm - savedOdometerKm;

  if (deltaKm < 0) return { kind: 'negative_delta', deltaKm };
  if (deltaKm === 0) return { kind: 'no_change', driftBufferKm };

  if (openTrip) {
    const ageHours = (now.getTime() - openTrip.startedAt.getTime()) / 3_600_000;
    if (ageHours <= openTripAbsorbHours) {
      return { kind: 'propose_close_open_trip', openTrip, deltaKm };
    }
  }

  const unclaimed = (distanceKm: number): DiscrepancyOutcome => ({
    kind: 'unclaimed_trip',
    distanceKm,
    driftBufferKm: 0,
    windowStartAt: lastEventAt,
    windowEndAt: now,
  });

  if (deltaKm > thresholdKm) return unclaimed(deltaKm + driftBufferKm);

  const buffer = driftBufferKm + deltaKm;
  return buffer > thresholdKm
    ? unclaimed(buffer)
    : { kind: 'drift_absorbed', deltaKm, driftBufferKm: buffer };
}
