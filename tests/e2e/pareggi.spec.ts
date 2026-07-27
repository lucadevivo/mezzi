import { expect, test, type Page } from '@playwright/test';

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Entra' }).click();
  await expect(page.getByText('Il tuo saldo')).toBeVisible();
}

async function logout(page: Page) {
  await page.context().clearCookies();
}

test('un pareggio muove i saldi solo dopo la conferma di chi riceve', async ({ page }) => {
  await login(page, 'luca@mezzi.local', 'passwordlunga123');

  await page.goto('/pareggi');
  await page.getByLabel('A chi hai dato i soldi').selectOption({ label: 'Matteo' });
  await page.getByLabel('Quanto (€)').fill('20');
  await page.getByRole('button', { name: 'Registra il pareggio' }).click();

  await expect(page.getByText('in attesa di conferma')).toBeVisible();

  // Finché Matteo non conferma, i saldi restano fermi a zero.
  await page.goto('/saldi');
  await expect(page.getByText('20,00 €')).toHaveCount(0);

  await logout(page);
  await login(page, 'matteo@mezzi.local', 'passwordlunga456');

  await page.goto('/pareggi');
  await page.getByRole('button', { name: 'Confermo, li ho ricevuti' }).click();
  await expect(page.getByText('confermato')).toBeVisible();

  // Ora sì: chi ha pagato risale di 20, chi ha incassato scende di 20.
  await page.goto('/saldi');
  await expect(page.getByText('20,00 €').first()).toBeVisible();
  await expect(page.getByText('-20,00 €')).toBeVisible();
});

test('una spesa in parti uguali si registra e compare in elenco', async ({ page }) => {
  await login(page, 'luca@mezzi.local', 'passwordlunga123');

  await page.goto('/spese');
  await page.getByLabel('Tipo di spesa').selectOption('bollo');
  await page.getByLabel('Importo (€)').fill('120');
  await page.getByLabel('In parti uguali').check();
  await page.getByRole('button', { name: 'Registra la spesa' }).click();

  await expect(page.getByText('in parti uguali')).toBeVisible();
  await expect(page.getByText('120,00 €')).toBeVisible();
});
