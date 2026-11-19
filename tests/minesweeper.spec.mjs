// Minensuche: rules engine (safe first tap, counts, flood fill, chord, win, restore) checked against an
// independent implementation; on the page tapping, flag mode, long press, right-click, keyboard, win/loss
// with statistics, persistence, new game with undo, size in the menu and English.
import { test, expect, openMenu, onDialog, switchLang } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ctx = {};
vm.runInNewContext(readFileSync(new URL('../minesweeper/game.js', import.meta.url), 'utf8'), ctx);
const M = ctx.Minesweeper;
const LS = 'minesweeper.game.v1';

// ---------- Independent helpers ----------
const nbrs = (rows, cols, i) => {
  const r = Math.floor(i / cols), c = i % cols, out = [];
  for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++)
    if ((rr !== r || cc !== c) && rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
  return out;
};
const around = (rows, cols, mine, i) => nbrs(rows, cols, i).filter(j => mine[j]).length;
// What opening `start` must open: the connected zero area plus its border
function expectedOpen(rows, cols, mine, start) {
  const seen = new Set([start]), queue = [start];
  while (queue.length) {
    const i = queue.shift();
    if (around(rows, cols, mine, i)) continue;
    for (const j of nbrs(rows, cols, i)) if (!seen.has(j) && !mine[j]) { seen.add(j); queue.push(j); }
  }
  return [...seen].sort((a, b) => a - b);
}
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

test('rules: the first tap is safe with its neighbours, the mines count and the flood fill are right', () => {
  // Collects every mismatch and checks once at the end (an expect per square is slow)
  const rnd = seeded(11), bad = [];
  for (const [name, L] of Object.entries(M.LEVELS)) {
    for (let n = 0; n < 150; n++) {
      const g = M.create(L.rows, L.cols, L.mines);
      const start = Math.floor(rnd() * L.rows * L.cols);
      const opened = M.reveal(g, start, rnd);
      const tag = `${name} #${n} start ${start}`;
      if (g.mine.filter(Boolean).length !== L.mines) bad.push(`${tag}: mine count`);
      if (g.mine[start] || nbrs(L.rows, L.cols, start).some(j => g.mine[j])) bad.push(`${tag}: mine at or next to the first tap`);
      const want = expectedOpen(L.rows, L.cols, g.mine, start);
      if ([...opened].sort((a, b) => a - b).join() !== want.join()) bad.push(`${tag}: opened squares`);
      for (let i = 0; i < g.open.length; i++) {
        if (g.open[i] !== (want.includes(i) ? 1 : 0)) bad.push(`${tag}: square ${i} open state`);
        if (!g.mine[i] && M.count(g, i) !== around(L.rows, L.cols, g.mine, i)) bad.push(`${tag}: count of ${i}`);
      }
    }
  }
  expect(bad).toEqual([]);
});

test('rules: opening every safe square wins and flags the mines; a mine loses and shows the rest', () => {
  const rnd = seeded(5);
  const bad = [];
  for (let n = 0; n < 100; n++) {
    const g = M.create(9, 8, 10);
    M.reveal(g, Math.floor(rnd() * 72), rnd);
    for (let i = 0; i < 72 && g.status === 'playing'; i++) if (!g.mine[i]) M.reveal(g, i);
    if (g.status !== 'won' || M.flags(g) !== 10 || g.flag.join() !== g.mine.join() || M.reveal(g, 0).length) bad.push(n);
  }
  expect(bad).toEqual([]);
  const g = M.create(9, 8, 10);
  M.reveal(g, 0, rnd);
  const mine = g.mine.indexOf(1), safeHidden = g.mine.findIndex((m, i) => !m && !g.open[i]);
  M.toggleFlag(g, safeHidden);
  expect(M.reveal(g, mine)).toEqual([mine]);
  expect(g.status).toBe('lost');
  expect(M.view(g, mine)).toBe('hit');
  expect(M.view(g, safeHidden)).toBe('wrong-flag');
  expect(g.mine.map((m, i) => m && i !== mine ? M.view(g, i) : null).filter(Boolean).every(v => v === 'mine')).toBe(true);
  expect(M.toggleFlag(g, safeHidden)).toBe(false);
});

