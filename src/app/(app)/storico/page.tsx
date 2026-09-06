import { eq } from 'drizzle-orm';
import { HistoryFilters } from '@/components/history-filters';
import { ReverseButton } from '@/components/reverse-button';
import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { formatDateTime, formatEuro, formatKm, formatLiters, formatTank } from '@/lib/format';
import { listCategories } from '@/lib/services/categories';
import { listAllRefuels, listTrips } from '@/lib/services/history';
import { listVehicles } from '@/lib/services/vehicles';

export const dynamic = 'force-dynamic';

type Search = { mezzo?: string; utente?: string; tipo?: string; categoria?: string };

const PRICE_SOURCE = {
  tank_weighted: 'prezzo medio in serbatoio',
  last_refuel: 'prezzo ultimo pieno',
  first_refuel: 'prezzo primo pieno noto',
  fallback: 'prezzo di ripiego',
} as const;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireUser();
  const filters = await searchParams;

  const vehicles = listVehicles();
  const people = db.select().from(userTable).where(eq(userTable.active, true)).all();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '?';
  const vehicleOf = (id: string) => vehicles.find((v) => v.id === id);

  const showRefuels = filters.tipo !== 'corse';
  const showTrips = filters.tipo !== 'rifornimenti';
  const categories = listCategories();
  const categoryOf = (id: string | null) => categories.find((c) => c.id === id)?.name;
  const query = {
    vehicleId: filters.mezzo,
    userId: filters.utente,
    categoryId: filters.categoria,
  };

  const trips = showTrips ? listTrips(query) : [];
  const refuels = showRefuels ? listAllRefuels(query) : [];

  const entries = [
    ...trips.map((t) => ({ kind: 'trip' as const, at: t.endedAt ?? t.startedAt, row: t })),
    ...refuels.map((r) => ({ kind: 'refuel' as const, at: r.refueledAt, row: r })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-4">
      <h1 className="text-[15px] font-semibold text-ink-dim">Storico</h1>

      <HistoryFilters
        vehicles={vehicles.map((v) => ({ id: v.id, name: v.name }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        filters={filters}
      />

      {entries.length === 0 ? (
        <EmptyState title="Niente da mostrare" hint="Prova a togliere qualche filtro." />
      ) : null}

      {entries.map(({ kind, at, row }) => (
        <Card key={row.id} className="px-4 py-3">
          {kind === 'trip' ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {nameOf(row.userId)} · {formatKm(row.distanceKm ?? 0)}
                  {categoryOf(row.categoryId) ? (
                    <span className="ml-2 rounded-full bg-surface-2 px-2 py-0.5 text-xs text-ink-dim">
                      {categoryOf(row.categoryId)}
                    </span>
                  ) : null}
                </span>
                <span className="tabular text-lg">{formatEuro(row.costCents ?? 0)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-dim">
                {vehicleOf(row.vehicleId)?.name} · {formatDateTime(at)} ·{' '}
                {formatLiters(row.litersEstimated ?? 0)}
                {row.priceSource ? ` · ${PRICE_SOURCE[row.priceSource]}` : ''}
              </p>
              {row.note ? <p className="mt-1 text-sm text-ink-dim">{row.note}</p> : null}
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {nameOf(row.userId)} · rifornimento {formatLiters(row.liters)}
                </span>
                <span className="tabular text-lg text-ink">{formatEuro(row.totalCents)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-dim">
                {vehicleOf(row.vehicleId)?.name} · {formatDateTime(at)} ·{' '}
                {formatEuro(row.pricePerLiterCents)}/l
                {row.tankFractionAfter === null ? '' : ` · ${formatTank(row.tankFractionAfter)}`}
              </p>
            </>
          )}
          {me.role === 'admin' ? <ReverseButton kind={kind} id={row.id} /> : null}
        </Card>
      ))}
    </div>
  );
}
