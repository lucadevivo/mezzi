import Link from 'next/link';
import { OfflineSync } from '@/components/offline-sync';
import { requireUser } from '@/lib/auth/session';
import { listDeadlines, notifyDueDeadlines } from '@/lib/services/deadlines';
import { notifyUnclaimedResolved, remindOpenTrips } from '@/lib/services/notifications';
import { pendingConfirmationsFor } from '@/lib/services/settlements';
import { listPendingUnclaimed, resolveExpiredUnclaimed } from '@/lib/services/unclaimed';

function NavLink({ href, label, badge }: { href: string; label: string; badge?: number }) {
  return (
    <Link href={href} className="relative px-1">
      {label}
      {badge ? (
        <span className="tabular absolute -right-3 -top-2 rounded-full bg-debt px-1.5 text-xs text-ink">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}

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
      <header className="px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Mezzi
          </Link>
          <span className="text-sm text-ink-dim">{user.name}</span>
        </div>
        {/*
          Tre voci e basta: su un telefono una barra da nove link non ci sta in
          larghezza, e quelli in fondo diventano irraggiungibili. Il resto sta in "Altro".
        */}
        <nav className="mt-2 flex items-center gap-5 text-sm text-ink-dim">
          <NavLink href="/saldi" label="Saldi" />
          <NavLink href="/reclami" label="Reclami" badge={pendingClaims} />
          <NavLink href="/altro" label="Altro" badge={elsewhere} />
        </nav>
      </header>
      <OfflineSync />
      <main className="flex-1 px-4 pb-24">{children}</main>
    </div>
  );
}
