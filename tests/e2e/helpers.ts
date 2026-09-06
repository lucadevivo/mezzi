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
    // La virgola ha un nome accessibile a parole: «,» da sola non si legge.
    const name = digit === ',' ? 'Virgola' : digit;
    await page.getByRole('button', { name, exact: true }).click();
  }
  await expect(page.getByLabel(label)).toHaveValue(value);
  // Chiude il tastierino: aperto copre il pulsante di conferma sotto.
  await page.getByRole('button', { name: 'Fatto' }).click();
}

/**
 * Chiude la corsa aperta.
 *
 * Il controllo di plausibilita' scatta sulla media km/h, che qui dipende dai secondi
 * veri passati tra apertura e chiusura: a volte la conferma compare, a volte la corsa
 * si chiude diretta. Aspettarla sempre rendeva i test ballerini.
 */
export async function closeTrip(page: Page, endKm: string) {
  await enterOdometer(page, 'Contachilometri di arrivo', endKm);
  await page.getByRole('button', { name: 'Chiudi la corsa' }).click();

  const prendi = page.getByRole('heading', { name: 'Prendi il mezzo' });
  const conferma = page.getByRole('button', { name: 'Confermo, chiudi la corsa' });

  // O la corsa si chiude, o il server chiede conferma: si aspetta quello che arriva,
  // senza tempi fissi. Il controllo di plausibilita' dipende dai secondi veri passati
  // tra apertura e chiusura, quindi la conferma a volte c'e' e a volte no.
  await expect(prendi.or(conferma).first()).toBeVisible({ timeout: 15_000 });
  if (await conferma.isVisible()) await conferma.click();

  await expect(prendi).toBeVisible({ timeout: 15_000 });
}
