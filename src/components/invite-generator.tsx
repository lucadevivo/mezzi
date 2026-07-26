'use client';

import { useState, useTransition } from 'react';
import { createInviteAction } from '@/app/actions';
import { PrimaryButton } from '@/components/ui';

export function InviteGenerator() {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      <PrimaryButton
        type="button"
        disabled={pending}
        onClick={() => start(async () => setUrl((await createInviteAction()).url))}
      >
        {pending ? 'Genero…' : 'Genera un link di invito'}
      </PrimaryButton>
      {url ? (
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-xs text-ink-dim">Valido 7 giorni, usabile una volta sola.</p>
          <p className="mt-1 break-all text-sm">{url}</p>
        </div>
      ) : null}
    </div>
  );
}
