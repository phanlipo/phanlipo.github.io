// Calendar event: .ics content (RFC 5545), links to Google/Outlook, share link across time zones, reading .ics files.
// Expected values worked out by hand: Europe/Berlin is UTC+1 in winter, UTC+2 in summer;
// summer time 2026 runs from 29 March 01:00 UTC to 25 October 01:00 UTC. New York is UTC−5 in December.
import { readFileSync } from 'node:fs';
import { test, expect, clipboardText, mockLaunchQueue, openMenu, closeMenu } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Berlin' });
// Thursday 29 Oct 2026, 10:00 CET
const NOW = new Date('2026-10-29T10:00:00+01:00');

test.beforeEach(async ({ page }) => {
  // Date stands still, timers keep running (toasts, file hand-over)
  await page.clock.setFixedTime(NOW);
});

async function fillEvent(page, { title, sd, st, ed, et, loc, desc, url }) {
  if (title != null) await page.fill('#title', title);
  if (sd != null) await page.fill('#sd', sd);
  if (st != null) await page.fill('#st', st);
  if (ed != null) await page.fill('#ed', ed);
  if (et != null) await page.fill('#et', et);
  if (loc != null) await page.fill('#loc', loc);
  if (desc != null) await page.fill('#desc', desc);
  if (url != null) await page.fill('#url', url);
}
async function saveIcs(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnIcs')]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') };
}
const unfold = s => s.replace(/\r\n /g, '');
const lines = s => unfold(s).split('\r\n');
const params = href => Object.fromEntries(new URL(href).searchParams);

test('a new event starts at the next full hour with the default duration and reminder', async ({ page }) => {
  await page.goto('/calendar-events/');
  await expect(page.locator('#sd')).toHaveValue('2026-10-29');
  await expect(page.locator('#st')).toHaveValue('11:00');
  await expect(page.locator('#ed')).toHaveValue('2026-10-29');
  await expect(page.locator('#et')).toHaveValue('12:00');
  await expect(page.locator('#alarm')).toHaveValue('15');
  await expect(page.locator('#tzHint')).toHaveText('Zeitzone: Europe/Berlin');
  // No title yet: no complaint until the user tries to add the event
  await expect(page.locator('#msg')).toBeHidden();
  await page.click('#btnIcs');
  await expect(page.locator('#msg')).toHaveText('Bitte einen Titel eingeben.');
  await expect(page.locator('#list li')).toHaveCount(0);
});

