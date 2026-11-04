// New version of an app: the service worker takes over in the background, the page offers a reload (↻ next to ☰),
// so an installed app does not have to be closed and opened again. See registerServiceWorker in common.js.
import { test, expect, apps, VIEWPORTS, expectNoHorizontalScroll } from './helpers.mjs';

// The page is controlled by its service worker (as on every later start), then a new version takes over
async function openControlled(page, url) {
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}
const newVersion = page => page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')));

for (const app of apps()) {
  test(`${app.folder} · new version: reload button next to the menu, fits at 375 px`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await openControlled(page, `/${app.folder}/`);
    const btn = page.locator('body > header .update-btn');
    await expect(btn).toBeHidden();
    await newVersion(page);
    await expect(btn).toBeVisible();
    await expect(btn).toHaveAccessibleName('Neu laden – neue Version');
    await expect(page.locator('#toast')).toHaveText('Neue Version geladen – oben ↻ tippen zum Aktualisieren');
    // Directly left of the menu button, 44 px, nothing of the header lies under it
    const [b, m] = [await btn.boundingBox(), await page.locator('.menu-btn').boundingBox()];
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.x + b.width).toBeLessThanOrEqual(m.x + 1);
    expect(m.x - (b.x + b.width)).toBeLessThan(8);
    const overlap = await page.evaluate(() => {
      const r = document.querySelector('.update-btn').getBoundingClientRect();
      return [...document.querySelectorAll('body > header > :not(.stage-actions)')].some(el => {
        const e = el.getBoundingClientRect();
        return e.width && e.height && e.right > r.left + 1 && e.left < r.right - 1 && e.bottom > r.top + 1 && e.top < r.bottom - 1;
      });
    });
    expect(overlap).toBe(false);
    await expectNoHorizontalScroll(page);
  });
}

test.describe('reload', () => {
  const url = '/dice-coin/';

  test('tapping ↻ reloads the page; afterwards no button', async ({ page }) => {
    await openControlled(page, url);
    await page.evaluate(() => { window.__old = true; });
    await newVersion(page);
    await Promise.all([page.waitForEvent('load'), page.locator('.update-btn').click()]);
    expect(await page.evaluate(() => window.__old)).toBeUndefined();
    await expect(page.locator('.update-btn')).toBeHidden();
  });

  test('first visit (no service worker yet): taking control is not an update', async ({ page }) => {
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await newVersion(page);
    await expect(page.locator('.update-btn')).toBeHidden();
  });

  test('diagnosis logs the update and the reload', async ({ page }) => {
    await openControlled(page, url);
    await newVersion(page);
    await newVersion(page); // a second take-over gives no second hint
    const text = await page.evaluate(() => Tools.diag.text());
    expect(text.match(/update: new version active/g)).toHaveLength(1);
  });

  test('back from the background: checks for a new version, at most every 10 minutes', async ({ page }) => {
    await page.clock.install();
    await page.addInitScript(() => {
      const orig = ServiceWorkerRegistration.prototype.update;
      ServiceWorkerRegistration.prototype.update = function () { window.__updates = (window.__updates || 0) + 1; return orig.call(this); };
    });
    await openControlled(page, url);
    const comeBack = () => page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const updates = () => page.evaluate(() => window.__updates || 0);
    await comeBack();
    expect(await updates()).toBe(0); // just started
    await page.clock.fastForward('10:01');
    await comeBack();
    expect(await updates()).toBe(1);
    await page.clock.fastForward('05:00');
    await comeBack();
    expect(await updates()).toBe(1);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('hint and button in English', async ({ page }) => {
      await openControlled(page, url);
      await newVersion(page);
      await expect(page.locator('.update-btn')).toHaveAccessibleName('Reload – new version');
      await expect(page.locator('#toast')).toHaveText('New version loaded – tap ↻ at the top to update');
    });
  });
});
