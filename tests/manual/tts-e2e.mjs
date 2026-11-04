#!/usr/bin/env node
// Manual end-to-end check of "Text zu Sprache" with the REAL voice models.
// Not part of `npm test`: it downloads the models (Supertonic ~400 MB, Piper ~60–115 MB per voice,
// Kokoro ~90 MB) from Hugging Face.
//
//   node tests/manual/tts-e2e.mjs [out-dir] [engine:voice …]
//   TTS_PROFILE=/tmp/profil node tests/manual/tts-e2e.mjs …   reuse a browser profile (models stay downloaded)
//   TTS_TEXT="…" TTS_LANG=en …                                 other text / language (default: the German sample text)
//     engine:voice e.g. supertonic:F1  piper:de/de_DE/thorsten/high/de_DE-thorsten-high  kokoro:af_heart
//     (default: one voice of each engine)
//
// Starts the local test server, reads the text with each voice, prints load and computing times and
// saves each result as WAV in out-dir (to listen to, or to check with tests/manual/whisper-e2e.mjs).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [outDir = mkdtempSync(join(tmpdir(), 'tts-out-')), ...picks] = process.argv.slice(2);
const runs = (picks.length ? picks : ['supertonic:F1', 'piper:de/de_DE/thorsten/high/de_DE-thorsten-high', 'kokoro:af_heart'])
  .map(p => { const i = p.indexOf(':'); return { engine: p.slice(0, i), voice: p.slice(i + 1) }; });
mkdirSync(outDir, { recursive: true });

const PORT = 4185;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
// A real profile on disk: private windows keep Cache Storage in memory with a small limit
const profile = process.env.TTS_PROFILE || mkdtempSync(join(tmpdir(), 'tts-'));
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.PW_CHROMIUM_PATH || undefined, locale: 'de-DE', acceptDownloads: true, proxy,
  args: ['--autoplay-policy=no-user-gesture-required'],
});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  page.on('dialog', d => d.accept());
  await page.goto(`http://localhost:${PORT}/text-to-speech/`);
  // A reused profile may start with an older cached version: wait for the update, then reload
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  await page.reload();
  if (process.env.TTS_LANG) await page.selectOption('#lang', process.env.TTS_LANG);
  if (process.env.TTS_TEXT) await page.fill('#text', process.env.TTS_TEXT);
  else await page.click('#btnSample');
  for (const { engine, voice } of runs) {
    await page.check(`input[name=engine][value=${engine}]`);
    if (voice) await page.selectOption('#voice', voice);
    const t0 = Date.now();
    await page.evaluate(() => { document.getElementById('status').textContent = ''; });
    await page.click('#btnSpeak');
    await page.waitForFunction(() => /Fertig|Fehler|nicht/.test(document.getElementById('status').textContent), null, { timeout: 30 * 60 * 1000, polling: 500 });
    const statusText = await page.textContent('#status');
    console.log(`\n${engine}:${voice} – ${statusText} (${Math.round((Date.now() - t0) / 1000)} s gesamt)`);
    console.log('  ' + await page.textContent('#meta'));
    if (!/Fertig/.test(statusText)) continue;
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#clips li:first-child [data-act=save]')]);
    const file = join(outDir, `${engine}-${(voice || 'default').split('/').pop().replace(/[^\w#-]/g, '_')}.wav`);
    await dl.saveAs(file);
    console.log('  → ' + file);
  }
} finally {
  await browser.close();
  server.kill();
}
