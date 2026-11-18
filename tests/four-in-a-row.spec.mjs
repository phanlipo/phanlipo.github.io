// Four in a row: rules against an independent check, the computer (takes wins, blocks, sees a double
// threat, beats weaker players), two players on one phone (gravity, win, draw, full column, undo,
// alternating start, persistence), the computer on the page, settings in the menu, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LS = 'four-in-a-row.state.v1';
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../four-in-a-row/game.js', import.meta.url), 'utf8'), ctx);
const G = ctx.FourInARow;

// Written down independently of game.js: walk from every cell in four directions
function winnerOf(b) {
  const v = (r, c) => (r >= 0 && r < 6 && c >= 0 && c < 7 ? b[r * 7 + c] : null);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const p = v(r, c);
    if (!p) continue;
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      let k = 1;
      while (k < 4 && v(r + dr * k, c + dc * k) === p) k++;
      if (k === 4) return p;
    }
  }
  return null;
}
// Board from a list of columns (0-6), red first unless said otherwise
function play(cols, first = 'r') {
  let b = G.empty(), p = first;
  for (const c of cols) { b = G.drop(b, c, p).board; p = G.other(p); }
  return b;
}
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('rules: 69 lines, gravity and result() agree with an independent check on random games', () => {
  expect(G.LINES.length).toBe(69); // 24 across, 21 down, 12 + 12 diagonal
  const rnd = seeded(11), wrong = [];
  let draws = 0;
  for (let n = 0; n < 1500; n++) {
    let b = G.empty(), p = n % 2 ? 'y' : 'r';
    while (!G.result(b)) {
      if (winnerOf(b)) wrong.push(`game ${n}: win not seen`);
      const f = G.free(b), c = f[Math.floor(rnd() * f.length)];
      const d = G.drop(b, c, p);
      // lands in column c, on the bottom or on top of another disc, in an empty cell
      const r = Math.floor(d.index / 7);
      if (d.index % 7 !== c || b[d.index] || (r < 5 && !b[(r + 1) * 7 + c])) wrong.push(`game ${n}: disc at ${d.index}`);
      b = d.board; p = G.other(p);
    }
    const res = G.result(b);
    if (res.winner !== winnerOf(b)) wrong.push(`game ${n}: winner ${res.winner}`);
    if (!res.winner) { draws++; if (!b.every(Boolean)) wrong.push(`game ${n}: draw before full`); }
    else if (!res.line.every(i => b[i] === res.winner)) wrong.push(`game ${n}: line`);
  }
  expect(wrong).toEqual([]);
  expect(draws).toBeGreaterThan(0);
  // A full column takes no more discs
  const full = play([0, 0, 0, 0, 0, 0]);
  expect(G.drop(full, 0, 'r')).toBe(null);
  expect(G.free(full)).toEqual([1, 2, 3, 4, 5, 6]);
});

test('computer: every level takes a win; medium and hard block; hard sets up a double threat', () => {
  // Red has three across the bottom (columns 1-3) with both ends open: yellow must block one end
  const b = play([1, 1, 2, 2, 3]);
  for (let i = 0; i < 20; i++) expect([0, 4]).toContain(G.cpuMove(b, 'y', 'medium'));
  // Only one end open: medium and hard block exactly there
  const one = play([0, 0, 1, 1, 2, 2, 6]); // red 0 1 2 bottom, yellow 0 1 2 above, red 6; yellow to move
  for (const level of ['medium', 'hard']) expect(G.cpuMove(one, 'y', level)).toBe(3);
  expect(G.cpuMove(play([0, 6, 1, 6, 2, 6]), 'y', 'easy')).toBe(6); // yellow wins in column 6
  expect(G.cpuMove(play([0, 6, 1, 6, 2, 6]), 'y', 'hard')).toBe(6);
  expect(G.cpuMove(play([0, 6, 1, 6, 2, 6], 'r'), 'y', 'medium')).toBe(6); // own win beats blocking
  // Red to move with discs on 2 and 3 at the bottom, 1 and 4 open: red 1 or 4 makes three with both ends open
  const open = play([2, 2, 3, 3]);
  const best = G.bestMoves(open, 'r', 5);
  for (const c of best) expect([1, 4]).toContain(c);
  // Medium never hands over a win right above its own disc: yellow has three on row 4 (columns 0-2),
  // the cell below the fourth (row 5, column 3) is still empty – red must not play column 3
  const trap = play([0, 0, 2, 2, 6, 1, 6, 1]);
  expect(winnerOf(G.drop(G.drop(trap, 3, 'r').board, 3, 'y').board)).toBe('y');
  for (let i = 0; i < 30; i++) {
    const m = G.cpuMove(trap, 'r', 'medium');
    expect(m).not.toBe(3);
    const after = G.drop(trap, m, 'r').board;
    for (const c of G.free(after)) expect(winnerOf(G.drop(after, c, 'y').board)).not.toBe('y');
  }
});

