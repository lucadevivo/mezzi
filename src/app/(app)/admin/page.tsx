import Link from 'next/link';
import { InviteGenerator } from '@/components/invite-generator';
import { Card } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { formatKm } from '@/lib/format';
import { listVehicles } from '@/lib/services/vehicles';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  await requireAdmin();
  const users = db.select().from(userTable).all();
  const vehicles = listVehicles();

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-[15px] font-semibold text-ink-dim">Inviti</h1>
        <InviteGenerator />
        <Link
          href="/admin/audit"
          className="flex min-h-12 w-full items-center justify-center rounded-2xl glass-2 text-base font-medium"
        >
          Audit log
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Utenti</h2>
        {users.map((u) => (
          <Card key={u.id} className="flex items-center justify-between px-4 py-3">
            <span>{u.name}</span>
            <span className="text-sm text-ink-dim">
              {u.role === 'admin' ? 'admin · ' : ''}
              {u.billable ? 'nei conti' : 'fuori dai conti'}
              {u.canLogin ? '' : ' · senza accesso'}
            </span>
          </Card>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-dim">Mezzi</h2>
        {vehicles.map((v) => (
          <Card key={v.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <span>{v.name}</span>
              <span className="tabular text-sm text-ink-dim">{formatKm(v.currentOdometerKm)}</span>
            </div>
            <p className="mt-1 text-xs text-ink-dim">
              Soglia discrepanza {v.discrepancyThresholdKm} km · rumore accumulato{' '}
              {v.driftBufferKm.toFixed(1)} km · consumo{' '}
              {(v.computedConsumptionKmL ?? v.declaredConsumptionKmL).toFixed(1)} km/l
            </p>
          </Card>
        ))}
      </section>
    </div>
  );
}
