import { eq } from 'drizzle-orm';
import { balances, refuelSuggestion } from '@/lib/billing';
import { db } from '@/lib/db';
import { ledgerEntries, user, vehicles } from '@/lib/db/schema';

export interface UserBalance {
  userId: string;
  name: string;
  color: string;
  billable: boolean;
  /** Positivo = autonomia già pagata. Negativo = km fatti e non ancora coperti. */
  balanceKm: number;
}

function allBalances(): Map<string, number> {
  return balances(
    db
      .select()
      .from(ledgerEntries)
      .all()
      .map((row) => ({
        userId: row.userId,
        amountKm: row.amountKm,
        type: row.type,
        occurredAt: row.occurredAt,
      })),
  );
}

export function listBalances(): UserBalance[] {
  const byUser = allBalances();
  return db
    .select()
    .from(user)
    .where(eq(user.active, true))
    .all()
    .map((row) => ({
      userId: row.id,
      name: row.name,
      color: row.color,
      billable: row.billable,
      balanceKm: byUser.get(row.id) ?? 0,
    }))
    .sort((a, b) => a.balanceKm - b.balanceKm);
}

export function getBalance(userId: string): number {
  return allBalances().get(userId) ?? 0;
}

export interface VehicleBalances {
  vehicleId: string;
  name: string;
  /** Solo gli utenti che hanno movimenti su questo mezzo, in debito per primi. */
  rows: UserBalance[];
}

/**
 * Gli stessi saldi, ma spezzati per mezzo: ogni riga a ledger ha il suo `vehicleId`,
 * quindi la somma dei saldi per mezzo torna esattamente al saldo globale. Compaiono solo
 * i mezzi con movimenti e, dentro, solo chi quel mezzo l'ha davvero usato o rifornito.
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
      const rows: UserBalance[] = [...perUser]
        .map(([userId, balanceKm]) => {
          const u = users.get(userId);
          return u
            ? { userId, name: u.name, color: u.color, billable: u.billable, balanceKm }
            : null;
        })
        .filter((r): r is UserBalance => r !== null)
        .sort((a, b) => a.balanceKm - b.balanceKm);
      return rows.length > 0 ? [{ vehicleId: v.id, name: v.name, rows }] : [];
    });
}

/**
 * "Quanto devo mettere?" — la domanda per cui esiste l'app. Il debito è in
 * chilometri, ma alla pompa servono euro: prezzo e consumo del mezzo fanno il resto.
 */
export function getRefuelSuggestion(
  userId: string,
  pricePerLiterCents: number,
  kmPerLiter: number,
) {
  return refuelSuggestion(getBalance(userId), pricePerLiterCents, kmPerLiter);
}
