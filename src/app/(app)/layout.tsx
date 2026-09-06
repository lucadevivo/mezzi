import Link from 'next/link';
import { OfflineSync } from '@/components/offline-sync';
import { TabBar } from '@/components/tab-bar';
import { requireUser } from '@/lib/auth/session';
import { scheduleMaintenance } from '@/lib/services/maintenance';
import { listPendingUnclaimed } from '@/lib/services/unclaimed';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Parte in sottofondo e non blocca la pagina: le push verso Apple e Google sono
  // richieste di rete, e aspettarle rendeva lento ogni cambio di sezione.
  scheduleMaintenance();

  const pendingClaims = listPendingUnclaimed().length;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      {/*
        Titolone iOS invece della riga di link: la navigazione è scesa in fondo,
        dove arriva il pollice. Qui resta solo dove sei e chi sei.
      */}
      <header className="flex items-center justify-between px-5 pb-1 pt-5">
        <Link href="/" className="title-lg">
          Mezzi
        </Link>
        <Link
          href="/impostazioni"
          aria-label={`Impostazioni di ${user.name}`}
          className="flex size-11 items-center justify-center rounded-full border border-line bg-surface-2 text-lg font-semibold text-ink"
        >
          {user.name.slice(0, 1).toUpperCase()}
        </Link>
      </header>
      <OfflineSync />
      {/* Lo spazio in fondo tiene conto della barra di vetro e del bordo del telefono. */}
      <main className="flex-1 px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-2">
        {children}
      </main>
      <TabBar claims={pendingClaims} />
    </div>
  );
}
