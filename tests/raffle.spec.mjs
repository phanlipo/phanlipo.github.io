// Tombola: tickets (ranges, leaving out unsold ones, leading zeros), every ticket only once, prizes in order
// (main prize last), undo, redraw, checking a ticket, copying the list, reload, English, WebMCP see webmcp.spec.mjs.
import { test, expect, openMenu, closeMenu, clipboardText, switchLang } from './helpers.mjs';

async function setup(page, { tickets, exclude, prizes, mainLast } = {}) {
  await openMenu(page);
  if (tickets != null) await page.fill('#tickets', tickets);
  if (exclude != null) await page.fill('#exclude', exclude);
  if (prizes != null) await page.fill('#prizes', prizes.join('\n'));
  if (mainLast != null) await page.setChecked('#optMainLast', mainLast);
  await closeMenu(page);
}
const num = page => page.locator('#num').textContent();
/** Drawn ticket numbers from the list, oldest first */
const listed = async page => (await page.locator('#list .no').allTextContents()).reverse();

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/raffle/');
  await openMenu(page);
  for (const id of ['#optAnim', '#optSound', '#optVibrate']) await page.uncheck(id);
  await closeMenu(page);
});

test('default 1-100: every ticket exactly once, then nothing left', async ({ page }) => {
  await expect(page.locator('#count')).toHaveText('0 von 100 Losen gezogen');
  await expect(page.locator('#prize')).toHaveText('Tippe auf „Los ziehen“');
  await setup(page, { tickets: '1-5' });
  const got = [];
  for (let i = 0; i < 5; i++) {
    await page.click('#btnDraw');
    got.push(Number(await num(page)));
    await expect(page.locator('#count')).toHaveText(i < 4 ? `${i + 1} von 5 Losen gezogen` : 'Alle Lose wurden gezogen');
  }
  expect([...got].sort()).toEqual([1, 2, 3, 4, 5]);
  await expect(page.locator('#btnDraw')).toBeDisabled();
  expect(await listed(page)).toEqual(got.map(String));
  await expect(page.locator('#winCount')).toHaveText('5');
});

test('ranges, unsold tickets left out, leading zeros, invalid input', async ({ page }) => {
  await setup(page, { tickets: '001 - 010, 20', exclude: '2-9' });
  await openMenu(page);
  await expect(page.locator('#poolInfo')).toHaveText('3 Lose im Spiel');
  await closeMenu(page);
  const got = [];
  for (let i = 0; i < 3; i++) { await page.click('#btnDraw'); got.push(await num(page)); }
  expect([...got].sort()).toEqual(['001', '010', '020']);
  await setup(page, { tickets: '1-10, abc' });
  await openMenu(page);
  await expect(page.locator('#poolInfo')).toHaveText('Nicht verstanden: „abc“ – z. B. 1-200, 301-350');
  await page.fill('#tickets', '1-200000');
  await expect(page.locator('#poolInfo')).toHaveText('Höchstens 100.000 Lose');
  await closeMenu(page);
  await expect(page.locator('#btnDraw')).toBeDisabled();
  await expect(page.locator('#prize')).toHaveText('Keine Lose – Stift oben rechts');
});

test('fair: all tickets come up about equally often as the first draw', async ({ page }) => {
  await setup(page, { tickets: '1-4' });
  const counts = await page.evaluate(async () => {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (let i = 0; i < 400; i++) {
      document.getElementById('btnDraw').click();
      c[Number(document.getElementById('num').textContent)]++;
      document.getElementById('btnUndo').click();
    }
    return c;
  });
  // Expected 100 each; 40…160 is far outside chance for a fair draw
  for (const k of [1, 2, 3, 4]) { expect(counts[k]).toBeGreaterThan(40); expect(counts[k]).toBeLessThan(160); }
});

test('prizes: main prize last, then all given out; first-to-last order when switched off', async ({ page }) => {
  await setup(page, { tickets: '1-50', prizes: ['Fahrrad', 'Gutschein', 'Tasse'] });
  await expect(page.locator('#prize')).toHaveText('Als Nächstes: 3. Preis: Tasse');
  await expect(page.locator('#count')).toHaveText('0 von 50 Losen gezogen · 3 Preise übrig');
  for (const p of ['3. Preis: Tasse', '2. Preis: Gutschein', '1. Preis: Fahrrad']) {
    await page.click('#btnDraw');
    await expect(page.locator('#prize')).toHaveText('🎉 ' + p);
  }
  await expect(page.locator('#btnDraw')).toBeDisabled();
  await expect(page.locator('#count')).toHaveText('Alle Preise sind vergeben');
  await page.click('#btnUndo');
  await page.click('#btnUndo');
  await setup(page, { mainLast: false });
  await expect(page.locator('#prize')).toHaveText('Als Nächstes: 1. Preis: Fahrrad');
  await page.click('#btnDraw');
  await expect(page.locator('#prize')).toHaveText('🎉 1. Preis: Fahrrad');
});

