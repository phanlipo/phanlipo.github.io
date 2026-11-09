// Peitsche: every crack has a plausible length with the loudest moment at the crack (not in the whoosh),
// swing detection by acceleration (one crack per lash, sensitivity), settings persist, English.
import { test, expect } from './helpers.mjs';

// Written down independently of the page: whoosh length + tail (double: + gap between the two cracks)
const RANGE = {
  classic: { ms: [400, 550], crack: [150, 300] },
  bull: { ms: [700, 850], crack: [350, 500] },
  coach: { ms: [210, 270], crack: [60, 120] },
  double: { ms: [460, 590], crack: [120, 200] },
  circus: { ms: [750, 850], crack: [150, 250] },
};
const whip = page => page.locator('#whip');
const attr = async (page, name) => Number(await whip(page).getAttribute(name));

// Sends a burst of motion events: linear acceleration a (m/s²) along x, reported like Android
// (acceleration without gravity) or – with gravityOnly – only including gravity (z = 9.81).
async function lash(page, values, { gravityOnly = false } = {}) {
  await page.evaluate(({ values, gravityOnly }) => {
    for (const a of values) {
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', gravityOnly
        ? { accelerationIncludingGravity: { x: a, y: 0, z: 9.81 }, interval: 16 }
        : { acceleration: { x: a, y: 0, z: 0 }, accelerationIncludingGravity: { x: a, y: 0, z: 9.81 }, interval: 16 }));
    }
  }, { values, gravityOnly });
}

test('each crack has its length, the loudest moment is the crack, never clips', async ({ page }) => {
  await page.goto('/whip/');
  let n = 0;
  for (const [kind, r] of Object.entries(RANGE)) {
    await page.click(`#sounds [data-s="${kind}"]`);
    await expect(page.locator(`#sounds [data-s="${kind}"]`)).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < 5; i++) {
      await whip(page).click();
      n++;
      await expect(page.locator('#count')).toHaveText(String(n));
      await expect(whip(page)).toHaveAttribute('data-sound', kind);
      const ms = await attr(page, 'data-duration'), crack = await attr(page, 'data-crack');
      expect(ms, kind).toBeGreaterThanOrEqual(r.ms[0]);
      expect(ms, kind).toBeLessThanOrEqual(r.ms[1]);
      expect(crack, kind).toBeGreaterThanOrEqual(r.crack[0]);
      expect(crack, kind).toBeLessThanOrEqual(r.crack[1]);
      // The sonic boom is the loudest part: right at a crack (double: either of the two)
      const peakAt = await attr(page, 'data-peak-at');
      expect(peakAt, kind).toBeGreaterThanOrEqual(crack);
      expect(peakAt - crack, kind).toBeLessThanOrEqual(kind === 'double' ? 160 : 10);
      const peak = await attr(page, 'data-peak');
      expect(peak, kind).toBeGreaterThan(0.5);
      expect(peak, kind).toBeLessThanOrEqual(1);
    }
  }
  await expect(page.locator('#status')).toHaveText('💥 Manege!');
});

test('random picks different cracks', async ({ page }) => {
  await page.goto('/whip/');
  await expect(page.locator('#sounds [data-s="random"]')).toHaveAttribute('aria-pressed', 'true');
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    await whip(page).click();
    seen.add(await whip(page).getAttribute('data-sound'));
  }
  for (const k of seen) expect(Object.keys(RANGE)).toContain(k);
  expect(seen.size).toBeGreaterThanOrEqual(3);
});

test('swing detection: one crack per lash, only above the sensitivity, off again', async ({ page }) => {
  await page.goto('/whip/');
  // Off: motion does nothing
  await lash(page, [40, 40, 0]);
  await expect(page.locator('#count')).toHaveText('0');
  await page.click('#btnSwing');
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#status')).toContainText('Schwingen an');
  // Medium = 20 m/s²: a gentle wave stays quiet, a lash of several samples above the limit cracks once
  await lash(page, [5, 10, 15, 19, 15, 5]);
  await expect(page.locator('#count')).toHaveText('0');
  await lash(page, [10, 25, 35, 30, 22, 8]);
  await expect(page.locator('#count')).toHaveText('1');
  // Calm phone, then the next lash (after the 350 ms pause) cracks again
  await lash(page, [2, 1, 0]);
  await page.waitForTimeout(400);
  await lash(page, [25, 30]);
  await expect(page.locator('#count')).toHaveText('2');
  // Without calming down it does not crack again
  await page.waitForTimeout(400);
  await lash(page, [28, 25, 30]);
  await expect(page.locator('#count')).toHaveText('2');
  await lash(page, [0]);
  // Light = 12 m/s²: the gentle wave cracks now (devices reporting only acceleration including gravity)
  await page.click('#sens [data-v="high"]');
  await page.waitForTimeout(400);
  await lash(page, [5, 10, 15, 19, 15, 5].map(a => Math.sqrt((a + 9.81) ** 2 - 9.81 ** 2)), { gravityOnly: true });
  await expect(page.locator('#count')).toHaveText('3');
  // Strong = 30 m/s²: 25 is not enough
  await page.click('#sens [data-v="low"]');
  await lash(page, [0]);
  await page.waitForTimeout(400);
  await lash(page, [25, 25]);
  await expect(page.locator('#count')).toHaveText('3');
  // Switched off
  await page.click('#btnSwing');
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(400);
  await lash(page, [0, 40, 50]);
  await expect(page.locator('#count')).toHaveText('3');
});