test('.ics of a one-off event: UTC times, escaped text, reminder, CRLF and folded lines', async ({ page }) => {
  await page.goto('/calendar-events/');
  const desc = 'ä'.repeat(100);
  await fillEvent(page, { title: 'Essen; mit, Oma', sd: '2026-12-24', st: '18:00', ed: '2026-12-24', et: '20:30', loc: 'Café Müller', desc, url: 'beispiel.de/tisch' });
  await expect(page.locator('#pvTitle')).toHaveText('Essen; mit, Oma');
  await expect(page.locator('#pvWhen')).toHaveText('Do., 24. Dez. 2026, 18:00 – 20:30');
  await expect(page.locator('#pvMeta')).toHaveText('📍 Café Müller · ⏰ Erinnerung: 15 Minuten vorher');
  const { name, text } = await saveIcs(page);
  expect(name).toBe('Essen; mit, Oma.ics');
  // Every line ends with CRLF, none is longer than 75 bytes
  expect(text.endsWith('\r\n')).toBe(true);
  expect(text.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  for (const l of text.split('\r\n')) expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75);
  const L = lines(text);
  expect(L.slice(0, 5)).toEqual(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//phanlipo.github.io//calendar-events//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH']);
  expect(L).toContain('DTSTAMP:20261029T090000Z');
  // 18:00 CET = 17:00 UTC
  expect(L).toContain('DTSTART:20261224T170000Z');
  expect(L).toContain('DTEND:20261224T193000Z');
  expect(L).toContain('SUMMARY:Essen\\; mit\\, Oma');
  expect(L).toContain('LOCATION:Café Müller');
  expect(L).toContain('DESCRIPTION:' + desc);
  expect(L).toContain('URL:https://beispiel.de/tisch');
  expect(L.join('\n')).toContain('BEGIN:VALARM\nACTION:DISPLAY\nDESCRIPTION:Essen\\; mit\\, Oma\nTRIGGER:-PT15M\nEND:VALARM\nEND:VEVENT\nEND:VCALENDAR');
  expect(L.find(l => l.startsWith('UID:'))).toMatch(/^UID:[a-z0-9]+@phanlipo\.github\.io$/);
  expect(L).not.toContain('BEGIN:VTIMEZONE');
  // Saved in "My events"
  await expect(page.locator('#list li')).toHaveCount(1);
  await expect(page.locator('#list .name')).toHaveText('Essen; mit, Oma');
  await expect(page.locator('#list .load')).toHaveAttribute('aria-current', 'true');
});

test('repeating event: wall-clock time with time zone and the zone’s clock changes', async ({ page }) => {
  await page.goto('/calendar-events/');
  await fillEvent(page, { title: 'Yoga', sd: '2026-11-05', st: '10:00', ed: '2026-11-05', et: '11:00' });
  await page.selectOption('#repeat', 'WEEKLY');
  await expect(page.locator('#countWrap')).toBeVisible();
  await page.fill('#count', '5');
  await page.selectOption('#alarm', '1440');
  await expect(page.locator('#pvMeta')).toHaveText('🔁 Wöchentlich, 5-mal · ⏰ Erinnerung: 1 Tag vorher');
  const L = lines((await saveIcs(page)).text);
  expect(L).toContain('DTSTART;TZID=Europe/Berlin:20261105T100000');
  expect(L).toContain('DTEND;TZID=Europe/Berlin:20261105T110000');
  expect(L).toContain('RRULE:FREQ=WEEKLY;COUNT=5');
  expect(L).toContain('TRIGGER:-P1D');
  const tz = L.slice(L.indexOf('BEGIN:VTIMEZONE'), L.indexOf('END:VTIMEZONE') + 1);
  expect(tz).toEqual([
    'BEGIN:VTIMEZONE', 'TZID:Europe/Berlin',
    // 29 March 2026, 02:00 CET → 03:00 CEST: last Sunday in March
    'BEGIN:DAYLIGHT', 'DTSTART:20260329T020000', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
    // 25 October 2026, 03:00 CEST → 02:00 CET: last Sunday in October
    'BEGIN:STANDARD', 'DTSTART:20261025T030000', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
    'END:VTIMEZONE',
  ]);
  expect(L.indexOf('BEGIN:VTIMEZONE')).toBeLessThan(L.indexOf('BEGIN:VEVENT'));
  // Google takes the wall-clock time with the zone and the repetition
  expect(params(await page.locator('#btnGoogle').getAttribute('href'))).toEqual({
    action: 'TEMPLATE', text: 'Yoga', dates: '20261105T100000/20261105T110000', ctz: 'Europe/Berlin', recur: 'RRULE:FREQ=WEEKLY;COUNT=5',
  });
});

test('all-day events: the end date is inclusive in the app, exclusive in the file and the links', async ({ page }) => {
  await page.goto('/calendar-events/');
  await page.fill('#title', 'Weihnachten bei Oma');
  await page.check('#allDay');
  await expect(page.locator('#st')).toBeHidden();
  await expect(page.locator('#tzHint')).toBeHidden();
  await page.fill('#sd', '2026-12-24');
  await page.fill('#ed', '2026-12-26');
  await page.selectOption('#alarm', '-1');
  await expect(page.locator('#pvWhen')).toHaveText('Do., 24. Dez. 2026 – Sa., 26. Dez. 2026');
  const L = lines((await saveIcs(page)).text);
  expect(L).toContain('DTSTART;VALUE=DATE:20261224');
  expect(L).toContain('DTEND;VALUE=DATE:20261227');
  expect(L).not.toContain('BEGIN:VALARM');
  expect(params(await page.locator('#btnGoogle').getAttribute('href'))).toMatchObject({ dates: '20261224/20261227' });
  expect(params(await page.locator('#btnOutlook').getAttribute('href'))).toMatchObject({ startdt: '2026-12-24', enddt: '2026-12-27', allday: 'true' });
  // One day only
  await page.fill('#ed', '2026-12-24');
  await expect(page.locator('#pvWhen')).toHaveText('Do., 24. Dez. 2026, ganztägig');
});

test('Google and Outlook links carry the event; tapping one saves it to the list', async ({ page }) => {
  await page.goto('/calendar-events/');
  await expect(page.locator('#btnGoogle')).toHaveAttribute('href', '#');
  await fillEvent(page, { title: 'Essen', sd: '2026-12-24', st: '18:00', ed: '2026-12-24', et: '20:30', loc: 'Café Müller', desc: 'Tisch für 4', url: 'https://beispiel.de' });
  expect(params(await page.locator('#btnGoogle').getAttribute('href'))).toEqual({
    action: 'TEMPLATE', text: 'Essen', dates: '20261224T180000/20261224T203000', ctz: 'Europe/Berlin',
    details: 'Tisch für 4\n\nhttps://beispiel.de', location: 'Café Müller',
  });
  const outlook = await page.locator('#btnOutlook').getAttribute('href');
  expect(outlook.startsWith('https://outlook.live.com/calendar/0/action/compose?')).toBe(true);
  expect(params(outlook)).toEqual({
    path: '/calendar/action/compose', rru: 'addevent', subject: 'Essen',
    startdt: '2026-12-24T18:00:00+01:00', enddt: '2026-12-24T20:30:00+01:00', allday: 'false',
    body: 'Tisch für 4\n\nhttps://beispiel.de', location: 'Café Müller',
  });
  await expect(page.locator('#btnGoogle')).toHaveAttribute('target', '_blank');
  // Tapping opens Google in a new tab – the test only checks that the event was saved first
  await page.context().route('https://calendar.google.com/**', r => r.fulfill({ body: 'ok' }));
  const [tab] = await Promise.all([page.context().waitForEvent('page'), page.click('#btnGoogle')]);
  await tab.close();
  await expect(page.locator('#list .name')).toHaveText('Essen');
});

test('moving the start keeps the duration; an end before the start is reported', async ({ page }) => {
  await page.goto('/calendar-events/');
  await page.fill('#title', 'Termin');
  await page.fill('#sd', '2026-11-02');
  await expect(page.locator('#ed')).toHaveValue('2026-11-02');
  await page.fill('#st', '23:30');
  await expect(page.locator('#ed')).toHaveValue('2026-11-03');
  await expect(page.locator('#et')).toHaveValue('00:30');
  await page.fill('#et', '00:15');
  await page.fill('#ed', '2026-11-02');
  await expect(page.locator('#msg')).toHaveText('Das Ende liegt vor dem Beginn.');
  await expect(page.locator('#preview')).toBeHidden();
  await page.click('#btnIcs');
  await expect(page.locator('#list li')).toHaveCount(0);
  await page.fill('#ed', '2026-11-03');
  await expect(page.locator('#msg')).toBeHidden();
  await page.fill('#url', 'ftp://server');
  await expect(page.locator('#msg')).toHaveText('Der Link muss mit http:// oder https:// beginnen.');
  await page.fill('#url', '');
  await page.selectOption('#repeat', 'DAILY');
  await page.fill('#count', '0');
  await expect(page.locator('#msg')).toContainText('Anzahl');
});

test('share link: the event travels in the link and is converted to the recipient’s time zone', async ({ page, browser, baseURL }) => {
  await page.addInitScript(() => {
    window.__shared = [];
    navigator.share = async data => { window.__shared.push(data); };
  });
  await page.goto('/calendar-events/');
  await fillEvent(page, { title: 'Anruf mit Tom', sd: '2026-12-01', st: '18:00', ed: '2026-12-01', et: '18:30', loc: 'Telefon', desc: 'Zeile 1\nZeile 2' });
  await page.selectOption('#repeat', 'MONTHLY');
  await page.fill('#count', '3');
  await page.click('#btnShare');
  const [shared] = await page.evaluate(() => window.__shared);
  expect(shared.title).toBe('Anruf mit Tom');
  expect(shared.text).toBe('Anruf mit Tom\n🗓 Di., 1. Dez. 2026, 18:00 – 18:30\n📍 Telefon\n🔁 Monatlich, 3-mal\n\nZeile 1\nZeile 2');
  const link = new URL(shared.url);
  expect(link.pathname).toBe('/calendar-events/');
  expect(link.search).toBe('');
  expect(Object.fromEntries(new URLSearchParams(link.hash.slice(1)))).toEqual({
    t: 'Anruf mit Tom', s: '2026-12-01', st: '18:00', e: '2026-12-01', et: '18:30', z: 'Europe/Berlin',
    l: 'Telefon', d: 'Zeile 1\nZeile 2', r: 'monthly', c: '3', m: '15',
  });
  await expect(page.locator('#list .name')).toHaveText('Anruf mit Tom');

  // In New York (UTC−5) 18:00 in Berlin (UTC+1) is 12:00
  const ctx = await browser.newContext({ baseURL, timezoneId: 'America/New_York', locale: 'de-DE' });
  const other = await ctx.newPage();
  await other.goto(link.pathname + link.hash);
  await expect(other.locator('#title')).toHaveValue('Anruf mit Tom');
  await expect(other.locator('#sd')).toHaveValue('2026-12-01');
  await expect(other.locator('#st')).toHaveValue('12:00');
  await expect(other.locator('#et')).toHaveValue('12:30');
  await expect(other.locator('#loc')).toHaveValue('Telefon');
  await expect(other.locator('#desc')).toHaveValue('Zeile 1\nZeile 2');
  await expect(other.locator('#repeat')).toHaveValue('MONTHLY');
  await expect(other.locator('#count')).toHaveValue('3');
  await expect(other.locator('#toast')).toContainText('Termin aus dem Link übernommen');
  await expect(other.locator('#tzHint')).toHaveText('Zeitzone: America/New_York');
  // The link is used up: the address no longer carries it, and the event is not in the recipient's list yet
  expect(new URL(other.url()).hash).toBe('');
  await expect(other.locator('#list li')).toHaveCount(0);
  await ctx.close();
});

test('without a share function the link is copied; "copy as text" adds the link', async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.share; });
  await page.goto('/calendar-events/');
  await fillEvent(page, { title: 'Kino', sd: '2026-11-07', st: '20:00', ed: '2026-11-07', et: '22:15' });
  await page.click('#btnShare');
  await expect(page.locator('#toast')).toHaveText('Link kopiert');
  expect(await clipboardText(page)).toMatch(/^http:\/\/localhost:\d+\/calendar-events\/#t=Kino&s=2026-11-07&st=20%3A00&e=2026-11-07&et=22%3A15&z=Europe%2FBerlin&m=15$/);
  await page.click('#btnCopy');
  await expect(page.locator('#toast')).toHaveText('Termin kopiert');
  const text = await clipboardText(page);
  expect(text).toMatch(/^Kino\n🗓 Sa\., 7\. Nov\. 2026, 20:00 – 22:15\n\nIn den Kalender übernehmen:\nhttp:\/\/localhost:\d+\/calendar-events\/#t=Kino&/);
  // Shared and copied: one entry, not two
  await expect(page.locator('#list li')).toHaveCount(1);
});

