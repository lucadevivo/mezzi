import { eq } from 'drizzle-orm';
import { balances, refuelSuggestion } from '@/lib/billing';
import { db } from '@/lib/db';
import { ledgerEntries, user, vehicles } from '@/lib/db/schema';
import { getVehicleState } from './vehicles';

export interface UserBalance {
  userId: string;
  name: string;
  color: string;
  billable: boolean;
  /** Positivo = autonomia già pagata. Negativo = km fatti e non ancora coperti. */
  balanceKm: number;
  /** Euro da mettere SU QUESTO mezzo per tornare in pari. 0 se non è in debito. */
  topupCents: number;
}

export interface VehicleBalances {
  vehicleId: string;
  name: string;
  /** Solo gli utenti che hanno movimenti su questo mezzo, in debito per primi. */
  rows: UserBalance[];
}

/**
 * I saldi spezzati per mezzo: ogni riga a ledger ha il suo `vehicleId`, quindi la somma
 * dei saldi per mezzo torna esattamente al saldo globale. Compaiono solo i mezzi con
 * movimenti e, dentro, solo chi quel mezzo l'ha davvero usato o rifornito. Per chi è in
 * debito si calcola quanti euro mettere su QUEL mezzo (prezzo e consumo del mezzo),
 * così il consiglio è visibile a tutti, non solo al diretto interessato.
 */
export function listBalancesByVehicle(): VehicleBalances[] {
  const entries = db.select().from(ledgerEntries).all();
  const users = new Map(
    db.select().from(user).where(eq(user.active, true)).all().map((u) => [u.id, u]),
  );

  const byVehicle = new Map<string, typeof entries>();
  for (const e of entries) {
    if (!e.vehicleId) continue;
    const list = byVehicle.get(e.vehicleId) ?? [];
    list.push(e);
    byVehicle.set(e.vehicleId, list);
  }

  return db
    .select()
    .from(vehicles)
    .where(eq(vehicles.active, true))
    .all()
    .flatMap((v) => {
      const vEntries = byVehicle.get(v.id);
      if (!vEntries || vEntries.length === 0) return [];
      const perUser = balances(
        vEntries.map((row) => ({
          userId: row.userId,
          amountKm: row.amountKm,
          type: row.type,
          occurredAt: row.occurredAt,
        })),
      );
      // Prezzo e consumo del mezzo servono a convertire il debito in km in euro da mettere.
      const state = getVehicleState(v.id);
      const rows: UserBalance[] = [...perUser]
        .map(([userId, balanceKm]) => {
          const u = users.get(userId);
          if (!u) return null;
          const topupCents =
            balanceKm < 0 && state
              ? refuelSuggestion(
                  balanceKm,
                  state.price.pricePerLiterCents,
                  state.consumption.kmPerLiter,
                ).suggestedCents
              : 0;
          return { userId, name: u.name, color: u.color, billable: u.billable, balanceKm, topupCents };
        })
        .filter((r): r is UserBalance => r !== null)
        .sort((a, b) => a.balanceKm - b.balanceKm);
      return rows.length > 0 ? [{ vehicleId: v.id, name: v.name, rows }] : [];
    });
}
