'use client';

import { useEffect, useState } from 'react';
import { subscribeToPushAction, unsubscribeFromPushAction } from '@/app/actions';
import { usePushSupported, useStandalone } from '@/lib/offline/hooks';
import { ErrorBanner, SecondaryButton } from '@/components/ui';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

/**
 * Attiva le notifiche push.
 *
 * Su iPhone funzionano solo se l'app è stata aggiunta alla schermata Home da Safari
 * (iOS 16.4+): in un tab normale l'API non esiste proprio. Per questo, invece di un
 * pulsante che non fa niente, qui si spiega cosa fare.
 */
export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const supported = usePushSupported();
  const standalone = useStandalone();
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setEnabled(Boolean(subscription)));
  }, [supported]);

  if (!publicKey) {
    return (
      <p className="text-sm text-ink-dim">
        Notifiche non configurate sul server (mancano le chiavi VAPID).
      </p>
    );
  }

  if (!supported || !standalone) {
    return (
      <div className="rounded-2xl glass-2 px-4 py-3 text-sm text-ink-dim">
        <p className="text-ink">Per ricevere le notifiche, installa l’app.</p>
        <p className="mt-1">
          Su iPhone: apri questa pagina in Safari, tocca <strong>Condividi</strong> e poi{' '}
          <strong>Aggiungi alla schermata Home</strong>. Poi apri l’app dall’icona e torna qui.
        </p>
      </div>
    );
  }

  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();

      if (existing) {
        await unsubscribeFromPushAction(existing.endpoint);
        await existing.unsubscribe();
        setEnabled(false);
        return;
      }

      if ((await Notification.requestPermission()) !== 'granted') {
        setError('Permesso negato. Puoi riattivarlo dalle impostazioni del telefono.');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const result = await subscribeToPushAction(subscription.toJSON());
      if (result.error) {
        setError(result.error);
        return;
      }
      setEnabled(true);
    } catch {
      setError('Non sono riuscito ad attivare le notifiche.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <ErrorBanner>{error}</ErrorBanner>
      <SecondaryButton type="button" onClick={toggle} disabled={busy}>
        {enabled ? 'Disattiva le notifiche' : 'Attiva le notifiche'}
      </SecondaryButton>
      <p className="text-xs text-ink-dim">
        Reclami dei km non registrati, promemoria delle corse aperte, pareggi da confermare.
      </p>
    </div>
  );
}
