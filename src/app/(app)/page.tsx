import Link from 'next/link';
import { Card, EmptyState, SaldoGauge } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { formatEuro, formatKm, formatSince } from '@/lib/format';
import { getBalance, getRefuelSuggestion } from '@/lib/services/balances';
import { getOpenTrip, listVehicles } from '@/lib/services/vehicles';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const me = await requireUser();
  const balanceCents = getBalance(me.id);
  const suggestion = getRefuelSuggestion(me.id);
  const vehicles = listVehicles();

  const cards = vehicles.map((vehicle) => {
    const openTrip = getOpenTrip(vehicle.id);
    const driver = openTrip
      ? db.select().from(userTable).where(eq(userTable.id, openTrip.userId)).get()
      : undefined;
    return { vehicle, openTrip, driver };
  });

  const myOpen = cards.find((c) => c.openTrip?.userId === me.id);

  return (
    <div className="space-y-6">
      <Card className="px-4 py-5 text-center">
        <p className="text-sm uppercase tracking-widest text-ink-dim">Il tuo saldo</p>
        <div className="mt-2 flex justify-center">
          <SaldoGauge balanceCents={balanceCents} />
        </div>
        <p
          className={`tabular -mt-4 text-4xl font-semibold ${
            balanceCents < 0 ? 'text-debt' : 'text-credit'
          }`}
        >
          {formatEuro(balanceCents)}
        </p>
        <p className="mt-2 text-base text-ink-dim">{suggestion.message}</p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-ink-dim">I mezzi</h2>
        {cards.length === 0 ? (
          <EmptyState title="Nessun mezzo" hint="Chiedi all'admin di aggiungerne uno." />
        ) : null}
        {cards.map(({ vehicle, openTrip, driver }) => (
          <Link key={vehicle.id} href={`/mezzi/${vehicle.id}`} className="block">
            <Card accent={vehicle.color} className="px-4 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">{vehicle.name}</span>
                <span className={`text-sm ${openTrip ? 'text-amber' : 'text-ink-dim'}`}>
                  {openTrip
                    ? `in uso da ${driver?.name ?? '?'} · ${formatSince(openTrip.startedAt)}`
                    : 'libero'}
                </span>
              </div>
              <p className="tabular mt-1 text-2xl text-ink-dim">
                {formatKm(vehicle.currentOdometerKm)}
              </p>
            </Card>
          </Link>
        ))}
      </section>

      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-line bg-base/95 p-4 backdrop-blur">
        {myOpen ? (
          <Link
            href={`/mezzi/${myOpen.vehicle.id}`}
            className="flex min-h-14 w-full items-center justify-center rounded-xl bg-amber px-5 text-lg font-semibold text-amber-ink active:opacity-80"
          >
            Chiudi la corsa — {myOpen.vehicle.name}
          </Link>
        ) : (
          <p className="text-center text-sm text-ink-dim">Tocca un mezzo per prenderlo.</p>
        )}
      </div>
    </div>
  );
}
