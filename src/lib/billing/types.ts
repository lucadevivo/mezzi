/**
 * Tipi del modulo di calcolo. Modulo PURO: niente DB, niente framework, niente `Date.now()`.
 * Il tempo entra sempre come parametro.
 */

/** Importo in centesimi interi. Mai float per il denaro. */
export type Cents = number;

export type UserId = string;
export type VehicleId = string;

/** Il pieno: unico valore che abilita la calibrazione pieno-a-pieno. */
export const TANK_FULL = 1;

export interface Refuel {
  id: string;
  liters: number;
  pricePerLiterCents: Cents;
  odometerKm: number;
/**
   * Dove sta la lancetta dopo il rifornimento, da 0 (riserva) a 1 (pieno). `null` = non
   * guardata. Una frazione e non quattro caselle: la lancetta vera non si ferma sui quarti.
   */
  tankFractionAfter: number | null;
  refueledAt: Date;
}

export type LedgerType = 'consumption_charge' | 'refuel_credit' | 'adjustment' | 'opening';

export interface LedgerEntry {
  userId: UserId;
  /**
   * Chilometri: negativi se guidati, positivi se comprati col carburante.
   * Il saldo dell'app è autonomia, non denaro — vedi `balances`.
   */
  amountKm: number;
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
