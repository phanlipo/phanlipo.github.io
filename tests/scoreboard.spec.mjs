// Anzeigetafel: scoring rules (table tennis, tennis, padel, darts) worked out by hand, serve, football clock,
// names, swapping sides, keyboard, one score per sport, new match, English.
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

const LS = 'scoreboard.state.v1';
// Side on the board (left/top = first .side), by player number 0/1
const side = (page, p) => page.locator(`.side[data-p="${p}"]`);
const pts = (page, p) => side(page, p).locator('.pts');
const tap = async (page, p, n = 1) => { for (let i = 0; i < n; i++) await side(page, p).locator('.tile').click(); };
// Who serves (the white ball): player number or null
const serving = page => page.evaluate(() => {
  const el = document.querySelector('.side:has(.serve)');
  return el ? Number(el.dataset.p) : null;
});
const mini = (page, p, label) => side(page, p).locator('.mini', { has: page.locator('.k', { hasText: label }) }).locator('.v');
// The score of a list of points straight from the rules (no UI)
const rules = (page, sport, points, cfg = {}, first = 0) =>
  page.evaluate(([sport, pts, cfg, first]) => ScoreRules.score({ sport, pts, cfg, first }), [sport, points, cfg, first]);
const rep = (p, n) => Array(n).fill(p);
// One game in tennis/padel won to love
const game = p => rep(p, 4);

async function pickSport(page, sport) {
  await openMenu(page);
  await page.locator(`#sports [data-sport="${sport}"]`).click();
  await closeMenu(page);
}
async function setNames(page, a, b) {
  await openMenu(page);
  await page.fill('#name0', a);
  await page.fill('#name1', b);
  await closeMenu(page);
}

test.beforeEach(async ({ page }) => { await page.goto('/scoreboard/'); });

test.describe('table tennis', () => {
  test('starts with table tennis, points by tapping, serve changes every 2 points', async ({ page }) => {
    await expect(page.locator('#sportName')).toHaveText('Tischtennis');
    await expect(pts(page, 0)).toHaveText('0');
    await expect(page.locator('#info')).toHaveText('Satz 1');
    expect(await serving(page)).toBe(0);
    await tap(page, 0);
    expect(await serving(page)).toBe(0);
    await tap(page, 1);
    // 1:1 → 2 points played, other player serves
    await expect(pts(page, 1)).toHaveText('1');
    expect(await serving(page)).toBe(1);
    await tap(page, 1, 2);
    expect(await serving(page)).toBe(0);
    await expect(mini(page, 0, 'Sätze')).toHaveText('0');
  });

  test('rules: 11 with 2 ahead, from 10:10 every point a serve change, next game the other player starts', async ({ page }) => {
    // 10:10 – 20 points played, serve changed 10 times → back to player 1
    const deuce = [].concat(...Array(10).fill([0, 1]));
    let s = await rules(page, 'tabletennis', deuce);
    expect(s.points).toEqual(['10', '10']);
    expect(s.server).toBe(0);
    expect(s.deuce).toBe(true);
    s = await rules(page, 'tabletennis', deuce.concat(0));
    expect(s.points).toEqual(['11', '10']);
    expect(s.sets).toEqual([0, 0]);
    expect(s.server).toBe(1);
    expect(s.ball).toEqual({ p: 0, kind: 'set' });
    s = await rules(page, 'tabletennis', deuce.concat(0, 0));
    expect(s.sets).toEqual([1, 0]);
    expect(s.done).toEqual([{ games: [12, 10] }]);
    // Game 2 starts with player 2 serving
    expect(s.server).toBe(1);
    expect(s.game).toBe(2);
    // 11:9 ends the game
    s = await rules(page, 'tabletennis', rep(1, 9).concat(rep(0, 11)));
    expect(s.sets).toEqual([1, 0]);
    // Player 2 serves first in the match
    s = await rules(page, 'tabletennis', [0, 0], {}, 1);
    expect(s.server).toBe(0);
  });

  test('best of 3: match point, winner, no more points, undo brings the match back', async ({ page }) => {
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ sport: 'tabletennis', m: { tabletennis: { cfg: { bestOf: 3 }, pts: Array(21).fill(0) } } })), LS);
    await page.reload();
    await setNames(page, 'Stützer', 'Eichelkraut');
    await expect(mini(page, 0, 'Sätze')).toHaveText('1');
    await expect(pts(page, 0)).toHaveText('10');
    await expect(page.locator('#info')).toHaveText('Satz 2 · Matchball Stützer');
    await expect(side(page, 0).locator('.done')).toHaveText('11');
    await expect(side(page, 1).locator('.done')).toHaveText('0');
    await tap(page, 0);
    await expect(page.locator('#info')).toHaveText('🏆 Stützer gewinnt!');
    await expect(mini(page, 0, 'Sätze')).toHaveText('2');
    await expect(side(page, 0).locator('.tile')).toHaveClass(/won/);
    expect(await serving(page)).toBe(null);
    await expect(side(page, 1).locator('.tile')).toHaveAttribute('aria-disabled', 'true');
    await side(page, 1).locator('.tile').click({ force: true });
    await expect(pts(page, 1)).toHaveText('0');
    await page.click('#btnUndo');
    await expect(pts(page, 0)).toHaveText('10');
    await expect(page.locator('#info')).toHaveText('Satz 2 · Matchball Stützer');
  });

  test('deciding game: change ends at 5', async ({ page }) => {
    // Best of 5, 2:2 in games, then 5:3
    const twoAll = [...rep(0, 11), ...rep(1, 11), ...rep(0, 11), ...rep(1, 11)];
    let s = await rules(page, 'tabletennis', twoAll.concat(1, 1, 1, 0, 0, 0, 0, 0));
    expect(s.sets).toEqual([2, 2]);
    expect(s.points).toEqual(['5', '3']);
    expect(s.changeEnds).toBe(true);
    s = await rules(page, 'tabletennis', twoAll.concat(0, 0, 0, 0, 0, 1));
    expect(s.changeEnds).toBe(false);
    // Not in an earlier game
    s = await rules(page, 'tabletennis', rep(0, 5));
    expect(s.changeEnds).toBe(false);
  });

  test('time-out marker per player, kept after reload', async ({ page }) => {
    const to = side(page, 1).locator('.to');
    await expect(to).toHaveAttribute('aria-pressed', 'false');
    await to.click();
    await expect(side(page, 1).locator('.to')).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(side(page, 1).locator('.to')).toHaveAttribute('aria-pressed', 'true');
    await expect(side(page, 0).locator('.to')).toHaveAttribute('aria-pressed', 'false');
  });
});

