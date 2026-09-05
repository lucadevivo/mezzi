'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useOnline, useQueuedCount } from '@/lib/offline/hooks';
import { flush, initQueue } from '@/lib/offline/queue';

/**
 * Registra il service worker e fa partire la coda offline appena c'è rete.
 *
 * Lo stato è sempre visibile: sapere che una corsa è "in coda" e non "persa"
 * è la differenza tra fidarsi dell'app e riscrivere tutto a mano dopo.
 */
export function OfflineSync() {
  const router = useRouter();
  const online = useOnline();
  const queued = useQueuedCount();

  useEffect(() => {
    void initQueue();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Senza service worker l'app funziona lo stesso: si perde solo l'uso offline.
      });
    }
  }, []);

  useEffect(() => {
    if (!online || queued === 0) return;
    void flush().then(({ sent }) => {
      if (sent > 0) router.refresh();
    });
  }, [online, queued, router]);

  if (online && queued === 0) return null;

  return (
    <div
      role="status"
      className="mx-4 mb-2 rounded-2xl border border-amber/40 bg-amber/10 px-3 py-2 text-sm text-amber"
    >
      {!online ? 'Senza rete — quello che registri resta sul telefono. ' : ''}
      {queued > 0
        ? `${queued} ${queued === 1 ? 'operazione in coda' : 'operazioni in coda'}`
        : null}
    </div>
  );
}
