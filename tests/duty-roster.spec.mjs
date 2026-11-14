// Dienstplan: staff with working times (several blocks per day, gaps = breaks), rooms with places (people at the
// same time), absences (all day or by the hour), the week plan with one room per working time block (room change
// during the day, one room shared morning/afternoon) and its check, day changes, auto-fill, text/CSV export,
// English, WebMCP, migration of older formats.
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
/** The room choice of one working time block, e.g. sel(page, MON, 'Anna', '07:30–12:00') */
const sel = (page, date, name, time) => day(page, date).getByLabel(`Raum für ${name}, ${time}`, { exact: true });
/** Chooses a room by its name (the option text may add “· mit …” / “· voll …”) */
async function pick(select, room) {
  const labels = await select.locator('option').allTextContents();
  const label = labels.find(l => l === room || l.startsWith(room + ' ·'));
  if (!label) throw new Error(`no option ${room} in ${labels.join(' | ')}`);
  await select.selectOption({ label });
}
const personRow = (page, date, name) => day(page, date).locator('.prow').filter({ has: page.locator('.pn').getByText(name, { exact: true }) });
const openPerson = (page, date, name) => personRow(page, date, name).locator('.pname').click();
const roomLine = (page, date, room) => day(page, date).locator('.roomsum li').filter({ has: page.locator('.rn', { hasText: new RegExp(`^${room}$`) }) });
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
  await page.getByLabel('Montag: Zeit 2 entfernen').click();
  await expect(page.getByLabel('Montag: Zeit 1 entfernen')).toBeDisabled();
  await setBlocks(blocks, ['08:00-15:00']);
  await expect(net).toHaveText('7 h Arbeitszeit · Pause zu kurz: ab mehr als 6 h mind. 30 min');
  // Two times right after each other (room change without a break) are no break
  await setBlocks(blocks, ['08:00-11:00', '11:00-15:00']);
  await expect(net).toHaveText('7 h Arbeitszeit · Pause zu kurz: ab mehr als 6 h mind. 30 min');
  // + Time adds a block one hour after the last
  await setBlocks(blocks, ['08:00-15:00']);
  await blocks.locator('[data-addblk]').click();
  await expect(page.getByLabel('Montag, Zeit 2: von')).toHaveValue('16:00');
  await expect(page.getByLabel('Montag, Zeit 2: bis')).toHaveValue('19:00');
  await expect(net).toHaveText('10 h Arbeitszeit · 1 h Pause · mehr als 6 h am Stück ohne Pause');
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