test('rules: chord opens the other neighbours only when the flags match; flags block opening', () => {
  // 3×3 with one mine in the corner: the centre shows 1
  const g = M.create(3, 3, 1);
  g.mine = [1, 0, 0, 0, 0, 0, 0, 0, 0]; g.status = 'playing';
  expect(M.reveal(g, 4)).toEqual([4]);
  expect(M.chord(g, 4)).toEqual([]);           // no flag yet
  M.toggleFlag(g, 1);                            // wrong flag: chord opens the mine
  const lost = structuredClone(g);
  M.chord(lost, 4);
  expect(lost.status).toBe('lost');
  M.toggleFlag(g, 1); M.toggleFlag(g, 0);
  expect(M.reveal(g, 0)).toEqual([]);            // flagged
  expect(M.chord(g, 4).sort()).toEqual([1, 2, 3, 5, 6, 7, 8]);
  expect(g.status).toBe('won');
});

test('rules: restore accepts stored games and rejects broken ones', () => {
  const g = M.create(9, 8, 10);
  M.reveal(g, 30, seeded(3));
  const back = M.restore(JSON.parse(JSON.stringify(g)));
  expect(back.status).toBe('playing');
  expect(back.open).toEqual(g.open);
  expect(M.restore(JSON.parse(JSON.stringify(M.create(9, 8, 10)))).status).toBe('ready');
  for (const bad of [null, 'x', { ...g, open: g.open.slice(1) }, { ...g, mine: g.mine.map(() => 0) }, { ...g, status: 'won!' },
    { ...g, mine: null }, { ...g, mines: 72 }, { ...g, flag: g.open }])
    expect(M.restore(JSON.parse(JSON.stringify(bad)))).toBeNull();
});

// ---------- Page ----------
// Easy board (8 columns × 9 rows) with known mines: the whole bottom row plus row 8, columns 1–2.
// Opening the top left square then opens every safe square at once.
const MINES = [56, 57, 64, 65, 66, 67, 68, 69, 70, 71];
const seed = (page, extra = {}) => page.addInitScript(([key, mines, e]) => {
  if (sessionStorage.getItem('seeded')) return;
  sessionStorage.setItem('seeded', '1');
  const n = 72, mine = Array(n).fill(0);
  for (const i of mines) mine[i] = 1;
  localStorage.setItem(key, JSON.stringify({ level: 'easy', elapsed: 0, ...e,
    game: { rows: 9, cols: 8, mines: 10, mine, open: Array(n).fill(0), flag: Array(n).fill(0), status: 'playing', hit: -1, ...(e.game || {}) } }));
}, [LS, MINES, extra]);
const cell = (page, i) => page.locator(`#board .cell[data-i="${i}"]`);

test('the first tap is safe and opens an area; the clock starts', async ({ page }) => {
  await page.goto('/minesweeper/');
  await expect(page.locator('#board .cell')).toHaveCount(72);
  await expect(page.locator('#status')).toHaveText('Tippe ein Feld an – der erste Tipp ist sicher.');
  await expect(page.locator('#minesLeftN')).toHaveText('10');
  await cell(page, 35).click();
  await expect(cell(page, 35)).toHaveAttribute('data-v', '0');
  expect(await page.locator('#board .cell.open').count()).toBeGreaterThan(1);
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'playing');
  await expect(page.locator('#status')).toContainText('Felder ohne Mine');
  await expect(page.locator('#timeN')).toHaveText('0:01', { timeout: 3000 });
  await expect(cell(page, 35)).toHaveAccessibleName('Reihe 5, Spalte 4: leer');
});