test('computer: hard beats easy and medium; medium beats easy most of the time', () => {
  const match = (a, b, games, seed) => {
    const rnd = seeded(seed), tally = { a: 0, b: 0, draw: 0 };
    for (let g = 0; g < games; g++) {
      let board = G.empty(), p = g % 2 ? 'y' : 'r';
      while (!G.result(board)) {
        const c = G.cpuMove(board, p, p === 'r' ? a : b, rnd);
        board = G.drop(board, c, p).board; p = G.other(p);
      }
      const w = winnerOf(board);
      tally[w === 'r' ? 'a' : w ? 'b' : 'draw']++;
    }
    return tally;
  };
  expect(match('hard', 'easy', 6, 3).a).toBe(6);
  expect(match('hard', 'medium', 6, 5).a).toBeGreaterThanOrEqual(5);
  expect(match('medium', 'easy', 30, 7).a).toBeGreaterThanOrEqual(22);
});

test('computer: hard answers within a reasonable time', () => {
  const t = performance.now();
  G.cpuMove(G.empty(), 'r', 'hard');
  G.cpuMove(play([3]), 'y', 'hard');
  expect(performance.now() - t).toBeLessThan(2000);
});

const col = (page, c) => page.locator(`#board .col[data-c="${c}"]`);
const disc = (page, row, c) => page.locator(`#board .slot[data-i="${row * 7 + c}"] .disc`);
async function tapAll(page, list) { for (const c of list) await col(page, c).click(); }