test('week plan: one room per working time, room change, shared room, overbooking, check', async ({ page }) => {
  await setup(page);
  await expect(page.locator('#weekTitle')).toHaveText('KW 47');
  await expect(page.locator('#weekRange')).toHaveText('16.11. – 20.11.2026');
  await expect(page.locator('#days .day')).toHaveCount(5);
  const mon = day(page, MON);
  await expect(mon.locator('.issues li')).toHaveText([
    'Anna ist keinem Raum zugeteilt.', 'Ben ist keinem Raum zugeteilt.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(mon.locator('h2 .badge')).toHaveText('3 ✕');
  await expect(personRow(page, MON, 'Anna').locator('select')).toHaveCount(2);
  await expect(sel(page, WED, 'Anna', '07:30–12:30').locator('option')).toHaveText(['– kein Raum –', 'Anmeldung', 'Labor']);
  await expect(day(page, '2026-11-19').locator('h2 .badge')).toHaveText('niemand im Dienst');
  await expect(page.locator('#weekStatus')).toHaveText('6 Probleme in dieser Woche – siehe die markierten Tage.');

  // Room change: Anna at reception in the morning, in the lab in the afternoon
  await pick(sel(page, MON, 'Anna', '07:30–12:00'), 'Anmeldung');
  await expect(mon.locator('.issues li').first()).toHaveText('Anna hat für 12:30–16:00 keinen Raum.');
  await pick(sel(page, MON, 'Anna', '12:30–16:00'), 'Labor');
  await pick(sel(page, MON, 'Ben', '13:00–18:30'), 'Anmeldung');
  // The lab is shared: Carla in the morning, Anna in the afternoon
  await expect(sel(page, MON, 'Carla', '08:00–12:00').locator('option')).toHaveText(['– kein Raum –', 'Anmeldung · mit Anna', 'Labor']);
  await pick(sel(page, MON, 'Carla', '08:00–12:00'), 'Labor');
  // Carla's afternoon overlaps Anna in the lab (1 place) and Ben at reception (2 places)
  await expect(sel(page, MON, 'Carla', '15:00–18:00').locator('option')).toHaveText(['– kein Raum –', 'Anmeldung · mit Ben', 'Labor · voll (Anna)']);
  await pick(sel(page, MON, 'Carla', '15:00–18:00'), 'Labor');
  await expect(mon.locator('.issues li')).toHaveText(['Labor ist 15:00–16:00 überbelegt: Anna, Carla – Plätze: 1.']);
  await expect(roomLine(page, MON, 'Labor')).toHaveClass(/bad/);
  await pick(sel(page, MON, 'Carla', '15:00–18:00'), 'Anmeldung');
  await expect(mon.locator('h2 .badge')).toHaveText('✓ stimmt');
  await expect(roomLine(page, MON, 'Anmeldung').locator('> .muted')).toHaveText('besetzt 07:30–12:00, 13:00–18:30');
  await expect(roomLine(page, MON, 'Anmeldung').locator('.who')).toHaveText('Anna 07:30–12:00 · Ben 13:00–18:30 · Carla 15:00–18:00');
  await expect(roomLine(page, MON, 'Labor').locator('.who')).toHaveText('Anna 12:30–16:00 · Carla 08:00–12:00');
  await expect(roomLine(page, MON, 'Labor').locator('> .muted')).toHaveText('besetzt 08:00–12:00, 12:30–16:00');

  await pick(sel(page, TUE, 'Anna', '07:30–12:00'), 'Anmeldung');
  await pick(sel(page, TUE, 'Anna', '12:30–16:00'), 'Anmeldung');
  await pick(sel(page, TUE, 'Ben', '13:00–18:30'), 'Labor');
  await pick(sel(page, WED, 'Anna', '07:30–12:30'), 'Labor');
  await expect(page.locator('#weekStatus')).toHaveText('✓ Alle 5 Tage stimmen – jede Person ist für ihre ganze Arbeitszeit genau einem Raum zugeteilt.');
  await expect(page.locator('#weekStatus')).toHaveClass(/ok/);
  await expect(page.locator('#ovTable tbody tr').first()).toHaveText('AnmeldungAnna 07:30–12:00Ben 13:00–18:30Carla 15:00–18:00Anna 07:30–12:00, 12:30–16:00');
  await page.reload();
  await expect(page.locator('#weekStatus')).toHaveClass(/ok/);
  await expect(sel(page, MON, 'Anna', '12:30–16:00')).toHaveValue(/./);
  await page.click('#btnNext');
  await expect(page.locator('#weekTitle')).toHaveText('KW 48');
  await expect(sel(page, '2026-11-23', 'Ben', '13:00–18:30')).toHaveValue('');
  await page.click('#btnToday');
  await expect(page.locator('#weekTitle')).toHaveText('KW 47');
});

test('absences: period, by the hour, assigned absent person is an error, lift one day splits the period', async ({ page }) => {
  await setup(page);
  await pick(sel(page, MON, 'Ben', '13:00–18:30'), 'Labor');
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
  // By the hour: Carla away on Monday afternoon (form)
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
  await expect(sel(page, MON, 'Ben', '13:00–18:30')).toHaveClass(/bad/);
  // Carla keeps her morning only
  await expect(personRow(page, MON, 'Carla').locator('select')).toHaveCount(1);
  await expect(personRow(page, MON, 'Carla').locator('.pname small')).toHaveText('4 h Arbeitszeit · Sonstiges 15:00–18:00');
  await expect(mon.locator('.chips').last()).toHaveText('BenUrlaub');
  await expect(personRow(page, TUE, 'Ben')).toHaveCount(0);
  await pick(sel(page, MON, 'Ben', '13:00–18:30'), '– kein Raum –');
  await expect(personRow(page, MON, 'Ben')).toHaveCount(0);

  // By the hour from the week plan: Anna on holiday Monday afternoon
  await openPerson(page, MON, 'Anna');
  await page.selectOption('#dfAbsType', { label: 'Urlaub' });
  await expect(page.locator('#dfAbsTimes')).toBeHidden();
  await page.check('#dfAbsPart');
  await page.fill('#dfAbsS', '12:00');
  await page.fill('#dfAbsE', '16:00');
  await page.click('#dfAbsBtn');
  await expect(personRow(page, MON, 'Anna').locator('select')).toHaveCount(1);
  await expect(personRow(page, MON, 'Anna').locator('.pname small')).toHaveText('4,5 h Arbeitszeit · Urlaub 12:00–16:00');

  // Lift Tuesday: the holiday becomes Mon and Wed–Fri
  await day(page, TUE).locator('.chip', { hasText: 'Ben' }).click();
  await expect(page.locator('#dfAbsInfo')).toHaveText('Abwesend: Urlaub (16.11.2026 – 20.11.2026)');
  await expect(page.locator('#dfTimeSet')).toBeHidden();
  await page.click('#dfAbsLift');
  await expect(page.locator('#dfAbsInfo')).toHaveText('An diesem Tag nicht abwesend.');
  await page.click('#dfClose');
  await expect(sel(page, TUE, 'Ben', '13:00–18:30')).toBeVisible();
  await tab(page, 'Abwesend');
  await expect(page.locator('#absList li .muted')).toHaveText(['18.11.2026 – 20.11.2026']);
  await page.check('#absPast');
  await expect(page.locator('#absList li .badge')).toHaveText(['Urlaub 12:00–16:00', 'Urlaub', 'Sonstiges 15:00–18:00', 'Urlaub']);
  await page.click('[aria-label="Abwesenheit von Carla entfernen"]');
  await expect(page.locator('#absList li')).toHaveCount(3);
});

test('day changes: split the time for a room change without a break, off duty, add someone', async ({ page }) => {
  await setup(page);
  const wed = day(page, WED);
  await pick(sel(page, WED, 'Anna', '07:30–12:30'), 'Labor');
  await openPerson(page, WED, 'Anna');
  await expect(page.locator('#dfRegular')).toHaveText('Regulär: 07:30–12:30');
  await setBlocks(page.locator('#dfBlocks'), ['07:30-10:00', '10:00-12:30']);
  await expect(page.locator('#dfNet')).toHaveText('5 h Arbeitszeit');
  await page.click('#dfSave');
  // Both parts keep the lab; then reception from 10:00
  await expect(sel(page, WED, 'Anna', '07:30–10:00').locator('option:checked')).toHaveText('Labor');
  await expect(sel(page, WED, 'Anna', '10:00–12:30').locator('option:checked')).toHaveText('Labor');
  await pick(sel(page, WED, 'Anna', '10:00–12:30'), 'Anmeldung');
  await expect(personRow(page, WED, 'Anna').locator('.pname small')).toHaveText('5 h Arbeitszeit · abweichend');
  await expect(roomLine(page, WED, 'Labor').locator('.who')).toHaveText('Anna 07:30–10:00');
  await expect(roomLine(page, WED, 'Anmeldung').locator('.who')).toHaveText('Anna 10:00–12:30');
  await expect(wed.locator('h2 .badge')).toHaveText('✓ stimmt');
  // Ben does not work on Wednesdays: add him for this day
  await wed.locator('[data-add]').click();
  await expect(page.locator('#dfPick option')).toHaveText(['Ben', 'Carla']);
  await page.selectOption('#dfPick', { label: 'Ben' });
  await expect(page.locator('#dfRegular')).toHaveText('Regulär an diesem Tag nicht im Dienst');
  await setBlocks(page.locator('#dfBlocks'), ['13:00-17:00']);
  await page.click('#dfSave');
  await pick(sel(page, WED, 'Ben', '13:00–17:00'), 'Labor');
  // Off duty while assigned → error
  await openPerson(page, WED, 'Ben');
  await page.click('#dfFree');
  await expect(wed.locator('.issues li')).toHaveText(['Ben ist nicht im Dienst, aber eingeteilt: Labor.']);
  await expect(personRow(page, WED, 'Ben').locator('.pname small')).toHaveText('nicht im Dienst');
  await pick(personRow(page, WED, 'Ben').locator('select'), '– kein Raum –');
  await expect(personRow(page, WED, 'Ben')).toHaveCount(0);
  // Back to the regular time: the room of the larger overlap stays
  await openPerson(page, WED, 'Anna');
  await page.click('#dfReset');
  await page.click('#dfClose');
  await expect(sel(page, WED, 'Anna', '07:30–12:30').locator('option:checked')).toHaveText('Labor');
  await expect(personRow(page, WED, 'Anna').locator('.pname small')).toHaveText('5 h Arbeitszeit');
});

test('fill automatically from the previous week and home rooms, only where a place is free', async ({ page }) => {
  await setup(page);
  await page.click('#btnPrev');
  await pick(sel(page, '2026-11-09', 'Anna', '12:30–16:00'), 'Labor');
  await page.click('#btnNext');
  await page.click('#btnFill');
  // Mon: Anna → Labor (last week) for both times; Ben's home Labor is taken 13:00–16:00; Carla has no home room.
  // Tue: Anna → Anmeldung twice, Ben → Labor; Wed: Anna → Anmeldung
  await expect(page.locator('#toast')).toHaveText('6 Einteilungen ergänzt');
  await expect(sel(page, MON, 'Anna', '12:30–16:00').locator('option:checked')).toHaveText('Labor');
  await expect(day(page, MON).locator('.issues li')).toHaveText(['Ben ist keinem Raum zugeteilt.', 'Carla ist keinem Raum zugeteilt.']);
  await expect(day(page, TUE).locator('h2 .badge')).toHaveText('✓ stimmt');
  await expect(sel(page, WED, 'Anna', '07:30–12:30').locator('option:checked')).toHaveText('Anmeldung');
  await page.click('#btnClearWeek');
  await expect(page.locator('#toast')).toHaveText('Woche geleert');
  await expect(page.locator('#weekStatus')).toHaveText('6 Probleme in dieser Woche – siehe die markierten Tage.');
  await page.click('#btnPrev');
  await expect(sel(page, '2026-11-09', 'Anna', '12:30–16:00').locator('option:checked')).toHaveText('Labor');
});

test('rooms: places, order, rename, delete removes assignments', async ({ page }) => {
  await setup(page);
  await pick(sel(page, MON, 'Anna', '12:30–16:00'), 'Anmeldung');
  await pick(sel(page, MON, 'Ben', '13:00–18:30'), 'Anmeldung');
  await pick(sel(page, MON, 'Carla', '15:00–18:00'), 'Labor');
  await tab(page, 'Räume');
  await page.getByLabel('Labor nach oben').click();
  const names = () => page.locator('#roomList [data-name]').evaluateAll(els => els.map(e => e.value));
  expect(await names()).toEqual(['Labor', 'Anmeldung']);
  // One place only: Anna and Ben overlap 13:00–16:00
  await page.getByLabel('Plätze für Anmeldung').fill('1');
  await page.getByLabel('Plätze für Anmeldung').press('Tab');
  await page.getByLabel('Name von Labor').fill('Labor 1');
  await page.getByLabel('Name von Labor').press('Tab');
  await tab(page, 'Woche');
  await expect(day(page, MON).locator('.roomsum .rn')).toHaveText(['Labor 1', 'Anmeldung']);
  await expect(day(page, MON).locator('.issues li').last()).toHaveText('Anmeldung ist 13:00–16:00 überbelegt: Anna, Ben – Plätze: 1.');
  await tab(page, 'Räume');
  await page.getByLabel('Labor 1 entfernen').click();
  await expect(page.locator('#roomList li')).toHaveCount(1);
  expect(await names()).toEqual(['Anmeldung']);
  await tab(page, 'Woche');
  await expect(sel(page, MON, 'Carla', '15:00–18:00')).toHaveValue('');
  await openMenu(page);
  await page.locator('#daysSet label', { hasText: 'Sa' }).locator('input').check();
  await closeMenu(page);
  await expect(page.locator('#days .day')).toHaveCount(6);
  await expect(page.locator('#weekRange')).toHaveText('16.11. – 21.11.2026');
});

test('export: text to copy, CSV with semicolons, example data with room changes', async ({ page }) => {
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
    'Anmeldung: Anna (07:30–12:00); Ben (13:00–18:30); Carla (15:00–18:00)',
    'Labor: Anna (12:30–16:00); Carla (07:30–11:30)',
    'Sprechzimmer 1: Dr. Weber (08:00–12:00, 15:00–18:00)',
    'Sprechzimmer 2: Dr. Yilmaz (08:00–12:30, 13:30–17:00)',
    'Funktionsraum: Dora (08:00–12:00, 12:30–16:30)',
  ]);
  expect(text).toContain('Mittwoch, 18.11.\nAnmeldung: Anna (07:30–12:00); Carla (15:00–18:00)\nLabor: Anna (12:30–16:00); Carla (07:30–11:30)\nSprechzimmer 1: Dr. Weber (08:00–13:00)\nAbwesend: Dora (Fortbildung)');
  // Anna is on holiday on Friday afternoon
  expect(text).toContain('Freitag, 20.11.\nAnmeldung: Anna (07:30–12:00); Carla (15:00–18:00)\nLabor: Carla (07:30–11:30)\n');
  expect(text).toMatch(/Abwesend: Anna \(Urlaub 12:30–16:00\)$/);

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  expect(download.suggestedFilename()).toBe('dienstplan-kw47-2026.csv');
  const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
  expect(csv[0]).toBe('Datum;Tag;Raum;Name;Zeiten;Arbeitszeit (h);Abwesenheit');
  expect(csv[1]).toBe('2026-11-16;Mo;Anmeldung;Anna;07:30–12:00;4,5;');
  expect(csv).toContain('2026-11-16;Mo;Labor;Anna;12:30–16:00;3,5;');
  expect(csv).toContain('2026-11-16;Mo;Sprechzimmer 2;Dr. Yilmaz;08:00–12:30 / 13:30–17:00;8;');
  expect(csv).toContain('2026-11-18;Mi;Abwesend;Dora;;;Fortbildung');
  expect(csv).toContain('2026-11-20;Fr;Anmeldung;Anna;07:30–12:00;4,5;Urlaub 12:30–16:00');
  await page.reload();
  await expect(page.locator('#btnExample')).toBeHidden();
});

