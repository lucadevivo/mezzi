const KM = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const EURO = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const LITERS = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Rome',
});
const DAY = new Intl.DateTimeFormat('it-IT', {
  day: 'numeric',
  month: 'long',
  timeZone: 'Europe/Rome',
});

export const formatKm = (km: number) => `${KM.format(km)} km`;
export const formatEuro = (cents: number) => EURO.format(cents / 100);
export const formatLiters = (liters: number) => `${LITERS.format(liters)} l`;
export const formatDateTime = (date: Date) => DATE.format(date);
export const formatDay = (date: Date) => DAY.format(date);

/** "3 ore fa", "2 giorni fa": in garage conta da quanto, non il timestamp. */
export function formatSince(date: Date, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000);
  if (minutes < 1) return 'adesso';
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'ora' : 'ore'} fa`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'giorno' : 'giorni'} fa`;
}

/** Countdown del termine di reclamo: quanto manca prima che scatti l'attribuzione. */
export function formatRemaining(deadline: Date, now = new Date()): string {
  const minutes = Math.floor((deadline.getTime() - now.getTime()) / 60000);
  if (minutes <= 0) return 'termine scaduto';
  const hours = Math.floor(minutes / 60);
  if (hours < 1) return `${minutes} min`;
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} giorni`;
}

/**
 * La lancetta del serbatoio a parole. Gli ottavi sono le tacche che si vedono
 * davvero sul cruscotto: dire "0,63" a chi guarda uno strumento analogico
 * sarebbe una precisione finta.
 */
export function formatTank(fraction: number | null): string {
  if (fraction === null) return 'non guardata';
  if (fraction >= 1) return 'pieno';
  if (fraction <= 0) return 'in riserva';
  const eighths = Math.round(fraction * 8);
  if (eighths === 4) return 'mezzo serbatoio';
  if (eighths === 0) return 'quasi in riserva';
  return `${eighths}/8`;
}
