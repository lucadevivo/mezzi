import Link from 'next/link';
import { requireUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** Tutto quello che non serve col mezzo in mano: si guarda da seduti, non in garage. */
export default async function MorePage() {
  const me = await requireUser();

  // Impostazioni sta nell'avatar in alto a destra, non qui: due strade per la stessa
  // schermata sono una di troppo. I pareggi in contanti non esistono più — il debito
  // è in chilometri e si ripaga mettendo carburante. Scadenze resta solo per URL.
  const entries = [
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
