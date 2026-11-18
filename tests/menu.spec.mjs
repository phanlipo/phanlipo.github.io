// App menu (☰, every app) and stage layout (<body class="stage">), see AGENTS.md "Layout: Karten oder Bühne".
// Every app: settings/history marked data-menu, data backup, help and footer are in the menu, which "back" closes.
// Stage apps additionally fill the screen, the page does not scroll.
import { test, expect, apps, stageApps, VIEWPORTS, expectNoHorizontalScroll, animationsDone, openSettings, switchTheme, closeMenu } from './helpers.mjs';

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
  });
}

for (const app of apps()) {
  test.describe(`${app.folder} · menu`, () => {
    const url = `/${app.folder}/`;

    test('menu button at the right of the header, fits at 375 px', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(url);
      const btn = page.locator('body > header .menu-btn');
      await expect(btn).toBeVisible();
      const b = await btn.boundingBox();
      expect(b.width).toBeGreaterThanOrEqual(44);
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x + b.width).toBeLessThanOrEqual(375);
      expect(b.x + b.width, 'right edge of the header').toBeGreaterThan(375 - 24);
      // Nothing in the header lies under the button
      const overlap = await page.evaluate(() => {
        const r = document.querySelector('.menu-btn').getBoundingClientRect();
        return [...document.querySelectorAll('body > header > :not(.stage-actions)')].some(el => {
          const e = el.getBoundingClientRect();
          return e.width && e.height && e.right > r.left + 1 && e.left < r.right - 1 && e.bottom > r.top + 1 && e.top < r.bottom - 1;
        });
      });
      expect(overlap).toBe(false);
      await expectNoHorizontalScroll(page);
    });

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
      // Standard sections: one list of rows, each with its icon (UI-KONZEPT.md)
      const rows = page.locator('#appMenu .menu-group > details > summary');
      expect(await rows.count()).toBeGreaterThanOrEqual(2);
      for (const r of await rows.all()) await expect(r.locator('.menu-ico svg.ic use')).toHaveCount(1);

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

    test('settings: one place with language and appearance', async ({ page }) => {
      await page.setViewportSize(PHONES.portrait);
      await page.goto(url);
      // At most one settings section of the app; the shared block sits in it or in the sub page "Settings"
      expect(await page.locator('[data-menu][data-icon="settings"]').count()).toBeLessThanOrEqual(1);
      await expect(page.locator('#menuTheme')).toHaveCount(1);
      await expect(page.locator('#menuLang')).toHaveCount(1);
      expect(await page.locator('#menuTheme').evaluate(el => !!el.closest('#appMenu [data-menu][data-icon="settings"], #appMenu #menuSettings'))).toBe(true);
      if (await page.locator('[data-menu][data-icon="settings"]').count()) await expect(page.locator('#menuSettings')).toHaveCount(0);
      await expect(page.locator('footer [data-set-lang], footer [data-set-theme]')).toHaveCount(0);
      await openSettings(page);
      for (const v of ['light', 'dark', 'system']) await expect(page.locator(`#menuTheme [data-set-theme="${v}"]`)).toBeVisible();
      await expect(page.locator('#menuTheme [data-set-theme="system"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#menuLang [data-set-lang="de"]')).toBeVisible();
      await expectNoHorizontalScroll(page);
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
      await expect(page.locator('.tool').first()).toBeVisible();
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
      await animationsDone(page.locator('#appMenu')); // opening animation
      const box = await page.locator('#appMenu').boundingBox();
      expect(Math.round(box.x + box.width)).toBe(VIEWPORTS.desktop.width);
      expect(Math.round(box.height)).toBe(VIEWPORTS.desktop.height);
      expect(box.width).toBeLessThanOrEqual(460);
    });

    test('phones: the menu is a bottom sheet with its content visible', async ({ page }) => {
      await page.setViewportSize(PHONES.portrait);
      await page.goto(url);
      await page.locator('.menu-btn').click();
      await expect(page.locator('#appMenu')).toBeVisible();
      await animationsDone(page.locator('#appMenu')); // opening animation
      const m = await page.evaluate(() => {
        const sheet = document.querySelector('#appMenu'), body = sheet.querySelector('.menu-body');
        const r = sheet.getBoundingClientRect();
        return { bottom: r.bottom, height: r.height, inner: innerHeight, body: body.clientHeight,
          content: body.scrollHeight, basis: getComputedStyle(body).flexBasis };
      });
      // Safari (iOS ≤ 16) shrinks a flex-basis of 0 to nothing (iPhone 8: only the menu title was left)
      expect(m.basis).toBe('auto');
      expect(Math.round(m.bottom)).toBe(m.inner);
      // As tall as its content, up to 88 % of the screen; the rest scrolls
      expect(m.height).toBeLessThanOrEqual(m.inner * 0.88 + 1);
      expect(m.body).toBeGreaterThanOrEqual(Math.min(m.content, m.inner * 0.88 - 60) - 1);
    });

    test.describe('without JavaScript', () => {
      test.use({ javaScriptEnabled: false });
      test('help, data backup and footer stay reachable at the end of the page', async ({ page }) => {
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
        // Switching the language inside the menu (Settings) translates the menu too
        await openSettings(page);
        await page.getByRole('button', { name: 'Deutsch' }).click();
        await expect(page.getByRole('heading', { name: 'Menü', exact: true })).toBeVisible();
        await expect(page.locator('.menu-btn')).toHaveAttribute('aria-label', 'Menü');
      });
    });
  });
}

