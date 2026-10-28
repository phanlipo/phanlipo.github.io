#!/usr/bin/env node
// Creates the favicon of every page from its metadata:
//   <meta name="tool:icon"  content="dice-5">    Tabler icon name (https://tabler.io/icons, MIT)
//   <meta name="tool:color" content="#7a3fb0">   background colour
//
// Output per page folder: icon.svg (favicon) and icon-180.png (apple-touch-icon, home screen).
// Run manually after adding a page or changing its icon – not part of the git hook.
//
// Usage:
//   node scripts/build-icons.mjs                 all pages
//   node scripts/build-icons.mjs dice-coin       only this folder ("." = start page)
//
// Icon source: downloads the SVG from jsdelivr (pinned version). For offline use point
// TABLER_ICONS_DIR at a local copy of @tabler/icons/icons/outline.
// The PNG needs Playwright (Chromium); without it only icon.svg is written.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, allPages, meta } from './lib.mjs';

const TABLER_VERSION = '3.19.0';

async function tablerSvg(name) {
  const dir = process.env.TABLER_ICONS_DIR;
  if (dir) return readFileSync(join(dir, `${name}.svg`), 'utf8');
  const url = `https://cdn.jsdelivr.net/npm/@tabler/icons@${TABLER_VERSION}/icons/outline/${name}.svg`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${name}: ${res.status} ${url}`);
  return res.text();
}

// Puts the 24×24 outline icon in white onto a rounded, coloured 64×64 tile
function compose(svg, color) {
  const inner = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/, '')
    .replace(/<path stroke="none" d="M0 0h24v24H0z" fill="none"\s*\/>/, '')
    .replace(/currentColor/g, '#fff')
    .trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<rect width="64" height="64" rx="14" fill="${color}"/>
<g transform="translate(12 12) scale(1.6667)" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${inner}
</g>
</svg>
`;
}

async function renderPngs(jobs) {
  let chromium;
  try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch (_) {
    console.warn('! Playwright not available – icon-180.png not generated');
    return;
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 180, height: 180 } });
  for (const { dir, svg } of jobs) {
    await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body></html>`);
    await page.screenshot({ path: join(dir, 'icon-180.png'), omitBackground: true });
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
  const svg = compose(await tablerSvg(icon), color);
  const dir = join(ROOT, folder);
  writeFileSync(join(dir, 'icon.svg'), svg);
  jobs.push({ dir, svg });
  console.log(`${folder || '(start page)'}: ${icon} ${color}`);
}
await renderPngs(jobs);
if (!jobs.length) console.warn('! No page with <meta name="tool:icon"> found' + (only ? ` in "${only}"` : ''));
