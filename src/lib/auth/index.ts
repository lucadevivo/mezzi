import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { db, schema } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { hashPassword, verifyPassword } from './hash';

const env = getEnv();

export const auth = betterAuth({
  appName: 'Mezzi',
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'sqlite', schema }),

  emailAndPassword: {
    enabled: true,
    // Nessuna signup aperta: si entra solo con un invito dell'admin (vedi `invites.ts`).
    disableSignUp: true,
    password: { hash: hashPassword, verify: verifyPassword },
  },

  session: {
    // Si usa dal telefono in garage: rifare il login ogni settimana è inaccettabile.
    expiresIn: 60 * 60 * 24 * 60,
    updateAge: 60 * 60 * 24,
  },

  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'member', input: false },
      color: { type: 'string', required: false, defaultValue: '#8899a6', input: false },
      billable: { type: 'boolean', required: false, defaultValue: true, input: false },
      canLogin: { type: 'boolean', required: false, defaultValue: true, input: false },
      active: { type: 'boolean', required: false, defaultValue: true, input: false },
    },
  },

  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    customRules: {
      // Il login è l'unico endpoint che vale la pena forzare a tentativi.
      '/sign-in/email': { window: 60, max: 5 },
    },
  },

  advanced: {
    // Legato allo schema dell'URL, non a NODE_ENV: dietro il tunnel Cloudflare
    // siamo sempre in https, e in locale su http un cookie Secure non tornerebbe mai.
    useSecureCookies: env.APP_URL.startsWith('https://'),
    cookiePrefix: 'mezzi',
  },

  trustedOrigins: [env.APP_URL],

  plugins: [nextCookies()],
});

export type SessionUser = typeof auth.$Infer.Session.user;
