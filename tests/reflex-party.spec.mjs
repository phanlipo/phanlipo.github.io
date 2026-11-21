// Reflex-Party with a controlled clock: every mini-game makes exactly the pictures it promises (checked with
// independent rules here), rounds (intro, a picture per step, a "hit now!" picture at the latest every 6th),
// first right tap scores and ends the round, wrong taps cost a point (not below 0) and lock that player,
// two missed chances end the round, match to the target with ranking; blind countdown with exact reaction
// times and solo best; pads for 1–4 players (top row turned), keyboard 1–4, stop and leaving the app abort,
// settings persist, at least one mini-game stays on, English.
import { test, expect, openMenu, closeMenu, switchLang, axe } from './helpers.mjs';

const LS = 'reflex-party.state.v1';
const INTRO = 1400, BANNER = 1300, STEP = { easy: 1600, normal: 1200, hard: 850 };

// Independent rules for "is this a hit?" – not taken from games.js
const RULES = {
  color: s => s.word === s.ink,
  sum: s => (s.op === '*' ? s.a * s.b : s.a + s.b) === s.c,
  bars: s => s.a === s.b,
  count: s => s.dots.length === s.n,
  pair: s => new Set(s.items.map(i => i.shape + '/' + i.ink)).size < s.items.length,
  dice: s => s.d[0] === s.d[1],
  clock: s => s.h === s.dh && s.m === s.dm,
  order: s => s.nums.join() === [...s.nums].sort((a, b) => a - b).join() && new Set(s.nums).size === s.nums.length,
  green: s => s.lamp === 'green',
};

async function open(page, settings = {}) {
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); },
    [LS, JSON.stringify({ players: 2, target: 5, diff: 'normal', sound: false, vibrate: false, speak: false, ...settings })]);
  await page.clock.install({ time: new Date('2026-05-01T09:00:00') });
  await page.goto('/reflex-party/');
  await page.clock.pauseAt(new Date('2026-05-01T09:00:05'));
}
const picture = async page => {
  const v = await page.locator('#stim').getAttribute('data-state');
  return v ? JSON.parse(v) : null;
};
const saved = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
const pad = (page, n) => page.locator(`.pad[data-p="${n - 1}"]`);
const score = (page, n) => pad(page, n).locator('.pad-score');

test('every mini-game makes hit and non-hit pictures exactly as asked, on every difficulty', async ({ page }) => {
  await page.goto('/reflex-party/');
  const bad = await page.evaluate(rules => {
    const RG = window.ReflexGames, check = Object.fromEntries(Object.entries(rules).map(([k, f]) => [k, new Function('s', 'return (' + f + ')(s)')]));
    const out = [];
    for (const id of RG.IDS) {
      if (id === 'countdown') continue;
      for (const diff of RG.DIFFS) for (const want of [true, false]) for (let i = 0; i < 300; i++) {
        const s = RG.make(id, Tools.randomInt, want, diff, null);
        if (s.g !== id || check[id](s) !== want) out.push({ id, diff, want, s });
        if (id === 'count' && (s.n < 1 || s.dots.some((a, j) => s.dots.some((b, k) => k > j && Math.hypot(a.x - b.x, a.y - b.y) < 16)))) out.push({ id, s });
        if (id === 'bars' && (s.a < 20 || s.a > 98 || s.b < 20 || s.b > 98)) out.push({ id, s });
        if (id === 'clock' && (s.dh < 1 || s.dh > 12 || s.dm < 0 || s.dm > 55 || s.dm % 5)) out.push({ id, s });
        if (id === 'pair' && s.items.length !== { kids: 3, easy: 4, normal: 5, hard: 7 }[diff]) out.push({ id, s });
      }
    }
    return out.slice(0, 5);
  }, Object.fromEntries(Object.entries(RULES).map(([k, f]) => [k, f.toString()])));
  expect(bad).toEqual([]);
});

