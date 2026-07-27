import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

/**
 * Genera le icone della PWA da un SVG, una volta sola: `node scripts/generate-icons.mjs`.
 * I PNG risultanti stanno in public/icons e vanno committati — nessuno li rigenera al build.
 *
 * Il disegno è l'elemento firma dell'app: il quadrante con l'ago.
 */
const SIZES = [192, 512, 180];

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#14171A"/>
  <path d="M 96 336 A 160 160 0 0 1 416 336" fill="none" stroke="#343B42" stroke-width="28" stroke-linecap="round"/>
  <path d="M 96 336 A 160 160 0 0 1 176 197" fill="none" stroke="#D9544D" stroke-width="28" stroke-linecap="round"/>
  <path d="M 336 197 A 160 160 0 0 1 416 336" fill="none" stroke="#4FB477" stroke-width="28" stroke-linecap="round"/>
  <g transform="rotate(-34 256 336)">
    <line x1="256" y1="336" x2="256" y2="176" stroke="#E8A33D" stroke-width="22" stroke-linecap="round"/>
  </g>
  <circle cx="256" cy="336" r="34" fill="#E8A33D"/>
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
}

await browser.close();
