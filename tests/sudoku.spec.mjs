// Sudoku: the generator (unique solution, levels), entering digits, notes, mistakes, undo, hints,
// solving with best times, the clock, menu actions, keyboard, persistence and English.
import { test, expect, openMenu, closeMenu, onDialog, switchLang } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LS = 'sudoku.game.v1';
// Rules engine loaded outside the browser
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../sudoku/game.js', import.meta.url), 'utf8'), ctx);
const S = ctx.Sudoku;

// Written down independently of game.js: every row, column and box holds 1–9 once
function validSolution(s) {
  if (!/^[1-9]{81}$/.test(s)) return false;
  const units = [];
  for (let k = 0; k < 9; k++) {
    units.push([...Array(9)].map((_, j) => k * 9 + j), [...Array(9)].map((_, j) => j * 9 + k),
      [...Array(9)].map((_, j) => (Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)));
  }
  return units.every(u => new Set(u.map(i => s[i])).size === 9);
}
// Independent brute force: number of solutions (up to 2), cell by cell in reading order
function countSolutions(p) {
  const g = [...p].map(Number);
  let n = 0;
  const ok = (i, d) => {
    const r = Math.floor(i / 9), c = i % 9, br = r - (r % 3), bc = c - (c % 3);
    for (let k = 0; k < 9; k++) {
      if (g[r * 9 + k] === d || g[k * 9 + c] === d || g[(br + Math.floor(k / 3)) * 9 + bc + (k % 3)] === d) return false;
    }
    return true;
  };
  (function rec(i) {
    while (i < 81 && g[i]) i++;
    if (i === 81) { n++; return; }
    for (let d = 1; d <= 9 && n < 2; d++) if (ok(i, d)) { g[i] = d; rec(i + 1); g[i] = 0; }
  })(0);
  return n;
}
const givens = p => [...p].filter(c => c !== '0').length;

// A fixed puzzle for the page tests
const P = S.generate('easy', 12345);
const firstEmpty = [...P.puzzle].map((c, i) => (c === '0' ? i : -1)).filter(i => i >= 0);
const right = i => Number(P.solution[i]);
const wrong = i => (right(i) % 9) + 1;
const cell = (page, i) => page.locator(`#board .cell[data-i="${i}"]`);
const pad = (page, d) => page.locator(`#pad [data-d="${d}"]`);

// Stores a game before the first load only (the page saves its own game on pagehide, so reloads keep it)
async function load(page, game = {}) {
  await page.addInitScript(([k, g]) => {
    if (sessionStorage.getItem('test.seeded')) return;
    sessionStorage.setItem('test.seeded', '1');
    localStorage.setItem(k, JSON.stringify(g));
  }, [LS, { level: 'easy', puzzle: P.puzzle, solution: P.solution, values: P.puzzle, ...game }]);
  await page.goto('/sudoku/');
}
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);

test('rules: generated puzzles have exactly one solution and match their level', () => {
  for (const level of ['easy', 'medium', 'hard']) {
    for (let seed = 1; seed <= 8; seed++) {
      const { puzzle, solution } = S.generate(level, seed * 977);
      expect(validSolution(solution), `${level} ${seed}`).toBe(true);
      for (let i = 0; i < 81; i++) if (puzzle[i] !== '0') expect(puzzle[i]).toBe(solution[i]);
      expect(countSolutions(puzzle), `${level} ${seed}: unique`).toBe(1);
      const n = givens(puzzle), singles = S.singlesEnough([...puzzle].map(Number));
      if (level === 'easy') { expect(n).toBe(40); expect(singles).toBe(true); }
      if (level === 'medium') { expect(n).toBe(32); expect(singles).toBe(true); }
      if (level === 'hard') { expect(n).toBeLessThanOrEqual(30); expect(singles).toBe(false); }
    }
  }
  // Same seed, same puzzle; another seed, another one
  expect(S.generate('medium', 42)).toEqual(S.generate('medium', 42));
  expect(S.generate('medium', 42).puzzle).not.toBe(S.generate('medium', 43).puzzle);
});

test('rules: solver counts solutions and finds conflicts', () => {
  const sol = [...P.solution].map(Number);
  expect(S.solve(sol, 2).count).toBe(1);
  expect(S.solve(Array(81).fill(0), 2).count).toBe(2);
  // Removing a few digits from a full grid keeps the solution
  const p = sol.slice(); for (const i of [0, 10, 20, 30, 40]) p[i] = 0;
  expect(S.solve(p, 2).solution.join('')).toBe(P.solution);
  // Duplicates: no solution, and both cells are reported
  const bad = Array(81).fill(0); bad[0] = 5; bad[8] = 5;
  expect(S.solve(bad, 2).count).toBe(0);
  expect(S.conflicts(bad)).toEqual([0, 8]);
  expect(S.conflicts(sol)).toEqual([]);
  expect(S.isComplete(sol)).toBe(true);
});

