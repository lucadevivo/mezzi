import { describe, expect, it } from 'vitest';
import { balances, ledgerTotal, unconsumedFuelValueCents } from './balance';
import { evaluateOdometerReading } from './discrepancy';
import { splitCentsAmong } from './money';
import { referencePrice, tankState, type TankEvent } from './price';
import { splitTripCost, tripCost } from './trip';
import { resolveUnclaimed } from './unclaimed';
import type { LedgerEntry, Refuel } from './types';

/**
 * Le due invarianti dell'app, verificate su un mese di uso realistico della Fiesta.
 * Se una di queste due salta, i conti non tornano e l'app non serve a niente.
 */
describe('invarianti su uno scenario completo', () => {
  const TANK_CAPACITY_L = 42;
  const DECLARED_KM_PER_LITER = 15;
  const THRESHOLD_KM = 5;
  const START_ODOMETER_KM = 100_000;

  const billableMembers = ['luca', 'marco', 'giulia'];
  const day = (n: number, h = 10) => new Date(2026, 6, n, h);

  function buildScenario() {
    const ledger: LedgerEntry[] = [];
    const tankEvents: TankEvent[] = [];
    const kmByUser = new Map<string, number>();

    const charge = (userId: string, cents: number, at: Date) => {
      ledger.push({ userId, amountCents: -cents, type: 'consumption_charge', occurredAt: at });
    };
    const addKm = (userId: string, km: number) => {
      kmByUser.set(userId, (kmByUser.get(userId) ?? 0) + km);
    };

    // Luca fa 40 litri a 1,80 €/l e viene accreditato di tutto quanto ha speso.
    const refuel: Refuel = {
      id: 'r1',
      liters: 40,
      pricePerLiterCents: 180,
      odometerKm: START_ODOMETER_KM,
      tankLevelAfter: null,
      refueledAt: day(1),
    };
    ledger.push({
      userId: 'luca',
      amountCents: refuel.liters * refuel.pricePerLiterCents,
      type: 'refuel_credit',
      occurredAt: day(1),
    });
    tankEvents.push({ kind: 'refuel', at: day(1), refuel });

    // Ogni corsa brucia carburante al prezzo medio di quello che ha nel serbatoio.
    const runTrip = (userId: string, distanceKm: number, at: Date, passengers: string[] = []) => {
      const price = referencePrice({
        events: tankEvents,
        tankCapacityL: TANK_CAPACITY_L,
        fallbackPricePerLiterCents: 175,
      });
      const { litersEstimated, costCents } = tripCost({
        distanceKm,
        consumptionKmPerLiter: DECLARED_KM_PER_LITER,
        unitPriceCents: price.pricePerLiterCents,
      });
      for (const [id, share] of splitTripCost(costCents, userId, passengers)) charge(id, share, at);
      tankEvents.push({ kind: 'consumption', at, liters: litersEstimated });
      addKm(userId, distanceKm);
      return costCents;
    };

    runTrip('luca', 100, day(2));
    runTrip('marco', 150, day(5));

    // 150 km che non ha registrato nessuno: li rileva Luca e nega, negano anche gli altri.
    const detectedAt = day(12);
    const detection = evaluateOdometerReading({
      savedOdometerKm: START_ODOMETER_KM + 250,
      realOdometerKm: START_ODOMETER_KM + 400,
      thresholdKm: THRESHOLD_KM,
      driftBufferKm: 0,
      openTrip: null,
      lastEventAt: day(5),
      now: detectedAt,
    });
    expect(detection).toMatchObject({ kind: 'unclaimed_trip', distanceKm: 150 });

    const unclaimedPrice = referencePrice({
      events: tankEvents,
      tankCapacityL: TANK_CAPACITY_L,
      fallbackPricePerLiterCents: 175,
    });
    const unclaimedCost = tripCost({
      distanceKm: 150,
      consumptionKmPerLiter: DECLARED_KM_PER_LITER,
      unitPriceCents: unclaimedPrice.pricePerLiterCents,
    });

    const resolution = resolveUnclaimed({
      billableMemberIds: billableMembers,
      detectedByUserId: 'luca',
      responses: billableMembers.map((userId) => ({
        userId,
        answer: 'not_mine' as const,
        answeredAt: day(13),
      })),
      deadlineAt: day(14),
      now: day(13),
    });
    expect(resolution).toEqual({ status: 'split', chargedTo: ['marco', 'giulia'] });

    for (const [id, share] of splitCentsAmong(unclaimedCost.costCents, resolution.chargedTo)) {
      charge(id, share, detectedAt);
    }
    tankEvents.push({ kind: 'consumption', at: detectedAt, liters: unclaimedCost.litersEstimated });
    // I km restano attribuiti a chi li paga: è così che il totale torna col contachilometri.
    for (const id of resolution.chargedTo) addKm(id, 150 / resolution.chargedTo.length);

    // La nonna usa la 500 ma qui prende la Fiesta: km registrati, addebito su di lei,
    // che è un utente non fatturabile e resta fuori dai conti tra fratelli.
    runTrip('nonna', 50, day(18));

    // Tre km di rumore: manovre in cortile, restano nel drift buffer senza disturbare nessuno.
    const drift = evaluateOdometerReading({
      savedOdometerKm: START_ODOMETER_KM + 450,
      realOdometerKm: START_ODOMETER_KM + 453,
      thresholdKm: THRESHOLD_KM,
      driftBufferKm: 0,
      openTrip: null,
      lastEventAt: day(18),
      now: day(20),
    });
    expect(drift).toMatchObject({ kind: 'drift_absorbed', driftBufferKm: 3 });

    return {
      ledger,
      tankEvents,
      kmByUser,
      driftBufferKm: 3,
      realOdometerKm: START_ODOMETER_KM + 453,
    };
  }

  it('la somma dei saldi vale il carburante pagato e non ancora consumato', () => {
    const { ledger, tankEvents } = buildScenario();
    const tank = tankState(tankEvents, TANK_CAPACITY_L);

    expect(ledgerTotal(ledger)).toBe(
      unconsumedFuelValueCents(tank.litersInTank, tank.avgPriceCents),
    );
  });

  it('la somma dei km attribuiti più il drift buffer è pari ai km reali del mezzo', () => {
    const { kmByUser, driftBufferKm, realOdometerKm } = buildScenario();
    const attributedKm = [...kmByUser.values()].reduce((a, b) => a + b, 0);

    expect(attributedKm + driftBufferKm).toBe(realOdometerKm - START_ODOMETER_KM);
  });

  it('i km della nonna sono registrati ma restano fuori dai conti tra fratelli', () => {
    const { ledger, kmByUser } = buildScenario();
    const userBalances = balances(ledger);

    expect(kmByUser.get('nonna')).toBe(50);
    expect(userBalances.get('nonna')).toBeLessThan(0);

    const brothersTotal = billableMembers.reduce((sum, id) => sum + (userBalances.get(id) ?? 0), 0);
    expect(brothersTotal).not.toBe(ledgerTotal(ledger));
  });
});
