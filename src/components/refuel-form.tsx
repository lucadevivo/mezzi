'use client';

import { useActionState, useState } from 'react';
import { recordRefuelAction, type ActionState } from '@/app/actions';
import { padValue } from '@/components/odometer-pad';
import { TankGauge } from '@/components/tank-gauge';
import { ErrorBanner, Field, NumberInput, PrimaryButton } from '@/components/ui';
import { formatLiters } from '@/lib/format';

export interface PayerOption {
  id: string;
  name: string;
  billable: boolean;
}

/**
 * Dei tre valori (litri, €/litro, totale) ne bastano due: il terzo si ricava al salvataggio.
 * Il livello raggiunto serve a ricalibrare il consumo e a sapere quanto carburante resta.
 */
export function RefuelForm({
  vehicleId,
  currentOdometerKm,
  payers,
  meId,
}: {
  vehicleId: string;
  currentOdometerKm: number;
  payers: PayerOption[];
  meId: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    recordRefuelAction,
    {},
  );
  // Di suo nessuno dichiara niente: il livello lo si segna solo se lo si è guardato.
  const [tank, setTank] = useState<number | null>(null);
  // Controllati: un warning da confermare non deve cancellare quello che hai appena
  // battuto con una mano sola davanti alla pompa.
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [total, setTotal] = useState('');

  const parse = (value: string) => Number(value.replace(',', '.'));
  const liters = parse(total) / parse(pricePerLiter);
  const litersPreview = Number.isFinite(liters) && liters > 0 ? `${formatLiters(liters)}` : '—';

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="vehicleId" value={vehicleId} />

      {/*
        Il contachilometri non si chiede: alla pompa nessuno lo riguarda, e l'app ha
        gia' l'ultimo valore. I litri nemmeno: si mettono soldi, non litri, e i litri
        si calcolano dal prezzo esposto.
      */}
      <input type="hidden" name="odometerKm" value={padValue(currentOdometerKm)} />

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quanto hai messo (€)">
          <NumberInput
            name="total"
            placeholder="20,00"
            inputMode="decimal"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
            required
          />
        </Field>
        <Field label="€ al litro">
          <NumberInput
            name="pricePerLiter"
            placeholder="2,139"
            value={pricePerLiter}
            onChange={(e) => setPricePerLiter(e.target.value)}
            required
          />
        </Field>
      </div>
      <p className="-mt-1.5 text-xs text-ink-dim">I litri li calcolo io: {litersPreview}</p>

      <TankGauge name="tankFractionAfter" value={tank} onChange={setTank} />

      <label className="flex items-center gap-3">
        <span className="shrink-0 text-sm text-ink-dim">Chi ha pagato</span>
        <select
          name="payerId"
          defaultValue={meId}
          className="min-h-12 w-full rounded-2xl glass-2 px-3 text-base text-ink"
        >
          {payers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.billable ? '' : ' (esterno)'}
            </option>
          ))}
        </select>
      </label>

      <ErrorBanner>{state.error}</ErrorBanner>
      {state.needsConfirm ? <input type="hidden" name="conferma" value="si" /> : null}

      <PrimaryButton type="submit" disabled={pending}>
        {state.needsConfirm ? 'Confermo, registra' : 'Registra il rifornimento'}
      </PrimaryButton>
    </form>
  );
}