const ICS_FILE = [
  'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Example//Mail//EN',
  'BEGIN:VEVENT', 'UID:abc-123@example.com', 'DTSTAMP:20261020T120000Z',
  'DTSTART;TZID=America/New_York:20261201T090000', 'DTEND;TZID=America/New_York:20261201T100000',
  'SUMMARY:Team\\, Planung',
  'DESCRIPTION:Zeile 1\\nZeile 2 mit einem sehr langen Text\\, der umgebrochen wi',
  ' rd.',
  'LOCATION:Raum 4\\; 2. OG',
  'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU',
  'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Reminder', 'END:VALARM',
  'END:VEVENT',
  'BEGIN:VEVENT', 'UID:feiertag@example.com', 'DTSTART;VALUE=DATE:20261225', 'DURATION:P2D', 'SUMMARY:Weihnachten', 'RRULE:FREQ=YEARLY',
  'END:VEVENT',
  'END:VCALENDAR', '',
].join('\r\n');

test('opening an .ics file: every event goes into the list, the first into the form', async ({ page }) => {
  await page.goto('/calendar-events/');
  const file = { name: 'einladung.ics', mimeType: 'text/calendar', buffer: Buffer.from(ICS_FILE) };
  await page.setInputFiles('#fileInput', file);
  await expect(page.locator('#toast')).toHaveText('2 Termine aus der Datei geladen');
  await expect(page.locator('#title')).toHaveValue('Team, Planung');
  // 09:00 in New York (UTC−5) = 14:00 UTC = 15:00 in Berlin
  await expect(page.locator('#sd')).toHaveValue('2026-12-01');
  await expect(page.locator('#st')).toHaveValue('15:00');
  await expect(page.locator('#et')).toHaveValue('16:00');
  await expect(page.locator('#desc')).toHaveValue('Zeile 1\nZeile 2 mit einem sehr langen Text, der umgebrochen wird.');
  await expect(page.locator('#loc')).toHaveValue('Raum 4; 2. OG');
  await expect(page.locator('#alarm')).toHaveValue('30');
  // A repetition the form cannot show is kept as it is
  await expect(page.locator('#repeat')).toHaveValue('custom');
  await expect(page.locator('#repeat option:checked')).toHaveText('Wie in der Datei');
  await expect(page.locator('#list .name')).toHaveText(['Team, Planung', 'Weihnachten']);
  const L = lines((await saveIcs(page)).text);
  expect(L).toContain('UID:abc-123@example.com');
  expect(L).toContain('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU');
  expect(L).toContain('DTSTART;TZID=Europe/Berlin:20261201T150000');
  expect(L).toContain('TRIGGER:-PT30M');

  // The all-day event: 25 + 2 days → 25 and 26 December; FREQ=YEARLY fits the form
  await page.locator('#list .load').nth(1).click();
  await expect(page.locator('#allDay')).toBeChecked();
  await expect(page.locator('#sd')).toHaveValue('2026-12-25');
  await expect(page.locator('#ed')).toHaveValue('2026-12-26');
  await expect(page.locator('#repeat')).toHaveValue('YEARLY');
  await expect(page.locator('#alarm')).toHaveValue('-1');
  await expect(page.locator('#repCustom')).toBeHidden();

  // The same file again replaces the events (same UID) instead of doubling them
  await page.setInputFiles('#fileInput', file);
  await expect(page.locator('#list li')).toHaveCount(2);
  // "Save all" puts both into one file
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnAll')]);
  expect(dl.suggestedFilename()).toBe('termine-2026-10-29.ics');
  const all = lines(readFileSync(await dl.path(), 'utf8'));
  expect(all.filter(l => l === 'BEGIN:VEVENT')).toHaveLength(2);
  expect(all.filter(l => l === 'BEGIN:VTIMEZONE')).toHaveLength(1);
});

