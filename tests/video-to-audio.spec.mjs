// Video zu Audio: the sound track of test videos (made with ffmpeg, see fixtures/README.md) is extracted
// unchanged or as WAV; the files are checked with independent readers (audio-files.mjs).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, openDetails } from './helpers.mjs';
import { CLIPS, FIX, clip, mp4Info, oggInfo, wavInfo, toneHz, peak } from './audio-files.mjs';

const URL_ = '/video-to-audio/';

async function choose(page, key) {
  await page.setInputFiles('#file', clip(key));
}
/** Chooses a video, extracts with the given format and returns the downloaded file */
async function extract(page, key, format) {
  await choose(page, key);
  await expect(page.locator('#btnRun')).toBeEnabled();
  await page.check(`input[name="format"][value="${format}"]`);
  await page.click('#btnRun');
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  return { name: download.suggestedFilename(), buf: readFileSync(await download.path()) };
}

test('AAC from an MP4: copied unchanged into an .m4a without the picture', async ({ page }) => {
  await page.goto(URL_);
  await choose(page, 'aac');
  await expect(page.locator('#fileInfo')).toContainText('„clip-aac.mp4“');
  await expect(page.locator('#fileInfo')).toContainText('Tonspur: AAC, Mono, 44,1 kHz · 0:02');
  const { name, buf } = await extract(page, 'aac', 'original');
  expect(name).toBe('clip-aac.m4a');
  await expect(page.locator('#status')).toHaveText('Fertig.');
  await expect(page.locator('#result')).toHaveAttribute('data-format', 'original');
  const out = mp4Info(buf);
  expect(out.tracks.map(t => t.handler)).toEqual(['soun']);
  expect(out.tracks[0].entry).toBe('mp4a');
  expect(out.tracks[0].seconds).toBeGreaterThan(CLIPS.aac.seconds - 0.1);
  expect(out.tracks[0].seconds).toBeLessThan(CLIPS.aac.seconds + 0.1);
  // Not re-encoded: the same AAC frames (count and bytes) as in the video
  const src = mp4Info(readFileSync(join(FIX, CLIPS.aac.file))).tracks.find(t => t.handler === 'soun');
  expect(out.tracks[0].samples).toBe(src.samples);
  expect(out.tracks[0].bytes).toBe(src.bytes);
  // Plays in the page
  const dur = await page.locator('#player').evaluate(a => new Promise(r => a.readyState >= 1 ? r(a.duration) : a.addEventListener('loadedmetadata', () => r(a.duration))));
  expect(dur).toBeGreaterThan(1.8);
});

test('Opus from a WebM: copied unchanged into an .ogg', async ({ page }) => {
  await page.goto(URL_);
  const { name, buf } = await extract(page, 'opus', 'original');
  expect(name).toBe('clip-opus.ogg');
  const ogg = oggInfo(buf);
  expect(ogg.codec).toBe('opus');
  expect(ogg.complete).toBe(true);
  expect(ogg.seconds).toBeGreaterThan(CLIPS.opus.seconds - 0.1);
  expect(ogg.seconds).toBeLessThan(CLIPS.opus.seconds + 0.1);
});

test('WAV: decoded, right tone, length and format', async ({ page }) => {
  await page.goto(URL_);
  const { name, buf } = await extract(page, 'opus', 'wav');
  expect(name).toBe('clip-opus.wav');
  await expect(page.locator('#result')).toHaveAttribute('data-format', 'wav');
  const wav = wavInfo(buf);
  expect(wav).toMatchObject({ format: 1, bits: 16, channels: 1, rate: CLIPS.opus.rate });
  expect(Math.abs(wav.seconds - CLIPS.opus.seconds)).toBeLessThan(0.1);
  expect(Math.abs(toneHz(wav.samples, wav.rate) - CLIPS.opus.hz)).toBeLessThan(5);
  expect(peak(wav.samples)).toBeGreaterThan(0.05);
});

test('WAV without WebCodecs: the browser decodes the file instead', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioDecoder; delete window.AudioEncoder; });
  await page.goto(URL_);
  const { buf } = await extract(page, 'opus', 'wav');
  const wav = wavInfo(buf);
  expect(wav).toMatchObject({ format: 1, bits: 16 });
  expect(Math.abs(wav.seconds - CLIPS.opus.seconds)).toBeLessThan(0.1);
  expect(Math.abs(toneHz(wav.samples, wav.rate) - CLIPS.opus.hz)).toBeLessThan(5);
  await expect(page.locator('#status')).toHaveText('Fertig.');
});

test('original without WebCodecs still works (just copying)', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioDecoder; delete window.AudioEncoder; });
  await page.goto(URL_);
  const { name, buf } = await extract(page, 'aac', 'original');
  expect(name).toBe('clip-aac.m4a');
  expect(mp4Info(buf).tracks.map(t => t.entry)).toEqual(['mp4a']);
});

test('video without sound and files that are no video are reported', async ({ page }) => {
  await page.goto(URL_);
  await choose(page, 'silent');
  await expect(page.locator('#status')).toHaveText('Dieses Video hat keine Tonspur.');
  await expect(page.locator('#status')).toHaveClass(/err/);
  await expect(page.locator('#btnRun')).toBeDisabled();
  await page.setInputFiles('#file', { name: 'notiz.mp4', mimeType: 'video/mp4', buffer: Buffer.from('kein video, nur text') });
  await expect(page.locator('#status')).toHaveText('Das ist kein lesbares Video.');
  await expect(page.locator('#btnRun')).toBeDisabled();
  // A good video afterwards works again
  await choose(page, 'aac');
  await expect(page.locator('#btnRun')).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('');
});

test('chosen format is remembered', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('input[value="original"]')).toBeChecked();
  await page.check('input[value="wav"]');
  await page.reload();
  await expect(page.locator('input[value="wav"]')).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('video-to-audio.settings.v1')))).toEqual({ format: 'wav' });
});

test('share target: a video shared to the installed app is picked up', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
  expect(manifest.share_target.params.files[0].accept).toContain('video/*');
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const b64 = clip('aac').buffer.toString('base64');
  const ok = await page.evaluate(async b64 => {
    const fd = new FormData();
    fd.append('file', new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'urlaub.mp4', { type: 'video/mp4' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, b64);
  expect(ok).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(page).toHaveURL(/\/video-to-audio\/$/);
  await expect(page.locator('#fileInfo')).toContainText('urlaub.mp4');
  await expect(page.locator('#btnRun')).toBeEnabled();
});

test('works offline', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  const { name } = await extract(page, 'opus', 'wav');
  expect(name).toBe('clip-opus.wav');
  await context.setOffline(false);
});

test('diagnostics: steps and codec, never the file name', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto(URL_);
  await extract(page, 'aac', 'original');
  await openDetails(page, 'Anleitung & Hinweise');
  await page.click('[data-diag="copy"]');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('audio track');
  expect(text).toContain('extracted');
  expect(text).toContain('"codec":"aac"');
  expect(text).not.toContain('clip-aac');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('texts, info and result in English', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#btnRun')).toHaveText('Extract audio');
    await choose(page, 'aac');
    await expect(page.locator('#fileInfo')).toContainText('Sound track: AAC, mono, 44.1 kHz · 0:02');
    await page.click('#btnRun');
    await expect(page.locator('#status')).toHaveText('Done.');
    await expect(page.locator('#btnSave')).toHaveText('Save audio');
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page.locator('#fileInfo')).toContainText('Tonspur: AAC, Mono, 44,1 kHz');
    await expect(page.locator('#btnSave')).toHaveText('Audio speichern');
  });
});
