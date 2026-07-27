import { expect, test } from '@playwright/test';
import { enterOdometer } from './helpers';

/**
 * Il caso per cui esiste la Fase 3: registrare una corsa in garage, senza segnale,
 * e ritrovarsela nei conti quando la rete torna.
 */
test('corsa registrata senza rete: resta in coda e parte quando il segnale torna', async ({
  page,
  context,
}) => {
  await page.goto('/mezzi/v-500');
  await expect(page.getByRole('heading', { name: 'Fiat 500' })).toBeVisible();

  await context.setOffline(true);

  await enterOdometer(page, 'Contachilometri adesso', '50000');
  await page.getByRole('button', { name: 'Avanti' }).click();

  await expect(page.getByText('Corsa avviata senza rete')).toBeVisible();
  await expect(page.getByRole('status')).toContainText('1 operazione in coda');

  // Anche la chiusura funziona offline: l'id della corsa l'ha generato il telefono.
  await enterOdometer(page, 'Contachilometri di arrivo', '50050');
  await page.getByRole('button', { name: 'Chiudi la corsa' }).click();
  await expect(page.getByRole('status')).toContainText('2 operazioni in coda');

  await context.setOffline(false);

  // Nessun intervento dell'utente: la coda parte da sola quando il segnale torna.
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 15_000 });

  await page.goto('/mezzi/v-500');
  await expect(page.getByText('50.050 km', { exact: true })).toBeVisible();
});
