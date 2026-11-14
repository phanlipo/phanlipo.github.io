// Dienstplan: staff with working times (several blocks per day, gaps = breaks), rooms, absences (all day or
// by the hour), the week plan with its check (everyone on duty in exactly one room), day changes, auto-fill,
// text/CSV export, English, WebMCP, migration of the v1 format.
import { readFileSync } from 'node:fs';
import { test, expect, clipboardText, switchLang, openMenu, closeMenu } from './helpers.mjs';

// Wednesday of calendar week 47/2026 (Mon 16.11. – Sun 22.11.)
const NOW = new Date('2026-11-18T10:00:00');
const MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18';

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.clock.setFixedTime(NOW);
  await page.goto('/duty-roster/');
});

const tab = (page, name) => page.getByRole('tab', { name }).click();
const day = (page, date) => page.locator(`[data-day="${date}"]`);
/** A room of a day – matched by the room's name (option texts also mention rooms) */
const room = (page, date, name) => day(page, date).locator('.room').filter({ has: page.locator('.room-head > span:first-child').getByText(name, { exact: true }) });
const slot = (page, date, name, i = 0) => room(page, date, name).locator('select').nth(i);
const wday = (page, n) => page.locator(`#sfTimes .wday[data-wd="${n}"]`);

/** Sets the blocks of a block editor to e.g. ['07:30-12:00', '12:30-16:00'] */
async function setBlocks(editor, blocks) {
  const rows = editor.locator('.blk');
  while (await rows.count() < blocks.length) await editor.locator('[data-addblk]').click();
  while (await rows.count() > blocks.length) await rows.last().locator('[data-rm]').click();
  for (const [i, b] of blocks.entries()) {
    const [s, e] = b.split('-');
    await rows.nth(i).locator('[data-s]').fill(s);
    await rows.nth(i).locator('[data-e]').fill(e);
  }
}
async function addRoom(page, name, places) {
  await page.fill('#roomIn', name);
  await page.press('#roomIn', 'Enter');
  if (places) {
    const input = page.getByLabel(`Plätze für ${name}`);
    await input.fill(String(places));
    await input.press('Tab');
  }
}
/** Adds a person; times: { 1: ['07:30-12:00', '12:30-16:00'], … } by weekday – days not listed are switched off */
async function addPerson(page, name, times, home) {
  await page.click('#btnAddStaff');
  await page.fill('#sfName', name);
  if (home) await page.selectOption('#sfHome', { label: home });
  for (let d = 1; d <= 5; d++) {
    await wday(page, d).locator('[data-on]').setChecked(!!times[d]);
    if (times[d]) await setBlocks(wday(page, d).locator('.blocks'), times[d]);
  }
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#staffDlg')).toBeHidden();
}
async function setup(page) {
  await tab(page, 'Räume');
  await addRoom(page, 'Anmeldung', 2);
  await addRoom(page, 'Labor');
  await tab(page, 'Team');
  const anna = ['07:30-12:00', '12:30-16:00'];
  await addPerson(page, 'Anna', { 1: anna, 2: anna, 3: ['07:30-12:30'] }, 'Anmeldung');
  await addPerson(page, 'Ben', { 1: ['13:00-18:30'], 2: ['13:00-18:30'] }, 'Labor');
  await addPerson(page, 'Carla', { 1: ['08:00-12:00', '15:00-18:00'] });
  await tab(page, 'Woche');
}
const ANNA = 'Anna (07:30–12:00, 12:30–16:00)';

