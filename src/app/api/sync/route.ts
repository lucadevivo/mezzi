import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { completeRefuelAmounts } from '@/lib/billing';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { syncOps } from '@/lib/db/schema';
import { recordRefuel } from '@/lib/services/refuels';
import { closeTrip, startTrip } from '@/lib/services/trips';

export const dynamic = 'force-dynamic';

const operation = z.object({
  id: z.string().uuid(),
  kind: z.enum(['start_trip', 'close_trip', 'refuel']),
  payload: z.record(z.string(), z.unknown()),
  occurredAt: z.string().datetime(),
});

const body = z.object({ operations: z.array(operation).max(50) });

const startPayload = z.object({
  vehicleId: z.string().min(1),
  odometerKm: z.number().finite(),
  unclaimedAnswer: z.enum(['mine', 'not_mine', 'unknown']).optional(),
  /** Deciso dal telefono, così la chiusura registrata offline sa a cosa riferirsi. */
  tripId: z.string().uuid().optional(),
});

const closePayload = z.object({
  tripId: z.string().min(1),
  odometerEndKm: z.number().finite(),
  passengerIds: z.array(z.string()).optional(),
  note: z.string().max(500).optional(),
});

const refuelPayload = z.object({
  vehicleId: z.string().min(1),
  payerId: z.string().min(1),
  odometerKm: z.number().finite(),
  liters: z.number().positive().nullable().optional(),
  pricePerLiterCents: z.number().int().positive().nullable().optional(),
  totalCents: z.number().int().positive().nullable().optional(),
  tankLevelAfter: z.enum(['quarter', 'half', 'three_quarters', 'full']).nullable().optional(),
  stationName: z.string().max(100).optional(),
});

/**
 * Riceve le operazioni registrate offline. L'id arriva dal telefono e viene salvato:
 * se il sync riparte a metà (succede, la rete in garage va e viene) le operazioni già
 * applicate vengono riconosciute e saltate invece di essere rifatte.
 *
 * `permanent: true` dice al telefono di togliere l'operazione dalla coda: è stata
 * rifiutata per un motivo che non cambierà ritentando.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'Non autenticato' }, { status: 401 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Payload non valido' }, { status: 400 });

  const results = parsed.data.operations.map((op) => {
    if (db.select().from(syncOps).where(eq(syncOps.id, op.id)).get()) {
      return { id: op.id, ok: true };
    }

    const occurredAt = new Date(op.occurredAt);

    try {
      let result: unknown;

      if (op.kind === 'start_trip') {
        const data = startPayload.parse(op.payload);
        result = startTrip({ ...data, userId: user.id, now: occurredAt });
      } else if (op.kind === 'close_trip') {
        const data = closePayload.parse(op.payload);
        result = closeTrip({ ...data, confirmWarnings: true, now: occurredAt });
      } else {
        const data = refuelPayload.parse(op.payload);
        const amounts = completeRefuelAmounts(data);
        result = recordRefuel({
          vehicleId: data.vehicleId,
          userId: data.payerId,
          odometerKm: data.odometerKm,
          tankLevelAfter: data.tankLevelAfter ?? null,
          stationName: data.stationName,
          confirmOverCapacity: true,
          refueledAt: occurredAt,
          ...amounts,
        });
      }

      db.insert(syncOps)
        .values({
          id: op.id,
          userId: user.id,
          kind: op.kind,
          payload: op.payload,
          occurredAt,
          result: JSON.stringify(result),
        })
        .run();

      return { id: op.id, ok: true };
    } catch (error) {
      return {
        id: op.id,
        ok: false,
        // Il server ha detto no per una ragione sua: ritentare non cambierà niente.
        permanent: true,
        message: error instanceof Error ? error.message : 'Errore',
      };
    }
  });

  return Response.json({ results });
}
