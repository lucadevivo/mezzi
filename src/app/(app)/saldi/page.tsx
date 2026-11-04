import { BalanceCell, Card } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { formatKm } from '@/lib/format';
import { listBalancesByVehicle } from '@/lib/services/balances';

export const dynamic = 'force-dynamic';

function etichetta(km: number): string {
  if (km < 0) return `${formatKm(-km)} da coprire`;
  return km > 0 ? `${formatKm(km)} di autonomia` : 'in pari';
}

export default async function BalancesPage() {
  await requireUser();
  const perVehicle = listBalancesByVehicle();

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
                <div key={b.userId} className="space-y-1">
                  <p className="px-1 text-sm text-ink-dim">{b.name}</p>
                  {/* Il consiglio è visibile a tutti: chiunque può coprire il debito di un altro. */}
                  <BalanceCell km={b.balanceKm} topupCents={b.topupCents} format={formatKm} size="md" />
                </div>
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

    </div>
  );
}
