'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/*
 * Barra di vetro in fondo, come la tab bar di iOS. Quattro voci: sopra il
 * pollice non ci arrivi, e comunque una barra più lunga sfonda la larghezza
 * del telefono. Tutto il resto continua a stare dentro "Altro".
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[26px]" {...stroke}>
      {children}
    </svg>
  );
}

const TABS = [
  {
    href: '/',
    label: 'Mezzi',
    icon: (
      <Icon>
        <path d="M5 13.5 6.8 8.4A2 2 0 0 1 8.7 7h6.6a2 2 0 0 1 1.9 1.4L19 13.5" />
        <path d="M4 13.5h16v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
        <path d="M7 16h.01M17 16h.01" />
      </Icon>
    ),
  },
  {
    href: '/saldi',
    label: 'Saldi',
    icon: (
      <Icon>
        <path d="M4 9h13M13.5 5.5 17 9l-3.5 3.5" />
        <path d="M20 15H7M10.5 11.5 7 15l3.5 3.5" />
      </Icon>
    ),
  },
  {
    href: '/reclami',
    label: 'Reclami',
    icon: (
      <Icon>
        <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
        <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
      </Icon>
    ),
  },
  {
    href: '/altro',
    label: 'Altro',
    icon: (
      <Icon>
        <circle cx="6" cy="12" r="1.1" fill="currentColor" />
        <circle cx="12" cy="12" r="1.1" fill="currentColor" />
        <circle cx="18" cy="12" r="1.1" fill="currentColor" />
      </Icon>
    ),
  },
];

export function TabBar({ claims, elsewhere }: { claims: number; elsewhere: number }) {
  const pathname = usePathname();
  const badges: Record<string, number> = { '/reclami': claims, '/altro': elsewhere };

  return (
    <nav
      aria-label="Sezioni"
      className="glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+10px)] z-30 mx-auto flex max-w-[26rem] rounded-[26px] px-1.5 py-1.5"
    >
      {TABS.map((tab) => {
        // "/" è attiva solo esatta, altrimenti resterebbe accesa ovunque.
        const active = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
        const badge = badges[tab.href] ?? 0;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] text-[11px] font-medium transition-[color,background-color,transform] duration-200 active:scale-95 ${
              active ? 'bg-accent/15 text-accent' : 'text-ink-dim'
            }`}
          >
            {tab.icon}
            {tab.label}
            {badge ? (
              <span className="tabular absolute right-1/2 top-1.5 -mr-3 min-w-5 rounded-full bg-debt px-1.5 text-center text-[11px] font-semibold leading-5 text-ink">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
