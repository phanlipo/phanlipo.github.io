// Dienstplan: staff with working hours and breaks, rooms, absences, the week plan with its check
// (everyone on duty in exactly one room), day changes, auto-fill, text/CSV export, English, WebMCP.
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
/** The select of a room's place – matched by the room's name (option texts also mention rooms) */
const room = (page, date, name) => day(page, date).locator('.room').filter({ has: page.locator('.room-head > span:first-child').getByText(name, { exact: true }) });
const slot = (page, date, name, i = 0) => room(page, date, name).locator('select').nth(i);

async function addRoom(page, name, places) {
  await page.fill('#roomIn', name);
  await page.press('#roomIn', 'Enter');
  if (places) {
    const input = page.getByLabel(`Plätze für ${name}`);
    await input.fill(String(places));
    await input.press('Tab');
  }
}
/** Adds a person; times: { Mo: ['08:00', '12:00', 0], … } – days not listed are switched off */
async function addPerson(page, name, times, home) {
  await page.click('#btnAddStaff');
  await page.fill('#sfName', name);
  if (home) await page.selectOption('#sfHome', { label: home });
  for (const [i, d] of ['Mo', 'Di', 'Mi', 'Do', 'Fr'].entries()) {
    const row = page.locator(`#sfTimes .trow[data-wd="${i + 1}"]`);
    const t = times[d];
    await row.locator('[data-on]').setChecked(!!t);
    if (!t) continue;
    await row.locator('[data-s]').fill(t[0]);
    await row.locator('[data-e]').fill(t[1]);
    await row.locator('[data-p]').fill(String(t[2]));
  }
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#staffDlg')).toBeHidden();
}
async function setup(page) {
  await tab(page, 'Räume');
  await addRoom(page, 'Anmeldung', 2);
  await addRoom(page, 'Labor');
  await tab(page, 'Team');
  await addPerson(page, 'Anna', { Mo: ['07:30', '16:00', 30], Di: ['07:30', '16:00', 30], Mi: ['07:30', '12:30', 0] }, 'Anmeldung');
  await addPerson(page, 'Ben', { Mo: ['12:00', '18:30', 30], Di: ['12:00', '18:30', 30] }, 'Labor');
  await addPerson(page, 'Carla', { Mo: ['08:00', '12:00', 0] });
  await tab(page, 'Woche');
}

test('staff: working time without break, legal break warnings, week total, kept after reload', async ({ page }) => {
  await tab(page, 'Team');
  await expect(page.locator('#staffList')).toHaveText('Noch niemand eingetragen.');
  await page.click('#btnAddStaff');
  await page.fill('#sfName', 'Anna');
  await page.fill('#sfRole', 'MFA');
  const mo = page.locator('#sfTimes .trow[data-wd="1"]');
  // 07:30–16:00 with 30 min = 8 h
  await mo.locator('[data-s]').fill('07:30');
  await mo.locator('[data-e]').fill('16:00');
  await mo.locator('[data-p]').fill('30');
  await expect(mo.locator('.net')).toHaveText('8 h Arbeitszeit (30 min Pause)');
  // 6 h 20 min without break needs 30 min
  await mo.locator('[data-e]').fill('13:50');
  await mo.locator('[data-p]').fill('0');
  await expect(mo.locator('.net')).toHaveText('6,33 h Arbeitszeit (0 min Pause) · Pause zu kurz: ab mehr als 6 h mind. 30 min');
  await expect(mo.locator('.net')).toHaveClass(/warn/);
  // 07:00–17:00 with 30 min = 9.5 h needs 45 min
  await mo.locator('[data-s]').fill('07:00');
  await mo.locator('[data-e]').fill('17:00');
  await mo.locator('[data-p]').fill('30');
  await expect(mo.locator('.net')).toHaveText('9,5 h Arbeitszeit (30 min Pause) · Pause zu kurz: ab mehr als 9 h mind. 45 min');
  await mo.locator('[data-p]').fill('45');
  await expect(mo.locator('.net')).toHaveText('9,25 h Arbeitszeit (45 min Pause)');
  // Only Mon and Tue: 9.25 + 8 (08:00–16:30, 30 min default) = 17.25 h
  for (const d of [3, 4, 5]) await page.locator(`#sfTimes .trow[data-wd="${d}"] [data-on]`).uncheck();
  await expect(page.locator('#sfTotal')).toHaveText('17,25 h pro Woche');
  // End before start is refused
  const di = page.locator('#sfTimes .trow[data-wd="2"]');
  await di.locator('[data-e]').fill('07:00');
  await expect(di.locator('.net')).toHaveText('Ende muss nach dem Beginn liegen');
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#toast')).toHaveText('Bitte Beginn und Ende prüfen (Ende nach Beginn).');
  await di.locator('[data-e]').fill('16:30');
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#staffList li')).toHaveText(['Anna · MFAMo, Di · 17,25 h pro Woche']);
  // Duplicate names are refused
  await page.click('#btnAddStaff');
  await page.fill('#sfName', ' anna ');
  await page.click('#staffForm button[type=submit]');
  await expect(page.locator('#toast')).toHaveText('„anna“ gibt es schon');
  await page.click('#sfCancel');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Team' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#staffCount')).toHaveText('1');
  await page.click('[data-edit]');
  await expect(page.locator('#sfTimes .trow[data-wd="1"] [data-p]')).toHaveValue('45');
});

