// Loop-Station: records from a fake microphone, loops, layers tracks, metronome/bar grid, WAV export.
import { readFileSync } from 'node:fs';
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';
import { wavInfo, toneHz, peak } from './audio-files.mjs';

const F = 440, AMP = 0.5; // fake microphone: sine with known frequency and amplitude
// window.__mic.gain switches it on/off; getUserMedia can be made to fail
async function fakeMic(page, amp = AMP) {
  await page.addInitScript(({ F, amp }) => {
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.__constraints = constraints;
      if (window.__deny) throw new DOMException('denied', 'NotAllowedError');
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
      osc.frequency.value = F; gain.gain.value = amp;
      osc.connect(gain).connect(dest); osc.start();
      window.__mic = { ctx, gain };
      window.__micCalls = (window.__micCalls || 0) + 1;
      return dest.stream;
    };
  }, { F, amp });
}
const looper = page => page.locator('#looper');
const state = (page, s, timeout = 5000) => expect(looper(page)).toHaveAttribute('data-state', s, { timeout });
const tracks = (page, n, timeout = 5000) => expect(looper(page)).toHaveAttribute('data-tracks', String(n), { timeout });
const num = async (page, attr) => Number(await looper(page).getAttribute(attr));
const micOn = (page, on) => page.evaluate(on => { window.__mic.gain.gain.value = on ? 0.5 : 0; }, on);

// Tempo mode: 240 BPM, 4/4, 1 bar = exactly 1 s
async function tempoMode(page, { countIn = true, click = true } = {}) {
  await openMenu(page);
  await page.check('#optTempo');
  await page.fill('#bpm', '240');
  await page.locator('#bpm').dispatchEvent('change');
  await page.selectOption('#beats', '4');
  await page.selectOption('#bars', '1');
  await page.setChecked('#optCount', countIn);
  await page.setChecked('#optClick', click);
  await closeMenu(page);
}
async function recordFree(page, ms = 1200) {
  await page.click('#btnRec');
  await state(page, 'recording');
  await expect(page.locator('#btnRec')).toHaveText('⏹️ Stopp');
  await page.waitForTimeout(ms);
  await page.click('#btnRec');
  await state(page, 'playing');
}
async function download(page, selector = '#btnSaveHead') {
  const [d] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  return { name: d.suggestedFilename(), wav: wavInfo(readFileSync(await d.path())) };
}

test('free loop: the first recording sets the length and loops right away', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await expect(page.locator('#status')).toHaveText('Tippe auf „Aufnehmen“ und spiel los – die erste Aufnahme legt die Länge der Schleife fest.');
  await expect(page.locator('#btnPlay')).toBeDisabled();
  await expect(page.locator('#btnSaveHead')).toBeDisabled();
  await recordFree(page, 1200);
  const ms = await num(page, 'data-loop-ms');
  expect(ms).toBeGreaterThan(1000);
  expect(ms).toBeLessThan(2000);
  await tracks(page, 1);
  // The microphone is used for music: no noise suppression or automatic gain
  expect(await page.evaluate(() => window.__constraints.audio)).toEqual({ echoCancellation: true, noiseSuppression: false, autoGainControl: false });
  const peak1 = Number(await page.locator('#tracks li.track').first().getAttribute('data-peak'));
  expect(peak1).toBeGreaterThan(AMP * 0.9);
  expect(peak1).toBeLessThan(AMP * 1.1);
  await expect(page.locator('#btnRec')).toHaveText('🔴 Neue Spur');
  await expect(page.locator('#btnPlay')).toHaveText('⏸️ Pause');
  await expect(page.locator('#status')).toHaveText('▶️ Läuft – „Neue Spur“ legt etwas darüber.');
  // Position runs round and round
  const pos = () => page.locator('#tracks').evaluate(el => Number(el.style.getPropertyValue('--pos')));
  const seen = new Set();
  for (let i = 0; i < 12; i++) { seen.add(Math.floor((await pos()) * 4)); await page.waitForTimeout(150); }
  expect(seen.size).toBeGreaterThanOrEqual(3);
  // Pause switches off the microphone, Start plays again
  await page.click('#btnPlay');
  await state(page, 'stopped');
  await expect(page.locator('#meter')).not.toHaveClass(/on/);
  await page.click('#btnPlay');
  await state(page, 'playing');
});

test('too short recordings are discarded', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await page.click('#btnRec');
  await state(page, 'recording');
  await page.click('#btnRec');
  await expect(page.locator('#status')).toHaveText('Das war zu kurz – nochmal!');
  await state(page, 'idle');
  await tracks(page, 0);
});

