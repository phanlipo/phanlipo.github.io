// Kosten teilen: people, expenses (even split with cent rest, exact amounts), money given, balances,
// settlement suggestion (checked independently), copy, CSV, undo, reload, English
import { test, expect, axe, openMenu, closeMenu, onDialog, switchLang, clipboardText } from './helpers.mjs';

const KEY = 'split-costs.group.v1';
const pad = n => String(n).padStart(2, '0');
const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = isoDay(new Date());
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const GROUP = { currency: '€', people: [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }, { id: 'c', name: 'Carla' }], entries: [] };

async function preset(page, data = GROUP) {
  await page.evaluate(([k, d]) => localStorage.setItem(k, JSON.stringify(d)), [KEY, data]);
  await page.reload();
}
async function addExpense(page, { title, amount, payer, exact, without = [] }) {
  await page.click('#btnAdd');
  await page.fill('#entryTitle', title);
  await page.fill('#entryAmount', amount);
  if (payer) await page.selectOption('#entryPayer', { label: payer });
  for (const n of without) await page.locator('#withList label', { hasText: n }).locator('input').uncheck();
  if (exact) {
    await page.locator('#split [data-split="exact"]').click();
    for (const [n, v] of Object.entries(exact)) await page.locator('#partList').getByLabel(n, { exact: true }).fill(v);
  }
  await page.click('#entryForm button[type=submit]');
  await expect(page.locator('#entryDlg')).toBeHidden();
}
const balances = page => page.locator('#balances .bal');
const transfers = page => page.locator('#transfers .name');

test.beforeEach(async ({ page }) => { await page.goto('/split-costs/'); });

test('first start asks only for names, at least two', async ({ page }) => {
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#stateCard')).toBeHidden();
  await expect(page.locator('#btnQuickAdd')).toBeHidden();
  await page.press('#setupName', 'Enter');
  await expect(page.locator('#setupErr')).toHaveText('Bitte einen Namen eingeben.');
  await page.fill('#setupName', 'Anna');
  await page.press('#setupName', 'Enter');
  await expect(page.locator('#btnStart')).toBeDisabled();
  await page.fill('#setupName', ' ANNA ');
  await page.press('#setupName', 'Enter');
  await expect(page.locator('#setupErr')).toHaveText('„ANNA“ ist schon dabei.');
  await page.fill('#setupName', 'Ben');
  await page.press('#setupName', 'Enter');
  await expect(page.locator('#setupList .name')).toHaveText(['Anna', 'Ben']);
  await page.click('#btnStart');
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#listEmpty')).toBeVisible();
  await expect(page.locator('#settleEmpty')).toBeVisible();
  await expect(page.locator('#btnCopy')).toBeHidden();
  await expect(page.locator('#balances .name')).toHaveText(['Anna', 'Ben']);
  await expect(balances(page)).toHaveText(['0,00 €', '0,00 €']);
  await page.reload();
  await expect(page.locator('#stateCard')).toBeVisible();
});

test('even split: cents left over go to the first people; balances and settlement; reload', async ({ page }) => {
  await preset(page);
  // the dialog shows each share while typing
  await page.click('#btnQuickAdd');
  await page.fill('#entryAmount', '10');
  await expect(page.locator('#withList small')).toHaveText(['3,34 €', '3,33 €', '3,33 €']);
  await page.click('#entryForm button[type=submit]');
  await expect(page.locator('#entryErr')).toHaveText('Bitte eintragen, wofür das Geld war.');
  await page.fill('#entryTitle', 'Pizza');
  await page.selectOption('#entryPayer', { label: 'Ben' });
  await page.click('#entryForm button[type=submit]');
  // Ben paid 10,00, shares 3,34 / 3,33 / 3,33 → Anna −3,34, Ben +6,67, Carla −3,33
  await expect(balances(page)).toHaveText(['-3,34 €', '6,67 €', '-3,33 €']);
  await expect(page.locator('#balances .meta').nth(1)).toHaveText('bezahlt 10,00 € · Anteil 3,33 €');
  await expect(page.locator('#entries .name')).toHaveText(['Pizza']);
  await expect(page.locator('#entries .meta')).toHaveText(`Ben · ${new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} · für alle`);
  await expect(transfers(page)).toHaveText(['Anna zahlt Ben', 'Carla zahlt Ben']);
  await expect(page.locator('#transfers .meta')).toHaveText(['3,34 €', '3,33 €']);
  // only two of three; Carla paid
  await addExpense(page, { title: 'Kino', amount: '24,50', payer: 'Carla', without: ['Ben'] });
  await expect(page.locator('#entries .meta').first()).toContainText('für Anna, Carla');
  // Anna −3,34 −12,25 = −15,59; Ben +6,67; Carla −3,33 + 24,50 − 12,25 = 8,92
  await expect(balances(page)).toHaveText(['-15,59 €', '6,67 €', '8,92 €']);
  await expect(page.locator('#total')).toHaveText('Ausgaben zusammen: 34,50 €');
  await expect(transfers(page)).toHaveText(['Anna zahlt Carla', 'Anna zahlt Ben']);
  await expect(page.locator('#transfers .meta')).toHaveText(['8,92 €', '6,67 €']);
  await page.reload();
  await expect(balances(page)).toHaveText(['-15,59 €', '6,67 €', '8,92 €']);
  const s = await stored(page);
  expect(s.entries.map(e => [e.kind, e.title, e.amount, e.payer, e.split, e.with, e.date])).toEqual([
    ['expense', 'Pizza', 1000, 'b', 'equal', ['a', 'b', 'c'], TODAY],
    ['expense', 'Kino', 2450, 'c', 'equal', ['a', 'c'], TODAY],
  ]);
});

