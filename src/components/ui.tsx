import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const CARD = 'glass rounded-[var(--radius-card)] relative overflow-hidden';
const CONTROL =
  'w-full rounded-lg glass-2 px-4 text-ink transition-[border-color,background-color] focus:border-accent/60 focus:outline-none';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`${CARD} ${className}`}>{children}</div>;
}

export function PrimaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`min-h-14 w-full rounded-lg bg-accent px-5 text-lg font-semibold text-accent-ink shadow-[0_8px_24px_oklch(0_0_0/45%)] transition-transform duration-200 active:scale-[0.97] disabled:opacity-50 ${className}`}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`min-h-12 w-full rounded-lg glass-2 px-4 text-base font-medium text-ink transition-transform duration-200 active:scale-[0.97] disabled:opacity-50 ${className}`}
    />
  );
}

export function PrimaryLink({ className = '', ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={`flex min-h-14 w-full items-center justify-center rounded-lg bg-accent px-5 text-lg font-semibold text-accent-ink shadow-[0_8px_24px_oklch(0_0_0/45%)] transition-transform duration-200 active:scale-[0.97] ${className}`}
    />
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  // Il suggerimento sta fuori dalla label: dentro finirebbe nel nome accessibile
  // del campo, e uno screen reader leggerebbe "Contachilometri ultimo valore 0 km".
  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-sm text-ink-dim">{label}</span>
        {children}
      </label>
      {hint ? <p className="mt-1 text-xs text-ink-dim">{hint}</p> : null}
    </div>
  );
}

export function NumberInput({ className = '', ...props }: ComponentProps<'input'>) {
  return (
    <input
      {...props}
      inputMode="decimal"
      autoComplete="off"
      className={`tabular min-h-14 text-2xl ${CONTROL} ${className}`}
    />
  );
}

export function TextInput({ className = '', ...props }: ComponentProps<'input'>) {
  return <input {...props} className={`min-h-12 text-base ${CONTROL} ${className}`} />;
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-lg border border-debt/40 bg-debt/12 px-4 py-3 text-debt">
      {children}
    </p>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-dim">{hint}</p>
    </div>
  );
}

/** Spia del carburante, quella del quadro. */
function FuelLamp({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`size-6 shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="4" y="4" width="10" height="16" rx="1" />
      <line x1="6.5" y1="9" x2="11.5" y2="9" />
      <path d="M14 8 l3.5 2.5 v6.5 a1.5 1.5 0 0 0 3 0 V8.5 L18 6" />
    </svg>
  );
}

/**
 * Il saldo come una cella del display. Debito: spia e cifre rosse, «da coprire»
 * e accanto quanto mettere. Credito: spia verde, cifre bianche. In pari: spia spenta.
 * Il rosso compare solo qui e sulla riserva: è la prima cosa che si vede.
 */
export function BalanceCell({
  km,
  topupCents,
  format,
  size = 'lg',
}: {
  km: number;
  topupCents: number;
  format: (km: number) => string;
  size?: 'lg' | 'md';
}) {
  const debt = km < 0;
  const even = km === 0;
  const big = size === 'lg' ? 'text-[34px]' : 'text-[26px]';
  const [num, unit] = splitUnit(format(Math.abs(km)));
  const topup = debt && topupCents > 0;
  return (
    <div className={`grid ${topup ? 'grid-cols-[1fr_auto]' : ''} gap-px overflow-hidden rounded-lg border border-line bg-line`}>
      <div className="flex items-center gap-3 bg-base px-3 py-2.5">
        <FuelLamp
          className={
            debt
              ? 'text-debt [filter:drop-shadow(0_0_6px_var(--color-debt))]'
              : even
                ? 'text-ink-dim opacity-40'
                : 'text-credit [filter:drop-shadow(0_0_6px_var(--color-credit))]'
          }
        />
        {even ? (
          <span className="font-[family-name:var(--font-display)] text-lg text-ink-dim">In pari</span>
        ) : (
          <div className="min-w-0 leading-none">
            <p className={`tabular font-light ${big} ${debt ? 'text-debt' : 'text-ink'}`}>
              {num}
              <span className="ml-1 text-sm font-normal text-ink-dim">{unit}</span>
            </p>
            <p className="mt-1 text-xs text-ink-dim">{debt ? 'da coprire' : 'di autonomia'}</p>
          </div>
        )}
      </div>
      {topup ? (
        <div className="flex flex-col justify-center bg-base px-3 py-2.5 text-right leading-none">
          <p className={`tabular font-light text-ink ${size === 'lg' ? 'text-[26px]' : 'text-xl'}`}>
            ~{(topupCents / 100).toFixed(0)}
            <span className="ml-1 text-sm font-normal text-ink-dim">€</span>
          </p>
          <p className="mt-1 text-xs text-ink-dim">da mettere</p>
        </div>
      ) : null}
    </div>
  );
}

/** «278,2 km» -> ["278,2", "km"]: numero grande, unità piccola accanto. */
function splitUnit(text: string): [string, string] {
  const i = text.lastIndexOf(' ');
  return i < 0 ? [text, ''] : [text.slice(0, i), text.slice(i + 1)];
}

/** Stato del mezzo come le spie: libero = anello spento, tuo = acqua, di un altro = ambra. */
export function StatusLamp({ state, label }: { state: 'free' | 'mine' | 'other'; label: string }) {
  const tone = state === 'mine' ? 'text-accent' : state === 'other' ? 'text-warn' : 'text-ink-dim';
  return (
    <span className={`inline-flex items-center gap-2 text-sm ${tone}`}>
      <span className={`lamp ${state === 'free' ? '' : 'lamp-on'}`} />
      {label}
    </span>
  );
}
