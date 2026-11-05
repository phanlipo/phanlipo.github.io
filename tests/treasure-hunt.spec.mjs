// Schatzsuche: story engine, a whole game of the built-in example, GPS unlocking (simulated position),
// resume code on a second "device" (browser context), editor, import/export, microphone task, map tiles.
// Expected values (distances, battle damage) are recomputed independently here.
import { readFileSync } from 'node:fs';
import { test, expect, axe, openMenu, closeMenu, switchLang } from './helpers.mjs';

const URL_ = '/treasure-hunt/';
const R = 6371008.8, rad = d => d * Math.PI / 180;
// Destination point (independent of the app's E.offset): great circle formula
function dest(p, d, deg) {
  const br = rad(deg), la = rad(p.latitude), lo = rad(p.longitude), k = d / R;
  const lat2 = Math.asin(Math.sin(la) * Math.cos(k) + Math.cos(la) * Math.sin(k) * Math.cos(br));
  const lon2 = lo + Math.atan2(Math.sin(br) * Math.sin(k) * Math.cos(la), Math.cos(k) - Math.sin(la) * Math.sin(lat2));
  return { latitude: lat2 * 180 / Math.PI, longitude: lon2 * 180 / Math.PI };
}
const HOME = { latitude: 48.137154, longitude: 11.576124 };

async function createExample(page, gps) {
  page.once('dialog', d => (gps ? d.accept() : d.dismiss()));
  await page.getByRole('button', { name: /Beispiel anlegen/ }).click();
  await expect(page.locator('.hunt')).toHaveCount(1);
}
const hud = page => page.locator('#hud');
async function station(page, id) {
  await page.locator(`[data-act="target"][data-id="${id}"]`).click();
  await page.getByRole('button', { name: 'Wir sind da!' }).click();
}
const next = page => page.getByRole('button', { name: 'Weiter', exact: true }).click();
const fallback = page => page.getByRole('button', { name: 'Eltern: als geschafft werten' }).click();
const energy = page => hud(page).locator('.energy [aria-hidden]');


