// Generic checks that run automatically for every page – a new tool is covered without extra work.
import { test, expect, tools, apps, VIEWPORTS, expectNoHorizontalScroll } from './helpers.mjs';

test.describe('start page', () => {
  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`loads cleanly (${name})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('h1')).toHaveText('Web-Tools');
      await expectNoHorizontalScroll(page);
    });
  }

  test('lists every tool with a working link', async ({ page }) => {
    await page.goto('/');
    const list = tools();
    await expect(page.locator('.tool')).toHaveCount(list.length);
    for (const t of list) {
      const card = page.locator('.tool', { has: page.locator('h2', { hasText: t.title }) });
      await expect(card.locator('a.btn')).toHaveAttribute('href', `${t.folder}/`);
      await expect(card.locator('img')).toHaveAttribute('src', `${t.folder}/icon.svg`);
    }
  });
});

for (const app of apps()) {
  test.describe(app.folder, () => {
    const url = `/${app.folder}/`;

    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      test(`loads cleanly, no horizontal scrolling (${name})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(url);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page).toHaveTitle(app.title);
        await expectNoHorizontalScroll(page);
      });
    }

    test('dark mode has a dark background', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(url);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g).map(Number);
      expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, `body background ${bg}`).toBeLessThan(0.3);
    });

    test('help is collapsed, shared footer is present', async ({ page }) => {
      await page.goto(url);
      const help = page.locator('details.help');
      await expect(help).toHaveCount(1);
      expect(await help.evaluate(d => d.open)).toBe(false);
      await expect(help.locator('summary')).toHaveText('Anleitung & Hinweise');
      await expect(page.locator('footer .footer-common')).toContainText('KI-generiert');
    });

    test('is an installable PWA and works offline', async ({ page, context }) => {
      await page.goto(url);

      const manifest = await page.evaluate(async () => {
        const href = document.querySelector('link[rel="manifest"]').href;
        return (await fetch(href)).json();
      });
      expect(manifest).toMatchObject({ start_url: './', scope: './', display: 'standalone', lang: 'de' });
      expect(manifest.short_name.length, 'short_name length').toBeLessThanOrEqual(12);
      for (const size of ['192x192', '512x512']) expect(manifest.icons.map(i => i.sizes)).toContain(size);
      expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true);

      await page.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors.map(e => e.errorId)).toEqual([]);

      await page.reload();
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled by its service worker').toBe(true);
      const cacheNames = await page.evaluate(() => caches.keys());
      expect(cacheNames.filter(k => k.startsWith(`pwa:${app.folder}:`)), 'exactly one cache for this app').toHaveLength(1);

      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('footer .footer-common')).toBeVisible();
      await context.setOffline(false);
    });
  });
}
