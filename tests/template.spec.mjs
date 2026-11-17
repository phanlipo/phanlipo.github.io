// Vorlage (template/): Startpunkt für die fachlichen Tests einer neuen App – beim Kopieren nach
// tests/<tool-name>.spec.mjs mitnehmen und anpassen. Allgemeine Prüfungen (CSP, offline, Menü, a11y,
// Sicherung, WebMCP-Liste …) laufen ohnehin für jede App.
import { test, expect, openMenu, onDialog, switchLang } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await page.goto('/template/'); });

test('counter, choice and option are saved and survive a reload', async ({ page }) => {
  await expect(page.locator('#empty')).toBeVisible();
  await page.click('#btnDemo');
  await page.click('#btnDemo');
  await expect(page.locator('#count')).toHaveText('Geklickt: 2×');
  await expect(page.locator('#empty')).toBeHidden();
  await page.locator('#kind [data-kind="b"]').click();
  await page.check('#optVibrate');
  await page.reload();
  await expect(page.locator('#count')).toHaveText('Geklickt: 2×');
  await expect(page.locator('#kind [data-kind="b"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#kind [data-kind="a"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#optVibrate')).toBeChecked();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('new-tool.settings.v1'))))
    .toEqual({ count: 2, kind: 'b', vibrate: true });
});

test('reset in the menu asks first; cancel keeps the counter', async ({ page }) => {
  await page.click('#btnDemo');
  await onDialog(page, d => d.dismiss(), { once: true });
  await openMenu(page);
  await page.click('#btnReset');
  await expect(page.locator('#count')).toHaveText('Geklickt: 1×');
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnReset');
  await expect(page.locator('#empty')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('new-tool.settings.v1')).count)).toBe(0);
});

test('switching the language re-renders texts written by the script', async ({ page }) => {
  await page.click('#btnDemo');
  await switchLang(page, 'en');
  await expect(page.locator('#count')).toHaveText('Clicked: 1×');
  await expect(page.locator('#btnDemo')).toHaveText('Example');
});
