#!/usr/bin/env node
// Manual end-to-end check of "Kamera-Effekte" with a REAL photo and the real MediaPipe models.
// Not part of `npm test`: it downloads the models (~5 MB) from Google and needs a photo with people
// that must not be committed (privacy).
//
//   node tests/manual/camera-e2e.mjs <photo.jpg> [effect]     effect default: gray (applied to the background)
//   ACC=glasses WARP=bulge node tests/manual/camera-e2e.mjs <photo.jpg>   also a face accessory and/or distortion
//
// Starts the local test server, shows the photo as the camera picture, turns on "Detect" and
// "Background", prints the people found (count, boxes, confidence) and saves the result next to the photo
// as <photo>-camera-effects.png.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [file, effect = 'gray'] = process.argv.slice(2);
if (!file) { console.error('Usage: node tests/manual/camera-e2e.mjs <photo.jpg> [effect]'); process.exit(2); }
const photo = 'data:image/jpeg;base64,' + readFileSync(file).toString('base64');

const PORT = 4180;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined, proxy });
try {
  const page = await browser.newPage();
  // The photo as camera: drawn into a canvas stream
  await page.addInitScript(src => {
    navigator.mediaDevices.getUserMedia = async () => {
      const img = new Image(); img.src = src; await img.decode();
      const k = 1280 / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const x = c.getContext('2d'); setInterval(() => x.drawImage(img, 0, 0, c.width, c.height), 40);
      return c.captureStream(25);
    };
    localStorage.setItem('camera-effects.settings.v1', JSON.stringify({ mirror: false }));
  }, photo);
  page.on('dialog', d => d.accept());
  page.on('pageerror', e => console.error('page error:', e.message));
  await page.goto(`http://localhost:${PORT}/camera-effects/`);
  await page.click('#btnStart');
  await page.click(`#fx button[data-fx="${effect}"]`);
  await page.click('#btnDetect');
  await page.click('[data-scope="background"]');
  const face = process.env.ACC || process.env.WARP;
  if (face) {
    await page.click('#tabs [data-tab="face"]');
    if (process.env.ACC) await page.click(`#acc [data-id="${process.env.ACC}"]`);
    if (process.env.WARP) await page.click(`#warp [data-id="${process.env.WARP}"]`);
  }
  const t0 = Date.now();
  // Models downloaded and started (Tools.diag.text() is async)
  while (!(face ? /models: detect,segment,face/ : /models: detect,segment/).test(await page.evaluate(() => Tools.diag.text()))) {
    if (Date.now() - t0 > 120000) { console.error(await page.evaluate(() => Tools.diag.text())); throw new Error('models not ready after 120 s'); }
    await page.waitForTimeout(500);
  }
  console.log(`models ready after ${Math.round((Date.now() - t0) / 1000)} s`);
  await page.waitForTimeout(2000);
  console.log('badge:', await page.textContent('#badge'));
  const diag = await page.evaluate(() => Tools.diag.text());
  console.log(diag.split('\n').filter(l => /^(persons|mask|faces|inferMs|fps):/.test(l)).join('\n'));
  // Boxes and the picture with the effect
  const png = await page.evaluate(() => {
    const out = document.getElementById('out'), boxes = document.getElementById('boxes'), c = document.createElement('canvas');
    c.width = out.width; c.height = out.height;
    const x = c.getContext('2d'); x.drawImage(out, 0, 0); x.drawImage(boxes, 0, 0);
    return c.toDataURL('image/png');
  });
  const outFile = file.replace(/\.[^.]+$/, '') + '-camera-effects.png';
  writeFileSync(outFile, Buffer.from(png.split(',')[1], 'base64'));
  console.log('saved', outFile);
  console.log(diag.split('\n').filter(l => /worker: /.test(l)).join('\n'));
} finally {
  await browser.close();
  server.kill();
}
