// Small shared helpers in assets/common.js: random numbers, ids, clamp, reduced motion, sharing and
// downloading files, keeping the screen on (Tools.wakeLock). Tested on the template page.
import { test, expect } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await page.goto('/template/'); });

test('randomInt: whole numbers 0 … n-1, every value comes up, uses crypto', async ({ page }) => {
  const r = await page.evaluate(() => {
    const seen = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) seen[Tools.randomInt(6)]++;
    // A fixed source of randomness gives fixed results (tests can pin the random numbers this way)
    const orig = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = a => { a[0] = 0xFFFFFFFF; return a; };   // above the limit for n = 6 → retried
    let calls = 0;
    crypto.getRandomValues = a => { a[0] = calls++ ? 7 : 0xFFFFFFFF; return a; };
    const pinned = Tools.randomInt(6);
    crypto.getRandomValues = a => { a[0] = 0x80000000; return a; };
    const half = Tools.random();
    crypto.getRandomValues = orig;
    return { seen, pinned, calls, half, one: Tools.randomInt(1) };
  });
  for (const n of r.seen) expect(n).toBeGreaterThan(800);           // 1000 expected each
  expect(r.seen.reduce((a, b) => a + b)).toBe(6000);
  expect(r.pinned).toBe(7 % 6);                                       // the biased top value was thrown away
  expect(r.calls).toBe(2);
  expect(r.half).toBe(0.5);
  expect(r.one).toBe(0);
});

test('uid: prefix, unique, sorts by creation; clamp; reducedMotion', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const a = Tools.uid('r');
    await new Promise(res => setTimeout(res, 5));
    const ids = Array.from({ length: 500 }, () => Tools.uid());
    return { a, b: ids[0], unique: new Set(ids).size, clamp: [Tools.clamp(5, 0, 3), Tools.clamp(-1, 0, 3), Tools.clamp(2, 0, 3)], reduced: Tools.reducedMotion() };
  });
  expect(r.a).toMatch(/^r[0-9a-z]{14,}$/);
  expect(r.b > r.a.slice(1)).toBe(true);
  expect(r.unique).toBe(500);
  expect(r.clamp).toEqual([3, 0, 2]);
  expect(r.reduced).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => Tools.reducedMotion())).toBe(true);
});

test('canShareFile asks navigator.canShare once per kind of file; download saves under the file name', async ({ page }) => {
  const r = await page.evaluate(() => {
    let asked = 0;
    navigator.canShare = d => { asked++; return d.files[0].type === 'application/pdf'; };
    return { pdf: Tools.canShareFile('x.pdf', 'application/pdf'), again: Tools.canShareFile('x.pdf', 'application/pdf'), png: Tools.canShareFile('x.png', 'image/png'), asked };
  });
  expect(r).toEqual({ pdf: true, again: true, png: false, asked: 2 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => Tools.download(new File(['hallo'], 'notiz-1.txt', { type: 'text/plain' }))),
  ]);
  expect(download.suggestedFilename()).toBe('notiz-1.txt');
});

test.describe('wakeLock', () => {
  test.beforeEach(async ({ page }) => {
    // Stand-in for the Screen Wake Lock API: counts requests, the page can drop the lock like a browser does
    await page.addInitScript(() => {
      window.__wake = { requests: 0, held: 0, sentinels: [] };
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        window.__wake.requests++; window.__wake.held++;
        const s = new EventTarget();
        s.released = false;
        s.release = async () => { if (!s.released) { s.released = true; window.__wake.held--; s.dispatchEvent(new Event('release')); } };
        window.__wake.sentinels.push(s);
        return s;
      } } });
    });
    await page.goto('/template/');
  });

  test('held while any reason holds it, released after the last one; one lock for several reasons', async ({ page }) => {
    await page.evaluate(async () => { await Tools.wakeLock.hold('game'); await Tools.wakeLock.hold('music'); });
    expect(await page.evaluate(() => [window.__wake.requests, window.__wake.held, Tools.wakeLock.active()])).toEqual([1, 1, true]);
    await page.evaluate(() => Tools.wakeLock.release('game'));
    expect(await page.evaluate(() => [window.__wake.held, Tools.wakeLock.active(), Tools.wakeLock.reasons()])).toEqual([1, true, ['music']]);
    await page.evaluate(() => Tools.wakeLock.release('music'));
    expect(await page.evaluate(() => [window.__wake.held, Tools.wakeLock.active()])).toEqual([0, false]);
    expect(await page.evaluate(() => Tools.diag.text())).toMatch(/wake lock on game\n[\s\S]*wake lock off/);
  });

  test('asked for again when the page becomes visible after the browser dropped it', async ({ page }) => {
    await page.evaluate(() => Tools.wakeLock.hold());
    await page.evaluate(() => window.__wake.sentinels[0].release());          // tab hidden: the browser releases
    expect(await page.evaluate(() => Tools.wakeLock.active())).toBe(false);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => page.evaluate(() => [window.__wake.requests, Tools.wakeLock.active()])).toEqual([2, true]);
    expect(await page.evaluate(() => Tools.diag.text())).toContain('wake lock: {"held":true,"reasons":["app"],"supported":true}');
  });

  test('released before the request finished: no lock is kept', async ({ page }) => {
    await page.evaluate(async () => { const p = Tools.wakeLock.hold('x'); Tools.wakeLock.release('x'); await p; });
    expect(await page.evaluate(() => [window.__wake.requests, window.__wake.held, Tools.wakeLock.active()])).toEqual([1, 0, false]);
  });
});

test('without the Wake Lock API nothing breaks', async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.wakeLock; });
  await page.goto('/template/');
  expect(await page.evaluate(async () => { await Tools.wakeLock.hold(); return [Tools.wakeLock.supported(), Tools.wakeLock.active()]; })).toEqual([false, false]);
});