test.describe('tennis', () => {
  test.beforeEach(async ({ page }) => { await pickSport(page, 'tennis'); });

  test('0-15-30-40, deuce and advantage, game; server changes every game', async ({ page }) => {
    await expect(pts(page, 0)).toHaveText('0');
    expect(await serving(page)).toBe(0);
    await tap(page, 0);
    await expect(pts(page, 0)).toHaveText('15');
    await tap(page, 0);
    await expect(pts(page, 0)).toHaveText('30');
    await tap(page, 0);
    await expect(pts(page, 0)).toHaveText('40');
    await tap(page, 1, 3);
    await expect(pts(page, 1)).toHaveText('40');
    await expect(page.locator('#info')).toHaveText('Satz 1 · Einstand');
    await tap(page, 1);
    await expect(pts(page, 1)).toHaveText('AD');
    await expect(pts(page, 0)).toHaveText('40');
    await tap(page, 0);
    await expect(page.locator('#info')).toHaveText('Satz 1 · Einstand');
    await tap(page, 0, 2);
    await expect(pts(page, 0)).toHaveText('0');
    await expect(mini(page, 0, 'Spiele')).toHaveText('1');
    await expect(mini(page, 1, 'Spiele')).toHaveText('0');
    expect(await serving(page)).toBe(1);
    // After the first game the players change ends
    await expect(page.locator('#info')).toHaveText('Satz 1 · ⇄ Seitenwechsel');
  });

  test('rules: set to 6 with 2 ahead, 7:5, tiebreak at 6:6 to 7 with its serve order', async ({ page }) => {
    // 6:4
    let s = await rules(page, 'tennis', [...game(0), ...game(1), ...game(0), ...game(1), ...game(0), ...game(1), ...game(1), ...game(0), ...game(0), ...game(0)]);
    expect(s.sets).toEqual([1, 0]);
    expect(s.done).toEqual([{ games: [6, 4] }]);
    // 6:5 is not a set yet, 7:5 is
    const fiveAll = [].concat(...Array(5).fill([...game(0), ...game(1)]));
    s = await rules(page, 'tennis', [...fiveAll, ...game(0)]);
    expect(s.games).toEqual([6, 5]);
    expect(s.ball).toBe(null);
    s = await rules(page, 'tennis', [...fiveAll, ...game(0), ...game(0)]);
    expect(s.done).toEqual([{ games: [7, 5] }]);
    // 6:6 → tiebreak; 12 games served alternately → player 1 serves first
    const sixAll = [...fiveAll, ...game(0), ...game(1)];
    s = await rules(page, 'tennis', sixAll);
    expect(s.tiebreak).toBe(true);
    expect(s.points).toEqual(['0', '0']);
    expect(s.server).toBe(0);
    // Tiebreak serve: A, B, B, A, A, B …
    const order = [];
    for (let i = 0; i < 6; i++) order.push((await rules(page, 'tennis', sixAll.concat(rep(1, i)))).server);
    expect(order).toEqual([0, 1, 1, 0, 0, 1]);
    // Change ends after 6 tiebreak points
    expect((await rules(page, 'tennis', sixAll.concat(rep(1, 6)))).changeEnds).toBe(true);
    // 7:5 in points wins the tiebreak; 7:6 does not
    s = await rules(page, 'tennis', sixAll.concat(rep(1, 5), rep(0, 6)));
    expect(s.points).toEqual(['6', '5']);
    expect(s.ball).toEqual({ p: 0, kind: 'set' });
    s = await rules(page, 'tennis', sixAll.concat(rep(1, 6), rep(0, 7)));
    expect(s.sets).toEqual([0, 0]);
    expect(s.points).toEqual(['7', '6']);
    s = await rules(page, 'tennis', sixAll.concat(rep(1, 5), rep(0, 7)));
    expect(s.sets).toEqual([1, 0]);
    expect(s.done).toEqual([{ games: [7, 6], tiebreak: [7, 5] }]);
    // Who served first in the tiebreak receives first in the next set
    expect(s.server).toBe(1);
  });

  test('tiebreak on the board: plain numbers, set score with tiebreak points', async ({ page }) => {
    const fiveAll = [].concat(...Array(5).fill([...game(0), ...game(1)]));
    await page.evaluate(([k, p]) => localStorage.setItem(k, JSON.stringify({ sport: 'tennis', m: { tennis: { pts: p } } })),
      [LS, [...fiveAll, ...game(0), ...game(1), ...rep(1, 5), ...rep(0, 6)]]);
    await page.reload();
    await expect(page.locator('#info')).toHaveText('Satz 1 · Tiebreak · Satzball Spieler 1');
    await expect(pts(page, 0)).toHaveText('6');
    await expect(pts(page, 1)).toHaveText('5');
    await tap(page, 0);
    await expect(mini(page, 0, 'Sätze')).toHaveText('1');
    await expect(side(page, 0).locator('.done')).toHaveText('7');
    // Loser's games with the tiebreak points as superscript: 6⁵
    await expect(side(page, 1).locator('.done')).toHaveText('65');
    await expect(side(page, 1).locator('.done sup')).toHaveText('5');
  });

  test('best of 3 with match tiebreak to 10 in the deciding set', async ({ page }) => {
    const set = p => [].concat(...Array(6).fill(game(p)));
    const cfg = { matchTiebreak: true };
    let s = await rules(page, 'tennis', [...set(0), ...set(1)], cfg);
    expect(s.sets).toEqual([1, 1]);
    expect(s.matchTiebreak).toBe(true);
    // Points 9:8 – a match point, 10:8 wins
    s = await rules(page, 'tennis', [...set(0), ...set(1), ...rep(1, 8), ...rep(0, 9)], cfg);
    expect(s.points).toEqual(['9', '8']);
    expect(s.ball).toEqual({ p: 0, kind: 'match' });
    s = await rules(page, 'tennis', [...set(0), ...set(1), ...rep(1, 8), ...rep(0, 10)], cfg);
    expect(s.winner).toBe(0);
    expect(s.done[2]).toEqual({ games: [10, 8], matchTiebreak: true });
    // Without the option the third set is a normal set
    s = await rules(page, 'tennis', [...set(0), ...set(1), ...rep(0, 10)]);
    expect(s.winner).toBe(null);
    expect(s.games).toEqual([2, 0]);
    // Best of 5 needs three sets
    s = await rules(page, 'tennis', [...set(0), ...set(0)], { bestOf: 5 });
    expect(s.winner).toBe(null);
    expect(s.need).toBe(3);
  });

  test('settings: best of 5, golden point and match tiebreak switches', async ({ page }) => {
    await openMenu(page);
    await expect(page.locator('#optTennis')).toBeVisible();
    await expect(page.locator('#golden')).not.toBeChecked();
    await page.locator('#bestOf button', { hasText: '5 Sätze' }).click();
    await page.check('#golden');
    await closeMenu(page);
    await tap(page, 0, 3);
    await tap(page, 1, 3);
    await expect(page.locator('#info')).toHaveText('Satz 1 · Golden Point');
    await tap(page, 1);
    await expect(mini(page, 1, 'Spiele')).toHaveText('1');
    const st = await page.evaluate(k => JSON.parse(localStorage.getItem(k)).m.tennis.cfg, LS);
    expect(st).toEqual({ bestOf: 5, goldenPoint: true, matchTiebreak: false });
  });
});

