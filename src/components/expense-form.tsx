'use client';

import { useActionState, useState } from 'react';
import { recordExpenseAction, type ActionState } from '@/app/actions';
import { ErrorBanner, Field, NumberInput, PrimaryButton, TextInput } from '@/components/ui';

const CATEGORIES = [
  'assicurazione',
  'bollo',
  'revisione',
  'tagliando',
  'gomme',
  'riparazione',
  'altro',
] as const;

const RULES = [
  { value: 'by_km', label: 'A chilometri', hint: 'Paga di più chi ha usato di più il mezzo.' },
  { value: 'equal', label: 'In parti uguali', hint: 'Divisa tra i membri del mezzo.' },
  { value: 'none', label: 'Nessuna', hint: 'La paga chi l’ha anticipata, e basta.' },
] as const;

const selectClass =
  'min-h-12 w-full rounded-2xl glass-2 px-4 text-base text-ink';

export function ExpenseForm({
  vehicles,
  payers,
  meId,
}: {
  vehicles: { id: string; name: string }[];
  payers: { id: string; name: string }[];
  meId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordExpenseAction,
    {},
  );
  const [rule, setRule] = useState<string>('by_km');
  const today = new Date().toISOString().slice(0, 10);

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

      <Field label="Tipo di spesa">
        <select name="category" className={selectClass}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Importo (€)">
        <NumberInput name="amount" placeholder="420,00" required />
      </Field>

      <Field label="Chi ha pagato">
        <select name="paidByUserId" defaultValue={meId} className={selectClass}>
          {payers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Data">
        <TextInput type="date" name="date" defaultValue={today} />
      </Field>

      <fieldset>
        <legend className="mb-2 text-sm text-ink-dim">Come si divide</legend>
        <div className="space-y-2">
          {RULES.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-12 items-center gap-3 rounded-2xl border px-4 ${
                rule === option.value ? 'border-accent bg-accent/10' : 'border-line bg-surface-2'
              }`}
            >
              <input
                type="radio"
                name="splitRule"
                value={option.value}
                checked={rule === option.value}
                onChange={() => setRule(option.value)}
                className="size-5"
              />
              <span>
                <span className="block">{option.label}</span>
                <span className="block text-xs text-ink-dim">{option.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {rule === 'by_km' ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Periodo dal">
            <TextInput type="date" name="periodStart" required />
          </Field>
          <Field label="al">
            <TextInput type="date" name="periodEnd" defaultValue={today} required />
          </Field>
        </div>
      ) : null}

      <Field label="Nota (facoltativa)">
        <TextInput name="note" maxLength={500} />
      </Field>

      <ErrorBanner>{state.error}</ErrorBanner>
      <PrimaryButton type="submit" disabled={pending}>
        Registra la spesa
      </PrimaryButton>
    </form>
  );
}