test('exact amounts start from the even split and must add up', async ({ page }) => {
  await preset(page);
  await page.click('#btnAdd');
  await page.fill('#entryTitle', 'Hotel');
  await page.fill('#entryAmount', '90');
  await page.locator('#split [data-split="exact"]').click();
  await expect(page.locator('#partList').getByLabel('Anna', { exact: true })).toHaveValue('30,00');
  await expect(page.locator('#rest')).toHaveText('Passt genau.');
  await page.locator('#partList').getByLabel('Anna', { exact: true }).fill('50');
  await expect(page.locator('#rest')).toHaveText('Zu viel verteilt: 20,00 €');
  await page.click('#entryForm button[type=submit]');
  await expect(page.locator('#entryErr')).toHaveText('Die Anteile ergeben zusammen nicht den Betrag.');
  await page.locator('#partList').getByLabel('Ben', { exact: true }).fill('10');
  await page.locator('#partList').getByLabel('Carla', { exact: true }).fill('');
  await expect(page.locator('#rest')).toHaveText('Noch zu verteilen: 30,00 €');
  await page.locator('#partList').getByLabel('Carla', { exact: true }).fill('30');
  await page.click('#entryForm button[type=submit]');
  await expect(page.locator('#entryDlg')).toBeHidden();
  // Anna paid 90, share 50 → +40; Ben −10; Carla −30
  await expect(balances(page)).toHaveText(['40,00 €', '-10,00 €', '-30,00 €']);
  expect((await stored(page)).entries[0]).toMatchObject({ split: 'exact', parts: { a: 5000, b: 1000, c: 3000 } });
  // editing opens the same split again
  await page.locator('#entries [data-edit]').click();
  await expect(page.locator('#entryDlgH')).toHaveText('Ausgabe ändern');
  await expect(page.locator('#split [data-split="exact"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#partList').getByLabel('Ben', { exact: true })).toHaveValue('10,00');
});

test('"Paid" books the transfer, undo takes it back; money given by hand', async ({ page }) => {
  await preset(page);
  await addExpense(page, { title: 'Einkauf', amount: '30', payer: 'Anna' });
  await expect(transfers(page)).toHaveText(['Ben zahlt Anna', 'Carla zahlt Anna']);
  await page.locator('#transfers [data-settle]').first().click();
  await expect(page.locator('#toast')).toContainText('Ben hat Anna 10,00 € gezahlt');
  await expect(balances(page)).toHaveText(['10,00 €', '0,00 €', '-10,00 €']);
  await expect(page.locator('#entries .name').first()).toHaveText('Ben an Anna');
  await expect(page.locator('#total')).toHaveText('Ausgaben zusammen: 30,00 €');
  await page.locator('#toast button').click();
  await expect(balances(page)).toHaveText(['20,00 €', '-10,00 €', '-10,00 €']);
  await expect(page.locator('#entries li')).toHaveCount(1);
  // by hand: Carla gives Anna 10
  await page.click('#btnAdd');
  await page.locator('#kind [data-kind="transfer"]').click();
  await expect(page.locator('#entryTitle')).toBeHidden();
  await expect(page.locator('#payerL')).toHaveText('Von');
  await page.fill('#entryAmount', '10');
  await page.selectOption('#entryPayer', { label: 'Carla' });
  await page.selectOption('#entryTo', { label: 'Carla' });
  await page.click('#entryForm button[type=submit]');
  await expect(page.locator('#entryErr')).toHaveText('Bitte zwei verschiedene Personen wählen.');
  await page.selectOption('#entryTo', { label: 'Anna' });
  await page.click('#entryForm button[type=submit]');
  await expect(balances(page)).toHaveText(['10,00 €', '-10,00 €', '0,00 €']);
  await page.locator('#transfers [data-settle]').click();
  await expect(page.locator('#settleEmpty')).toBeVisible();
  await expect(balances(page)).toHaveText(['0,00 €', '0,00 €', '0,00 €']);
});