// Sub pages of the menu (UI-KONZEPT.md, "Unterseiten"): a row with › opens a page that fills the sheet;
// its summary is the back row, "back" and Escape return to the list first, ✕ closes everything.
test.describe('menu sub pages', () => {
  const url = '/dice-coin/';
  const isOpen = (page, sel) => page.locator(sel).evaluate(d => d.open);
  const states = page => page.evaluate(() => ({ menu: !!(history.state && history.state.toolsMenu), page: !!(history.state && history.state.toolsMenuPage) }));

  test('open, back row, back gesture, Escape and ✕', async ({ page }) => {
    await page.setViewportSize(PHONES.portrait);
    await page.goto(url);
    await page.locator('.menu-btn').click();
    const data = page.locator('#appMenu details.data'), help = page.locator('#appMenu details.help');
    // Row → page, covering the list below the menu head
    await data.locator('summary').click();
    expect(await isOpen(page, '#appMenu details.data')).toBe(true);
    const [d, b] = [await data.boundingBox(), await page.locator('#appMenu .menu-body').boundingBox()];
    expect(Math.abs(d.y - b.y) + Math.abs(d.height - b.height)).toBeLessThanOrEqual(2);
    await expect(page.locator('[data-data="export"]')).toBeVisible();
    expect(await states(page)).toEqual({ menu: true, page: true });
    // Back row: list again, menu stays open, the page's history entry is gone
    await data.locator('summary').click();
    expect(await isOpen(page, '#appMenu details.data')).toBe(false);
    await expect(page.locator('#appMenu')).toBeVisible();
    await expect.poll(() => states(page)).toEqual({ menu: true, page: false });
    // Back gesture: first the page, then the menu
    await help.locator('summary').click();
    await expect.poll(() => states(page)).toEqual({ menu: true, page: true });
    await page.goBack();
    await expect.poll(() => isOpen(page, '#appMenu details.help')).toBe(false);
    await expect(page.locator('#appMenu')).toBeVisible();
    await page.goBack();
    await expect(page.locator('#appMenu')).toBeHidden();
    // Escape: first the page, then the menu
    await page.locator('.menu-btn').click();
    await data.locator('summary').click();
    await page.keyboard.press('Escape');
    await expect.poll(() => isOpen(page, '#appMenu details.data')).toBe(false);
    await expect(page.locator('#appMenu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#appMenu')).toBeHidden();
    // ✕ on a page closes the whole menu and leaves no history entry behind
    await page.locator('.menu-btn').click();
    await help.locator('summary').click();
    await page.getByRole('button', { name: 'Menü schließen' }).click();
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect.poll(() => states(page)).toEqual({ menu: false, page: false });
    // Opened again: the list, not the last page
    await page.locator('.menu-btn').click();
    expect(await isOpen(page, '#appMenu details.help')).toBe(false);
    await expect(page.locator('#appMenu .menu-group')).toBeVisible();
  });

  test('only one page at a time; Tools.menu.open(id) opens a page directly', async ({ page }) => {
    await page.goto(url);
    await page.evaluate(() => Tools.menu.open('menuInstall'));
    await expect.poll(() => isOpen(page, '#menuInstall')).toBe(true);
    await expect(page.locator('#menuInstallInfo')).toBeVisible();
    await page.evaluate(() => { document.querySelector('#appMenu details.help').open = true; });
    await expect.poll(() => isOpen(page, '#menuInstall')).toBe(false);
    await page.goBack();
    await expect.poll(() => isOpen(page, '#appMenu details.help')).toBe(false);
    await expect(page.locator('#appMenu')).toBeVisible();
  });
});

