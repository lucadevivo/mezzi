import Link from 'next/link';
import { Card, EmptyState } from '@/components/ui';
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
    <div className={`space-y-3 ${myOpen ? 'pb-20' : ''}`}>
      {/* Il quadrante è sparito: di un saldo interessa la cifra, e la cifra da
          sola lascia entrare i mezzi nella prima schermata senza scorrere. */}
      <Card className="px-4 py-3">
        <p className="text-sm text-ink-dim">Il tuo saldo</p>
        <p
          className={`tabular mt-0.5 text-[40px] font-semibold leading-none ${
            balanceCents < 0 ? 'text-debt' : 'text-credit'
          }`}
        >
          {formatEuro(balanceCents)}
        </p>
        <p className="mt-2 text-sm text-ink-dim">{suggestion.message}</p>
      </Card>

      <section className="space-y-2">
        <h2 className="px-1 text-[15px] font-semibold text-ink-dim">I mezzi</h2>
        {cards.length === 0 ? (
          <EmptyState title="Nessun mezzo" hint="Chiedi all'admin di aggiungerne uno." />
        ) : null}
        {cards.map(({ vehicle, openTrip, driver }) => (
          <Link key={vehicle.id} href={`/mezzi/${vehicle.id}`} className="block">
            <Card accent={vehicle.color} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-lg font-semibold">{vehicle.name}</span>
                <span className={`text-sm ${openTrip ? 'text-accent' : 'text-ink-dim'}`}>
                  {openTrip
                    ? `in uso da ${driver?.name ?? '?'} · ${formatSince(openTrip.startedAt)}`
                    : 'libero'}
                </span>
              </div>
              <p className="tabular mt-0.5 text-xl text-ink-dim">
                {formatKm(vehicle.currentOdometerKm)}
              </p>
            </Card>
          </Link>
        ))}
      </section>

      {/* Solo l'azione vera galleggia sopra la tab bar. Il suggerimento è testo,
          e da fermo in mezzo allo schermo darebbe solo fastidio. */}
      {myOpen ? (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+84px)] z-20 mx-auto max-w-[26rem]">
          <Link
            href={`/mezzi/${myOpen.vehicle.id}`}
            className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-accent px-5 text-lg font-semibold text-accent-ink shadow-[0_10px_30px_oklch(0_0_0/50%)] transition-transform duration-200 active:scale-[0.97]"
          >
            Chiudi la corsa — {myOpen.vehicle.name}
          </Link>
        </div>
      ) : (
        <p className="px-1 text-center text-sm text-ink-dim">Tocca un mezzo per prenderlo.</p>
      )}
    </div>
  );
}
