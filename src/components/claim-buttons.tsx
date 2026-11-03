'use client';

import { useActionState } from 'react';
import { assignUnclaimedAction, respondUnclaimedAction, type ActionState } from '@/app/actions';
import { ErrorBanner, PrimaryButton, SecondaryButton } from '@/components/ui';

export function ClaimButtons({
  unclaimedTripId,
  answered,
  assignees,
}: {
  unclaimedTripId: string;
  answered: 'mine' | 'not_mine' | null;
  /** Solo per l'admin: a chi può assegnare la corsa. Vuoto = la tendina non c'è. */
  assignees: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    respondUnclaimedAction,
    {},
  );
  const [assignState, assignAction, assignPending] = useActionState<ActionState, FormData>(
    assignUnclaimedAction,
    {},
  );

  return (
    <div className="space-y-2">
      <ErrorBanner>{state.error}</ErrorBanner>
      <form action={formAction}>
        <input type="hidden" name="unclaimedTripId" value={unclaimedTripId} />
        <input type="hidden" name="answer" value="mine" />
        <PrimaryButton type="submit" disabled={pending}>
          {answered === 'mine' ? 'Hai detto: sono miei' : 'Sì, sono miei'}
        </PrimaryButton>
      </form>
      <form action={formAction}>
        <input type="hidden" name="unclaimedTripId" value={unclaimedTripId} />
        <input type="hidden" name="answer" value="not_mine" />
        <SecondaryButton type="submit" disabled={pending}>
          {answered === 'not_mine' ? 'Hai detto: non sono miei' : 'No, non sono miei'}
        </SecondaryButton>
      </form>

      {assignees.length > 0 ? (
        <form action={assignAction} className="space-y-2 border-t border-line pt-3">
          <input type="hidden" name="unclaimedTripId" value={unclaimedTripId} />
          <ErrorBanner>{assignState.error}</ErrorBanner>
          <label className="block text-[13px] font-semibold text-ink-dim">
            Assegna a (admin)
            <select
              name="userId"
              required
              defaultValue=""
              className="mt-1 block min-h-12 w-full rounded-2xl glass-2 px-4 text-base text-ink"
            >
              <option value="" disabled>
                Scegli chi…
              </option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <SecondaryButton type="submit" disabled={assignPending}>
            Assegna la corsa
          </SecondaryButton>
        </form>
      ) : null}
    </div>
  );
}
