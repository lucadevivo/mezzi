'use client';

import { useRouter } from 'next/navigation';

export interface HistoryFilterValues {
  mezzo?: string;
  utente?: string;
  tipo?: string;
  categoria?: string;
}

interface Option {
  id: string;
  name: string;
}

/**
 * I filtri dello storico.
 *
 * Prima erano tre file di pastiglie che andavano a capo: su un telefono
 * occupavano mezzo schermo, e le tre voci «Tutti i mezzi», «Tutti» e «Tutto»
 * stavano una sotto l'altra senza che si capisse a cosa si riferivano.
 *
 * Mezzo e persona sono elenchi che crescono: stanno in due menu a tendina, che
 * si spiegano da soli e occupano una riga. Il tipo è una scelta fra tre e resta
 * a vista, perché è quella che si cambia di continuo.
 */
export function HistoryFilters({
  vehicles,
  people,
  categories,
  filters,
}: {
  vehicles: readonly Option[];
  people: readonly Option[];
  categories: readonly Option[];
  filters: HistoryFilterValues;
}) {
  const router = useRouter();

  const go = (patch: HistoryFilterValues) => {
    const next = Object.entries({ ...filters, ...patch }).filter(([, value]) => value) as [
      string,
      string,
    ][];
    const search = new URLSearchParams(next).toString();
    router.push(search ? `/storico?${search}` : '/storico');
  };

  const select = 'min-h-11 w-full rounded-2xl glass-2 px-3 text-base text-ink';

  const TIPI = [
    { value: undefined, label: 'Tutto' },
    { value: 'corse', label: 'Corse' },
    { value: 'rifornimenti', label: 'Rifornimenti' },
  ] as const;

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Filtra per mezzo"
          className={select}
          value={filters.mezzo ?? ''}
          onChange={(e) => go({ mezzo: e.target.value || undefined })}
        >
          <option value="">Tutti i mezzi</option>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>

        <select
          aria-label="Filtra per persona"
          className={select}
          value={filters.utente ?? ''}
          onChange={(e) => go({ utente: e.target.value || undefined })}
        >
          <option value="">Chiunque</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* La tendina delle etichette compare solo quando ce n'è almeno una: prima
          sarebbe un filtro su niente. */}
      {categories.length > 0 ? (
        <select
          aria-label="Filtra per categoria"
          className={select}
          value={filters.categoria ?? ''}
          onChange={(e) => go({ categoria: e.target.value || undefined })}
        >
          <option value="">Tutte le categorie</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      ) : null}

      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {TIPI.map((tipo) => {
          const active = (filters.tipo ?? undefined) === tipo.value;
          return (
            <button
              key={tipo.label}
              type="button"
              aria-pressed={active}
              onClick={() => go({ tipo: tipo.value })}
              className={`min-h-10 rounded-xl text-sm font-medium transition-colors ${
                active ? 'bg-accent text-accent-ink' : 'text-ink-dim'
              }`}
            >
              {tipo.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