test('stored data of older versions is taken over', async ({ page }) => {
  // v1: one time plus break minutes, one room per day (plans[date].a[room] = [person])
  const v1 = {
    days: [1, 2, 3, 4, 5],
    rooms: [{ id: 'r1', name: 'Labor', slots: 1 }],
    staff: [{ id: 'p1', name: 'Anna', role: '', home: 'r1', times: { 1: { s: '08:00', e: '16:30', p: 30 }, 2: { s: '08:00', e: '12:00', p: 0 } } }],
    absences: [],
    plans: { [MON]: { a: { r1: ['p1'] }, o: {} }, [TUE]: { a: {}, o: { p1: { s: '09:00', e: '13:00', p: 0 } } } },
  };
  await page.evaluate(d => localStorage.setItem('duty-roster.data.v1', JSON.stringify(d)), v1);
  await page.reload();
  // The break is put in the middle of the day: 08:00–12:00, 12:30–16:30 (8 h as before), both in the lab
  await expect(roomLine(page, MON, 'Labor').locator('.who')).toHaveText('Anna 08:00–12:00, 12:30–16:30');
  await expect(day(page, MON).locator('h2 .badge')).toHaveText('✓ stimmt');
  await expect(personRow(page, TUE, 'Anna').locator('.pname small')).toHaveText('4 h Arbeitszeit · abweichend');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('duty-roster.data')))).toEqual(['duty-roster.data.v3']);
  await tab(page, 'Team');
  await expect(page.locator('#staffList li')).toHaveText(['AnnaMo, Di · 12 h pro Woche']);

  // v2: blocks, still one room per day
  await page.evaluate(() => {
    localStorage.removeItem('duty-roster.data.v3');
    localStorage.setItem('duty-roster.data.v2', JSON.stringify({
      rooms: [{ id: 'r1', name: 'Labor', slots: 1 }],
      staff: [{ id: 'p1', name: 'Anna', times: { 1: [{ s: '07:00', e: '11:00' }, { s: '14:00', e: '17:00' }] } }],
      plans: { '2026-11-16': { a: { r1: ['p1'] }, o: {} } },
    }));
  });
  await page.reload();
  await tab(page, 'Woche');
  await expect(roomLine(page, MON, 'Labor').locator('.who')).toHaveText('Anna 07:00–11:00, 14:00–17:00');
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('duty-roster.data')))).toEqual(['duty-roster.data.v3']);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('week plan, check and CSV in English', async ({ page }) => {
    await page.click('#btnExample');
    await expect(page.locator('#weekTitle')).toHaveText('Week 47');
    await expect(page.locator('#weekStatus')).toHaveText('✓ All 5 days are fine – everyone is assigned to exactly one room for all of their working time.');
    await expect(day(page, MON).locator('.roomsum .rn')).toHaveText(['Reception', 'Lab', 'Consulting room 1', 'Consulting room 2', 'Diagnostics room']);
    await day(page, MON).getByLabel('Room for Carla, 07:30–11:30', { exact: true }).selectOption('');
    await expect(day(page, MON).locator('.issues li')).toHaveText(['Carla has no room for 07:30–11:30.']);
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
    expect(download.suggestedFilename()).toBe('duty-roster-week47-2026.csv');
    const csv = readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').split('\r\n');
    expect(csv[0]).toBe('Date,Day,Room,Name,Times,Working time (h),Absence');
    expect(csv).toContain('2026-11-16,Mon,Consulting room 1,Dr. Weber,08:00–12:00 / 15:00–18:00,7,');
    expect(csv).toContain('2026-11-16,Mon,,Carla,07:30–11:30,4,');
    expect(csv).toContain('2026-11-20,Fri,Reception,Anna,07:30–12:00,4.5,Holiday 12:30–16:00');
    await switchLang(page, 'de');
    await expect(page.locator('#weekTitle')).toHaveText('KW 47');
    await expect(day(page, MON).locator('.issues li')).toHaveText(['Carla hat für 07:30–11:30 keinen Raum.']);
  });
});

