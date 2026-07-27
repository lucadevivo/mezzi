import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { listDeadlines } from '@/lib/services/deadlines';
import { pendingConfirmationsFor } from '@/lib/services/settlements';

export const dynamic = 'force-dynamic';

/** Tutto quello che non serve col mezzo in mano: si guarda da seduti, non in garage. */
export default async function MorePage() {
  const me = await requireUser();
  const pendingSettlements = pendingConfirmationsFor(me.id).length;
  const dueDeadlines = listDeadlines().filter((row) => row.status.state !== 'ok').length;

  const entries = [
    { href: '/spese', label: 'Spese fisse', hint: 'Assicurazione, bollo, tagliandi, riparazioni' },
    {
      href: '/pareggi',
      label: 'Pareggi',
      hint: 'Chi ha già pagato chi',
      badge: pendingSettlements,
    },
    { href: '/storico', label: 'Storico', hint: 'Corse e rifornimenti, con filtri' },
    {
      href: '/scadenze',
      label: 'Scadenze',
      hint: 'Bollo, revisione, tagliando',
      badge: dueDeadlines,
    },
    { href: '/statistiche', label: 'Statistiche', hint: 'Km, costi, consumi, esportazioni' },
    { href: '/impostazioni', label: 'Impostazioni', hint: 'Notifiche e uso senza rete' },
    ...(me.role === 'admin'
      ? [{ href: '/admin', label: 'Admin', hint: 'Inviti, utenti, mezzi, audit log' }]
      : []),
  ];

  return (
    <div className="space-y-2">
      <h1 className="mb-3 text-sm uppercase tracking-widest text-ink-dim">Altro</h1>
      {entries.map((entry) => (
        <Link
          key={entry.href}
          href={entry.href}
          className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
        >
          <span>
            <span className="block font-medium">{entry.label}</span>
            <span className="block text-sm text-ink-dim">{entry.hint}</span>
          </span>
          {entry.badge ? (
            <span className="tabular rounded-full bg-debt px-2 py-0.5 text-sm">{entry.badge}</span>
          ) : null}
        </Link>
      ))}
    </div>
  );
}