test('swing detection stays on after reload (no permission needed)', async ({ page }) => {
  await page.goto('/whip/');
  await page.click('#btnSwing');
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'true');
  await lash(page, [0, 30]);
  await expect(page.locator('#count')).toHaveText('1');
  await page.waitForTimeout(1600);
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'true');
});

test('iPhone: asks for motion access; denied keeps swinging off', async ({ page }) => {
  await page.addInitScript(() => {
    window.__answer = 'granted';
    window.__asked = 0;
    DeviceMotionEvent.requestPermission = async () => { window.__asked++; return window.__answer; };
  });
  await page.goto('/whip/');
  await page.evaluate(() => { window.__answer = 'denied'; });
  await page.click('#btnSwing');
  await expect(page.locator('.toast').last()).toContainText('nicht erlaubt');
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => { window.__answer = 'granted'; });
  await page.click('#btnSwing');
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__asked)).toBe(2);
  await lash(page, [0, 30]);
  await expect(page.locator('#count')).toHaveText('1');
  // A new page load needs a new tap for the permission: without motion data swinging shows as off
  await page.reload();
  await expect(page.locator('#btnSwing')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#status')).toHaveText('Zum Schwingen auf „Schwingen erkennen“ tippen.');
  await lash(page, [0, 30]);
  await page.waitForTimeout(200);
  await expect(page.locator('#count')).toHaveText('1');
});

test('vibration: started in the tap, one jolt at each crack, off when unchecked', async ({ page }) => {
  await page.addInitScript(() => {
    window.__vib = [];
    // Records each call and whether it happened inside the click (same task as the tap)
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: p => { window.__vib.push({ p, inTap: !!window.__inTap }); return true; } });
    addEventListener('click', () => { window.__inTap = true; setTimeout(() => { window.__inTap = false; }); }, true);
  });
  await page.goto('/whip/');
  const calls = () => page.evaluate(() => window.__vib);
  for (const kind of ['classic', 'double']) {
    await page.click(`#sounds [data-s="${kind}"]`);
    await whip(page).click();
    const crack = await attr(page, 'data-crack');
    const c = (await calls()).at(-1);
    expect(c.inTap, kind).toBe(true);
    // Vibration API pattern: on, off, on, … – starts with 0 ms on, then the pause until the crack
    const p = c.p;
    expect(p[0]).toBe(0);
    expect(p[1]).toBe(crack);
    for (let i = 2; i < p.length; i += 2) {
      expect(p[i], 'long enough to be felt').toBeGreaterThanOrEqual(80);
      expect(p[i]).toBeLessThanOrEqual(200);
    }
    expect(p.length, kind).toBe(kind === 'double' ? 5 : 3);
    if (kind === 'double') {
      // second jolt starts with the second crack: within the double crack's gap of 90–140 ms after the first
      const second = p[1] + p[2] + p[3];
      expect(second - crack).toBeGreaterThanOrEqual(90);
      expect(second - crack).toBeLessThanOrEqual(140);
    }
  }
  const n = (await calls()).length;
  await page.uncheck('#optVibrate');
  await whip(page).click();
  await expect(page.locator('#count')).toHaveText('3');
  expect((await calls()).length).toBe(n);
});

test('settings and counter persist; reset sets the counter to 0', async ({ page }) => {
  await page.goto('/whip/');
  await page.click('#sounds [data-s="bull"]');
  await page.click('#sens [data-v="low"]');
  await page.uncheck('#optVibrate');
  await whip(page).click();
  await whip(page).click();
  await page.reload();
  await expect(page.locator('#sounds [data-s="bull"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#sens [data-v="low"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#optVibrate')).not.toBeChecked();
  await expect(page.locator('#count')).toHaveText('2');
  page.once('dialog', d => d.accept());
  await page.click('#btnReset');
  await expect(page.locator('#count')).toHaveText('0');
  await page.reload();
  await expect(page.locator('#count')).toHaveText('0');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('crack names and status in English', async ({ page }) => {
    await page.goto('/whip/');
    await page.click('#sounds [data-s="coach"]');
    await expect(page.locator('#sounds [data-s="coach"]')).toContainText('Coachman');
    await whip(page).click();
    await expect(page.locator('#status')).toHaveText('💥 Coachman!');
    await expect(page.locator('#whipLabel')).toHaveText('Tap to crack!');
    await expect(page.locator('#sens [data-v="high"]')).toHaveText('Light');
  });
});