test.describe('engine', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('scenes: first one whose conditions hold and that was not won; repeatable ones stay', async ({ page }) => {
    const r = await page.evaluate(() => {
      const E = HuntEngine, T = HuntPuzzles.TYPES;
      const h = E.normalize({ characters: [{ id: 'a', side: 'ally', power: 2 }], stations: [{ id: 's', scenes: [
        { id: 'x1', when: { notFlags: ['met'] }, win: { flags: ['met'] } },
        { id: 'x2', when: { flags: ['met'], team: 1 }, win: { energy: 2 } },
        { id: 'x3', when: { visits: 2 }, win: { ally: 'a' } },
        { id: 'x4', repeat: true },
      ] }, { id: 'locked', when: { flags: ['open'] }, scenes: [{ id: 'y' }] }] }, T);
      const g = E.newGame(h), st = h.stations[0], out = [];
      const visit = () => { const sc = E.pickScene(h, g, st); g.visits.s = (g.visits.s || 0) + 1; if (sc) E.finish(h, g, sc, true); return sc && sc.id; };
      out.push(E.stationState(h, g, h.stations[1]));
      out.push(visit());          // x1 → flag met
      out.push(visit());          // x2 needs a team member → x3 needs 2 earlier visits (has 1) → x4
      g.team.push('a');
      out.push(visit());          // x2 now
      out.push(visit());          // visits = 3 → x3
      out.push(visit(), visit()); // only the repeatable one is left
      E.apply(h, g, E.effects({ flags: ['open'] }));
      out.push(E.stationState(h, g, h.stations[1]), g.energy, g.team.join());
      return out;
    });
    expect(r).toEqual(['locked', 'x1', 'x4', 'x2', 'x3', 'x4', 'x4', 'new', 2, 'a']);
  });

  test('battle: children 1 + allies + bonus, doubled by the mega evolution, which costs energy', async ({ page }) => {
    const r = await page.evaluate(() => {
      const E = HuntEngine;
      const h = E.normalize({ megaCost: 3, characters: [{ id: 'e', side: 'enemy', hp: 20 }, { id: 'a', side: 'ally', power: 4 }, { id: 'b', side: 'ally', power: 5 }] }, HuntPuzzles.TYPES);
      const g = E.newGame(h), enemy = h.characters[0];
      const alone = E.battle(h, g, enemy, 0, true);
      g.team = ['a', 'b']; g.energy = 2;
      const noEnergy = E.battle(h, g, enemy, 3, true);
      g.energy = 3;
      const mega = E.battle(h, g, enemy, 3, true);
      E.payMega(h, g);
      return { alone, noEnergy, mega, energy: g.energy };
    });
    expect(r.alone).toMatchObject({ damage: 1, mega: false, win: false });
    expect(r.noEnergy).toMatchObject({ damage: 1 + 4 + 5 + 3, mega: false, win: false });
    expect(r.mega).toMatchObject({ damage: (1 + 4 + 5 + 3) * 2, mega: true, win: true });
    expect(r.energy).toBe(0);
  });

  test('resume code: round trip, typos and codes of another hunt are rejected', async ({ page }) => {
    const r = await page.evaluate(() => {
      const E = HuntEngine, T = HuntPuzzles.TYPES;
      const mk = id => E.normalize({ id, characters: [{ id: 'a' }, { id: 'b' }], stations: Array.from({ length: 5 }, (_, i) => ({ id: 's' + i,
        scenes: [{ id: `s${i}a`, win: { flags: ['f' + i] } }, { id: `s${i}b`, when: { flags: ['f' + i] } }] })) }, T);
      const h = mk('h1');
      const g = Object.assign(E.newGame(h), { started: true, flags: ['f1', 'f3'], team: ['b'], energy: 7, done: ['s1a', 's3a', 's4b'], visits: { s1: 2, s3: 1, s4: 15 }, target: 's2' });
      const code = E.encode(h, g);
      const back = E.decode(h, code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o'));
      const err = c => { try { E.decode(h, c); return 'ok'; } catch (e) { return e.message; } };
      const typo = code.slice(0, 5) + (code[5] === 'A' ? 'B' : 'A') + code.slice(6);
      return { code, back, typo: err(typo), other: err(E.encode(mk('h2'), E.newGame(mk('h2')))), empty: err('') };
    });
    expect(r.code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{1,4})+$/);
    expect(r.back).toMatchObject({ started: true, flags: ['f1', 'f3'], team: ['b'], energy: 7, target: 's2', finished: false });
    expect(r.back.done.sort()).toEqual(['s1a', 's3a', 's4b']);
    expect(r.back.visits).toEqual({ s1: 2, s3: 1, s4: 15 });
    expect(r.typo).toBe('code');
    expect(r.other).toBe('codeHunt');
    expect(r.empty).toBe('code');
  });

  test('imported files: only embedded pictures, limits, unknown fields dropped, unique ids', async ({ page }) => {
    const r = await page.evaluate(() => {
      const E = HuntEngine, T = HuntPuzzles.TYPES;
      const h = E.parse(JSON.stringify({ format: E.FORMAT, version: 1, evil: '<script>', radius: 99999,
        characters: [{ id: 'x', image: 'https://example.com/a.png', side: 'boss' }, { id: 'x', image: 'data:image/png;base64,iVBORw0KGgo=' }],
        stations: [{ lat: 123, lon: '11.5', scenes: [{ puzzle: { type: 'nope' } }, { puzzle: { type: 'quiz', answers: ['a'], correct: 9 } }] }] }), T);
      const err = s => { try { E.parse(s, T); return 'ok'; } catch (e) { return e.message; } };
      return { h, json: err('{'), other: err('{"format":"x"}'), newer: err(JSON.stringify({ format: E.FORMAT, version: 99 })) };
    });
    expect(r.h.evil).toBeUndefined();
    expect(r.h.radius).toBe(500);
    expect(r.h.characters[0]).toMatchObject({ image: '', side: 'ally' });
    expect(r.h.characters[1].image).toMatch(/^data:image\/png/);
    expect(r.h.characters[0].id).not.toBe(r.h.characters[1].id);
    expect(r.h.stations[0]).toMatchObject({ lat: null, lon: 11.5 });
    expect(r.h.stations[0].scenes[0].puzzle).toBeNull();
    expect(r.h.stations[0].scenes[1].puzzle).toMatchObject({ type: 'quiz', answers: ['a', '', '', ''], correct: 3 });
    expect([r.json, r.other, r.newer]).toEqual(['json', 'format', 'version']);
  });
});

