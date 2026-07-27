'use client';

import { useActionState, useState } from 'react';
import { reverseAction, type ActionState } from '@/app/actions';
import { ErrorBanner, SecondaryButton, TextInput } from '@/components/ui';

/**
 * Le correzioni non modificano niente: aggiungono una riga uguale e contraria.
 * Il motivo è obbligatorio perché è quello che si legge sei mesi dopo in audit log.
 */
export function ReverseButton({ kind, id }: { kind: 'trip' | 'refuel' | 'expense'; id: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reverseAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-sm text-ink-dim underline"
      >
        Storna
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <TextInput name="reason" placeholder="Motivo dello storno" required minLength={3} />
      <ErrorBanner>{state.error}</ErrorBanner>
      <SecondaryButton type="submit" disabled={pending}>
        Conferma lo storno
      </SecondaryButton>
    </form>
  );
}
