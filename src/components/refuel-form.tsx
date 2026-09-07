'use client';

import { useActionState, useState } from 'react';
import { recordRefuelAction, type ActionState } from '@/app/actions';
import { padValue } from '@/components/odometer-pad';
import { TankGauge } from '@/components/tank-gauge';
import { ErrorBanner, Field, NumberInput, PrimaryButton, TextInput } from '@/components/ui';
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
  const [payerId, setPayerId] = useState(meId);
  // Chi divide i costi: sono loro a poter ricevere l'autonomia comprata da un esterno.
  const inConti = payers.filter((p) => p.billable);
  const [beneficiari, setBeneficiari] = useState<string[]>(() => inConti.map((p) => p.id));
  const NUOVO = '__nuovo__';
  const pagaUnEsterno =
    payerId === NUOVO || payers.find((p) => p.id === payerId)?.billable === false;
  const ospitiNoti = payers.filter((p) => !p.billable).map((p) => p.name);

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
          value={payerId}
          onChange={(e) => setPayerId(e.target.value)}
          className="min-h-12 w-full rounded-2xl glass-2 px-3 text-base text-ink"
        >
          {payers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.billable ? '' : ' (esterno)'}
            </option>
          ))}
          {/* Papà, un amico: non sono nell'elenco perché non sono utenti dell'app.
              Si scrivono qui e nascono, come le etichette dei tragitti. */}
          <option value={NUOVO}>Qualcun altro…</option>
        </select>
      </label>

      {payerId === NUOVO ? (
        <Field label="Chi è" hint="Non entra nell'app: serve a sapere chi ha pagato.">
          <TextInput
            name="nuovoPagante"
            list="paganti-esterni"
            maxLength={40}
            placeholder="Papà"
            required
          />
          <datalist id="paganti-esterni">
            {ospitiNoti.map((nome) => (
              <option key={nome} value={nome} />
            ))}
          </datalist>
        </Field>
      ) : null}

      {/*
        Paga qualcuno che non è nei conti: l'autonomia comprata non può restare sul suo
        saldo, perché non guida abbastanza da consumarla. A chi va lo decidete voi, e si
        divide in parti uguali tra chi spuntate.
      */}
      {pagaUnEsterno ? (
        <fieldset>
          <legend className="mb-2 text-sm text-ink-dim">
            A chi vanno i chilometri, in parti uguali
          </legend>
          <div className="flex flex-wrap gap-2">
            {inConti.map((p) => {
              const scelto = beneficiari.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={scelto}
                  onClick={() =>
                    setBeneficiari((attuali) =>
                      scelto ? attuali.filter((id) => id !== p.id) : [...attuali, p.id],
                    )
                  }
                  className={`min-h-11 rounded-full border px-4 text-base font-medium ${
                    scelto ? 'border-accent bg-accent text-accent-ink' : 'border-line text-ink-dim'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
          {beneficiari.map((id) => (
            <input key={id} type="hidden" name="beneficiari" value={id} />
          ))}
          <p className="mt-1 text-xs text-ink-dim">
            {beneficiari.length === 0
              ? 'Se non scegli nessuno vanno divisi tra tutti.'
              : `${litersPreview} divisi in ${beneficiari.length}.`}
          </p>
        </fieldset>
      ) : null}

      <ErrorBanner>{state.error}</ErrorBanner>
      {state.needsConfirm ? <input type="hidden" name="conferma" value="si" /> : null}

      <PrimaryButton type="submit" disabled={pending}>
        {state.needsConfirm ? 'Confermo, registra' : 'Registra il rifornimento'}
      </PrimaryButton>
    </form>
  );
}
