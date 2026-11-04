'use client';

import { useState } from 'react';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫'] as const;

/** Il valore come lo scrive il tastierino: virgola, che è quello che l'app poi rilegge. */
export const padValue = (km: number) => String(km).replace('.', ',');

/**
 * Tastierino per il contachilometri.
 *
 * La tastiera di sistema su iPhone si mangia mezzo schermo e i tasti sono piccoli:
 * in piedi al buio, con una mano, si sbaglia. Qui i tasti sono grandi e il valore
 * parte già dall'ultimo km noto, così spesso basta correggere le ultime due cifre.
 */
export function OdometerPad({
  name,
  label,
  value,
  onChange,
  hint,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  const [padOpen, setPadOpen] = useState(false);

  const press = (key: string) => {
    if (key === '⌫') return onChange(value.slice(0, -1));
    // Una virgola sola, e mai come primo tasto: «,3» non è un contachilometri.
    if (key === ',') {
      if (value.includes(',') || value === '') return;
      return onChange(value + ',');
    }
    // Niente zeri iniziali: un contachilometri non comincia per zero.
    onChange((value === '0' ? key : value + key).slice(0, 10));
  };

  return (
    <div>
      <input type="hidden" name={name} value={value} />

      <label className="block">
        <span className="mb-1 block text-sm text-ink-dim">{label}</span>
        {/* La lettura come sul display: icona, numero grande, «km» piccolo, cursore acqua. */}
        <span className="relative flex min-h-16 items-center gap-3 rounded-lg glass px-4 focus-within:border-accent">
          <OdoIcon />
          <input
            inputMode="none"
            readOnly
            value={value}
            aria-label={label}
            onFocus={() => setPadOpen(true)}
            onClick={() => setPadOpen(true)}
            className="tabular min-w-0 flex-1 bg-transparent text-[34px] font-light text-ink caret-transparent focus:outline-none"
            // Il focus lo mostra il bordo acqua della cella, non un rettangolo attorno alle cifre.
            style={{ width: `${Math.max(value.length, 1) + 0.5}ch`, flex: 'none', outline: 'none' }}
          />
          {padOpen ? <span aria-hidden="true" className="-ml-2 h-8 w-[2px] animate-pulse bg-accent" /> : null}
          <span className="text-sm text-ink-dim">km</span>
        </span>
      </label>
      {hint ? <p className="mt-1 text-xs text-ink-dim">{hint}</p> : null}

      {padOpen ? (
        <div className="mt-3 space-y-2">
          {/* Griglia del display: tasti neri, righe sottili (il gap da 1px lascia vedere la linea). */}
          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-label={
                  key === '⌫' ? 'Cancella una cifra' : key === ',' ? 'Virgola' : key
                }
                onClick={() => press(key)}
                className="tabular min-h-16 bg-base text-[28px] font-light text-ink transition-colors duration-75 active:bg-surface-2 active:text-accent active:[text-shadow:0_0_12px_var(--color-accent)]"
              >
                {key}
              </button>
            ))}
          </div>
          {/* Il tastierino è alto: finché resta aperto copre il pulsante sotto. */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange('')}
              className="min-h-12 rounded-lg border border-line text-base text-ink-dim"
            >
              Azzera
            </button>
            <button
              type="button"
              onClick={() => setPadOpen(false)}
              className="min-h-12 rounded-lg border border-line text-base text-ink-dim"
            >
              Fatto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OdoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 text-ink-dim" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M4 17a8 8 0 1 1 16 0" strokeLinecap="round" />
      <path d="M12 17l4-5" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" />
    </svg>
  );
}
