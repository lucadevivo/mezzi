import { expect, test } from '@playwright/test';
import { enterOdometer } from './helpers';

test('rifornimento e corsa completa: i numeri tornano', async ({ page }) => {
  await page.goto('/');

  // Prima il pieno: senza carburante pagato non c'è un prezzo da addebitare.
  await page.getByRole('link', { name: /Ford Fiesta/ }).click();
  await expect(page.getByRole('heading', { name: 'Ford Fiesta' })).toBeVisible();
  await page.getByRole('link', { name: 'Ho fatto rifornimento' }).click();

  // La navigazione è lato client: senza questa attesa la fill finisce nel campo
  // della pagina precedente, che ha un'etichetta molto simile.
  await expect(page.getByRole('heading', { name: /^Rifornimento/ })).toBeVisible();

  await page.getByLabel('Contachilometri', { exact: true }).fill('100000');
  await page.getByLabel('Litri').fill('40');
  await page.getByLabel('€ al litro').fill('1,80');
  await page.getByRole('button', { name: 'Pieno' }).click();
  await page.getByRole('button', { name: 'Registra il rifornimento' }).click();

  await expect(page.getByText('100.000 km', { exact: true })).toBeVisible();

  // Chi ha pagato il pieno è in credito di 72 euro.
  await page.goto('/saldi');
  await expect(page.getByText('72,00 €').first()).toBeVisible();

  // Poi la corsa: 100 km a 16 km/l fanno 6,25 litri, cioè 11,25 euro.
  await page.goto('/mezzi/v-fiesta');
  await enterOdometer(page, 'Contachilometri adesso', '100000');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avvia la corsa' }).click();

  await expect(page.getByText('Corsa in corso')).toBeVisible();

  await enterOdometer(page, 'Contachilometri di arrivo', '100100');
  await page.getByRole('button', { name: 'Chiudi la corsa' }).click();

  // 100 km in pochi secondi: il controllo di plausibilità chiede conferma, come deve.
  await expect(page.getByText(/200 km\/h/)).toBeVisible();
  await page.getByRole('button', { name: 'Confermo, chiudi la corsa' }).click();

  await expect(page.getByText('100.100 km', { exact: true })).toBeVisible();

  await page.goto('/saldi');
  await expect(page.getByText('60,75 €').first()).toBeVisible();
});

test('km non registrati: il rilevatore può dire che non sono suoi', async ({ page }) => {
  // Lo Scarabeo ha soglia 3 km: 60 km in più non passano inosservati.
  await page.goto('/mezzi/v-scarabeo');
  await enterOdometer(page, 'Contachilometri adesso', '60');
  await page.getByRole('button', { name: 'Avanti' }).click();

  await expect(page.getByText(/non registrati su questo mezzo/)).toBeVisible();
  await page.getByRole('button', { name: 'Non sono stato io' }).click();

  await expect(page.getByText('Corsa in corso')).toBeVisible();

  await page.goto('/reclami');
  await expect(page.getByText(/60 km non registrati/)).toBeVisible();
  // La risposta è pubblica: compare nell'elenco, non solo sul pulsante di chi ha risposto.
  await expect(page.getByText('non sono miei', { exact: true })).toBeVisible();
});
