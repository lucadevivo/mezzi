import { eq } from 'drizzle-orm';
import { ConfirmSettlementButton, SettlementForm } from '@/components/settlement-forms';
import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { formatDay, formatEuro } from '@/lib/format';
import { listSettlements } from '@/lib/services/settlements';

export const dynamic = 'force-dynamic';

export default async function SettlementsPage() {
  const me = await requireUser();

  const people = db
    .select()
    .from(userTable)
    .where(eq(userTable.active, true))
    .all()
    .filter((p) => p.id !== me.id);
  const nameOf = (id: string) =>
    id === me.id ? 'tu' : (people.find((p) => p.id === id)?.name ?? '?');

  const settlements = listSettlements();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-[15px] font-semibold text-ink-dim">Ho pagato qualcuno</h1>
        <SettlementForm people={people.map((p) => ({ id: p.id, name: p.name }))} />
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Pareggi</h2>
        {settlements.length === 0 ? (
          <EmptyState
            title="Nessun pareggio"
            hint="Quando qualcuno salda in contanti o con Satispay, si registra qui."
          />
        ) : null}
        {settlements.map((s) => {
          const waitingOnMe = s.toUserId === me.id && !s.confirmedByRecipient;
          return (
            <Card key={s.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span>
                  {nameOf(s.fromUserId)} → {nameOf(s.toUserId)}
                </span>
                <span className="tabular text-lg">{formatEuro(s.amountCents)}</span>
              </div>
              <p className="mt-1 text-sm text-ink-dim">
                {formatDay(s.date)} · {s.method} ·{' '}
                {s.confirmedByRecipient ? (
                  <span className="text-credit">confermato</span>
                ) : (
                  <span className="text-accent">in attesa di conferma</span>
                )}
              </p>
              {s.note ? <p className="mt-1 text-sm text-ink-dim">{s.note}</p> : null}
              {waitingOnMe ? <ConfirmSettlementButton settlementId={s.id} /> : null}
            </Card>
          );
        })}
        <p className="text-xs text-ink-dim">
          Un pareggio conta solo quando chi riceve conferma: finché non lo fa, i saldi non si
          muovono.
        </p>
      </section>
    </div>
  );
}
