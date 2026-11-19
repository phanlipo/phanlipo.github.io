// Bierstrichliste: names, strokes per person and day, balance from price and payments
import { test, expect, axe, openMenu, closeMenu, onDialog, switchLang } from './helpers.mjs';

const KEY = 'beer-tally.list.v1';
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = isoDay(new Date());
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const cell = (page, name, date = TODAY) => page.locator(`#tally tbody tr:has(th b:text-is("${name}")) .cell[data-d="${date}"]`);

async function setup(page, names) {
  for (const n of names) {
    await page.fill('#setupName', n);
    await page.press('#setupName', 'Enter');
  }
  await page.click('#btnStart');
}

test.beforeEach(async ({ page }) => { await page.goto('/beer-tally/'); });

test('first start asks only for names, then shows the tally', async ({ page }) => {
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#tallyCard')).toBeHidden();
  await expect(page.locator('#btnStart')).toBeDisabled();
  await page.press('#setupName', 'Enter');
  await expect(page.locator('#setupErr')).toHaveText('Bitte einen Namen eingeben.');
  await page.fill('#setupName', 'Anna');
  await page.press('#setupName', 'Enter');
  await page.fill('#setupName', ' anna ');
  await page.press('#setupName', 'Enter');
  await expect(page.locator('#setupErr')).toHaveText('„anna“ steht schon auf der Liste.');
  await page.fill('#setupName', 'Ben');
  await page.press('#setupName', 'Enter');
  await expect(page.locator('#setupList .name')).toHaveText(['Anna', 'Ben']);
  await page.click('#btnStart');
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#tally tbody th b')).toHaveText(['Anna', 'Ben']);
  // today's column is there before the first stroke, but not stored yet
  await expect(page.locator(`#tally thead .day-btn[data-day="${TODAY}"]`)).toContainText('Heute');
  expect((await stored(page)).days).toEqual([]);
});

test('strokes per tap, bundles of five, undo and correction mode; balance from price', async ({ page }) => {
  await setup(page, ['Anna', 'Ben']);
  const anna = cell(page, 'Anna');
  for (let i = 0; i < 6; i++) await anna.click();
  await expect(anna).toHaveAttribute('aria-label', /: 6$/);
  await expect(anna.locator('svg')).toHaveCount(2); // one bundle of five + one stroke
  await expect(anna.locator('svg').first().locator('line')).toHaveCount(5);
  // undo the last stroke
  await page.locator('#toast button').click();
  await expect(anna).toHaveAttribute('aria-label', /: 5$/);
  // correction mode removes strokes; an empty cell says so
  await page.locator('#mode [data-mode="minus"]').click();
  await anna.click();
  await expect(anna).toHaveAttribute('aria-label', /: 4$/);
  await cell(page, 'Ben').click();
  await expect(page.locator('#toast')).toContainText('kein Strich');
  await page.locator('#mode [data-mode="plus"]').click();
  await cell(page, 'Ben').click();
  // 4 × 1,00 € and 1 × 1,00 € (default price), nobody has paid
  await expect(page.locator('#tally tbody tr').first().locator('.bal')).toHaveText('-4,00 €');
  await expect(page.locator('#tally tfoot .sum')).toHaveText('5');
  await expect(page.locator('#accounts li').first()).toContainText('4 Bier · 4,00 € · eingezahlt 0,00 €');
  await expect(page.locator('#total')).toHaveText('Zusammen 5 Bier · 5,00 € · eingezahlt 0,00 €');
  await page.reload();
  await expect(cell(page, 'Anna')).toHaveAttribute('aria-label', /: 4$/);
  const s = await stored(page);
  expect(s.days).toEqual([{ date: TODAY, price: 100, counts: { [s.people[0].id]: 4, [s.people[1].id]: 1 } }]);
});

test('payments change the balance; a payment can be deleted and restored', async ({ page }) => {
  await setup(page, ['Anna', 'Ben']);
  for (let i = 0; i < 3; i++) await cell(page, 'Anna').click();
  await page.locator('#accounts [data-pay]').first().click();
  await expect(page.locator('#payPerson option:checked')).toHaveText('Anna');
  await expect(page.locator('#payBal')).toHaveText('Kontostand jetzt: -3,00 €');
  await page.click('#payForm button[type=submit]');
  await expect(page.locator('#payErr')).toContainText('Bitte einen Betrag');
  await page.fill('#payAmount', '10,50');
  await page.click('#payForm button[type=submit]');
  await expect(page.locator('#payDlg')).toBeHidden();
  // 10,50 € paid − 3 × 1,00 € = 7,50 € credit
  await expect(page.locator('#tally tbody tr').first().locator('.bal')).toHaveText('7,50 €');
  await expect(page.locator('#tally tbody tr').first().locator('.bal')).toHaveClass(/pos/);
  // a payout (negative) for Ben
  await page.click('#btnPay');
  await page.selectOption('#payPerson', { label: 'Ben' });
  await page.fill('#payAmount', '-2');
  await page.click('#payForm button[type=submit]');
  await expect(page.locator('#tally tbody tr').nth(1).locator('.bal')).toHaveText('-2,00 €');
  await openMenu(page);
  await page.locator('#payPage summary').click();
  await expect(page.locator('#payList li')).toHaveCount(2);
  await page.locator('#payList [data-paydel]').first().click();
  await expect(page.locator('#payList li')).toHaveCount(1);
  await page.locator('#toast button').click();
  await expect(page.locator('#payList li')).toHaveCount(2);
  const s = await stored(page);
  expect(s.payments.map(p => p.amount).sort((a, b) => a - b)).toEqual([-200, 1050]);
});

