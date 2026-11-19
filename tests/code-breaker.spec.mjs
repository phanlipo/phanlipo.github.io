// Farbcode: rules (pins counted independently, levels, possible codes), entering guesses by tapping and
// keyboard, winning and losing, statistics, give up, settings, two players with a hidden code, reload, English.
import { test, expect, openMenu, closeMenu, onDialog, switchLang } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LS = 'code-breaker.state.v1';
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../code-breaker/game.js', import.meta.url), 'utf8'), ctx);
const C = ctx.CodeBreaker;

const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
const color = (page, c) => page.locator(`#palette .color[data-c="${c}"]`);
// Taps colours (0-based) and checks the guess
async function play(page, code) {
  for (const c of code) await color(page, c).click();
  await page.click('#btnCheck');
}
// Starts the page with a known secret code
async function withSecret(page, secret, extra = {}) {
  const game = { secret, level: 'medium', source: 'random', guesses: [], ...extra.game };
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } },
    [LS, { mode: 'solo', level: 'medium', ...extra, game }]);
  await page.goto('/code-breaker/');
}

test.describe('rules', () => {
  test('pins: right place and right colour elsewhere, each peg counted once', () => {
    const s = (a, b) => ({ ...C.score(a, b) });
    expect(s([0, 1, 2, 3], [0, 1, 2, 3])).toEqual({ black: 4, white: 0 });
    expect(s([0, 1, 2, 3], [3, 2, 1, 0])).toEqual({ black: 0, white: 4 });
    expect(s([0, 0, 1, 1], [0, 1, 0, 2])).toEqual({ black: 1, white: 2 });
    expect(s([5, 5, 5, 5], [5, 0, 0, 0])).toEqual({ black: 1, white: 0 });
    expect(s([1, 2, 3, 4], [2, 2, 2, 2])).toEqual({ black: 1, white: 0 });
    expect(s([0, 1, 2, 3, 4], [4, 4, 0, 7, 7])).toEqual({ black: 0, white: 2 });
  });

  test('check(), random codes and possible codes per level', () => {
    expect(C.check([0, 1, 2, 3], 'easy')).toBe('');
    expect(C.check([0, 0, 2, 3], 'easy')).toBe('repeat');
    expect(C.check([0, 0, 2, 3], 'medium')).toBe('');
    expect(C.check([0, 1, 2, 6], 'medium')).toBe('color');
    expect(C.check([0, 1, 2], 'medium')).toBe('length');
    expect(C.check([0, 1, 2, 7, 7], 'hard')).toBe('');
    let n = 0;
    const rnd = () => (n++ % 7) / 7;
    for (let k = 0; k < 20; k++) {
      expect(C.check(C.random('easy', rnd), 'easy')).toBe('');
      expect(C.check(C.random('hard', rnd), 'hard')).toBe('');
    }
    // 6·5·4·3, 6^4, 8^5 codes before the first guess
    expect(C.possible(C.create({ secret: [0, 1, 2, 3], level: 'easy' }))).toBe(360);
    expect(C.possible(C.create({ secret: [0, 1, 2, 3], level: 'medium' }))).toBe(1296);
    expect(C.possible(C.create({ secret: [0, 1, 2, 3, 4], level: 'hard' }))).toBe(32768);
    const g = C.create({ secret: [0, 1, 2, 3], level: 'easy' });
    C.guess(g, [3, 2, 1, 0]); // all four colours, none in place: the 9 derangements of four
    expect(C.possible(g)).toBe(9);
  });

  test('a game ends when cracked or after ten guesses', () => {
    const g = C.create({ secret: [1, 1, 2, 2], level: 'medium' });
    for (let i = 0; i < 9; i++) C.guess(g, [0, 0, 0, 0]);
    expect(C.status(g)).toBe('playing');
    C.guess(g, [0, 0, 0, 0]);
    expect(C.status(g)).toBe('lost');
    expect(() => C.guess(g, [1, 1, 2, 2])).toThrow('over');
    const w = C.create({ secret: [1, 1, 2, 2], level: 'medium' });
    expect(C.guess(w, [1, 1, 2, 2])).toMatchObject({ black: 4, white: 0 });
    expect(C.status(w)).toBe('won');
  });
});