test('new tracks: end after one round, undo/redo, delete and bring back, at most 8', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await recordFree(page, 700);
  const loopMs = await num(page, 'data-loop-ms');
  // Overdub ends by itself after one round
  const t0 = Date.now();
  await page.click('#btnRec');
  await state(page, 'overdub');
  await expect(page.locator('#recRow')).toContainText('Spur 2 – Aufnahme …');
  await expect(page.locator('#status')).toHaveText('🔴 Spur 2 – endet nach einer Runde oder mit Stopp.');
  await tracks(page, 2);
  expect(Date.now() - t0).toBeGreaterThan(loopMs * 0.9);
  await state(page, 'playing');
  await expect(page.locator('#recRow')).toHaveCount(0);
  await expect(page.locator('#tracks li.track')).toHaveCount(2);
  // Undo / redo
  await page.click('#btnUndo');
  await tracks(page, 1);
  await expect(page.locator('#btnRedo')).toBeEnabled();
  await page.click('#btnRedo');
  await tracks(page, 2);
  // Delete track 1 → track 2 becomes number 1; undo puts it back in its place
  const ids = await page.locator('#tracks li.track').evaluateAll(els => els.map(e => e.dataset.id));
  await page.click('#tracks [aria-label="Spur 1 löschen"]');
  await tracks(page, 1);
  await expect(page.locator('#toast')).toHaveText('Spur 1 gelöscht – Rückgängig holt sie zurück.');
  expect(await page.locator('#tracks li.track').getAttribute('data-id')).toBe(ids[1]);
  await page.click('#btnUndo');
  expect(await page.locator('#tracks li.track').evaluateAll(els => els.map(e => e.dataset.id))).toEqual(ids);
  // Fill up to 8 tracks
  for (let n = 3; n <= 8; n++) {
    await page.click('#btnRec');
    await state(page, 'overdub');
    await tracks(page, n);
  }
  await expect(page.locator('#btnRec')).toBeDisabled();
  await expect(page.locator('#status')).toHaveText('▶️ Läuft – 8 Spuren voll. Lösche eine, um weiter aufzunehmen.');
  // Deleting everything asks first
  page.once('dialog', d => d.dismiss());
  await page.click('#btnClear');
  await tracks(page, 8);
  page.once('dialog', d => d.accept());
  await page.click('#btnClear');
  await tracks(page, 0);
  await state(page, 'idle');
  await expect(page.locator('#status')).toHaveText('Alle Spuren gelöscht.');
  await expect(page.locator('#btnUndo')).toBeDisabled();
});

test('in time: counts in one bar, records exactly one bar, metronome clicks; tempo locked while there are tracks', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  // Count the clicks of the metronome (oscillators started on the app's context)
  await page.evaluate(() => {
    window.__clicks = [];
    const orig = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (when) { if (this.frequency.value > 1000) window.__clicks.push([when, this.frequency.value]); return orig.apply(this, arguments); };
  });
  await tempoMode(page);
  await expect(page.locator('#status')).toHaveText('Im Takt: 1 Takt bei 240 BPM. Tippe auf „Aufnehmen“ – es wird ein Takt eingezählt.');
  await expect(page.locator('#beatDots i')).toHaveCount(4);
  await page.click('#btnRec');
  await state(page, 'countin');
  await expect(page.locator('#btnRec')).toHaveText('✖️ Abbrechen');
  await state(page, 'recording', 3000);
  await expect(page.locator('#status')).toHaveText('🔴 Aufnahme – endet von selbst nach 1 Takt.');
  // Stops by itself and loops
  await state(page, 'playing', 4000);
  await tracks(page, 1);
  const rate = await page.evaluate(() => new AudioContext().sampleRate);
  expect(await num(page, 'data-loop-samples')).toBe(rate); // 4 beats at 240 BPM = 1 s
  expect(await num(page, 'data-loop-ms')).toBe(1000);
  // Two bars of clicks: wait until they are scheduled (a fixed pause got fewer under load)
  await expect.poll(() => page.evaluate(() => window.__clicks.length), { timeout: 5000 }).toBeGreaterThanOrEqual(8);
  const clicks = await page.evaluate(() => window.__clicks);
  // Beats 0.25 s apart, the first of every bar higher
  for (let i = 1; i < clicks.length; i++) expect(clicks[i][0] - clicks[i - 1][0]).toBeCloseTo(0.25, 3);
  const accents = clicks.map(c => c[1] > 1500);
  expect(accents.slice(0, 8)).toEqual([true, false, false, false, true, false, false, false]);
  // Tempo is fixed now
  await openMenu(page);
  await expect(page.locator('#optTempo')).toBeDisabled();
  await expect(page.locator('#bpm')).toBeDisabled();
  await expect(page.locator('#tempoLock')).toBeVisible();
  // Metronome off: no more clicks
  await page.uncheck('#optClick');
  await page.waitForTimeout(200);
  const n = await page.evaluate(() => window.__clicks.length);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__clicks.length)).toBe(n);
  await closeMenu(page);
  // Settings are kept
  await page.reload();
  await openMenu(page);
  await expect(page.locator('#optTempo')).toBeChecked();
  await expect(page.locator('#bpm')).toHaveValue('240');
  await expect(page.locator('#bars')).toHaveValue('1');
  await expect(page.locator('#optClick')).not.toBeChecked();
});

