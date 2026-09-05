import { requireUser } from '@/lib/auth/session';
import { formatEuro, formatKm } from '@/lib/format';
import { monthSummary } from '@/lib/services/stats';

export const dynamic = 'force-dynamic';

/**
 * Riepilogo mensile da stampare o da mandare in chat. Niente colori di sfondo e
 * niente elementi interattivi: su carta contano solo i numeri e chi li ha fatti.
 */
export default async function SummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ mese?: string }>;
}) {
  await requireUser();
  const { mese } = await searchParams;
  // `?mese=2026-06` per rileggere un mese passato.
  const reference = mese ? new Date(`${mese}-15T12:00:00`) : new Date();
  const summary = monthSummary(reference);

  return (
    <article className="space-y-6 print:text-black">
      <header>
        <h1 className="text-xl font-semibold capitalize">Riepilogo {summary.label}</h1>
        <p className="tabular mt-1 text-ink-dim print:text-black">
          {formatKm(summary.totalKm)} percorsi · {formatEuro(summary.totalCostCents)} di carburante
          consumato · {formatEuro(summary.fuelPaidCents)} di rifornimenti pagati
        </p>
      </header>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-ink-dim print:text-black">
          Per persona
        </h2>
        <table className="w-full text-sm">
          <thead className="text-ink-dim print:text-black">
            <tr className="border-b border-line text-left">
              <th className="py-1 font-normal">Persona</th>
              <th className="py-1 text-right font-normal">Corse</th>
              <th className="py-1 text-right font-normal">Km</th>
              <th className="py-1 text-right font-normal">Costo</th>
            </tr>
          </thead>
          <tbody>
            {summary.byUser.map((row) => (
              <tr key={row.userId} className="border-b border-line/50">
                <td className="py-1.5">{row.name}</td>
                <td className="tabular py-1.5 text-right">{row.trips}</td>
                <td className="tabular py-1.5 text-right">{Math.round(row.km)}</td>
                <td className="tabular py-1.5 text-right">{formatEuro(row.costCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.byUser.length === 0 ? (
          <p className="text-sm text-ink-dim print:text-black">Nessuna corsa in questo mese.</p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-2 text-[15px] font-semibold text-ink-dim print:text-black">
          Per mezzo
        </h2>
        <table className="w-full text-sm">
          <thead className="text-ink-dim print:text-black">
            <tr className="border-b border-line text-left">
              <th className="py-1 font-normal">Mezzo</th>
              <th className="py-1 text-right font-normal">Km</th>
              <th className="py-1 text-right font-normal">Costo</th>
              <th className="py-1 text-right font-normal">€/km</th>
            </tr>
          </thead>
          <tbody>
            {summary.byVehicle.map((row) => (
              <tr key={row.vehicleId} className="border-b border-line/50">
                <td className="py-1.5">{row.name}</td>
                <td className="tabular py-1.5 text-right">{Math.round(row.km)}</td>
                <td className="tabular py-1.5 text-right">{formatEuro(row.costCents)}</td>
                <td className="tabular py-1.5 text-right">
                  {row.costPerKmCents !== null
                    ? (row.costPerKmCents / 100).toFixed(3).replace('.', ',')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-ink-dim print:text-black">
        I costi sono quelli congelati alla chiusura di ogni corsa: rileggere questo riepilogo fra un
        anno darà gli stessi numeri.
      </p>
    </article>
  );
}