test.describe('padel', () => {
  test('golden point by default: at 40:40 one point decides the game', async ({ page }) => {
    await pickSport(page, 'padel');
    await openMenu(page);
    await expect(page.locator('#golden')).toBeChecked();
    await closeMenu(page);
    await tap(page, 0, 3);
    await tap(page, 1, 3);
    await expect(pts(page, 0)).toHaveText('40');
    await expect(pts(page, 1)).toHaveText('40');
    await expect(page.locator('#info')).toHaveText('Satz 1 · Golden Point');
    await tap(page, 0);
    await expect(mini(page, 0, 'Spiele')).toHaveText('1');
    await expect(pts(page, 0)).toHaveText('0');
    // Without golden point it would be advantage
    const s = await rules(page, 'padel', [...rep(0, 3), ...rep(1, 3), 0], { goldenPoint: false });
    expect(s.points).toEqual(['AD', '40']);
  });
});

test.describe('football', () => {
  test('match clock: halves, stoppage time, second half from 45:00, goal minutes, survives reload', async ({ page }) => {
    // Time stands still unless the test moves it on
    await page.clock.install({ time: new Date('2026-11-04T15:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-04T15:00:01Z'));
    await page.reload();
    await pickSport(page, 'football');
    await expect(page.locator('#mid')).toBeVisible();
    await expect(page.locator('.side .serve')).toHaveCount(0);
    await expect(side(page, 0).locator('.name')).toHaveText('Heim');
    await expect(side(page, 1).locator('.name')).toHaveText('Gast');
    await expect(page.locator('#clock')).toHaveText('00:00');
    await expect(page.locator('#half')).toHaveText('1. Halbzeit');
    await page.click('#btnClock');
    await expect(page.locator('#btnClock')).toHaveText('Pause');
    await page.clock.fastForward(11 * 60 * 1000 + 30 * 1000);
    await expect(page.locator('#clock')).toHaveText('11:30');
    // A goal in the 12th minute
    await tap(page, 0);
    await expect(pts(page, 0)).toHaveText('1');
    await expect(side(page, 0).locator('.done')).toHaveText("12'");
    // Pause stops the clock
    await page.click('#btnClock');
    await page.clock.fastForward(5 * 60 * 1000);
    await expect(page.locator('#clock')).toHaveText('11:30');
    await page.click('#btnClock');
    // Reload while running: the clock keeps its time
    await page.clock.runFor(60 * 1000);
    await page.reload();
    await expect(page.locator('#clock')).toHaveText('12:30');
    await expect(page.locator('#btnClock')).toHaveText('Pause');
    // End of the half: message once, stoppage time
    await page.clock.fastForward((45 - 12.5) * 60 * 1000 + 1000);
    await expect(page.locator('#toast')).toHaveText('Halbzeit vorbei – Nachspielzeit läuft');
    await page.clock.fastForward(64 * 1000);
    await expect(page.locator('#clock')).toHaveText('45:00');
    await expect(page.locator('#extra')).toHaveText('+1:05');
    await tap(page, 1);
    await expect(side(page, 1).locator('.done')).toHaveText("45+2'");
    // Second half from 45:00, paused
    await page.click('#btnHalf');
    await expect(page.locator('#half')).toHaveText('2. Halbzeit');
    await expect(page.locator('#clock')).toHaveText('45:00');
    await expect(page.locator('#extra')).toHaveText('');
    await expect(page.locator('#btnHalf')).toBeHidden();
    await expect(page.locator('#btnClock')).toHaveText('Start');
    await page.click('#btnClock');
    await page.clock.runFor(60 * 1000);
    await expect(page.locator('#clock')).toHaveText('46:00');
  });

  test('clock helper: minutes and stoppage time', async ({ page }) => {
    const c = (ms, half, len) => page.evaluate(a => ScoreRules.clock(...a), [ms, half, len]);
    expect(await c(0, 1, 45)).toMatchObject({ main: '00:00', extra: '', over: false, minute: 1 });
    expect(await c(59999, 1, 45)).toMatchObject({ main: '00:59', minute: 1 });
    expect(await c(60000, 1, 45)).toMatchObject({ main: '01:00', minute: 2 });
    expect(await c(45 * 60000, 1, 45)).toMatchObject({ main: '45:00', extra: '', over: true });
    expect(await c(47 * 60000 + 5000, 1, 45)).toMatchObject({ main: '45:00', extra: '+2:05', minute: 45, plus: 3 });
    expect(await c(10 * 60000, 2, 20)).toMatchObject({ main: '30:00', minute: 31 });
  });

  test('half length from the menu', async ({ page }) => {
    await pickSport(page, 'football');
    await openMenu(page);
    await expect(page.locator('#optFirst')).toBeHidden();
    await page.selectOption('#halfMin', '20');
    await closeMenu(page);
    await page.click('#btnHalf');
    await expect(page.locator('#clock')).toHaveText('20:00');
  });
});

test.describe('darts', () => {
  const key = (page, k) => page.locator(`#pad [data-k="${k}"]`).click();
  async function visit(page, v) {
    for (const d of String(v)) await key(page, d);
    await key(page, 'ok');
  }

  test('501 counting down by visits on the pad, turns alternate, last visit and average', async ({ page }) => {
    await pickSport(page, 'darts');
    await expect(page.locator('#pad')).toBeVisible();
    await expect(page.locator('.side .minus')).toHaveCount(0);
    await expect(pts(page, 0)).toHaveText('501');
    await expect(page.locator('#info')).toHaveText('Leg 1 · Spieler 1 ist dran');
    expect(await serving(page)).toBe(0);
    await key(page, '6'); await key(page, '0');
    await expect(page.locator('#padEntry')).toHaveText('60');
    await key(page, 'del');
    await expect(page.locator('#padEntry')).toHaveText('6');
    await key(page, '0'); await key(page, 'ok');
    await expect(pts(page, 0)).toHaveText('441');
    expect(await serving(page)).toBe(1);
    await visit(page, 100);
    await visit(page, 140);
    // Player 1: 60 + 140 in 2 visits → average 100; player 2: 100
    await expect(pts(page, 0)).toHaveText('301');
    await expect(side(page, 0).locator('.done')).toHaveText('Letzte 140 · Ø 100,0');
    await expect(side(page, 1).locator('.done')).toHaveText('Letzte 100 · Ø 100,0');
    // Taps on the score do nothing in darts
    await side(page, 1).locator('.tile').click();
    await expect(pts(page, 1)).toHaveText('401');
    // Impossible score: message, nothing entered
    await visit(page, 179);
    await expect(page.locator('#toast')).toHaveText('179 ist mit 3 Pfeilen nicht möglich');
    await expect(pts(page, 1)).toHaveText('401');
    await expect(page.locator('#padEntry')).toHaveText('Punkte der Aufnahme');
    // Undo takes back the last visit
    await page.click('#btnUndo');
    await expect(pts(page, 0)).toHaveText('441');
    expect(await serving(page)).toBe(0);
  });

  test('rules: bust, double out, legs alternate the starter, winner', async ({ page }) => {
    const cfg = { start: 301, legs: 2, doubleOut: true };
    // 301 − 180 = 121 left; 140 is too much → bust, still 121
    let s = await rules(page, 'darts', [180, 60, 140], cfg);
    expect(s.points).toEqual(['121', '241']);
    expect(s.bust).toBe(true);
    expect(s.last).toEqual([-1, 60]);
    expect(s.server).toBe(1);
    // Leaving 1 is a bust with double out, fine without
    s = await rules(page, 'darts', [180, 60, 120], cfg);
    expect(s.points[0]).toBe('121');
    s = await rules(page, 'darts', [180, 60, 120], { ...cfg, doubleOut: false });
    expect(s.points[0]).toBe('1');
    // 159 cannot be finished on a double: reaching zero from 159 is a bust
    s = await rules(page, 'darts', [142, 0, 159], cfg);
    expect(s.points[0]).toBe('159');
    // An explicit bust (-1) keeps the score
    s = await rules(page, 'darts', [180, -1], cfg);
    expect(s.points).toEqual(['121', '301']);
    expect(s.average).toEqual([180, 0]);
    // Checkout 121: leg to player 1, leg 2 starts with player 2
    s = await rules(page, 'darts', [180, 60, 121], cfg);
    expect(s.sets).toEqual([1, 0]);
    expect(s.points).toEqual(['301', '301']);
    expect(s.leg).toBe(2);
    expect(s.server).toBe(1);
    // Second leg also to player 1 → first to 2 legs wins
    s = await rules(page, 'darts', [180, 60, 121, 0, 180, 0, 121], cfg);
    expect(s.winner).toBe(0);
    expect(s.server).toBe(null);
    // Player 2 starts the match
    s = await rules(page, 'darts', [100], cfg, 1);
    expect(s.points).toEqual(['301', '201']);
  });

  test('checkout routes add up and end on a double or bull', async ({ page }) => {
    const value = d => d === 'Bull' ? 50 : d === '25' ? 25 : d[0] === 'T' ? 3 * d.slice(1) : d[0] === 'D' ? 2 * d.slice(1) : Number(d);
    const routes = await page.evaluate(() => Array.from({ length: 171 }, (_, n) => ScoreRules.checkout(n)));
    const none = [];
    routes.forEach((r, n) => {
      if (!r) { none.push(n); return; }
      expect(r.length, String(n)).toBeLessThanOrEqual(3);
      expect(r.reduce((a, d) => a + value(d), 0), String(n)).toBe(n);
      expect(r[r.length - 1], String(n)).toMatch(/^(D([1-9]|1\d|20)|Bull)$/);
      for (const d of r) expect(d).toMatch(/^(([1-9]|1\d|20)|[DT]([1-9]|1\d|20)|25|Bull)$/);
    });
    // The well-known numbers without a 3-dart finish
    expect(none).toEqual([0, 1, 159, 162, 163, 165, 166, 168, 169]);
    expect(routes[170]).toEqual(['T20', 'T20', 'Bull']);
    expect(routes[100]).toEqual(['T20', 'D20']);
    expect(routes[40]).toEqual(['D20']);
    expect(await page.evaluate(() => ScoreRules.checkout(171))).toBe(null);
  });

  test('checkout hint, leg won, legs counter, bust key, keyboard, settings', async ({ page }) => {
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ sport: 'darts', m: { darts: { cfg: { start: 301, legs: 2 }, pts: [180, 60] } } })), LS);
    await page.reload();
    await setNames(page, 'Anna', 'Ben');
    await expect(page.locator('#info')).toHaveText('Leg 1 · Anna ist dran · Finish Anna: T20 T7 D20');
    // Bust key: score stays, Ben's turn (241 left: no 3-dart finish, no hint)
    await key(page, 'bust');
    await expect(page.locator('#info')).toHaveText('Leg 1 · ✕ Überworfen! · Ben ist dran');
    await expect(side(page, 0).locator('.done')).toHaveText('Letzte ✕ · Ø 90,0');
    // Keyboard: digits, Enter
    await page.keyboard.type('41');
    await page.keyboard.press('Enter');
    await expect(pts(page, 1)).toHaveText('200');
    await page.keyboard.type('121');
    await page.keyboard.press('Enter');
    await expect(mini(page, 0, 'Legs')).toHaveText('1');
    await expect(pts(page, 0)).toHaveText('301');
    await expect(page.locator('#info')).toContainText('Leg 2 · Ben ist dran');
    // Backspace with an empty entry undoes the checkout
    await page.keyboard.press('Backspace');
    await expect(pts(page, 0)).toHaveText('121');
    await expect(mini(page, 0, 'Legs')).toHaveText('0');
    // Settings
    await openMenu(page);
    await expect(page.locator('#optDarts')).toBeVisible();
    await expect(page.locator('#optBest')).toBeHidden();
    await expect(page.locator('#h-first')).toHaveText('Wer beginnt');
    await expect(page.locator('#dartStart [data-start="301"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#dartStart [data-start="701"]');
    await page.uncheck('#doubleOut');
    await closeMenu(page);
    // Ben scored 60 + 41 → 701 − 101 = 600
    await expect(pts(page, 1)).toHaveText('600');
    await expect(page.locator('#info')).not.toContainText('Finish');
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).m.darts.cfg, LS)).toEqual({ start: 701, legs: 2, doubleOut: false });
  });

  test('winner disables the pad', async ({ page }) => {
    await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ sport: 'darts', m: { darts: { cfg: { start: 301, legs: 1 }, pts: [180, 0, 121] } } })), LS);
    await page.reload();
    await expect(page.locator('#info')).toHaveText('🏆 Spieler 1 gewinnt!');
    await expect(page.locator('#pad [data-k="ok"]')).toBeDisabled();
  });
});

