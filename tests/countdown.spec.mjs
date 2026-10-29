// Countdown: expected values worked out by hand (calendar, hours across daylight saving, month lengths).
import { test, expect } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Berlin' });
// Thursday 29 Oct 2026, 10:00 CET (summer time ended on 25 Oct)
const NOW = new Date('2026-10-29T10:00:00+01:00');

const tile = (page, label) => page.locator('.res', { has: page.locator('.k', { hasText: new RegExp(`^${label}$`) }) }).locator('.v');
const unit = (page, name) => page.locator('[data-unit]', { hasText: new RegExp(`^${name}$`) });
async function custom(page, sd, st, td, tt) {
  await page.click('[data-start="custom"]');
  await page.fill('#sd', sd);
  await page.fill('#st', st || '');
  await page.fill('#td', td);
  await page.fill('#tt', tt || '');
}

test.beforeEach(async ({ page }) => {
  // Time stands still until a test moves it on with runFor
  await page.clock.install({ time: NOW - 1000 });
  await page.clock.pauseAt(NOW);
  await page.goto('/countdown/');
});

test('from now until Christmas Eve: all units, calendar days and breakdown', async ({ page }) => {
  await page.fill('#td', '2026-12-24');
  // 29 Oct 10:00 → 24 Dec 00:00 = 55 days 14 h, no clock change in between
  await expect(page.locator('#lead')).toHaveText('Noch');
  await expect(page.locator('#big')).toHaveText('55,58Tage'); // 55 + 14/24
  await expect(page.locator('#when')).toHaveText('bis Donnerstag, 24. Dezember 2026');
  await expect(tile(page, 'Stunden')).toHaveText('1.334');
  await expect(tile(page, 'Minuten')).toHaveText('80.040');
  await expect(tile(page, 'Sekunden')).toHaveText('4.802.400');
  await expect(tile(page, 'Wochen')).toHaveText('7,94');
  await expect(tile(page, 'Kalendertage')).toHaveText('56');
  // 29 Oct 10:00 + 1 month = 29 Nov 10:00, then 24 days 14 h to 24 Dec
  await expect(page.locator('#bd')).toHaveText('1 Monat, 24 Tage, 14 Stunden');
  // Months: 1 + (24 d 14 h) / 30 d (29 Nov → 29 Dec) = 1.82
  await expect(tile(page, 'Monate')).toHaveText('1,82');
});

test('counts down live every second', async ({ page }) => {
  await page.fill('#td', '2026-10-29');
  await page.fill('#tt', '10:01');
  await unit(page, 'Sekunden').click();
  await expect(page.locator('#big')).toHaveText('60Sekunden');
  await page.clock.runFor(3100); // ticks just after each full second
  await expect(page.locator('#big')).toHaveText('57Sekunden');
  await expect(page.locator('#bd')).toHaveText('57 Sekunden');
  await page.clock.runFor(57000);
  await expect(page.locator('#lead')).toHaveText('Jetzt ist es so weit!');
  await page.clock.runFor(2000);
  await expect(page.locator('#lead')).toHaveText('Vorbei seit');
  await expect(page.locator('#big')).toHaveText('2Sekunden');
});

test('own start with times: hours, minutes and seconds', async ({ page }) => {
  await custom(page, '2026-01-01', '08:00', '2026-01-01', '20:30');
  await expect(page.locator('#startFields')).toBeVisible();
  await unit(page, 'Stunden').click();
  await expect(page.locator('#big')).toHaveText('12,5Stunden');
  await expect(tile(page, 'Minuten')).toHaveText('750');
  await expect(tile(page, 'Sekunden')).toHaveText('45.000');
  await expect(tile(page, 'Tage')).toHaveText('0,52'); // 12.5 / 24
  await expect(tile(page, 'Kalendertage')).toHaveText('0');
  await expect(page.locator('#bd')).toHaveText('12 Stunden, 30 Minuten');
  await expect(page.locator('#when')).toHaveText('bis Donnerstag, 1. Januar 2026 um 20:30');
});

test('daylight saving: calendar days stay whole, hours count the real time', async ({ page }) => {
  // Clocks went back on 25 Oct 2026: 49 real hours in two calendar days
  await custom(page, '2026-10-24', '', '2026-10-26', '');
  await expect(tile(page, 'Tage')).toHaveText('2');
  await expect(tile(page, 'Stunden')).toHaveText('49');
  await expect(page.locator('#bd')).toHaveText('2 Tage');
  // Clocks go forward on 28 Mar 2027: 47 hours
  await page.fill('#sd', '2027-03-27');
  await page.fill('#td', '2027-03-29');
  await expect(tile(page, 'Tage')).toHaveText('2');
  await expect(tile(page, 'Stunden')).toHaveText('47');
});

test('month lengths: one month after 31 January is the end of February', async ({ page }) => {
  await custom(page, '2026-01-31', '', '2026-03-01', '');
  await expect(page.locator('#bd')).toHaveText('1 Monat, 1 Tag');
  await expect(tile(page, 'Tage')).toHaveText('29');
  await expect(tile(page, 'Monate')).toHaveText('1,03'); // 1 + 1 day / 31 days (28 Feb → 31 Mar)
  // Leap day: 29 Feb 2028 + 12 months = 28 Feb 2029 (clamped like above)
  await page.fill('#sd', '2028-02-29');
  await page.fill('#td', '2029-02-27');
  await expect(page.locator('#bd')).toHaveText('11 Monate, 29 Tage'); // 29 Jan 2029 + 29 days
  await page.fill('#td', '2029-02-28');
  await expect(page.locator('#bd')).toHaveText('1 Jahr');
  await page.fill('#td', '2029-03-01');
  await expect(page.locator('#bd')).toHaveText('1 Jahr, 1 Tag');
  await expect(tile(page, 'Tage')).toHaveText('366');
});