test('two players: discs fall down, red wins across, the line is shown, score counts, the start alternates', async ({ page }) => {
  await page.goto('/four-in-a-row/');
  await expect(page.locator('#status')).toHaveText('Rot ist dran');
  await expect(page.locator('#btnNext')).toBeHidden();
  await col(page, 3).click();
  await expect(disc(page, 5, 3)).toHaveAttribute('data-v', 'r');
  await expect(page.locator('#status')).toHaveText('Gelb ist dran');
  await col(page, 3).click();
  await expect(disc(page, 4, 3)).toHaveAttribute('data-v', 'y');
  await expect(col(page, 3)).toHaveAttribute('aria-label', 'Spalte 4: Rot, Gelb – 4 frei');
  await tapAll(page, [0, 6, 1, 6]);
  await col(page, 2).click(); // red 0 1 2 3 on the bottom row
  await expect(page.locator('#board')).toHaveAttribute('data-result', 'r');
  await expect(page.locator('#status')).toHaveText('Rot gewinnt!');
  await expect(page.locator('#board .disc.win')).toHaveCount(4);
  for (const c of [0, 1, 2, 3]) await expect(disc(page, 5, c)).toHaveClass(/win/);
  await expect(page.locator('#board .col:not(:disabled)')).toHaveCount(0);
  await expect(page.locator('#ptsR')).toHaveText('1');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await page.click('#btnNext');
  await expect(page.locator('#board .disc')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Gelb ist dran');
  await col(page, 5).click();
  await expect(disc(page, 5, 5)).toHaveAttribute('data-v', 'y');
});

test('two players: vertical and diagonal wins, a full column is disabled', async ({ page }) => {
  await page.goto('/four-in-a-row/');
  await tapAll(page, [0, 1, 0, 1, 0, 1, 0]);
  await expect(page.locator('#status')).toHaveText('Rot gewinnt!');
  for (let r = 2; r <= 5; r++) await expect(disc(page, r, 0)).toHaveClass(/win/);
  await page.click('#btnNext'); // yellow starts
  // yellow diagonal from bottom left: (5,0) (4,1) (3,2) (2,3)
  await tapAll(page, [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
  await expect(page.locator('#status')).toHaveText('Gelb gewinnt!');
  for (const [r, c] of [[5, 0], [4, 1], [3, 2], [2, 3]]) await expect(disc(page, r, c)).toHaveClass(/win/);
  await page.click('#btnNext');
  await tapAll(page, [4, 4, 4, 4, 4, 4]);
  await expect(col(page, 4)).toBeDisabled();
  await expect(col(page, 4)).toHaveAttribute('aria-label', 'Spalte 5: Rot, Gelb, Rot, Gelb, Rot, Gelb – voll');
});

test('two players: a full board without four in a row is a draw', async ({ page }) => {
  // A random game that ended in a draw (found with a seeded search, checked independently below)
  const order = [1, 6, 3, 0, 0, 1, 2, 4, 6, 1, 6, 5, 5, 1, 0, 6, 0, 3, 6, 3, 1, 2, 6, 0, 4, 4, 3, 1, 3, 0, 3, 5, 2, 5, 2, 2, 5, 5, 4, 4, 4, 2];
  // The independent check: replay and make sure nobody won before the board was full
  let b = G.empty(), p = 'r';
  for (const c of order) { expect(winnerOf(b)).toBe(null); b = G.drop(b, c, p).board; p = G.other(p); }
  expect(winnerOf(b)).toBe(null);
  expect(b.every(Boolean)).toBe(true);
  await page.goto('/four-in-a-row/');
  await tapAll(page, order);
  await expect(page.locator('#board')).toHaveAttribute('data-result', 'draw');
  await expect(page.locator('#status')).toHaveText('Unentschieden');
  await expect(page.locator('#ptsD')).toHaveText('1');
});

test('undo takes back the last move; the round survives a reload', async ({ page }) => {
  await page.goto('/four-in-a-row/');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await tapAll(page, [3, 2, 3]);
  await page.click('#btnUndo');
  await expect(page.locator('#board .disc')).toHaveCount(2);
  await expect(page.locator('#status')).toHaveText('Rot ist dran');
  await page.reload();
  await expect(disc(page, 5, 3)).toHaveAttribute('data-v', 'r');
  await expect(disc(page, 5, 2)).toHaveAttribute('data-v', 'y');
  await expect(page.locator('#status')).toHaveText('Rot ist dran');
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS));
  expect(saved.moves).toEqual([3, 2]);
});

test('names and opponent are set in the menu; the computer answers and undo removes both moves', async ({ page }) => {
  await page.goto('/four-in-a-row/');
  await openMenu(page);
  await expect(page.locator('#levelBox')).toBeHidden();
  await page.fill('#inR', 'Anna');
  await page.fill('#inY', 'Ben');
  await closeMenu(page);
  await expect(page.locator('#status')).toHaveText('Anna ist dran');
  await expect(page.locator('#nameY')).toHaveText('Ben');
  await col(page, 0).click();
  await openMenu(page);
  await page.click('#opp [data-o="cpu"]');
  await expect(page.locator('#levelBox')).toBeVisible();
  await expect(page.locator('#fieldY')).toBeHidden();
  await page.click('#levels [data-l="hard"]');
  await closeMenu(page);
  await expect(page.locator('#board .disc')).toHaveCount(0); // new opponent: new round
  await expect(page.locator('#nameY')).toHaveText('Computer');
  await col(page, 3).click();
  await expect(page.locator('#board .disc[data-v="y"]')).toHaveCount(1);
  await expect(page.locator('#status')).toHaveText('Anna ist dran');
  await page.click('#btnUndo');
  await expect(page.locator('#board .disc')).toHaveCount(0);
  // Score reset with undo
  await page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k)); s.score = { r: 2, y: 1, draw: 0 }; localStorage.setItem(k, JSON.stringify(s)); }, LS);
  await page.reload();
  await expect(page.locator('#ptsR')).toHaveText('2');
  await openMenu(page);
  await page.click('#btnReset');
  await expect(page.locator('#ptsR')).toHaveText('0');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('#ptsR')).toHaveText('2');
  await expect(page.locator('#ptsY')).toHaveText('1');
});

test('the computer blocks a threat on the page', async ({ page }) => {
  await page.addInitScript(([k]) => {
    if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify({ opp: 'cpu', level: 'medium', moves: [0, 6, 1, 6], starter: 'r' })); sessionStorage.setItem('seeded', '1'); }
  }, [LS]);
  await page.goto('/four-in-a-row/');
  await col(page, 2).click(); // red 0 1 2 → must block at 3
  await expect(disc(page, 5, 3)).toHaveAttribute('data-v', 'y');
  await expect(page.locator('#status')).toHaveText('Rot ist dran');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and win message', async ({ page }) => {
    await page.goto('/four-in-a-row/');
    await expect(page.locator('#status')).toHaveText('Red’s turn');
    await expect(col(page, 0)).toHaveAttribute('aria-label', 'Column 1: empty – 6 free');
    await tapAll(page, [0, 1, 0, 1, 0, 1, 0]);
    await expect(page.locator('#status')).toHaveText('Red wins!');
    await expect(page.locator('#btnNext')).toHaveText('Next round');
  });
});