test('each day keeps its price; days can be added, changed and deleted', async ({ page }) => {
  await setup(page, ['Anna']);
  await cell(page, 'Anna').click(); // today at 1,00 €
  // new price only for new days
  await openMenu(page);
  await page.fill('#price', '1,50');
  await page.press('#price', 'Tab');
  await closeMenu(page);
  await page.click('#btnAddDay');
  await expect(page.locator('#dayDate')).toHaveValue('');
  await expect(page.locator('#dayPrice')).toHaveValue('1,50');
  await page.fill('#dayDate', TODAY);
  await page.click('#dayForm button[type=submit]');
  await expect(page.locator('#dayErr')).toHaveText('Für dieses Datum gibt es schon eine Spalte.');
  await page.fill('#dayDate', '2026-01-10');
  await page.click('#dayForm button[type=submit]');
  for (let i = 0; i < 2; i++) await cell(page, 'Anna', '2026-01-10').click();
  // 1 × 1,00 € + 2 × 1,50 € = 4,00 €
  await expect(page.locator('#tally tbody .bal')).toHaveText('-4,00 €');
  // the newest day comes first
  await expect(page.locator('#tally thead .day-btn')).toHaveCount(2);
  await expect(page.locator('#tally thead .day-btn').first()).toHaveAttribute('data-day', TODAY);
  // change the price of the old day
  await page.locator('#tally thead .day-btn[data-day="2026-01-10"]').click();
  await page.fill('#dayPrice', '2');
  await page.click('#dayForm button[type=submit]');
  await expect(page.locator('#tally tbody .bal')).toHaveText('-5,00 €');
  // delete the day, then undo
  await page.locator('#tally thead .day-btn[data-day="2026-01-10"]').click();
  await page.click('#dayDelete');
  await expect(page.locator('#tally tbody .bal')).toHaveText('-1,00 €');
  await page.locator('#toast button').click();
  await expect(page.locator('#tally tbody .bal')).toHaveText('-5,00 €');
});

test('people in the menu: add, rename, remove with undo', async ({ page }) => {
  await setup(page, ['Anna']);
  await cell(page, 'Anna').click();
  await openMenu(page);
  await page.locator('#peoplePage summary').click();
  await page.fill('#peopleName', 'Carla');
  await page.press('#peopleName', 'Enter');
  await expect(page.locator('#tally tbody th b')).toHaveText(['Anna', 'Carla']);
  await openMenu(page);
  await page.locator('#peoplePage summary').click();
  await onDialog(page, d => d.accept('Anja'), { once: true });
  await page.locator('#peopleList [data-rename]').first().click();
  await expect(page.locator('#peopleList .name')).toHaveText(['Anja', 'Carla']);
  await page.locator('#peopleList [data-del]').first().click();
  await expect(page.locator('#peopleList .name')).toHaveText(['Carla']);
  await page.locator('#toast button').click();
  await expect(page.locator('#peopleList .name')).toHaveText(['Anja', 'Carla']);
  await closeMenu(page);
  await expect(cell(page, 'Anja')).toHaveAttribute('aria-label', /: 1$/);
});

test('CSV follows the language; clearing keeps the names', async ({ page }) => {
  await setup(page, ['Anna']);
  for (let i = 0; i < 2; i++) await cell(page, 'Anna').click();
  await openMenu(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  expect(dl.suggestedFilename()).toBe(`bierstrichliste-${TODAY}.csv`);
  const text = (await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8')).replace(/^﻿/, '');
  expect(text.split('\r\n')).toEqual([
    `Name;${TODAY};Bier gesamt;Betrag €;Eingezahlt €;Kontostand €`,
    'Anna;2;2;2,00;0,00;-2,00',
    'Preis pro Bier €;1,00',
    '',
  ]);
  await openMenu(page);
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnClear');
  await expect(cell(page, 'Anna')).toHaveAttribute('aria-label', /: 0$/);
  const s = await stored(page);
  expect(s.days).toEqual([]);
  expect(s.people.map(p => p.name)).toEqual(['Anna']);
});

test('switching the language re-renders texts written by the script', async ({ page }) => {
  await setup(page, ['Anna']);
  await cell(page, 'Anna').click();
  await switchLang(page, 'en');
  await expect(page.locator(`#tally thead .day-btn[data-day="${TODAY}"]`)).toContainText('Today');
  await expect(page.locator('#tally tbody .bal')).toHaveText('-1.00 €');
  await expect(page.locator('#total')).toHaveText('Together 1 beer · 1.00 € · paid 0.00 €');
});

for (const scheme of ['light', 'dark']) {
  test(`filled list has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await setup(page, ['Anna', 'Ben']);
    for (let i = 0; i < 7; i++) await cell(page, 'Anna').click();
    await page.click('#btnPay');
    await page.fill('#payAmount', '20');
    await page.click('#payForm button[type=submit]');
    await page.locator('#mode [data-mode="minus"]').click();
    await page.locator('#toast').evaluate(t => t.remove());
    const { violations } = await axe(page).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

test('the table fits a 375 px phone: the page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 });
  await setup(page, ['Maximilian-Alexander', 'Ben']);
  await page.click('#btnAddDay');
  await page.fill('#dayDate', '2026-01-10');
  await page.click('#dayForm button[type=submit]');
  for (let i = 0; i < 12; i++) await cell(page, 'Ben').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
