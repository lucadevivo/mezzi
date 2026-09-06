import { chromium } from '@playwright/test';
const BASE = 'http://127.0.0.1:3011';
const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  headers: { origin: BASE }, data: { email: 'luca@mezzi.local', password: 'passwordlunga123' },
});
const p = await ctx.newPage();
p.on('response', async (r) => {
  if (r.request().method() === 'POST') console.log('POST', r.status(), r.url().slice(0, 60), (await r.text().catch(() => '')).slice(0, 120));
});
p.on('requestfailed', (r) => console.log('FALLITA', r.url().slice(0, 60), r.failure()?.errorText));
// Prima il rifornimento, come fa il test vero: e' li' che cambia lo stato.
await p.goto(`${BASE}/mezzi/v-fiesta/rifornimento`, { waitUntil: 'networkidle' });
await p.getByLabel('Quanto hai messo (€)').fill('72,00');
await p.getByLabel('€ al litro').fill('1,80');
await p.getByLabel('Livello del serbatoio dopo il rifornimento').fill('1');
await p.getByRole('button', { name: 'Registra il rifornimento' }).click();
await p.waitForTimeout(2000);
console.log('dopo rifornimento, url:', p.url());
console.log('pagina:', (await p.locator('body').innerText()).replace(/\n+/g, ' | ').slice(0, 400));

await p.goto(`${BASE}/mezzi/v-fiesta`, { waitUntil: 'networkidle' });
await p.getByLabel('Contachilometri adesso').click();
await p.getByRole('button', { name: 'Fatto' }).click();
await p.getByRole('button', { name: 'Avanti' }).click();
await p.getByRole('button', { name: 'Avvia la corsa' }).click();
const esito = await p.getByText('Corsa in corso').waitFor({ timeout: 10000 }).then(() => 'partita').catch(() => 'INCHIODATA');
console.log('corsa:', esito);
await b.close();
