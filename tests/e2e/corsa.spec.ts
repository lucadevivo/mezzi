import { expect, test } from '@playwright/test';
import { closeTrip, enterOdometer } from './helpers';

test('rifornimento e corsa completa: i numeri tornano', async ({ page }) => {
  await page.goto('/');

  // Prima il pieno: senza carburante pagato non c'è un prezzo da addebitare.
  await page.getByRole('link', { name: /Ford Fiesta/ }).click();
  await expect(page.getByRole('heading', { name: 'Ford Fiesta' })).toBeVisible();
  await page.getByRole('link', { name: 'Ho fatto rifornimento' }).click();

  // La navigazione è lato client: senza questa attesa la fill finisce nel campo
  // della pagina precedente, che ha un'etichetta molto simile.
  await expect(page.getByRole('heading', { name: /^Rifornimento/ })).toBeVisible();

  // Niente contachilometri e niente litri: si dice quanto si e' speso e a quanto stava.
  await page.getByLabel('Quanto hai messo (€)').fill('72,00');
  await page.getByLabel('€ al litro').fill('1,80');
  // La lancetta si trascina: qui la si porta al fondo scala, cioe' al pieno.
  await page.getByLabel('Livello del serbatoio dopo il rifornimento').fill('1');
  await page.getByRole('button', { name: 'Registra il rifornimento' }).click();

  // Il conto non è in euro: 72 € a 1,80 fanno 40 litri, che a 16 km/l valgono 640 km.
  await page.goto('/saldi');
  await expect(page.getByText('640 km di autonomia').first()).toBeVisible();

  // Poi la corsa: 100 km a 16 km/l fanno 6,25 litri, cioè 11,25 euro.
  await page.goto('/mezzi/v-fiesta');
  await enterOdometer(page, 'Contachilometri adesso', '0');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avvia la corsa' }).click();

  await expect(page.getByText('Corsa in corso')).toBeVisible();

  await closeTrip(page, '100');

  await expect(page.getByText('100 km', { exact: true })).toBeVisible();

  // Comprati 640 km, guidati 100: ne restano 540.
  await page.goto('/saldi');
  await expect(page.getByText('540 km di autonomia').first()).toBeVisible();
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

/**
 * Regressione: col contachilometri a decimali il tastierino non aveva la virgola e il
 * valore di partenza veniva arrotondato per difetto. Risultato: il campo proponeva un
 * numero piu' basso di quello vero e l'app rifiutava ogni corsa, perche' il
 * contachilometri non puo' tornare indietro.
 */
test('un contachilometri con i decimali non blocca la corsa successiva', async ({ page }) => {
  await page.goto('/mezzi/v-fiesta');
  await enterOdometer(page, 'Contachilometri adesso', '100');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avvia la corsa' }).click();

  await closeTrip(page, '150,5');

  await expect(page.getByText('150,5 km', { exact: true })).toBeVisible();

  // La corsa dopo parte dal valore vero, virgola compresa, e non viene rifiutata.
  await expect(page.getByLabel('Contachilometri adesso')).toHaveValue('150,5');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await expect(page.getByRole('button', { name: 'Avvia la corsa' })).toBeVisible();
});

/** Le categorie non hanno una schermata di gestione: nascono chiudendo una corsa. */
test('una corsa si può etichettare, e l’etichetta nasce da sé', async ({ page }) => {
  await page.goto('/mezzi/v-500');
  await enterOdometer(page, 'Contachilometri adesso', '0');
  await page.getByRole('button', { name: 'Avanti' }).click();
  await page.getByRole('button', { name: 'Avvia la corsa' }).click();

  await page.getByLabel('A cosa serviva (facoltativo)').fill('consegne');
  await closeTrip(page, '30');

  await page.goto('/storico');
  // La pastiglia sulla riga, non l'opzione nella tendina: quella e' nascosta.
  await expect(page.locator('span.rounded-full', { hasText: 'consegne' })).toBeVisible();

  // E ora si può filtrare: l'etichetta esiste perché qualcuno l'ha scritta.
  await page.getByLabel('Filtra per categoria').selectOption({ label: 'consegne' });
  await expect(page.getByText('30 km')).toBeVisible();
});

/**
 * Papà prende la macchina: non è un utente dell'app, ma i suoi km devono esistere
 * o il contachilometri non torna. L'ospite si crea scrivendo un nome.
 */
test('km di un ospite: si crea al volo e la corsa è sua', async ({ page }) => {
  // I 60 km non reclamati dello Scarabeo sono ancora lì dal test precedente.
  await page.goto('/reclami');
  await expect(page.getByText(/60 km non registrati/)).toBeVisible();
  await page.getByRole('button', { name: /qualcun altro/ }).click();
  await page.getByPlaceholder('Papà').fill('Papà');
  await page.getByRole('button', { name: 'Addebita a chi ho scritto' }).click();

  // Sparisce dai reclami e i km finiscono su di lui, fuori dai conti tra fratelli.
  await expect(page.getByText(/non registrati su questo mezzo/)).toHaveCount(0);
  await page.goto('/saldi');
  await expect(page.getByText('Papà')).toBeVisible();
});