test('a new puzzle on the first visit, kept after a reload', async ({ page }) => {
  await page.goto('/sudoku/');
  await expect(page.locator('#lvl')).toHaveText('Leicht');
  await expect(page.locator('#status')).toHaveText('Tippe auf ein leeres Kästchen.');
  const g = await stored(page);
  expect(validSolution(g.solution)).toBe(true);
  expect(givens(g.puzzle)).toBe(40);
  await expect(page.locator('#board .cell.given')).toHaveCount(40);
  await page.reload();
  expect((await stored(page)).puzzle).toBe(g.puzzle);
});

test('entering digits: right, wrong (red), same digit again clears, givens stay', async ({ page }) => {
  await load(page);
  const [a, b] = firstEmpty;
  await cell(page, a).click();
  await expect(cell(page, a)).toHaveAttribute('aria-selected', 'true');
  await pad(page, right(a)).click();
  await expect(cell(page, a)).toHaveAttribute('data-v', String(right(a)));
  await expect(cell(page, a)).not.toHaveClass(/wrong/);
  await cell(page, b).click();
  await pad(page, wrong(b)).click();
  await expect(cell(page, b)).toHaveClass(/wrong/);
  await expect(cell(page, b)).toHaveAttribute('aria-label', new RegExp(`: ${wrong(b)}, falsch$`));
  // Without "show mistakes" nothing is marked
  await openMenu(page);
  await page.locator('#optErrors').uncheck();
  await closeMenu(page);
  await expect(cell(page, b)).not.toHaveClass(/wrong/);
  await pad(page, wrong(b)).click();
  await expect(cell(page, b)).toHaveAttribute('data-v', '0');
  // A given digit cannot be changed
  const g = [...P.puzzle].findIndex(c => c !== '0');
  await cell(page, g).click();
  await expect(page.locator('#status')).toHaveText('Diese Zahl ist vorgegeben.');
  await pad(page, wrong(g)).click();
  await expect(cell(page, g)).toHaveAttribute('data-v', P.puzzle[g]);
  // Saved
  await page.reload();
  await expect(cell(page, a)).toHaveAttribute('data-v', String(right(a)));
  expect((await stored(page)).values[a]).toBe(String(right(a)));
});

test('the pad counts what is missing', async ({ page }) => {
  await load(page);
  const d = right(firstEmpty[0]);
  const missing = 9 - [...P.puzzle].filter(c => c === String(d)).length;
  await expect(pad(page, d).locator('small')).toHaveText(String(missing));
  await cell(page, firstEmpty[0]).click();
  await pad(page, d).click();
  await expect(pad(page, d).locator('small')).toHaveText(String(missing - 1));
});

test('notes: toggled per digit, struck automatically, erased, undone step by step', async ({ page }) => {
  await load(page);
  // Two empty squares in the same row
  const a = firstEmpty[0], b = firstEmpty.find(i => i !== a && Math.floor(i / 9) === Math.floor(a / 9));
  const d = right(a);
  await cell(page, b).click();
  await page.click('#btnNotes');
  await expect(page.locator('#btnNotes')).toHaveAttribute('aria-pressed', 'true');
  await pad(page, d).click();
  await pad(page, 9).click();
  await pad(page, 9).click(); // off again
  await expect(cell(page, b)).toHaveAttribute('aria-label', new RegExp(`leer, Notizen ${d}$`));
  await expect(cell(page, b).locator('.notes')).toHaveText(String(d));
  // Entering d in the same row strikes the note
  await page.click('#btnNotes');
  await cell(page, a).click();
  await pad(page, d).click();
  await expect(cell(page, b).locator('.notes')).toHaveCount(0);
  // Undo brings back the note together with the empty square
  await page.click('#btnUndo');
  await expect(cell(page, a)).toHaveAttribute('data-v', '0');
  await expect(cell(page, b).locator('.notes')).toHaveText(String(d));
  // Erase removes the notes; undo restores them
  await cell(page, b).click();
  await page.click('#btnErase');
  await expect(cell(page, b).locator('.notes')).toHaveCount(0);
  await page.click('#btnUndo');
  await expect(cell(page, b).locator('.notes')).toHaveText(String(d));
  // Notes survive a reload
  await page.reload();
  await expect(cell(page, b).locator('.notes')).toHaveText(String(d));
  // Undo all the way back
  for (let k = 0; k < 3; k++) await page.click('#btnUndo');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await expect(page.locator('#board .notes')).toHaveCount(0);
});

test('hint: fixes the selected square, counts, and a hinted puzzle sets no best time', async ({ page }) => {
  await load(page);
  const a = firstEmpty[0];
  await cell(page, a).click();
  await pad(page, wrong(a)).click();
  await page.click('#btnHint');
  await expect(cell(page, a)).toHaveAttribute('data-v', String(right(a)));
  await expect(page.locator('#lvl')).toHaveText('Leicht · 1 Tipp(s)');
  // Without selection on a right square: the hint picks another empty square
  await page.click('#btnHint');
  await expect(page.locator('#board .cell[data-v="0"]')).toHaveCount(firstEmpty.length - 2);
  // Fill in the rest
  for (const i of firstEmpty) {
    if (await cell(page, i).getAttribute('data-v') !== '0') continue;
    await cell(page, i).click();
    await pad(page, right(i)).click();
  }
  await expect(page.locator('#status')).toHaveText(/^Gelöst in \d+:\d\d mit 2 Tipp\(s\)\.$/);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.stats.v1')));
  expect(st.easy).toEqual({ solved: 1, best: null });
});