test('two players: wrong tap costs a point and locks, first right tap scores, match to 5 with ranking', async ({ page }) => {
  await open(page, { games: ['dice'] });
  await expect(page.locator('#gamesInfo')).toHaveText('1 von 10 Minispielen an. Tippen schaltet ein oder aus.');
  await page.click('#btnStart');
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#btnStop')).toBeVisible();
  // Player 1 at the bottom, player 2 at the top (turned towards the person opposite)
  await expect(page.locator('#padsBottom .pad')).toHaveCount(1);
  await expect(page.locator('#padsTop .pad')).toHaveText('Spieler 20');
  await expect(page.locator('#task')).toHaveText('Tippen bei einem Pasch');
  await expect(page.locator('#taskTop')).toHaveText('Tippen bei einem Pasch');
  // Taps during the intro don't count
  await pad(page, 1).click();
  await expect(score(page, 1)).toHaveText('0');
  expect(await picture(page)).toBeNull();

  await page.clock.runFor(INTRO);
  // Steps the clock picture by picture until one is (or isn't) a hit; hit pictures come at least every 6th
  let sinceHit = 0;
  async function until(hit) {
    for (let i = 0; i < 30; i++) {
      const s = await picture(page);
      expect(s.g).toBe('dice');
      if (RULES.dice(s) === hit) return;
      sinceHit = RULES.dice(s) ? 0 : sinceHit + 1;
      expect(sinceHit).toBeLessThanOrEqual(5);
      await page.clock.runFor(STEP.normal);
    }
    throw new Error('no such picture');
  }
  // The first picture of a round is never a hit. Player 1 taps wrong at 0 points: stays 0, locked
  expect(RULES.dice(await picture(page))).toBe(false);
  await pad(page, 1).click();
  await expect(score(page, 1)).toHaveText('0');
  await expect(pad(page, 1)).toHaveClass(/locked/);
  await until(true);
  await pad(page, 1).click();                 // locked: nothing happens
  await expect(score(page, 1)).toHaveText('0');
  await pad(page, 2).click();
  await expect(score(page, 2)).toHaveText('1');
  await expect(page.locator('#stim')).toHaveAttribute('data-result', 'p2');
  await expect(page.locator('#stim .banner')).toHaveText('Spieler 2+1');
  await page.clock.runFor(BANNER + INTRO);
  await expect(pad(page, 1)).not.toHaveClass(/locked/);
  // New round: player 2 taps wrong and loses the point again
  expect(RULES.dice(await picture(page))).toBe(false);
  sinceHit = 0;
  await pad(page, 2).click();
  await expect(score(page, 2)).toHaveText('0');
  await expect(pad(page, 2)).toHaveClass(/locked/);
  let p1 = 0;
  while (p1 < 5) {
    await until(true);
    await pad(page, 1).click();
    p1++;
    await expect(score(page, 1)).toHaveText(String(p1));
    // A second tap in the same moment doesn't score any more
    await pad(page, 2).click();
    await expect(score(page, 2)).toHaveText('0');
    if (p1 < 5) { await page.clock.runFor(BANNER + INTRO); sinceHit = 0; }
  }
  expect(p1).toBe(5);
  await page.clock.runFor(BANNER);
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'over');
  await expect(page.locator('.result h2')).toHaveText('Spieler 1 gewinnt!');
  await expect(page.locator('#resList li')).toHaveText(['Spieler 15', 'Spieler 20']);
  const st = await saved(page);
  expect(st.matches).toBe(1);
  expect(st.last).toMatchObject({ players: 2, target: 5, diff: 'normal', scores: [5, 0], wrong: [1, 1], winner: 0 });
  // Again: a fresh match with the same players
  await page.click('#btnAgain');
  await expect(score(page, 1)).toHaveText('0');
  await expect(page.locator('#arena')).toHaveAttribute('data-phase', 'play');
});

test('nobody presses: after two missed chances the round ends without a point', async ({ page }) => {
  await open(page, { games: ['green'], diff: 'easy' });
  await page.click('#btnStart');
  await page.clock.runFor(INTRO);
  let hits = 0;
  for (let i = 0; i < 20; i++) {
    const s = await picture(page);
    if (s && RULES.green(s)) hits++;
    await page.clock.runFor(STEP.easy);
    if (await page.locator('#stim').getAttribute('data-result')) break;
  }
  expect(hits).toBe(2);
  await expect(page.locator('#stim')).toHaveAttribute('data-result', 'nobody');
  await expect(page.locator('#stim .banner')).toHaveText('Keiner – weiter geht’s');
  await expect(score(page, 1)).toHaveText('0');
  await expect(score(page, 2)).toHaveText('0');
  // Next round starts on its own
  await page.clock.runFor(BANNER);
  await expect(page.locator('#stim')).not.toHaveAttribute('data-result', /./);
  await expect(page.locator('#task')).toHaveText('Tippen, sobald die Lampe grün ist');
});

