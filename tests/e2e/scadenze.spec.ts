import { expect, test } from '@playwright/test';

test('una scadenza vicina viene segnalata, e una fatta sparisce', async ({ page }) => {
  await page.goto('/scadenze');

  const soon = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.getByLabel('Mezzo').selectOption({ label: 'Ford Fiesta' });
  await page.getByLabel('Cosa scade').selectOption('bollo');
  await page.getByLabel('Data di scadenza').fill(soon);
  await page.getByRole('button', { name: 'Aggiungi la scadenza' }).click();

  // Cinque giorni, finestra di avviso a quindici: deve dire quanto manca.
  await expect(page.getByText('mancano 5 giorni')).toBeVisible();

  await page.getByRole('button', { name: 'Fatto' }).first().click();
  await expect(page.getByText('mancano 5 giorni')).toHaveCount(0);
});

test('il tagliando scade a chilometri, non a calendario', async ({ page }) => {
  await page.goto('/scadenze');

  await page.getByLabel('Mezzo').selectOption({ label: 'Ford Fiesta' });
  await page.getByLabel('Cosa scade').selectOption('tagliando');
  // La Fiesta è a 100.100 km dopo la corsa del primo test: 200 km e ci siamo.
  await page.getByLabel('Oppure ai chilometri').fill('100300');
  await page.getByRole('button', { name: 'Aggiungi la scadenza' }).click();

  await expect(page.getByText('mancano 200 km')).toBeVisible();
});

test('esportazione CSV: intestazioni giuste e separatore per Excel italiano', async ({ page }) => {
  const response = await page.request.get('/api/export/corse');
  expect(response.ok()).toBe(true);
  expect(response.headers()['content-type']).toContain('text/csv');

  const body = await response.text();
  expect(body).toContain('data;mezzo;utente;km');
  // I decimali con la virgola, altrimenti Excel italiano legge tutto come testo.
  expect(body).toMatch(/;\d+,\d+/);
});

test('la dashboard mostra i numeri del mese', async ({ page }) => {
  await page.goto('/statistiche');
  await expect(page.getByText('Il mezzo più usato del mese')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chilometri per persona' })).toBeVisible();
  await page.screenshot({ path: 'test-results/statistiche.png', fullPage: true });
});
