import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { formatEuro } from '@/lib/format';

export function Card({
  children,
  accent,
  className = '',
}: {
  children: ReactNode;
  /** Colore identitario del mezzo: sbagliare mezzo è l'errore più probabile dell'app. */
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-line bg-surface ${className}`}
      style={accent ? { borderLeft: `6px solid ${accent}` } : undefined}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`min-h-14 w-full rounded-xl bg-amber px-5 text-lg font-semibold text-amber-ink transition-opacity active:opacity-80 disabled:opacity-50 ${className}`}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`min-h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base font-medium text-ink transition-opacity active:opacity-80 disabled:opacity-50 ${className}`}
    />
  );
}

export function PrimaryLink({ className = '', ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={`flex min-h-14 w-full items-center justify-center rounded-xl bg-amber px-5 text-lg font-semibold text-amber-ink active:opacity-80 ${className}`}
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
        <span className="mb-1 block text-sm text-ink-dim">{label}</span>
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
      className={`tabular min-h-14 w-full rounded-xl border border-line bg-surface-2 px-4 text-2xl text-ink ${className}`}
    />
  );
}

export function TextInput({ className = '', ...props }: ComponentProps<'input'>) {
  return (
    <input
      {...props}
      className={`min-h-12 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-ink ${className}`}
    />
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-xl border border-debt/40 bg-debt/10 px-4 py-3 text-debt">
      {children}
    </p>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm text-ink-dim">{hint}</p>
    </div>
  );
}

/**
 * Elemento firma: il quadrante del saldo. L'ago si muove tra debito e credito,
 * come uno strumento del cruscotto — non come una barra di progresso.
 */
export function SaldoGauge({
  balanceCents,
  scaleCents = 5000,
}: {
  balanceCents: number;
  scaleCents?: number;
}) {
  const clamped = Math.max(-1, Math.min(1, balanceCents / scaleCents));
  // -1 (debito) è a sinistra, +1 (credito) a destra: 180° di corsa in tutto.
  const angle = clamped * 90;
  const color = balanceCents < 0 ? 'var(--color-debt)' : 'var(--color-credit)';

  return (
    <svg
      viewBox="0 0 200 112"
      className="w-full max-w-[280px]"
      role="img"
      aria-label={`Saldo ${formatEuro(balanceCents)}`}
    >
      <defs>
        <linearGradient id="saldo-arc" x1="0" x2="1">
          <stop offset="0%" stopColor="var(--color-debt)" />
          <stop offset="50%" stopColor="var(--color-ink-dim)" />
          <stop offset="100%" stopColor="var(--color-credit)" />
        </linearGradient>
      </defs>
      <path
        d="M 16 100 A 84 84 0 0 1 184 100"
        fill="none"
        stroke="url(#saldo-arc)"
        strokeWidth="8"
        strokeLinecap="round"
      />
      {[-90, -45, 0, 45, 90].map((tick) => (
        <line
          key={tick}
          x1="100"
          y1="26"
          x2="100"
          y2="34"
          stroke="var(--color-line)"
          strokeWidth="2"
          transform={`rotate(${tick} 100 100)`}
        />
      ))}
      <g transform={`rotate(${angle} 100 100)`}>
        <line
          x1="100"
          y1="100"
          x2="100"
          y2="38"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>
      <circle cx="100" cy="100" r="7" fill={color} />
    </svg>
  );
}