test('whole example game without GPS: allies, energy, lost battle, mega evolution, treasure', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL_);
  await expect(page.getByText('Noch keine Schatzsuche')).toBeVisible();
  await createExample(page, false);
  await expect(page.locator('.hunt')).toContainText('6 Stationen · 6 Figuren');
  await page.getByRole('button', { name: 'Spielen' }).click();
  await expect(page.getByText('Die Waldfee braucht eure Hilfe!')).toBeVisible();
  await expect(page.locator('#btnParent')).toBeVisible();
  await page.getByRole('button', { name: 'Los geht’s!' }).click();
  // The treasure is locked until the dragon is defeated
  await expect(page.locator('[data-id="tree"]')).toBeDisabled();

  // 1. Castle: the dragon is far too strong (1 < 14)
  await station(page, 'castle');
  await page.getByRole('button', { name: 'Zum Kampf!' }).click();
  await expect(page.locator('#hpVal')).toHaveText('14');
  await expect(page.locator('[data-act="mega"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Angriff!' }).click();
  await expect(page.getByText('Der Drache ist viel zu stark!')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nochmal versuchen' })).toHaveCount(0);
  await next(page);

  // 2. Fox: running task (GPS) – parents count it as done
  await station(page, 'fox');
  await expect(page.getByText('zeigt mir, wie schnell ihr seid')).toBeVisible();
  await fallback(page);
  await expect(page.getByText('Flinker Fuchs ist jetzt in eurem Team!')).toBeVisible();
  await next(page);
  await expect(hud(page)).toContainText('🦊');

  // 3. Owl: quiz, a wrong answer first
  await station(page, 'owl');
  await page.getByRole('button', { name: '10' }).click();
  await expect(page.getByText('Hmm, nicht ganz.')).toBeVisible();
  await page.getByRole('button', { name: 'Nochmal versuchen' }).click();
  await page.getByRole('button', { name: '8' }).click();
  await expect(page.getByText('Weise Eule ist jetzt in eurem Team!')).toBeVisible();
  await next(page);

  // 4. Bear: clapping (microphone) – counted as done in the parents' area
  await station(page, 'bear');
  await page.locator('#btnParent').click();
  await page.getByRole('button', { name: 'Aufgabe als geschafft werten' }).click();
  await expect(page.getByText('Starker Bär ist jetzt in eurem Team!')).toBeVisible();
  await next(page);

  // 5. Spring: riddle (+1 energy), second visit: a different scene (+1)
  await station(page, 'spring');
  await page.getByLabel('Eure Antwort').fill('Bürste');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('Noch nicht richtig')).toBeVisible();
  await page.getByLabel('Eure Antwort').fill('  ein KAMM ');
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.getByText('+1 Energie')).toBeVisible();
  await next(page);
  await expect(energy(page)).toHaveText('⚡ 1');
  await station(page, 'spring');
  await expect(page.getByText('Schon wieder da?')).toBeVisible();
  await page.getByRole('button', { name: 'Geschafft!' }).click();
  await next(page);
  await expect(energy(page)).toHaveText('⚡ 2');

  // 6. Castle again: roaring gives the bonus; without the mega evolution 1 + 3·3 + 3 = 13 < 14
  await station(page, 'castle');
  await page.getByRole('button', { name: 'Zum Kampf!' }).click();
  await fallback(page);
  await expect(page.locator('#teamList li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Angriff!' }).click();
  await expect(page.getByText('Der Drache ist noch zu stark!').first()).toBeVisible();
  await page.getByRole('button', { name: 'Nochmal versuchen' }).click();
  await page.getByRole('button', { name: 'Zum Kampf!' }).click();
  await fallback(page);
  const mega = page.getByRole('button', { name: /Mega-Entwicklung/ });
  await mega.click();
  await expect(mega).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Angriff!' }).click();
  await expect(page.locator('#hpVal')).toHaveText('0');
  await expect(page.getByText('Der Drache schrumpft')).toBeVisible();
  await next(page);
  await expect(energy(page)).toHaveText('⚡ 0');

  // The castle has changed: the defeated dragon is replaced by a new story event
  await station(page, 'castle');
  await expect(page.getByText('Darf ich mitkommen?')).toBeVisible();
  await next(page);
  await expect(page.getByText('Mini-Drache ist jetzt in eurem Team!')).toBeVisible();
  await next(page);

  // 7. The treasure
  await expect(page.locator('[data-id="tree"]')).toBeEnabled();
  await station(page, 'tree');
  await page.getByRole('button', { name: 'Geschafft!' }).click();
  await page.getByRole('button', { name: 'Zum Schatz!' }).click();
  await expect(page.getByText('Ihr habt den Schatz gefunden!')).toBeVisible();
  // Progress survives a reload
  await page.reload();
  await expect(page.getByText('Ihr habt den Schatz gefunden!')).toBeVisible();
  await page.getByRole('button', { name: 'Zur Übersicht' }).click();
  await expect(page.locator('.hunt')).toContainText('Schatz gefunden');
});

