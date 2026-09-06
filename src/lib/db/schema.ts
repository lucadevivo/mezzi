import { sql } from 'drizzle-orm';
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const now = sql`(cast(unixepoch('subsecond') * 1000 as integer))`;
const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' });
const createdAt = () => timestamp('created_at').default(now).notNull();
const updatedAt = () =>
  timestamp('updated_at')
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

/* -------------------------------------------------------------------------- */
/* Autenticazione (schema atteso da Better Auth + i nostri campi)              */
/* -------------------------------------------------------------------------- */

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),

  role: text('role', { enum: ['admin', 'member'] })
    .default('member')
    .notNull(),
  /** Colore identitario nei grafici e nelle liste. */
  color: text('color').notNull().default('#8899a6'),
  /**
   * Entra nella ripartizione dei costi. La nonna, gli ospiti e i pagatori esterni
   * sono `false`: i loro movimenti restano a ledger ma fuori dai conti tra fratelli.
   */
  billable: integer('billable', { mode: 'boolean' }).default(true).notNull(),
  /** Se `false` l'utente non ha credenziali: solo l'admin registra corse a suo nome. */
  canLogin: integer('can_login', { mode: 'boolean' }).default(true).notNull(),
  active: integer('active', { mode: 'boolean' }).default(true).notNull(),
  notificationPrefs: text('notification_prefs', { mode: 'json' }).$type<Record<string, boolean>>(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/** Registrazione solo su invito: nessuna signup aperta su un'app esposta a internet. */
export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  /** Hash del token: in chiaro vive solo nel link che l'admin manda. */
  tokenHash: text('token_hash').notNull().unique(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  usedByUserId: text('used_by_user_id').references(() => user.id),
  createdAt: createdAt(),
});

/* -------------------------------------------------------------------------- */
/* Mezzi                                                                       */
/* -------------------------------------------------------------------------- */

