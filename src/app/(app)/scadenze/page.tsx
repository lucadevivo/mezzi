import { CompleteDeadlineButton, DeadlineForm } from '@/components/deadline-forms';
import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { formatDay } from '@/lib/format';
import { listDeadlines } from '@/lib/services/deadlines';
import { listVehicles } from '@/lib/services/vehicles';

export const dynamic = 'force-dynamic';

const STATE_STYLE = {
  overdue: 'text-debt',
  soon: 'text-amber',
  ok: 'text-ink-dim',
} as const;

export default async function DeadlinesPage() {
  await requireUser();
  const vehicles = listVehicles();
  const deadlines = listDeadlines();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-[15px] font-semibold text-ink-dim">Scadenze</h1>
        {deadlines.length === 0 ? (
          <EmptyState
            title="Nessuna scadenza"
            hint="Assicurazione, bollo, revisione e tagliando: aggiungile qui sotto."
          />
        ) : null}
        {deadlines.map(({ deadline, vehicleName, vehicleColor, status, message }) => (
          <Card key={deadline.id} accent={vehicleColor} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-medium capitalize">{deadline.type}</span>
              <span className={`text-sm ${STATE_STYLE[status.state]}`}>{message}</span>
            </div>
            <p className="mt-1 text-sm text-ink-dim">
              {vehicleName}
              {deadline.dueDate ? ` · ${formatDay(deadline.dueDate)}` : ''}
              {deadline.dueOdometerKm
                ? ` · a ${deadline.dueOdometerKm.toLocaleString('it-IT')} km`
                : ''}
            </p>
            <CompleteDeadlineButton deadlineId={deadline.id} />
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Aggiungi</h2>
        <DeadlineForm vehicles={vehicles.map((v) => ({ id: v.id, name: v.name }))} />
      </section>
    </div>
  );
}
