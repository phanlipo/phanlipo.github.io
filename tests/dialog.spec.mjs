// Questions in the app's own look (common.js: Tools.confirm, Tools.prompt, Tools.undo; base.css: dialog.dialog)
import { test, expect, VIEWPORTS, manualDialogs, onDialog, axe, openMenu } from './helpers.mjs';

const ask = page => page.locator('dialog.tools-ask');

test.describe('Tools.confirm / Tools.prompt', () => {
  test.beforeEach(async ({ page }) => {
    await manualDialogs(page);
    await page.goto('/template/');
  });

  test('confirm: names the action, red for delete, OK → true, Cancel and Escape → false', async ({ page }) => {
    let answer = page.evaluate(() => Tools.confirm('Zettel „Einkauf“ löschen?', { action: 'delete' }));
    await expect(ask(page)).toBeVisible();
    await expect(ask(page).locator('.ask-text')).toHaveText('Zettel „Einkauf“ löschen?');
    const yes = ask(page).getByRole('button', { name: 'Löschen' });
    await expect(yes).toHaveClass(/danger/);
    await expect(ask(page).getByRole('button', { name: 'Abbrechen' })).toBeFocused(); // dangerous: focus on cancel
    await yes.click();
    expect(await answer).toBe(true);
    await expect(ask(page)).toHaveCount(0);

    answer = page.evaluate(() => Tools.confirm('Weiter?'));
    await ask(page).getByRole('button', { name: 'Abbrechen' }).click();
    expect(await answer).toBe(false);

    answer = page.evaluate(() => Tools.confirm('Weiter?', { ok: 'Ja, weiter', cancel: 'Nein' }));
    await expect(ask(page).getByRole('button', { name: 'Ja, weiter' })).toBeFocused();
    await expect(ask(page).getByRole('button', { name: 'Ja, weiter' })).not.toHaveClass(/danger/);
    await page.keyboard.press('Escape');
    expect(await answer).toBe(false);
  });

  test('prompt: shows the value, Enter → the text, Cancel → null', async ({ page }) => {
    let answer = page.evaluate(() => Tools.prompt('Adresse des Links', { value: 'https://' }));
    const input = ask(page).getByRole('textbox', { name: 'Adresse des Links' });
    await expect(input).toHaveValue('https://');
    await input.fill('https://example.org');
    await input.press('Enter');
    expect(await answer).toBe('https://example.org');

    answer = page.evaluate(() => Tools.prompt('Name'));
    await ask(page).getByRole('button', { name: 'Abbrechen' }).click();
    expect(await answer).toBe(null);
  });

  test('bottom sheet on phones, a window on wide screens; multi-line text; accessible', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    let answer = page.evaluate(() => Tools.confirm('Alle Daten löschen?\nTipp: vorher sichern.', { action: 'delete' }));
    await expect(ask(page)).toBeVisible();
    const vh = page.viewportSize().height;
    let box = await ask(page).boundingBox();
    expect(Math.round(box.width)).toBe(375);
    expect(Math.round(box.y + box.height)).toBe(vh);
    for (const b of await ask(page).getByRole('button').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await ask(page).locator('.ask-text').evaluate(el => el.getClientRects().length && getComputedStyle(el).whiteSpace)).toBe('pre-line');
    expect((await axe(page).include('dialog.tools-ask').analyze()).violations).toEqual([]);
    await page.keyboard.press('Escape');
    expect(await answer).toBe(false);

    await page.setViewportSize({ width: 1024, height: 700 });
    answer = page.evaluate(() => Tools.confirm('Weiter?'));
    await expect(ask(page)).toBeVisible();
    box = await ask(page).boundingBox();
    expect(box.width).toBeLessThanOrEqual(481);
    expect(box.y).toBeGreaterThan(50);
    await page.keyboard.press('Escape');
    expect(await answer).toBe(false);
  });

  test('a question opened from the menu lies above the menu', async ({ page }) => {
    await openMenu(page);
    const answer = page.evaluate(() => Tools.confirm('Weiter?'));
    await ask(page).getByRole('button', { name: 'OK' }).click();
    expect(await answer).toBe(true);
    await expect(page.locator('#appMenu')).toBeVisible();
  });
});

test.describe('own dialogs (dialog.dialog)', () => {
  test('a long dialog scrolls its body and squeezes nothing, also parts that hide their overflow', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/template/');
    const heights = await page.evaluate(async () => {
      const d = document.createElement('dialog');
      d.className = 'dialog';
      const fields = Array.from({ length: 12 }, (_, i) => `<div class="form-field"><label for="f${i}">Feld ${i}</label><span class="input-unit"><input type="text" id="f${i}"><span class="unit">€</span></span></div>`).join('');
      d.innerHTML = `<div class="dialog-head"><h2>Lang</h2></div><div class="dialog-body"><div class="seg" id="seg"><button type="button" aria-pressed="true">A</button><button type="button" aria-pressed="false">B</button></div>${fields}</div><div class="dialog-actions"><button type="button" class="btn">OK</button></div>`;
      document.body.append(d);
      d.showModal();
      await new Promise(r => requestAnimationFrame(r));
      const body = d.querySelector('.dialog-body');
      return { seg: d.querySelector('#seg').getBoundingClientRect().height, unit: d.querySelector('.input-unit').getBoundingClientRect().height,
        scrolls: body.scrollHeight > body.clientHeight, dialog: d.getBoundingClientRect().height, screen: innerHeight };
    });
    expect(heights.scrolls).toBe(true);
    expect(heights.dialog).toBeLessThanOrEqual(heights.screen);
    expect(heights.seg).toBeGreaterThanOrEqual(44);
    expect(heights.unit).toBeGreaterThanOrEqual(44);
  });
});

test.describe('Tools.undo', () => {
  test('the note carries an undo button that runs once', async ({ page }) => {
    await page.goto('/template/');
    await page.evaluate(() => { window.undone = 0; Tools.undo('Zettel gelöscht', () => { window.undone++; }); });
    const btn = page.locator('#toast').getByRole('button', { name: 'Rückgängig' });
    await expect(page.locator('#toast')).toContainText('Zettel gelöscht');
    expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(40);
    await btn.click();
    expect(await page.evaluate(() => window.undone)).toBe(1);
    await expect(page.locator('#toast')).not.toHaveClass(/show/);
    // A plain note afterwards has no button
    await page.evaluate(() => Tools.toast('Gespeichert'));
    await expect(page.locator('#toast')).toHaveText('Gespeichert');
    await expect(page.locator('#toast button')).toHaveCount(0);
  });
});

test.describe('test helper onDialog', () => {
  test('answers like page.on("dialog"): message, accept with text, once', async ({ page }) => {
    await page.goto('/template/');
    const seen = [];
    await onDialog(page, d => { seen.push(`${d.type()}: ${d.message()}`); d.accept('Ada'); }, { once: true });
    expect(await page.evaluate(() => Tools.prompt('Name?', { value: 'x' }))).toBe('Ada');
    // Without a handler questions are dismissed (as Playwright does with browser dialogs)
    expect(await page.evaluate(() => Tools.confirm('Noch einmal?'))).toBe(false);
    expect(seen).toEqual(['prompt: Name?']);
  });
});
