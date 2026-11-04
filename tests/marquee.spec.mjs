// Lauftext: settings, preview, full-screen display (still / scrolling / rotated), history.
import { test, expect, openMenu } from './helpers.mjs';

const show = page => page.locator('#show');
const showText = page => page.locator('#showText');
// Where the displayed text is on screen (after rotation)
// Opens the display and waits until the full screen request is settled (it runs asynchronously)
async function openShow(page) {
  await page.click('#btnShow');
  await expect(show(page)).toBeVisible();
  await expect(show(page)).not.toHaveAttribute('data-fs', 'pending');
}
// Closing goes back over the display's history entry and leaves full screen (both asynchronous)
async function settled(page) {
  await expect(show(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => !(history.state && history.state.marqueeShow) && !document.fullscreenElement)).toBe(true);
}
const box = page => showText(page).evaluate(e => { const r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }; });

test.beforeEach(async ({ page }) => { await page.goto('/marquee/'); });

test('settings are kept and shown in the preview', async ({ page }) => {
  await page.fill('#text', 'Gate B12');
  await expect(page.locator('#count')).toHaveText('8 / 500 Zeichen');
  await page.locator('#fonts [data-f="serif"]').click();
  await page.locator('#swatches [data-c="onblue"]').click();
  await page.locator('#motions [data-m="none"]').click();
  await page.locator('#size').fill('40');
  await page.locator('#bold').uncheck();
  await expect(page.locator('#sizeOut')).toHaveText('40 %');
  await expect(page.locator('#speed')).toBeDisabled();
  const prev = page.locator('#preview .sign-text');
  await expect(prev).toHaveText('Gate B12');
  await expect(prev).toHaveCSS('color', 'rgb(255, 255, 255)');
  await expect(prev).toHaveCSS('font-weight', '400');
  await expect(page.locator('#preview')).toHaveCSS('background-color', 'rgb(21, 101, 192)');
  await expect(page.locator('#fg')).toHaveValue('#ffffff');
  await expect(page.locator('#bg')).toHaveValue('#1565c0');

  await page.reload();
  await expect(page.locator('#text')).toHaveValue('Gate B12');
  await expect(page.locator('#fonts [data-f="serif"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#swatches [data-c="onblue"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#motions [data-m="none"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#size')).toHaveValue('40');
  await expect(page.locator('#bold')).not.toBeChecked();
  // Preview: 40 % of its height
  const [h, fs] = await page.locator('#preview').evaluate(p => [p.clientHeight, parseFloat(p.querySelector('.sign-text').style.fontSize)]);
  expect(fs).toBeCloseTo(h * 0.4, 0);
});

test('empty text shows the sample text', async ({ page }) => {
  await expect(page.locator('#preview .sign-text')).toHaveText('Hallo!');
});