test.describe('GPS', () => {
  test.use({ geolocation: HOME, permissions: ['geolocation'] });

  test('stations are placed around the position; the station opens only nearby, GPS inaccuracy counts', async ({ page, context }) => {
    await page.goto(URL_);
    await createExample(page, true);
    await page.getByRole('button', { name: 'Spielen' }).click();
    await page.getByRole('button', { name: 'Los geht’s!' }).click();
    await page.locator('[data-act="target"][data-id="castle"]').click();
    const arrive = page.getByRole('button', { name: 'Wir sind da!' });
    // Castle: 60 m north
    await expect(page.locator('#navDist')).toHaveText('60 m');
    await expect(page.locator('#navDir')).toContainText('Norden');
    await expect(arrive).toBeDisabled();
    // 35 m away with radius 20 m: still closed (the accuracy Playwright reports is 0)
    await context.setGeolocation(dest(HOME, 25, 0));
    await expect(page.locator('#navDist')).toHaveText('35 m');
    await expect(arrive).toBeDisabled();
    await context.setGeolocation(dest(HOME, 45, 0));
    await expect(page.locator('#navDist')).toHaveText('15 m');
    await expect(arrive).toBeEnabled();
    await expect(page.locator('#navWarm')).toContainText('Ihr seid da!');
    // An inaccurate fix 40 m away counts too (up to 30 m of the reported inaccuracy)
    await context.setGeolocation({ ...dest(HOME, 20, 0), accuracy: 25 });
    await expect(page.locator('#navDist')).toHaveText('40 m');
    await expect(arrive).toBeEnabled();
    await context.setGeolocation({ ...dest(HOME, 20, 0), accuracy: 5 });
    await expect(arrive).toBeDisabled();
    // Parents can open it anyway
    await page.getByRole('button', { name: 'Eltern: öffnen' }).click();
    await expect(page.getByRole('button', { name: 'Zum Kampf!' })).toBeVisible();

    // Fox den: 50 m at 75° – checked against the independent formula
    const hunt = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.startsWith('treasure-hunt.hunt.')))));
    const fox = hunt.stations.find(s => s.id === 'fox'), exp = dest(HOME, 50, 75);
    expect(fox.lat).toBeCloseTo(exp.latitude, 5);
    expect(fox.lon).toBeCloseTo(exp.longitude, 5);
  });

  test('editor: "Here" takes the current position', async ({ page }) => {
    await page.goto(URL_);
    await page.getByRole('button', { name: 'Neue Schatzsuche' }).click();
    await page.getByRole('button', { name: /Station hinzufügen/ }).click();
    await page.getByRole('button', { name: /Hier \(aktueller Standort\)/ }).click();
    await expect(page.getByLabel('Breite (Lat)')).toHaveValue(String(+HOME.latitude.toFixed(6)));
    await expect(page.getByLabel('Länge (Lon)')).toHaveValue(String(+HOME.longitude.toFixed(6)));
  });
});

test('resume code: continue on another device with the exported hunt', async ({ page, browser }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL_);
  await createExample(page, false);
  await page.getByRole('button', { name: 'Spielen' }).click();
  await page.getByRole('button', { name: 'Los geht’s!' }).click();
  await station(page, 'castle');
  await page.getByRole('button', { name: 'Zum Kampf!' }).click();
  await page.getByRole('button', { name: 'Angriff!' }).click();
  await next(page);
  await station(page, 'owl');
  await page.getByRole('button', { name: '8' }).click();
  await next(page);
  await page.locator('#btnParent').click();
  await page.getByRole('button', { name: 'Wiederaufnahme-Code anzeigen' }).click();
  const code = await page.locator('#codeOut').textContent();
  await page.keyboard.press('Escape');
  await page.locator('#btnParent').click();
  await page.getByRole('button', { name: /Zur Übersicht/ }).click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportieren' }).click()]);
  expect(dl.suggestedFilename()).toBe('der-schattendrache.schatzsuche.json');
  const file = readFileSync(await dl.path());
  const json = JSON.parse(file.toString('utf8'));
  expect(json).toMatchObject({ format: 'phanlipo-treasure-hunt', version: 1, title: 'Der Schattendrache' });
  // The configuration file contains no progress
  for (const k of ['team', 'done', 'visits', 'energy', 'flags', 'started', 'finished']) expect(json[k], k).toBeUndefined();

  const other = await browser.newContext({ locale: 'de-DE' });
  const p2 = await other.newPage();
  await p2.goto(URL_);
  await p2.setInputFiles('#fileHunt', { name: 'hunt.json', mimeType: 'application/json', buffer: file });
  await expect(p2.locator('.hunt')).toContainText('Der Schattendrache');
  await p2.getByRole('button', { name: 'Code eingeben' }).click();
  await p2.getByLabel('Code', { exact: true }).fill('ABCD-EFGH');
  await p2.getByRole('button', { name: 'Weiterspielen' }).click();
  await expect(p2.getByText('Der Code stimmt nicht')).toBeVisible();
  await p2.getByLabel('Code', { exact: true }).fill(code.toLowerCase());
  await p2.getByRole('button', { name: 'Weiterspielen' }).click();
  await expect(p2.getByText('Wohin geht ihr?')).toBeVisible();
  await expect(p2.locator('#hud .team')).toContainText('🦉');
  await expect(p2.locator('[data-id="owl"]')).toContainText('besucht');
  await expect(p2.locator('#hud .prog')).toContainText('2/6');
  await other.close();
});

