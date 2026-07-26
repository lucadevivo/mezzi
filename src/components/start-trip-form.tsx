'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  checkOdometerAction,
  startTripAction,
  type ActionState,
  type OdometerCheckResult,
} from '@/app/actions';
import { ErrorBanner, Field, NumberInput, PrimaryButton, SecondaryButton } from '@/components/ui';
import { formatEuro, formatKm } from '@/lib/format';

type Answer = 'mine' | 'not_mine' | 'unknown';

/**
 * Due passi, non uno: prima si legge il contachilometri, e solo se salta fuori
 * una differenza si chiede a chi appartiene. Chi non ha discrepanze parte e basta.
 */
export function StartTripForm({
  vehicleId,
  currentOdometerKm,
}: {
  vehicleId: string;
  currentOdometerKm: number;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(startTripAction, {});
  const [odometer, setOdometer] = useState(String(Math.round(currentOdometerKm)));
  const [check, setCheck] = useState<OdometerCheckResult | null>(null);
  const [checking, startChecking] = useTransition();

  const verify = () => {
    const value = Number(odometer.replace(',', '.'));
    if (!Number.isFinite(value)) return;
    startChecking(async () => setCheck(await checkOdometerAction(vehicleId, value)));
  };

  const submit = (answer?: Answer) => (
    <form action={formAction}>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="odometerKm" value={odometer} />
      {answer ? <input type="hidden" name="unclaimedAnswer" value={answer} /> : null}
      <PrimaryButton type="submit" disabled={pending}>
        {answer === 'mine' ? 'Li ho fatti io — parti' : 'Avvia la corsa'}
      </PrimaryButton>
    </form>
  );

  return (
    <div className="space-y-4">
      <Field label="Contachilometri adesso" hint={`Ultimo valore: ${formatKm(currentOdometerKm)}`}>
        <NumberInput
          name="odometerKm"
          value={odometer}
          onChange={(e) => {
            setOdometer(e.target.value);
            setCheck(null);
          }}
          aria-label="Contachilometri adesso"
        />
      </Field>

      <ErrorBanner>{state.error ?? (check?.kind === 'error' ? check.message : null)}</ErrorBanner>

      {check === null || check.kind === 'error' ? (
        <PrimaryButton type="button" onClick={verify} disabled={checking}>
          {checking ? 'Controllo…' : 'Avanti'}
        </PrimaryButton>
      ) : null}

      {check?.kind === 'ok' ? submit() : null}

      {check?.kind === 'open_trip' ? <p className="text-ink-dim">{check.message}</p> : null}

      {check?.kind === 'unclaimed' ? (
        <div className="space-y-3 rounded-xl border border-amber/40 bg-amber/10 p-4">
          <p className="font-semibold text-ink">
            {formatKm(check.distanceKm ?? 0)} non registrati su questo mezzo
          </p>
          <p className="text-sm text-ink-dim">
            Valgono circa {formatEuro(check.costCents ?? 0)}. Sono tuoi?
          </p>
          {submit('mine')}
          <form action={formAction}>
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <input type="hidden" name="odometerKm" value={odometer} />
            <input type="hidden" name="unclaimedAnswer" value="not_mine" />
            <SecondaryButton type="submit" disabled={pending}>
              Non sono stato io
            </SecondaryButton>
          </form>
          <form action={formAction}>
            <input type="hidden" name="vehicleId" value={vehicleId} />
            <input type="hidden" name="odometerKm" value={odometer} />
            <input type="hidden" name="unclaimedAnswer" value="unknown" />
            <SecondaryButton type="submit" disabled={pending}>
              Non lo so
            </SecondaryButton>
          </form>
          <p className="text-xs text-ink-dim">
            Se non sono tuoi, la domanda va a tutti gli altri. Le risposte sono visibili a tutti.
          </p>
        </div>
      ) : null}
    </div>
  );
}
