import { and, eq, gte, lte } from 'drizzle-orm';
import { fullTankSamples } from '@/lib/billing';
import { db } from '@/lib/db';
import { refuels, trips, user, vehicles } from '@/lib/db/schema';

export interface Period {
  from: Date;
  to: Date;
}

/** Il mese corrente in ora locale: le statistiche si guardano "questo mese", non "ultimi 30 giorni". */
export function monthPeriod(reference = new Date()): Period {
  const from = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const to = new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  return { from, to };
}

export function monthLabel(period: Period): string {
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(period.from);
}

function closedTripsIn(period: Period, vehicleId?: string) {
  const where = [
    eq(trips.status, 'closed'),
    gte(trips.endedAt, period.from),
    lte(trips.endedAt, period.to),
  ];
  if (vehicleId) where.push(eq(trips.vehicleId, vehicleId));
  return db
    .select()
    .from(trips)
    .where(and(...where))
    .all();
}

export interface UserStat {
  userId: string;
  name: string;
  color: string;
  km: number;
  costCents: number;
  trips: number;
}

/** Chi ha guidato quanto, e quanto gli è costato. */
export function statsByUser(period: Period, vehicleId?: string): UserStat[] {
  const people = db.select().from(user).all();
  const totals = new Map<string, { km: number; costCents: number; trips: number }>();

  for (const trip of closedTripsIn(period, vehicleId)) {
    const current = totals.get(trip.userId) ?? { km: 0, costCents: 0, trips: 0 };
    current.km += trip.distanceKm ?? 0;
    current.costCents += trip.costCents ?? 0;
    current.trips += 1;
    totals.set(trip.userId, current);
  }

  return [...totals]
    .map(([userId, value]) => {
      const person = people.find((p) => p.id === userId);
      return {
        userId,
        name: person?.name ?? '?',
        color: person?.color ?? '#8899a6',
        ...value,
      };
    })
    .sort((a, b) => b.km - a.km);
}

export interface VehicleStat {
  vehicleId: string;
  name: string;
  color: string;
  km: number;
  costCents: number;
  /** Costo medio al km: il numero che dice davvero quanto costa quel mezzo. */
  costPerKmCents: number | null;
  consumptionKmL: number | null;
  consumptionSource: 'measured' | 'declared';
}

export function statsByVehicle(period: Period): VehicleStat[] {
  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.active, true))
    .all()
    .map((vehicle) => {
      const vehicleTrips = closedTripsIn(period, vehicle.id);
      const km = vehicleTrips.reduce((sum, t) => sum + (t.distanceKm ?? 0), 0);
      const costCents = vehicleTrips.reduce((sum, t) => sum + (t.costCents ?? 0), 0);

      return {
        vehicleId: vehicle.id,
        name: vehicle.name,
        color: vehicle.color,
        km,
        costCents,
        costPerKmCents: km > 0 ? costCents / km : null,
        consumptionKmL: vehicle.computedConsumptionKmL ?? vehicle.declaredConsumptionKmL,
        consumptionSource: (vehicle.computedConsumptionKmL
          ? 'measured'
          : 'declared') as VehicleStat['consumptionSource'],
      };
    })
    .sort((a, b) => b.km - a.km);
}

export interface ConsumptionPoint {
  odometerKm: number;
  refueledAt: Date;
  kmPerLiter: number;
}

/**
 * Andamento del consumo reale nel tempo: ogni punto è un intervallo tra due pieni.
 * Serve a vedere se il mezzo sta peggiorando o se è solo cambiato il modo di guidare.
 */
export function consumptionTrend(vehicleId: string): ConsumptionPoint[] {
  const rows = db
    .select()
    .from(refuels)
    .where(eq(refuels.vehicleId, vehicleId))
    .all()
    .map((row) => ({
      id: row.id,
      liters: row.liters,
      pricePerLiterCents: row.pricePerLiterCents,
      odometerKm: row.odometerKm,
      tankLevelAfter: row.tankLevelAfter,
      refueledAt: row.refueledAt,
    }));

  const fulls = rows
    .filter((r) => r.tankLevelAfter === 'full')
    .sort((a, b) => a.odometerKm - b.odometerKm);

  return fullTankSamples(rows).map((kmPerLiter, index) => ({
    // Il campione i-esimo copre l'intervallo che finisce col pieno i+1.
    odometerKm: fulls[index + 1].odometerKm,
    refueledAt: fulls[index + 1].refueledAt,
    kmPerLiter,
  }));
}

export interface MonthSummary {
  period: Period;
  label: string;
  totalKm: number;
  totalCostCents: number;
  fuelPaidCents: number;
  byUser: UserStat[];
  byVehicle: VehicleStat[];
}

export function monthSummary(reference = new Date()): MonthSummary {
  const period = monthPeriod(reference);
  const byUser = statsByUser(period);
  const byVehicle = statsByVehicle(period);

  const fuelPaidCents = db
    .select()
    .from(refuels)
    .where(and(gte(refuels.refueledAt, period.from), lte(refuels.refueledAt, period.to)))
    .all()
    .reduce((sum, row) => sum + row.totalCents, 0);

  return {
    period,
    label: monthLabel(period),
    totalKm: byUser.reduce((sum, u) => sum + u.km, 0),
    totalCostCents: byUser.reduce((sum, u) => sum + u.costCents, 0),
    fuelPaidCents,
    byUser,
    byVehicle,
  };
}
