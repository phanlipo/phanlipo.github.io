// Atomuhr: time synchronised from the Date header of the own server (HEAD requests, faked here with a
// known offset), time zones, next clock change (checked against the known EU/US rules), world clocks.
import { test, expect, openMenu, switchLang } from './helpers.mjs';

const SYNC = '**/atomic-clock/manifest.webmanifest?sync=*';
const LS = 'atomic-clock.settings.v1';
// The server pretends its clock is offsetMs ahead of this machine; the Date header has whole seconds like a real one
const fakeServer = (page, offsetMs) => page.route(SYNC, route => route.fulfill({
  status: 200, headers: { Date: new Date(Date.now() + offsetMs).toUTCString(), 'Cache-Control': 'no-store' }, body: '',
}));
test.use({ timezoneId: 'Europe/Berlin' });
// Stops the page clock at a known instant (timers run only when the test advances it)
const stopClock = async (page, iso) => {
  const t = new Date(iso).getTime();
  await page.clock.install({ time: t - 1000 });
  await page.clock.pauseAt(t);
};

test.describe('synchronisation', () => {
  test('device clock 5 s slow: narrows the server second down and shows the deviation', async ({ page }) => {
    const hits = [];
    page.on('request', r => { if (r.url().includes('?sync=')) hits.push(r.method()); });
    await fakeServer(page, 5000);
    await page.goto('/atomic-clock/');
    // The button is locked while the requests run; the estimate is shown after each answer
    await expect(page.locator('#btnSync')).toBeDisabled();
    await expect(page.locator('#btnSync')).toBeEnabled({ timeout: 15000 });
    await expect(page.locator('#syncText')).toHaveText(/^Abgeglichen · ± 0,\d+ s$/);
    await expect(page.locator('#deviation')).toHaveText(/^Deine Geräteuhr geht (4,9|5,0|5,1) s nach\.$/);
    // Several requests timed around the change of the second, all HEAD (the service worker only answers GET)
    expect(hits.length).toBeGreaterThan(2);
    expect(new Set(hits)).toEqual(new Set(['HEAD']));
    const acc = Number((await page.locator('#syncText').textContent()).match(/± ([\d,]+)/)[1].replace(',', '.'));
    expect(acc).toBeLessThanOrEqual(0.1);
    // The big clock shows the server time (5 s ahead of the machine), not the device time
    const shown = await page.locator('#time').textContent();
    const fmt = ms => new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin' });
    const t = Date.now();
    expect([fmt(t + 4000), fmt(t + 5000), fmt(t + 6000)]).toContain(shown);
  });

  test('device clock 2 min fast', async ({ page }) => {
    await fakeServer(page, -120000);
    await page.goto('/atomic-clock/');
    await expect(page.locator('#deviation')).toHaveText('Deine Geräteuhr geht 2 min 0 s vor.', { timeout: 15000 });
  });

  test('exact device clock', async ({ page }) => {
    await fakeServer(page, 0);
    await page.goto('/atomic-clock/');
    await expect(page.locator('#deviation')).toHaveText('Deine Geräteuhr geht genau.', { timeout: 15000 });
  });

  test('"Sync again" asks the server once more', async ({ page }) => {
    await fakeServer(page, 0);
    await page.goto('/atomic-clock/');
    await expect(page.locator('#btnSync')).toBeDisabled();
    await expect(page.locator('#btnSync')).toBeEnabled({ timeout: 15000 });
    await page.unroute(SYNC);
    await fakeServer(page, 30000);
    await page.click('#btnSync');
    await expect(page.locator('#deviation')).toHaveText(/geht (29,9|30,0|30,1) s nach/, { timeout: 15000 });
  });
});

