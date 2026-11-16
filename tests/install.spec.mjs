// "Install as app": the last row of the menu's standard list, a sub page (every app), see Tools.menu in common.js.
// Chrome's own banner depends on its engagement rules – the menu offers installing at any time.
import { test, expect, apps, openMenu } from './helpers.mjs';

const fakePrompt = page => page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { window.__installPrompt = (window.__installPrompt || 0) + 1; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});

for (const app of apps()) {
  test(`${app.folder} · menu offers installing, with Chrome’s prompt when offered`, async ({ page }) => {
    await page.goto(`/${app.folder}/`);
    await openMenu(page);
    const box = page.locator('#appMenu .menu-body > .menu-group > #menuInstall');
    await expect(box).toBeVisible();
    // Last row of the standard list (after data backup and help), opens as a sub page
    expect(await page.evaluate(() => document.querySelector('#appMenu .menu-group').lastElementChild.id)).toBe('menuInstall');
    await box.locator('summary').click();
    await expect(box.locator('summary')).toHaveText('Als App installieren');
    await expect(box).toHaveAttribute('open', '');
    // Without Chrome's prompt: the menu path of the browser
    await expect(box.getByRole('button', { name: 'App installieren' })).toBeHidden();
    await expect(box.locator('#menuInstallInfo')).toContainText('„App installieren“');

    // Chrome offers installing: its own banner stays allowed (reminders suppresses it on purpose and shows its
    // own install box), the button opens the prompt
    expect(await fakePrompt(page)).toBe(app.folder === 'reminders');
    const btn = box.getByRole('button', { name: 'App installieren' });
    await expect(btn).toBeVisible();
    await expect(box.locator('#menuInstallInfo')).toHaveText('');
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await btn.click();
    await expect(box.locator('#menuInstallInfo')).toHaveText('Installiert – die App jetzt vom Startbildschirm öffnen.');
    await expect(btn).toBeHidden();
    expect(await page.evaluate(() => window.__installPrompt)).toBe(1);
  });
}

test.describe('platforms', () => {
  const url = '/dice-coin/';

  test('installed app: no install box', async ({ page }) => {
    // Like an app added to the home screen on the iPhone
    await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    await page.goto(url);
    await openMenu(page);
    await expect(page.locator('#menuInstall')).toBeHidden();
  });

  test.describe('iPhone', () => {
    test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
    test('explains Share → Add to Home Screen', async ({ page }) => {
      await page.goto(url);
      await openMenu(page);
      await expect(page.locator('#menuInstallInfo')).toContainText('auf Teilen tippen → „Zum Home-Bildschirm“');
    });
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('install box in English, also after switching the language', async ({ page }) => {
      await page.goto(url);
      await openMenu(page);
      await page.locator('#menuInstall summary').click();
      await expect(page.locator('#menuInstall summary')).toHaveText('Install as an app');
      await expect(page.locator('#menuInstallInfo')).toContainText('“Install app”');
      // Back to the list (the language switch is below it)
      await page.locator('#menuInstall summary').click();
      await page.getByRole('button', { name: 'Deutsch' }).click();
      await expect(page.locator('#menuInstall summary')).toHaveText('Als App installieren');
      await expect(page.locator('#menuInstallInfo')).toContainText('„App installieren“');
    });
  });

  test('diagnosis logs the install steps', async ({ page }) => {
    await page.goto(url);
    await fakePrompt(page);
    await openMenu(page);
    await page.locator('#menuInstall summary').click();
    await page.locator('#btnAppInstall').click();
    await expect(page.locator('#btnAppInstall')).toBeHidden();
    const report = await page.evaluate(() => Tools.diag.text());
    expect(report).toContain('install: prompt available');
    expect(report).toContain('install: choice accepted');
  });
});