test('staff: several times per day, gaps are breaks, legal warnings, week total, kept after reload', async ({ page }) => {
  await tab(page, 'Team');
  await expect(page.locator('#staffList')).toHaveText('Noch niemand eingetragen.');
  await page.click('#btnAddStaff');
  await page.fill('#sfName', 'Anna');
  await page.fill('#sfRole', 'MFA');
  const mo = wday(page, 1), net = mo.locator('.net'), blocks = mo.locator('.blocks');
  // Default: 08:00–12:00 and 12:30–16:30
  await expect(net).toHaveText('8 h Arbeitszeit · 30 min Pause');
  await setBlocks(blocks, ['08:00-12:00', '12:30-18:00']);
  await expect(net).toHaveText('9,5 h Arbeitszeit · 30 min Pause · Pause zu kurz: ab mehr als 9 h mind. 45 min');
  await expect(net).toHaveClass(/warn/);
  // One block of 7 h: no break at all
  await page.getByLabel('Montag: Zeit 2 entfernen').click();
  await expect(page.getByLabel('Montag: Zeit 1 entfernen')).toBeDisabled();
  await setBlocks(blocks, ['08:00-15:00']);
  await expect(net).toHaveText('7 h Arbeitszeit · Pause zu kurz: ab mehr als 6 h mind. 30 min');
  // + Time adds a block one hour after the last: 16:00–19:00 → enough break, but 7 h in a row
  await blocks.locator('[data-addblk]').click();
  await expect(blocks.locator('[data-s]')).toHaveCount(2);
  await expect(page.getByLabel('Montag, Zeit 2: von')).toHaveValue('16:00');
  await expect(page.getByLabel('Montag, Zeit 2: bis')).toHaveValue('19:00');
  await expect(net).toHaveText('10 h Arbeitszeit · 1 h Pause · mehr als 6 h am Stück ohne Pause');
  // Morning and afternoon
  await setBlocks(blocks, ['08:00-12:00', '11:00-14:00']);
  await expect(net).toHaveText('Zeiten überschneiden sich');
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#toast')).toHaveText('Bitte die Zeiten prüfen: Ende nach Beginn, keine Überschneidungen.');
  await setBlocks(blocks, ['08:00-12:00', '15:00-18:00']);
  await expect(net).toHaveText('7 h Arbeitszeit · 3 h Pause');
  await expect(net).not.toHaveClass(/warn/);
  for (const d of [2, 3, 4, 5]) await wday(page, d).locator('[data-on]').uncheck();
  await expect(wday(page, 2).locator('.blocks')).toBeHidden();
  await expect(page.locator('#sfTotal')).toHaveText('7 h pro Woche');
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#staffList li')).toHaveText(['Anna · MFAMo · 7 h pro Woche']);
  // Duplicate names are refused
  await page.click('#btnAddStaff');
  await page.fill('#sfName', ' anna ');
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#toast')).toHaveText('„anna“ gibt es schon');
  await page.click('#sfCancel');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true');
  await page.click('[data-edit]');
  expect(await wday(page, 1).locator('input[type=time]').evaluateAll(els => els.map(e => e.value))).toEqual(['08:00', '12:00', '15:00', '18:00']);
  await expect(wday(page, 2).locator('[data-on]')).not.toBeChecked();
});