test('names, swap sides, minus takes back that side only', async ({ page }) => {
  await setNames(page, 'Stützer', 'Eichelkraut');
  const names = () => page.locator('.side .name').allTextContents();
  expect(await names()).toEqual(['Stützer', 'Eichelkraut']);
  await tap(page, 0, 2);
  await tap(page, 1, 1);
  await page.click('#btnSwap');
  expect(await names()).toEqual(['Eichelkraut', 'Stützer']);
  await expect(page.locator('.side').first().locator('.pts')).toHaveText('1');
  // −1 of Stützer removes his last point, Eichelkraut's stays
  await side(page, 0).locator('.minus').click();
  await expect(pts(page, 0)).toHaveText('1');
  await expect(pts(page, 1)).toHaveText('1');
  await page.reload();
  expect(await names()).toEqual(['Eichelkraut', 'Stützer']);
  // Names also on the first-serve choice
  await openMenu(page);
  await expect(page.locator('#first0')).toHaveText('Stützer');
  await page.click('#first1');
  await closeMenu(page);
  // 2 points played → serve has changed from Eichelkraut to Stützer
  expect(await serving(page)).toBe(0);
});

test('keyboard / presenter: left and right side, backspace undoes', async ({ page }) => {
  await page.keyboard.press('PageUp');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(pts(page, 0)).toHaveText('1');
  await expect(pts(page, 1)).toHaveText('2');
  await page.click('#btnSwap');
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(pts(page, 1)).toHaveText('3');
  await page.keyboard.press('Backspace');
  await expect(pts(page, 1)).toHaveText('2');
});

