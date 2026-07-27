import { z } from 'zod';

/**
 * Configurazione validata all'avvio: meglio non partire affatto che partire
 * con un segreto mancante e scoprirlo al primo login.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Percorso del file SQLite. Un file solo: il backup è una copia. */
  DATABASE_PATH: z.string().min(1).default('./data/mezzi.db'),
  /** Segreto delle sessioni. Generare con: openssl rand -base64 32 */
  AUTH_SECRET: z.string().min(32),
  APP_URL: z.string().url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Prezzo di ripiego al litro, in centesimi, quando non c'è alcuno storico. */
  FALLBACK_FUEL_PRICE_CENTS: z.coerce.number().int().positive().default(180),
  /** Ore oltre le quali una corsa lasciata aperta non assorbe più i km rilevati. */
  OPEN_TRIP_ABSORB_HOURS: z.coerce.number().positive().default(24),
  /** Ore entro cui rispondere a una richiesta di reclamo. */
  CLAIM_DEADLINE_HOURS: z.coerce.number().positive().default(48),

  /**
   * Chiavi VAPID per le notifiche push. Se mancano, l'app funziona lo stesso:
   * le notifiche restano spente invece di far fallire l'avvio.
   * Si generano con: npx web-push generate-vapid-keys
   */
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@webluca.app'),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;

  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configurazione non valida:\n${issues}`);
  }

  cached = parsed.data;
  return cached;
}
