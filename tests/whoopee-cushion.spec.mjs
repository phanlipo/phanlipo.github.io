// Furzkissen: every sound plays with a plausible length and level, counter, time fuse, settings persist.
import { test, expect } from './helpers.mjs';

// Expected lengths in ms, written down independently of the page (stutter: 4–7 bursts of 80–180 ms + 50–120 ms gaps)
const RANGE = {
  short: [250, 450], long: [1400, 2400], wet: [600, 1000], squeaky: [500, 1000],
  thunder: [1000, 1600], stutter: [4 * 130, 7 * 300],
};
const cushion = page => page.locator('#cushion');

test('each sound plays with its length, is loud enough and never clips', async ({ page }) => {
  await page.goto('/whoopee-cushion/');
  let n = 0;
  for (const [kind, [lo, hi]] of Object.entries(RANGE)) {
    await page.click(`#sounds [data-s="${kind}"]`);
    await expect(page.locator(`#sounds [data-s="${kind}"]`)).toHaveAttribute('aria-pressed', 'true');
    for (let i = 0; i < 5; i++) {
      await cushion(page).click();
      n++;
      await expect(page.locator('#count')).toHaveText(String(n));
      await expect(cushion(page)).toHaveAttribute('data-sound', kind);
      const ms = Number(await cushion(page).getAttribute('data-duration'));
      expect(ms, kind).toBeGreaterThanOrEqual(lo);
      expect(ms, kind).toBeLessThanOrEqual(hi);
      const peak = Number(await cushion(page).getAttribute('data-peak'));
      expect(peak, kind).toBeGreaterThan(0.3);
      expect(peak, kind).toBeLessThanOrEqual(1);
    }
  }
  await expect(page.locator('#status')).toHaveText('💨 Stotterer!');
});

test('random picks different sounds', async ({ page }) => {
  await page.goto('/whoopee-cushion/');
  await expect(page.locator('#sounds [data-s="random"]')).toHaveAttribute('aria-pressed', 'true');
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    await cushion(page).click();
    seen.add(await cushion(page).getAttribute('data-sound'));
  }
  for (const k of seen) expect(Object.keys(RANGE)).toContain(k);
  expect(seen.size).toBeGreaterThanOrEqual(3);
});

test('time fuse: counts down, farts after the delay, can be cancelled', async ({ page }) => {
  await page.clock.install();
  await page.goto('/whoopee-cushion/');
  await page.click('#delays [data-d="3"]');
  await cushion(page).click();
  await expect(page.locator('#status')).toHaveText('💣 Pupst in 3 s – Handy hinlegen!');
  await expect(cushion(page)).toHaveAttribute('aria-disabled', 'true');
  // Taps while armed do nothing (Playwright waits on aria-disabled, so dispatch the click)
  await cushion(page).dispatchEvent('click');
  await page.clock.runFor(2000);
  await expect(page.locator('#status')).toHaveText('💣 Pupst in 1 s – Handy hinlegen!');
  await expect(page.locator('#count')).toHaveText('0');
  await page.clock.runFor(1200);
  await expect(page.locator('#count')).toHaveText('1');
  await expect(page.locator('#armedRow')).toBeHidden();
  await expect(cushion(page)).not.toHaveAttribute('aria-disabled', 'true');
  // Cancel
  await cushion(page).click();
  await page.click('#btnCancel');
  await expect(page.locator('#status')).toHaveText('Zeitzünder abgebrochen');
  await page.clock.runFor(5000);
  await expect(page.locator('#count')).toHaveText('1');
});

test('settings and counter persist; reset sets the counter to 0', async ({ page }) => {
  await page.goto('/whoopee-cushion/');
  await page.click('#sounds [data-s="thunder"]');
  await page.click('#delays [data-d="10"]');
  await page.uncheck('#optVibrate');
  await page.click('#delays [data-d="0"]');
  await cushion(page).click();
  await cushion(page).click();
  await page.click('#delays [data-d="10"]');
  await page.reload();
  await expect(page.locator('#sounds [data-s="thunder"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#delays [data-d="10"]')).toHaveAttribute('aria-pressed', 'true');
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
  test('sound names and status in English', async ({ page }) => {
    await page.goto('/whoopee-cushion/');
    await page.click('#sounds [data-s="squeaky"]');
    await expect(page.locator('#sounds [data-s="squeaky"]')).toContainText('Squeaker');
    await cushion(page).click();
    await expect(page.locator('#status')).toHaveText('💨 Squeaker!');
    await expect(page.locator('#cushionLabel')).toHaveText('Press me!');
  });
});
