import { and, desc, eq } from 'drizzle-orm';
import {
  referencePrice,
  resolveConsumption,
  tankState,
  type Consumption,
  type ReferencePrice,
  type Refuel,
  type TankEvent,
} from '@/lib/billing';
import { db } from '@/lib/db';
import { refuels, trips, unclaimedTrips, user, vehicleMembers, vehicles } from '@/lib/db/schema';
import { getEnv } from '@/lib/env';

export type Vehicle = typeof vehicles.$inferSelect;
export type Trip = typeof trips.$inferSelect;

export function listVehicles(): Vehicle[] {
  return db.select().from(vehicles).where(eq(vehicles.active, true)).all();
}

export function getVehicle(vehicleId: string): Vehicle | undefined {
  return db.select().from(vehicles).where(eq(vehicles.id, vehicleId)).get();
}

export function getOpenTrip(vehicleId: string): Trip | undefined {
  return db
    .select()
    .from(trips)
    .where(and(eq(trips.vehicleId, vehicleId), eq(trips.status, 'open')))
    .get();
}

/** Membri che partecipano alla ripartizione: la nonna e gli ospiti restano fuori. */
export function billableMemberIds(vehicleId: string): string[] {
  return db
    .select({ id: user.id })
    .from(vehicleMembers)
    .innerJoin(user, eq(vehicleMembers.userId, user.id))
    .where(and(eq(vehicleMembers.vehicleId, vehicleId), eq(user.billable, true)))
    .all()
    .map((row) => row.id);
}

function toRefuelModel(row: typeof refuels.$inferSelect): Refuel {
  return {
    id: row.id,
    liters: row.liters,
    pricePerLiterCents: row.pricePerLiterCents,
    odometerKm: row.odometerKm,
    tankFractionAfter: row.tankFractionAfter,
    refueledAt: row.refueledAt,
  };
}

/**
 * Ricostruisce cosa è successo al serbatoio: ogni rifornimento lo riempie,
 * ogni corsa chiusa (o corsa non registrata già valorizzata) lo svuota.
 */
function tankEvents(vehicleId: string, asOf?: Date): TankEvent[] {
  const refuelRows = db.select().from(refuels).where(eq(refuels.vehicleId, vehicleId)).all();
  const tripRows = db
    .select()
    .from(trips)
    .where(and(eq(trips.vehicleId, vehicleId), eq(trips.status, 'closed')))
    .all();

  const events: TankEvent[] = refuelRows.map((row) => ({
    kind: 'refuel',
    at: row.refueledAt,
    refuel: toRefuelModel(row),
  }));

  for (const trip of tripRows) {
    if (trip.litersEstimated && trip.endedAt) {
      events.push({ kind: 'consumption', at: trip.endedAt, liters: trip.litersEstimated });
    }
  }

  // I km non ancora reclamati sono comunque carburante bruciato: se non li togliessimo
  // dal serbatoio, il prezzo medio resterebbe fermo su rifornimenti già consumati.
  const pendingRows = db
    .select()
    .from(unclaimedTrips)
    .where(and(eq(unclaimedTrips.vehicleId, vehicleId), eq(unclaimedTrips.status, 'pending')))
    .all();

  for (const row of pendingRows) {
    events.push({ kind: 'consumption', at: row.detectedAt, liters: row.litersEstimated });
  }

  // Una corsa registrata a posteriori va valutata col serbatoio di allora, non con
  // quello di adesso: i rifornimenti fatti dopo non erano ancora nel serbatoio.
  return asOf ? events.filter((e) => e.at <= asOf) : events;
}

export interface VehicleState {
  vehicle: Vehicle;
  openTrip: Trip | undefined;
  consumption: Consumption;
  price: ReferencePrice;
  litersInTank: number;
  /** Ultimo evento registrato sul mezzo: apre la finestra delle corse da reclamare. */
  lastEventAt: Date;
}

/**
 * Stato del mezzo a un dato istante. `asOf` serve alle corse registrate a posteriori:
 * senza, una corsa di agosto verrebbe addebitata al prezzo del pieno di settembre.
 */
export function getVehicleState(vehicleId: string, asOf?: Date): VehicleState | null {
  const vehicle = getVehicle(vehicleId);
  if (!vehicle) return null;

  const refuelRows = db.select().from(refuels).where(eq(refuels.vehicleId, vehicleId)).all();
  const events = tankEvents(vehicleId, asOf);
  const firstRefuel = refuelRows.reduce<(typeof refuelRows)[number] | null>(
    (first, row) => (!first || row.refueledAt < first.refueledAt ? row : first),
    null,
  );

  const lastTrip = db
    .select({ at: trips.startedAt })
    .from(trips)
    .where(eq(trips.vehicleId, vehicleId))
    .orderBy(desc(trips.startedAt))
    .get();
  const lastRefuel = refuelRows.reduce<Date | null>(
    (latest, row) => (!latest || row.refueledAt > latest ? row.refueledAt : latest),
    null,
  );

  const candidates = [lastTrip?.at, lastRefuel, vehicle.createdAt].filter(
    (d): d is Date => d instanceof Date,
  );

  return {
    vehicle,
    openTrip: getOpenTrip(vehicleId),
    consumption: resolveConsumption(refuelRows.map(toRefuelModel), vehicle.declaredConsumptionKmL),
    price: referencePrice({
      events,
      tankCapacityL: vehicle.tankCapacityL,
      firstRefuelPriceCents: firstRefuel?.pricePerLiterCents ?? null,
      fallbackPricePerLiterCents: getEnv().FALLBACK_FUEL_PRICE_CENTS,
    }),
    litersInTank: tankState(events, vehicle.tankCapacityL).litersInTank,
    lastEventAt: candidates.reduce((a, b) => (a > b ? a : b)),
  };
}
