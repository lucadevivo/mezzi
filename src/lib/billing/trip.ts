import { roundCents, splitCentsAmong } from './money';
import type { Cents, UserId } from './types';

export class TripError extends Error {}

export interface TripCostInput {
  distanceKm: number;
  consumptionKmPerLiter: number;
  unitPriceCents: Cents;
}

export interface TripCost {
  litersEstimated: number;
  costCents: Cents;
}

/** km / (km/l) = litri; litri × prezzo = costo. Il costo esce già in centesimi interi. */
export function tripCost({
  distanceKm,
  consumptionKmPerLiter,
  unitPriceCents,
}: TripCostInput): TripCost {
  if (distanceKm < 0) throw new TripError(`Distanza negativa: ${distanceKm}`);
  if (consumptionKmPerLiter <= 0) {
    throw new TripError(`Consumo non valido: ${consumptionKmPerLiter} km/l`);
  }

  const litersEstimated = distanceKm / consumptionKmPerLiter;
  return { litersEstimated, costCents: roundCents(litersEstimated * unitPriceCents) };
}

/**
 * Ripartisce il costo di una corsa tra guidatore e passeggeri.
 * Di default nessun passeggero: chi guida paga tutto.
 * I passeggeri non fatturabili (ospiti, nonna) ricevono comunque la loro quota a ledger:
 * non ricade sul guidatore, così i km e gli euro restano tracciabili.
 */
export function splitTripCost(
  costCents: Cents,
  driverId: UserId,
  passengerIds: readonly UserId[] = [],
): Map<UserId, Cents> {
  const participants = [driverId, ...passengerIds.filter((id) => id !== driverId)];
  return splitCentsAmong(costCents, [...new Set(participants)]);
}

/**
 * Gli stessi km divisi tra chi era a bordo. Si lavora in **decimi di km** — la
 * risoluzione del contachilometri — così la somma delle quote fa esattamente i km
 * della corsa, che è l'invariante su cui si regge tutto (km attribuiti + km non
 * fatturabili = km reali del mezzo).
 */
export function splitTripKm(
  distanceKm: number,
  driverId: UserId,
  passengerIds: readonly UserId[] = [],
): Map<UserId, number> {
  const participants = [...new Set([driverId, ...passengerIds.filter((id) => id !== driverId)])];
  const decimi = splitCentsAmong(Math.round(distanceKm * 10), participants);
  return new Map([...decimi].map(([id, parte]) => [id, parte / 10]));
}

export interface OdometerCheck {
  startKm: number;
  endKm: number;
  startedAt: Date;
  endedAt: Date;
}

export type TripWarning =
  | { code: 'implausible_distance'; distanceKm: number }
  | { code: 'implausible_speed'; averageKmH: number };

export const MAX_PLAUSIBLE_DISTANCE_KM = 1000;
export const MAX_PLAUSIBLE_AVERAGE_KMH = 200;

/**
 * Validazioni della Sezione 4.6. Gli errori bloccano, i warning richiedono solo
 * una conferma esplicita dell'utente (potrebbe davvero aver fatto 1.100 km).
 */
export function validateTrip(check: OdometerCheck): TripWarning[] {
  const { startKm, endKm, startedAt, endedAt } = check;

  if (endKm <= startKm) {
    throw new TripError(`I km finali (${endKm}) devono superare quelli iniziali (${startKm})`);
  }
  if (endedAt.getTime() < startedAt.getTime()) {
    throw new TripError('La chiusura della corsa precede la sua apertura');
  }

  const warnings: TripWarning[] = [];
  const distanceKm = endKm - startKm;
  if (distanceKm > MAX_PLAUSIBLE_DISTANCE_KM) {
    warnings.push({ code: 'implausible_distance', distanceKm });
  }

  const hours = (endedAt.getTime() - startedAt.getTime()) / 3_600_000;
  if (hours > 0) {
    const averageKmH = distanceKm / hours;
    if (averageKmH > MAX_PLAUSIBLE_AVERAGE_KMH) {
      warnings.push({ code: 'implausible_speed', averageKmH });
    }
  }

  return warnings;
}