test('solo blind countdown: too early, exact reaction time, best result per difficulty', async ({ page }) => {
  await open(page, { players: 1, games: ['countdown'] });
  await page.click('#btnStart');
  await expect(page.locator('#padsTop .pad')).toHaveCount(0);
  await expect(page.locator('#taskTop')).toBeHidden();
  await expect(page.locator('#task')).toHaveText('Tippen, wenn der Countdown bei 0 wäre');
  await page.clock.runFor(INTRO);
  // Normal: 800 ms per number, only the 3 is visible, 0 is reached after 2400 ms, hits count for 800 ms
  expect(await picture(page)).toEqual({ g: 'countdown', shown: 3 });
  await page.clock.runFor(800);
  expect(await picture(page)).toEqual({ g: 'countdown', shown: null });
  await expect(page.locator('.cd')).toHaveText('?');
  await page.clock.runFor(1500);  // 2300 ms: still too early
  await pad(page, 1).click();
  await expect(page.locator('#stim')).toHaveAttribute('data-result', 'early');
  await expect(page.locator('#stim .banner')).toHaveText('Zu früh!');

  const reactions = [120, 300, 50, 790, 240];
  for (const ms of reactions) {
    await page.clock.runFor(BANNER + INTRO + 2400 + ms);
    await pad(page, 1).click();
    await expect(page.locator('#stim')).toHaveAttribute('data-result', 'p1');
  }
  await expect(score(page, 1)).toHaveText('5');
  await page.clock.runFor(BANNER);
  await expect(page.locator('.result h2')).toHaveText('Geschafft!');
  await expect(page.locator('#resRecord')).toHaveText('Neue Bestzeit!');
  // Average 300 ms; one too early, nothing missed
  await expect(page.locator('#resList li').nth(1)).toHaveText('Ø Reaktion: 300 ms');
  await expect(page.locator('#resList li').nth(2)).toHaveText('Zu früh/falsch: 1');
  await expect(page.locator('#resList li').nth(3)).toHaveText('Verpasst: 0');
  expect((await saved(page)).best['normal-5'].avg).toBe(300);
  await openMenu(page);
  await expect(page.locator('#bestList td')).toHaveText(['Mittel · 5', '300 ms']);
  await closeMenu(page);

  // A missed countdown counts as missed, a slower match is no new best
  await page.click('#btnAgain');
  await page.clock.runFor(INTRO + 2400 + 800);
  await expect(page.locator('#stim')).toHaveAttribute('data-result', 'nobody');
  await expect(page.locator('#stim .banner')).toHaveText('Verpasst');
  for (let i = 0; i < 5; i++) {
    await page.clock.runFor(BANNER + INTRO + 2400 + 500);
    await pad(page, 1).click();
  }
  await page.clock.runFor(BANNER);
  await expect(page.locator('#resList li').nth(1)).toHaveText('Ø Reaktion: 500 ms');
  await expect(page.locator('#resList li').nth(3)).toHaveText('Verpasst: 1');
  await expect(page.locator('#resRecord')).toHaveCount(0);
  expect((await saved(page)).best['normal-5'].avg).toBe(300);
});

test('three and four players: pads in the corners, keyboard keys 1–4', async ({ page }) => {
  await open(page, { players: 4, games: ['countdown'] });
  await page.click('#btnStart');
  await expect(page.locator('#padsBottom .pad')).toHaveText(['Spieler 10', 'Spieler 20']);
  await expect(page.locator('#padsTop .pad')).toHaveText(['Spieler 40', 'Spieler 30']);
  // Top pads are turned so the people opposite can read them
  expect(await page.locator('#padsTop .pad-inner').first().evaluate(e => getComputedStyle(e).rotate)).toBe('180deg');
  await page.clock.runFor(INTRO + 1000);
  await page.keyboard.press('2');                 // too early: player 2 locked
  await expect(pad(page, 2)).toHaveClass(/locked/);
  await page.clock.runFor(1500);
  await page.keyboard.press('4');
  await expect(score(page, 4)).toHaveText('1');
  await expect(page.locator('#stim')).toHaveAttribute('data-result', 'p4');
  // The pads fit side by side at 375 px without scrolling
  await page.setViewportSize({ width: 375, height: 640 });
  const box = await page.locator('#padsTop').boundingBox();
  expect(box.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);

  await page.click('#btnStop');
  await expect(page.locator('#setup')).toBeVisible();
  await page.click('#players [data-n="3"]');
  await page.click('#btnStart');
  await expect(page.locator('#padsTop .pad')).toHaveText(['Spieler 30']);
  await expect(page.locator('#padsBottom .pad')).toHaveCount(2);
  await page.keyboard.press('4');                 // no fourth player: ignored, no error
  // Leaving the app ends the match
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#toast')).toHaveText('Partie abgebrochen.');
});