test('import: other files are rejected, an existing hunt can be kept as a copy', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#fileHunt', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"phanlipo-tools-backup"}') });
  await expect(page.locator('#toast')).toHaveText('Das ist keine Schatzsuche-Datei.');
  await page.setInputFiles('#fileHunt', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('no json') });
  await expect(page.locator('#toast')).toHaveText('Die Datei ist kein gültiges JSON.');
  const hunt = { format: 'phanlipo-treasure-hunt', version: 1, id: 'h-test', title: 'Garten', stations: [{ name: 'Rutsche', scenes: [{ text: 'Hallo', win: { treasure: true } }] }] };
  await page.setInputFiles('#fileHunt', { name: 'g.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hunt)) });
  await expect(page.locator('.hunt')).toHaveCount(1);
  page.once('dialog', d => d.dismiss());
  await page.setInputFiles('#fileHunt', { name: 'g.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hunt)) });
  await expect(page.locator('.hunt')).toHaveCount(2);
  await expect(page.locator('.hunt').filter({ hasText: 'Garten (Kopie)' })).toHaveCount(1);
  // Deleting removes hunt and progress
  page.once('dialog', d => d.accept());
  await page.locator('.hunt').filter({ hasText: 'Garten (Kopie)' }).getByRole('button', { name: 'Löschen' }).click();
  await expect(page.locator('.hunt')).toHaveCount(1);
});

test('editor: HEIC photo (iPhone, Android) as picture with the libheif decoder, also offline', async ({ page, context }) => {
  const HEIC = { name: 'IMG_0004.HEIC', mimeType: 'image/heic', buffer: readFileSync(new URL('fixtures/photo.heic', import.meta.url)) };
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                                 // page now controlled → the decoder goes through the cache
  const choose = async () => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-img]').first().click()]);
    await fc.setFiles(HEIC);
    // embedded as JPEG data URL; 64×48 stays 64×48 (below 640 px)
    await expect.poll(() => page.evaluate(() => {
      const img = [...document.querySelectorAll('#edBody img')].find(i => i.src.startsWith('data:image/jpeg'));
      return img && img.complete ? [img.naturalWidth, img.naturalHeight] : null;
    })).toEqual([64, 48]);
  };
  await page.getByRole('button', { name: 'Neue Schatzsuche' }).click();
  await page.getByRole('button', { name: /Figur hinzufügen/ }).click();
  await choose();
  expect(await page.evaluate(() => Heic.info())).toEqual({ native: false, worker: true });
  // offline: the decoder was cached on first use
  await page.locator('[data-img-del]').first().click();
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Neue Schatzsuche' }).click();
  await page.getByRole('button', { name: /Figur hinzufügen/ }).click();
  await choose();
  await context.setOffline(false);
});

test.describe('editor: HEIC decoder cannot load', () => {
  test.use({ allowedProblems: /libheif|Failed to load resource/ });
  test('clear message', async ({ page, context }) => {
    // context.route also catches requests of the service worker
    await context.route('**/assets/vendor/libheif/**', r => r.abort());
    await page.goto(URL_);
    await page.getByRole('button', { name: 'Neue Schatzsuche' }).click();
    await page.getByRole('button', { name: /Figur hinzufügen/ }).click();
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-img]').first().click()]);
    await fc.setFiles({ name: 'IMG_0005.HEIC', mimeType: 'image/heic', buffer: readFileSync(new URL('fixtures/photo.heic', import.meta.url)) });
    await expect(page.locator('#toast')).toContainText('HEIC-Foto konnte nicht gelesen werden');
    await expect(page.locator('[data-img-del]')).toHaveCount(0);
  });
});

