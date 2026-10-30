#!/usr/bin/env node
// Creates the icons of every page from its metadata:
//   <meta name="tool:icon"  content="dice-5">    Tabler icon name (https://tabler.io/icons, MIT)
//   <meta name="tool:color" content="#7a3fb0">   background colour
//
// Output per page folder:
//   icon.svg                favicon
//   icon-180.png            apple-touch-icon (iPhone home screen)
//   icon-192.png, icon-512.png   PWA manifest icons (start page: for its home screen shortcut on Android)
//   icon-maskable-512.png   PWA icon Android may crop to a circle/squircle (icon kept in the safe zone)
//
// Run manually after adding a page or changing its icon – not part of the git hook.
//   node scripts/build-icons.mjs              all pages
//   node scripts/build-icons.mjs dice-coin    only this folder ("." = start page)
//
// The Tabler version comes from scripts/vendor.json (entry "tabler-icons"); the package is
// downloaded from the npm registry. PNGs need Playwright (Chromium); without it only icon.svg is written.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, allPages, meta, npmFiles } from './lib.mjs';

const tabler = JSON.parse(readFileSync(join(ROOT, 'scripts/vendor.json'), 'utf8'))['tabler-icons'];
let tablerFiles = null;
async function tablerSvg(name) {
  tablerFiles ??= (await npmFiles(tabler.package, tabler.version)).files;
  const f = tablerFiles.get(`icons/outline/${name}.svg`);
  if (!f) throw new Error(`Tabler icon "${name}" not found in ${tabler.package}@${tabler.version}`);
  return f.toString('utf8');
}

// Puts the 24×24 outline icon in white onto a coloured 64×64 tile.
// maskable: full-bleed square, icon shrunk into the central safe zone (radius 40 %).
function compose(svg, color, maskable) {
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '')
    .replace(/currentColor/g, '#fff')
    .trim();
  const [size, offset] = maskable ? [32, 16] : [40, 12];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64"${maskable ? '' : ' rx="14"'} fill="${color}"/>
<g transform="translate(${offset} ${offset}) scale(${(size / 24).toFixed(4)})" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${inner}
</g>
</svg>
`;
}

async function renderPngs(jobs) {
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (_) {
    console.warn('! Playwright not available – PNG icons not generated');
    return;
  }
  // PW_CHROMIUM_PATH: use an existing Chromium (same as playwright.config.mjs, see tests/README.md)
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  const shot = async (svg, px, file) => {
    await page.setViewportSize({ width: px, height: px });
    await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${px}" height="${px}" `)}</body></html>`);
    await page.screenshot({ path: file, omitBackground: true });
  };
  for (const { dir, svg, mask, pwa } of jobs) {
    await shot(svg, 180, join(dir, 'icon-180.png'));
    if (!pwa) continue; // start page is not an installable app
    await shot(svg, 192, join(dir, 'icon-192.png'));
    await shot(svg, 512, join(dir, 'icon-512.png'));
    await shot(mask, 512, join(dir, 'icon-maskable-512.png'));
  }
  await browser.close();
}

const only = process.argv[2];
const jobs = [];
for (const { folder, file } of allPages()) {
  if (only && (only === '.' ? folder !== '' : folder !== only)) continue;
  const html = readFileSync(join(ROOT, file), 'utf8');
  const icon = meta(html, 'tool:icon'), color = meta(html, 'tool:color') || '#334155';
  if (!icon) continue;
  const raw = await tablerSvg(icon);
  const svg = compose(raw, color, false), mask = compose(raw, color, true);
  const dir = join(ROOT, folder);
  writeFileSync(join(dir, 'icon.svg'), svg);
  jobs.push({ dir, svg, mask, pwa: true });
  console.log(`${folder || '(start page)'}: ${icon} ${color}`);
}
await renderPngs(jobs);
if (!jobs.length) console.warn('! No page with <meta name="tool:icon"> found' + (only ? ` in "${only}"` : ''));
