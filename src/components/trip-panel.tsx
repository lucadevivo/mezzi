'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState, useTransition } from 'react';
import {
  checkOdometerAction,
  closeTripAction,
  startTripAction,
  type ActionState,
  type OdometerCheckResult,
} from '@/app/actions';
import { OdometerPad } from '@/components/odometer-pad';
import { ErrorBanner, Field, PrimaryButton, SecondaryButton, TextInput } from '@/components/ui';
import { usePendingTrip } from '@/lib/offline/hooks';
import { enqueue } from '@/lib/offline/queue';
import { clearPendingTrip, setPendingTrip, type PendingTrip } from '@/lib/offline/pending-trip';
import { formatEuro, formatKm, formatSince } from '@/lib/format';

export interface PassengerOption {
  id: string;
  name: string;
  billable: boolean;
}

interface OpenTrip {
  id: string;
  odometerStartKm: number;
  startedAt: string;
  /** Avviata senza rete e non ancora arrivata al server. */
  pending: boolean;
}

export function TripPanel({
  vehicleId,
  currentOdometerKm,
  serverTrip,
  passengers,
}: {
  vehicleId: string;
  currentOdometerKm: number;
  serverTrip: { id: string; odometerStartKm: number; startedAt: string } | null;
  passengers: PassengerOption[];
}) {
  const pending = usePendingTrip(vehicleId);

  const trip: OpenTrip | null = serverTrip
    ? { ...serverTrip, pending: false }
    : pending
      ? {
          id: pending.tripId,
          odometerStartKm: pending.odometerStartKm,
          startedAt: pending.startedAt,
          pending: true,
        }
      : null;

  if (trip) return <CloseTrip trip={trip} vehicleId={vehicleId} passengers={passengers} />;

  return <StartTrip vehicleId={vehicleId} currentOdometerKm={currentOdometerKm} />;
}

/* ---------------------------------- avvio ---------------------------------- */