export const vehicles = sqliteTable('vehicles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['car', 'scooter'] }).notNull(),
  plate: text('plate'),
  fuelType: text('fuel_type', { enum: ['benzina', 'diesel', 'gpl'] }).notNull(),
  /** Consumo di libretto: il punto di partenza finché non ci sono abbastanza pieni. */
  declaredConsumptionKmL: real('declared_consumption_km_l').notNull(),
  /** Consumo misurato sul campo col metodo pieno-a-pieno. Null finché i dati non bastano. */
  computedConsumptionKmL: real('computed_consumption_km_l'),
  tankCapacityL: real('tank_capacity_l').notNull(),
  currentOdometerKm: real('current_odometer_km').notNull().default(0),
  ownerNote: text('owner_note'),
  icon: text('icon'),
  color: text('color').notNull().default('#8899a6'),
  active: integer('active', { mode: 'boolean' }).default(true).notNull(),
  /** Oltre questa differenza di km scatta la corsa da reclamare. */
  discrepancyThresholdKm: real('discrepancy_threshold_km').notNull().default(5),
  /** Rumore accumulato sotto soglia, in attesa di superarla. */
  driftBufferKm: real('drift_buffer_km').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const vehicleMembers = sqliteTable(
  'vehicle_members',
  {
    id: text('id').primaryKey(),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Partecipa anche alla ripartizione di assicurazione, bollo e tagliandi. */
    shareFixedCosts: integer('share_fixed_costs', { mode: 'boolean' }).default(true).notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('vehicle_members_unique').on(table.vehicleId, table.userId)],
);

/* -------------------------------------------------------------------------- */
/* Corse                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Le etichette con cui si dice a cosa serviva una corsa: «consegne», «palestra».
 * Le crea chi guida, al volo, chiudendo la corsa — non c'è una schermata di gestione:
 * con quattro persone e una manciata di etichette sarebbe una cerimonia inutile.
 */
export const tripCategories = sqliteTable('trip_categories', {
  id: text('id').primaryKey(),
  /** Minuscolo e senza spazi ai lati: serve a non ritrovarsi «Palestra» e «palestra». */
  name: text('name').notNull().unique(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
});

export const trips = sqliteTable(
  'trips',
  {
    id: text('id').primaryKey(),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    odometerStartKm: real('odometer_start_km').notNull(),
    odometerEndKm: real('odometer_end_km'),
    distanceKm: real('distance_km'),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at'),
    status: text('status', { enum: ['open', 'closed'] })
      .default('open')
      .notNull(),
    note: text('note'),
    /** Facoltativa: a cosa serviva il tragitto («consegne», «palestra»). */
    categoryId: text('category_id').references(() => tripCategories.id),
    /* Valori congelati alla chiusura: lo storico non cambia mai retroattivamente. */
    costCents: integer('cost_cents'),
    litersEstimated: real('liters_estimated'),
    unitPriceUsedCents: integer('unit_price_used_cents'),
    priceSource: text('price_source', { enum: ['tank_weighted', 'last_refuel', 'first_refuel', 'fallback'] }),
    consumptionKmLUsed: real('consumption_km_l_used'),
    consumptionSource: text('consumption_source', { enum: ['measured', 'declared'] }),
    /** Corsa nata dal reclamo di una `unclaimed_trip`. */
    unclaimedTripId: text('unclaimed_trip_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('trips_vehicle_started_idx').on(table.vehicleId, table.startedAt),
    index('trips_user_idx').on(table.userId),
    // Una sola corsa aperta per mezzo alla volta.
    uniqueIndex('trips_one_open_per_vehicle')
      .on(table.vehicleId)
      .where(sql`${table.status} = 'open'`),
  ],
);

/** Passeggeri a bordo: il costo si divide tra i presenti. */
export const tripPassengers = sqliteTable(
  'trip_passengers',
  {
    id: text('id').primaryKey(),
    tripId: text('trip_id')
      .notNull()
      .references(() => trips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
  },
  (table) => [uniqueIndex('trip_passengers_unique').on(table.tripId, table.userId)],
);

/* -------------------------------------------------------------------------- */
/* Corse da reclamare                                                          */
/* -------------------------------------------------------------------------- */

export const unclaimedTrips = sqliteTable(
  'unclaimed_trips',
  {
    id: text('id').primaryKey(),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    odometerStartKm: real('odometer_start_km').notNull(),
    odometerEndKm: real('odometer_end_km').notNull(),
    distanceKm: real('distance_km').notNull(),
    /** Finestra in cui la corsa è avvenuta: serve alla gente per ricordarsi. */
    windowStartAt: timestamp('window_start_at').notNull(),
    detectedAt: timestamp('detected_at').notNull(),
    detectedByUserId: text('detected_by_user_id')
      .notNull()
      .references(() => user.id),
    litersEstimated: real('liters_estimated').notNull(),
    unitPriceUsedCents: integer('unit_price_used_cents').notNull(),
    costCents: integer('cost_cents').notNull(),
    status: text('status', {
      enum: ['pending', 'claimed', 'split', 'non_billable', 'cancelled'],
    })
      .default('pending')
      .notNull(),
    claimedByUserId: text('claimed_by_user_id').references(() => user.id),
    resolvedAt: timestamp('resolved_at'),
    resolutionNote: text('resolution_note'),
    deadlineAt: timestamp('deadline_at').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('unclaimed_trips_vehicle_status_idx').on(table.vehicleId, table.status)],
);

/** Le risposte sono pubbliche: è l'unico deterrente contro il "non sono stato io". */
export const unclaimedTripResponses = sqliteTable(
  'unclaimed_trip_responses',
  {
    id: text('id').primaryKey(),
    unclaimedTripId: text('unclaimed_trip_id')
      .notNull()
      .references(() => unclaimedTrips.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    answer: text('answer', { enum: ['mine', 'not_mine'] }).notNull(),
    answeredAt: timestamp('answered_at').notNull(),
  },
  (table) => [index('unclaimed_responses_trip_idx').on(table.unclaimedTripId)],
);

/* -------------------------------------------------------------------------- */
/* Rifornimenti e spese                                                        */
/* -------------------------------------------------------------------------- */

export const refuels = sqliteTable(
  'refuels',
  {
    id: text('id').primaryKey(),
    vehicleId: text('vehicle_id')
      .notNull()
      .references(() => vehicles.id),
    /** Chi ha pagato. Può essere un utente non fatturabile (nonna, papà). */
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    liters: real('liters').notNull(),
    pricePerLiterCents: integer('price_per_liter_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    odometerKm: real('odometer_km').notNull(),
    /** Dove sta la lancetta dopo il rifornimento, 0-1. `1` (pieno) abilita la calibrazione. */
    tankFractionAfter: real('tank_fraction_after'),
    stationName: text('station_name'),
    refueledAt: timestamp('refueled_at').notNull(),
    receiptPhotoPath: text('receipt_photo_path'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('refuels_vehicle_odometer_idx').on(table.vehicleId, table.odometerKm)],
);

/* -------------------------------------------------------------------------- */
/* Contabilità                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Il cuore contabile. APPEND-ONLY: nessuna riga si modifica o si cancella mai.
 * Le correzioni sono righe di storno che referenziano l'originale via `reversesEntryId`.
 */
export const ledgerEntries = sqliteTable(
  'ledger_entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id),
    vehicleId: text('vehicle_id').references(() => vehicles.id),
    type: text('type', {
      enum: ['consumption_charge', 'refuel_credit', 'adjustment', 'opening'],
    }).notNull(),
    /**
     * Denaro. Resta per le righe vecchie e per lo storico, ma **non fa più il saldo**:
     * una corsa non ha un prezzo da addebitare, ha dei chilometri.
     */
    amountCents: integer('amount_cents').notNull().default(0),
    /**
     * Chilometri: negativi se guidati, positivi se comprati col carburante.
     * **Il saldo è `SUM(amount_km)`** e si legge come autonomia, non come debito.
     */
    amountKm: real('amount_km').notNull().default(0),
    sourceType: text('source_type', {
      enum: ['trip', 'unclaimed_trip', 'refuel', 'manual'],
    }).notNull(),
    sourceId: text('source_id'),
    reversesEntryId: text('reverses_entry_id'),
    occurredAt: timestamp('occurred_at').notNull(),
    description: text('description').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('ledger_user_occurred_idx').on(table.userId, table.occurredAt),
    index('ledger_source_idx').on(table.sourceType, table.sourceId),
  ],
);

export const deadlines = sqliteTable('deadlines', {
  id: text('id').primaryKey(),
  vehicleId: text('vehicle_id')
    .notNull()
    .references(() => vehicles.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['assicurazione', 'bollo', 'revisione', 'tagliando'] }).notNull(),
  dueDate: timestamp('due_date'),
  /** Il tagliando scade a chilometri, non a calendario. */
  dueOdometerKm: real('due_odometer_km'),
  notifyDaysBefore: integer('notify_days_before').default(15).notNull(),
  completed: integer('completed', { mode: 'boolean' }).default(false).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* -------------------------------------------------------------------------- */
/* Uso sul campo: coda offline e notifiche                                     */
/* -------------------------------------------------------------------------- */

/**
 * Operazioni arrivate dalla coda offline. L'id lo genera il telefono: se la
 * sincronizzazione parte due volte (rete che va e viene) la seconda non fa niente.
 */
export const syncOps = sqliteTable('sync_ops', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id),
  kind: text('kind', { enum: ['start_trip', 'close_trip', 'refuel'] }).notNull(),
  payload: text('payload', { mode: 'json' }).notNull(),
  /** Quando è successo davvero, non quando è arrivato al server. */
  occurredAt: timestamp('occurred_at').notNull(),
  appliedAt: createdAt(),
  result: text('result'),
});

export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
    /** Ultimo errore del push service: dopo un 404/410 la subscription è morta. */
    failedAt: timestamp('failed_at'),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
);

export const auditLog = sqliteTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => user.id),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    /** Cosa è cambiato, in JSON: serve a ricostruire le discussioni. */
    payload: text('payload', { mode: 'json' }),
    occurredAt: timestamp('occurred_at').notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('audit_entity_idx').on(table.entityType, table.entityId)],
);