test('opening every safe square wins: statistics, best time, new game button; it survives a reload', async ({ page }) => {
  await seed(page, { elapsed: 61500 });
  await page.goto('/minesweeper/');
  await cell(page, 0).click();
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'won');
  await expect(page.locator('#status')).toHaveText(/^Geschafft in 1:0\d!$/);
  await expect(page.locator('#board .cell.open')).toHaveCount(62);
  await expect(page.locator('#board .cell[data-v="flag"]')).toHaveCount(10);
  await expect(cell(page, 58)).toHaveText('4');
  await expect(page.locator('#minesLeftN')).toHaveText('0');
  await expect(page.locator('#mode')).toBeHidden();
  await expect(page.locator('#btnAgain')).toBeVisible();
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('minesweeper.stats.v1')));
  expect(stats.easy.played).toBe(1);
  expect(stats.easy.won).toBe(1);
  expect(stats.easy.best).toBeGreaterThanOrEqual(61500);
  expect(stats.easy.best).toBeLessThan(70000);
  await page.reload();
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'won');
  await openMenu(page);
  await expect(page.locator('#stPlayed')).toHaveText('1');
  await expect(page.locator('#stRate')).toHaveText('100 %');
  await expect(page.locator('#stBest')).toHaveText(/^1:0\d$/);
});

test('hitting a mine loses: the mines and wrong flags show, the game counts as lost', async ({ page }) => {
  await seed(page);
  await page.goto('/minesweeper/');
  await cell(page, 0).click({ button: 'right' });   // wrong flag
  await expect(cell(page, 0)).toHaveAttribute('data-v', 'flag');
  await expect(page.locator('#minesLeftN')).toHaveText('9');
  await cell(page, 71).click();
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'lost');
  await expect(page.locator('#status')).toHaveText('Mine getroffen!');
  await expect(cell(page, 71)).toHaveAttribute('data-v', 'hit');
  await expect(cell(page, 0)).toHaveAttribute('data-v', 'wrong-flag');
  await expect(page.locator('#board .cell[data-v="mine"]')).toHaveCount(9);
  await expect(cell(page, 71)).toHaveAccessibleName('Reihe 9, Spalte 8: getroffene Mine');
  const stats = await page.evaluate(() => JSON.parse(localStorage.getItem('minesweeper.stats.v1')));
  expect(stats.easy).toEqual({ played: 1, won: 0, best: null });
  await page.click('#btnAgain');
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'ready');
  await expect(page.locator('#board .cell.open')).toHaveCount(0);
});

test('flag mode, long press and chord; a flagged square is not opened', async ({ page }) => {
  await seed(page);
  await page.goto('/minesweeper/');
  // Flag mode: tapping places and removes flags
  await page.locator('#mode [data-m="flag"]').click();
  await expect(page.locator('#mode [data-m="flag"]')).toHaveAttribute('aria-pressed', 'true');
  await cell(page, 57).click();
  await expect(cell(page, 57)).toHaveAttribute('data-v', 'flag');
  await cell(page, 57).click();
  await expect(cell(page, 57)).toHaveAttribute('data-v', 'hidden');
  await page.locator('#mode [data-m="open"]').click();
  // Long press with a finger places a flag in open mode, the click that follows does not open it
  const box = await cell(page, 57).boundingBox();
  const at = { pointerType: 'touch', isPrimary: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2, bubbles: true };
  await cell(page, 57).dispatchEvent('pointerdown', at);
  await expect(cell(page, 57)).toHaveAttribute('data-v', 'flag');
  await cell(page, 57).dispatchEvent('pointerup', at);
  await cell(page, 57).dispatchEvent('click');
  await expect(cell(page, 57)).toHaveAttribute('data-v', 'flag');
  // A flagged square stays closed in open mode
  await cell(page, 57).click();
  await expect(cell(page, 57)).toHaveAttribute('data-v', 'flag');
  // Square 58 (row 8, col 3) shows 4: flag its mines, then tapping the number opens the other neighbours
  for (const i of [65, 66, 67]) await cell(page, i).click({ button: 'right' });
  await expect(page.locator('#minesLeftN')).toHaveText('6');
  // The first tap opens 58 itself (its neighbours hold mines, no flood), the second one chords
  await cell(page, 58).click();
  await expect(cell(page, 58)).toHaveText('4');
  await cell(page, 58).click();
  for (const i of [49, 50, 51, 59]) await expect(cell(page, i)).toHaveClass(/\bopen\b/);
  await expect(page.locator('#board')).not.toHaveAttribute('data-status', 'lost');
});