test('week plan: only people on duty to choose, check for exactly one room, room coverage', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#weekTitle')).toHaveText('KW 47');
  await expect(page.locator('#weekRange')).toHaveText('16.11. – 20.11.2026');
  await expect(page.locator('#days .day')).toHaveCount(5);
  const mon = day(page, MON);
  await expect(mon.locator('.issues li')).toHaveText([
    'Anna ist keinem Raum zugeteilt.', 'Ben ist keinem Raum zugeteilt.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(mon.locator('h2 .badge')).toHaveText('3 ✕');
  await expect(slot(page, WED, 'Labor').locator('option')).toHaveText(['– frei –', 'Anna (07:30–12:30)']);
  await expect(day(page, '2026-11-19').locator('h2 .badge')).toHaveText('niemand im Dienst');
  await expect(page.locator('#weekStatus')).toHaveText('6 Probleme in dieser Woche – siehe die markierten Tage.');

  await slot(page, MON, 'Anmeldung', 0).selectOption({ label: ANNA });
  await slot(page, MON, 'Anmeldung', 1).selectOption({ label: 'Ben (13:00–18:30)' });
  await expect(slot(page, MON, 'Labor').locator('option')).toHaveText([
    '– frei –', `${ANNA} · schon: Anmeldung`, 'Ben (13:00–18:30) · schon: Anmeldung', 'Carla (08:00–12:00, 15:00–18:00)']);
  // Anna's break 12:00–12:30 is a gap in the coverage, Ben covers her afternoon
  await expect(room(page, MON, 'Anmeldung').locator('.room-head .muted')).toHaveText('besetzt 07:30–12:00, 12:30–18:30');
  await slot(page, MON, 'Labor').selectOption({ label: `${ANNA} · schon: Anmeldung` });
  await expect(mon.locator('.issues li')).toHaveText(['Anna ist mehrfach eingeteilt: Anmeldung, Labor.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(slot(page, MON, 'Labor')).toHaveClass(/bad/);
  await slot(page, MON, 'Labor').selectOption({ label: 'Carla (08:00–12:00, 15:00–18:00)' });
  await expect(mon.locator('h2 .badge')).toHaveText('✓ stimmt');
  await expect(room(page, MON, 'Labor').locator('.room-head .muted')).toHaveText('besetzt 08:00–12:00, 15:00–18:00');
  await expect(mon.locator('.chip', { hasText: 'Ben' })).toContainText('13:00–18:30 · Anmeldung');

  for (const [d, r, who] of [[TUE, 'Anmeldung', ANNA], [TUE, 'Labor', 'Ben (13:00–18:30)'], [WED, 'Labor', 'Anna (07:30–12:30)']])
    await slot(page, d, r).selectOption({ label: who });
  await expect(page.locator('#weekStatus')).toHaveText('✓ Alle 5 Tage stimmen – jede Person im Dienst ist genau einem Raum zugeteilt.');
  await expect(page.locator('#weekStatus')).toHaveClass(/ok/);
  await expect(page.locator('#ovTable tbody tr').first()).toHaveText('AnmeldungAnna 07:30–12:00, 12:30–16:00Ben 13:00–18:30Anna 07:30–12:00, 12:30–16:00');
  await page.reload();
  await expect(page.locator('#weekStatus')).toHaveClass(/ok/);
  await page.click('#btnNext');
  await expect(page.locator('#weekTitle')).toHaveText('KW 48');
  await expect(slot(page, '2026-11-23', 'Labor')).toHaveValue('');
  await page.click('#btnToday');
  await expect(page.locator('#weekTitle')).toHaveText('KW 47');
});

test('absences: period, by the hour, assigned absent person is an error, lift one day splits the period', async ({ page }) => {
  await setup(page);
  await slot(page, MON, 'Labor').selectOption({ label: 'Ben (13:00–18:30)' });
  await tab(page, 'Abwesend');
  await page.selectOption('#absWho', { label: 'Ben' });
  await page.selectOption('#absType', { label: 'Urlaub' });
  await page.fill('#absFrom', MON);
  await page.fill('#absTo', '2026-11-20');
  await page.click('#btnAbsAdd');
  await expect(page.locator('#absList li')).toHaveText(['Ben Urlaub16.11.2026 – 20.11.2026✕']);
  await page.fill('#absFrom', '2026-11-25');
  await page.fill('#absTo', '2026-11-24');
  await page.click('#btnAbsAdd');
  await expect(page.locator('#toast')).toHaveText('„Bis“ darf nicht vor „Von“ liegen');
  // By the hour: Carla at the doctor's on Monday afternoon (form)
  await page.selectOption('#absWho', { label: 'Carla' });
  await page.selectOption('#absType', { label: 'Sonstiges' });
  await page.fill('#absFrom', MON);
  await page.fill('#absTo', MON);
  await expect(page.locator('#absS')).toBeHidden();
  await page.check('#absPart');
  await expect(page.locator('#absS')).toHaveValue('13:00');
  await page.fill('#absS', '15:00');
  await page.fill('#absE', '14:00');
  await page.click('#btnAbsAdd');
  await expect(page.locator('#toast')).toHaveText('Bitte Uhrzeiten prüfen (Ende nach Beginn)');
  await page.fill('#absE', '18:00');
  await page.click('#btnAbsAdd');

  await tab(page, 'Woche');
  const mon = day(page, MON);
  await expect(mon.locator('.issues li')).toHaveText([
    'Anna ist keinem Raum zugeteilt.', 'Ben ist abwesend (Urlaub), aber eingeteilt: Labor.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(slot(page, MON, 'Labor').locator('option:checked')).toHaveText('Ben – abwesend');
  // Carla keeps her morning
  await expect(mon.locator('.chip', { hasText: 'Carla' }).first()).toContainText('08:00–12:00 · kein Raum');
  await expect(mon.locator('.chips').last()).toHaveText('BenUrlaubCarlaSonstiges 15:00–18:00');
  await expect(slot(page, TUE, 'Labor').locator('option')).toHaveText(['– frei –', ANNA]);

  // By the hour from the week plan: Anna on holiday Monday afternoon
  await mon.locator('.chips').first().locator('.chip', { hasText: 'Anna' }).click();
  await page.selectOption('#dfAbsType', { label: 'Urlaub' });
  await expect(page.locator('#dfAbsTimes')).toBeHidden();
  await page.check('#dfAbsPart');
  await page.fill('#dfAbsS', '12:00');
  await page.fill('#dfAbsE', '16:00');
  await page.click('#dfAbsBtn');
  await expect(mon.locator('.chips').first().locator('.chip', { hasText: 'Anna' })).toContainText('07:30–12:00 · kein Raum');
  await expect(slot(page, MON, 'Anmeldung').locator('option')).toContainText(['Anna (07:30–12:00)']);
  await expect(mon.locator('.chips').last()).toHaveText('AnnaUrlaub 12:00–16:00BenUrlaubCarlaSonstiges 15:00–18:00');

  // Lift Tuesday: the holiday becomes Mon and Wed–Fri
  await day(page, TUE).locator('.chip', { hasText: 'Ben' }).click();
  await expect(page.locator('#dfAbsInfo')).toHaveText('Abwesend: Urlaub (16.11.2026 – 20.11.2026)');
  await expect(page.locator('#dfTimeSet')).toBeHidden();
  await page.click('#dfAbsLift');
  await expect(page.locator('#dfAbsInfo')).toHaveText('An diesem Tag nicht abwesend.');
  await page.click('#dfClose');
  await expect(slot(page, TUE, 'Labor').locator('option')).toHaveText(['– frei –', ANNA, 'Ben (13:00–18:30)']);
  // Past absences (ended before today, Wednesday) are hidden unless asked for
  await tab(page, 'Abwesend');
  await expect(page.locator('#absList li .muted')).toHaveText(['18.11.2026 – 20.11.2026']);
  await page.check('#absPast');
  await expect(page.locator('#absList li .badge')).toHaveText(['Urlaub 12:00–16:00', 'Urlaub', 'Sonstiges 15:00–18:00', 'Urlaub']);
  await page.click('[aria-label="Abwesenheit von Carla entfernen"]');
  await expect(page.locator('#absList li')).toHaveCount(3);
});

test('day changes: other times for one day, off duty, add someone who usually does not work', async ({ page }) => {
  await setup(page);
  const wed = day(page, WED);
  await wed.locator('.chip', { hasText: 'Anna' }).click();
  await expect(page.locator('#dfRegular')).toHaveText('Regulär: 07:30–12:30');
  await page.locator('#dfBlocks [data-addblk]').click();
  await expect(page.locator('#dfNet')).toHaveText('8 h Arbeitszeit · 1 h Pause');
  await page.click('#dfSave');
  await expect(wed.locator('.chip', { hasText: 'Anna' })).toContainText('07:30–12:30, 13:30–16:30 · kein Raum · abweichend');
  // Ben does not work on Wednesdays: add him for this day
  await wed.locator('[data-add]').click();
  await expect(page.locator('#dfPick option')).toHaveText(['Ben', 'Carla']);
  await page.selectOption('#dfPick', { label: 'Ben' });
  await expect(page.locator('#dfRegular')).toHaveText('Regulär an diesem Tag nicht im Dienst');
  await setBlocks(page.locator('#dfBlocks'), ['13:00-17:00']);
  await page.click('#dfSave');
  await expect(slot(page, WED, 'Labor').locator('option')).toHaveText(['– frei –', 'Anna (07:30–12:30, 13:30–16:30)', 'Ben (13:00–17:00)']);
  await slot(page, WED, 'Labor').selectOption({ label: 'Ben (13:00–17:00)' });
  // Off duty while assigned → error; back to regular
  await wed.locator('.chip', { hasText: 'Ben' }).click();
  await page.click('#dfFree');
  await expect(wed.locator('.issues li')).toHaveText(['Anna ist keinem Raum zugeteilt.', 'Ben ist nicht im Dienst, aber eingeteilt: Labor.']);
  await expect(slot(page, WED, 'Labor').locator('option:checked')).toHaveText('Ben – nicht im Dienst');
  await slot(page, WED, 'Labor').selectOption('');
  await wed.locator('.chip', { hasText: 'Anna' }).click();
  await page.click('#dfReset');
  await page.click('#dfClose');
  await expect(wed.locator('.chip', { hasText: 'Anna' })).toContainText('07:30–12:30 · kein Raum');
  await expect(wed.locator('.chip', { hasText: 'Ben' })).toHaveCount(0);
});

test('fill automatically from the previous week and home rooms, clear week', async ({ page }) => {
  await setup(page);
  await page.click('#btnPrev');
  await slot(page, '2026-11-09', 'Labor').selectOption({ label: ANNA });
  await page.click('#btnNext');
  await page.click('#btnFill');
  // Mon: Anna → Labor (last week), Ben → home Labor is full, Carla has no home room;
  // Tue: Anna → Anmeldung, Ben → Labor (home rooms); Wed: Anna → Anmeldung
  await expect(page.locator('#toast')).toHaveText('4 Einteilungen ergänzt');
  await expect(slot(page, MON, 'Labor').locator('option:checked')).toHaveText(/^Anna/);
  await expect(day(page, MON).locator('.issues li')).toHaveText(['Ben ist keinem Raum zugeteilt.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(day(page, TUE).locator('h2 .badge')).toHaveText('✓ stimmt');
  await expect(slot(page, WED, 'Anmeldung').locator('option:checked')).toHaveText(/^Anna/);
  await page.click('#btnClearWeek');
  await expect(page.locator('#toast')).toHaveText('Woche geleert');
  await expect(page.locator('#weekStatus')).toHaveText('6 Probleme in dieser Woche – siehe die markierten Tage.');
  await page.click('#btnPrev');
  await expect(slot(page, '2026-11-09', 'Labor').locator('option:checked')).toHaveText(/^Anna/);
});

test('rooms: places, order, rename, delete removes assignments', async ({ page }) => {
  await setup(page);
  await slot(page, MON, 'Anmeldung', 1).selectOption({ label: 'Ben (13:00–18:30)' });
  await tab(page, 'Räume');
  await page.getByLabel('Labor nach oben').click();
  const names = () => page.locator('#roomList [data-name]').evaluateAll(els => els.map(e => e.value));
  expect(await names()).toEqual(['Labor', 'Anmeldung']);
  await page.getByLabel('Plätze für Anmeldung').fill('1');
  await page.getByLabel('Plätze für Anmeldung').press('Tab');
  await page.getByLabel('Name von Labor').fill('Labor 1');
  await page.getByLabel('Name von Labor').press('Tab');
  await tab(page, 'Woche');
  await expect(day(page, MON).locator('.room-head > span:first-child')).toHaveText(['Labor 1', 'Anmeldung']);
  await expect(room(page, MON, 'Anmeldung').locator('select')).toHaveCount(1);
  await expect(day(page, MON).locator('.chip', { hasText: 'Ben' })).toContainText('kein Raum');
  await tab(page, 'Räume');
  await page.getByLabel('Labor 1 entfernen').click();
  await expect(page.locator('#roomList li')).toHaveCount(1);
  expect(await names()).toEqual(['Anmeldung']);
  await openMenu(page);
  await page.locator('#daysSet label', { hasText: 'Sa' }).locator('input').check();
  await closeMenu(page);
  await tab(page, 'Woche');
  await expect(page.locator('#days .day')).toHaveCount(6);
  await expect(page.locator('#weekRange')).toHaveText('16.11. – 21.11.2026');
});

test('export: text to copy, CSV with semicolons, example data', async ({ page }) => {
  await page.click('#btnExample');
  await expect(page.locator('#toast')).toHaveText('Beispiel geladen');
  await expect(page.locator('#weekStatus')).toHaveClass(/ok/);
  await expect(day(page, WED).locator('.chips').last()).toHaveText('DoraFortbildung');
  await page.click('#btnCopy');
  await expect(page.locator('#toast')).toHaveText('Plan kopiert');
  const text = await clipboardText(page);
  expect(text.split('\n').slice(0, 8)).toEqual([
    'Dienstplan KW 47 (16.11. – 20.11.2026)', '',
    'Montag, 16.11.',
    'Anmeldung: Anna (07:30–12:00, 12:30–16:00); Ben (13:00–18:30)',
    'Labor: Carla (07:30–11:30, 15:00–18:00)',
    'Sprechzimmer 1: Dr. Weber (08:00–12:00, 15:00–18:00)',
    'Sprechzimmer 2: Dr. Yilmaz (08:00–12:30, 13:30–17:00)',
    'Funktionsraum: Dora (08:00–12:00, 12:30–16:30)',
  ]);
  expect(text).toContain('Mittwoch, 18.11.\nAnmeldung: Anna (07:30–12:00, 12:30–16:00)\nLabor: Carla (07:30–11:30, 15:00–18:00)\nSprechzimmer 1: Dr. Weber (08:00–13:00)\nAbwesend: Dora (Fortbildung)');
  // Anna is on holiday on Friday afternoon
  expect(text).toContain('Freitag, 20.11.\nAnmeldung: Anna (07:30–12:00)\n');
  expect(text).toMatch(/Abwesend: Anna \(Urlaub 12:30–16:00\)$/);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  expect(download.suggestedFilename()).toBe('dienstplan-kw47-2026.csv');
  const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
  expect(csv[0]).toBe('Datum;Tag;Raum;Name;Zeiten;Arbeitszeit (h);Abwesenheit');
  expect(csv[1]).toBe('2026-11-16;Mo;Anmeldung;Anna;07:30–12:00 / 12:30–16:00;8;');
  expect(csv).toContain('2026-11-16;Mo;Sprechzimmer 2;Dr. Yilmaz;08:00–12:30 / 13:30–17:00;8;');
  expect(csv).toContain('2026-11-18;Mi;Abwesend;Dora;;;Fortbildung');
  expect(csv).toContain('2026-11-20;Fr;Anmeldung;Anna;07:30–12:00;4,5;Urlaub 12:30–16:00');
  await page.reload();
  await expect(page.locator('#btnExample')).toBeHidden();
});

test('stored data of the first version (one time plus break minutes) is taken over', async ({ page }) => {
  const v1 = {
    days: [1, 2, 3, 4, 5],
    rooms: [{ id: 'r1', name: 'Labor', slots: 1 }],
    staff: [{ id: 'p1', name: 'Anna', role: '', home: 'r1', times: { 1: { s: '08:00', e: '16:30', p: 30 }, 2: { s: '08:00', e: '12:00', p: 0 } } }],
    absences: [],
    plans: { [MON]: { a: { r1: ['p1'] }, o: {} }, [TUE]: { a: {}, o: { p1: { s: '09:00', e: '13:00', p: 0 } } } },
  };
  await page.evaluate(d => localStorage.setItem('duty-roster.data.v1', JSON.stringify(d)), v1);
  await page.reload();
  // The break is put in the middle of the day: 08:00–12:00, 12:30–16:30 (8 h as before)
  await expect(day(page, MON).locator('.chip', { hasText: 'Anna' })).toContainText('08:00–12:00, 12:30–16:30 · Labor');
  await expect(day(page, TUE).locator('.chip', { hasText: 'Anna' })).toContainText('09:00–13:00 · kein Raum · abweichend');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('duty-roster.data')))).toEqual(['duty-roster.data.v2']);
  await tab(page, 'Team');
  await expect(page.locator('#staffList li')).toHaveText(['AnnaMo, Di · 12 h pro Woche']);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('week plan, check and CSV in English', async ({ page }) => {
    await page.click('#btnExample');
    await expect(page.locator('#weekTitle')).toHaveText('Week 47');
    await expect(page.locator('#weekStatus')).toHaveText('✓ All 5 days are fine – everyone on duty is assigned to exactly one room.');
    await expect(day(page, MON).locator('.room-head > span:first-child')).toHaveText(['Reception', 'Lab', 'Consulting room 1', 'Consulting room 2', 'Diagnostics room']);
    await slot(page, MON, 'Lab').selectOption('');
    await expect(day(page, MON).locator('.issues li')).toHaveText(['Carla is not assigned to a room.']);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
    expect(download.suggestedFilename()).toBe('duty-roster-week47-2026.csv');
    const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
    expect(csv[0]).toBe('Date,Day,Room,Name,Times,Working time (h),Absence');
    expect(csv).toContain('2026-11-16,Mon,Consulting room 1,Dr. Weber,08:00–12:00 / 15:00–18:00,7,');
    expect(csv).toContain('2026-11-16,Mon,,Carla,07:30–11:30 / 15:00–18:00,7,');
    expect(csv).toContain('2026-11-20,Fri,Reception,Anna,07:30–12:00,4.5,Holiday 12:30–16:00');
    await switchLang(page, 'de');
    await expect(page.locator('#weekTitle')).toHaveText('KW 47');
    await expect(day(page, MON).locator('.issues li')).toHaveText(['Carla ist keinem Raum zugeteilt.']);
  });
});

test('WebMCP: read the week, assign a room, add absences', async ({ page }) => {
  await setup(page);
  const call = (name, input) => page.evaluate(async ([n, i]) => {
    const tool = Tools.mcp.tools().find(x => x.name === 'duty_roster_' + n);
    try { return { ok: true, result: await tool.execute(i) }; } catch (e) { return { ok: false, error: e.message }; }
  }, [name, input]);
  const staff = (await call('get_staff', {})).result;
  const annaDay = { times: [{ start: '07:30', end: '12:00' }, { start: '12:30', end: '16:00' }], workHours: 8, breakMinutes: 30 };
  expect(staff.staff[0]).toEqual({ name: 'Anna', role: '', homeRoom: 'Anmeldung', regularHours: {
    monday: annaDay, tuesday: annaDay, wednesday: { times: [{ start: '07:30', end: '12:30' }], workHours: 5, breakMinutes: 0 } } });
  expect(staff.rooms).toEqual([{ name: 'Anmeldung', places: 2 }, { name: 'Labor', places: 1 }]);

  let r = await call('assign_room', { date: MON, name: 'anna', room: 'Labor' });
  expect(r.ok).toBe(true);
  r = await call('assign_room', { date: MON, name: 'Anna', room: 'Anmeldung' });
  const mon = r.result.days[0];
  expect(mon.rooms).toEqual([{ room: 'Anmeldung', places: 2, people: ['Anna'] }, { room: 'Labor', places: 1, people: [] }]);
  expect(mon.problems.map(p => p.name)).toEqual(['Ben', 'Carla']);
  await expect(slot(page, MON, 'Anmeldung').locator('option:checked')).toHaveText(/^Anna/);
  await call('assign_room', { date: MON, name: 'Ben', room: 'Labor' });
  expect((await call('assign_room', { date: MON, name: 'Carla', room: 'Labor' })).error).toBe('Labor has no free place on 2026-11-16 (1 places).');
  expect((await call('assign_room', { date: WED, name: 'Ben', room: 'Labor' })).error).toBe('Ben is not on duty on 2026-11-18.');
  expect((await call('assign_room', { date: '2026-02-30', name: 'Ben', room: 'Labor' })).error).toBe('date must be a valid date as YYYY-MM-DD');
  expect((await call('assign_room', { date: MON, name: 'Zoe', room: 'Labor' })).error).toBe('Unknown person: Zoe. Known: Anna, Ben, Carla');

  r = await call('add_absence', { name: 'Ben', from: MON, to: TUE, type: 'sick' });
  expect(r.result).toEqual({ added: { name: 'Ben', from: MON, to: TUE, type: 'sick', allDay: true }, absences: [] });
  expect((await call('add_absence', { name: 'Anna', from: MON, startTime: '12:00' })).error).toBe('Give both startTime and endTime, or neither.');
  expect((await call('add_absence', { name: 'Anna', from: MON, startTime: '16:00', endTime: '12:00' })).error).toBe('startTime and endTime must be HH:MM with endTime after startTime.');
  r = await call('add_absence', { name: 'Anna', from: MON, type: 'holiday', startTime: '12:00', endTime: '16:00' });
  expect(r.result.added).toEqual({ name: 'Anna', from: MON, to: MON, type: 'holiday', startTime: '12:00', endTime: '16:00' });
  const week = (await call('get_week', { date: '2026-11-20' })).result;
  expect(week.isoWeek).toBe(47);
  expect(week.complete).toBe(false);
  expect(week.days[0].onDuty[0]).toEqual({ name: 'Anna', times: [{ start: '07:30', end: '12:00' }], workHours: 4.5, breakMinutes: 0, changedForThisDay: false, rooms: ['Anmeldung'] });
  expect(week.days[0].absent).toEqual([
    { name: 'Anna', absences: [{ type: 'holiday', startTime: '12:00', endTime: '16:00' }] },
    { name: 'Ben', absences: [{ type: 'sick', allDay: true }] }]);
  expect(week.days[0].problems).toEqual([
    { type: 'assigned_but_absent', name: 'Ben', rooms: ['Labor'] },
    { type: 'not_assigned', name: 'Carla', rooms: [] }]);
  await expect(day(page, MON).locator('.issues li').first()).toHaveText('Ben ist abwesend (Krank), aber eingeteilt: Labor.');
});
