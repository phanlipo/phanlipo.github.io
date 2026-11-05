// Audio Studio: a test WAV with known parts (made here, sample by sample) is opened, edited and saved;
// the saved files are checked with independent readers (audio-files.mjs), expected values computed here.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, openDetails, clipboardText, switchLang, openMenu, mockAndroidShare } from './helpers.mjs';
import { FIX, clip, oggInfo, mp4Info, wavInfo, mp3Info, toneHz, peak } from './audio-files.mjs';

const URL_ = '/audio-studio/';
const RATE = 48000;
// 3 s stereo: 0–1 s 440 Hz at 0.5, 1–2 s 880 Hz at 0.5, 2–3 s 440 Hz at 0.25 (right channel: half as loud)
const PARTS = [{ hz: 440, amp: 0.5 }, { hz: 880, amp: 0.5 }, { hz: 440, amp: 0.25 }];
function testWav({ channels = 2, rate = RATE } = {}) {
  const n = rate * PARTS.length, buf = Buffer.alloc(44 + n * channels * 2);
  buf.write('RIFF', 0, 'latin1'); buf.writeUInt32LE(36 + n * channels * 2, 4); buf.write('WAVE', 8, 'latin1');
  buf.write('fmt ', 12, 'latin1'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * channels * 2, 28); buf.writeUInt16LE(channels * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'latin1'); buf.writeUInt32LE(n * channels * 2, 40);
  for (let i = 0; i < n; i++) {
    const p = PARTS[Math.floor(i / rate)];
    const v = p.amp * Math.sin(2 * Math.PI * p.hz * i / rate);
    for (let c = 0; c < channels; c++) buf.writeInt16LE(Math.round((c ? v / 2 : v) * 32767), 44 + (i * channels + c) * 2);
  }
  return { name: 'aufnahme.wav', mimeType: 'audio/wav', buffer: buf };
}
const peakOf = (s, a = 0, b = s.length) => peak(s.subarray(a, b));

async function open(page, file = testWav()) {
  await page.setInputFiles('#file', file);
  await expect(page.locator('#editor')).toBeVisible();
}
async function select(page, start, end) {
  await page.fill('#selStart', start); await page.locator('#selStart').press('Enter');
  await page.fill('#selEnd', end); await page.locator('#selEnd').press('Enter');
}
/** Creates the file in the given format and returns the download */
async function exportFile(page, format = 'wav') {
  await page.check(`input[name="format"][value="${format}"]`);
  await page.click('#btnExport');
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  return { name: download.suggestedFilename(), buf: readFileSync(await download.path()) };
}
const canEncode = (page, codec) => page.evaluate(async c => {
  if (typeof AudioEncoder === 'undefined') return false;
  const r = await AudioEncoder.isConfigSupported({ codec: c, sampleRate: 48000, numberOfChannels: 2, bitrate: 128000 }).catch(() => null);
  return !!(r && r.supported);
}, codec);

test('opens a WAV: details, whole file selected, unchanged WAV export', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('#editor')).toBeHidden();
  await open(page);
  await expect(page.locator('#fileInfo')).toHaveText('„aufnahme.wav“ · 0,5 MB · Stereo, 48,0 kHz · 0:03');
  await expect(page.locator('#selInfo')).toHaveText('Alles ausgewählt (3,0 s)');
  await expect(page.locator('#selStart')).toHaveValue('0:00,00');
  await expect(page.locator('#selEnd')).toHaveValue('0:03,00');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  const { name, buf } = await exportFile(page);
  expect(name).toBe('aufnahme-edit.wav');
  await expect(page.locator('#status')).toHaveText('Fertig.');
  const w = wavInfo(buf);
  expect(w).toMatchObject({ format: 1, bits: 16, channels: 2, rate: RATE, frames: 3 * RATE });
  // Same samples as the input (16 bit → float → 16 bit)
  const src = wavInfo(testWav().buffer);
  for (const i of [0, 1000, 50000, 100000, 143999]) expect(Math.abs(w.samples[i] - src.samples[i])).toBeLessThan(1 / 32000);
});

