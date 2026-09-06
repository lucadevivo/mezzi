import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { formatKm } from '@/lib/format';
import { listBalances } from '@/lib/services/balances';
import { claimStatsFor } from '@/lib/services/history';

export const dynamic = 'force-dynamic';

/** Il segno del saldo si legge a colpo d'occhio: rosso indietro, verde avanti. */
function tono(km: number): string {
  if (km < 0) return 'text-debt';
  return km > 0 ? 'text-credit' : 'text-ink-dim';
}

function etichetta(km: number): string {
  if (km < 0) return `${formatKm(-km)} da coprire`;
  return km > 0 ? `${formatKm(km)} di autonomia` : 'in pari';
}

export default async function BalancesPage() {
  await requireUser();
  const balances = listBalances();

  const billable = balances.filter((b) => b.billable);
  const others = balances.filter((b) => !b.billable && b.balanceKm !== 0);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-[15px] font-semibold text-ink-dim">Saldi</h1>
        {billable.map((b) => {
          const stats = claimStatsFor(b.userId);
          return (
            <Card key={b.userId} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{b.name}</span>
                <span className={`tabular text-lg ${tono(b.balanceKm)}`}>
                  {etichetta(b.balanceKm)}
                </span>
              </div>
              {/* Pubblica di proposito: chi nega sempre, alla lunga, si vede. */}
              {stats.detected + stats.claimed + stats.denied > 0 ? (
                <p className="tabular mt-1 text-xs text-ink-dim">
                  corse non registrate: {stats.detected} rilevate · {stats.claimed} reclamate ·{' '}
                  {stats.denied} negate
                </p>
              ) : null}
            </Card>
          );
        })}
      </section>

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-ink-dim">Come si pareggia</h2>
        <EmptyState
          title="Mettendo carburante"
          hint="Chi è indietro rientra al distributore: i soldi che mette diventano chilometri. Non ci si passa denaro."
        />
      </section>

      {others.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-ink-dim">Fuori dai conti</h2>
          {others.map((b) => (
            <Card key={b.userId} className="flex items-center justify-between px-4 py-3">
              <span>{b.name}</span>
              <span className="tabular text-ink-dim">{etichetta(b.balanceKm)}</span>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
