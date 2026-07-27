'use client';

/**
 * Corsa avviata senza rete.
 *
 * L'id della corsa lo genera il telefono, non il server: così si può anche chiuderla
 * offline, e quando la coda parte le due operazioni combaciano. Sta in localStorage
 * perché deve sopravvivere alla chiusura dell'app mentre sei in giro.
 */

import { PENDING_TRIP_EVENT } from './hooks';

const KEY = 'mezzi:pending-trip';

export interface PendingTrip {
  tripId: string;
  vehicleId: string;
  odometerStartKm: number;
  startedAt: string;
}

export function getPendingTrip(vehicleId: string): PendingTrip | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const trip = JSON.parse(raw) as PendingTrip;
    return trip.vehicleId === vehicleId ? trip : null;
  } catch {
    return null;
  }
}

export function setPendingTrip(trip: PendingTrip): void {
  localStorage.setItem(KEY, JSON.stringify(trip));
  notifyChanged();
}

export function clearPendingTrip(): void {
  localStorage.removeItem(KEY);
  notifyChanged();
}

/** `storage` non scatta nella scheda che scrive: l'evento lo mandiamo noi. */
function notifyChanged(): void {
  window.dispatchEvent(new Event(PENDING_TRIP_EVENT));
}
