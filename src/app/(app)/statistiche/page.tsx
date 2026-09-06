import Link from 'next/link';
import { BarList, TrendChart } from '@/components/charts';
import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { formatEuro, formatKm } from '@/lib/format';
import {
  consumptionTrend,
  monthLabel,
  monthPeriod,
  statsByCategory,
  statsByUser,
  statsByVehicle,
} from '@/lib/services/stats';

export const dynamic = 'force-dynamic';

const EXPORTS = [
  { kind: 'corse', label: 'Corse' },
  { kind: 'rifornimenti', label: 'Rifornimenti' },
  { kind: 'movimenti', label: 'Movimenti' },
] as const;

export default async function StatsPage() {
  await requireUser();

  const period = monthPeriod();
  const byUser = statsByUser(period);
  const byVehicle = statsByVehicle(period);
  const byCategory = statsByCategory(period);
  const mostUsed = byVehicle.find((v) => v.km > 0);

  const trends = byVehicle
    .map((vehicle) => ({ vehicle, trend: consumptionTrend(vehicle.vehicleId) }))
    .filter(({ trend }) => trend.length >= 2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[15px] font-semibold text-ink-dim">Statistiche</h1>
        <p className="text-lg capitalize">{monthLabel(period)}</p>
      </div>

      {mostUsed ? (
        <Card className="px-4 py-4">
          <p className="text-sm text-ink-dim">Il mezzo più usato del mese</p>
          <p className="mt-1 text-2xl font-semibold">{mostUsed.name}</p>
          <p className="tabular mt-1 text-ink-dim">
            {formatKm(mostUsed.km)} ·{' '}
            {mostUsed.costPerKmCents !== null
              ? `${(mostUsed.costPerKmCents / 100).toFixed(3).replace('.', ',')} € al km`
              : '—'}
          </p>
        </Card>
      ) : (
        <EmptyState
          title="Nessuna corsa questo mese"
          hint="Le statistiche compaiono appena qualcuno registra un giro."
        />
      )}

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Chilometri per persona</h2>
        <Card className="px-4 py-4">
          <BarList
            emptyHint="Nessun chilometro registrato questo mese."
            data={byUser.map((u) => ({
              label: u.name,
              value: u.km,
              color: u.color,
              display: formatKm(u.km),
            }))}
          />
        </Card>
      </section>

      {/* Le etichette servono a questo: sapere quanti km sono andati in consegne. */}
      {byCategory.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-ink-dim">Chilometri per categoria</h2>
          <Card className="px-4 py-4">
            <BarList
              emptyHint="Nessuna corsa etichettata questo mese."
              data={byCategory.map((c) => ({
                label: c.name,
                value: c.km,
                color: 'var(--color-ink-dim)',
                display: formatKm(c.km),
              }))}
            />
          </Card>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Costo per persona</h2>
        <Card className="px-4 py-4">
          <BarList
            emptyHint="Nessun costo registrato questo mese."
            data={byUser.map((u) => ({
              label: u.name,
              value: u.costCents,
              color: u.color,
              display: formatEuro(u.costCents),
            }))}
          />
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Costo medio al km</h2>
        {byVehicle.map((vehicle) => (
          <Card key={vehicle.vehicleId} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium">{vehicle.name}</span>
              <span className="tabular">
                {vehicle.costPerKmCents !== null
                  ? `${(vehicle.costPerKmCents / 100).toFixed(3).replace('.', ',')} €/km`
                  : '—'}
              </span>
            </div>
            <p className="tabular mt-1 text-sm text-ink-dim">
              {formatKm(vehicle.km)} · {vehicle.consumptionKmL?.toFixed(1)} km/l{' '}
              {vehicle.consumptionSource === 'measured' ? 'misurati' : 'da libretto'}
            </p>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Consumo reale nel tempo</h2>
        {/* Solo i mezzi che hanno davvero un andamento: tre schede vuote identiche sono rumore. */}
        {trends.length === 0 ? (
          <EmptyState
            title="Ancora nessun andamento"
            hint="Servono almeno due pieni consecutivi sullo stesso mezzo."
          />
        ) : null}
        {trends.map(({ vehicle, trend }) => (
          <Card key={vehicle.vehicleId} className="px-4 py-4">
            <p className="mb-2 font-medium">{vehicle.name}</p>
            <TrendChart
              color={vehicle.color}
              unit="km/l"
              points={trend.map((point) => ({
                x: point.odometerKm,
                y: point.kmPerLiter,
                label: point.refueledAt.toISOString(),
              }))}
            />
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Esporta</h2>
        <div className="grid grid-cols-2 gap-2">
          {EXPORTS.map((item) => (
            <a
              key={item.kind}
              href={`/api/export/${item.kind}`}
              className="flex min-h-12 items-center justify-center rounded-2xl glass-2 text-base text-ink"
            >
              {item.label}
            </a>
          ))}
        </div>
        <Link
          href="/riepilogo"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl glass-2 text-base text-ink"
        >
          Riepilogo mensile stampabile
        </Link>
      </section>
    </div>
  );
}
