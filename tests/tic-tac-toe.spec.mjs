// Tic Tac Toe: two players on one phone (win, draw, undo, alternating start, persistence),
// the computer (never loses on "hard", blocks on "medium"), settings in the menu, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LS = 'tic-tac-toe.state.v1';
// Rules engine loaded outside the browser for exhaustive checks
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../tic-tac-toe/game.js', import.meta.url), 'utf8'), ctx);
const G = ctx.TicTacToe;

// Winner written down independently of game.js
const winnerOf = b => {
  const rows = [];
  for (let i = 0; i < 3; i++) { rows.push([i * 3, i * 3 + 1, i * 3 + 2]); rows.push([i, i + 3, i + 6]); }
  rows.push([0, 4, 8], [2, 4, 6]);
  for (const [a, c, d] of rows) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return null;
};

const cell = (page, i) => page.locator(`#board .cell[data-i="${i}"]`);
async function tapAll(page, list) { for (const i of list) await cell(page, i).click(); }

test('rules: result() agrees with an independent check on random games', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let n = 0; n < 2000; n++) {
    const b = G.empty(); let p = n % 2 ? 'o' : 'x';
    while (!G.result(b)) { const f = G.free(b); b[f[Math.floor(rnd() * f.length)]] = p; p = G.other(p); }
    const r = G.result(b);
    expect(r.winner).toBe(winnerOf(b));
    if (!r.winner) expect(b.every(Boolean)).toBe(true);
    else for (const i of r.line) expect(b[i]).toBe(r.winner);
  }
});

test('rules: the unbeatable computer never loses against any sequence of moves', () => {
  let games = 0;
  // Explore every human move; the computer tries every one of its equally good moves
  function explore(b, toMove, cpu) {
    const w = winnerOf(b);
    if (w || b.every(Boolean)) { games++; expect(w, b.join(',')).not.toBe(G.other(cpu)); return; }
    if (toMove === cpu) {
      for (const i of G.bestMoves(b, cpu)) { const c = b.slice(); c[i] = cpu; explore(c, G.other(cpu), cpu); }
    } else {
      for (const i of G.free(b)) { const c = b.slice(); c[i] = toMove; explore(c, cpu, cpu); }
    }
  }
  explore(G.empty(), 'x', 'o');
  explore(G.empty(), 'o', 'o');
  expect(games).toBeGreaterThan(100);
});

test('rules: medium takes a win and blocks; easy takes a win', () => {
  const b = G.empty(); b[0] = 'x'; b[1] = 'x'; b[4] = 'o';
  for (let i = 0; i < 20; i++) expect(G.cpuMove(b, 'o', 'medium')).toBe(2);
  b[3] = 'o';
  for (let i = 0; i < 20; i++) expect(G.cpuMove(b, 'o', 'medium')).toBe(5); // own win beats blocking
  for (let i = 0; i < 20; i++) expect(G.cpuMove(b, 'o', 'easy')).toBe(5);
});

