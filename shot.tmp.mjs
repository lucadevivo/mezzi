import { chromium } from '@playwright/test';
const BASE = 'https://mezzi.webluca.app';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 393, height: 852 } });
const p = await ctx.newPage();
await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
  headers: { origin: BASE }, data: { email: 'luca@mezzi.local', password: 'mezzi-luca-0906' },
});
await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
for (const [name, label] of [['Saldi', 'saldi'], ['Reclami', 'reclami'], ['Altro', 'altro'], ['Mezzi', 'home']]) {
  const t = Date.now();
  await p.getByRole('link', { name, exact: false }).first().click();
  await p.waitForLoadState('networkidle');
  console.log(`${label.padEnd(8)} ${Date.now() - t} ms`);
}
await b.close();
