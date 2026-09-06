import { eq } from 'drizzle-orm';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { TakeOverButton } from '@/components/take-over-button';
import { TripPanel } from '@/components/trip-panel';
import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { formatEuro, formatKm, formatLiters, formatSince } from '@/lib/format';
import { listCategories } from '@/lib/services/categories';
import { billableMemberIds, getVehicleState } from '@/lib/services/vehicles';

export const dynamic = 'force-dynamic';

export default async function VehiclePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;
  const state = getVehicleState(id);
  if (!state) notFound();

  const { vehicle, openTrip, consumption, price, litersInTank } = state;
  const driver = openTrip
    ? db.select().from(userTable).where(eq(userTable.id, openTrip.userId)).get()
    : undefined;

  // Solo chi entra davvero nella divisione: i membri fatturabili di questo mezzo.
  // La nonna guida e viaggia, ma la sua parte se la dividono i fratelli, quindi
  // metterla tra i passeggeri servirebbe solo a sbagliare il conto.
  const billable = new Set(billableMemberIds(vehicle.id));
  const passengers = db
    .select()
    .from(userTable)
    .where(eq(userTable.active, true))
    .all()
    .filter((u) => u.id !== me.id && billable.has(u.id))
    .map((u) => ({ id: u.id, name: u.name, billable: u.billable }));

  return (
    <div className="space-y-5">
      <Card className="px-4 py-4">
        <h1 className="text-xl font-semibold">{vehicle.name}</h1>
        <p className="tabular mt-1 text-3xl">{formatKm(vehicle.currentOdometerKm)}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm text-ink-dim">
          <div>
            <dt>Consumo in uso</dt>
            <dd className="tabular text-ink">
              {consumption.kmPerLiter.toFixed(1)} km/l{' '}
              <span className="text-xs text-ink-dim">
                {consumption.source === 'measured'
                  ? `misurato su ${consumption.sampleCount} pieni`
                  : 'da libretto'}
              </span>
            </dd>
          </div>
          <div>
            <dt>Prezzo usato</dt>
            <dd className="tabular text-ink">
              {formatEuro(price.pricePerLiterCents)}/l{' '}
              <span className="text-xs text-ink-dim">
                {price.source === 'tank_weighted'
                  ? 'medio in serbatoio'
                  : price.source === 'last_refuel'
                    ? 'ultimo pieno'
                    : 'di ripiego'}
              </span>
            </dd>
          </div>
          <div>
            <dt>Nel serbatoio</dt>
            <dd className="tabular text-ink">≈ {formatLiters(litersInTank)}</dd>
          </div>
          {vehicle.ownerNote ? (
            <div>
              <dt>Nota</dt>
              <dd className="text-ink">{vehicle.ownerNote}</dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {openTrip && openTrip.userId !== me.id ? (
        <section className="space-y-3">
          <Card className="px-4 py-4">
            <p className="font-medium">
              In uso da {driver?.name ?? '?'}, da {formatSince(openTrip.startedAt)}.
            </p>
            <p className="mt-1 text-sm text-ink-dim">
              Se l’ha lasciata aperta per sbaglio, puoi prenderla comunque: resta tracciato.
            </p>
          </Card>
          <TakeOverButton vehicleId={vehicle.id} />
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-ink-dim">
            {openTrip ? `Corsa in corso · ${formatSince(openTrip.startedAt)}` : 'Prendi il mezzo'}
          </h2>
          <TripPanel
            vehicleId={vehicle.id}
            currentOdometerKm={vehicle.currentOdometerKm}
            serverTrip={
              openTrip
                ? {
                    id: openTrip.id,
                    odometerStartKm: openTrip.odometerStartKm,
                    startedAt: openTrip.startedAt.toISOString(),
                  }
                : null
            }
            passengers={passengers}
            categories={listCategories().map((c) => c.name)}
          />
        </section>
      )}

      <Link
        href={`/mezzi/${vehicle.id}/rifornimento`}
        className="flex min-h-12 w-full items-center justify-center rounded-2xl glass-2 text-base font-medium text-ink"
      >
        Ho fatto rifornimento
      </Link>
    </div>
  );
}
