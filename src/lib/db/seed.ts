import { randomUUID } from 'node:crypto';
import { db } from './index';
import { user, vehicleMembers, vehicles } from './schema';

/**
 * Seed idempotente: gli id sono fissi, quindi rilanciarlo non duplica niente.
 * Le credenziali non si seminano: si arriva con un invito (Fase 1).
 */

const USERS = [
  { id: 'u-luca', name: 'Luca', email: 'luca@mezzi.local', role: 'admin', color: '#e2703a' },
  { id: 'u-matteo', name: 'Matteo', email: 'matteo@mezzi.local', role: 'member', color: '#3a7ce2' },
  {
    id: 'u-gabriele',
    name: 'Gabriele',
    email: 'gabriele@mezzi.local',
    role: 'member',
    color: '#3ae28a',
  },
] as const;

const NONNA = {
  id: 'u-nonna',
  name: 'Nonna',
  email: 'nonna@mezzi.local',
  role: 'member',
  color: '#b08fd8',
} as const;

const VEHICLES = [
  {
    id: 'v-fiesta',
    name: 'Ford Fiesta',
    type: 'car',
    fuelType: 'benzina',
    declaredConsumptionKmL: 16,
    tankCapacityL: 42,
    discrepancyThresholdKm: 5,
    color: '#4f83cc',
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
    color: '#d4a03a',
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
    color: '#5fbf6a',
    icon: 'scooter',
    ownerNote: null,
  },
] as const;

function seed() {
  for (const u of USERS) {
    db.insert(user)
      .values({ ...u, billable: true, canLogin: true })
      .onConflictDoNothing()
      .run();
  }

  // La nonna usa la 500 ma non entra nella ripartizione: i suoi km si registrano,
  // i suoi euro restano fuori dai conti tra fratelli. Solo l'admin scrive per lei.
  db.insert(user)
    .values({ ...NONNA, billable: false, canLogin: false })
    .onConflictDoNothing()
    .run();

  for (const v of VEHICLES) {
    db.insert(vehicles).values(v).onConflictDoNothing().run();
    for (const u of USERS) {
      db.insert(vehicleMembers)
        .values({ id: randomUUID(), vehicleId: v.id, userId: u.id, shareFixedCosts: true })
        .onConflictDoNothing()
        .run();
    }
  }

  // La nonna partecipa alla 500 senza quota sui costi fissi.
  db.insert(vehicleMembers)
    .values({ id: randomUUID(), vehicleId: 'v-500', userId: NONNA.id, shareFixedCosts: false })
    .onConflictDoNothing()
    .run();

  console.log(`Seed completato: ${USERS.length + 1} utenti, ${VEHICLES.length} mezzi.`);
}

seed();