test('check a ticket, redraw a forfeited one, undo, copy, kept after reload', async ({ page }) => {
  await setup(page, { tickets: '1-20', exclude: '13', prizes: ['Fahrrad', 'Tasse'] });
  await page.click('#btnDraw');
  const a = Number(await num(page));
  await page.fill('#checkIn', String(a));
  await expect(page.locator('#checkOut')).toHaveText(`🎉 Los ${a} hat gewonnen: 2. Preis: Tasse`);
  await page.fill('#checkIn', '13');
  await expect(page.locator('#checkOut')).toHaveText('Los 13 ist nicht im Spiel');
  const other = a === 1 ? 2 : 1;
  await page.fill('#checkIn', String(other));
  await expect(page.locator('#checkOut')).toHaveText(`Los ${other} wurde noch nicht gezogen`);

  // Nobody collects: redraw for the same prize, the old ticket is forfeited and never comes back
  await page.click(`[aria-label="Los ${a} neu ziehen"]`);
  const b = Number(await num(page));
  expect(b).not.toBe(a);
  await expect(page.locator('#prize')).toHaveText('🎉 2. Preis: Tasse');
  await expect(page.locator('#list li.void .no')).toHaveText(String(a));
  await expect(page.locator('#winCount')).toHaveText('1');
  await page.fill('#checkIn', String(a));
  await expect(page.locator('#checkOut')).toHaveText(`Los ${a} wurde gezogen, ist aber verfallen`);

  // Undo the redraw: ticket a holds the prize again
  await page.click('#btnUndo');
  await expect(page.locator('#checkOut')).toHaveText(`🎉 Los ${a} hat gewonnen: 2. Preis: Tasse`);
  await expect(page.locator('#list li')).toHaveCount(1);

  await page.click('#btnDraw');
  const c = Number(await num(page));
  await page.reload();
  await expect(page.locator('#count')).toHaveText('Alle Preise sind vergeben');
  await page.fill('#checkIn', String(other === c ? 3 : other));
  await expect(page.locator('#checkOut')).toContainText('leider kein Gewinn');
  await page.click('#btnCopy');
  await expect(page.locator('#toast')).toHaveText('Liste kopiert');
  expect(await clipboardText(page)).toBe(`Tombola – Gewinnnummern\n\n2. Preis: Tasse – Los ${a}\n1. Preis: Fahrrad – Los ${c}`);

  // New draw: list cleared, settings kept
  await openMenu(page);
  await page.click('#btnReset');
  await closeMenu(page);
  await expect(page.locator('#list li')).toHaveText('Noch keine Lose gezogen.');
  await expect(page.locator('#count')).toHaveText('0 von 19 Losen gezogen · 2 Preise übrig');
});

test('animated draw shows the result only at the end', async ({ page }) => {
  await openMenu(page);
  await page.check('#optAnim');
  await closeMenu(page);
  await page.click('#btnDraw');
  await expect(page.locator('#btnDraw')).toBeDisabled();
  await expect(page.locator('#prize')).toHaveText('Wird gezogen …');
  await expect(page.locator('#prize')).toHaveText('🎉 Gezogen');
  await expect(page.locator('#list .no')).toHaveText(await num(page));
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('prizes and check in English, number format', async ({ page }) => {
    await setup(page, { tickets: '1-2000', prizes: ['Bike'] });
    await expect(page.locator('#count')).toHaveText('0 of 2,000 tickets drawn · 1 prize left');
    await page.click('#btnDraw');
    await expect(page.locator('#prize')).toHaveText('🎉 Prize 1: Bike');
    const n = await num(page);
    await page.fill('#checkIn', n);
    await expect(page.locator('#checkOut')).toHaveText(`🎉 Ticket ${n} has won: Prize 1: Bike`);
    await switchLang(page, 'de');
    await expect(page.locator('#checkOut')).toHaveText(`🎉 Los ${n} hat gewonnen: 1. Preis: Bike`);
  });
});
