export type DeadlineState = 'ok' | 'soon' | 'overdue';

export interface DeadlineInput {
  /** Scadenza a calendario: assicurazione, bollo, revisione. */
  dueDate?: Date | null;
  /** Scadenza a chilometri: il tagliando non guarda il calendario. */
  dueOdometerKm?: number | null;
  currentOdometerKm: number;
  notifyDaysBefore: number;
  /** Quanti km prima cominciare ad avvisare per le scadenze a chilometraggio. */
  notifyKmBefore?: number;
  now: Date;
}

export interface DeadlineStatus {
  state: DeadlineState;
  daysLeft: number | null;
  kmLeft: number | null;
}

export const DEFAULT_NOTIFY_KM_BEFORE = 500;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Giorni di calendario, non blocchi di 24 ore: una scadenza il primo agosto, guardata
 * il 27 luglio, deve dire "mancano 5 giorni" a qualsiasi ora del giorno la si guardi.
 * `round` invece di `floor` per non sbagliare nei giorni del cambio d'ora.
 */
function calendarDaysBetween(from: Date, to: Date): number {
  const startOfDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY_MS);
}

/**
 * Quanto manca a una scadenza, e se è il caso di dirlo.
 *
 * Una scadenza può avere entrambi i criteri (un tagliando "entro un anno o 15.000 km"):
 * in quel caso vince il più vicino, perché è quello che scatta davvero.
 */
export function deadlineStatus(input: DeadlineInput): DeadlineStatus {
  const notifyKmBefore = input.notifyKmBefore ?? DEFAULT_NOTIFY_KM_BEFORE;

  const daysLeft = input.dueDate ? calendarDaysBetween(input.now, input.dueDate) : null;
  const kmLeft = input.dueOdometerKm != null ? input.dueOdometerKm - input.currentOdometerKm : null;

  const states: DeadlineState[] = [];
  if (daysLeft !== null) {
    states.push(daysLeft < 0 ? 'overdue' : daysLeft <= input.notifyDaysBefore ? 'soon' : 'ok');
  }
  if (kmLeft !== null) {
    states.push(kmLeft < 0 ? 'overdue' : kmLeft <= notifyKmBefore ? 'soon' : 'ok');
  }

  const state: DeadlineState = states.includes('overdue')
    ? 'overdue'
    : states.includes('soon')
      ? 'soon'
      : 'ok';

  return { state, daysLeft, kmLeft };
}

/** Frase da mostrare e da mandare per notifica: dice quanto manca, non solo che manca. */
export function deadlineMessage(status: DeadlineStatus): string {
  const { state, daysLeft, kmLeft } = status;

  if (state === 'overdue') {
    if (daysLeft !== null && daysLeft < 0) {
      const days = Math.abs(daysLeft);
      return `scaduta da ${days} ${days === 1 ? 'giorno' : 'giorni'}`;
    }
    return `superata di ${Math.abs(kmLeft ?? 0)} km`;
  }

  const parts: string[] = [];
  if (daysLeft !== null) parts.push(`${daysLeft} ${daysLeft === 1 ? 'giorno' : 'giorni'}`);
  if (kmLeft !== null) parts.push(`${kmLeft} km`);
  return parts.length > 0 ? `mancano ${parts.join(' o ')}` : 'nessuna scadenza impostata';
}
