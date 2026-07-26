import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { listPendingUnclaimed, resolveExpiredUnclaimed } from '@/lib/services/unclaimed';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Nessuno scheduler: i termini scaduti si chiudono quando qualcuno apre l'app.
  resolveExpiredUnclaimed();
  const pending = listPendingUnclaimed().length;

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Mezzi
        </Link>
        <nav className="flex items-center gap-4 text-sm text-ink-dim">
          <Link href="/saldi">Saldi</Link>
          <Link href="/reclami" className="relative">
            Reclami
            {pending > 0 ? (
              <span className="tabular absolute -right-4 -top-2 rounded-full bg-debt px-1.5 text-xs text-ink">
                {pending}
              </span>
            ) : null}
          </Link>
          {user.role === 'admin' ? <Link href="/admin">Admin</Link> : null}
        </nav>
      </header>
      <main className="flex-1 px-4 pb-24">{children}</main>
    </div>
  );
}
