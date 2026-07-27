import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { ReverseButton } from '@/components/reverse-button';
import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { formatDateTime, formatEuro, formatKm, formatLiters } from '@/lib/format';
import { listAllRefuels, listTrips } from '@/lib/services/history';
import { listVehicles } from '@/lib/services/vehicles';

export const dynamic = 'force-dynamic';

type Search = { mezzo?: string; utente?: string; tipo?: string };

const PRICE_SOURCE = {
  tank_weighted: 'prezzo medio in serbatoio',
  last_refuel: 'prezzo ultimo pieno',
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
  const query = { vehicleId: filters.mezzo, userId: filters.utente };

  const trips = showTrips ? listTrips(query) : [];
  const refuels = showRefuels ? listAllRefuels(query) : [];

  const chip = (label: string, params: Search, active: boolean) => {
    const search = new URLSearchParams(
      Object.entries({ ...filters, ...params }).filter(([, v]) => v) as [string, string][],
    ).toString();
    return (
      <Link
        key={label}
        href={`/storico${search ? `?${search}` : ''}`}
        className={`rounded-full border px-3 py-1.5 text-sm ${
          active ? 'border-amber bg-amber text-amber-ink' : 'border-line bg-surface-2 text-ink-dim'
        }`}
      >
        {label}
      </Link>
    );
  };

  const entries = [
    ...trips.map((t) => ({ kind: 'trip' as const, at: t.endedAt ?? t.startedAt, row: t })),
    ...refuels.map((r) => ({ kind: 'refuel' as const, at: r.refueledAt, row: r })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-4">
      <h1 className="text-sm uppercase tracking-widest text-ink-dim">Storico</h1>

      <div className="flex flex-wrap gap-2">
        {chip('Tutti i mezzi', { mezzo: undefined }, !filters.mezzo)}
        {vehicles.map((v) => chip(v.name, { mezzo: v.id }, filters.mezzo === v.id))}
      </div>
      <div className="flex flex-wrap gap-2">
        {chip('Tutti', { utente: undefined }, !filters.utente)}
        {people.map((p) => chip(p.name, { utente: p.id }, filters.utente === p.id))}
      </div>
      <div className="flex flex-wrap gap-2">
        {chip('Tutto', { tipo: undefined }, !filters.tipo)}
        {chip('Solo corse', { tipo: 'corse' }, filters.tipo === 'corse')}
        {chip('Solo rifornimenti', { tipo: 'rifornimenti' }, filters.tipo === 'rifornimenti')}
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Niente da mostrare" hint="Prova a togliere qualche filtro." />
      ) : null}

      {entries.map(({ kind, at, row }) => (
        <Card key={row.id} accent={vehicleOf(row.vehicleId)?.color} className="px-4 py-3">
          {kind === 'trip' ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {nameOf(row.userId)} · {formatKm(row.distanceKm ?? 0)}
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
                <span className="tabular text-lg text-credit">{formatEuro(row.totalCents)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-dim">
                {vehicleOf(row.vehicleId)?.name} · {formatDateTime(at)} ·{' '}
                {formatEuro(row.pricePerLiterCents)}/l
                {row.tankLevelAfter === 'full' ? ' · pieno' : ''}
              </p>
            </>
          )}
          {me.role === 'admin' ? <ReverseButton kind={kind} id={row.id} /> : null}
        </Card>
      ))}
    </div>
  );
}
