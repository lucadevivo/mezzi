'use client';

import { useActionState } from 'react';
import { acceptInviteAction, type ActionState } from '@/app/actions';
import { ErrorBanner, Field, PrimaryButton, TextInput } from '@/components/ui';

export function InviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    acceptInviteAction,
    {},
  );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <Field label="Nome">
        <TextInput name="name" required minLength={2} autoComplete="name" />
      </Field>
      <Field label="Email">
        <TextInput name="email" type="email" required autoComplete="email" />
      </Field>
      <Field label="Password" hint="Almeno 10 caratteri.">
        <TextInput
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
        />
      </Field>
      <ErrorBanner>{state.error}</ErrorBanner>
      <PrimaryButton type="submit" disabled={pending}>
        Crea l’account
      </PrimaryButton>
    </form>
  );
}
