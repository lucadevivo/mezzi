import { asc, desc, eq } from 'drizzle-orm';
import { ClaimButtons } from '@/components/claim-buttons';
import { Card, EmptyState } from '@/components/ui';
import { requireUser } from '@/lib/auth/session';
import { claimStatsFor } from '@/lib/services/history';
import { db } from '@/lib/db';
import { unclaimedTripResponses, unclaimedTrips, user, vehicles } from '@/lib/db/schema';
import { formatDay, formatEuro, formatKm, formatRemaining } from '@/lib/format';
import { currentResolution } from '@/lib/services/unclaimed';

export const dynamic = 'force-dynamic';

export default async function ClaimsPage() {
  const me = await requireUser();
  const now = new Date();

  const rows = db
    .select()
    .from(unclaimedTrips)
    .orderBy(desc(unclaimedTrips.detectedAt))
    .limit(30)
    .all();

  const users = db.select().from(user).orderBy(asc(user.name)).all();
  const names = new Map(users.map((u) => [u.id, u.name]));
  // La tendina «Assegna a» è solo dell'admin. Prima i fratelli, poi i non fatturabili.
  const assignees =
    me.role === 'admin'
      ? [
          ...users.filter((u) => u.billable),
          ...users.filter((u) => !u.billable).map((u) => ({ ...u, name: `${u.name} (ospite)` })),
        ].map((u) => ({ id: u.id, name: u.name }))
      : [];
  // Riepilogo per persona (spostato qui da Saldi): pubblico di proposito, chi nega sempre si vede.
  const claims = users
    .filter((u) => u.billable)
    .map((u) => ({ name: u.name, stats: claimStatsFor(u.id) }))
    .filter((c) => c.stats.detected + c.stats.claimed + c.stats.denied > 0);
  const vehicleNames = new Map(
    db
      .select()
      .from(vehicles)
      .all()
      .map((v) => [v.id, { name: v.name, color: v.color }]),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-[15px] font-semibold text-ink-dim">Corse non registrate</h1>

      {claims.length > 0 ? (
        <Card className="divide-y divide-line px-4 py-1">
          {claims.map((c) => (
            <div key={c.name} className="flex items-baseline justify-between gap-3 py-2">
              <span className="font-medium">{c.name}</span>
              <span className="tabular text-xs text-ink-dim">
                {c.stats.detected} rilevate · {c.stats.claimed} reclamate · {c.stats.denied}{' '}
                negate
              </span>
            </div>
          ))}
        </Card>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="Nessuna corsa da reclamare"
          hint="Quando i km sul cruscotto non tornano, la richiesta compare qui."
        />
      ) : null}

      {rows.map((row) => {
        const responses = db
          .select()
          .from(unclaimedTripResponses)
          .where(eq(unclaimedTripResponses.unclaimedTripId, row.id))
          .all();
        const mine = responses.find((r) => r.userId === me.id);
        const vehicle = vehicleNames.get(row.vehicleId);
        const resolution = row.status === 'pending' ? currentResolution(row, now) : null;

        return (
          <Card key={row.id} className="space-y-3 px-4 py-4">
            <div>
              <p className="font-semibold">
                {vehicle?.name} — {formatKm(row.distanceKm)} non registrati
              </p>
              <p className="text-sm text-ink-dim">
                tra il {formatDay(row.windowStartAt)} e il {formatDay(row.detectedAt)} · ≈{' '}
                {formatEuro(row.costCents)}
              </p>
              <p className="text-sm text-ink-dim">
                Rilevati da {names.get(row.detectedByUserId) ?? '?'}
              </p>
            </div>

            {row.status === 'pending' ? (
              <>
                <p className="text-sm text-accent">
                  Termine: {formatRemaining(row.deadlineAt, now)}
                  {resolution?.status === 'pending' && resolution.autoAssignCandidate
                    ? ` · se nessuno risponde, vanno a ${names.get(resolution.autoAssignCandidate) ?? '?'}`
                    : ''}
                </p>
                <ClaimButtons
                  unclaimedTripId={row.id}
                  answered={mine?.answer ?? null}
                  assignees={assignees}
                />
              </>
            ) : (
              <p className="text-sm text-ink-dim">{row.resolutionNote}</p>
            )}

            {responses.length > 0 ? (
              <div className="border-t border-line pt-2">
                <p className="text-[13px] font-semibold text-ink-dim">Risposte</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {responses.map((r) => (
                    <li key={r.id} className="flex justify-between">
                      <span>{names.get(r.userId) ?? '?'}</span>
                      <span className={r.answer === 'mine' ? 'text-ink' : 'text-ink-dim'}>
                        {r.answer === 'mine' ? 'sono miei' : 'non sono miei'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
        );
      })}

      <p className="text-xs text-ink-dim">
        Le risposte sono visibili a tutti. Se nessuno reclama entro il termine, il costo si divide
        tra i membri del mezzo: negare non conviene mai rispetto a dire la verità.
      </p>
    </div>
  );
}