test('solving: status, best time, stats in the menu, next puzzle', async ({ page }) => {
  await page.clock.install();
  const last = firstEmpty[firstEmpty.length - 1];
  const almost = [...P.solution].map((c, i) => (i === last ? '0' : c)).join('');
  await load(page, { values: almost, elapsed: 125 });
  await expect(page.locator('#time')).toHaveText('2:05');
  await cell(page, last).click();
  await pad(page, right(last)).click();
  await expect(page.locator('#status')).toHaveText('Gelöst in 2:05 – neue Bestzeit!');
  await expect(page.locator('#pad')).toBeHidden();
  await expect(page.locator('#btnNext')).toBeVisible();
  await expect(page.locator('#btnUndo')).toBeDisabled();
  // The clock stops
  await page.clock.runFor(5000);
  await expect(page.locator('#time')).toHaveText('2:05');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.stats.v1')).easy)).toEqual({ solved: 1, best: 125 });
  await openMenu(page);
  await expect(page.locator('#best .stat-box').first()).toContainText('2:05');
  await expect(page.locator('#best .stat-box').first()).toContainText('1× gelöst');
  await closeMenu(page);
  // Solved state survives a reload
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Gelöst in 2:05!');
  await page.click('#btnNext');
  await expect(page.locator('#pad')).toBeVisible();
  await expect(page.locator('#time')).toHaveText('0:00');
  const g = await stored(page);
  expect(g.puzzle).not.toBe(P.puzzle);
  expect(g.level).toBe('easy');
});

test('the clock runs while visible and is saved', async ({ page }) => {
  await page.clock.install();
  await load(page);
  await page.clock.runFor(65_000);
  await expect(page.locator('#time')).toHaveText('1:05');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  expect((await stored(page)).elapsed).toBe(65);
});

test('menu: a new game asks when there are entries; start over clears them', async ({ page }) => {
  await load(page);
  const a = firstEmpty[0];
  await cell(page, a).click();
  await pad(page, right(a)).click();
  // Start over, cancelled, then confirmed
  await onDialog(page, d => d.dismiss(), { once: true });
  await openMenu(page);
  await page.click('#btnRestart');
  await expect(cell(page, a)).toHaveAttribute('data-v', String(right(a)));
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnRestart');
  await expect(cell(page, a)).toHaveAttribute('data-v', '0');
  expect((await stored(page)).puzzle).toBe(P.puzzle);
  // Without entries a new game starts right away
  await openMenu(page);
  await page.click('[data-new="hard"]');
  await expect(page.locator('#lvl')).toHaveText('Schwer');
  const g = await stored(page);
  expect(g.level).toBe('hard');
  expect(countSolutions(g.puzzle)).toBe(1);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sudoku.settings.v1')).level)).toBe('hard');
  // With entries: cancel keeps the puzzle
  const e = [...g.puzzle].indexOf('0');
  await cell(page, e).click();
  await pad(page, Number(g.solution[e])).click();
  await onDialog(page, d => d.dismiss(), { once: true });
  await openMenu(page);
  await page.click('[data-new="medium"]');
  expect((await stored(page)).puzzle).toBe(g.puzzle);
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('[data-new="medium"]');
  await expect(page.locator('#lvl')).toHaveText('Mittel');
});

test('keyboard: arrows move, digits enter, Backspace erases, N toggles notes', async ({ page }) => {
  await load(page);
  const a = firstEmpty[0];
  await cell(page, a).click();
  await page.keyboard.press(String(right(a)));
  await expect(cell(page, a)).toHaveAttribute('data-v', String(right(a)));
  await page.keyboard.press('Backspace');
  await expect(cell(page, a)).toHaveAttribute('data-v', '0');
  const next = Math.floor(a / 9) * 9 + ((a % 9) + 1) % 9;
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, next)).toHaveAttribute('aria-selected', 'true');
  await expect(cell(page, next)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('n');
  await expect(page.locator('#btnNotes')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('4');
  await expect(cell(page, a).locator('.notes')).toHaveText('4');
});

test('broken storage starts a fresh puzzle', async ({ page }) => {
  await load(page, { values: '1'.repeat(81) });
  const g = await stored(page);
  expect(g.puzzle).not.toBe(P.puzzle);
  expect(validSolution(g.solution)).toBe(true);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script follow the language', async ({ page }) => {
    await load(page);
    await expect(page.locator('#lvl')).toHaveText('Easy');
    await expect(page.locator('#status')).toHaveText('Tap an empty square.');
    await expect(cell(page, firstEmpty[0])).toHaveAttribute('aria-label', /^Row \d, column \d: empty$/);
    await switchLang(page, 'de');
    await expect(page.locator('#lvl')).toHaveText('Leicht');
  });
});