test('editor: own hunt with a quiz, conditions and effects; saved separately from the game', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL_);
  await page.getByRole('button', { name: 'Neue Schatzsuche' }).click();
  await page.getByLabel('Titel', { exact: true }).fill('Gartenabenteuer');
  await page.getByLabel('Eltern-PIN').fill('12a34');
  await expect(page.locator('.warn-list')).toContainText('Noch keine Station');
  await page.getByRole('button', { name: /Figur hinzufügen/ }).click();
  await page.getByLabel('Name').fill('Hase');
  await page.getByLabel('Emoji').fill('🐰');
  await page.getByRole('button', { name: 'Zurück' }).click();
  await page.getByRole('button', { name: /Station hinzufügen/ }).click();
  await page.getByLabel('Name').fill('Sandkasten');
  await page.locator('[data-act="ed-sc"]').first().click();
  await page.getByLabel('Story-Text').fill('Der Hase hat eine Frage.');
  await page.getByLabel('Figur', { exact: true }).selectOption({ label: '🐰 Hase' });
  await page.getByLabel('Rätsel / Aufgabe').selectOption('quiz');
  await page.getByLabel('Frage', { exact: true }).fill('Was frisst ein Hase?');
  for (const [i, a] of ['Steine', 'Möhren', 'Sand', 'Luft'].entries()) await page.getByLabel(`Antwort ${i + 1}`, { exact: true }).fill(a);
  await page.getByLabel('Richtige Antwort').selectOption({ label: 'Antwort 2' });
  await page.locator('fieldset').filter({ hasText: 'Wenn geschafft' }).getByLabel('Verbündeter kommt ins Team').selectOption({ label: '🐰 Hase' });
  await page.locator('fieldset').filter({ hasText: 'Wenn geschafft' }).getByLabel('Schatz freischalten').check();
  await page.locator('fieldset').filter({ hasText: 'Wenn geschafft' }).getByLabel('Merker setzen').fill('hase, frage');
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.locator('[data-act="ed-sc"]').first()).toContainText('Der Hase hat eine Frage.');
  await page.getByRole('button', { name: 'Zurück' }).click();
  await expect(page.locator('.warn-list')).toHaveCount(0);

  const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('treasure-hunt.')).map(k => [k, JSON.parse(localStorage.getItem(k))])));
  const key = Object.keys(stored).find(k => /^treasure-hunt\.hunt\..+\.v1$/.test(k));
  const h = stored[key];
  expect(h).toMatchObject({ title: 'Gartenabenteuer', pin: '1234' });
  expect(h.stations[0].scenes[0]).toMatchObject({ text: 'Der Hase hat eine Frage.', character: h.characters[0].id,
    puzzle: { type: 'quiz', question: 'Was frisst ein Hase?', answers: ['Steine', 'Möhren', 'Sand', 'Luft'], correct: 1 },
    win: { ally: h.characters[0].id, treasure: true, flags: ['hase', 'frage'] } });

  // Play it: the PIN guards the parents' area
  await page.getByRole('button', { name: 'Jetzt spielen' }).click();
  await page.getByRole('button', { name: 'Los geht’s!' }).click();
  await page.locator('#btnParent').click();
  await page.getByRole('textbox', { name: 'Eltern-PIN' }).fill('9999');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Falsche PIN')).toBeVisible();
  await page.getByRole('textbox', { name: 'Eltern-PIN' }).fill('1234');
  await page.getByRole('button', { name: 'OK' }).click();
  await expect(page.getByRole('button', { name: 'Wiederaufnahme-Code anzeigen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await station(page, Object.values(h.stations)[0].id);
  await page.getByRole('button', { name: 'Möhren' }).click();
  await expect(page.getByText('Hase ist jetzt in eurem Team!')).toBeVisible();
  await page.getByRole('button', { name: 'Zum Schatz!' }).click();
  await expect(page.getByText('Ihr habt den Schatz gefunden!')).toBeVisible();
  // The hunt itself is unchanged by playing; the progress has its own key
  const after = await page.evaluate(k => localStorage.getItem(k), key);
  expect(JSON.parse(after)).toEqual(h);
  const game = await page.evaluate(id => JSON.parse(localStorage.getItem(`treasure-hunt.game.${id}.v1`)), h.id);
  expect(game).toMatchObject({ finished: true, team: [h.characters[0].id], flags: ['hase', 'frage'] });
});

test('roaring: a loud microphone fills the bar and solves the task', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(), gain = ctx.createGain(), d = ctx.createMediaStreamDestination();
      osc.frequency.value = 300; gain.gain.value = 0.5; // ≈ −9 dBFS, louder than "laut" (−28 dBFS)
      osc.connect(gain).connect(d); osc.start();
      return d.stream;
    };
  });
  await page.goto(URL_);
  await page.evaluate(() => {
    const h = HuntEngine.normalize({ id: 'h-loud', title: 'Laut', stations: [{ id: 's', scenes: [{ id: 'x', puzzle: { type: 'loud', task: 'Brüllt!', seconds: 1, level: 'medium' }, win: { text: 'Laut genug!' } }] }] }, HuntPuzzles.TYPES);
    localStorage.setItem('treasure-hunt.hunt.h-loud.v1', JSON.stringify(h));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Spielen' }).click();
  await page.getByRole('button', { name: 'Los geht’s!' }).click();
  await station(page, 's');
  await page.getByRole('button', { name: 'Mikrofon starten' }).click();
  await expect(page.getByText('Laut genug!')).toBeVisible({ timeout: 8000 });
});

test.describe('microphone not allowed', () => {
  test('a clear message and the parents fallback', async ({ page }) => {
    await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); }; });
    await page.goto(URL_);
    await page.evaluate(() => {
      const h = HuntEngine.normalize({ id: 'h-clap', title: 'Klatschen', stations: [{ id: 's', scenes: [{ id: 'x', puzzle: { type: 'clap', count: 3 }, win: { text: 'Gut geklatscht!' } }] }] }, HuntPuzzles.TYPES);
      localStorage.setItem('treasure-hunt.hunt.h-clap.v1', JSON.stringify(h));
    });
    await page.reload();
    await page.getByRole('button', { name: 'Spielen' }).click();
    await page.getByRole('button', { name: 'Los geht’s!' }).click();
    await station(page, 's');
    await page.getByRole('button', { name: 'Mikrofon starten' }).click();
    await expect(page.getByText('Das Mikrofon geht hier nicht.')).toBeVisible();
    await fallback(page);
    await expect(page.getByText('Gut geklatscht!')).toBeVisible();
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('mic failed');
  });
});