test('keep selection: trims to the middle part (880 Hz, 1 s)', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await select(page, '1', '0:02');
  await expect(page.locator('#selInfo')).toHaveText('Auswahl: 1,0 s von 3,0 s');
  await page.click('#btnKeep');
  await expect(page.locator('#toast')).toHaveText('Gekürzt');
  await expect(page.locator('#selInfo')).toHaveText('Alles ausgewählt (1,0 s)');
  await expect(page.locator('#fileInfo')).toContainText('0:01');
  const w = wavInfo((await exportFile(page)).buf);
  expect(w.frames).toBe(RATE);
  expect(Math.abs(toneHz(w.samples, RATE) - 880)).toBeLessThan(3);
  expect(Math.abs(peakOf(w.samples) - 0.5)).toBeLessThan(0.01);
});

test('cut selection out, then undo restores it', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await select(page, '1,0', '2.0');
  await page.click('#btnCut');
  await expect(page.locator('#selInfo')).toHaveText('Alles ausgewählt (2,0 s)');
  let w = wavInfo((await exportFile(page)).buf);
  expect(w.frames).toBe(2 * RATE);
  // 440 Hz throughout: first second at 0.5, second one at 0.25
  expect(Math.abs(toneHz(w.samples.subarray(0, RATE), RATE) - 440)).toBeLessThan(3);
  expect(Math.abs(toneHz(w.samples.subarray(RATE), RATE) - 440)).toBeLessThan(3);
  expect(Math.abs(peakOf(w.samples, 0, RATE) - 0.5)).toBeLessThan(0.01);
  expect(Math.abs(peakOf(w.samples, RATE) - 0.25)).toBeLessThan(0.01);
  // Editing hides the old result
  await select(page, '0', '0,5');
  await page.click('#btnKeep');
  await expect(page.locator('#result')).toBeHidden();
  await page.click('#btnUndo');
  await page.click('#btnUndo');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  w = wavInfo((await exportFile(page)).buf);
  expect(w.frames).toBe(3 * RATE);
});

test('volume: −6 dB on a selection, normalize, clipping warning', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await select(page, '0', '1');
  await page.locator('#gain').fill('-6');
  await expect(page.locator('#gainVal')).toHaveText('−6 dB');
  await page.click('#btnGain');
  await expect(page.locator('#toast')).toHaveText('Lautstärke -6 dB');
  await expect(page.locator('#gainVal')).toHaveText('0 dB');
  let w = wavInfo((await exportFile(page)).buf);
  const f = 10 ** (-6 / 20);
  expect(Math.abs(peakOf(w.samples, 0, RATE) - 0.5 * f)).toBeLessThan(0.005);
  expect(Math.abs(peakOf(w.samples, RATE, 2 * RATE) - 0.5)).toBeLessThan(0.005);   // outside: unchanged
  // Normalize the whole file: loudest part to −1 dBFS
  await page.click('#btnAll');
  await page.click('#btnNorm');
  await expect(page.locator('#toast')).toHaveText(`Normalisiert (+${(20 * Math.log10(10 ** (-1 / 20) / 0.5)).toFixed(1).replace('.', ',')} dB)`);
  w = wavInfo((await exportFile(page)).buf);
  expect(Math.abs(peakOf(w.samples) - 10 ** (-1 / 20))).toBeLessThan(0.005);
  // +20 dB clips: hint, and the file is limited to full scale
  await page.locator('#gain').fill('20');
  await page.click('#btnGain');
  await expect(page.locator('#toast')).toContainText('übersteuert');
  w = wavInfo((await exportFile(page)).buf);
  expect(peakOf(w.samples)).toBeLessThanOrEqual(1);
  // Slider at 0: nothing happens
  await page.click('#btnGain');
  await expect(page.locator('#toast')).toHaveText('Erst den Regler verschieben.');
});

