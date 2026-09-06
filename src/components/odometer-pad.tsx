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
        <input
          inputMode="none"
          readOnly
          value={value}
          aria-label={label}
          onFocus={() => setPadOpen(true)}
          onClick={() => setPadOpen(true)}
          className="tabular min-h-16 w-full rounded-2xl glass-2 px-4 text-3xl text-ink"
        />
      </label>
      {hint ? <p className="mt-1 text-xs text-ink-dim">{hint}</p> : null}

      {padOpen ? (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-label={
                  key === '⌫' ? 'Cancella una cifra' : key === ',' ? 'Virgola' : key
                }
                onClick={() => press(key)}
                className="tabular min-h-16 rounded-2xl glass-2 text-2xl text-ink active:bg-surface"
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
              className="min-h-12 rounded-2xl border border-line text-base text-ink-dim"
            >
              Azzera
            </button>
            <button
              type="button"
              onClick={() => setPadOpen(false)}
              className="min-h-12 rounded-2xl border border-line text-base text-ink-dim"
            >
              Fatto
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
