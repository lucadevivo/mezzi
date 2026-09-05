'use client';

import { useActionState } from 'react';
import { confirmSettlementAction, createSettlementAction, type ActionState } from '@/app/actions';
import { ErrorBanner, Field, NumberInput, PrimaryButton, TextInput } from '@/components/ui';

const selectClass =
  'min-h-12 w-full rounded-2xl glass-2 px-4 text-base text-ink';

export function SettlementForm({ people }: { people: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createSettlementAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <Field label="A chi hai dato i soldi">
        <select name="toUserId" className={selectClass}>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Quanto (€)">
        <NumberInput name="amount" placeholder="20,00" required />
      </Field>

      <Field label="Come" hint="Il saldo si muove solo quando l’altro conferma di aver ricevuto.">
        <select name="method" className={selectClass}>
          <option value="contanti">Contanti</option>
          <option value="satispay">Satispay</option>
          <option value="bonifico">Bonifico</option>
        </select>
      </Field>

      <Field label="Nota (facoltativa)">
        <TextInput name="note" maxLength={200} />
      </Field>

      <ErrorBanner>{state.error}</ErrorBanner>
      <PrimaryButton type="submit" disabled={pending}>
        Registra il pareggio
      </PrimaryButton>
    </form>
  );
}

export function ConfirmSettlementButton({ settlementId }: { settlementId: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    confirmSettlementAction,
    {},
  );

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="settlementId" value={settlementId} />
      <ErrorBanner>{state.error}</ErrorBanner>
      <PrimaryButton type="submit" disabled={pending}>
        Confermo, li ho ricevuti
      </PrimaryButton>
    </form>
  );
}
