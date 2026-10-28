// Sprache zu Text: audio decoding (browser + Opus fallback), error handling, share target, history.
// The Whisper model itself is not downloaded here (large, external) – see tests/manual/whisper-e2e.mjs.
import { test, expect } from './helpers.mjs';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const TONE = fileURLToPath(new URL('fixtures/tone.opus', import.meta.url));
const URL_ = '/voice-transcriber/';

test('decodes an Ogg Opus voice message with the browser decoder', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('#btnRun')).toBeDisabled();
  await page.setInputFiles('#file', TONE);
  const info = page.locator('#fileInfo');
  await expect(info).toHaveAttribute('data-decoder', 'browser');
  expect(Number(await info.getAttribute('data-duration'))).toBeCloseTo(2, 0);
  await expect(info).toContainText('tone.opus');
  await expect(page.locator('#player')).toBeVisible();
  await expect(page.locator('#btnRun')).toBeEnabled();
});

test('falls back to the Opus decoder when the browser cannot decode', async ({ page }) => {
  await page.addInitScript(() => {
    OfflineAudioContext.prototype.decodeAudioData = () => Promise.reject(new DOMException('unsupported', 'EncodingError'));
  });
  await page.goto(URL_);
  await page.setInputFiles('#file', TONE);
  const info = page.locator('#fileInfo');
  await expect(info).toHaveAttribute('data-decoder', 'opus');
  expect(Number(await info.getAttribute('data-duration'))).toBeCloseTo(2, 0);
  await expect(info).toContainText('Ersatz-Decoder');
});

test('rejects files that are not audio', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#file', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.locator('#status')).toHaveClass(/err/);
  await expect(page.locator('#status')).toContainText('Audioformat');
  await expect(page.locator('#btnRun')).toBeDisabled();
});

test.describe('model not reachable', () => {
  test.use({ allowedProblems: /huggingface\.co|hf\.co|Failed to load resource|ERR_FAILED|Failed to fetch|Unable to fetch model/ });

  test('shows a clear error and allows a retry', async ({ page }) => {
    await page.context().route(/huggingface\.co|hf\.co/, r => r.abort());
    await page.goto(URL_);
    await page.setInputFiles('#file', TONE);
    await page.click('#btnRun');
    await expect(page.locator('#status')).toContainText('Das Modell konnte nicht geladen werden', { timeout: 30000 });
    await expect(page.locator('#status')).toHaveClass(/err/);
    await expect(page.locator('#btnRun')).toBeEnabled();
    await expect(page.locator('#btnRun')).toHaveText('Transkribieren');
  });
});

test('share target: a file shared to the installed app is picked up', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
  expect(manifest.share_target.params.files[0].accept).toContain('.opus');

  // The service worker must control the page for the POST to be intercepted
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  // Simulate the share sheet: Android sends a multipart POST to ./share-target, which the service worker
  // intercepts (a <form> in the page would be blocked by the page's CSP – the OS share is not).
  const b64 = readFileSync(TONE).toString('base64');
  const shared = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const fd = new FormData();
    fd.append('file', new File([bytes], 'tone.opus', { type: 'audio/ogg' }));
    const res = await fetch('share-target', { method: 'POST', body: fd });
    const parked = await (await caches.open('share:voice-transcriber')).match('shared-file');
    return { ok: res.ok, parked: parked ? (await parked.arrayBuffer()).byteLength : 0 };
  }, b64);
  expect(shared).toEqual({ ok: true, parked: readFileSync(TONE).length });
  await page.goto(`${URL_}?shared=1`);
  await expect(page).toHaveURL(/\/voice-transcriber\/$/);   // parameter removed again
  await expect(page.locator('#fileInfo')).toContainText('tone.opus');
  await expect(page.locator('#btnRun')).toBeEnabled();
  // Picked up once: the parked file is gone
  expect(await page.evaluate(async () => !!(await (await caches.open('share:voice-transcriber')).match('shared-file')))).toBe(false);
});

test('history shows, opens and deletes transcripts', async ({ page }) => {
  await page.goto(URL_);
  await page.evaluate(() => localStorage.setItem('voice-transcriber.history.v1', JSON.stringify([
    { t: Date.now(), file: 'a.opus', duration: 12, model: 'onnx-community/whisper-base', text: 'Hallo Welt', chunks: [{ from: 0, to: 2, text: 'Hallo Welt' }] },
  ])));
  await page.reload();
  await expect(page.locator('#histCount')).toHaveText('1');
  await page.locator('#hist .open').click();
  await expect(page.locator('#text')).toHaveValue('Hallo Welt');
  await expect(page.locator('#chunkBox')).toBeVisible();
  await page.locator('#hist .btn.danger').click();
  await expect(page.locator('#histCount')).toHaveText('0');
});

test('model list shows the download size for the chosen device', async ({ page }) => {
  await page.goto(URL_);
  // Use the page's own WebGPU detection (adapter availability can differ between calls)
  await expect(page.locator('#device')).toHaveAttribute('data-gpu', /yes|no/);
  const gpu = (await page.locator('#device').getAttribute('data-gpu')) === 'yes';
  const base = page.locator('#model option[value="onnx-community/whisper-base"]');
  const small = page.locator('#model option[value="onnx-community/whisper-small"]');
  // Automatisch: base on the graphics card if available, small on the processor
  await expect(base).toHaveText(gpu ? 'Standard – base (ca. 200 MB)' : 'Standard – base (ca. 75 MB)');
  await expect(small).toHaveText('Genauer – small (ca. 240 MB, langsamer)');
  // Prozessor: smallest downloads, and the choice is remembered
  await page.selectOption('#device', 'cpu');
  await expect(base).toHaveText('Standard – base (ca. 75 MB)');
  await page.reload();
  await expect(page.locator('#device')).toHaveAttribute('data-gpu', gpu ? 'yes' : 'no');
  await expect(page.locator('#device')).toHaveValue('cpu');
  // Grafikkarte: only offered when WebGPU exists
  const gpuOption = page.locator('#device option[value="gpu"]');
  if (gpu) {
    await page.selectOption('#device', 'gpu');
    await expect(small).toHaveText('Genauer – small (ca. 560 MB, langsamer)');
  } else {
    expect(await gpuOption.evaluate(o => o.disabled && o.hidden)).toBe(true);
  }
});