test('WebMCP: read the week, assign rooms per working time, add absences', async ({ page }) => {
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

  // All blocks, then only the morning block elsewhere: room change
  expect((await call('assign_room', { date: MON, name: 'anna', room: 'Labor' })).ok).toBe(true);
  let r = await call('assign_room', { date: MON, name: 'Anna', room: 'Anmeldung', time: '08:00' });
  const mon = r.result.days[0];
  expect(mon.rooms).toEqual([
    { room: 'Anmeldung', places: 2, people: [{ name: 'Anna', times: [{ start: '07:30', end: '12:00' }] }] },
    { room: 'Labor', places: 1, people: [{ name: 'Anna', times: [{ start: '12:30', end: '16:00' }] }] }]);
  expect(mon.onDuty[0]).toEqual({ name: 'Anna', times: [{ start: '07:30', end: '12:00', room: 'Anmeldung' }, { start: '12:30', end: '16:00', room: 'Labor' }],
    workHours: 8, breakMinutes: 30, changedForThisDay: false });
  expect(mon.problems).toEqual([
    { type: 'no_room', name: 'Ben', times: [{ start: '13:00', end: '18:30' }] },
    { type: 'no_room', name: 'Carla', times: [{ start: '08:00', end: '12:00' }, { start: '15:00', end: '18:00' }] }]);
  await expect(sel(page, MON, 'Anna', '07:30–12:00').locator('option:checked')).toHaveText('Anmeldung');
  // Carla's afternoon would overbook the lab: refused, nothing changed
  expect((await call('assign_room', { date: MON, name: 'Carla', room: 'Labor' })).error)
    .toBe('Labor has no free place 15:00–16:00 on 2026-11-16 (1 places, already: Anna).');
  await expect(sel(page, MON, 'Carla', '08:00–12:00')).toHaveValue('');
  expect((await call('assign_room', { date: MON, name: 'Carla', room: 'Labor', time: '09:00' })).ok).toBe(true);
  expect((await call('assign_room', { date: MON, name: 'Ben', room: 'Anmeldung' })).ok).toBe(true);
  expect((await call('assign_room', { date: MON, name: 'Ben', room: 'Labor', time: '20:00' })).error).toBe('Ben does not work at 20:00 on 2026-11-16. Working times: 13:00–18:30.');
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
  expect(week.days[0].onDuty[0]).toEqual({ name: 'Anna', times: [{ start: '07:30', end: '12:00', room: 'Anmeldung' }], workHours: 4.5, breakMinutes: 0, changedForThisDay: false });
  expect(week.days[0].absent).toEqual([
    { name: 'Anna', absences: [{ type: 'holiday', startTime: '12:00', endTime: '16:00' }] },
    { name: 'Ben', absences: [{ type: 'sick', allDay: true }] }]);
  expect(week.days[0].problems).toEqual([
    { type: 'assigned_but_absent', name: 'Anna', rooms: ['Labor'] },
    { type: 'assigned_but_absent', name: 'Ben', rooms: ['Anmeldung'] },
    { type: 'no_room', name: 'Carla', times: [{ start: '15:00', end: '18:00' }] }]);
  await expect(day(page, MON).locator('.issues li').nth(1)).toHaveText('Ben ist abwesend (Krank), aber eingeteilt: Anmeldung.');
});
