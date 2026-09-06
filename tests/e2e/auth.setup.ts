import { expect, test as setup } from '@playwright/test';

/**
 * Login una volta sola, sessione riusata da tutti i test.
 *
 * Il rate limit sul login è di 5 tentativi al minuto ed è una misura di sicurezza vera:
 * si aggira riusando la sessione, non alzando il limite per fare contenti i test.
 */
const CREDENTIALS = [
  { file: 'tests/e2e/.auth/luca.json', email: 'luca@mezzi.local', password: 'passwordlunga123' },
  {
    file: 'tests/e2e/.auth/matteo.json',
    email: 'matteo@mezzi.local',
    password: 'passwordlunga456',
  },
];

for (const { file, email, password } of CREDENTIALS) {
  setup(`login ${email}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Entra' }).click();
    await expect(page.getByText(/La tua autonomia|Chilometri da coprire/)).toBeVisible();
    await page.context().storageState({ path: file });
  });
}
