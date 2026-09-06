import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';
import { pendingConfirmationsFor } from '@/lib/services/settlements';

export const dynamic = 'force-dynamic';

/** Tutto quello che non serve col mezzo in mano: si guarda da seduti, non in garage. */
export default async function MorePage() {
  const me = await requireUser();
  const pendingSettlements = pendingConfirmationsFor(me.id).length;

  // Impostazioni sta nell'avatar in alto a destra, non qui: due strade per la stessa
  // schermata sono una di troppo. Spese fisse e Scadenze restano raggiungibili per URL
  // (`/spese`, `/scadenze`) ma sono fuori dall'elenco: nessuno le apriva.
  const entries = [
    {
      href: '/pareggi',
      label: 'Pareggi',
      hint: 'Chi ha già pagato chi',
      badge: pendingSettlements,
    },
    { href: '/storico', label: 'Storico', hint: 'Corse e rifornimenti, con filtri' },
    { href: '/statistiche', label: 'Statistiche', hint: 'Km, costi, consumi, esportazioni' },
    ...(me.role === 'admin'
      ? [{ href: '/admin', label: 'Admin', hint: 'Inviti, utenti, mezzi, audit log' }]
      : []),
  ];

  return (
    <div>
      <h1 className="mb-3 text-[15px] font-semibold text-ink-dim">Altro</h1>
      {/* Una lastra sola con i separatori, non sette card uguali in fila: è una lista. */}
      <div className="glass divide-y divide-line overflow-hidden rounded-[var(--radius-card)]">
        {entries.map((entry) => (
          <Link
            key={entry.href}
            href={entry.href}
            className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 transition-colors active:bg-surface-2"
          >
            <span>
              <span className="block font-medium">{entry.label}</span>
              <span className="block text-sm text-ink-dim">{entry.hint}</span>
            </span>
            <span className="flex items-center gap-2">
              {entry.badge ? (
                <span className="tabular rounded-full bg-debt px-2 py-0.5 text-sm font-semibold">
                  {entry.badge}
                </span>
              ) : null}
              {/* Chevron: dice che si va da qualche parte, come in iOS. */}
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="size-4 text-ink-dim"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m9 5 7 7-7 7" />
              </svg>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