test('fade in and out across the selection', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await select(page, '0', '1');
  await page.click('#btnFadeIn');
  await select(page, '2', '3');
  await page.click('#btnFadeOut');
  const w = wavInfo((await exportFile(page)).buf);
  const ms = n => Math.round(n * RATE / 1000);
  expect(peakOf(w.samples, 0, ms(10))).toBeLessThan(0.5 * 0.011);               // starts silent
  expect(Math.abs(peakOf(w.samples, ms(490), ms(510)) - 0.5 * 0.51)).toBeLessThan(0.01);   // half way
  expect(Math.abs(peakOf(w.samples, RATE + ms(100), 2 * RATE) - 0.5)).toBeLessThan(0.005); // middle untouched
  expect(peakOf(w.samples, 3 * RATE - ms(10))).toBeLessThan(0.25 * 0.011);      // ends silent
});

test('mono mixes both channels; whole file selected → keep and cut refuse', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await page.click('#btnKeep');
  await expect(page.locator('#toast')).toHaveText('Dann bliebe nichts übrig – erst einen Bereich auswählen.');
  await page.click('#btnMono');
  await expect(page.locator('#fileInfo')).toContainText('Mono, 48,0 kHz');
  await expect(page.locator('#btnMono')).toBeDisabled();
  const w = wavInfo((await exportFile(page)).buf);
  expect(w.channels).toBe(1);
  // (left + right) / 2 = 0.75 × left
  expect(Math.abs(peakOf(w.samples, 0, RATE) - 0.375)).toBeLessThan(0.005);
});

test('selecting in the waveform: drag, then move an edge', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  const box = await page.locator('#wave').boundingBox();
  const y = box.y + box.height / 2, at = f => box.x + box.width * f;
  await page.mouse.move(at(1 / 3), y); await page.mouse.down(); await page.mouse.move(at(0.5), y, { steps: 5 }); await page.mouse.move(at(2 / 3), y, { steps: 5 }); await page.mouse.up();
  const read = async () => [await page.locator('#selStart').inputValue(), await page.locator('#selEnd').inputValue()];
  expect(await read()).toEqual(['0:01,00', '0:02,00']);
  // Drag the end edge to the right end
  await page.mouse.move(at(2 / 3), y); await page.mouse.down(); await page.mouse.move(at(0.9), y, { steps: 5 }); await page.mouse.move(at(1) - 1, y, { steps: 5 }); await page.mouse.up();
  const [s, e] = await read();
  expect(s).toBe('0:01,00');
  expect(['0:02,99', '0:03,00']).toContain(e);
  // A tap moves the nearer edge (the start)
  await page.mouse.click(at(0.1), y);
  expect((await read())[0]).toBe('0:00,30');
  // Start typed behind the end: the end goes to the end of the file; end before the start: start goes to 0
  await select(page, '2,5', '2,8');
  expect(await read()).toEqual(['0:02,50', '0:02,80']);
  await page.fill('#selEnd', '1'); await page.locator('#selEnd').press('Enter');
  expect(await read()).toEqual(['0:00,00', '0:01,00']);
  await page.fill('#selStart', '0:00,3'); await page.locator('#selStart').press('Enter');
  // Invalid time
  await page.fill('#selStart', 'abc'); await page.locator('#selStart').press('Enter');
  await expect(page.locator('#toast')).toHaveText('Ungültige Zeit – z. B. 1:23,5 oder 83,5');
  await expect(page.locator('#selStart')).toHaveValue('0:00,30');
});

test('playback of the selection starts and stops', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await select(page, '0', '0,3');
  await page.click('#btnPlay');
  await expect(page.locator('#btnPlay')).toHaveText('■ Stopp');
  await expect(page.locator('#btnPlay')).toHaveText('▶ Auswahl abspielen', { timeout: 5000 });   // ends by itself
  await page.click('#btnPlay');
  await page.click('#btnPlay');
  await expect(page.locator('#btnPlay')).toHaveText('▶ Auswahl abspielen');
});