test('choosing before the start: mini-games on/off, at least one stays on, settings persist', async ({ page }) => {
  await open(page);
  // Everything is chosen on the start screen, before the match
  const setup = page.locator('#setup');
  await expect(setup.locator('#games button')).toHaveCount(10);
  await expect(page.locator('#gamesInfo')).toHaveText('10 von 10 Minispielen an. Tippen schaltet ein oder aus.');
  await expect(page.locator('#diffInfo')).toHaveText('1,2 Sekunden pro Bild.');
  await page.click('#players [data-n="3"]');
  await page.click('#targets [data-target="15"]');
  await page.click('#diffs [data-diff="hard"]');
  await expect(page.locator('#diffInfo')).toHaveText('0,85 Sekunden pro Bild und kleinere Unterschiede.');
  for (const id of ['color', 'sum', 'bars', 'count', 'pair', 'dice', 'clock', 'order', 'green'])
    await page.click(`#games [data-game="${id}"]`);
  await expect(page.locator('#games [aria-pressed="true"]')).toHaveText(['Blind-Countdown']);
  await page.click('#games [data-game="countdown"]');   // the last one stays on
  await expect(page.locator('#games [data-game="countdown"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#toast')).toHaveText('Mindestens ein Minispiel bleibt an.');
  await page.click('#games [data-game="dice"]');
  await expect(page.locator('#gamesInfo')).toHaveText('2 von 10 Minispielen an. Tippen schaltet ein oder aus.');
  await page.uncheck('#optSpeak');
  await openMenu(page);
  await page.uncheck('#optVibrate');
  await closeMenu(page);
  await page.reload();
  await expect(page.locator('#players [data-n="3"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#targets [data-target="15"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#games [aria-pressed="true"]')).toHaveText(['Pasch', 'Blind-Countdown']);
  await expect(page.locator('#optSpeak')).not.toBeChecked();
  expect(await saved(page)).toMatchObject({ players: 3, target: 15, diff: 'hard', games: ['dice', 'countdown'], vibrate: false, speak: false });
  // "Alle" and "Ohne Lesen"
  await page.click('#btnAllGames');
  await expect(page.locator('#games [aria-pressed="true"]')).toHaveCount(10);
  await page.click('#btnKidGames');
  await expect(page.locator('#games [aria-pressed="true"]')).toHaveText(['Balken', 'Punkte zählen', 'Paar', 'Pasch', 'Grünes Licht', 'Blind-Countdown']);
  await page.click('#btnAllGames');
  await page.click('#games [data-game="color"]');
  await page.click('#games [data-game="sum"]');

  // A round is one of the chosen games, and never the same twice in a row; the start screen is gone while playing
  await page.click('#btnStart');
  await expect(setup).toBeHidden();
  const seen = [];
  for (let i = 0; i < 6; i++) {
    seen.push(await page.locator('#stim').getAttribute('data-game'));
    await page.clock.runFor(INTRO + 1);
    // Finish the round fast: everyone taps (wrong or right), the next round follows
    for (const n of [1, 2, 3]) await pad(page, n).click();
    await page.clock.runFor(BANNER);
  }
  expect(seen.every(g => !['color', 'sum'].includes(g))).toBe(true);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
});

