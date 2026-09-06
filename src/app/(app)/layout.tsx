import Link from 'next/link';
import { OfflineSync } from '@/components/offline-sync';
import { TabBar } from '@/components/tab-bar';
import { requireUser } from '@/lib/auth/session';
import { listDeadlines, notifyDueDeadlines } from '@/lib/services/deadlines';
import { notifyUnclaimedResolved, remindOpenTrips } from '@/lib/services/notifications';
import { pendingConfirmationsFor } from '@/lib/services/settlements';
import { listPendingUnclaimed, resolveExpiredUnclaimed } from '@/lib/services/unclaimed';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  // Nessuno scheduler: i termini scaduti si chiudono, e i promemoria partono,
  // quando qualcuno apre l'app. Con quattro utenti succede più che abbastanza spesso.
  for (const resolved of resolveExpiredUnclaimed()) {
    await notifyUnclaimedResolved(resolved.id, resolved.chargedTo, resolved.status);
  }
  await remindOpenTrips();
  await notifyDueDeadlines();

  const pendingClaims = listPendingUnclaimed().length;
  const pendingSettlements = pendingConfirmationsFor(user.id).length;
  const dueDeadlines = listDeadlines().filter((row) => row.status.state !== 'ok').length;
  const elsewhere = pendingSettlements + dueDeadlines;

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
          className="glass flex size-10 items-center justify-center rounded-full text-base font-semibold"
        >
          {user.name.slice(0, 1).toUpperCase()}
        </Link>
      </header>
      <OfflineSync />
      {/* Lo spazio in fondo tiene conto della barra di vetro e del bordo del telefono. */}
      <main className="flex-1 px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-2">
        {children}
      </main>
      <TabBar claims={pendingClaims} elsewhere={elsewhere} />
    </div>
  );
}
