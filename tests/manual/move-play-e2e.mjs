#!/usr/bin/env node
// Manual end-to-end check of MovePlay with the REAL MediaPipe pose model (~5.8 MB from Google).
// Not part of `npm test` (download). Optionally with a photo of a standing person (not committed – privacy):
//
//   node tests/manual/move-play-e2e.mjs [photo.jpg]
//
// Starts the local test server, uses the photo (or an empty test picture) as the camera, starts "Simon says",
// waits until the model runs and prints the diagnostics: model ready, results per second, time per picture,
// whether a person was found and calibrated (with a photo: should become "visible" and "calibrated: true");
// with a photo it also saves a screenshot next to it as <photo>-move-play.png.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [file] = process.argv.slice(2);
const photo = file ? 'data:image/jpeg;base64,' + readFileSync(file).toString('base64') : null;
const PORT = 4181;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, proxy });
try {
  const page = await browser.newPage();
  await page.addInitScript(src => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas'); c.width = 640; c.height = 480;
      const x = c.getContext('2d');
      let img = null;
      if (src) { img = new Image(); img.src = src; await img.decode(); }
      setInterval(() => {
        x.fillStyle = '#556'; x.fillRect(0, 0, 640, 480);
        if (img) { const k = Math.min(640 / img.naturalWidth, 480 / img.naturalHeight); x.drawImage(img, (640 - img.naturalWidth * k) / 2, (480 - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k); }
      }, 40);
      return c.captureStream(25);
    };
  }, photo);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`http://localhost:${PORT}/move-play/`);
  await page.click('[data-game="simon"]');
  const t0 = Date.now();
  while (!/model: ready/.test(await page.evaluate(() => Tools.diag.text()))) {
    if (Date.now() - t0 > 120000) { console.error(await page.evaluate(() => Tools.diag.text())); throw new Error('model not ready after 120 s'); }
    await page.waitForTimeout(500);
  }
  console.log(`model ready after ${Math.round((Date.now() - t0) / 1000)} s`);
  await page.waitForTimeout(4000);
  const diag = await page.evaluate(() => Tools.diag.text());
  console.log(diag.split('\n').filter(l => /model|delegate|inferMs|results|person|calibrated|screen|fps|error|blocked/.test(l)).join('\n'));
  if (file) { const out = file.replace(/\.\w+$/, '') + '-move-play.png'; await page.screenshot({ path: out }); console.log('saved', out); }
} finally {
  await browser.close();
  server.kill();
}