test.describe('appearance: light, dark, system', () => {
  const bg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const LIGHT = 'rgb(244, 246, 249)', DARK = 'rgb(17, 22, 29)';

  for (const url of ['/dice-coin/', '/code-runner/']) {
    test(`${url}: choice wins over the system, is shared and survives a reload`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' });
      await page.goto(url);
      expect(await bg(page)).toBe(LIGHT);
      await switchTheme(page, 'dark');
      expect(await bg(page)).toBe(DARK);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
      expect(await page.evaluate(() => [Tools.theme.get(), Tools.theme.dark(), localStorage.getItem('tools.theme.v1')])).toEqual(['dark', true, '"dark"']);
      // Page styles too (rules of the page's own <style>, not only base.css)
      const pageRules = await page.evaluate(() => [...document.styleSheets].filter(s => !s.href).flatMap(s => [...s.cssRules])
        .filter(r => r.media && /prefers-color-scheme/.test(r.media.mediaText)).length);
      expect(pageRules).toBe(0);
      await page.reload();
      expect(await bg(page)).toBe(DARK);
      // Light on a dark system
      await page.emulateMedia({ colorScheme: 'dark' });
      await switchTheme(page, 'light');
      expect(await bg(page)).toBe(LIGHT);
      // Another app of the domain takes the choice along
      await page.goto('/raffle/');
      expect(await bg(page)).toBe(LIGHT);
      // System: follows the system again, also when it changes
      await switchTheme(page, 'system');
      expect(await bg(page)).toBe(DARK);
      expect(await page.evaluate(() => localStorage.getItem('tools.theme.v1'))).toBeNull();
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
      await page.emulateMedia({ colorScheme: 'light' });
      await expect.poll(() => bg(page)).toBe(LIGHT);
    });
  }

  test('Tools.theme.onChange reports the switch; the English menu is translated', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/dice-coin/');
    await page.evaluate(() => { window.__themes = []; Tools.theme.onChange(v => window.__themes.push(v)); });
    await switchTheme(page, 'dark');
    await switchTheme(page, 'system');
    expect(await page.evaluate(() => window.__themes)).toEqual(['dark', 'light']);
    await openSettings(page);
    await page.locator('#appMenu [data-set-lang="en"]').click();
    await expect(page.locator('#menuSettings > summary')).toContainText('Settings');
    await expect(page.locator('#menuTheme legend')).toHaveText('Appearance');
    await expect(page.locator('#menuTheme [data-set-theme="dark"]')).toHaveText('Dark');
    await closeMenu(page);
  });

  test('start page: the same menu with settings, install and footer', async ({ page }) => {
    await page.setViewportSize(PHONES.portrait);
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    const btn = page.locator('body > header .menu-btn');
    await expect(btn).toBeVisible();
    // Next to the title, inside the screen
    const [b, h] = [await btn.boundingBox(), await page.locator('header h1').boundingBox()];
    expect(b.x + b.width).toBeLessThanOrEqual(375);
    expect(Math.abs((b.y + b.height / 2) - (h.y + h.height / 2))).toBeLessThanOrEqual(8);
    await openSettings(page);
    await expect(page.locator('#appMenu > .menu-body > footer')).toBeAttached();
    await expect(page.locator('#menuInstall')).toBeAttached();
    await page.getByRole('button', { name: 'Dunkel' }).click();
    expect(await bg(page)).toBe(DARK);
    await expect(page.getByRole('button', { name: 'Dunkel' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.locator('#menuSettings > summary')).toContainText('Settings');
    await page.getByRole('button', { name: 'System' }).click();
    expect(await bg(page)).toBe(LIGHT);
    await closeMenu(page);
    await expectNoHorizontalScroll(page);
  });
});

// Chrome on Android sometimes keeps a too large 100dvh after reloading the installed app (the navigation bar
// counts); common.js then takes the real window height so the bottom bar of a stage app stays on screen
test('stage: the real window height wins over a too large 100dvh (bottom bar stays visible)', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 780 });
  await page.goto('/paint/');
  await page.evaluate(() => {
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 700 });
    window.dispatchEvent(new Event('resize'));
  });
  await expect.poll(() => page.evaluate(() => document.body.getBoundingClientRect().height)).toBe(700);
  const bar = await page.locator('#tools').boundingBox();
  expect(bar.y + bar.height).toBeLessThanOrEqual(700);
  // Back to normal: the variable goes away again
  await page.evaluate(() => { delete window.innerHeight; window.dispatchEvent(new Event('resize')); });
  await expect.poll(() => page.evaluate(() => document.body.style.getPropertyValue('--app-h'))).toBe('');
});
