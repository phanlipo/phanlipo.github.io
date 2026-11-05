// Basic check in WebKit (engine of Safari, every browser on the iPhone) and Firefox: every page loads
// without JavaScript errors, has no horizontal scrolling on a phone, the menu opens and the page works
// offline after the first visit. Runs only in the projects "webkit" and "firefox" (playwright.config.mjs) –
// all other tests run in Chromium. WebKit in Playwright is not Safari itself, but catches most differences.
import { test, expect, apps, VIEWPORTS, expectNoHorizontalScroll, openMenu } from './helpers.mjs';

const pages = [{ folder: '', title: 'Startseite' }, ...apps().filter(a => a.folder !== 'template')];

for (const app of pages) {
  const url = `/${app.folder ? app.folder + '/' : ''}`;
  test.describe(app.folder || 'start page', () => {
    // Safari does not know the viewport key interactive-widget (Chrome/Android: the keyboard resizes the
    // page, see AGENTS.md) and says it ignores it – expected, everything else still fails the test
    test.use({ viewport: VIEWPORTS.mobile, allowedProblems: /^console: Viewport argument key "interactive-widget" not recognized and ignored\.$/ });

    test('loads without errors, fits the phone, menu opens', async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('h1').first()).toBeVisible();
      await expectNoHorizontalScroll(page);
      if (app.folder) {
        await openMenu(page);
        await expect(page.locator('#appMenu details.help')).toBeAttached();
        await expectNoHorizontalScroll(page);
      }
    });

    if (app.folder) {
      test('works offline after the first visit', async ({ page, context }) => {
        await page.goto(url);
        await page.evaluate(() => navigator.serviceWorker.ready);
        // let the page finish loading what it fetches by itself (e.g. WebAssembly) – going offline in the
        // middle aborts those requests, which is not what a user does
        await page.reload({ waitUntil: 'networkidle' });
        expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled by its service worker').toBe(true);
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('h1').first()).toBeVisible();
        await context.setOffline(false);
      });
    }
  });
}
