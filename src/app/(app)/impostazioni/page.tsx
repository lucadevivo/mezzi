import { PushToggle } from '@/components/push-toggle';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { publicVapidKey } from '@/lib/services/push';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const me = await requireUser();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-sm uppercase tracking-widest text-ink-dim">Notifiche</h1>
        <PushToggle publicKey={publicVapidKey()} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-ink-dim">Uso senza rete</h2>
        <Card className="px-4 py-3 text-sm text-ink-dim">
          <p className="text-ink">In garage il segnale spesso non c’è.</p>
          <p className="mt-1">
            Corse e rifornimenti registrati offline restano sul telefono e partono da soli appena
            torna la rete. Finché sono in coda lo vedi scritto in cima a ogni pagina.
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-ink-dim">Account</h2>
        <Card className="px-4 py-3">
          <p>{me.name}</p>
          <p className="text-sm text-ink-dim">{me.email}</p>
        </Card>
      </section>
    </div>
  );
}
