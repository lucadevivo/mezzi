'use client';

import { formatTank } from '@/lib/format';

/**
 * L'indicatore del carburante come sta sul cruscotto: arco, tacche, lancetta.
 * Sotto c'è un cursore vero da trascinare fino a dove sta la lancetta vera.
 *
 * Il campo è facoltativo e parte da "non guardata": la scelta a quattro caselle
 * costringeva a dichiarare un quarto/mezzo/pieno anche con la lancetta in mezzo,
 * e un "pieno" dichiarato per forza fa ripartire la calibrazione del consumo su
 * un dato falso.
 *
 * A trascinare è un `input[type=range]` nativo: pollice, tastiera e screen reader
 * arrivano gratis. Il disegno lo segue e basta.
 */

const START = -70; // gradi: la lancetta a zero, in basso a sinistra
const SWEEP = 140; // apertura dell'arco, simmetrica come sul cruscotto
const R = 74;

function pointOnArc(fraction: number, radius = R) {
  const angle = ((START + SWEEP * fraction) * Math.PI) / 180;
  return { x: 100 + radius * Math.sin(angle), y: 100 - radius * Math.cos(angle) };
}

/**
 * Un pezzo d'arco tra due frazioni: serve al fondo scala e alla riserva. L'arco non
 * si "riempie" fino alla lancetta apposta — su un indicatore vero non succede.
 */
function arc(from: number, to: number, radius = R) {
  const a = pointOnArc(from, radius);
  const b = pointOnArc(to, radius);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${radius} ${radius} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

export function TankGauge({
  name,
  value,
  onChange,
}: {
  name: string;
  /** `null` = non l'ho guardata: il campo resta vuoto e non si calibra niente. */
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  const shown = value ?? 0.5;
  const needle = pointOnArc(shown, 58);
  const known = value !== null;

  return (
    <fieldset>
      <legend className="mb-1 text-sm text-ink-dim">
        Serbatoio dopo il rifornimento <span className="opacity-70">— facoltativo</span>
      </legend>

      <svg
        viewBox="30 10 140 102"
        className={`mx-auto w-full max-w-[220px] ${known ? '' : 'opacity-40'}`}
        role="img"
        aria-hidden="true"
      >
        <path d={arc(0, 1)} fill="none" stroke="var(--color-line)" strokeWidth="9" strokeLinecap="round" />
        {/* La riserva: sul cruscotto è il pezzo rosso appena sopra lo zero. */}
        <path d={arc(0, 0.12)} fill="none" stroke="var(--color-debt)" strokeWidth="9" strokeLinecap="round" />
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const outer = pointOnArc(tick, 66);
          const inner = pointOnArc(tick, tick % 0.5 === 0 ? 52 : 58);
          return (
            <line
              key={tick}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke="var(--color-ink-dim)"
              strokeWidth={tick % 0.5 === 0 ? 3 : 2}
              strokeLinecap="round"
            />
          );
        })}

        <text x="34" y="108" fill="var(--color-ink-dim)" fontSize="12">
          0
        </text>
        <text x="92" y="20" fill="var(--color-ink-dim)" fontSize="12">
          1/2
        </text>
        <text x="160" y="108" fill="var(--color-ink-dim)" fontSize="12">
          1
        </text>

        <line
          x1="100"
          y1="100"
          x2={needle.x}
          y2={needle.y}
          stroke="var(--color-ink)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <circle cx="100" cy="100" r="6" fill="var(--color-ink)" />
      </svg>

      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={shown}
        aria-label="Livello del serbatoio dopo il rifornimento"
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-11 w-full cursor-pointer appearance-none rounded-full bg-transparent [&::-moz-range-thumb]:size-7 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-ink [&::-moz-range-track]:h-1.5 [&::-moz-range-track]:rounded-full [&::-moz-range-track]:bg-surface-2 [&::-webkit-slider-runnable-track]:h-1.5 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-runnable-track]:bg-surface-2 [&::-webkit-slider-thumb]:-mt-[11px] [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-ink"
      />

      <input type="hidden" name={name} value={value === null ? '' : String(value)} />

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-base font-medium text-ink">{formatTank(value)}</p>
        <button
          type="button"
          onClick={() => onChange(known ? null : 1)}
          className="min-h-11 text-sm text-ink-dim underline"
        >
          {known ? 'Non l’ho guardata' : 'Segna il livello'}
        </button>
      </div>

      <p className="text-xs text-ink-dim">
        Serve solo se hai fatto il pieno: è da pieno a pieno che si misura il consumo vero.
      </p>
    </fieldset>
  );
}
