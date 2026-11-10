// Cast demo: picture animates, music, the dialog for screen casting per platform (Android link to the cast
// settings with a hint when it does not open), TV mode (full screen, landscape, screen kept on, bar that
// hides and comes back, exit by button and back gesture), settings persist, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// Record rotation lock and wake lock instead of the real APIs (not available headless)
async function mockDevice(page, { lockOk = true } = {}) {
  await page.addInitScript(lockOk => {
    window.__dev = { locks: [], unlocks: 0, wake: 0, released: 0 };
    if (screen.orientation) {
      screen.orientation.lock = t => { __dev.locks.push(t); return lockOk ? Promise.resolve() : Promise.reject(new DOMException('not supported', 'NotSupportedError')); };
      screen.orientation.unlock = () => { __dev.unlocks++; };
    }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      __dev.wake++;
      const s = new EventTarget(); s.release = async () => { __dev.released++; s.dispatchEvent(new Event('release')); };
      return s;
    } } });
  }, lockOk);
}

const sample = page => page.evaluate(() => {
  const d = document.getElementById('view').getContext('2d').getImageData(0, 0, 1280, 720).data;
  let s = 0; for (let i = 0; i < d.length; i += 4001) s += d[i];
  return s;
});

test('the picture is live, music toggles both buttons, scene and settings persist', async ({ page }) => {
  await page.goto('/cast-demo/');
  const a = await sample(page);
  await page.waitForTimeout(300);
  expect(await sample(page)).not.toBe(a);
  await page.locator('.controls [data-music]').click();
  await expect(page.locator('.controls [data-music]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.controls [data-music]')).toHaveText('Musik aus');
  await expect(page.locator('#tvBar [data-music]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => Tools.diag.text())).toContain('music: true');
  await page.locator('.scenes').getByRole('button', { name: 'Balken' }).click();
  await openMenu(page);
  await page.locator('#optClock').uncheck();
  await page.locator('#optAutoMusic').uncheck();
  await closeMenu(page);
  await page.reload();
  await expect(page.locator('.scenes').getByRole('button', { name: 'Balken' })).toHaveAttribute('aria-pressed', 'true');
  await openMenu(page);
  await expect(page.locator('#optClock')).not.toBeChecked();
  await expect(page.locator('#optAutoMusic')).not.toBeChecked();
});

test.describe('Android phone', () => {
  test.use({ userAgent: ANDROID, viewport: { width: 390, height: 800 }, hasTouch: true });

  test('dialog shows how to cast, the link opens the cast settings, hint if it did not', async ({ page }) => {
    await page.goto('/cast-demo/');
    await expect(page.locator('#status')).toContainText('Bildschirmübertragung');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    const dlg = page.getByRole('dialog', { name: 'Auf Fernseher zeigen' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText('Smart View').first()).toBeVisible();
    await expect(dlg.locator('[data-platform="desktop"]')).toBeHidden();
    const link = dlg.getByRole('link', { name: 'Übertragung in den Einstellungen öffnen' });
    await expect(link).toHaveAttribute('href', 'intent:#Intent;action=android.settings.CAST_SETTINGS;end');
    // Chrome did not open the settings (page stays visible) → hint after 2.5 s
    await link.evaluate(a => a.addEventListener('click', e => e.preventDefault()));
    await link.click();
    await expect(dlg.locator('#castFail')).toBeHidden();
    await expect(dlg.locator('#castFail')).toBeVisible({ timeout: 4000 });
    await dlg.getByRole('button', { name: 'Schließen' }).click();
    await expect(dlg).toBeHidden();
  });

  test('TV mode: full screen, landscape, screen on, music, bar hides and returns, exit', async ({ page }) => {
    await mockDevice(page);
    await page.goto('/cast-demo/');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    await page.getByRole('button', { name: 'Vollbild starten' }).click();
    await expect(page.locator('#screen')).toHaveClass(/\btv\b/);
    expect(await page.evaluate(() => document.fullscreenElement && document.fullscreenElement.id)).toBe('screen');
    expect(await page.evaluate(() => [__dev.locks, __dev.wake])).toEqual([['landscape'], 1]);
    await expect(page.locator('#tvBar [data-music]')).toHaveAttribute('aria-pressed', 'true');   // music started with it
    // The bar fades after 3 s, a tap on the picture brings it back
    await expect(page.locator('#tvBar')).toBeVisible();
    await expect(page.locator('#screen')).toHaveClass(/bar-hidden/, { timeout: 5000 });
    await page.locator('#view').click();
    await expect(page.locator('#screen')).not.toHaveClass(/bar-hidden/);
    await page.locator('#tvBar').getByRole('button', { name: 'Sterne' }).click();
    await expect(page.locator('.scenes').getByRole('button', { name: 'Sterne' })).toHaveAttribute('aria-pressed', 'true');
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('tv on');
    expect(diag).toContain('"landscape":true');
    await page.locator('#tvBar').getByRole('button', { name: 'Vollbild beenden' }).click();
    await expect(page.locator('#screen')).not.toHaveClass(/\btv\b/);
    expect(await page.evaluate(() => [!!document.fullscreenElement, __dev.unlocks, __dev.released])).toEqual([false, 1, 1]);
  });

  test('back gesture (full screen ended by the browser) leaves TV mode', async ({ page }) => {
    await mockDevice(page);
    await page.goto('/cast-demo/');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    await page.getByRole('button', { name: 'Vollbild starten' }).click();
    await expect(page.locator('#screen')).toHaveClass(/\btv\b/);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#screen')).not.toHaveClass(/\btv\b/);
    expect(await page.evaluate(() => __dev.released)).toBe(1);
  });

  test('no rotation lock: hint to turn the phone, TV mode still works', async ({ page }) => {
    await mockDevice(page, { lockOk: false });
    await page.goto('/cast-demo/');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    await page.getByRole('button', { name: 'Vollbild starten' }).click();
    await expect(page.locator('.toast')).toContainText('Handy bitte drehen');
    await expect(page.locator('#screen')).toHaveClass(/\btv\b/);
  });
});

test('computer: dialog explains "Cast tab"', async ({ page }) => {
  await page.goto('/cast-demo/');
  await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Tab streamen')).toBeVisible();
  await expect(dlg.locator('[data-platform="android"]')).toBeHidden();
});

test.describe('English', () => {
  test.use({ locale: 'en-US', userAgent: ANDROID });
  test('texts in English', async ({ page }) => {
    await page.goto('/cast-demo/');
    await expect(page.locator('#status')).toContainText('screen casting');
    await page.getByRole('button', { name: 'Show on TV' }).click();
    await expect(page.getByRole('dialog', { name: 'Show on TV' }).getByText('Cast my screen')).toBeVisible();
  });
});