test.describe('without server', () => {
  test.use({ allowedProblems: /Failed to load resource|ERR_FAILED/ });
  test.beforeEach(async ({ page }) => { await page.route(SYNC, r => r.abort()); });

  test('offline: says it shows the device time', async ({ page }) => {
    await page.goto('/atomic-clock/');
    await expect(page.locator('#syncText')).toHaveText('Kein Abgleich möglich – zeigt die Gerätezeit');
    await expect(page.locator('#deviation')).toBeHidden();
    await expect(page.locator('#time')).toHaveText(/^\d\d:\d\d:\d\d$/);
  });

  test('time zone: device zone by default, switching is saved; next clock change of the zone', async ({ page }) => {
    await stopClock(page, '2027-01-15T11:00:00Z');
    await page.goto('/atomic-clock/');
    await expect(page.locator('#zoneName')).toHaveText('Gerät');
    await expect(page.locator('#time')).toHaveText('12:00:00');
    await expect(page.locator('#date')).toHaveText('Freitag, 15. Januar 2027');
    await expect(page.locator('#zoneInfo')).toHaveText('Europe/Berlin · Mitteleuropäische Normalzeit · UTC+1');
    // EU: last Sunday of March 2027 is the 28th, 01:00 UTC
    await expect(page.locator('#dstText')).toHaveText('Nächste Zeitumstellung: So., 28. März, 02:00 → 03:00 Uhr (Uhr wird 1 Std. vorgestellt)');

    await page.selectOption('#zoneSel', 'America/New_York');
    await expect(page.locator('#zoneName')).toHaveText('New York');
    await expect(page.locator('#time')).toHaveText('06:00:00');
    await expect(page.locator('#zoneInfo')).toContainText('UTC−5');
    // US: second Sunday of March 2027 is the 14th
    await expect(page.locator('#dstText')).toHaveText('Nächste Zeitumstellung: So., 14. März, 02:00 → 03:00 Uhr (Uhr wird 1 Std. vorgestellt)');

    // Chrome lists the old name Asia/Calcutta, Firefox Asia/Kolkata – the label is today's name either way
    await page.selectOption('#zoneSel', { label: 'Kolkata (UTC+5:30)' });
    await expect(page.locator('#time')).toHaveText('16:30:00');
    await expect(page.locator('#zoneInfo')).toContainText('UTC+5:30');
    await expect(page.locator('#dstText')).toHaveText('Keine Zeitumstellung in den nächsten zwölf Monaten.');

    await page.reload();
    await expect(page.locator('#zoneSel')).toHaveValue(/^Asia\/(Kolkata|Calcutta)$/);
    await expect(page.locator('#zoneName')).toHaveText('Kolkata');
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).zone, LS)).toMatch(/^Asia\/(Kolkata|Calcutta)$/);
  });

  test('clock change in autumn goes back; the clock ticks with the seconds', async ({ page }) => {
    await stopClock(page, '2027-08-01T10:00:00Z');
    await page.goto('/atomic-clock/');
    // EU: last Sunday of October 2027 is the 31st
    await expect(page.locator('#dstText')).toHaveText('Nächste Zeitumstellung: So., 31. Okt., 03:00 → 02:00 Uhr (Uhr wird 1 Std. zurückgestellt)');
    await expect(page.locator('#time')).toHaveText('12:00:00');
    await page.clock.runFor(2100);
    await expect(page.locator('#time')).toHaveText('12:00:02');
  });

  test('world clocks: add, difference to the big clock, tap to show big, remove with undo', async ({ page }) => {
    await stopClock(page, '2027-01-15T11:00:00Z');
    await page.goto('/atomic-clock/');
    await expect(page.locator('#worldEmpty')).toBeVisible();
    await page.selectOption('#addSel', 'Asia/Tokyo');
    await page.click('#btnAdd');
    await page.selectOption('#addSel', 'America/Los_Angeles');
    await page.click('#btnAdd');
    await page.selectOption('#addSel', 'Asia/Tokyo');
    await page.click('#btnAdd');
    await expect(page.locator('#toast')).toHaveText('Tokyo ist schon in der Liste.');
    const rows = page.locator('#worldList li');
    await expect(rows).toHaveCount(2);
    await expect(page.locator('#worldEmpty')).toBeHidden();
    await expect(rows.nth(0).locator('.name')).toHaveText('Tokyo');
    await expect(rows.nth(0).locator('.clock-time')).toHaveText('20:00:00');
    await expect(rows.nth(0).locator('.meta')).toHaveText('Fr., 15. Jan. · UTC+9 · +8 Std.');
    await expect(rows.nth(1).locator('.clock-time')).toHaveText('03:00:00');
    await expect(rows.nth(1).locator('.meta')).toHaveText('Fr., 15. Jan. · UTC−8 · −9 Std.');

    await rows.nth(0).getByRole('button', { name: 'Tokyo als große Uhr zeigen' }).click();
    await expect(page.locator('#zoneName')).toHaveText('Tokyo');
    await expect(rows.nth(1).locator('.meta')).toHaveText('Fr., 15. Jan. · UTC−8 · −17 Std.');

    await rows.nth(0).getByRole('button', { name: 'Tokyo entfernen' }).click();
    await expect(rows).toHaveCount(1);
    await page.locator('#toast').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.name')).toHaveText('Tokyo');
    await page.reload();
    await expect(rows).toHaveCount(2);
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).clocks, LS)).toEqual(['Asia/Tokyo', 'America/Los_Angeles']);
  });

  test('keep screen on is a setting in the menu', async ({ page }) => {
    await page.goto('/atomic-clock/');
    await openMenu(page);
    await page.getByText('Bildschirm anlassen').click();
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).awake, LS)).toBe(true);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US', allowedProblems: /Failed to load resource|ERR_FAILED/ });
  test('texts, date formats and region names follow the language', async ({ page }) => {
    await page.route(SYNC, r => r.abort());
    await stopClock(page, '2027-01-15T21:05:09Z');
    await page.goto('/atomic-clock/');
    await switchLang(page, 'en');
    await expect(page.locator('#syncText')).toHaveText('Synchronising …');
    await page.clock.runFor(1000); // the first sync starts shortly after loading
    await expect(page.locator('#zoneName')).toHaveText('Device');
    await expect(page.locator('#syncText')).toHaveText('Cannot synchronise – showing the device time');
    await expect(page.locator('#time')).toHaveText('22:05:10');
    await expect(page.locator('#date')).toHaveText('Friday, 15 January 2027');
    await expect(page.locator('#dstText')).toHaveText('Next clock change: Sun 28 Mar, 02:00 → 03:00 (clocks go forward 1 h)');
    await expect(page.locator('#zoneSel optgroup[label="Europe"]')).toHaveCount(1);
    await expect(page.locator('#zoneSel option[value="local"]')).toHaveText('Device (Europe/Berlin)');
  });
});
