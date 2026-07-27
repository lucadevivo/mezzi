import { formatKm } from '@/lib/format';

/**
 * Grafici fatti a mano in SVG: due forme in croce, nessuna libreria da caricare
 * su una connessione da garage.
 *
 * Regole seguite: marchi sottili con estremità arrotondate, assi e griglia
 * recessivi, colore che segue l'entità (mai la posizione in classifica), etichette
 * dirette invece del tooltip — su un telefono il passaggio del mouse non esiste.
 */

export interface BarDatum {
  label: string;
  value: number;
  color: string;
  /** Valore già formattato: l'etichetta diretta va scritta, non calcolata due volte. */
  display: string;
}

export function BarList({ data, emptyHint }: { data: BarDatum[]; emptyHint: string }) {
  const max = Math.max(...data.map((d) => d.value), 0);

  if (data.length === 0 || max === 0) {
    return <p className="text-sm text-ink-dim">{emptyHint}</p>;
  }

  return (
    <ul className="space-y-3">
      {data.map((datum) => (
        <li key={datum.label}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">{datum.label}</span>
            <span className="tabular text-sm text-ink-dim">{datum.display}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (datum.value / max) * 100)}%`,
                backgroundColor: datum.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface TrendPoint {
  x: number;
  y: number;
  label: string;
}

/**
 * Andamento del consumo reale. Serie singola: il titolo dice già di che mezzo si
 * tratta, quindi niente legenda. I punti sono pochi e vengono etichettati sopra.
 */
export function TrendChart({
  points,
  color,
  unit,
}: {
  points: TrendPoint[];
  color: string;
  unit: string;
}) {
  if (points.length < 2) {
    return (
      <p className="text-sm text-ink-dim">
        Servono almeno due pieni consecutivi per vedere un andamento.
      </p>
    );
  }

  const width = 320;
  const height = 120;
  const padding = { top: 18, right: 12, bottom: 22, left: 12 };

  const ys = points.map((p) => p.y);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  // Un po' di aria sopra e sotto: una riga incollata al bordo non si legge.
  const span = max - min || 1;
  const lo = min - span * 0.2;
  const hi = max + span * 0.2;

  const px = (index: number) =>
    padding.left + (index / (points.length - 1)) * (width - padding.left - padding.right);
  const py = (value: number) =>
    padding.top + (1 - (value - lo) / (hi - lo)) * (height - padding.top - padding.bottom);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i)} ${py(p.y)}`).join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      role="img"
      aria-label={`Andamento ${unit}`}
    >
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="var(--color-line)"
        strokeWidth="1"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <g key={point.label}>
          {/* Anello del colore di fondo: i punti restano staccati dalla linea. */}
          <circle
            cx={px(index)}
            cy={py(point.y)}
            r="4.5"
            fill={color}
            stroke="var(--color-surface)"
            strokeWidth="2"
          />
          {(index === 0 || index === points.length - 1) && (
            <text
              x={px(index)}
              y={py(point.y) - 10}
              textAnchor={index === 0 ? 'start' : 'end'}
              className="tabular"
              fill="var(--color-ink-dim)"
              fontSize="11"
            >
              {point.y.toFixed(1)}
            </text>
          )}
        </g>
      ))}
      <text x={padding.left} y={height - 6} fill="var(--color-ink-dim)" fontSize="10">
        {formatKm(points[0].x)}
      </text>
      <text
        x={width - padding.right}
        y={height - 6}
        textAnchor="end"
        fill="var(--color-ink-dim)"
        fontSize="10"
      >
        {formatKm(points[points.length - 1].x)}
      </text>
    </svg>
  );
}