test('week plan: only people on duty to choose, check for exactly one room, room coverage', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#weekTitle')).toHaveText('KW 47');
  await expect(page.locator('#weekRange')).toHaveText('16.11. – 20.11.2026');
  await expect(page.locator('#days .day')).toHaveCount(5);
  // Monday: Anna, Ben, Carla on duty – nobody assigned yet
  const mon = day(page, MON);
  await expect(mon.locator('.issues li')).toHaveText([
    'Anna ist keinem Raum zugeteilt.', 'Ben ist keinem Raum zugeteilt.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(mon.locator('h2 .badge')).toHaveText('3 ✕');
  // Wednesday only Anna; Thursday nobody
  await expect(slot(page, WED, 'Labor').locator('option')).toHaveText(['– frei –', 'Anna (07:30–12:30)']);
  await expect(day(page, '2026-11-19').locator('h2 .badge')).toHaveText('niemand im Dienst');
  await expect(page.locator('#weekStatus')).toHaveText('6 Probleme in dieser Woche – siehe die markierten Tage.');

  await slot(page, MON, 'Anmeldung', 0).selectOption({ label: 'Anna (07:30–16:00)' });
  await slot(page, MON, 'Anmeldung', 1).selectOption({ label: 'Ben (12:00–18:30)' });
  // Already assigned people are marked in the other selects
  await expect(slot(page, MON, 'Labor').locator('option')).toHaveText([
    '– frei –', 'Anna (07:30–16:00) · schon: Anmeldung', 'Ben (12:00–18:30) · schon: Anmeldung', 'Carla (08:00–12:00)']);
  await expect(room(page, MON, 'Anmeldung').locator('.room-head .muted')).toHaveText('besetzt 07:30–18:30');
  // Double assignment is an error
  await slot(page, MON, 'Labor').selectOption({ label: 'Anna (07:30–16:00) · schon: Anmeldung' });
  await expect(mon.locator('.issues li')).toHaveText(['Anna ist mehrfach eingeteilt: Anmeldung, Labor.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(slot(page, MON, 'Labor')).toHaveClass(/bad/);
  await slot(page, MON, 'Labor').selectOption({ label: 'Carla (08:00–12:00)' });
  await expect(mon.locator('h2 .badge')).toHaveText('✓ stimmt');
  await expect(room(page, MON, 'Labor').locator('.room-head .muted')).toHaveText('besetzt 08:00–12:00');
  await expect(mon.locator('.chip', { hasText: 'Ben' })).toContainText('12:00–18:30 · Anmeldung');

  for (const [d, room, who] of [[TUE, 'Anmeldung', 'Anna (07:30–16:00)'], [TUE, 'Labor', 'Ben (12:00–18:30)'], [WED, 'Labor', 'Anna (07:30–12:30)']])
    await slot(page, d, room).selectOption({ label: who });
  await expect(page.locator('#weekStatus')).toHaveText('✓ Alle 5 Tage stimmen – jede Person im Dienst ist genau einem Raum zugeteilt.');
  await expect(page.locator('#weekStatus')).toHaveClass(/ok/);
  // Overview table
  await expect(page.locator('#ovTable tbody tr').first()).toHaveText('AnmeldungAnna 07:30–16:00Ben 12:00–18:30Anna 07:30–16:00');
  // Kept after reload; other weeks are empty
  await page.reload();
  await expect(page.locator('#weekStatus')).toHaveClass(/ok/);
  await page.click('#btnNext');
  await expect(page.locator('#weekTitle')).toHaveText('KW 48');
  await expect(slot(page, '2026-11-23', 'Labor')).toHaveValue('');
  await page.click('#btnToday');
  await expect(page.locator('#weekTitle')).toHaveText('KW 47');
});

test('absences: period, assigned absent person is an error, lift one day splits the period', async ({ page }) => {
  await setup(page);
  await slot(page, MON, 'Labor').selectOption({ label: 'Ben (12:00–18:30)' });
  await tab(page, 'Abwesend');
  await page.selectOption('#absWho', { label: 'Ben' });
  await page.selectOption('#absType', { label: 'Urlaub' });
  await page.fill('#absFrom', MON);
  await page.fill('#absTo', '2026-11-20');
  await page.click('#btnAbsAdd');
  await expect(page.locator('#absList li')).toHaveText(['Ben Urlaub16.11.2026 – 20.11.2026✕']);
  // "To" before "From" is refused
  await page.fill('#absFrom', '2026-11-25');
  await page.fill('#absTo', '2026-11-24');
  await page.click('#btnAbsAdd');
  await expect(page.locator('#toast')).toHaveText('„Bis“ darf nicht vor „Von“ liegen');

  await tab(page, 'Woche');
  const mon = day(page, MON);
  await expect(mon.locator('.issues li')).toContainText(['Ben ist abwesend (Urlaub), aber eingeteilt: Labor.']);
  await expect(slot(page, MON, 'Labor').locator('option:checked')).toHaveText('Ben – abwesend');
  await expect(mon.locator('.chips').last()).toHaveText('BenUrlaub');
  await expect(slot(page, TUE, 'Labor').locator('option')).toHaveText(['– frei –', 'Anna (07:30–16:00)']);

  // Lift Tuesday: the holiday becomes Mon and Wed–Fri
  await day(page, TUE).locator('.chip', { hasText: 'Ben' }).click();
  await expect(page.locator('#dfAbsInfo')).toHaveText('Abwesend: Urlaub (16.11.2026 – 20.11.2026)');
  await page.click('#dfAbsLift');
  await expect(page.locator('#dfAbsInfo')).toHaveText('An diesem Tag nicht abwesend.');
  await page.click('#dfClose');
  await expect(slot(page, TUE, 'Labor').locator('option')).toHaveText(['– frei –', 'Anna (07:30–16:00)', 'Ben (12:00–18:30)']);
  // Past absences (ended before today, Wednesday) are hidden unless asked for
  await tab(page, 'Abwesend');
  await expect(page.locator('#absList li .muted')).toHaveText(['18.11.2026 – 20.11.2026']);
  await page.check('#absPast');
  await expect(page.locator('#absList li .muted')).toHaveText(['16.11.2026', '18.11.2026 – 20.11.2026']);

  // One-day absence from the week plan: Carla sick on Monday
  await tab(page, 'Woche');
  await mon.locator('.chip', { hasText: 'Carla' }).click();
  await page.selectOption('#dfAbsType', { label: 'Krank' });
  await page.click('#dfAbsBtn');
  await expect(mon.locator('.chips').last()).toHaveText(['BenUrlaubCarlaKrank']);
  await expect(mon.locator('.issues li')).not.toContainText(['Carla']);
  await tab(page, 'Abwesend');
  await expect(page.locator('#absList li')).toHaveCount(3);
  await page.click('[aria-label="Abwesenheit von Carla entfernen"]');
  await expect(page.locator('#absList li')).toHaveCount(2);
});

test('day changes: other hours for one day, off duty, add someone who usually does not work', async ({ page }) => {
  await setup(page);
  const wed = day(page, WED);
  await wed.locator('.chip', { hasText: 'Anna' }).click();
  await expect(page.locator('#dfRegular')).toHaveText('Regulär: 07:30–12:30, 0 min Pause');
  await page.fill('#dfEnd', '16:00');
  await expect(page.locator('#dfNet')).toHaveText('8,5 h Arbeitszeit (0 min Pause) · Pause zu kurz: ab mehr als 6 h mind. 30 min');
  await page.fill('#dfPause', '30');
  await page.click('#dfSave');
  await expect(wed.locator('.chip', { hasText: 'Anna' })).toContainText('07:30–16:00 · kein Raum · abweichend');
  // Ben does not work on Wednesdays: add him for this day
  await wed.locator('[data-add]').click();
  await expect(page.locator('#dfPick option')).toHaveText(['Ben', 'Carla']);
  await page.selectOption('#dfPick', { label: 'Ben' });
  await expect(page.locator('#dfRegular')).toHaveText('Regulär an diesem Tag nicht im Dienst');
  await page.fill('#dfStart', '13:00');
  await page.fill('#dfEnd', '17:00');
  await page.fill('#dfPause', '0');
  await page.click('#dfSave');
  await expect(slot(page, WED, 'Labor').locator('option')).toHaveText(['– frei –', 'Anna (07:30–16:00)', 'Ben (13:00–17:00)']);
  await slot(page, WED, 'Labor').selectOption({ label: 'Ben (13:00–17:00)' });
  // Off duty while assigned → error; back to regular
  await wed.locator('.chip', { hasText: 'Ben' }).click();
  await page.click('#dfFree');
  await expect(wed.locator('.issues li')).toHaveText(['Anna ist keinem Raum zugeteilt.', 'Ben ist nicht im Dienst, aber eingeteilt: Labor.']);
  await slot(page, WED, 'Labor').selectOption('');
  await wed.locator('.chip', { hasText: 'Anna' }).click();
  await page.click('#dfReset');
  await page.click('#dfClose');
  await expect(wed.locator('.chip', { hasText: 'Anna' })).toContainText('07:30–12:30 · kein Raum');
  await expect(wed.locator('.chip', { hasText: 'Ben' })).toHaveCount(0);
});

test('fill automatically from the previous week and home rooms, clear week', async ({ page }) => {
  await setup(page);
  // Previous week: Anna in Labor on Monday
  await page.click('#btnPrev');
  await slot(page, '2026-11-09', 'Labor').selectOption({ label: 'Anna (07:30–16:00)' });
  await page.click('#btnNext');
  await page.click('#btnFill');
  // Mon: Anna → Labor (last week), Ben → Labor full → nothing (home Labor), Carla has no home room
  await expect(page.locator('#toast')).toHaveText('4 Einteilungen ergänzt');
  await expect(slot(page, MON, 'Labor')).toHaveValue(/./);
  await expect(slot(page, MON, 'Labor').locator('option:checked')).toHaveText(/^Anna/);
  await expect(day(page, MON).locator('.issues li')).toHaveText(['Ben ist keinem Raum zugeteilt.', 'Carla ist keinem Raum zugeteilt.']);
  // Tue: Anna → home Anmeldung, Ben → home Labor; Wed: Anna → Anmeldung
  await expect(day(page, TUE).locator('h2 .badge')).toHaveText('✓ stimmt');
  await expect(slot(page, WED, 'Anmeldung').locator('option:checked')).toHaveText(/^Anna/);
  await page.click('#btnClearWeek');
  await expect(page.locator('#toast')).toHaveText('Woche geleert');
  await expect(page.locator('#weekStatus')).toHaveText('6 Probleme in dieser Woche – siehe die markierten Tage.');
  // The previous week is untouched
  await page.click('#btnPrev');
  await expect(slot(page, '2026-11-09', 'Labor').locator('option:checked')).toHaveText(/^Anna/);
});

test('rooms: places, order, rename, delete removes assignments', async ({ page }) => {
  await setup(page);
  await slot(page, MON, 'Anmeldung', 1).selectOption({ label: 'Ben (12:00–18:30)' });
  await tab(page, 'Räume');
  await page.getByLabel('Labor nach oben').click();
  const names = () => page.locator('#roomList [data-name]').evaluateAll(els => els.map(e => e.value));
  expect(await names()).toEqual(['Labor', 'Anmeldung']);
  // One place only: Ben (2nd place) is dropped
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
  // Weekdays in the plan (menu)
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
  // Dora is at a training on Wednesday
  await expect(day(page, WED).locator('.chips').last()).toHaveText('DoraFortbildung');
  await page.click('#btnCopy');
  await expect(page.locator('#toast')).toHaveText('Plan kopiert');
  const text = await clipboardText(page);
  expect(text.split('\n').slice(0, 8)).toEqual([
    'Dienstplan KW 47 (16.11. – 20.11.2026)', '',
    'Montag, 16.11.',
    'Anmeldung: Anna (07:30–16:00), Ben (12:00–18:30)',
    'Labor: Carla (07:30–12:30)',
    'Sprechzimmer 1: Dr. Weber (08:00–18:00)',
    'Sprechzimmer 2: Dr. Yilmaz (08:00–17:00)',
    'Funktionsraum: Dora (08:00–16:30)',
  ]);
  expect(text).toContain('Mittwoch, 18.11.\nAnmeldung: Anna (07:30–16:00)\nLabor: Carla (07:30–12:30)\nSprechzimmer 1: Dr. Weber (08:00–13:00)\nAbwesend: Dora (Fortbildung)');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  expect(download.suggestedFilename()).toBe('dienstplan-kw47-2026.csv');
  const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
  expect(csv[0]).toBe('Datum;Tag;Raum;Name;Beginn;Ende;Pause (min);Arbeitszeit (h);Abwesenheit');
  expect(csv[1]).toBe('2026-11-16;Mo;Anmeldung;Anna;07:30;16:00;30;8;');
  expect(csv).toContain('2026-11-16;Mo;Sprechzimmer 1;Dr. Weber;08:00;18:00;90;8,5;');
  expect(csv).toContain('2026-11-18;Mi;Abwesend;Dora;;;;;Fortbildung');
  // The example is only offered while nothing is entered
  await page.reload();
  await expect(page.locator('#btnExample')).toBeHidden();
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
    expect(csv[0]).toBe('Date,Day,Room,Name,Start,End,Break (min),Working time (h),Absence');
    expect(csv).toContain('2026-11-16,Mon,Consulting room 1,Dr. Weber,08:00,18:00,90,8.5,');
    expect(csv).toContain('2026-11-16,Mon,,Carla,07:30,12:30,0,5,');
    await switchLang(page, 'de');
    await expect(page.locator('#weekTitle')).toHaveText('KW 47');
    await expect(day(page, MON).locator('.issues li')).toHaveText(['Carla ist keinem Raum zugeteilt.']);
  });
});

test('WebMCP: read the week, assign a room, add an absence', async ({ page }) => {
  await setup(page);
  const call = (name, input) => page.evaluate(async ([n, i]) => {
    const tool = Tools.mcp.tools().find(x => x.name === 'duty_roster_' + n);
    try { return { ok: true, result: await tool.execute(i) }; } catch (e) { return { ok: false, error: e.message }; }
  }, [name, input]);
  const staff = (await call('get_staff', {})).result;
  expect(staff.staff[0]).toEqual({ name: 'Anna', role: '', homeRoom: 'Anmeldung', regularHours: {
    monday: { start: '07:30', end: '16:00', breakMinutes: 30, workHours: 8 },
    tuesday: { start: '07:30', end: '16:00', breakMinutes: 30, workHours: 8 },
    wednesday: { start: '07:30', end: '12:30', breakMinutes: 0, workHours: 5 } } });
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
  expect(r.result).toEqual({ added: { name: 'Ben', type: 'sick', from: MON, to: TUE }, absences: [] });
  const week = (await call('get_week', { date: '2026-11-20' })).result;
  expect(week.isoWeek).toBe(47);
  expect(week.complete).toBe(false);
  expect(week.days[0].absent).toEqual([{ name: 'Ben', type: 'sick' }]);
  expect(week.days[0].problems).toEqual([
    { type: 'assigned_but_absent', name: 'Ben', rooms: ['Labor'] },
    { type: 'not_assigned', name: 'Carla', rooms: [] }]);
  await expect(day(page, MON).locator('.issues li').first()).toHaveText('Ben ist abwesend (Krank), aber eingeteilt: Labor.');
});