test('Opus input (voice message) to Opus and AAC output', async ({ page }) => {
  await page.goto(URL_);
  await open(page, { name: 'sprachnachricht.opus', mimeType: 'audio/ogg', buffer: readFileSync(join(FIX, 'tone.opus')) });
  await expect(page.locator('#fileInfo')).toContainText('Mono, 48,0 kHz · 0:02');
  test.skip(!(await canEncode(page, 'opus')), 'browser cannot encode Opus');
  await page.check('input[value="opus"]');
  await page.selectOption('#bitrate', '64');
  const { name, buf } = await exportFile(page, 'opus');
  expect(name).toBe('sprachnachricht-edit.ogg');
  const ogg = oggInfo(buf);
  expect(ogg).toMatchObject({ codec: 'opus', complete: true });
  expect(Math.abs(ogg.seconds - 2)).toBeLessThan(0.05);
  await expect(page.locator('#result')).toHaveAttribute('data-format', 'opus');
  if (await canEncode(page, 'mp4a.40.2')) {
    const aac = await exportFile(page, 'aac');
    expect(aac.name).toBe('sprachnachricht-edit.m4a');
    expect(mp4Info(aac.buf).tracks.map(t => t.entry)).toEqual(['mp4a']);
  } else {
    await expect(page.locator('input[value="aac"]')).toBeDisabled();
    await expect(page.locator('#fmtNote')).toHaveText('In diesem Browser nicht verfügbar: M4A (AAC).');
  }
});

test('share on Android: .m4a goes out as audio/x-m4a (audio/mp4 is refused), .wav and .mp3 unchanged', async ({ page }) => {
  await mockAndroidShare(page);
  await page.goto(URL_);
  await open(page);
  const { buf } = await exportFile(page, 'wav');
  await page.click('#btnShare');
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
  expect((await page.evaluate(() => window.__shared))[0]).toEqual([{ name: 'aufnahme-edit.wav', type: 'audio/wav', size: buf.length }]);
  const mp3 = await exportFile(page, 'mp3');
  await page.click('#btnShare');
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(2);
  expect((await page.evaluate(() => window.__shared))[1]).toEqual([{ name: 'aufnahme-edit.mp3', type: 'audio/mpeg', size: mp3.buf.length }]);
  await expect(page.getByText('Teilen nicht möglich')).toHaveCount(0);
  test.skip(!(await canEncode(page, 'mp4a.40.2')), 'browser cannot encode AAC');
  const aac = await exportFile(page, 'aac');
  await page.click('#btnShare');
  await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(3);
  expect((await page.evaluate(() => window.__shared))[2]).toEqual([{ name: 'aufnahme-edit.m4a', type: 'audio/x-m4a', size: aac.buf.length }]);
  await expect(page.getByText('Teilen nicht möglich')).toHaveCount(0);
});

/** Decodes an MP3 with the browser's own decoder (not LAME, which wrote it): channels as Float32Arrays */
const browserDecode = async (page, buf) => {
  const r = await page.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const a = await new OfflineAudioContext(1, 1, 48000).decodeAudioData(bytes.buffer);
    return { rate: a.sampleRate, ch: [...Array(a.numberOfChannels)].map((_, i) => [...a.getChannelData(i)]) };
  }, buf.toString('base64'));
  return { rate: r.rate, ch: r.ch.map(c => Float32Array.from(c)) };
};
// LAME delays the sound by ~1100 samples; the windows stay well inside each 1 s part
const part = (s, rate, i) => s.subarray(Math.round((i + 0.2) * rate), Math.round((i + 0.8) * rate));

