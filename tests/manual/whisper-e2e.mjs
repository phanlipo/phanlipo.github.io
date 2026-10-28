#!/usr/bin/env node
// Manual end-to-end check of "Sprache zu Text" with a REAL recording and the real Whisper model.
// Not part of `npm test`: it downloads the model (~80–250 MB) from Hugging Face and needs a voice file
// that must not be committed (privacy).
//
//   node tests/manual/whisper-e2e.mjs <audio-file> [model]     model default: onnx-community/whisper-base
//
// Starts the local test server, opens the page in Chromium, transcribes and prints text and timing.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const [file, model = 'onnx-community/whisper-base'] = process.argv.slice(2);
if (!file) { console.error('Usage: node tests/manual/whisper-e2e.mjs <audio-file> [model]'); process.exit(2); }

const PORT = 4179;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${PORT}/voice-transcriber/`);
  await page.selectOption('#model', model);
  await page.setInputFiles('#file', file);
  await page.waitForFunction(() => document.getElementById('fileInfo').dataset.decoder);
  console.log('Audio:', await page.textContent('#fileInfo'));
  const t0 = Date.now();
  await page.click('#btnRun');
  let last = '';
  for (;;) {
    await page.waitForTimeout(2000);
    const s = await page.textContent('#status'), cls = await page.getAttribute('#status', 'class');
    if (s !== last) { console.log(`${Math.round((Date.now() - t0) / 1000)}s  ${s}`); last = s; }
    if (/\b(ok|warn|err)\b/.test(cls)) break;
  }
  console.log('\n' + (await page.textContent('#resultMeta')));
  console.log('\n' + (await page.inputValue('#text')));
} finally {
  await browser.close();
  server.kill();
}
