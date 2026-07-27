'use client';

import { useSyncExternalStore } from 'react';
import type { PendingTrip } from './pending-trip';
import { getQueuedCount, subscribeQueue } from './queue';

/**
 * Stato del browser letto come si deve: `useSyncExternalStore` è l'API pensata
 * per sincronizzare React con qualcosa che vive fuori (rete, localStorage, media query),
 * e non ha il problema di render a cascata di un `setState` dentro un effetto.
 */

const PENDING_TRIP_KEY = 'mezzi:pending-trip';
export const PENDING_TRIP_EVENT = 'mezzi:pending-trip-changed';

function subscribeOnline(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

/** Sul server si assume "online": l'HTML iniziale non deve gridare che manca la rete. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

function subscribePendingTrip(onChange: () => void) {
  window.addEventListener(PENDING_TRIP_EVENT, onChange);
  // `storage` scatta se l'app è aperta in due schede: restano allineate.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(PENDING_TRIP_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

/**
 * La corsa avviata senza rete. Lo snapshot è la stringa grezza di localStorage,
 * non l'oggetto: React confronta per identità, e un nuovo oggetto a ogni lettura
 * manderebbe il componente in loop.
 */
export function usePendingTrip(vehicleId: string): PendingTrip | null {
  const raw = useSyncExternalStore(
    subscribePendingTrip,
    () => localStorage.getItem(PENDING_TRIP_KEY),
    () => null,
  );

  if (!raw) return null;
  try {
    const trip = JSON.parse(raw) as PendingTrip;
    return trip.vehicleId === vehicleId ? trip : null;
  } catch {
    return null;
  }
}

function subscribeStandalone(onChange: () => void) {
  const query = window.matchMedia('(display-mode: standalone)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Su iPhone il push esiste solo se l'app è stata aggiunta alla schermata Home. */
export function useStandalone(): boolean {
  return useSyncExternalStore(
    subscribeStandalone,
    () =>
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true,
    () => true,
  );
}

/** Quante operazioni aspettano di partire. Zero durante il render sul server. */
export function useQueuedCount(): number {
  return useSyncExternalStore(subscribeQueue, getQueuedCount, () => 0);
}

export function usePushSupported(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => 'serviceWorker' in navigator && 'PushManager' in window,
    () => true,
  );
}
