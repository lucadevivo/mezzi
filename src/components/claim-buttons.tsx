'use client';

import { useActionState } from 'react';
import { respondUnclaimedAction, type ActionState } from '@/app/actions';
import { ErrorBanner, PrimaryButton, SecondaryButton } from '@/components/ui';

export function ClaimButtons({
  unclaimedTripId,
  answered,
}: {
  unclaimedTripId: string;
  answered: 'mine' | 'not_mine' | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    respondUnclaimedAction,
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
    </div>
  );
}