test('kids: more time, easy pictures, no minus for pressing too early, countdown shows the 0', async ({ page }) => {
  await open(page, { diff: 'normal' });
  await page.click('#diffs [data-diff="kids"]');
  await expect(page.locator('#diffInfo')).toHaveText('Viel Zeit pro Bild, ganz einfache Aufgaben, Zahlen beim Countdown sichtbar. Zu früh drücken kostet keinen Punkt.');
  // Choosing kids switches to the games without reading; adding one with reading shows a hint
  await expect(page.locator('#games [aria-pressed="true"]')).toHaveText(['Balken', 'Punkte zählen', 'Paar', 'Pasch', 'Grünes Licht', 'Blind-Countdown']);
  await page.click('#games [data-game="clock"]');
  await expect(page.locator('#gamesInfo')).toContainText('Farbwort, Rechnung, Uhrzeit und Reihenfolge brauchen Lesen oder Rechnen.');
  await page.click('#btnKidGames');
  await expect(page.locator('#gamesInfo')).not.toContainText('Lesen');
  // Choosing kids again doesn't overwrite a changed choice
  await page.click('#games [data-game="dice"]');
  await page.click('#diffs [data-diff="kids"]');
  await expect(page.locator('#games [data-game="dice"]')).toHaveAttribute('aria-pressed', 'false');

  // Easy pictures (independently checked)
  const pics = await page.evaluate(() => {
    const RG = window.ReflexGames, out = {};
    for (const id of RG.IDS) if (id !== 'countdown') out[id] = Array.from({ length: 200 }, (_, i) => RG.make(id, Tools.randomInt, i % 2 === 0, 'kids', null));
    return out;
  });
  for (const s of pics.sum) { expect(s.op).toBe('+'); expect(Math.max(s.a, s.b)).toBeLessThanOrEqual(5); }
  for (const s of pics.count) { expect(s.dots.length).toBeGreaterThanOrEqual(2); expect(s.dots.length).toBeLessThanOrEqual(5); }
  for (const s of pics.pair) expect(s.items).toHaveLength(3);
  for (const s of pics.clock) { expect(s.m).toBe(0); expect(s.dm).toBe(0); }
  for (const s of pics.order) { expect(s.nums).toHaveLength(3); expect(Math.max(...s.nums)).toBeLessThanOrEqual(10); }
  for (const s of pics.bars) if (s.a !== s.b) expect(Math.abs(s.a - s.b)).toBeGreaterThanOrEqual(22);
  for (const [id, list] of Object.entries(pics)) list.forEach((s, i) => expect(RULES[id](s), id).toBe(i % 2 === 0));

  // A match with only the countdown: 1000 ms per number, all visible, then 0; intro 2200 ms
  await page.click('#btnKidGames');
  for (const id of ['bars', 'count', 'pair', 'dice', 'green']) await page.click(`#games [data-game="${id}"]`);
  await page.click('#btnStart');
  await expect(page.locator('#task')).toHaveText('Tippen, sobald die 0 kommt');
  await page.clock.runFor(1400);
  expect(await picture(page)).toBeNull();        // still the intro
  await page.clock.runFor(800);
  expect(await picture(page)).toEqual({ g: 'countdown', shown: 3 });
  await page.clock.runFor(1000);
  expect(await picture(page)).toEqual({ g: 'countdown', shown: 2 });
  await page.clock.runFor(1000);
  expect(await picture(page)).toEqual({ g: 'countdown', shown: 1 });
  await pad(page, 1).click();                     // too early: locked, but no point lost
  await expect(pad(page, 1)).toHaveClass(/locked/);
  await page.clock.runFor(1000);
  expect(await picture(page)).toEqual({ g: 'countdown', shown: 0 });
  await expect(page.locator('.cd')).toHaveText('0');
  await page.clock.runFor(1400);                  // the window is 1500 ms
  await pad(page, 2).click();
  await expect(score(page, 2)).toHaveText('1');
  await page.clock.runFor(BANNER + 2200 + 3000 + 100);
  await pad(page, 2).click();
  await page.clock.runFor(BANNER + 2200 + 2500);
  await pad(page, 2).click();                     // too early with 2 points: still 2
  await expect(score(page, 2)).toHaveText('2');
  await expect(pad(page, 2)).toHaveClass(/locked/);
  expect((await saved(page)).diff).toBe('kids');
});

test('reads the task aloud at the start of each round, pictures start after it, and the winner at the end', async ({ page }) => {
  // Fake speech: records what is said; "reading" takes 3 s on the controlled clock
  await page.addInitScript(() => {
    window.__said = [];
    window.SpeechSynthesisUtterance = function (text) { this.text = text; };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      speak(u) { window.__said.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 3000); },
      cancel() { window.__said.push('cancel'); }, getVoices: () => [],
    } });
  });
  await open(page, { games: ['countdown'], speak: true });
  await expect(page.locator('#optSpeak')).toBeChecked();
  await expect(page.locator('#speakInfo')).toBeHidden();
  await page.click('#btnStart');
  const said = () => page.evaluate(() => window.__said.filter(x => x !== 'cancel'));
  expect(await said()).toEqual([{ text: 'Tippen, wenn der Countdown bei 0 wäre', lang: 'de-DE' }]);
  // Intro is 1400 ms, but the pictures wait for the end of the speech (3000 ms)
  await page.clock.runFor(2900);
  expect(await picture(page)).toBeNull();
  await page.clock.runFor(100);
  expect(await picture(page)).toEqual({ g: 'countdown', shown: 3 });
  for (let i = 0; i < 5; i++) {
    await page.clock.runFor((i ? BANNER + 3000 : 0) + 2400 + 100);
    await pad(page, 1).click();
    await expect(score(page, 1)).toHaveText(String(i + 1));
  }
  await page.clock.runFor(BANNER);
  await expect(page.locator('.result h2')).toHaveText('Spieler 1 gewinnt!');
  const all = await said();
  expect(all).toHaveLength(6);
  expect(all.at(-1)).toEqual({ text: 'Spieler 1 gewinnt!', lang: 'de-DE' });
  // Stopping silences the voice at once
  await page.click('#btnAgain');
  await page.click('#btnStop');
  expect((await page.evaluate(() => window.__said)).at(-1)).toBe('cancel');
});