test('two players: X wins, the line is shown, score counts, the start alternates', async ({ page }) => {
  await page.goto('/tic-tac-toe/');
  await expect(page.locator('#status')).toHaveText('Spieler ✕ ist dran (✕)');
  await expect(page.locator('#btnNext')).toBeHidden();
  await tapAll(page, [0, 3, 1, 4]);
  await expect(page.locator('#status')).toHaveText('Spieler ✕ ist dran (✕)');
  await expect(cell(page, 3)).toBeDisabled(); // taken
  await cell(page, 2).click();
  await expect(page.locator('#board')).toHaveAttribute('data-result', 'x');
  await expect(page.locator('#status')).toHaveText('🎉 Spieler ✕ gewinnt!');
  await expect(page.locator('#board .cell.win')).toHaveCount(3);
  await expect(page.locator('#board .winline')).toHaveCount(1);
  await expect(page.locator('#board .cell:not(:disabled)')).toHaveCount(0);
  await expect(page.locator('#ptsX')).toHaveText('1');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await page.click('#btnNext');
  await expect(page.locator('#board .cell[data-v="x"], #board .cell[data-v="o"]')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Spieler ◯ ist dran (◯)');
  await cell(page, 4).click();
  await expect(cell(page, 4)).toHaveAttribute('data-v', 'o');
  await expect(cell(page, 4)).toHaveAttribute('aria-label', 'Reihe 2, Spalte 2: ◯');
});

test('two players: a full board without a row is a draw', async ({ page }) => {
  await page.goto('/tic-tac-toe/');
  // x o x / x o o / o x x
  await tapAll(page, [0, 1, 2, 4, 3, 5, 7, 6, 8]);
  await expect(page.locator('#board')).toHaveAttribute('data-result', 'draw');
  await expect(page.locator('#status')).toHaveText('🤝 Unentschieden');
  await expect(page.locator('#ptsD')).toHaveText('1');
  await expect(page.locator('#ptsX')).toHaveText('0');
});

test('undo takes back the last move; the round survives a reload', async ({ page }) => {
  await page.goto('/tic-tac-toe/');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await tapAll(page, [4, 0, 8]);
  await page.click('#btnUndo');
  await expect(cell(page, 8)).toHaveAttribute('data-v', '');
  await expect(page.locator('#status')).toHaveText('Spieler ✕ ist dran (✕)');
  await page.reload();
  await expect(cell(page, 4)).toHaveAttribute('data-v', 'x');
  await expect(cell(page, 0)).toHaveAttribute('data-v', 'o');
  await expect(page.locator('#status')).toHaveText('Spieler ✕ ist dran (✕)');
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS));
  expect(saved.moves).toEqual([4, 0]);
});

test('names and opponent are set in the menu; the computer answers and undo removes both moves', async ({ page }) => {
  await page.goto('/tic-tac-toe/');
  await openMenu(page);
  await expect(page.locator('#levelBox')).toBeHidden();
  await page.fill('#inX', 'Anna');
  await page.fill('#inO', 'Ben');
  await closeMenu(page);
  await expect(page.locator('#status')).toHaveText('Anna ist dran (✕)');
  await expect(page.locator('#nameO')).toHaveText('Ben');
  await cell(page, 0).click();
  await openMenu(page);
  await page.click('#opp [data-o="cpu"]');
  await expect(page.locator('#levelBox')).toBeVisible();
  await expect(page.locator('#labO')).toBeHidden();
  await page.click('#levels [data-l="hard"]');
  await closeMenu(page);
  // New opponent: new round and score
  await expect(page.locator('#board .cell[data-v="x"]')).toHaveCount(0);
  await expect(page.locator('#nameO')).toHaveText('Computer');
  await cell(page, 0).click();
  await expect(page.locator('#board .cell[data-v="o"]')).toHaveCount(1);
  await expect(page.locator('#status')).toHaveText('Anna ist dran (✕)');
  // Perfect reply to a corner opening is the centre
  await expect(cell(page, 4)).toHaveAttribute('data-v', 'o');
  await page.click('#btnUndo');
  await expect(page.locator('#board .cell[data-v="x"], #board .cell[data-v="o"]')).toHaveCount(0);
});

test('against the hard computer the player cannot win', async ({ page }) => {
  await page.addInitScript(([k]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify({ opp: 'cpu', level: 'hard', moves: [], starter: 'x' })); sessionStorage.setItem('seeded', '1'); }
  }, [LS]);
  await page.goto('/tic-tac-toe/');
  for (let round = 0; round < 4; round++) {
    // The player always takes the lowest free square
    while ((await page.locator('#status').getAttribute('data-state')) !== 'over') {
      await expect(page.locator('#status')).toHaveAttribute('data-state', /turn|over/);
      if ((await page.locator('#status').getAttribute('data-state')) === 'over') break;
      await page.locator('#board .cell:not(:disabled)').first().click();
    }
    expect(await page.locator('#board').getAttribute('data-result')).not.toBe('x');
    await page.click('#btnNext');
  }
  await expect(page.locator('#ptsX')).toHaveText('0');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and win message', async ({ page }) => {
    await page.goto('/tic-tac-toe/');
    await expect(page.locator('#status')).toHaveText('Player ✕’s turn (✕)');
    await tapAll(page, [0, 3, 1, 4, 2]);
    await expect(page.locator('#status')).toHaveText('🎉 Player ✕ wins!');
    await expect(page.locator('#btnNext')).toHaveText('Next round');
  });
});
