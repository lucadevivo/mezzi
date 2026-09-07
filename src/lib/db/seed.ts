import { randomUUID } from 'node:crypto';
import { db } from './index';
import { user, vehicleMembers, vehicles } from './schema';

/**
 * Seed idempotente: gli id sono fissi, quindi rilanciarlo non duplica niente.
 * Le credenziali non si seminano: si arriva con un invito (Fase 1).
 *
 * I colori non sono scelti a occhio: sono passati dal validatore della palette
 * (banda di luminosita per fondo scuro, separazione sotto daltonismo, contrasto).
 * La coppia Fiat 500 / Scarabeo con i colori di prima era indistinguibile in
 * deuteranopia, cioe' esattamente l'errore che i colori dovrebbero impedire.
 * Se li cambi, rivalidali prima.
 */

const USERS = [
  { id: 'u-luca', name: 'Luca', email: 'luca@mezzi.local', role: 'admin', color: '#c9622f' },
  { id: 'u-matteo', name: 'Matteo', email: 'matteo@mezzi.local', role: 'member', color: '#2f6ac2' },
  {
    id: 'u-gabriele',
    name: 'Gabriele',
    email: 'gabriele@mezzi.local',
    role: 'member',
    color: '#2a9d63',
  },
] as const;


const VEHICLES = [
  {
    id: 'v-fiesta',
    name: 'Ford Fiesta',
    type: 'car',
    fuelType: 'benzina',
    declaredConsumptionKmL: 16,
    tankCapacityL: 42,
    discrepancyThresholdKm: 5,
    color: '#3f7fd0',
    icon: 'car',
    ownerNote: 'Mezzo di casa',
  },
  {
    id: 'v-500',
    name: 'Fiat 500',
    type: 'car',
    fuelType: 'benzina',
    declaredConsumptionKmL: 17,
    tankCapacityL: 35,
    discrepancyThresholdKm: 5,
    color: '#c9682f',
    icon: 'car',
    ownerNote: 'È della nonna, ce la presta',
  },
  {
    id: 'v-scarabeo',
    name: 'Aprilia Scarabeo',
    type: 'scooter',
    fuelType: 'benzina',
    declaredConsumptionKmL: 30,
    tankCapacityL: 8,
    discrepancyThresholdKm: 3,
    color: '#2f9d8b',
    icon: 'scooter',
    ownerNote: null,
  },
] as const;

export function seed() {
  for (const u of USERS) {
    db.insert(user)
      .values({ ...u, billable: true, canLogin: true })
      .onConflictDoNothing()
      .run();
  }

  /*
   * Nessun utente non fatturabile nel seed. La nonna c'era, ma un'app che nasce con
   * dentro la nonna di qualcun altro è una supposizione: gli ospiti — la nonna, papà,
   * un amico — si creano quando servono davvero, scrivendo un nome mentre si registra
   * una corsa o un rifornimento.
   */
  for (const v of VEHICLES) {
    db.insert(vehicles)
      .values(v)
      .onConflictDoUpdate({ target: vehicles.id, set: { color: v.color } })
      .run();
    for (const u of USERS) {
      db.insert(vehicleMembers)
        .values({ id: randomUUID(), vehicleId: v.id, userId: u.id, shareFixedCosts: true })
        .onConflictDoNothing()
        .run();
    }
  }

  console.log(`Seed completato: ${USERS.length} utenti, ${VEHICLES.length} mezzi.`);
}

/**
 * Popola solo un database appena creato. Serve al primo avvio in produzione, dove
 * non c'e' `tsx` per lanciare gli script: un redeploy non deve richiedere passi manuali.
 * Se c'e' gia' anche un solo utente, non tocca niente.
 */
export function seedIfEmpty(): boolean {
  if (db.select().from(user).limit(1).get()) return false;
  seed();
  return true;
}

// Eseguito direttamente (`npm run db:seed`), non importato.
if (process.argv[1]?.endsWith('seed.ts')) seed();