test('each sport keeps its own score; new match only after asking', async ({ page }) => {
  await tap(page, 0, 3);
  await pickSport(page, 'football');
  await expect(pts(page, 0)).toHaveText('0');
  await tap(page, 1);
  await pickSport(page, 'tabletennis');
  await expect(pts(page, 0)).toHaveText('3');
  await openMenu(page);
  page.once('dialog', d => d.dismiss());
  await page.click('#btnNew');
  await closeMenu(page);
  await expect(pts(page, 0)).toHaveText('3');
  await setNames(page, 'Anna', '');
  await openMenu(page);
  page.once('dialog', d => { expect(d.message()).toBe('Spielstand für Tischtennis auf null setzen?'); d.accept(); });
  await page.click('#btnNew');
  await closeMenu(page);
  await expect(pts(page, 0)).toHaveText('0');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await expect(side(page, 0).locator('.name')).toHaveText('Anna');
  await expect(side(page, 1).locator('.name')).toHaveText('Spieler 2');
  await pickSport(page, 'football');
  await expect(pts(page, 1)).toHaveText('1');
});

test('sport button opens the menu with the match settings', async ({ page }) => {
  await page.click('#btnSport');
  await expect(page.locator('#appMenu')).toBeVisible();
  await expect(page.locator('#sports')).toBeVisible();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, default names, tennis terms', async ({ page }) => {
    await expect(page.locator('#sportName')).toHaveText('Table tennis');
    await expect(side(page, 0).locator('.name')).toHaveText('Player 1');
    await expect(mini(page, 0, 'Sets')).toHaveText('0');
    await pickSport(page, 'tennis');
    await tap(page, 0, 3);
    await tap(page, 1, 3);
    await expect(page.locator('#info')).toHaveText('Set 1 · Deuce');
    await pickSport(page, 'football');
    await expect(side(page, 0).locator('.name')).toHaveText('Home');
    await expect(page.locator('#btnHalf')).toHaveText('2nd half');
    await switchLang(page, 'de');
    await expect(side(page, 0).locator('.name')).toHaveText('Heim');
  });
});
