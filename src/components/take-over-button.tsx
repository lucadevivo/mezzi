'use client';

import { useActionState, useState } from 'react';
import { takeOverTripAction, type ActionState } from '@/app/actions';
import { OdometerPad, padValue } from '@/components/odometer-pad';
import { ErrorBanner, SecondaryButton } from '@/components/ui';
import { formatKm } from '@/lib/format';

/**
 * Il contachilometri serve: è il punto in cui finisce la corsa dell'altro e comincia
 * la tua. Senza, i km dell'altro finirebbero sul tuo saldo.
 */
export function TakeOverButton({
  vehicleId,
  currentOdometerKm,
}: {
  vehicleId: string;
  currentOdometerKm: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    takeOverTripAction,
    {},
  );
  const [odometer, setOdometer] = useState(padValue(currentOdometerKm));

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <OdometerPad
        name="odometerKm"
        label="Contachilometri adesso"
        value={odometer}
        onChange={setOdometer}
        hint={`La sua corsa si chiude qui · ultimo valore: ${formatKm(currentOdometerKm)}`}
      />
      <ErrorBanner>{state.error}</ErrorBanner>
      <SecondaryButton type="submit" disabled={pending}>
        Prendila comunque
      </SecondaryButton>
    </form>
  );
}
