import Link from 'next/link';
import { OfflineSync } from '@/components/offline-sync';
import { requireUser } from '@/lib/auth/session';
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

  const pendingClaims = listPendingUnclaimed().length;
  const pendingSettlements = pendingConfirmationsFor(user.id).length;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header className="px-4 py-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            Mezzi
          </Link>
          <span className="text-sm text-ink-dim">{user.name}</span>
        </div>
        <nav className="mt-2 flex items-center gap-4 text-sm text-ink-dim">
          <NavLink href="/saldi" label="Saldi" />
          <NavLink href="/reclami" label="Reclami" badge={pendingClaims} />
          <NavLink href="/spese" label="Spese" />
          <NavLink href="/pareggi" label="Pareggi" badge={pendingSettlements} />
          <NavLink href="/storico" label="Storico" />
          <NavLink href="/impostazioni" label="Impostazioni" />
          {user.role === 'admin' ? <NavLink href="/admin" label="Admin" /> : null}
        </nav>
      </header>
      <OfflineSync />
      <main className="flex-1 px-4 pb-24">{children}</main>
    </div>
  );
}
