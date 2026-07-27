import { expect, type Page } from '@playwright/test';

export const MATTEO_STATE = 'tests/e2e/.auth/matteo.json';

/**
 * I campi del contachilometri sono in sola lettura: si scrivono col tastierino grande,
 * che è il punto della Fase 3. I test lo usano come lo userebbe un pollice.
 */
export async function enterOdometer(page: Page, label: string, value: string) {
  await page.getByLabel(label).click();
  await page.getByRole('button', { name: 'Azzera' }).click();
  for (const digit of value) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
  await expect(page.getByLabel(label)).toHaveValue(value);
  // Chiude il tastierino: aperto copre il pulsante di conferma sotto.
  await page.getByRole('button', { name: 'Fatto' }).click();
}