test('MP3: stereo at the chosen bitrate, parts with the right tone and level', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await expect(page.locator('input[value="mp3"]')).toBeEnabled();
  await page.check('input[value="mp3"]');
  await page.selectOption('#bitrate', '192');
  const { name, buf } = await exportFile(page, 'mp3');
  expect(name).toBe('aufnahme-edit.mp3');
  await expect(page.locator('#result')).toHaveAttribute('data-format', 'mp3');
  await expect(page.locator('#status')).toHaveText('Fertig.');
  const mp3 = mp3Info(buf);
  expect(mp3).toMatchObject({ rate: RATE, channels: 2, kbps: [192], complete: true });
  expect(mp3.seconds).toBeGreaterThan(3 - 0.05);
  expect(mp3.seconds).toBeLessThan(3 + 0.1);
  const dec = await browserDecode(page, buf);
  expect(dec.ch.length).toBe(2);
  PARTS.forEach((p, i) => {
    const l = part(dec.ch[0], dec.rate, i), r = part(dec.ch[1], dec.rate, i);
    expect(Math.abs(toneHz(l, dec.rate) - p.hz)).toBeLessThan(5);
    expect(Math.abs(peak(l) - p.amp)).toBeLessThan(0.05);
    expect(Math.abs(peak(r) - p.amp / 2)).toBeLessThan(0.05);
  });
  // 64 kbit/s: smaller, still complete
  await page.selectOption('#bitrate', '64');
  const small = await exportFile(page, 'mp3');
  expect(mp3Info(small.buf)).toMatchObject({ kbps: [64], complete: true });
  expect(small.buf.length).toBeLessThan(buf.length / 2);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('audio-studio.settings.v1')))).toMatchObject({ format: 'mp3', kbps: 64 });
});

test('MP3 from 44.1 kHz mono keeps the rate (MP3 supports it)', async ({ page }) => {
  await page.goto(URL_);
  await open(page, testWav({ rate: 44100, channels: 1 }));
  const mp3 = mp3Info((await exportFile(page, 'mp3')).buf);
  expect(mp3).toMatchObject({ rate: 44100, channels: 1, kbps: [128], complete: true });
  expect(Math.abs(mp3.seconds - 3)).toBeLessThan(0.1);
});

test('MP3 works offline once the encoder was loaded', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // page now controlled → the encoder goes through the offline cache
  await open(page);
  await exportFile(page, 'mp3');
  await context.setOffline(true);
  await page.reload();
  await open(page);
  expect(mp3Info((await exportFile(page, 'mp3')).buf)).toMatchObject({ rate: RATE, channels: 2, complete: true });
  await context.setOffline(false);
});

test.describe('MP3 offline before its first use', () => {
  test.use({ allowedProblems: /mediabunny-mp3|Failed to load resource|ERR_FAILED|ERR_INTERNET_DISCONNECTED/ });
  test('clear message, WAV still works', async ({ page, context }) => {
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await context.setOffline(true);
    await page.reload();
    await open(page);
    await page.check('input[value="mp3"]');
    await page.click('#btnExport');
    await expect(page.locator('#status')).toHaveText('Der MP3-Encoder ließ sich nicht laden. Bitte einmal mit Internet öffnen – danach geht MP3 auch offline.');
    await expect(page.locator('#result')).toBeHidden();
    expect(wavInfo((await exportFile(page, 'wav')).buf).frames).toBe(3 * RATE);
    await context.setOffline(false);
  });
});

test('44.1 kHz to Opus is resampled to 48 kHz, length kept', async ({ page }) => {
  await page.goto(URL_);
  await open(page, testWav({ rate: 44100, channels: 1 }));
  test.skip(!(await canEncode(page, 'opus')), 'browser cannot encode Opus');
  const ogg = oggInfo((await exportFile(page, 'opus')).buf);
  expect(Math.abs(ogg.seconds - 3)).toBeLessThan(0.05);
});

test('without WebCodecs: Opus/AAC greyed out, WAV and MP3 still work', async ({ page }) => {
  await page.addInitScript(() => { delete window.AudioDecoder; delete window.AudioEncoder; });
  await page.goto(URL_);
  await open(page);
  await expect(page.locator('input[value="opus"]')).toBeDisabled();
  await expect(page.locator('input[value="aac"]')).toBeDisabled();
  await expect(page.locator('#fmtNote')).toHaveText('In diesem Browser nicht verfügbar: M4A (AAC), Opus.');
  const w = wavInfo((await exportFile(page)).buf);
  expect(w.frames).toBe(3 * RATE);
  // MP3 has its own encoder and stays available
  await expect(page.locator('input[value="mp3"]')).toBeEnabled();
  expect(mp3Info((await exportFile(page, 'mp3')).buf)).toMatchObject({ rate: RATE, channels: 2, complete: true });
});

