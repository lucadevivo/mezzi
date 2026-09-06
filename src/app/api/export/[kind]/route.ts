import { getCurrentUser } from '@/lib/auth/session';
import { centsToEuro, csvResponse, toCsv, type CsvValue } from '@/lib/csv';
import { db } from '@/lib/db';
import { ledgerEntries, user, vehicles } from '@/lib/db/schema';
import { listAllRefuels, listTrips } from '@/lib/services/history';

export const dynamic = 'force-dynamic';

const KINDS = ['corse', 'rifornimenti', 'movimenti'] as const;
type Kind = (typeof KINDS)[number];

const PRICE_SOURCE = {
  tank_weighted: 'medio in serbatoio',
  last_refuel: 'ultimo pieno',
  first_refuel: 'primo pieno noto',
  fallback: 'di ripiego',
} as const;

/** Esportazione CSV. Tutto quello che c'è a schermo, in un foglio, senza sorprese. */
export async function GET(_request: Request, { params }: { params: Promise<{ kind: string }> }) {
  if (!(await getCurrentUser())) {
    return Response.json({ error: 'Non autenticato' }, { status: 401 });
  }

  const { kind } = await params;
  if (!KINDS.includes(kind as Kind)) {
    return Response.json({ error: 'Esportazione sconosciuta' }, { status: 404 });
  }

  const names = new Map(
    db
      .select()
      .from(user)
      .all()
      .map((u) => [u.id, u.name]),
  );
  const vehicleNames = new Map(
    db
      .select()
      .from(vehicles)
      .all()
      .map((v) => [v.id, v.name]),
  );

  let headers: string[];
  let rows: CsvValue[][];

  switch (kind as Kind) {
    case 'corse':
      headers = [
        'data',
        'mezzo',
        'utente',
        'km',
        'litri',
        'euro',
        'prezzo al litro',
        'fonte prezzo',
        'nota',
      ];
      rows = listTrips({ limit: 5000 }).map((trip) => [
        trip.endedAt,
        vehicleNames.get(trip.vehicleId) ?? '',
        names.get(trip.userId) ?? '',
        trip.distanceKm,
        trip.litersEstimated,
        centsToEuro(trip.costCents),
        centsToEuro(trip.unitPriceUsedCents),
        trip.priceSource ? PRICE_SOURCE[trip.priceSource] : '',
        trip.note,
      ]);
      break;

    case 'rifornimenti':
      headers = ['data', 'mezzo', 'pagato da', 'litri', 'euro al litro', 'totale', 'km', 'pieno'];
      rows = listAllRefuels({ limit: 5000 }).map((refuel) => [
        refuel.refueledAt,
        vehicleNames.get(refuel.vehicleId) ?? '',
        names.get(refuel.userId) ?? '',
        refuel.liters,
        centsToEuro(refuel.pricePerLiterCents),
        centsToEuro(refuel.totalCents),
        refuel.odometerKm,
        refuel.tankFractionAfter === 1 ? 'sì' : 'no',
      ]);
      break;


    case 'movimenti':
      headers = ['data', 'utente', 'mezzo', 'tipo', 'km', 'euro', 'descrizione'];
      rows = db
        .select()
        .from(ledgerEntries)
        .orderBy(ledgerEntries.occurredAt)
        .all()
        .map((entry) => [
          entry.occurredAt,
          names.get(entry.userId) ?? '',
          entry.vehicleId ? (vehicleNames.get(entry.vehicleId) ?? '') : '',
          entry.type,
          entry.amountKm,
          centsToEuro(entry.amountCents),
          entry.description,
        ]);
      break;
  }

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(`mezzi-${kind}-${today}.csv`, toCsv(headers, rows));
}