test('edit and delete an expense with undo', async ({ page }) => {
  await preset(page);
  await addExpense(page, { title: 'Taxi', amount: '12', payer: 'Ben' });
  await page.locator('#entries [data-edit]').click();
  await expect(page.locator('#entryTitle')).toHaveValue('Taxi');
  await expect(page.locator('#entryAmount')).toHaveValue('12,00');
  await page.fill('#entryAmount', '15');
  await page.fill('#entryDate', '2026-01-05');
  await page.click('#entryForm button[type=submit]');
  await expect(page.locator('#entries .amt')).toHaveText('15,00 €');
  await expect(balances(page)).toHaveText(['-5,00 €', '10,00 €', '-5,00 €']);
  expect((await stored(page)).entries).toHaveLength(1);
  await page.locator('#entries [data-edit]').click();
  await page.click('#entryDelete');
  await expect(page.locator('#listEmpty')).toBeVisible();
  await expect(page.locator('#toast')).toContainText('„Taxi“ gelöscht');
  await page.locator('#toast button').click();
  await expect(page.locator('#entries .name')).toHaveText(['Taxi']);
  expect((await stored(page)).entries[0]).toMatchObject({ amount: 1500, date: '2026-01-05' });
});

test('people: add, rename; someone in an expense cannot be removed', async ({ page }) => {
  await preset(page);
  await addExpense(page, { title: 'Brot', amount: '4', payer: 'Anna', without: ['Carla'] });
  await openMenu(page);
  await page.locator('#peoplePage summary').click();
  await page.fill('#peopleName', 'Dora');
  await page.press('#peopleName', 'Enter');
  await expect(page.locator('#balances .name')).toHaveText(['Anna', 'Ben', 'Carla', 'Dora']);
  await openMenu(page);
  await page.locator('#peoplePage summary').click();
  await page.locator('#peopleList [data-del="b"]').click();
  await expect(page.locator('#toast')).toContainText('Ben kommt noch in Ausgaben vor');
  await expect(page.locator('#peopleList .name')).toHaveCount(4);
  await onDialog(page, d => d.accept('Benni'), { once: true });
  await page.locator('#peopleList [data-rename="b"]').click();
  await page.locator('#peopleList [data-del="c"]').click();
  await expect(page.locator('#peopleList .name')).toHaveText(['Anna', 'Benni', 'Dora']);
  await page.locator('#toast button').click();
  await expect(page.locator('#peopleList .name')).toHaveText(['Anna', 'Benni', 'Carla', 'Dora']);
  await closeMenu(page);
  await expect(transfers(page)).toHaveText(['Benni zahlt Anna']);
});