test('tapping colours, fixing a place, pins and a win with statistics; survives a reload', async ({ page }) => {
  await withSecret(page, [0, 1, 2, 3]);
  await expect(page.locator('#status')).toHaveText('Versuch 1 von 10');
  await expect(page.locator('#btnCheck')).toBeDisabled();
  for (const c of [3, 2, 1]) await color(page, c).click();
  // Tap the second place to choose it again
  await page.locator('#entry .slot[data-i="1"]').click();
  await expect(page.locator('#entry .slot[data-i="1"]')).toHaveAttribute('aria-label', 'Platz 2: leer');
  await color(page, 4).click();
  await color(page, 0).click();
  await expect(page.locator('#palette .color').first()).toBeDisabled(); // row full
  await page.click('#btnCheck');
  const row = page.locator('#board li').first();
  await expect(row).toHaveAttribute('aria-label', 'Versuch 1: Gelb, Lila, Blau, Rot – 0 richtig platziert, 3 richtige Farbe am falschen Platz');
  await expect(row.locator('.pin.white')).toHaveCount(3);
  await expect(row.locator('.pin.black')).toHaveCount(0);
  await play(page, [0, 1, 3, 2]);
  await expect(page.locator('#board li').nth(1).locator('.pin.black')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('#board li')).toHaveCount(2);
  await expect(page.locator('#status')).toHaveText('Versuch 3 von 10');
  await play(page, [0, 1, 2, 3]);
  await expect(page.locator('#status')).toHaveText('Geknackt in 3 Versuchen!');
  await expect(page.locator('#secretLine')).toHaveAttribute('aria-label', 'Der Code: Rot, Blau, Grün, Gelb');
  await expect(page.locator('#btnNext')).toBeVisible();
  await expect(page.locator('#palette')).toBeHidden();
  expect((await stored(page)).stats).toEqual({ won: 1, lost: 0, tries: 3, best: 3 });
  await openMenu(page);
  await expect(page.locator('#stAvg')).toHaveText('3,0');
  await expect(page.locator('#stBest')).toHaveText('3');
  await closeMenu(page);
  await page.click('#btnNext');
  await expect(page.locator('#board li')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Versuch 1 von 10');
});

test('keyboard: digits, Backspace and Enter; ten misses lose and show the code', async ({ page }) => {
  await withSecret(page, [5, 5, 5, 5]);
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#entry .slot.empty')).toHaveCount(3);
  await page.keyboard.press('7'); // only six colours in this level
  await expect(page.locator('#entry .slot.empty')).toHaveCount(3);
  for (let i = 0; i < 10; i++) {
    if (i === 9) await expect(page.locator('#status')).toHaveText('Letzter Versuch!');
    for (const k of i ? '1111' : '111') await page.keyboard.press(k);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#status')).toHaveText('Nicht geknackt – das war der Code.');
  await expect(page.locator('#secretLine .peg[data-c="5"]')).toHaveCount(4);
  expect((await stored(page)).stats).toMatchObject({ won: 0, lost: 1 });
  await page.keyboard.press('Enter');
  await expect(page.locator('#board li')).toHaveCount(0);
});

test('easy level forbids repeated colours; changing the level waits for the next game', async ({ page }) => {
  await withSecret(page, [0, 1, 2, 3], { level: 'easy', game: { level: 'easy' } });
  await color(page, 2).click();
  await expect(color(page, 2)).toBeDisabled();
  await page.click('#btnBack');
  await expect(color(page, 2)).toBeEnabled();
  await play(page, [0, 1, 2, 4]);
  await openMenu(page);
  await expect(page.locator('#levelInfo')).toContainText('4 Plätze, 6 Farben, jede Farbe höchstens einmal');
  await page.locator('#levels [data-v="hard"]').click();
  await expect(page.locator('.toast').last()).toContainText('Gilt ab dem nächsten Spiel');
  await closeMenu(page);
  await expect(page.locator('#palette .color')).toHaveCount(6);
  // Give up: counts as lost, the next game has the new level
  await openMenu(page);
  await page.click('#btnGiveUp');
  await expect(page.locator('#status')).toHaveText('Nicht geknackt – das war der Code.');
  expect((await stored(page)).stats.lost).toBe(1);
  await page.click('#btnNext');
  await expect(page.locator('#palette .color')).toHaveCount(8);
  await expect(page.locator('#entry .slot')).toHaveCount(5);
});

test('helper shows how many codes are still possible', async ({ page }) => {
  await withSecret(page, [0, 1, 2, 3], { level: 'easy', game: { level: 'easy' } });
  await openMenu(page);
  await page.check('#optPossible');
  await closeMenu(page);
  await expect(page.locator('#possible')).toBeHidden();
  await play(page, [3, 2, 1, 0]);
  await expect(page.locator('#possible')).toHaveText('Noch 9 mögliche Codes');
});

test('two players: the code is picked hidden, can be shown, then guessed', async ({ page }) => {
  await page.goto('/code-breaker/');
  await openMenu(page);
  await page.locator('#mode [data-v="duo"]').click();
  await closeMenu(page);
  await expect(page.locator('#setupTitle')).toBeVisible();
  await expect(page.locator('#board')).toBeHidden();
  for (const c of [4, 4, 0, 1]) await color(page, c).click();
  await expect(page.locator('#entry .slot.hidden-peg')).toHaveCount(4);
  await expect(page.locator('#entry .slot').first()).toHaveAttribute('aria-label', 'Platz 1: gewählt');
  await page.click('#btnShow');
  await expect(page.locator('#entry .slot[data-c="4"]')).toHaveCount(2);
  await expect(page.locator('#btnCheck')).toHaveText('Raten lassen');
  await page.click('#btnCheck');
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#secretLine .peg[data-c]')).toHaveCount(0);
  await expect(page.locator('#btnCheck')).toHaveText('Prüfen');
  await play(page, [4, 4, 0, 1]);
  await expect(page.locator('#status')).toHaveText('Geknackt im ersten Versuch!');
  expect((await stored(page)).stats.won).toBe(0); // only games alone count
  await page.click('#btnNext');
  await expect(page.locator('#setupTitle')).toBeVisible();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script follow the language', async ({ page }) => {
    await withSecret(page, [0, 1, 2, 3]);
    await expect(page.locator('#status')).toHaveText('Guess 1 of 10');
    await play(page, [0, 0, 0, 0]);
    await expect(page.locator('#board li').first()).toHaveAttribute('aria-label', 'Guess 1: Red, Red, Red, Red – 1 in the right place, 0 right colour in the wrong place');
    await switchLang(page, 'de');
    await expect(page.locator('#status')).toHaveText('Versuch 2 von 10');
    await expect(color(page, 1)).toHaveAttribute('aria-label', '2 Blau');
  });
});

test('reset statistics asks first', async ({ page }) => {
  await withSecret(page, [0, 1, 2, 3], { stats: { won: 2, lost: 1, tries: 9, best: 3 } });
  await openMenu(page);
  await expect(page.locator('#stAvg')).toHaveText('4,5');
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnResetStats');
  await expect(page.locator('#stWon')).toHaveText('0');
  await expect(page.locator('#stAvg')).toHaveText('–');
});
