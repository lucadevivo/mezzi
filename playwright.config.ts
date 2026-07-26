import { resolve } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 3011;
/** Assoluto: il server standalone si sposta nella sua cartella prima di partire. */
const DATABASE_PATH = resolve('./data/e2e.db');

/**
 * Due flussi soltanto, quelli che devono funzionare o l'app non serve:
 * una corsa dall'inizio alla fine e un rifornimento.
 * Girano sullo stesso server standalone dell'immagine di produzione, su un DB usa e getta.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Viewport da telefono, motore Chromium: WebKit servirebbe solo a testare Safari,
    // e per questi due flussi non cambia niente.
    ...devices['Pixel 7'],
  },
  webServer: {
    command: [
      `rm -f ${DATABASE_PATH}*`,
      'npm run db:migrate',
      'npm run db:seed',
      'npm run user:password -- luca@mezzi.local passwordlunga123',
      // Il server standalone gira nella propria cartella: gli servono statici e migrazioni lì.
      'cp -r .next/static .next/standalone/.next/',
      'cp -r drizzle .next/standalone/',
      `PORT=${PORT} node .next/standalone/server.js`,
    ].join(' && '),
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_PATH,
      AUTH_SECRET: 'e2e-secret-e2e-secret-e2e-secret-1234',
      APP_URL: `http://127.0.0.1:${PORT}`,
    },
  },
});