test.describe('landscape screen', () => {
  test.use({ viewport: { width: 800, height: 400 } });

  test('scrolling text runs from right to left in one line at the chosen size, tap ends it', async ({ page }) => {
    await page.fill('#text', 'Hallo\nWelt');
    await page.locator('#speed').fill('10');
    await page.click('#btnShow');
    await expect(show(page)).toBeVisible();
    await expect(show(page)).not.toHaveClass(/rot/);
    await expect(showText(page)).toHaveText('Hallo   Welt');
    await expect(show(page)).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(showText(page)).toHaveCSS('color', 'rgb(255, 234, 0)');
    // 60 % of 400 px
    expect(parseFloat(await showText(page).getAttribute('data-font-size'))).toBeCloseTo(240, 0);
    const a = (await box(page)).left;
    await page.waitForTimeout(300);
    const b = (await box(page)).left;
    expect(b).toBeLessThan(a - 20);
    // Text is one line: its height is about one line
    const r = await box(page);
    expect(r.bottom - r.top).toBeLessThan(240 * 1.3);
    await show(page).click();
    await expect(show(page)).toBeHidden();
    await expect(page.locator('#btnShow')).toBeFocused();
  });

  test('scrolling to the right moves the other way', async ({ page }) => {
    await page.locator('#motions [data-m="right"]').click();
    await page.click('#btnShow');
    const a = (await box(page)).left;
    await page.waitForTimeout(300);
    expect((await box(page)).left).toBeGreaterThan(a + 10);
  });

  test('still text is shrunk to fit the screen, Escape and back end it', async ({ page }) => {
    await page.locator('#motions [data-m="none"]').click();
    await page.locator('#size').fill('100');
    await page.fill('#text', 'Herzlich willkommen zuhause, liebe Oma und lieber Opa!');
    await page.click('#btnShow');
    await expect(show(page)).toBeVisible();
    const r = await box(page);
    expect(r.left).toBeGreaterThanOrEqual(0);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.right).toBeLessThanOrEqual(800);
    expect(r.bottom).toBeLessThanOrEqual(400);
    const fs = parseFloat(await showText(page).getAttribute('data-font-size'));
    expect(fs).toBeLessThan(400);
    expect(fs).toBeGreaterThan(40);
    await page.keyboard.press('Escape');
    await settled(page);

    await openShow(page);
    await page.goBack();
    await expect(show(page)).toBeHidden();
    await expect(page).toHaveURL(/\/marquee\/$/);
  });

  test('closing and opening again right away keeps the new display open', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.click('#btnShow');
      await page.keyboard.press('Escape');
      await page.click('#btnShow');
      await page.waitForTimeout(400);
      await expect(show(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await settled(page);
    }
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('blinking', async ({ page }) => {
    await page.locator('#blink').check();
    await page.click('#btnShow');
    await expect(page.locator('#frame')).toHaveClass(/blink/);
    await expect(showText(page)).toHaveCSS('animation-name', 'blink');
  });
});

test.describe('upright phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('text is turned sideways, unless switched off', async ({ page }) => {
    await page.locator('#motions [data-m="none"]').click();
    await page.fill('#text', 'Taxi');
    await page.click('#btnShow');
    await expect(show(page)).toHaveClass(/rot/);
    // Rotated: the word runs along the long side
    let r = await box(page);
    expect(r.bottom - r.top).toBeGreaterThan(r.right - r.left);
    expect(r.top).toBeGreaterThanOrEqual(0);
    expect(r.bottom).toBeLessThanOrEqual(844);
    await page.keyboard.press('Escape');
    await settled(page);

    await page.locator('#rotate').uncheck();
    await page.click('#btnShow');
    await expect(show(page)).not.toHaveClass(/rot/);
    r = await box(page);
    expect(r.right - r.left).toBeGreaterThan(r.bottom - r.top);
    expect(r.right).toBeLessThanOrEqual(390);
  });
});

test('history in the menu: newest first, no duplicates, reuse and clear', async ({ page }) => {
  for (const x of ['Eins', 'Zwei', 'Eins']) {
    await page.fill('#text', x);
    await openShow(page);
    await page.keyboard.press('Escape');
    await settled(page);
  }
  await openMenu(page);
  await expect(page.locator('#hist button')).toHaveText(['Eins', 'Zwei']);
  await page.locator('#hist button', { hasText: 'Zwei' }).click();
  await expect(page.locator('#appMenu')).toBeHidden();
  await expect(page.locator('#text')).toHaveValue('Zwei');
  await page.reload();
  await openMenu(page);
  await expect(page.locator('#hist button')).toHaveText(['Eins', 'Zwei']);
  page.once('dialog', d => d.accept());
  await page.click('#btnHistClear');
  await expect(page.locator('#hist button')).toHaveCount(0);
  await expect(page.locator('#histEmpty')).toBeVisible();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('labels and sample text', async ({ page }) => {
    await expect(page.locator('#btnShow')).toHaveText('Show it big');
    await expect(page.locator('#preview .sign-text')).toHaveText('Hello!');
    await page.fill('#text', 'abc');
    await expect(page.locator('#count')).toHaveText('3 / 500 characters');
    await page.click('#btnShow');
    await expect(page.locator('#showHint')).toHaveText('Tap to stop');
  });
});
