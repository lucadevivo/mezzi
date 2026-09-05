'use client';

import { useActionState, useState } from 'react';
import { completeDeadlineAction, createDeadlineAction, type ActionState } from '@/app/actions';
import {
  ErrorBanner,
  Field,
  NumberInput,
  PrimaryButton,
  SecondaryButton,
  TextInput,
} from '@/components/ui';

const TYPES = [
  { value: 'assicurazione', label: 'Assicurazione', byKm: false },
  { value: 'bollo', label: 'Bollo', byKm: false },
  { value: 'revisione', label: 'Revisione', byKm: false },
  { value: 'tagliando', label: 'Tagliando', byKm: true },
] as const;

const selectClass =
  'min-h-12 w-full rounded-2xl glass-2 px-4 text-base text-ink';

export function DeadlineForm({ vehicles }: { vehicles: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createDeadlineAction,
    {},
  );
  const [type, setType] = useState<string>('assicurazione');
  const byKm = TYPES.find((t) => t.value === type)?.byKm ?? false;

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Mezzo">
        <select name="vehicleId" className={selectClass}>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cosa scade">
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className={selectClass}
        >
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Data di scadenza" hint={byKm ? 'Facoltativa per il tagliando.' : undefined}>
        <TextInput type="date" name="dueDate" required={!byKm} />
      </Field>

      {/* Il tagliando scade a chilometri, non a calendario. */}
      <Field label="Oppure ai chilometri" hint="Es. 120000. Vale il criterio che arriva prima.">
        <NumberInput name="dueOdometerKm" placeholder="120000" />
      </Field>

      <Field label="Avvisami quanti giorni prima">
        <NumberInput name="notifyDaysBefore" defaultValue="15" />
      </Field>

      <ErrorBanner>{state.error}</ErrorBanner>
      <PrimaryButton type="submit" disabled={pending}>
        Aggiungi la scadenza
      </PrimaryButton>
    </form>
  );
}

export function CompleteDeadlineButton({ deadlineId }: { deadlineId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    completeDeadlineAction,
    {},
  );

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="deadlineId" value={deadlineId} />
      <ErrorBanner>{state.error}</ErrorBanner>
      <SecondaryButton type="submit" disabled={pending}>
        Fatto
      </SecondaryButton>
    </form>
  );
}
