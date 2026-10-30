#!/usr/bin/env node
// Manual end-to-end check of "KI-Chat" with a REAL Gemma model.
// Not part of `npm test`: it downloads the model (~300 MB to 2.3 GB) from Hugging Face.
//
//   node tests/manual/chat-e2e.mjs [model] [question] [--stop-after=N]
//   CHAT_PROFILE=/tmp/profil node tests/manual/chat-e2e.mjs …   reuse a browser profile (model stays downloaded)
//     model: gemma3-270m (default) | gemma3-1b | gemma4-e2b
//
// Starts the local test server, opens the page in Chromium with WebGPU switched on (without a real
// graphics card Chromium uses its software renderer SwiftShader: very slow, ~5 s per token, no
// shader-f16 – Gemma 4 is then not offered), sends the question and prints the answer.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const stopAfter = Number((args.find(a => a.startsWith('--stop-after=')) || '').split('=')[1]) || 0;
const [model = 'gemma3-270m', question = 'Was ist die Hauptstadt von Frankreich? Antworte in einem Satz.'] = args.filter(a => !a.startsWith('--'));

const PORT = 4183;
const server = spawn(process.execPath, [fileURLToPath(new URL('../server.mjs', import.meta.url)), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 800));
// A real profile on disk (like on a phone): private windows keep Cache Storage in memory with a small limit
const profile = process.env.CHAT_PROFILE || mkdtempSync(join(tmpdir(), 'ai-chat-'));
const browser = await chromium.launchPersistentContext(profile, { executablePath: process.env.PW_CHROMIUM_PATH || undefined, args: ['--enable-unsafe-webgpu'], locale: 'de-DE' });
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('pageerror:', e.message));
  await page.goto(`http://localhost:${PORT}/ai-chat/`);
  await page.waitForFunction(() => document.getElementById('model').dataset.gpu);
  console.log('WebGPU:', await page.getAttribute('#model', 'data-gpu'));
  await page.locator('#settingsBox summary').click();
  await page.selectOption('#model', model);
  console.log('Model:', await page.textContent('#modelInfo'));
  await page.fill('#input', question);
  const t0 = Date.now();
  await page.click('#btnSend');
  let last = '', stopped = false;
  for (;;) {
    await page.waitForTimeout(2000);
    const st = await page.textContent('#status');
    const ans = (await page.locator('.msg.assistant').last().locator('.body').textContent().catch(() => '')) || '';
    const line = `${st} | ${ans.slice(-80)}`;
    if (line !== last) { console.log(`${Math.round((Date.now() - t0) / 1000)}s  ${line}`); last = line; }
    if (stopAfter && !stopped && ans.split(/\s+/).length > stopAfter) { await page.click('#btnSend'); stopped = true; console.log('-> Stopp'); }
    if ((await page.getAttribute('#btnSend', 'aria-label')) !== 'Stopp' && !st) break;
    if (/\berr\b/.test(await page.getAttribute('#status', 'class'))) break;
  }
  console.log('\nAnswer:', await page.locator('.msg.assistant').last().locator('.body').textContent().catch(() => '–'));
  console.log('Meta:', await page.locator('.msg.assistant .foot span').last().textContent().catch(() => '–'));
  console.log('History entries:', await page.textContent('#histCount'));
} finally {
  await browser.close();
  server.kill();
}