test.describe('map', () => {
  test.use({ geolocation: HOME, permissions: ['geolocation'], allowedProblems: /tile\.openstreetmap\.org/ });

  test('tiles only after the map is switched on, then cached for offline use', async ({ page, context }) => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const asked = [];
    await context.route('https://tile.openstreetmap.org/**', route => {
      asked.push(route.request().url());
      route.fulfill({ status: 200, contentType: 'image/png', body: png, headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await page.goto(URL_);
    await createExample(page, true);
    await page.getByRole('button', { name: 'Spielen' }).click();
    await page.getByRole('button', { name: 'Los geht’s!' }).click();
    await page.locator('[data-act="target"][data-id="castle"]').click();
    await page.getByRole('button', { name: 'Karte' }).click();
    await expect(page.locator('#navMap')).toBeVisible();
    await expect(page.getByText('Karte ist aus')).toBeVisible();
    await page.waitForTimeout(500);
    expect(asked, 'no tiles before the map is switched on').toEqual([]);
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Karte einschalten' }).click();
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(asked.every(u => /^https:\/\/tile\.openstreetmap\.org\/1[5-8]\/\d+\/\d+\.png$/.test(u))).toBe(true);
    await expect(page.getByRole('link', { name: 'OpenStreetMap' })).toHaveAttribute('href', 'https://www.openstreetmap.org/copyright');
    await expect.poll(() => page.evaluate(() => HuntMap.cachedCount())).toBeGreaterThan(0);
    // Offline: the same view comes from the cache, nothing new is requested
    const before = asked.length;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#navMap')).toBeVisible();
    await page.waitForTimeout(800);
    expect(asked.length).toBe(before);
    await context.setOffline(false);
    // Settings (menu): switch off again, delete saved tiles
    await openMenu(page);
    await expect(page.getByLabel('OpenStreetMap-Karte verwenden')).toBeChecked();
    await page.getByRole('button', { name: 'Gespeicherte Kartenbilder löschen' }).click();
    await expect.poll(() => page.evaluate(() => HuntMap.cachedCount())).toBe(0);
    await closeMenu(page);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('example and game in English', async ({ page }) => {
    await page.goto(URL_);
    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: /Create the example/ }).click();
    await expect(page.locator('.hunt')).toContainText('The Shadow Dragon');
    await expect(page.locator('.hunt')).toContainText('6 stations · 6 characters');
    await page.getByRole('button', { name: 'Play' }).click();
    await expect(page.getByText('The forest fairy needs your help!')).toBeVisible();
    await page.getByRole('button', { name: 'Let’s go!' }).click();
    await page.locator('[data-act="target"][data-id="owl"]').click();
    await page.getByRole('button', { name: 'We are here!' }).click();
    await expect(page.getByText('Someone is sleeping up in the tree.')).toBeVisible();
    await switchLang(page, 'de');
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeVisible();
  });
});

test('accessible: editor and game screens, light and dark', async ({ page }) => {
  const check = async name => {
    // The shared toast is checked elsewhere; here it would be measured while fading out
    const { violations } = await axe(page).exclude('#toast').analyze();
    expect(violations.map(v => `${v.id}: ${v.help} → ${v.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`), name).toEqual([]);
  };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL_);
  await createExample(page, false);
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await check('home');
    await page.getByRole('button', { name: 'Bearbeiten' }).click();
    await check('editor');
    await page.locator('[data-act="ed-st"]').first().click();
    await check('station');
    await page.locator('[data-act="ed-sc"]').nth(1).click();
    await check('scene');
    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByRole('button', { name: 'Zurück' }).click();
    await page.getByRole('button', { name: 'Jetzt spielen' }).click();
    if (await page.getByRole('button', { name: 'Los geht’s!' }).count()) { await check('intro'); await page.getByRole('button', { name: 'Los geht’s!' }).click(); }
    await check('choose');
    await page.locator('[data-act="target"][data-id="owl"]').click();
    await check('navigation');
    await page.getByRole('button', { name: 'Wir sind da!' }).click();
    await check('scene');
    await next(page);
    await page.locator('[data-act="target"][data-id="castle"]').click();
    await page.getByRole('button', { name: 'Wir sind da!' }).click();
    await page.getByRole('button', { name: 'Zum Kampf!' }).click();
    await check('battle');
    await page.locator('#btnParent').click();
    await check('parents');
    await page.getByRole('button', { name: 'Wiederaufnahme-Code anzeigen' }).click();
    await check('code');
    await page.keyboard.press('Escape');
    // Start again for the next colour scheme
    await page.locator('#btnParent').click();
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Spiel neu starten' }).click();
    await page.locator('#btnParent').click();
    await page.getByRole('button', { name: /Zur Übersicht/ }).click();
  }
});

// AI reading voice (Piper, engine shared with "Text zu Sprache") with the tiny stand-in model from
// tests/fixtures/tiny-piper.onnx: its audio is the phoneme IDs / 1000 × length scale (= 1 / speed)
test.describe('AI reading voice', () => {
  test.use({ allowedProblems: /huggingface\.co|Failed to load resource|ERR_FAILED|ERR_INTERNET_DISCONNECTED|Failed to fetch/ });
  const TINY = readFileSync(new URL('fixtures/tiny-piper.onnx', import.meta.url));
  const CONFIG = JSON.stringify({ audio: { sample_rate: 16000 }, espeak: { voice: 'de' }, inference: { noise_scale: 0.667, length_scale: 1, noise_w: 0.8 }, num_speakers: 1 });
  // "Hallo! So klinge …" starts with ^ _ h _ ˈ _ a (Piper's phoneme IDs 1, 0, 20, 0, 120, 0, 14)
  const START = [1, 0, 20, 0, 120, 0, 14];

  test('Kerstin: asks before the download, reads at the chosen speed instead of the device voice, works offline', async ({ page, context }) => {
    test.setTimeout(120000);
    const models = [];
    await context.route(/huggingface\.co/, r => {
      const u = r.request().url();
      models.push(u.split('/').pop());
      if (u.endsWith('.onnx.json')) return r.fulfill({ contentType: 'application/json', body: CONFIG });
      if (u.endsWith('.onnx')) return r.fulfill({ contentType: 'application/octet-stream', body: TINY });
      return r.abort();
    });
    await page.addInitScript(() => {
      window.__audio = [];
      const copy = AudioBuffer.prototype.copyToChannel;
      AudioBuffer.prototype.copyToChannel = function (data, ...rest) {
        window.__audio.push({ rate: this.sampleRate, length: data.length, start: Array.from(data.slice(0, 7)) });
        return copy.call(this, data, ...rest);
      };
      window.__device = 0;
      if (window.speechSynthesis) { const speak = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__device++; return speak(u); }; }
    });
    await page.goto('/treasure-hunt/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                                   // controlled by the service worker → offline cache
    await openMenu(page);
    await expect(page.locator('#rateBox')).toBeHidden();
    let asked = '';
    page.once('dialog', d => { asked = d.message(); d.accept(); });
    await page.selectOption('#setVoice', 'piper:de/de_DE/kerstin/low/de_DE-kerstin-low');
    await expect.poll(() => asked).toContain('Kerstin einmalig herunterladen (ca. 63 MB)');
    await expect(page.locator('#rateBox')).toBeVisible();
    await expect(page.locator('#setRate')).toHaveValue('1.3');
    await expect.poll(() => page.evaluate(() => window.__audio.length), { timeout: 60000 }).toBe(1);
    let a = (await page.evaluate(() => window.__audio))[0];
    expect(a.rate).toBe(16000);
    expect(a.start.map(v => Math.round(v * 1000 * 1.3))).toEqual(START);
    expect(models).toContain('de_DE-kerstin-low.onnx');

    // Another speed: no second question, the length scale follows
    page.on('dialog', d => { asked = 'again'; d.dismiss(); });
    asked = '';
    await page.selectOption('#setRate', '1.5');
    await expect.poll(() => page.evaluate(() => window.__audio.length), { timeout: 30000 }).toBe(2);
    a = (await page.evaluate(() => window.__audio))[1];
    expect(a.start.map(v => Math.round(v * 1000 * 1.5))).toEqual(START);
    expect(asked).toBe('');
    expect(await page.evaluate(() => window.__device)).toBe(0);
    await closeMenu(page);

    // Offline after a reload: model from the shared cache, engine and libraries from the offline cache
    await context.unroute(/huggingface\.co/);
    await context.setOffline(true);
    await page.reload();
    await openMenu(page);
    await expect(page.locator('#setVoice')).toHaveValue('piper:de/de_DE/kerstin/low/de_DE-kerstin-low');
    await page.click('#btnVoice');
    await expect.poll(() => page.evaluate(() => window.__audio.length), { timeout: 60000 }).toBe(1);
    a = (await page.evaluate(() => window.__audio))[0];
    expect(a.start.map(v => Math.round(v * 1000 * 1.5))).toEqual(START);
    expect(await page.evaluate(() => window.__device)).toBe(0);
    await context.setOffline(false);
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('aiVoice: Kerstin');
  });

  test('without the download the device voice reads', async ({ page }) => {
    await page.addInitScript(() => {
      window.__device = 0;
      if (window.speechSynthesis) { const speak = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = u => { window.__device++; return speak(u); }; }
    });
    await page.goto('/treasure-hunt/');
    await openMenu(page);
    page.on('dialog', d => d.dismiss());
    await page.selectOption('#setVoice', 'piper:de/de_DE/kerstin/low/de_DE-kerstin-low');
    // Declined: nothing is downloaded; switching back to the automatic voice reads with the device
    await page.selectOption('#setVoice', '');
    await expect(page.locator('#rateBox')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__device)).toBeGreaterThan(0);
  });
});