test('the sound track of a video opens; files without sound or no audio are reported', async ({ page }) => {
  await page.goto(URL_);
  await open(page, clip('aac'));
  await expect(page.locator('#fileInfo')).toContainText('Mono, 44,1 kHz · 0:02');
  const w = wavInfo((await exportFile(page)).buf);
  expect(Math.abs(toneHz(w.samples, w.rate) - 440)).toBeLessThan(5);
  await page.setInputFiles('#file', clip('silent'));
  await expect(page.locator('#loadStatus')).toHaveText('Diese Datei enthält keinen Ton.');
  await expect(page.locator('#editor')).toBeHidden();
  await page.setInputFiles('#file', { name: 'notiz.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('kein audio, nur text') });
  await expect(page.locator('#loadStatus')).toHaveText('Diese Datei lässt sich nicht als Audio lesen.');
  await expect(page.locator('#loadStatus')).toHaveClass(/err/);
  await open(page);
  await expect(page.locator('#loadStatus')).toHaveText('');
});

test('format and bitrate are remembered, never the audio', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await page.check('input[value="opus"]');
  await expect(page.locator('#bitrateBox')).toBeVisible();
  await page.selectOption('#bitrate', '96');
  await page.check('input[value="wav"]');
  await expect(page.locator('#bitrateBox')).toBeHidden();
  await page.reload();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['audio-studio.settings.v1']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('audio-studio.settings.v1')))).toEqual({ format: 'wav', kbps: 96 });
  await expect(page.locator('#bitrate')).toHaveValue('96');
});

test('share target: an audio file shared to the installed app is opened', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
  expect(manifest.share_target.params.files[0].accept).toContain('audio/*');
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const b64 = testWav().buffer.toString('base64');
  const ok = await page.evaluate(async b64 => {
    const fd = new FormData();
    fd.append('file', new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'geteilt.wav', { type: 'audio/wav' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, b64);
  expect(ok).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(page).toHaveURL(/\/audio-studio\/$/);
  await expect(page.locator('#fileInfo')).toContainText('geteilt.wav');
  await expect(page.locator('#editor')).toBeVisible();
});

test('works offline: open, edit and save as Opus', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await open(page);
  await select(page, '0', '1');
  await page.click('#btnKeep');
  const format = (await canEncode(page, 'opus')) ? 'opus' : 'wav';
  const { name } = await exportFile(page, format);
  expect(name).toBe('aufnahme-edit' + (format === 'opus' ? '.ogg' : '.wav'));
  await context.setOffline(false);
});

test('diagnostics: steps, never the file name', async ({ page }) => {
  await page.goto(URL_);
  await open(page);
  await select(page, '0', '1');
  await page.click('#btnKeep');
  await exportFile(page);
  await openMenu(page);
  await openDetails(page, 'Anleitung & Hinweise');
  await page.click('[data-diag="copy"]');
  await expect(page.locator('#toast')).toHaveText(/Diagnose kopiert|Diagnostics copied/);
  const text = await clipboardText(page);
  expect(text).toContain('decoded');
  expect(text).toContain('"op":"keep"');
  expect(text).toContain('exported');
  expect(text).not.toContain('aufnahme');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('texts, numbers and messages in English', async ({ page }) => {
    await page.goto(URL_);
    await open(page);
    await expect(page.locator('#fileInfo')).toHaveText('“aufnahme.wav” · 0.5 MB · stereo, 48.0 kHz · 0:03');
    await expect(page.locator('#selInfo')).toHaveText('Everything selected (3.0 s)');
    await expect(page.locator('#btnKeep')).toHaveText('Keep selection');
    await select(page, '0:00.5', '1.5');
    await expect(page.locator('#selInfo')).toHaveText('Selection: 1.0 s of 3.0 s');
    await page.click('#btnKeep');
    await expect(page.locator('#toast')).toHaveText('Trimmed');
    await page.click('#btnExport');
    await expect(page.locator('#status')).toHaveText('Done.');
    await switchLang(page, 'de');
    await expect(page.locator('#selInfo')).toHaveText('Alles ausgewählt (1,0 s)');
    await expect(page.locator('#btnPlay')).toHaveText('▶ Auswahl abspielen');
  });
});