test('copy settlement, CSV in German, new settlement keeps the names; currency', async ({ page }) => {
  await preset(page);
  await addExpense(page, { title: 'Ferienhaus; Bad', amount: '100', payer: 'Anna' });
  await page.click('#btnCopy');
  await expect(page.locator('#toast')).toHaveText('Ausgleich kopiert');
  expect(await clipboardText(page)).toBe('Kosten teilen – wer zahlt wem?\nBen zahlt Anna: 33,33 €\nCarla zahlt Anna: 33,33 €');
  await openMenu(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  expect(dl.suggestedFilename()).toBe(`kosten-teilen-${TODAY}.csv`);
  const text = (await (await import('node:fs')).promises.readFile(await dl.path(), 'utf8')).replace(/^﻿/, '');
  expect(text.split('\r\n')).toEqual([
    'Datum;Wofür;Bezahlt von;Betrag €;Anna;Ben;Carla',
    `${TODAY};"Ferienhaus; Bad";Anna;100,00;33,34;33,33;33,33`,
    ';Saldo;;;66,66;-33,33;-33,33',
    '',
  ]);
  await openMenu(page);
  await page.fill('#currency', 'CHF');
  await page.press('#currency', 'Tab');
  await closeMenu(page);
  await expect(balances(page)).toHaveText(['66,66 CHF', '-33,33 CHF', '-33,33 CHF']);
  await openMenu(page);
  await onDialog(page, d => d.dismiss(), { once: true });
  await page.click('#btnClear');
  expect((await stored(page)).entries).toHaveLength(1);
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnClear');
  await expect(page.locator('#listEmpty')).toBeVisible();
  const s = await stored(page);
  expect(s.entries).toEqual([]);
  expect(s.people.map(p => p.name)).toEqual(['Anna', 'Ben', 'Carla']);
  expect(s.currency).toBe('CHF');
});

test('settlement logic: balances add up to zero, at most n − 1 transfers that settle everything', async ({ page }) => {
  const r = await page.evaluate(() => {
    const S = window.SplitCosts;
    let seed = 7;
    const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const out = [];
    for (let k = 0; k < 300; k++) {
      const n = 2 + rnd(7);
      const people = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
      const entries = Array.from({ length: 1 + rnd(8) }, (_, i) => {
        const w = people.filter(() => rnd(3)).map(p => p.id);
        return { id: 'e' + i, kind: 'expense', title: 'x', amount: 1 + rnd(50000), payer: people[rnd(n)].id, date: '2026-01-01', split: 'equal', with: w.length ? w : [people[0].id] };
      });
      const data = S.normalize({ people, entries });
      const acc = S.accounts(data), tr = S.settle(data);
      const sum = Object.values(acc).reduce((s, a) => s + a.balance, 0);
      // apply the suggested transfers as entries: everybody must end at 0
      const after = S.accounts({ people, entries: data.entries.concat(tr.map((x, i) => ({ id: 't' + i, kind: 'transfer', amount: x.amount, payer: x.from, split: 'exact', parts: { [x.to]: x.amount } }))) });
      const shareSum = data.entries.every(e => Object.values(S.shares(e, people)).reduce((s, c) => s + c, 0) === e.amount);
      out.push({ sum, n: tr.length, max: n - 1, zero: Object.values(after).every(a => a.balance === 0), positive: tr.every(x => x.amount > 0 && x.from !== x.to), shareSum });
    }
    return out;
  });
  for (const x of r) {
    expect(x.sum).toBe(0);
    expect(x.zero).toBe(true);
    expect(x.positive).toBe(true);
    expect(x.shareSum).toBe(true);
    expect(x.n).toBeLessThanOrEqual(x.max);
  }
});

test('broken or foreign data is cleaned up when loading', async ({ page }) => {
  await preset(page, {
    currency: '', people: [{ id: 'a', name: 'Anna' }, { id: 'b', name: 'Ben' }, { id: 'a', name: 'Doppelt' }, { name: 'ohne id' }],
    entries: [
      { id: 'ok', kind: 'expense', title: 'Gut', amount: 300, payer: 'a', date: '2026-02-01', split: 'equal', with: ['a', 'b', 'x'] },
      { id: 'bad1', kind: 'expense', title: 'Summe falsch', amount: 300, payer: 'a', date: '2026-02-01', split: 'exact', parts: { a: 100 } },
      { id: 'bad2', kind: 'expense', title: 'Unbekannt', amount: 300, payer: 'x', date: '2026-02-01', split: 'equal', with: ['a'] },
      { id: 'bad3', kind: 'transfer', amount: 300, payer: 'a', date: '2026-02-30', split: 'exact', parts: { a: 300 } },
      { id: 'bad4', kind: 'expense', title: 'Null', amount: 0, payer: 'a', split: 'equal', with: ['a'] },
    ],
  });
  await expect(page.locator('#entries .name')).toHaveText(['Gut']);
  await expect(balances(page)).toHaveText(['1,50 €', '-1,50 €']);
  expect(await page.evaluate(() => window.SplitCosts.isDate('2026-02-30'))).toBe(false);
  expect(await page.evaluate(() => window.SplitCosts.isDate('2028-02-29'))).toBe(true);
});

test('switching the language re-renders texts written by the script', async ({ page }) => {
  await preset(page);
  await addExpense(page, { title: 'Pizza', amount: '10', payer: 'Ben' });
  await switchLang(page, 'en');
  await expect(balances(page)).toHaveText(['-3.34 €', '6.67 €', '-3.33 €']);
  await expect(transfers(page)).toHaveText(['Anna pays Ben', 'Carla pays Ben']);
  await expect(page.locator('#entries .meta')).toContainText('for everyone');
  await expect(page.locator('#total')).toHaveText('Expenses together: 10.00 €');
  await expect(page.locator('#btnAdd')).toHaveText('Add expense');
});

for (const scheme of ['light', 'dark']) {
  test(`filled settlement and open dialog have no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await preset(page);
    await addExpense(page, { title: 'Pizza', amount: '10', payer: 'Ben' });
    await page.locator('#toast').evaluate(t => t.remove());
    expect((await axe(page).analyze()).violations).toEqual([]);
    await page.click('#btnAdd');
    await page.locator('#split [data-split="exact"]').click();
    expect((await axe(page).analyze()).violations).toEqual([]);
  });
}
