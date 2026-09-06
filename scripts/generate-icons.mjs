import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * Genera le icone della PWA da un SVG, una volta sola: `node scripts/generate-icons.mjs`.
 * I PNG risultanti stanno in public/icons e vanno committati — nessuno li rigenera al build.
 *
 * Il disegno è la stessa macchina che sta nella tab bar, sotto la voce «Mezzi»:
 * l'icona dell'app e quella della sezione principale devono essere la stessa cosa.
 * Il tratto è scalato da 24 a 512 (×21,33) e ingrossato quanto basta a reggere
 * anche a 32 pixel di favicon.
 */
const SIZES = [192, 512, 180];

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0A0A0A"/>
  <g transform="translate(256 256) scale(14) translate(-12 -12.8)"
     fill="none" stroke="#FAFAFA" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 13.5 6.8 8.4A2 2 0 0 1 8.7 7h6.6a2 2 0 0 1 1.9 1.4L19 13.5"/>
    <path d="M4 13.5h16v4a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1h-9v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/>
    <path d="M7 16h.01M17 16h.01"/>
  </g>
</svg>`;

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync('public/icons', { recursive: true });

for (const size of SIZES) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${svg(size)}</body>`,
    { waitUntil: 'load' },
  );
  const png = await page.screenshot({ omitBackground: true });
  const name = size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`;
  writeFileSync(`public/icons/${name}`, png);
  console.log(`public/icons/${name}`);

  // Next serve `src/app/icon.png` come favicon: stessa macchina anche lì.
  if (size === 192) {
    writeFileSync('src/app/icon.png', png);
    console.log('src/app/icon.png');
  }
}

await browser.close();