test('in time: cancel during count-in', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await tempoMode(page);
  await page.click('#btnRec');
  await state(page, 'countin');
  await page.click('#btnRec');
  await state(page, 'idle');
  await tracks(page, 0);
  await expect(page.locator('#meter')).not.toHaveClass(/on/);
});

test('WAV export: exact length, the recorded tone, volume, mute, rounds', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await tempoMode(page, { countIn: false, click: false });
  await page.click('#btnRec');
  await state(page, 'playing', 4000);
  const { name, wav } = await download(page);
  expect(name).toMatch(/^loop-\d{4}-\d{2}-\d{2}-\d{4}\.wav$/);
  expect(wav).toMatchObject({ format: 1, channels: 1, bits: 16 });
  expect(wav.frames).toBe(wav.rate); // one round of 1 s
  // The fake microphone: 440 Hz at amplitude 0.5, recorded without changes
  expect(toneHz(wav.samples, wav.rate)).toBeCloseTo(F, -1);
  expect(peak(wav.samples)).toBeCloseTo(AMP, 1);
  // Volume 50 → a quarter of the amplitude (the slider is squared, so it feels even)
  await page.locator('#tracks [aria-label="Lautstärke Spur 1"]').fill('50');
  expect(peak((await download(page)).wav.samples)).toBeCloseTo(AMP / 4, 2);
  // Muted → silence; two rounds → twice as long
  await page.click('#tracks [aria-label="Spur 1 stumm"]');
  await expect(page.locator('#tracks [aria-label="Spur 1 stumm"]')).toHaveAttribute('aria-pressed', 'true');
  await openMenu(page);
  await page.selectOption('#repeats', '2');
  const muted = (await download(page, '#btnSave')).wav;
  expect(muted.frames).toBe(2 * muted.rate);
  expect(peak(muted.samples)).toBe(0);
});

test('a new track stopped early only fills part of the loop; the delay setting is used', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  // Fixed delay of 0 ms
  await openMenu(page);
  await page.uncheck('#optLatAuto');
  await expect(page.locator('#lat')).toBeEnabled();
  await page.fill('#lat', '0');
  await page.locator('#lat').dispatchEvent('change');
  await closeMenu(page);
  await tempoMode(page, { countIn: false, click: false });
  await openMenu(page);
  await page.selectOption('#bars', '2'); // 2 s loop
  await closeMenu(page);
  await page.click('#btnRec');
  await state(page, 'playing', 5000);
  expect(await num(page, 'data-loop-ms')).toBe(2000);
  // Track 2: about half a second, then Stop
  await page.click('#btnRec');
  await state(page, 'overdub');
  await page.waitForTimeout(500);
  await page.click('#btnRec');
  await tracks(page, 2);
  await page.click('#tracks [aria-label="Spur 1 stumm"]');
  const { wav } = await download(page);
  const loud = wav.samples.filter(v => Math.abs(v) > 0.05).length / wav.frames;
  // 0.5 s of 2 s (plus a little for the time a tap takes)
  expect(loud).toBeGreaterThan(0.1);
  expect(loud).toBeLessThan(0.45);
});

test('microphone denied: clear message, nothing recorded', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await page.evaluate(() => { window.__deny = true; });
  await page.click('#btnRec');
  await expect(page.locator('#status')).toHaveText('Zugriff auf das Mikrofon wurde abgelehnt.');
  await expect(page.locator('#status')).toHaveClass(/err/);
  await state(page, 'idle');
  await expect(page.locator('#btnRec')).toBeEnabled();
});

test('records offline (the recorder worklet comes from the offline cache)', async ({ page, context }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await recordFree(page, 600);
  await context.setOffline(true);
  await page.reload();
  await recordFree(page, 600);
  await tracks(page, 1);
  await context.setOffline(false);
});

test('diagnostics: steps and state, no audio', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/loop-station/');
  await recordFree(page, 600);
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('recorder loaded');
  expect(text).toContain('microphone on');
  expect(text).toContain('loop recorded');
  expect(text).toMatch(/^tracks: 1$/m);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and recording in English', async ({ page }) => {
    await fakeMic(page);
    await page.goto('/loop-station/');
    await expect(page.locator('h1')).toHaveText('Loop Station');
    await expect(page.locator('#btnRec')).toHaveText('🔴 Record');
    await expect(page.locator('#status')).toHaveText('Tap “Record” and start playing – the first recording sets the length of the loop.');
    await page.click('#btnRec');
    await state(page, 'recording');
    await page.waitForTimeout(600);
    await page.click('#btnRec');
    await state(page, 'playing');
    await expect(page.locator('#btnRec')).toHaveText('🔴 New track');
    await expect(page.locator('#tracks [aria-label="Mute track 1"]')).toBeVisible();
    await switchLang(page, 'de');
    await expect(page.locator('#btnRec')).toHaveText('🔴 Neue Spur');
    await expect(page.locator('#tracks [aria-label="Spur 1 stumm"]')).toBeVisible();
  });
});
