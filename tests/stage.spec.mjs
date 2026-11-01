// Stage layout (<body class="stage">, see AGENTS.md "Bühne"): the interaction fills the screen, the page does not
// scroll; settings, history, data backup, help and footer are in the menu (☰), which "back" closes.
import { test, expect, stageApps, VIEWPORTS, expectNoHorizontalScroll } from './helpers.mjs';

const list = stageApps();

test('stage apps are found', () => {
  expect(list.map(a => a.folder)).toEqual(expect.arrayContaining(['ai-chat', 'paint', 'talking-animal']));
});

const PHONES = { portrait: { width: 375, height: 667 }, landscape: { width: 667, height: 375 }, desktop: VIEWPORTS.desktop };

for (const app of list) {
  test.describe(`${app.folder} · stage`, () => {
    const url = `/${app.folder}/`;

    for (const [name, viewport] of Object.entries(PHONES)) {
      test(`fills the screen without scrolling (${name})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(url);
        const m = await page.evaluate(() => {
          const r = el => el.getBoundingClientRect();
          return {
            scroll: document.documentElement.scrollHeight, inner: innerHeight,
            headerTop: r(document.querySelector('body > header')).top,
            mainBottom: r(document.querySelector('main')).bottom,
          };
        });
        expect(m.scroll, 'page does not scroll').toBeLessThanOrEqual(m.inner);
        expect(m.headerTop).toBe(0);
        expect(Math.abs(m.mainBottom - m.inner), 'main reaches the bottom of the screen').toBeLessThanOrEqual(1);
        await expectNoHorizontalScroll(page);
        await expect(page.locator('.menu-btn')).toBeVisible();
      });
    }

    test('menu holds settings, data backup, help and footer; opens and closes', async ({ page }) => {
      await page.setViewportSize(PHONES.portrait);
      await page.goto(url);
      const menu = page.locator('#appMenu');
      const btn = page.getByRole('button', { name: 'Menü', exact: true });
      await expect(menu).toBeHidden();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');
      // Everything apart from the interaction is in the menu, nothing of it is left on the page
      for (const sel of ['details.data', 'details.help', 'footer', '[data-menu]'])
        expect(await page.locator(sel).evaluateAll(els => els.every(el => !!el.closest('#appMenu'))), sel).toBe(true);
      expect(await page.locator('#appMenu details.help, #appMenu details.data, #appMenu footer').count()).toBe(3);

      // Close button
      await btn.click();
      await expect(menu).toBeVisible();
      await expect(btn).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('heading', { name: 'Menü', exact: true })).toBeVisible();
      await expect(menu.locator('footer .footer-version')).toBeVisible();
      await page.getByRole('button', { name: 'Menü schließen' }).click();
      await expect(menu).toBeHidden();
      await expect(btn).toHaveAttribute('aria-expanded', 'false');

      // Escape
      await btn.click();
      await expect(menu).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(menu).toBeHidden();

      // Tap outside the sheet (backdrop)
      await btn.click();
      await expect(menu).toBeVisible();
      await page.mouse.click(180, 20);
      await expect(menu).toBeHidden();
      // Every close took its history entry along – none is left over
      await expect.poll(() => page.evaluate(() => history.state && history.state.toolsMenu)).toBeFalsy();
    });

    test('back closes the menu instead of leaving the app', async ({ page }) => {
      await page.goto('/');
      await page.goto(url);
      await page.evaluate(() => { window.__stillHere = true; });
      await page.locator('.menu-btn').click();
      await expect(page.locator('#appMenu')).toBeVisible();
      await page.goBack();
      await expect(page.locator('#appMenu')).toBeHidden();
      await expect(page).toHaveURL(new RegExp(`/${app.folder}/$`));
      expect(await page.evaluate(() => window.__stillHere)).toBe(true);
      // The next "back" leaves the app as usual
      await page.goBack();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('.menu-btn')).toHaveCount(0);
    });

    test('messages stay visible while the menu is open', async ({ page }) => {
      await page.goto(url);
      await page.locator('.menu-btn').click();
      await page.evaluate(() => Tools.toast('Hallo'));
      await expect(page.locator('#appMenu #toast')).toHaveText('Hallo');
      await expect(page.locator('#toast')).toBeVisible();
    });

    test('wide screens: the menu is a side panel', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop);
      await page.goto(url);
      await page.locator('.menu-btn').click();
      await expect(page.locator('#appMenu')).toBeVisible();
      await page.waitForTimeout(300); // opening animation
      const box = await page.locator('#appMenu').boundingBox();
      expect(Math.round(box.x + box.width)).toBe(VIEWPORTS.desktop.width);
      expect(Math.round(box.height)).toBe(VIEWPORTS.desktop.height);
      expect(box.width).toBeLessThanOrEqual(460);
    });

    test.describe('without JavaScript', () => {
      test.use({ javaScriptEnabled: false });
      test('help, data backup and footer stay reachable below the stage', async ({ page }) => {
        await page.setViewportSize(PHONES.portrait);
        await page.goto(url);
        await expect(page.locator('#appMenu')).toHaveCount(0);
        await page.locator('details.help').scrollIntoViewIfNeeded();
        await expect(page.locator('details.help summary')).toBeVisible();
        await expect(page.locator('footer')).toBeVisible();
      });
    });

    test.describe('English', () => {
      test.use({ locale: 'en-US' });
      test('menu in English', async ({ page }) => {
        await page.goto(url);
        const btn = page.getByRole('button', { name: 'Menu', exact: true });
        await expect(btn).toHaveAttribute('title', 'Menu');
        await btn.click();
        await expect(page.getByRole('heading', { name: 'Menu', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible();
        // Switching the language inside the menu translates the menu too
        await page.getByRole('button', { name: 'Deutsch' }).click();
        await expect(page.getByRole('heading', { name: 'Menü', exact: true })).toBeVisible();
        await expect(page.locator('.menu-btn')).toHaveAttribute('aria-label', 'Menü');
      });
    });
  });
}
