// Planeten: the calculation in planets/ephemeris.js against published almanac values (not against itself),
// the explanation for a known evening, events, playing, place of observation, settings and language.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openMenu, openSettings, closeMenu, switchLang } from './helpers.mjs';

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

test.describe('ephemeris (Moon and Jupiter’s moons)', () => {
  test('phases of the Moon on the published times', () => {
    // USNO: full moon 3 Jan 2026 10:03, new moon 18 Jan 2026 19:52, full moon (total eclipse) 3 Mar 2026 11:38 UTC
    const phases = E.events('moon', utc(2026, 0, 1), utc(2026, 2, 10));
    for (const [type, when] of [['fullMoon', utc(2026, 0, 3, 10, 3)], ['newMoon', utc(2026, 0, 18, 19, 52)], ['fullMoon', utc(2026, 2, 3, 11, 38)]]) {
      const p = phases.find(e => e.type === type && Math.abs(e.time - when) < DAY);
      expect(p, `${type} ${new Date(when).toISOString()}`).toBeTruthy();
      expect(Math.abs(p.time - when) / 60000).toBeLessThan(10);
    }
    // Phases follow each other in order, a synodic month (29.53 days) from new moon to new moon
    expect(phases.map(p => p.type).slice(0, 4)).toEqual(['fullMoon', 'lastQuarter', 'newMoon', 'firstQuarter']);
    const news = phases.filter(p => p.type === 'newMoon');
    expect((news[1].time - news[0].time) / DAY).toBeCloseTo(29.5, 0);
    const full = E.geo('moon', utc(2026, 2, 3, 11, 38));
    expect(full.phase).toBe('fullMoon');
    expect(full.illuminated).toBeGreaterThan(0.99);
  });

  test('distance of the Moon between perigee and apogee', () => {
    let min = Infinity, max = 0;
    for (let t = utc(2026, 0, 1); t < utc(2027, 0, 1); t += DAY / 4) { const km = E.geo('moon', t).km; min = Math.min(min, km); max = Math.max(max, km); }
    expect(min).toBeGreaterThan(356000);
    expect(min).toBeLessThan(358500);
    expect(max).toBeGreaterThan(405000);
    expect(max).toBeLessThan(407000);
  });

  test('Jupiter’s moons stay within their orbits and repeat with their synodic periods', () => {
    const orbit = [5.9, 9.4, 15.0, 26.4], period = [1.769861, 3.554095, 7.166389, 16.753553];
    const t0 = utc(2026, 0, 10);
    const a = E.jupiterMoons(t0);
    expect(a.map(m => m.name)).toEqual(['io', 'europa', 'ganymede', 'callisto']);
    a.forEach((m, k) => {
      let widest = 0;
      for (let i = 0; i < 100; i++) widest = Math.max(widest, Math.abs(E.jupiterMoons(t0 + i * period[k] / 100 * DAY)[k].x));
      expect(widest).toBeGreaterThan(orbit[k] - 0.3);
      expect(widest).toBeLessThan(orbit[k] + 0.3);
      const again = E.jupiterMoons(t0 + period[k] * DAY)[k];
      // Seen from the moving Earth the period shifts a little (most near opposition, as on this date)
      expect(Math.abs(again.x - m.x)).toBeLessThan(0.07 * orbit[k]);
    });
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

  test('the Moon: phase, why, next phases; Jupiter’s moons as in binoculars', async ({ page }) => {
    await setWhen(page, '2026-11-24T20:00');
    await expect(page.locator('#sky li').first()).toContainText('Mond');
    await page.click('#sky [data-planet="moon"]');
    await expect(page.locator('#pName')).toHaveText('Mond');
    await expect(page.locator('#pVis')).toHaveText('Die ganze Nacht');
    await expect(page.locator('#sIll')).toHaveText('100 %');
    await expect(page.locator('#sDistL')).toHaveText('Entfernung (Tsd. km)');
    await expect(page.locator('#pWhy li').first()).toContainText('Vollmond: Der Mond steht der Sonne gegenüber');
    await expect(page.locator('#pEvents button').first()).toContainText('Letztes Viertel');
    await expect(page.locator('#jMoons')).toBeHidden();
    // A week later: waning, in the morning sky, lit on the left
    await page.click('#btnFwd');
    await expect(page.locator('#pWhy li').first()).toContainText('westlich der Sonne');
    await expect(page.locator('#pWhy li').first()).toContainText('linken Seite');
    await page.click('#sky [data-planet="jupiter"]');
    await expect(page.locator('#sDistL')).toHaveText('Entfernung (AE)');
    await expect(page.locator('#jMoons')).toBeVisible();
    const shown = await page.locator('#jMoonsSvg circle.m').count();
    const hidden = await page.evaluate(() => window.PlanetEphemeris.jupiterMoons(new Date(2026, 11, 1, 20).getTime())
      .filter(m => m.behind && Math.hypot(m.x, m.y) < 1).length);
    expect(shown + hidden).toBe(4);
    await expect(page.locator('#jMoonsCap')).toContainText('I = Io, E = Europa, G = Ganymed, K = Kallisto');
    await expect(page.locator('#jMoonsSvg')).toHaveAttribute('aria-label', /^Jupitermonde: /);
  });

  // Chrome asks for the motion sensors (granted by default on phones); here granted explicitly
  const grantSensors = context => context.grantPermissions(['accelerometer', 'gyroscope', 'magnetometer']);

  test('compass view: the sky around you, tap chooses, aligning with the phone', async ({ page, context }) => {
    await grantSensors(context);
    await setWhen(page, '2026-11-24T05:00');
    await page.click('#sky [data-planet="moon"]');
    await page.click('#viewSel [data-v="sky"]');
    await expect(page.locator('#cv')).toHaveAttribute('aria-label', /^Kompass mit dem Himmel/);
    await expect(page.locator('#btnOrient')).toBeVisible();
    // Where Venus must be: azimuth from north clockwise, distance from the centre 90° − altitude (same layout as the page)
    const at = heading => page.evaluate(hd => {
      const E = window.PlanetEphemeris, r = document.getElementById('cv').getBoundingClientRect();
      const h = E.altitude('venus', new Date(2026, 10, 24, 5).getTime(), 51, 10);
      const R = Math.max(40, Math.min(r.width, r.height - 48) / 2 - 28), a = (h.az - hd) * Math.PI / 180, rho = R * (90 - h.alt) / 90;
      return { x: r.width / 2 + rho * Math.sin(a), y: r.height / 2 + 16 - rho * Math.cos(a), az: h.az };
    }, heading);
    const p0 = await at(0);
    expect(p0.az).toBeGreaterThan(100);   // south-east, before sunrise
    expect(p0.az).toBeLessThan(140);
    await page.locator('#cv').click({ position: { x: p0.x, y: p0.y } });
    await expect(page.locator('#pName')).toHaveText('Venus');
    // Phone pointing east (alpha 270 → heading 90): Venus moves round, a tap at the old place chooses nothing new
    await page.click('#sky [data-planet="moon"]');
    await page.click('#btnOrient');
    await expect(page.locator('#btnOrient')).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientationabsolute', { alpha: 270, beta: 0, gamma: 0, absolute: true })));
    await expect(page.locator('#badge')).toContainText('nach Handy ausgerichtet');
    const p1 = await at(90);
    await page.locator('#cv').click({ position: { x: p1.x, y: p1.y } });
    await expect(page.locator('#pName')).toHaveText('Venus');
    // Leaving the compass view stops it
    await page.click('#viewSel [data-v="inner"]');
    await expect(page.locator('#btnOrient')).toBeHidden();
    await page.click('#viewSel [data-v="sky"]');
    await expect(page.locator('#btnOrient')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('planets.settings.v1')).view)).toBe('sky');
  });

  test('aligning without compass data gives up with a note; refused access is said too', async ({ page, context }) => {
    await page.click('#viewSel [data-v="sky"]');
    await page.click('#btnOrient');
    await expect(page.locator('#toast')).toHaveText('Zugriff auf den Kompass nicht erlaubt.');
    await expect(page.locator('#btnOrient')).toHaveAttribute('aria-pressed', 'false');
    await grantSensors(context);
    await page.click('#btnOrient');
    await expect(page.locator('#toast')).toHaveText('Der Kompass des Geräts liefert keine Richtung.', { timeout: 6000 });
    await expect(page.locator('#btnOrient')).toHaveAttribute('aria-pressed', 'false');
  });

  test('moon calendar: a month with shapes and main phases, tap a day', async ({ page }) => {
    await setWhen(page, '2026-11-24T05:00');
    await openMenu(page);
    await page.click('#menuCal');
    const dlg = page.locator('#calDlg');
    await expect(dlg).toBeVisible();
    await expect(page.locator('#calMonth')).toHaveText('November 2026');
    await expect(page.locator('#calGrid [data-day]')).toHaveCount(30);
    await expect(page.locator('#calGrid [data-day="24"]')).toHaveAttribute('aria-current', 'date');
    await expect(page.locator('#calGrid button.main')).toHaveCount(4);
    // USNO: full moon 24 Nov 2026 14:53 UTC = 15:53 in Berlin
    await expect(page.locator('#calGrid [data-day="24"]')).toHaveAttribute('aria-label', /^24\. November: Vollmond, 100 % beleuchtet · 15:5\d$/);
    await expect(page.locator('#calPhases li')).toHaveText([/^Letztes Viertel: So\., 1\. Nov\./, /^Neumond: Mo\., 9\. Nov\./, /^Erstes Viertel: Di\., 17\. Nov\./, /^Vollmond: Di\., 24\. Nov\./]);
    await page.click('#calNext');
    await expect(page.locator('#calMonth')).toHaveText('Dezember 2026');
    await expect(page.locator('#calGrid [data-day]')).toHaveCount(31);
    await page.click('#calGrid [data-day="9"]');
    await expect(dlg).toBeHidden();
    await expect(page.locator('#when')).toHaveValue('2026-12-09T21:00');
    await expect(page.locator('#pName')).toHaveText('Mond');
    await expect(page.locator('#btnCal')).toBeVisible();
    await page.click('#btnCal');
    await expect(page.locator('#calMonth')).toHaveText('Dezember 2026');
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