test('a file without events is reported; entries can be deleted from the list', async ({ page }) => {
  await page.goto('/calendar-events/');
  await page.setInputFiles('#fileInput', { name: 'leer.ics', mimeType: 'text/calendar', buffer: Buffer.from('BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n') });
  await expect(page.locator('#toast')).toHaveText('Keine Termine in der Datei gefunden.');
  await page.setInputFiles('#fileInput', { name: 'a.ics', mimeType: 'text/calendar', buffer: Buffer.from(ICS_FILE) });
  await expect(page.locator('#list li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Löschen: Weihnachten' }).click();
  await expect(page.locator('#list .name')).toHaveText(['Team, Planung']);
  await page.click('#btnNew');
  await expect(page.locator('#title')).toHaveValue('');
  await expect(page.locator('#list .load')).not.toHaveAttribute('aria-current', 'true');
});

test('"Open with" the installed app hands over the .ics file', async ({ page }) => {
  await mockLaunchQueue(page, [{ name: 'einladung.ics', mimeType: 'text/calendar', buffer: Buffer.from(ICS_FILE) }]);
  await page.goto('/calendar-events/?opened=1');
  await expect(page.locator('#title')).toHaveValue('Team, Planung');
  await expect(page.locator('#list li')).toHaveCount(2);
  expect(new URL(page.url()).search).toBe('');
});

