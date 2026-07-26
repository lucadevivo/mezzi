'use client';

import { useActionState, useState } from 'react';
import { closeTripAction, type ActionState } from '@/app/actions';
import { ErrorBanner, Field, NumberInput, PrimaryButton, TextInput } from '@/components/ui';
import { formatKm } from '@/lib/format';

export interface PassengerOption {
  id: string;
  name: string;
  billable: boolean;
}

export function CloseTripForm({
  tripId,
  vehicleId,
  odometerStartKm,
  passengers,
}: {
  tripId: string;
  vehicleId: string;
  odometerStartKm: number;
  passengers: PassengerOption[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(closeTripAction, {});
  const [showPassengers, setShowPassengers] = useState(false);
  // Campo controllato: se l'azione torna con un warning da confermare, il valore
  // già digitato non deve sparire e costringere a riscriverlo davanti alla macchina.
  const [odometerEnd, setOdometerEnd] = useState(String(Math.round(odometerStartKm)));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tripId" value={tripId} />
      <input type="hidden" name="vehicleId" value={vehicleId} />

      <Field label="Contachilometri di arrivo" hint={`Partenza: ${formatKm(odometerStartKm)}`}>
        <NumberInput
          name="odometerEndKm"
          value={odometerEnd}
          onChange={(e) => setOdometerEnd(e.target.value)}
          required
        />
      </Field>

      <button
        type="button"
        onClick={() => setShowPassengers((v) => !v)}
        className="text-sm text-ink-dim underline"
      >
        {showPassengers ? 'Nascondi passeggeri' : 'C’era qualcuno con te?'}
      </button>

      {showPassengers ? (
        <fieldset className="space-y-2 rounded-xl border border-line p-3">
          <legend className="px-1 text-sm text-ink-dim">
            Il costo si divide tra chi era a bordo
          </legend>
          {passengers.map((p) => (
            <label key={p.id} className="flex min-h-11 items-center gap-3">
              <input type="checkbox" name="passengerIds" value={p.id} className="size-5" />
              <span>
                {p.name}
                {p.billable ? '' : ' (non entra nei conti tra fratelli)'}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <Field label="Nota (facoltativa)">
        <TextInput name="note" maxLength={500} placeholder="Es. gita a Ostia" />
      </Field>

      <ErrorBanner>{state.error}</ErrorBanner>
      {state.needsConfirm ? <input type="hidden" name="conferma" value="si" /> : null}

      <PrimaryButton type="submit" disabled={pending}>
        {state.needsConfirm ? 'Confermo, chiudi la corsa' : 'Chiudi la corsa'}
      </PrimaryButton>
    </form>
  );
}