test('keyboard: arrows move between squares, F flags, Enter opens', async ({ page }) => {
  await seed(page);
  await page.goto('/minesweeper/');
  await expect(page.locator('#board .cell[tabindex="0"]')).toHaveCount(1);
  await cell(page, 0).focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await expect(cell(page, 9)).toBeFocused();
  await page.keyboard.press('f');
  await expect(cell(page, 9)).toHaveAttribute('data-v', 'flag');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(cell(page, 1)).toHaveClass(/\bopen\b/);
});

test('a game in progress survives a reload with its time; a new game can be undone', async ({ page }) => {
  await seed(page, { elapsed: 125000 });
  await page.goto('/minesweeper/');
  await cell(page, 58).click();
  await cell(page, 70).click({ button: 'right' });
  await page.reload();
  await expect(cell(page, 58)).toHaveText('4');
  await expect(cell(page, 70)).toHaveAttribute('data-v', 'flag');
  await expect(page.locator('#timeN')).toHaveText(/^2:0\d$/);
  await page.click('#btnNew');
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'ready');
  await expect(page.locator('#timeN')).toHaveText('0:00');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(cell(page, 58)).toHaveText('4');
  await expect(page.locator('#board')).toHaveAttribute('data-status', 'playing');
  // An abandoned game does not count
  expect(await page.evaluate(() => localStorage.getItem('minesweeper.stats.v1'))).toBeNull();
});

test('the size is chosen in the menu, starts a new board and is kept', async ({ page }) => {
  await page.goto('/minesweeper/');
  await openMenu(page);
  await expect(page.locator('#levelInfo')).toHaveText('8 × 9 Felder, 10 Minen');
  await page.locator('#levels [data-l="hard"]').click();
  await expect(page.locator('#board .cell')).toHaveCount(192);
  await expect(page.locator('#lvlName')).toHaveText('Schwer');
  await expect(page.locator('#minesLeftN')).toHaveText('38');
  await page.reload();
  await expect(page.locator('#board .cell')).toHaveCount(192);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minesweeper.settings.v1')).level)).toBe('hard');
});

test('statistics reset asks first', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('minesweeper.stats.v1', JSON.stringify({ easy: { played: 4, won: 1, best: 42000 } })));
  await page.goto('/minesweeper/');
  await openMenu(page);
  await expect(page.locator('#stRate')).toHaveText('25 %');
  await expect(page.locator('#stBest')).toHaveText('0:42');
  await onDialog(page, d => d.dismiss(), { once: true });
  await page.click('#btnResetStats');
  await expect(page.locator('#stPlayed')).toHaveText('4');
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnResetStats');
  await expect(page.locator('#stPlayed')).toHaveText('0');
  await expect(page.locator('#stBest')).toHaveText('–');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and squares in English; switching back re-renders', async ({ page }) => {
    await seed(page);
    await page.goto('/minesweeper/');
    await expect(page.locator('#status')).toHaveText('62 squares without a mine to go');
    await expect(page.locator('#mode [data-m="flag"]')).toHaveText('Place flag');
    await expect(cell(page, 0)).toHaveAccessibleName('Row 1, column 1: hidden');
    await switchLang(page, 'de');
    await expect(page.locator('#status')).toHaveText('Noch 62 Felder ohne Mine');
  });
});
