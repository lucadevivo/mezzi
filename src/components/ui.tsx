import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

const CARD = 'glass rounded-[var(--radius-card)] relative overflow-hidden';
const CONTROL =
  'w-full rounded-2xl glass-2 px-4 text-ink transition-[border-color,background-color] focus:border-accent/60 focus:outline-none';

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
      className={`${CARD} ${className}`}
      /*
       * Il colore del mezzo tinge la lastra e il suo bordo invece di stare in una
       * banda sul fianco: sul vetro la luce arriva da un lato, non a strisce.
       */
      style={
        accent
          ? {
              borderColor: `${accent}4d`,
              backgroundImage: `linear-gradient(103deg, ${accent}1f, transparent 44%)`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function PrimaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`min-h-14 w-full rounded-2xl bg-accent px-5 text-lg font-semibold text-accent-ink shadow-[0_8px_24px_oklch(0_0_0/45%)] transition-transform duration-200 active:scale-[0.97] disabled:opacity-50 ${className}`}
    />
  );
}

export function SecondaryButton({ className = '', ...props }: ComponentProps<'button'>) {
  return (
    <button
      {...props}
      className={`min-h-12 w-full rounded-2xl glass-2 px-4 text-base font-medium text-ink transition-transform duration-200 active:scale-[0.97] disabled:opacity-50 ${className}`}
    />
  );
}

export function PrimaryLink({ className = '', ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      {...props}
      className={`flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-5 text-lg font-semibold text-accent-ink shadow-[0_8px_24px_oklch(0_0_0/45%)] transition-transform duration-200 active:scale-[0.97] ${className}`}
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
    <p role="alert" className="rounded-2xl border border-debt/40 bg-debt/12 px-4 py-3 text-debt">
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
