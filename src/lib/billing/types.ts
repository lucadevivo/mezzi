/**
 * Tipi del modulo di calcolo. Modulo PURO: niente DB, niente framework, niente `Date.now()`.
 * Il tempo entra sempre come parametro.
 */

/** Importo in centesimi interi. Mai float per il denaro. */
export type Cents = number;

export type UserId = string;
export type VehicleId = string;

export type TankLevel = 'quarter' | 'half' | 'three_quarters' | 'full';

export const TANK_LEVEL_FRACTION: Record<TankLevel, number> = {
  quarter: 0.25,
  half: 0.5,
  three_quarters: 0.75,
  full: 1,
};

export interface Refuel {
  id: string;
  liters: number;
  pricePerLiterCents: Cents;
  odometerKm: number;
  /** Livello raggiunto dopo il rifornimento. `full` abilita la calibrazione pieno-a-pieno. */
  tankLevelAfter: TankLevel | null;
  refueledAt: Date;
}

export type LedgerType =
  | 'consumption_charge'
  | 'refuel_credit'
  | 'expense_charge'
  | 'expense_credit'
  | 'settlement'
  | 'adjustment';

export interface LedgerEntry {
  userId: UserId;
  /** Negativo = addebito, positivo = accredito. */
  amountCents: Cents;
  type: LedgerType;
  occurredAt: Date;
}

/** Da dove viene il prezzo al litro usato per addebitare una corsa. */
export type PriceSource = 'tank_weighted' | 'last_refuel' | 'first_refuel' | 'fallback';

export interface ReferencePrice {
  pricePerLiterCents: Cents;
  source: PriceSource;
}

/** Da dove viene il consumo km/l usato per stimare i litri. */
export type ConsumptionSource = 'measured' | 'declared';

export interface Consumption {
  kmPerLiter: number;
  source: ConsumptionSource;
  /** Con quanti pieni è stato calcolato (0 se dichiarato da libretto). */
  sampleCount: number;
}
