'use client';

import { useActionState, useState } from 'react';
import {
  assignUnclaimedToGuestAction,
  respondUnclaimedAction,
  type ActionState,
} from '@/app/actions';
import { ErrorBanner, PrimaryButton, SecondaryButton, TextInput } from '@/components/ui';

export function ClaimButtons({
  unclaimedTripId,
  answered,
  guests,
}: {
  unclaimedTripId: string;
  answered: 'mine' | 'not_mine' | null;
  /** Chi è già stato registrato come ospite: papà, la nonna, un amico. */
  guests: string[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    respondUnclaimedAction,
    {},
  );
  const [guestState, guestAction, guestPending] = useActionState<ActionState, FormData>(
    assignUnclaimedToGuestAction,
    {},
  );
  const [apertoOspite, setApertoOspite] = useState(false);

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

      {/*
        La terza risposta: non sono di nessuno di noi, ma so di chi sono. L'ospite si
        crea scrivendo un nome — non è un utente dell'app, non entra e non divide i
        costi, ma i suoi km esistono, o il contachilometri non torna.
      */}
      {apertoOspite ? (
        <form action={guestAction} className="space-y-2">
          <input type="hidden" name="unclaimedTripId" value={unclaimedTripId} />
          <ErrorBanner>{guestState.error}</ErrorBanner>
          <TextInput
            name="nome"
            list={`ospiti-${unclaimedTripId}`}
            maxLength={40}
            placeholder="Papà"
            required
            autoFocus
          />
          <datalist id={`ospiti-${unclaimedTripId}`}>
            {guests.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <SecondaryButton type="submit" disabled={guestPending}>
            Addebita a chi ho scritto
          </SecondaryButton>
        </form>
      ) : (
        <SecondaryButton type="button" onClick={() => setApertoOspite(true)}>
          È stato qualcun altro (papà, un amico…)
        </SecondaryButton>
      )}
    </div>
  );
}
