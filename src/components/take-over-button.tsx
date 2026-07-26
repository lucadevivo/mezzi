'use client';

import { useActionState } from 'react';
import { takeOverTripAction, type ActionState } from '@/app/actions';
import { ErrorBanner, SecondaryButton } from '@/components/ui';

export function TakeOverButton({ vehicleId }: { vehicleId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    takeOverTripAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <ErrorBanner>{state.error}</ErrorBanner>
      <SecondaryButton type="submit" disabled={pending}>
        Prendila comunque
      </SecondaryButton>
    </form>
  );
}
