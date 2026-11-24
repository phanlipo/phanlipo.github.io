// Planeten: the calculation in planets/ephemeris.js against published almanac values (not against itself),
// the explanation for a known evening, events, playing, place of observation, settings and language.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openSettings, closeMenu, switchLang } from './helpers.mjs';

const E = (() => { const c = {}; vm.runInNewContext(readFileSync('planets/ephemeris.js', 'utf8'), { self: c, Math }); return c.PlanetEphemeris; })();
const DAY = 86400000;
const utc = (...a) => Date.UTC(...a);
const event = (body, type, around, extra = {}) => E.events(body, around - 40 * DAY, around + 40 * DAY)
  .find(e => e.type === type && Object.entries(extra).every(([k, v]) => e[k] === v));

test.describe('ephemeris (Kepler orbits)', () => {
  test('conjunctions and oppositions on the published dates', () => {
    // Dates from the almanacs (USNO / Sky & Telescope), within half a day
    const cases = [
      ['mars', 'opposition', utc(2025, 0, 16, 2)],
      ['jupiter', 'opposition', utc(2026, 0, 10, 8)],
      ['saturn', 'opposition', utc(2026, 9, 4, 12)],
      ['venus', 'superiorConjunction', utc(2026, 0, 6, 17)],
      ['venus', 'inferiorConjunction', utc(2026, 9, 24, 3)],
    ];
    for (const [body, type, when] of cases) {
      const e = event(body, type, when);
      expect(e, `${body} ${type}`).toBeTruthy();
      expect(Math.abs(e.time - when) / DAY, `${body} ${type}`).toBeLessThan(0.5);
    }
  });

  test('greatest elongations: date and angle', () => {
    const cases = [
      ['venus', 'east', utc(2026, 7, 15), 45.9],
      ['venus', 'west', utc(2027, 0, 3), 47.0],
      ['mercury', 'east', utc(2026, 1, 19), 18.1],
    ];
    for (const [body, side, when, angle] of cases) {
      const e = event(body, 'greatestElongation', when, { side });
      expect(e, `${body} ${side}`).toBeTruthy();
      expect(Math.abs(e.time - when) / DAY).toBeLessThan(1);
      expect(e.elongation).toBeCloseTo(angle, 0);
    }
  });

  test('Venus in November 2026: morning star near greatest brilliancy', () => {
    const g = E.geo('venus', utc(2026, 10, 24, 5));
    expect(g.side).toBe('west');
    expect(g.elongation).toBeGreaterThan(36);
    expect(g.elongation).toBeLessThan(38);
    expect(g.illuminated).toBeGreaterThan(0.2);
    expect(g.illuminated).toBeLessThan(0.25);
    expect(g.mag).toBeLessThan(-4.7);
    expect(g.mag).toBeGreaterThan(-5.0);
    const peak = event('venus', 'greatestBrilliancy', utc(2026, 10, 27));
    expect(Math.abs(peak.time - utc(2026, 10, 27)) / DAY).toBeLessThan(2);
  });

  test('Earth at perihelion and aphelion, Saturn rings edge-on in March 2025', () => {
    expect(E.helio('earth', utc(2026, 0, 3)).r).toBeCloseTo(0.9833, 3);
    expect(E.helio('earth', utc(2026, 6, 6)).r).toBeCloseTo(1.0167, 3);
    expect(Math.abs(E.geo('saturn', utc(2025, 2, 23)).ringTilt)).toBeLessThan(1);
    expect(Math.abs(E.geo('saturn', utc(2032, 0, 1)).ringTilt)).toBeGreaterThan(20);
  });

  test('sunrise and sunset in Berlin at the June solstice', () => {
    // 04:43 and 21:33 summer time (UTC+2)
    const rs = E.riseSet('sun', utc(2026, 5, 20, 22), utc(2026, 5, 21, 22), 52.52, 13.405);
    expect(Math.abs(rs.rise - utc(2026, 5, 21, 2, 43)) / 60000).toBeLessThan(3);
    expect(Math.abs(rs.set - utc(2026, 5, 21, 19, 33)) / 60000).toBeLessThan(3);
    // Midnight sun at the North Cape, polar night in Tromsø in December
    expect(E.riseSet('sun', utc(2026, 5, 21), utc(2026, 5, 22), 71.2, 25.8).alwaysUp).toBe(true);
    expect(E.riseSet('sun', utc(2026, 11, 21), utc(2026, 11, 22), 69.6, 18.9).alwaysDown).toBe(true);
    expect(E.visibility('jupiter', utc(2026, 5, 21, 22), 71.2, 25.8).kind).toBe('noNight');
  });
});

