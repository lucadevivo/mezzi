import { Card, EmptyState } from '@/components/ui';
import { requireAdmin } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user as userTable } from '@/lib/db/schema';
import { formatDateTime } from '@/lib/format';
import { listAuditLog } from '@/lib/services/history';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  await requireAdmin();
  const entries = listAuditLog();
  const people = db.select().from(userTable).all();
  const nameOf = (id: string | null) =>
    id ? (people.find((p) => p.id === id)?.name ?? '?') : 'sistema';

  return (
    <div className="space-y-4">
      <h1 className="text-sm uppercase tracking-widest text-ink-dim">Audit log</h1>

      {entries.length === 0 ? (
        <EmptyState title="Niente da tracciare" hint="Qui finisce ogni scrittura sensibile." />
      ) : null}

      {entries.map((entry) => (
        <Card key={entry.id} className="px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="tabular text-sm">{entry.action}</span>
            <span className="text-xs text-ink-dim">{formatDateTime(entry.occurredAt)}</span>
          </div>
          <p className="mt-1 text-sm text-ink-dim">
            {nameOf(entry.userId)} · {entry.entityType}
          </p>
          {entry.payload ? (
            <pre className="tabular mt-2 overflow-x-auto rounded-lg bg-surface-2 p-2 text-xs text-ink-dim">
              {JSON.stringify(entry.payload)}
            </pre>
          ) : null}
        </Card>
      ))}
    </div>
  );
}