test('target before the start: shows how long it is over', async ({ page }) => {
  await custom(page, '2026-05-10', '', '2026-05-01', '');
  await expect(page.locator('#lead')).toHaveText('Vorbei seit');
  await expect(page.locator('#big')).toHaveText('9Tage');
  await expect(page.locator('#when')).toHaveText('seit Freitag, 1. Mai 2026');
  await expect(tile(page, 'Stunden')).toHaveText('216');
});

test('invalid or missing dates show a message', async ({ page }) => {
  await page.fill('#td', '');
  await expect(page.locator('#msg')).toHaveText('Bitte ein gültiges Zieldatum wählen.');
  await expect(page.locator('#out')).toBeHidden();
  await page.fill('#td', '2026-12-24');
  await expect(page.locator('#msg')).toBeHidden();
  await page.click('[data-start="custom"]');
  await page.fill('#sd', '');
  await expect(page.locator('#msg')).toHaveText('Bitte ein gültiges Startdatum wählen.');
});

test('entries and unit are kept after a reload', async ({ page }) => {
  await custom(page, '2026-01-01', '08:00', '2026-01-02', '09:15');
  await unit(page, 'Minuten').click();
  await page.reload();
  await expect(page.locator('#td')).toHaveValue('2026-01-02');
  await expect(page.locator('#tt')).toHaveValue('09:15');
  await expect(page.locator('#sd')).toHaveValue('2026-01-01');
  await expect(page.locator('[data-start="custom"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#big')).toHaveText('1.515Minuten'); // 25 h 15 min
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('numbers and units in English', async ({ page }) => {
    await page.fill('#td', '2026-12-24');
    await expect(page.locator('#lead')).toHaveText('Still');
    await expect(page.locator('#big')).toHaveText('55.58days');
    await expect(page.locator('#bd')).toHaveText('1 month, 24 days, 14 hours');
    await expect(tile(page, 'Seconds')).toHaveText('4,802,400');
    await expect(page.locator('#when')).toHaveText('until Thursday, 24 December 2026'); // shared English locale is en-GB
  });
});

test.describe('history', () => {
  const items = page => page.locator('#hist li');
  const pause = page => page.clock.runFor(1600); // entries are saved after a short pause

  test('a calculation is saved after a pause, with name and days left', async ({ page }) => {
    await expect(page.locator('#histEmpty')).toBeVisible();
    await page.fill('#td', '2026-12-24');
    await expect(items(page)).toHaveCount(0); // not while still typing
    await pause(page);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first().locator('.name')).toHaveText('Do., 24. Dez. 2026');
    await expect(items(page).first().locator('.rel')).toHaveText('in 56 Tagen');
    // The name labels the same entry – it does not create a second one
    await page.fill('#name', 'Heiligabend');
    await pause(page);
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first().locator('.name')).toHaveText('Heiligabend');
    await expect(items(page).first().locator('.meta')).toHaveText('Do., 24. Dez. 2026 · in 56 Tagen');
    await expect(items(page).first().locator('.load')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('#histEmpty')).toBeHidden();
  });

  test('relative days: today, tomorrow, yesterday, ago, and own start', async ({ page }) => {
    for (const [td, tt] of [['2026-10-29', '18:00'], ['2026-10-30', ''], ['2026-10-28', ''], ['2026-10-20', '']]) {
      await page.fill('#td', td);
      await page.fill('#tt', tt);
      await pause(page);
    }
    await custom(page, '2026-05-01', '', '2026-05-10', '');
    await pause(page);
    await expect(items(page).locator('.rel')).toHaveText(['9 Tage ab Fr., 1. Mai 2026', 'vor 9 Tagen', 'gestern', 'morgen', 'heute']);
    await expect(items(page).nth(4).locator('.name')).toHaveText('Do., 29. Okt. 2026, 18:00');
  });

  test('tap loads an entry, × deletes it, kept after a reload', async ({ page }) => {
    await page.fill('#name', 'Urlaub');
    await page.fill('#td', '2027-07-15');
    await page.fill('#tt', '06:30');
    await pause(page);
    await page.fill('#name', '');
    await custom(page, '2026-01-01', '', '2026-03-01', '');
    await pause(page);
    await expect(items(page)).toHaveCount(2);
    await page.reload();
    await expect(items(page)).toHaveCount(2);
    await items(page).filter({ hasText: 'Urlaub' }).locator('.load').click();
    await expect(page.locator('#name')).toHaveValue('Urlaub');
    await expect(page.locator('#td')).toHaveValue('2027-07-15');
    await expect(page.locator('#tt')).toHaveValue('06:30');
    await expect(page.locator('[data-start="now"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(items(page).first().locator('.name')).toHaveText('Urlaub'); // moved to the top
    await page.getByRole('button', { name: 'Löschen: So., 1. März 2026' }).click();
    await expect(items(page)).toHaveCount(1);
    await page.reload();
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).locator('.name')).toHaveText('Urlaub');
  });

  test('invalid input is not saved, at most 30 entries', async ({ page }) => {
    await page.fill('#td', '');
    await pause(page);
    await expect(items(page)).toHaveCount(0);
    for (let d = 1; d <= 31; d++) {
      await page.fill('#td', `2027-01-${String(d).padStart(2, '0')}`);
      await pause(page);
    }
    await expect(items(page)).toHaveCount(30);
    await expect(items(page).first().locator('.name')).toHaveText('So., 31. Jan. 2027');
    await expect(items(page).last().locator('.name')).toHaveText('Sa., 2. Jan. 2027');
  });
});
