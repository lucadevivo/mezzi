'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ErrorBanner, Field, PrimaryButton, TextInput } from '@/components/ui';
import { signIn } from '@/lib/auth/client';

function LoginForm() {
  const router = useRouter();
  const justRegistered = useSearchParams().get('registrato') === '1';
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    const { error } = await signIn.email({
      email: String(formData.get('email') ?? ''),
      password: String(formData.get('password') ?? ''),
      // Si usa dal telefono: la sessione deve durare.
      rememberMe: true,
    });
    setPending(false);

    if (error) {
      // Nessun dettaglio sul perché: non si dice a un estraneo se l'email esiste.
      setError('Email o password non corretti.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <form action={onSubmit} className="glass space-y-4 rounded-[var(--radius-card)] p-5">
      {justRegistered ? (
        <p className="rounded-2xl border border-line bg-surface-2 px-4 py-3 text-ink">
          Account creato. Entra con le tue credenziali.
        </p>
      ) : null}

      <Field label="Email">
        <TextInput name="email" type="email" autoComplete="email" required />
      </Field>
      <Field label="Password">
        <TextInput name="password" type="password" autoComplete="current-password" required />
      </Field>

      <ErrorBanner>{error}</ErrorBanner>

      <PrimaryButton type="submit" disabled={pending}>
        {pending ? 'Entro…' : 'Entra'}
      </PrimaryButton>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <h1 className="title-lg mb-1">Mezzi</h1>
      <p className="mb-6 text-ink-dim">Chi ha consumato quanto, chi deve mettere benzina.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
      <p className="mt-6 text-xs text-ink-dim">
        Non c’è registrazione aperta: si entra solo con un invito dell’admin.
      </p>
    </div>
  );
}