function StartTrip({
  vehicleId,
  currentOdometerKm,
}: {
  vehicleId: string;
  currentOdometerKm: number;
}) {
  const [state, formAction, submitting] = useActionState<ActionState, FormData>(
    startTripAction,
    {},
  );
  const [odometer, setOdometer] = useState(String(Math.round(currentOdometerKm)));
  const [check, setCheck] = useState<OdometerCheckResult | null>(null);
  const [checking, startChecking] = useTransition();
  const [offlineError, setOfflineError] = useState<string | null>(null);

  const km = Number(odometer.replace(',', '.'));

  const verify = () => {
    if (!Number.isFinite(km)) return;

    // Senza rete non si può chiedere niente al server: la corsa si registra
    // lo stesso e i conti si sistemano quando la coda parte.
    if (!navigator.onLine) {
      if (km < currentOdometerKm) {
        setOfflineError(
          `Il contachilometri non può tornare indietro: ultimo valore ${formatKm(currentOdometerKm)}.`,
        );
        return;
      }
      const trip: PendingTrip = {
        tripId: crypto.randomUUID(),
        vehicleId,
        odometerStartKm: km,
        startedAt: new Date().toISOString(),
      };
      void enqueue('start_trip', { vehicleId, odometerKm: km, tripId: trip.tripId }).then(() => {
        // `setPendingTrip` avvisa da solo: il pannello passa alla chiusura corsa.
        setPendingTrip(trip);
      });
      return;
    }

    startChecking(async () => setCheck(await checkOdometerAction(vehicleId, km)));
  };

  const hidden = (answer?: string) => (
    <>
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <input type="hidden" name="odometerKm" value={odometer} />
      {answer ? <input type="hidden" name="unclaimedAnswer" value={answer} /> : null}
    </>
  );

  return (
    <div className="space-y-4">
      <OdometerPad
        name="odometerKm"
        label="Contachilometri adesso"
        value={odometer}
        onChange={(value) => {
          setOdometer(value);
          setCheck(null);
          setOfflineError(null);
        }}
        hint={`Ultimo valore: ${formatKm(currentOdometerKm)}`}
      />

      <ErrorBanner>
        {state.error ?? offlineError ?? (check?.kind === 'error' ? check.message : null)}
      </ErrorBanner>

      {check === null || check.kind === 'error' ? (
        <PrimaryButton type="button" onClick={verify} disabled={checking}>
          {checking ? 'Controllo…' : 'Avanti'}
        </PrimaryButton>
      ) : null}

      {check?.kind === 'ok' ? (
        <form action={formAction}>
          {hidden()}
          <PrimaryButton type="submit" disabled={submitting}>
            Avvia la corsa
          </PrimaryButton>
        </form>
      ) : null}

      {check?.kind === 'open_trip' ? <p className="text-ink-dim">{check.message}</p> : null}

      {check?.kind === 'unclaimed' ? (
        <div className="space-y-3 rounded-xl border border-amber/40 bg-amber/10 p-4">
          <p className="font-semibold text-ink">
            {formatKm(check.distanceKm ?? 0)} non registrati su questo mezzo
          </p>
          <p className="text-sm text-ink-dim">
            Valgono circa {formatEuro(check.costCents ?? 0)}. Sono tuoi?
          </p>
          <form action={formAction}>
            {hidden('mine')}
            <PrimaryButton type="submit" disabled={submitting}>
              Li ho fatti io — parti
            </PrimaryButton>
          </form>
          <form action={formAction}>
            {hidden('not_mine')}
            <SecondaryButton type="submit" disabled={submitting}>
              Non sono stato io
            </SecondaryButton>
          </form>
          <form action={formAction}>
            {hidden('unknown')}
            <SecondaryButton type="submit" disabled={submitting}>
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

/* --------------------------------- chiusura --------------------------------- */

function CloseTrip({
  trip,
  vehicleId,
  passengers,
}: {
  trip: OpenTrip;
  vehicleId: string;
  passengers: PassengerOption[];
}) {
  const router = useRouter();
  const [state, formAction, submitting] = useActionState<ActionState, FormData>(
    closeTripAction,
    {},
  );
  const [odometerEnd, setOdometerEnd] = useState(String(Math.round(trip.odometerStartKm)));
  const [showPassengers, setShowPassengers] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [offlineError, setOfflineError] = useState<string | null>(null);

  const closeOffline = () => {
    const km = Number(odometerEnd.replace(',', '.'));
    if (!Number.isFinite(km) || km <= trip.odometerStartKm) {
      setOfflineError(
        `I km finali devono superare quelli di partenza (${formatKm(trip.odometerStartKm)}).`,
      );
      return;
    }
    void enqueue('close_trip', {
      tripId: trip.id,
      odometerEndKm: km,
      passengerIds: selected,
      note,
    }).then(() => {
      clearPendingTrip();

      router.refresh();
    });
  };

  const fields = (
    <>
      <OdometerPad
        name="odometerEndKm"
        label="Contachilometri di arrivo"
        value={odometerEnd}
        onChange={(value) => {
          setOdometerEnd(value);
          setOfflineError(null);
        }}
        hint={`Partenza: ${formatKm(trip.odometerStartKm)} · ${formatSince(new Date(trip.startedAt))}`}
      />

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
              <input
                type="checkbox"
                name="passengerIds"
                value={p.id}
                checked={selected.includes(p.id)}
                onChange={(e) =>
                  setSelected((current) =>
                    e.target.checked ? [...current, p.id] : current.filter((id) => id !== p.id),
                  )
                }
                className="size-5"
              />
              <span>
                {p.name}
                {p.billable ? '' : ' (non entra nei conti tra fratelli)'}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}

      <Field label="Nota (facoltativa)">
        <TextInput
          name="note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Es. gita a Ostia"
        />
      </Field>
    </>
  );

  if (trip.pending) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
          Corsa avviata senza rete: parte da sola appena torna il segnale.
        </p>
        {fields}
        <ErrorBanner>{offlineError}</ErrorBanner>
        <PrimaryButton type="button" onClick={closeOffline}>
          Chiudi la corsa
        </PrimaryButton>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tripId" value={trip.id} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      {fields}
      <ErrorBanner>{state.error}</ErrorBanner>
      {state.needsConfirm ? <input type="hidden" name="conferma" value="si" /> : null}
      <PrimaryButton type="submit" disabled={submitting}>
        {state.needsConfirm ? 'Confermo, chiudi la corsa' : 'Chiudi la corsa'}
      </PrimaryButton>
    </form>
  );
}
