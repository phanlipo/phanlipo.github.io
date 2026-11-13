// Rechenzettel: line results (engine rules), keypad, continue from the last result, copy/paste, pads in the menu,
// mirror and textarea wrap the same way, English number format.
import { test, expect, openMenu, closeMenu, clipboardText, switchLang } from './helpers.mjs';

const pad = page => page.locator('#pad');
const results = page => page.locator('#mirror .ml').evaluateAll(rows => rows.map(r => r.querySelector('.mr').textContent));
const key = (page, k) => page.locator(`#keys [data-k="${k}"]`);
const tap = async (page, ...ks) => { for (const k of ks) await key(page, k).click(); };
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('calc-pad.pads.v1')));

test.describe('German', () => {
  test.use({ locale: 'de-DE' });
  test.beforeEach(async ({ page }) => { await page.goto('/calc-pad/'); });

  test('every calculating line shows its result, text lines stay empty', async ({ page }) => {
    await pad(page).fill([
      'Einkauf: 12,50 + 3,99', // label before the colon: 16,49
      '+ 2,49', // continues: 18,98
      'Notiz am 13.11.2026', // date: text only
      '× 2', // continues past the note: 37,96
      '',
      'Brot 3,50', // single number: shown muted, counts for sum
      'Milch 1,20',
      'summe', // 4,7 (block since the empty line)
      'Miete 850 € + Strom 120 €', // words and € are skipped: 970
      'Miete = 850',
      'Miete × 12', // 10.200
      '200 + 10%', // 220
      '200 − 10%', // 180
      '200 × 10%', // 20
      '2 + 3 × 4', // 14
      '(2 + 3) × 4 = 99', // text after "=" is skipped: 20
      '2 ^ 10', // 1024
      '√16 + 1', // 5
      '1.500 + 1,5', // thousands dot: 1501,5
      'ans ÷ 3', // 500,5
      '1 ÷ 0', // undefined
      '- 2 Eier', // a list item, not a continuation: −2 muted
      '0,1 + 0,2', // 0,3 – no float noise
    ].join('\n'));
    expect(await results(page)).toEqual([
      '16,49', '18,98', '', '37,96', '', '3,5', '1,2', '4,7', '970', '850', '10.200', '220', '180', '20', '14', '20',
      '1.024', '5', '1.501,5', '500,5', 'nicht definiert', '-2', '0,3',
    ]);
    await expect(page.locator('#mirror .res.plain')).toHaveCount(3);
    await expect(page.locator('#mirror .res.err')).toHaveText('nicht definiert');
  });

  test('equations and systems of equations are solved, the solutions work below', async ({ page }) => {
    await pad(page).fill([
      '3*a = 15', // a = 15 / 3 = 5
      'a × 2', // 10
      '',
      '3*b + 2*c = 0', // b = −1 − c → 3(−1 − c) + 2c = 0 → c = −3, b = 2
      'b+c =-1',
      'b − c', // 5
      '',
      '2x + 4 = 3x - 1', // x = 5
      '3 x 4', // still multiplies: 12
      '',
      'x + y = 3', // parallel lines: no solution
      'x + y = 4',
      '',
      'p + q = 10', // one equation, two unknowns: nothing yet
      '',
      'Miete = 850', // assignment stays an assignment
      '850 Miete', // a space before a name: text, no 850 × 850
      'k^2 = 4', // quadratic: both solutions
      '0,5k = 1,5 ⇒ k = 3', // text after ⇒ is skipped: k = 3
    ].join('\n'));
    expect(await results(page)).toEqual([
      'a = 5', '10', '', 'b = 2', 'c = -3', '5', '', 'x = 5', '12', '', '', 'keine Lösung', '', '', '', '850', '', 'k = -2; 2', 'k = 3',
    ]);
    // Solutions are not part of the sum and not "ans"
    await pad(page).fill('10\n3a = 6\n+ 1\nsumme');
    expect(await results(page)).toEqual(['10', 'a = 2', '11', '21']);
    // Tap copies the number; copy the pad marks solutions with ⇒ and pastes back the same
    await pad(page).fill('3*b + 2*c = 0\nb + c = -1');
    await page.locator('#mirror .res').last().click();
    expect(await clipboardText(page)).toBe('-3');
    await page.click('#btnCopyAll');
    const all = '3*b + 2*c = 0   ⇒ b = 2\nb + c = -1   ⇒ c = -3';
    expect(await clipboardText(page)).toBe(all);
    await pad(page).fill(all);
    expect(await results(page)).toEqual(['b = 2', 'c = -3']);
  });

  test('functions, constants, derivative and integral', async ({ page }) => {
    const de = v => v.toLocaleString('de-DE', { maximumFractionDigits: 10 });
    await pad(page).fill([
      'sin 30', 'cos(60)', 'tan 45', 'tan 90', 'asin(0,5)', // degrees by default
      'e^2', 'ln(e)', 'log 1000', '√2', '2pi', '5! + 1', 'abs(-3)', 'runden(2,5)', '3²', 'ln(-1)', 'Super!',
      'ableitung(x^2; 3)', // d/dx x² = 2x → 6
      'integral(x^2; 0; 1)', // x³/3 from 0 to 1 = 1/3
      'integral(2t; 0; 3)', // t² from 0 to 3 = 9
      'integral(1/x; 1; e)', // ln e − ln 1 = 1
    ].join('\n'));
    expect(await results(page)).toEqual([
      '0,5', '0,5', '1', 'nicht definiert', '30',
      de(Math.exp(2)), '1', '3', de(Math.SQRT2), de(2 * Math.PI), '121', '3', '3', '9', 'nicht definiert', '',
      '6', de(1 / 3), '9', '1',
    ]);
    // Radians in the menu: sin(pi/2) = 1, d/dx sin x at 0 = cos 0 = 1, ∫ sin from 0 to π = 2
    await pad(page).fill('sin(pi/2)\nableitung(sin(x); 0)\nintegral(sin(x); 0; pi)\nsin 30');
    expect((await results(page))[0]).not.toBe('1');
    await openMenu(page);
    await page.getByLabel('Bogenmaß (sin(pi/6) = 0,5)').check();
    await closeMenu(page);
    expect((await results(page)).slice(0, 3)).toEqual(['1', '1', '2']);
    expect((await results(page))[3]).toBe(de(Math.sin(30)));
    await page.reload();
    expect((await results(page))[0]).toBe('1');
  });

  test('quadratic, polynomial and other equations with one unknown', async ({ page }) => {
    await pad(page).fill([
      'x^2 - 5x + 6 = 0', // (x − 2)(x − 3)
      'x² = 2', // ±√2
      'x^2 + 1 = 0', // no real solution
      '(x-1)^2 = 0', // double root, counts as value below
      'x + 1', // 2
      'x^3 = 8', // a new equation with x is solved on its own: 2
      'x^4 - 5x^2 + 4 = 0', // (x² − 1)(x² − 4): ±1, ±2
      '2^x = 10', // log2 10
      'e^x = 5', // ln 5
      'sin x = 0,5', // 30°, 150°, 390°, 510° …
      '1/x = 0', // pole, no root
      'integral(x^2; 0; a) = 9', // a³/3 = 9 → a = 3
    ].join('\n'));
    const de = v => v.toLocaleString('de-DE', { maximumFractionDigits: 10 });
    expect(await results(page)).toEqual([
      'x = 2; 3', `x = ${de(-Math.SQRT2)}; ${de(Math.SQRT2)}`, 'keine reelle Lösung', 'x = 1', '2', 'x = 2', 'x = -2; -1; 1; 2',
      // found by numeric search: 10 significant digits
      `x = ${de(Number(Math.log2(10).toPrecision(10)))}`, `x = ${de(Number(Math.log(5).toPrecision(10)))}`, 'x = 30; 150; 390; 510; …', 'keine reelle Lösung', 'a = 3',
    ]);
    // Tap copies all solutions of the line; the pad copy pastes back the same
    await page.locator('#mirror .res').first().click();
    expect(await clipboardText(page)).toBe('x = 2; 3');
    await pad(page).fill('x^2 - 5x + 6 = 0');
    await page.click('#btnCopyAll');
    expect(await clipboardText(page)).toBe('x^2 - 5x + 6 = 0   ⇒ x = 2; 3');
    await pad(page).fill(await clipboardText(page));
    expect(await results(page)).toEqual(['x = 2; 3']);
  });

  test('keypad writes into the pad without the phone keyboard and continues after a note', async ({ page }) => {
    await expect(pad(page)).toHaveAttribute('inputmode', 'none');
    await tap(page, '8', '5', '0', '+', '1', '2', '0', 'enter');
    await expect(pad(page)).toHaveValue('850 + 120\n');
    expect((await results(page))[0]).toBe('970');
    // Text with the keyboard: the button switches the input mode, the keypad goes away
    await page.click('#btnKeys');
    await expect(page.locator('#keys')).toBeHidden();
    await expect(pad(page)).toHaveAttribute('inputmode', 'text');
    await expect(pad(page)).toBeFocused();
    await page.keyboard.type('Nebenkosten dazu\n');
    await page.click('#btnKeys');
    await expect(page.locator('#keys')).toBeVisible();
    await tap(page, '+', '3', '0', 'dec', '5');
    await expect(pad(page)).toHaveValue('850 + 120\nNebenkosten dazu\n+ 30,5');
    expect(await results(page)).toEqual(['970', '', '1.000,5']);
    // Delete removes the character before the cursor, ans inserts the last result's name
    await tap(page, 'back', 'back');
    await tap(page, 'enter', 'ans', '×', '2');
    await expect(pad(page)).toHaveValue('850 + 120\nNebenkosten dazu\n+ 30\nans × 2');
    expect(await results(page)).toEqual(['970', '', '1.000', '2.000']);
    // Saved and back after a reload, keypad choice too
    await expect.poll(async () => (await stored(page))?.pads[0].text).toBe('850 + 120\nNebenkosten dazu\n+ 30\nans × 2');
    await page.reload();
    await expect(pad(page)).toHaveValue('850 + 120\nNebenkosten dazu\n+ 30\nans × 2');
    expect((await results(page))[3]).toBe('2.000');
  });

  test('keys insert at the cursor, also in the middle of the pad', async ({ page }) => {
    await pad(page).fill('10 + 5\nfertig');
    await pad(page).evaluate(el => { el.focus(); el.setSelectionRange(6, 6); });
    await tap(page, '0');
    await expect(pad(page)).toHaveValue('10 + 50\nfertig');
    expect((await results(page))[0]).toBe('60');
    // Keyboard users: Enter on a key types it and focus stays on the keypad
    await key(page, '7').focus();
    await page.keyboard.press('Enter');
    await expect(pad(page)).toHaveValue('10 + 507\nfertig');
    await expect(key(page, '7')).toBeFocused();
  });

  test('tap a result to copy it without thousands separators; copy the whole pad', async ({ page }) => {
    await pad(page).fill('Gehalt 1.234,5 + 1000\nNotiz\n× 2\nMiete = 850\nx: 1 + 1 = ');
    await page.locator('#mirror .res').first().click();
    expect(await clipboardText(page)).toBe('2234,5');
    await expect(page.locator('.toast')).toContainText('Kopiert: 2234,5');
    await page.click('#btnCopyAll');
    const all = 'Gehalt 1.234,5 + 1000 = 2234,5\nNotiz\n× 2 = 4469\nMiete = 850\nx: 1 + 1 = 2';
    expect(await clipboardText(page)).toBe(all);
    // Pasted back it calculates the same
    await pad(page).fill(all);
    expect(await results(page)).toEqual(['2.234,5', '', '4.469', '850', '2']);
  });

  test('paste inserts the clipboard at the cursor; a refused clipboard explains the long-press', async ({ page }) => {
    await page.evaluate(() => navigator.clipboard.writeText(' 49,90 €\r\n'));
    await tap(page, '1', '0', '0', '−', 'paste');
    await expect(pad(page)).toHaveValue('100 − 49,90 €');
    expect(await results(page)).toEqual(['50,1']);
    await page.evaluate(() => navigator.clipboard.writeText(''));
    await tap(page, 'paste');
    await expect(page.locator('.toast')).toHaveText('Die Zwischenablage ist leer');
    await page.evaluate(() => {
      window.__readText = navigator.clipboard.readText;
      navigator.clipboard.readText = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
    });
    await tap(page, 'paste');
    await expect(page.locator('.toast')).toContainText('lange auf den Zettel tippen');
    await expect(pad(page)).toHaveValue('100 − 49,90 €');
    await page.evaluate(() => { navigator.clipboard.readText = window.__readText; });
    // The diagnostics name the failure, never the pad's content
    await openMenu(page);
    await page.locator('details.help summary').click();
    await page.click('[data-diag="copy"]');
    await expect(page.locator('#toast')).toHaveText('Diagnose kopiert');
    const diag = await clipboardText(page);
    expect(diag).toContain('paste failed');
    expect(diag).toContain('NotAllowedError');
    expect(diag).not.toContain('49,90');
  });

  test('pads in the menu: new, switch, delete', async ({ page }) => {
    await pad(page).fill('Urlaub\n300 + 450');
    await openMenu(page);
    await page.click('#btnNew');
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect(pad(page)).toHaveValue('');
    await pad(page).fill('Auto 20 × 3');
    expect(await results(page)).toEqual(['60']);
    await openMenu(page);
    await expect(page.locator('#pads .name')).toHaveText(['Auto 20 × 3', 'Urlaub']);
    await page.locator('#pads .open', { hasText: 'Urlaub' }).click();
    await expect(pad(page)).toHaveValue('Urlaub\n300 + 450');
    expect(await results(page)).toEqual(['', '750']);
    // A second "new" on an empty pad does not pile up empty pads
    await openMenu(page);
    await page.click('#btnNew');
    await openMenu(page);
    await page.click('#btnNew');
    expect((await stored(page)).pads).toHaveLength(3);
    await openMenu(page);
    page.once('dialog', d => d.accept());
    await page.locator('#pads li', { hasText: 'Auto' }).locator('.del').click();
    await expect(page.locator('#pads .name')).toHaveText(['Leerer Zettel', 'Urlaub']);
    await closeMenu(page);
    await page.reload();
    await openMenu(page);
    await expect(page.locator('#pads .name')).toHaveText(['Leerer Zettel', 'Urlaub']);
  });

  test('mirror and textarea wrap long lines the same way, results stay on their line', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 700 });
    const long = 'Eine sehr lange Notiz, die auf dem Handy über mehrere Zeilen umbricht, mit Wörtern wie Donaudampfschifffahrtsgesellschaft';
    await pad(page).fill(`${long}\n1 + 1\n${long} 5 + 5\n${'x'.repeat(200)}\n2 + 2`);
    // If the mirror broke lines differently, the textarea would need more (or less) height than the mirror gives it
    const h = await pad(page).evaluate(el => [el.scrollHeight, el.clientHeight]);
    expect(h[0]).toBe(h[1]);
    // The result sits at the bottom of its line: same height as the last row of that line
    const pos = await page.locator('#mirror .ml').evaluateAll(rows => rows.map(r => {
      const b = r.querySelector('.res'); if (!b) return null;
      return Math.round(r.getBoundingClientRect().bottom - b.getBoundingClientRect().bottom);
    }));
    expect(pos).toEqual([null, 0, 0, null, 0]);
    // Many lines: the pad scrolls, the page does not; the cursor line is scrolled into view
    await pad(page).fill(Array.from({ length: 60 }, (_, i) => `${i} + 1`).join('\n'));
    await pad(page).evaluate(el => { el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
    await tap(page, '0');
    const last = page.locator('#mirror .ml').last();
    await expect(last).toBeInViewport();
    expect(await page.evaluate(() => document.scrollingElement.scrollTop)).toBe(0);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('decimal point, comma groups, English texts', async ({ page }) => {
    await page.goto('/calc-pad/');
    await expect(key(page, 'dec')).toHaveText('.');
    await tap(page, '1', '2', 'dec', '5', '+', '1');
    await pad(page).press('End');
    await pad(page).pressSequentially(',000');
    expect(await results(page)).toEqual(['1,012.5']);
    await page.locator('#mirror .res').click();
    expect(await clipboardText(page)).toBe('1012.5');
    await pad(page).fill('1/0');
    expect(await results(page)).toEqual(['undefined']);
    // Switching to German reformats the results
    await pad(page).fill('1,000.5 + 1');
    await switchLang(page, 'de');
    await expect(key(page, 'dec')).toHaveText(',');
    // In German "1,000.5" is no number any more (the comma is the decimal separator) – the line is text now
    expect(await results(page)).toEqual(['']);
    await pad(page).fill('1.000,5 + 1');
    expect(await results(page)).toEqual(['1.001,5']);
  });
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.goto('/calc-pad/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await pad(page).fill('6 × 7');
  expect(await results(page)).toEqual(['42']);
  await context.setOffline(false);
});