test('the form survives a reload; settings set duration and reminder of new events', async ({ page }) => {
  await page.goto('/calendar-events/');
  await page.fill('#title', 'Entwurf');
  await page.fill('#loc', 'Zuhause');
  await page.reload();
  await expect(page.locator('#title')).toHaveValue('Entwurf');
  await expect(page.locator('#loc')).toHaveValue('Zuhause');
  await openMenu(page);
  await page.selectOption('#setDur', '90');
  await page.selectOption('#setAlarm', '60');
  await closeMenu(page);
  await page.click('#btnNew');
  await expect(page.locator('#st')).toHaveValue('11:00');
  await expect(page.locator('#et')).toHaveValue('12:30');
  await expect(page.locator('#alarm')).toHaveValue('60');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and the copied event are in English', async ({ page }) => {
    await page.goto('/calendar-events/');
    await page.click('#btnIcs');
    await expect(page.locator('#msg')).toHaveText('Please enter a title.');
    await page.fill('#title', 'Dentist');
    await page.selectOption('#repeat', 'WEEKLY');
    await page.fill('#count', '2');
    await expect(page.locator('#pvMeta')).toHaveText('🔁 Weekly, 2 times · ⏰ Reminder: 15 minutes before');
    await page.click('#btnCopy');
    expect(await clipboardText(page)).toContain('\n\nAdd to your calendar:\n');
  });
});
