'use client';

import { useActionState, useState } from 'react';
import { recordRefuelAction, type ActionState } from '@/app/actions';
import { TankGauge } from '@/components/tank-gauge';
import { ErrorBanner, Field, NumberInput, PrimaryButton, TextInput } from '@/components/ui';
import { formatKm } from '@/lib/format';

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
  const [odometer, setOdometer] = useState(String(Math.round(currentOdometerKm)));
  const [liters, setLiters] = useState('');
  const [pricePerLiter, setPricePerLiter] = useState('');
  const [total, setTotal] = useState('');

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="vehicleId" value={vehicleId} />

      <Field label="Contachilometri" hint={`Ultimo valore: ${formatKm(currentOdometerKm)}`}>
        <NumberInput
          name="odometerKm"
          value={odometer}
          onChange={(e) => setOdometer(e.target.value)}
          required
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Litri">
          <NumberInput
            name="liters"
            placeholder="30"
            value={liters}
            onChange={(e) => setLiters(e.target.value)}
          />
        </Field>
        <Field label="€ al litro">
          <NumberInput
            name="pricePerLiter"
            placeholder="1,80"
            value={pricePerLiter}
            onChange={(e) => setPricePerLiter(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Totale pagato (€)" hint="Compilane due su tre: il terzo lo calcolo io.">
        <NumberInput
          name="total"
          placeholder="54,00"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </Field>

      <TankGauge name="tankFractionAfter" value={tank} onChange={setTank} />

      <Field label="Chi ha pagato">
        <select
          name="payerId"
          defaultValue={meId}
          className="min-h-12 w-full rounded-2xl glass-2 px-4 text-base text-ink"
        >
          {payers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.billable ? '' : ' (esterno)'}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Distributore (facoltativo)">
        <TextInput name="stationName" maxLength={100} />
      </Field>

      <ErrorBanner>{state.error}</ErrorBanner>
      {state.needsConfirm ? <input type="hidden" name="conferma" value="si" /> : null}

      <PrimaryButton type="submit" disabled={pending}>
        {state.needsConfirm ? 'Confermo, registra' : 'Registra il rifornimento'}
      </PrimaryButton>
    </form>
  );
}
