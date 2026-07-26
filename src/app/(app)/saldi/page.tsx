import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { formatEuro } from '@/lib/format';
import { getSettlementPlan, listBalances } from '@/lib/services/balances';

export const dynamic = 'force-dynamic';

export default async function BalancesPage() {
  await requireUser();
  const balances = listBalances();
  const plan = getSettlementPlan();
  const nameOf = (id: string) => balances.find((b) => b.userId === id)?.name ?? '?';

  const billable = balances.filter((b) => b.billable);
  const others = balances.filter((b) => !b.billable && b.balanceCents !== 0);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-sm uppercase tracking-widest text-ink-dim">Saldi</h1>
        {billable.map((b) => (
          <Card
            key={b.userId}
            accent={b.color}
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="font-medium">{b.name}</span>
            <span
              className={`tabular text-lg ${
                b.balanceCents < 0
                  ? 'text-debt'
                  : b.balanceCents > 0
                    ? 'text-credit'
                    : 'text-ink-dim'
              }`}
            >
              {formatEuro(b.balanceCents)}
            </span>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-ink-dim">Chi deve cosa a chi</h2>
        {plan.length === 0 ? (
          <EmptyState title="Siete in pari" hint="Nessun passaggio di denaro necessario." />
        ) : (
          plan.map((t, i) => (
            <Card key={`${t.from}-${t.to}-${i}`} className="px-4 py-3">
              <p>
                <span className="font-medium">{nameOf(t.from)}</span> deve{' '}
                <span className="tabular text-amber">{formatEuro(t.amountCents)}</span> a{' '}
                <span className="font-medium">{nameOf(t.to)}</span>
              </p>
            </Card>
          ))
        )}
        <p className="text-xs text-ink-dim">
          I pareggi si registrano dalla Fase 2: per ora questa è la fotografia di chi ha anticipato.
        </p>
      </section>

      {others.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm uppercase tracking-widest text-ink-dim">Fuori dai conti</h2>
          {others.map((b) => (
            <Card key={b.userId} className="flex items-center justify-between px-4 py-3">
              <span>{b.name}</span>
              <span className="tabular text-ink-dim">{formatEuro(b.balanceCents)}</span>
            </Card>
          ))}
          <p className="text-xs text-ink-dim">
            Km registrati ed euro tracciati, ma non entrano nella ripartizione tra fratelli.
          </p>
        </section>
      ) : null}
    </div>
  );
}