test.describe('app', () => {
  test.use({ timezoneId: 'Europe/Berlin' });
  const setWhen = async (page, v) => { await page.fill('#when', v); await page.dispatchEvent('#when', 'change'); };
  test.beforeEach(async ({ page }) => { await page.goto('/planets/'); });

  test('why Venus shines in the morning of 24 November 2026', async ({ page }) => {
    await setWhen(page, '2026-11-24T05:00');
    await expect(page.locator('#badge')).toContainText('2026');
    await expect(page.locator('#pName')).toHaveText('Venus');
    await expect(page.locator('#pVis')).toHaveText('Morgens, ab 05:00 Uhr');
    await expect(page.locator('#sElong')).toHaveText('37°');
    await expect(page.locator('#sMag')).toHaveText('-4,9');
    await expect(page.locator('#sIll')).toHaveText('22 %');
    const why = page.locator('#pWhy');
    await expect(why).toContainText('37° westlich der Sonne');
    await expect(why).toContainText('„Morgenstern“');
    await expect(why).toContainText('heller als Sirius');
    await expect(why).toContainText('Am hellsten wird Venus am 27. November 2026');
    await expect(page.locator('#skyH')).toHaveText('Am Himmel in der Nacht vom 23.11. auf den 24.11.');
    await expect(page.locator('#sky [data-planet="venus"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#sky [data-planet="saturn"] .when')).toHaveText('Vom Abend bis 02:10 Uhr');
    await expect(page.locator('#sky [data-planet="neptune"] .when')).toContainText('(nur mit Fernglas)');
    await expect(page.locator('#pEvents button').first()).toContainText('27.11.2026');
    await expect(page.locator('#pEvents button').first()).toContainText('Größte Helligkeit');
  });

  test('an event jumps there; at conjunction the planet cannot be seen', async ({ page }) => {
    await setWhen(page, '2026-10-01T20:00');
    const conj = page.locator('#pEvents button', { hasText: 'Untere Konjunktion' });
    await expect(conj).toContainText('24.10.2026');
    await conj.click();
    await expect(page.locator('#when')).toHaveValue(/^2026-10-24T0[45]:\d\d$/);
    await expect(page.locator('#pVis')).toHaveText('Nicht zu sehen – zu nah an der Sonne');
    await expect(page.locator('#pWhy')).toContainText('zwischen Erde und Sonne hindurch');
  });

  test('a planet chosen in the list or the picture; view and speed survive a reload', async ({ page }) => {
    await setWhen(page, '2026-10-04T23:00');
    await page.click('#sky [data-planet="saturn"]');
    await expect(page.locator('#pName')).toHaveText('Saturn');
    await expect(page.locator('#pVis')).toHaveText('Die ganze Nacht');
    await expect(page.locator('#pWhy')).toContainText('fast gegenüber');
    await expect(page.locator('#pWhy')).toContainText('zur Opposition am 4. Oktober 2026');
    await page.click('#viewSel [data-v="all"]');
    await page.click('#speed [data-v="year"]');
    await expect(page.locator('#btnFwd')).toHaveAttribute('aria-label', '1 Jahr vor');
    // Tap Jupiter in the picture
    const pos = await page.evaluate(() => {
      const E = window.PlanetEphemeris, cv = document.getElementById('cv'), r = cv.getBoundingClientRect();
      const p = E.helio('jupiter', new Date(2026, 9, 4, 23).getTime()), R = Math.min(r.width, r.height) / 2 - 18, d = Math.hypot(p.x, p.y);
      const s = Math.sqrt(d / 31) * R / d;
      return { x: r.width / 2 + p.x * s, y: r.height / 2 - p.y * s };
    });
    await page.locator('#cv').click({ position: pos });
    await expect(page.locator('#pName')).toHaveText('Jupiter');
    await page.reload();
    await expect(page.locator('#pName')).toHaveText('Jupiter');
    await expect(page.locator('#viewSel [data-v="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#speed [data-v="year"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('planets.settings.v1'))))
      .toEqual({ lat: 51, lon: 10, view: 'all', speed: 'year', planet: 'jupiter' });
  });

  test('steps, playing and the range 1800–2050', async ({ page }) => {
    await setWhen(page, '2026-11-24T05:00');
    await page.click('#btnFwd');
    await expect(page.locator('#when')).toHaveValue('2026-12-01T05:00');
    await page.click('#speed [data-v="day"]');
    await page.click('#btnBack');
    await expect(page.locator('#when')).toHaveValue('2026-11-30T05:00');
    await page.click('#speed [data-v="year"]');
    await page.click('#btnPlay');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#playL')).toHaveText('Pause');
    await expect(page.locator('#when')).toHaveValue(/^2027-/);
    await page.click('#btnPlay');
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-pressed', 'false');
    await setWhen(page, '2050-12-20T12:00');
    await page.click('#btnFwd');
    await expect(page.locator('#toast')).toHaveText('Nur 1800 bis 2050 möglich.');
    await expect(page.locator('#when')).toHaveValue('2050-12-31T23:59');
    await page.click('#btnNow');
    const now = await page.evaluate(() => new Date().getFullYear());
    await expect(page.locator('#when')).toHaveValue(new RegExp(`^${now}-`));
  });

  test('place of observation: typed, checked, from the location (rounded)', async ({ page, context }) => {
    await setWhen(page, '2026-06-21T12:00');
    await expect(page.locator('#placeText')).toContainText('Mitte Deutschlands');
    await openSettings(page);
    await page.fill('#lat', '95');
    await page.dispatchEvent('#lat', 'change');
    await expect(page.locator('#placeErr')).toHaveText('Breite −89 bis 89, Länge −180 bis 180 eingeben.');
    await page.fill('#lat', '71,2');
    await page.fill('#lon', '25,8');
    await page.dispatchEvent('#lon', 'change');
    await expect(page.locator('#placeErr')).toBeHidden();
    await closeMenu(page);
    await expect(page.locator('#sunLine')).toHaveText('Sonne: den ganzen Tag über dem Horizont');
    await expect(page.locator('#pVis')).toHaveText('Nicht zu sehen – es wird nicht dunkel genug');
    await expect(page.locator('#placeText')).toHaveText('Beobachtungsort: 71,2° N, 25,8° O – ändern im Menü unter Einstellungen.');
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: 48.137, longitude: 11.575 });
    await openSettings(page);
    await page.click('#btnGeo');
    await expect(page.locator('#toast')).toHaveText('Standort übernommen.');
    await expect(page.locator('#lat')).toHaveValue('48,1');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('planets.settings.v1')))).toMatchObject({ lat: 48.1, lon: 11.6 });
    const diag = await page.evaluate(() => window.Tools.diag.text());
    expect(diag).not.toContain('48.1');
    expect(diag).not.toContain('11.6');
  });

  test('switching the language re-renders all texts written by the script', async ({ page }) => {
    await setWhen(page, '2026-11-24T05:00');
    await switchLang(page, 'en');
    await expect(page.locator('#pVis')).toHaveText('Mornings, from 05:00');
    await expect(page.locator('#pWhy')).toContainText('37° west of the Sun');
    await expect(page.locator('#skyH')).toContainText('In the sky in the night of');
    await expect(page.locator('#btnBack')).toHaveAttribute('aria-label', '1 week back');
    await expect(page.locator('#sky [data-planet="neptune"] .name')).toHaveText('Neptune');
  });
});
