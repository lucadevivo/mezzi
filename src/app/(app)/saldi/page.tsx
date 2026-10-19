import { Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { formatKm } from '@/lib/format';
import { listBalancesByVehicle } from '@/lib/services/balances';
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
  const perVehicle = listBalancesByVehicle();

  // Le corse non registrate sono un dato per persona, non per mezzo: stanno in fondo, una volta sola.
  const claimUserIds = [
    ...new Map(perVehicle.flatMap((v) => v.rows).map((r) => [r.userId, r])).values(),
  ].filter((r) => r.billable);
  const claims = claimUserIds
    .map((r) => ({ name: r.name, stats: claimStatsFor(r.userId) }))
    .filter((c) => c.stats.detected + c.stats.claimed + c.stats.denied > 0);

  return (
    <div className="space-y-6">
      <h1 className="text-[15px] font-semibold text-ink-dim">Saldi per mezzo</h1>

      {perVehicle.length === 0 ? (
        <Card className="px-4 py-3 text-sm text-ink-dim">Ancora nessun movimento.</Card>
      ) : (
        perVehicle.map((v) => {
          const billable = v.rows.filter((r) => r.billable);
          const others = v.rows.filter((r) => !r.billable && r.balanceKm !== 0);
          return (
            <section key={v.vehicleId} className="space-y-2">
              <h2 className="text-sm font-medium">{v.name}</h2>
              {billable.map((b) => (
                <Card key={b.userId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-medium">{b.name}</span>
                    <span className={`tabular text-lg ${tono(b.balanceKm)}`}>
                      {etichetta(b.balanceKm)}
                    </span>
                  </div>
                  {/* Il consiglio è visibile a tutti: chiunque può coprire il debito di un altro. */}
                  {b.balanceKm < 0 && b.topupCents > 0 ? (
                    <p className="tabular mt-1 text-xs text-ink-dim">
                      topup: ~{(b.topupCents / 100).toFixed(0)} € di benzina su {v.name}
                    </p>
                  ) : null}
                </Card>
              ))}
              {others.map((b) => (
                <Card
                  key={b.userId}
                  className="flex items-center justify-between px-4 py-2 text-ink-dim"
                >
                  <span>{b.name}</span>
                  <span className="tabular">{etichetta(b.balanceKm)}</span>
                </Card>
              ))}
            </section>
          );
        })
      )}

      {claims.length > 0 ? (
        <section className="space-y-2">
          {/* Pubblica di proposito: chi nega sempre, alla lunga, si vede. */}
          <h2 className="text-[15px] font-semibold text-ink-dim">Corse non registrate</h2>
          {claims.map((c) => (
            <Card key={c.name} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{c.name}</span>
                <span className="tabular text-xs text-ink-dim">
                  {c.stats.detected} rilevate · {c.stats.claimed} reclamate · {c.stats.denied} negate
                </span>
              </div>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  );
}