test('without speech in the browser the option is off and explained; the match runs anyway', async ({ page }) => {
  await page.addInitScript(() => { delete window.speechSynthesis; delete window.SpeechSynthesisUtterance; });
  await open(page, { games: ['dice'], speak: true });
  await expect(page.locator('#optSpeak')).toBeDisabled();
  await expect(page.locator('#speakInfo')).toHaveText('Dieser Browser kann nicht vorlesen.');
  await page.click('#btnStart');
  await page.clock.runFor(INTRO);
  expect((await picture(page)).g).toBe('dice');
});

for (const scheme of ['light', 'dark']) {
  test(`accessible while playing and on the result (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, { players: 4, games: ['countdown'], target: 5 });
    await page.click('#btnStart');
    for (let i = 0; i < 6; i++) {
      await page.clock.runFor((i ? BANNER + INTRO : INTRO) + 2500);
      await pad(page, i === 1 ? 2 : 3).click();  // one point for player 2, five for player 3
    }
    await page.clock.runFor(BANNER);
    await expect(page.locator('.result h2')).toHaveText('Spieler 3 gewinnt!');
    await expect(page.locator('#resList li')).toHaveText(['Spieler 35', 'Spieler 21', 'Spieler 10', 'Spieler 40']);
    // axe needs running timers; the result screen stays as it is
    await page.clock.resume();
    expect((await axe(page).analyze()).violations).toEqual([]);
    // While playing (real time: the picture may change during the check, which is fine)
    await page.click('#btnAgain');
    await expect(page.locator('#stim')).toHaveAttribute('data-state', /countdown/);
    await page.keyboard.press('1');   // too early: a locked pad is checked as well
    expect((await axe(page).exclude('.pad.bad').analyze()).violations).toEqual([]);
  });
}

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, pads and result in English; switching language re-renders', async ({ page }) => {
    await open(page, { players: 2, games: ['countdown'], diff: 'easy' });
    await expect(page.locator('#gamesInfo')).toHaveText('1 of 10 mini-games on. Tap to switch on or off.');
    await expect(page.locator('#diffInfo')).toHaveText('1.6 seconds per picture.');
    await page.click('#btnStart');
    await expect(page.locator('#task')).toHaveText('Tap when the countdown would hit 0');
    await expect(pad(page, 1)).toHaveText('Player 10');
    // Easy: 900 ms per number, 3 and 2 visible
    await page.clock.runFor(INTRO + 900);
    expect(await picture(page)).toEqual({ g: 'countdown', shown: 2 });
    await page.clock.runFor(900);
    expect(await picture(page)).toEqual({ g: 'countdown', shown: null });
    // 0 is reached 2700 ms after the start; tap 100 ms later in every round
    await page.clock.runFor(1000);
    await pad(page, 2).click();
    await expect(score(page, 2)).toHaveText('1');
    await switchLang(page, 'de');
    await expect(pad(page, 2)).toHaveText('Spieler 21');
    await switchLang(page, 'en');
    await expect(pad(page, 2)).toHaveText('Player 21');
    for (let i = 2; i <= 5; i++) {
      await page.clock.runFor(BANNER + INTRO + 2800);
      await pad(page, 2).click();
      await expect(score(page, 2)).toHaveText(String(i));
    }
    await page.clock.runFor(BANNER);
    await expect(page.locator('.result h2')).toHaveText('Player 2 wins!');
    await expect(page.locator('#btnAgain')).toHaveText('Play again');
    await switchLang(page, 'de');
    await expect(page.locator('.result h2')).toHaveText('Spieler 2 gewinnt!');
  });
});
