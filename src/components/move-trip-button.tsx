'use client';

import { useActionState, useState } from 'react';
import { moveTripAction, type ActionState } from '@/app/actions';
import { ErrorBanner, SecondaryButton } from '@/components/ui';

/** Solo admin: la corsa passa a chi l'ha guidata davvero (storno + addebito nuovo). */
export function MoveTripButton({
  tripId,
  currentUserId,
  people,
}: {
  tripId: string;
  currentUserId: string;
  people: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(moveTripAction, {});
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 mr-4 text-sm text-ink-dim underline"
      >
        Sposta a…
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-2 space-y-2">
      <input type="hidden" name="tripId" value={tripId} />
      <label className="block text-[13px] font-semibold text-ink-dim">
        Chi l&apos;ha guidata
        <select
          name="userId"
          required
          defaultValue=""
          className="mt-1 block min-h-12 w-full rounded-lg glass-2 px-4 text-base text-ink"
        >
          <option value="" disabled>
            Scegli chi…
          </option>
          {people
            .filter((p) => p.id !== currentUserId)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <ErrorBanner>{state.error}</ErrorBanner>
      <SecondaryButton type="submit" disabled={pending}>
        Sposta la corsa
      </SecondaryButton>
    </form>
  );
}
