// Plappertier: records from the microphone, plays it back with effects, moves the mouth, listens automatically.
import { test, expect } from './helpers.mjs';

const F = 440; // frequency of the fake microphone
// Fake microphone: sine with known frequency; window.__mic.gain switches it on/off (speaking/silence)
async function fakeMic(page, amp = 0.5) {
  await page.addInitScript(({ F, amp }) => {
    navigator.mediaDevices.getUserMedia = async () => {
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
const animal = page => page.locator('#animal');
const num = async (page, attr) => Number(await animal(page).getAttribute(attr));
const done = page => expect(animal(page)).toHaveAttribute('data-state', 'done', { timeout: 8000 });

async function record(page, ms = 1000) {
  await page.click('#btnMain');
  await expect(page.locator('#btnMain')).toHaveText('⏹️ Stopp – nachplappern');
  await expect(page.locator('#status')).toHaveText('🔴 Aufnahme … tippe auf Stopp, wenn du fertig bist.');
  await page.waitForTimeout(ms);
  await page.click('#btnMain');
}

test('record, then the pet talks back squeaky: faster, higher, mouth moves', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/talking-animal/');
  await expect(page.locator('#status')).toHaveText('Tippe auf „Aufnehmen“ und sag etwas.');
  await expect(page.locator('#btnAgain')).toBeDisabled();
  await record(page, 1200);
  await expect(page.locator('#status')).toHaveText('🗣️ Piepsig!');
  await expect(page.locator('#btnMain')).toHaveText('🎤 Aufnehmen');
  await expect(animal(page)).toHaveAttribute('data-effect', 'high');
  const inMs = await num(page, 'data-in-ms');
  expect(inMs).toBeGreaterThan(900);
  expect(inMs).toBeLessThan(2000);
  // Playback rate 1.6: 1.6 × shorter and 1.6 × higher
  expect(await num(page, 'data-out-ms') / inMs).toBeCloseTo(1 / 1.6, 1);
  expect(await num(page, 'data-pitch') / (F * 1.6)).toBeCloseTo(1, 1);
  await done(page);
  expect(await num(page, 'data-mouth-max')).toBeGreaterThan(0.5);
  await expect(page.locator('#btnAgain')).toBeEnabled();
});

test('every effect: expected length and pitch; tapping a voice replays the last recording', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/talking-animal/');
  await record(page, 1000);
  await done(page);
  const inMs = await num(page, 'data-in-ms');
  // [length ratio range, pitch factor or null]
  const EXPECT = {
    normal: [[0.95, 1.05], 1], low: [[1.45, 1.6], 0.65], reverse: [[0.95, 1.05], 1],
    robot: [[0.95, 1.1], null], echo: [[1.4, 3.2], 1], alien: [[0.8, 0.95], null], high: [[0.58, 0.67], 1.6],
  };
  for (const [fx, [[lo, hi], f]] of Object.entries(EXPECT)) {
    await page.click(`#effects [data-e="${fx}"]`);
    await expect(page.locator(`#effects [data-e="${fx}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(animal(page)).toHaveAttribute('data-effect', fx);
    expect(await num(page, 'data-in-ms'), fx).toBe(inMs);
    const ratio = await num(page, 'data-out-ms') / inMs;
    expect(ratio, fx).toBeGreaterThanOrEqual(lo);
    expect(ratio, fx).toBeLessThanOrEqual(hi);
    if (f) expect(await num(page, 'data-pitch') / (F * f), fx).toBeCloseTo(1, 1);
    await done(page);
  }
  // "Again" plays the chosen voice once more
  await page.click('#btnAgain');
  await expect(page.locator('#status')).toHaveText('🗣️ Piepsig!');
  await done(page);
});

test('automatic listening: waits for a voice, talks back after a pause, listens again', async ({ page }) => {
  await fakeMic(page, 0);
  await page.goto('/talking-animal/');
  await page.check('#optAuto');
  await expect(page.locator('#btnMain')).toHaveText('👂 Zuhören starten');
  await page.click('#btnMain');
  await expect(page.locator('#status')).toHaveText('👂 Ich höre zu … sag etwas!');
  await expect(page.locator('#btnMain')).toHaveText('⏹️ Zuhören beenden');
  await page.waitForTimeout(800);
  // Speak for 1 s, then silence
  await page.evaluate(() => { window.__mic.gain.gain.value = 0.5; });
  await expect(page.locator('#status')).toHaveText('🔴 Ich höre zu …');
  await page.waitForTimeout(1000);
  await page.evaluate(() => { window.__mic.gain.gain.value = 0; });
  await expect(page.locator('#status')).toHaveText('🗣️ Piepsig!', { timeout: 4000 });
  // Recording = the speech (plus a little before and after), silence cut off
  const inMs = await num(page, 'data-in-ms');
  expect(inMs).toBeGreaterThan(900);
  expect(inMs).toBeLessThan(1700);
  await done(page);
  await expect(page.locator('#status')).toHaveText('👂 Ich höre zu … sag etwas!');
  // A cough that short is ignored (wait until the pet stops ignoring its own voice)
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__mic.gain.gain.value = 0.5; });
  await page.waitForTimeout(150);
  await page.evaluate(() => { window.__mic.gain.gain.value = 0; });
  await expect(page.locator('#status')).toHaveText('Das war zu kurz – nochmal!', { timeout: 4000 });
  await page.click('#btnMain');
  await expect(page.locator('#btnMain')).toHaveText('👂 Zuhören starten');
  await expect(page.locator('#meter')).not.toHaveClass(/on/);
});

test('recordings stop after 10 seconds', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/talking-animal/');
  await page.click('#btnMain');
  await expect(page.locator('#status')).toHaveText('🗣️ Piepsig!', { timeout: 14000 });
  const inMs = await num(page, 'data-in-ms');
  expect(inMs).toBeGreaterThanOrEqual(9900);
  expect(inMs).toBeLessThanOrEqual(10100);
});

test('denied microphone shows a message', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
  });
  await page.goto('/talking-animal/');
  await page.click('#btnMain');
  await expect(page.locator('#status')).toHaveText('Zugriff auf das Mikrofon wurde abgelehnt.');
  await expect(page.locator('#btnMain')).toHaveText('🎤 Aufnehmen');
  await expect(page.locator('#btnMain')).toBeEnabled();
});

test('pet, voice and automatic mode persist; the recording is not stored', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/talking-animal/');
  for (const a of ['dog', 'frog', 'panda', 'cat']) {
    await page.click(`#animals [data-a="${a}"]`);
    await expect(page.locator('#animal svg')).toBeVisible();
  }
  await page.click('#animals [data-a="panda"]');
  await expect(animal(page)).toHaveAttribute('aria-label', 'Panda');
  await page.click('#effects [data-e="echo"]');
  await record(page, 600);
  await done(page);
  await page.check('#optAuto');
  const stored = await page.evaluate(() => Object.keys(localStorage));
  expect(stored).toEqual(['talking-animal.settings.v1']);
  await page.reload();
  await expect(page.locator('#animals [data-a="panda"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#effects [data-e="echo"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#optAuto')).toBeChecked();
  await expect(page.locator('#btnAgain')).toBeDisabled();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and pet names in English', async ({ page }) => {
    await fakeMic(page);
    await page.goto('/talking-animal/');
    await expect(page.locator('#btnMain')).toHaveText('🎤 Record');
    await expect(animal(page)).toHaveAttribute('aria-label', 'Cat');
    await page.click('#btnMain');
    await expect(page.locator('#btnMain')).toHaveText('⏹️ Stop – talk back');
    await page.waitForTimeout(600);
    await page.click('#btnMain');
    await expect(page.locator('#status')).toHaveText('🗣️ Squeaky!');
    await page.click('#animals [data-a="dog"]');
    await expect(animal(page)).toHaveAttribute('aria-label', 'Dog');
  });
});
