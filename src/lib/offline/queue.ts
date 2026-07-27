'use client';

/**
 * Coda locale delle operazioni fatte senza rete.
 *
 * In garage il segnale spesso non c'è, ma la corsa va registrata lì, non dopo:
 * se aspetti di uscire, te ne dimentichi. Le operazioni restano su IndexedDB
 * (sopravvive alla chiusura dell'app) e partono da sole quando la rete torna.
 *
 * IndexedDB a mano invece di una libreria: servono tre operazioni in croce.
 */

const DB_NAME = 'mezzi-offline';
const STORE = 'operations';
const VERSION = 1;

export type QueuedKind = 'start_trip' | 'close_trip' | 'refuel';

export interface QueuedOp {
  /** Generato sul telefono: è quello che rende la sincronizzazione ripetibile senza doppioni. */
  id: string;
  kind: QueuedKind;
  payload: Record<string, unknown>;
  /** Quando l'utente l'ha fatta davvero, non quando è arrivata al server. */
  occurredAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transact<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
      }),
  );
}

/* --------------------------- store per la UI -------------------------------- */

/**
 * La coda è uno store esterno a React: qui si tiene un conteggio sincrono
 * (IndexedDB è asincrono, `useSyncExternalStore` no) aggiornato a ogni scrittura.
 */
const QUEUE_EVENT = 'mezzi:queue-changed';
let cachedCount = 0;

export const getQueuedCount = () => cachedCount;

export function subscribeQueue(onChange: () => void): () => void {
  window.addEventListener(QUEUE_EVENT, onChange);
  return () => window.removeEventListener(QUEUE_EVENT, onChange);
}

async function refreshCount(): Promise<void> {
  const next = (await listQueued()).length;
  if (next === cachedCount) return;
  cachedCount = next;
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export function enqueue(kind: QueuedKind, payload: Record<string, unknown>): Promise<QueuedOp> {
  const op: QueuedOp = {
    id: crypto.randomUUID(),
    kind,
    payload,
    occurredAt: new Date().toISOString(),
  };
  return transact('readwrite', (store) => store.add(op))
    .then(refreshCount)
    .then(() => op);
}

export function listQueued(): Promise<QueuedOp[]> {
  return transact<QueuedOp[]>('readonly', (store) => store.getAll());
}

export function remove(id: string): Promise<void> {
  return transact('readwrite', (store) => store.delete(id)).then(() => undefined);
}

export interface FlushResult {
  sent: number;
  failed: number;
}

/**
 * Manda al server tutto quello che è in coda. Le operazioni che il server rifiuta
 * per un motivo suo (contachilometri che torna indietro, corsa già chiusa) escono
 * comunque dalla coda: ritentarle all'infinito non le farebbe mai passare.
 */
export async function flush(): Promise<FlushResult> {
  // In ordine di quando è successo: una corsa va aperta prima di poterla chiudere.
  const queued = (await listQueued()).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  if (queued.length === 0) return { sent: 0, failed: 0 };

  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operations: queued }),
  });

  if (!response.ok) return { sent: 0, failed: queued.length };

  const { results } = (await response.json()) as {
    results: { id: string; ok: boolean; permanent?: boolean }[];
  };

  let sent = 0;
  let failed = 0;
  for (const result of results) {
    if (result.ok || result.permanent) {
      await remove(result.id);
      if (result.ok) sent += 1;
      else failed += 1;
    } else {
      failed += 1;
    }
  }

  await refreshCount();
  return { sent, failed };
}

/** Da chiamare una volta all'avvio: allinea il conteggio a quello che c'è su disco. */
export const initQueue = refreshCount;
