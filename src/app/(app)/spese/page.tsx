import { eq } from 'drizzle-orm';
import { ExpenseForm } from '@/components/expense-form';
import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { formatDay, formatEuro } from '@/lib/format';
import { listExpenses } from '@/lib/services/expenses';
import { listVehicles } from '@/lib/services/vehicles';

export const dynamic = 'force-dynamic';

const RULE_LABEL = {
  by_km: 'a chilometri',
  equal: 'in parti uguali',
  custom: 'quote manuali',
  none: 'non divisa',
} as const;

export default async function ExpensesPage() {
  const me = await requireUser();
  const vehicles = listVehicles();
  const expenses = listExpenses();

  const people = db.select().from(userTable).where(eq(userTable.active, true)).all();
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? '?';
  const vehicleOf = (id: string) => vehicles.find((v) => v.id === id);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-[15px] font-semibold text-ink-dim">Spese fisse</h1>
        <ExpenseForm
          vehicles={vehicles.map((v) => ({ id: v.id, name: v.name }))}
          payers={people.map((p) => ({ id: p.id, name: p.name }))}
          meId={me.id}
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Registrate</h2>
        {expenses.length === 0 ? (
          <EmptyState
            title="Ancora nessuna spesa"
            hint="Assicurazione, bollo, tagliandi e riparazioni finiscono qui."
          />
        ) : null}
        {expenses.map((expense) => (
          <Card key={expense.id} accent={vehicleOf(expense.vehicleId)?.color} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium capitalize">{expense.category}</span>
              <span className="tabular text-lg">{formatEuro(expense.amountCents)}</span>
            </div>
            <p className="mt-1 text-sm text-ink-dim">
              {vehicleOf(expense.vehicleId)?.name} · {formatDay(expense.date)} · pagata da{' '}
              {nameOf(expense.paidByUserId)} · {RULE_LABEL[expense.splitRule]}
            </p>
            {expense.note ? <p className="mt-1 text-sm text-ink-dim">{expense.note}</p> : null}
          </Card>
        ))}
      </section>
    </div>
  );
}
