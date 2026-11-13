// Laserspiegel: beam rules (worked out by hand), every puzzle solvable with its stored solution (checked with a
// tracer written here, independent of engine.js), placing/turning/dragging/taking back, laser and messages,
// solved puzzles marked, the hint leads to the solution in every puzzle, reload keeps the board, English.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect } from './helpers.mjs';

const LEVELS = (() => { const c = {}; vm.runInNewContext(readFileSync('laser-mirrors/levels.js', 'utf8'), { self: c }); return c.LaserLevels; })();

/* ---------- Independent tracer: what each piece does, written as tables per rotation ----------
   Directions as letters (travel direction): U, R, D, L. For each piece type and rotation, entering beam → result:
   list of new directions, 'LIT' (target hit) or 'STOP'. */
const T = {
  // Target mirror, r0: mirror "\" with its mirror side up/right, target on the left side, bottom side blocks
  target: [
    { U: 'STOP', R: 'LIT', D: ['R'], L: ['U'] },
    { U: ['R'], R: 'STOP', D: 'LIT', L: ['D'] },     // turned 90°: mirror side down/right, target on top
    { U: ['L'], R: ['D'], D: 'STOP', L: 'LIT' },     // 180°: mirror side down/left, target on the right
    { U: 'LIT', R: ['U'], D: ['L'], L: 'STOP' },     // 270°: mirror side up/left, target at the bottom
  ],
  double: [{ U: ['L'], R: ['D'], D: ['R'], L: ['U'] }, { U: ['R'], R: ['U'], D: ['L'], L: ['D'] }],
  split: [{ U: ['U', 'L'], R: ['R', 'D'], D: ['D', 'R'], L: ['L', 'U'] }, { U: ['U', 'R'], R: ['R', 'U'], D: ['D', 'L'], L: ['L', 'D'] }],
  check: [{ U: 'STOP', R: ['R'], D: 'STOP', L: ['L'] }, { U: ['U'], R: 'STOP', D: ['D'], L: 'STOP' }],
  block: [{ U: ['U'], R: ['R'], D: ['D'], L: ['L'] }],
  laser: [{ U: 'STOP', R: 'STOP', D: 'STOP', L: 'STOP' }],
  wall: [{ U: 'STOP', R: 'STOP', D: 'STOP', L: 'STOP' }],
};
const MOVE = { U: [0, -1], R: [1, 0], D: [0, 1], L: [-1, 0] };
const SHOOT = ['R', 'D', 'L', 'U'];   // laser direction per rotation
const parse = s => { const m = /^([LTSDCBW])([A-E])([1-5])([0-3])([qm]*)$/.exec(s); return { type: { L: 'laser', T: 'target', S: 'split', D: 'double', C: 'check', B: 'block', W: 'wall' }[m[1]], x: m[2].charCodeAt(0) - 65, y: Number(m[3]) - 1, r: Number(m[4]), must: m[5].includes('m') }; };
function rules(pieces, targets) {
  const at = (x, y) => pieces.findIndex(p => p.x === x && p.y === y);
  const laser = pieces.find(p => p.type === 'laser');
  const hit = new Set(), passed = new Set(), lit = new Set(), seen = new Set();
  const beams = [[laser.x, laser.y, SHOOT[laser.r]]];
  while (beams.length) {
    let [x, y, d] = beams.pop();
    for (;;) {
      x += MOVE[d][0]; y += MOVE[d][1];
      if (x < 0 || y < 0 || x > 4 || y > 4) break;
      const i = at(x, y);
      if (i < 0) continue;
      const p = pieces[i], res = T[p.type][p.r % T[p.type].length][d];
      hit.add(i);
      if (res === 'LIT') lit.add(i);
      if (p.type === 'check' && Array.isArray(res)) passed.add(i);
      if (Array.isArray(res) && !seen.has(`${i}${d}`)) { seen.add(`${i}${d}`); for (const o of res) beams.push([x, y, o]); }
      break;
    }
  }
  const ok = pieces.every((p, i) => p.type === 'laser' || p.type === 'block' || p.type === 'wall' || (p.type === 'check' ? passed.has(i) : hit.has(i)))
    && pieces.every((p, i) => !p.must || lit.has(i)) && lit.size === targets;
  return { ok, lit: lit.size };
}
function solvedBoard(l) {
  const sol = l.s.map(parse);
  const fixed = l.p.map(parse).map(p => { const z = sol.find(q => q.x === p.x && q.y === p.y); return z ? { ...p, r: z.r } : p; });
  const added = sol.filter(z => !fixed.some(p => p.x === z.x && p.y === z.y));
  return { fixed, added };
}

test('the puzzle list: 50 own puzzles, each with a working solution that uses every piece to add', () => {
  expect(LEVELS).toHaveLength(50);
  expect(new Set(LEVELS.map(l => l.id)).size).toBe(50);
  for (const d of ['easy', 'medium', 'hard', 'expert', 'walls']) expect(LEVELS.filter(l => l.d === d)).toHaveLength(10);
  for (const l of LEVELS) {
    const { fixed, added } = solvedBoard(l);
    // The solution adds exactly the pieces of the supply
    expect(added.map(p => p.type).sort(), l.id).toEqual(l.a.map(a => parse(a[0] + 'A10').type).sort());
    // Assign the marked pieces to add to lit spots: some assignment must satisfy the rules
    const marks = l.a.filter(a => a.includes('m')).length;
    const targetsAdded = added.map((p, i) => i).filter(i => added[i].type === 'target');
    let ok = false;
    const choose = (k, from, set) => {
      if (ok) return;
      if (k === 0) {
        const board = fixed.concat(added.map((p, i) => ({ ...p, must: set.includes(i) })));
        if (rules(board, l.t).ok) ok = true;
        return;
      }
      for (let j = from; j < targetsAdded.length; j++) choose(k - 1, j + 1, [...set, targetsAdded[j]]);
    };
    choose(marks, 0, []);
    expect(ok, `${l.id} is solved by its solution`).toBe(true);
    // Not solved from the start: something to add or turn
    expect(l.a.length, l.id).toBeGreaterThan(0);
  }
});

test('beam rules: mirrors, target sides, splitter, checkpoint and blocker (worked out by hand)', async ({ page }) => {
  await page.goto('/laser-mirrors/');
  const lit = (pieces) => page.evaluate(p => { const r = LaserEngine.trace(p); return { lit: [...r.lit].sort(), touched: [...r.touched].sort(), passed: [...r.passed] }; }, pieces);
  // Laser A1 shoots right onto the target's left side on E1: lit
  expect((await lit([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'target', x: 4, y: 0, r: 0 }])).lit).toEqual([1]);
  // The same target turned half: the beam hits its mirror side and goes down – nothing lit
  expect((await lit([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'target', x: 4, y: 0, r: 2 }, { type: 'target', x: 4, y: 4, r: 1 }])).lit).toEqual([2]);
  // Double mirror on C1 sends the beam down to C5; a target there turned 90° has its target on top: lit
  expect((await lit([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'double', x: 2, y: 0, r: 0 }, { type: 'target', x: 2, y: 4, r: 1 }])).lit).toEqual([2]);
  // … the same target unturned reflects it to the right: not lit, but touched
  expect(await lit([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'double', x: 2, y: 0, r: 0 }, { type: 'target', x: 2, y: 4, r: 0 }])).toEqual({ lit: [], touched: [1, 2], passed: [] });
  // Splitter on C3: one beam on to E3, one down to C5 – two targets
  expect((await lit([{ type: 'laser', x: 0, y: 2, r: 0 }, { type: 'split', x: 2, y: 2, r: 0 }, { type: 'target', x: 4, y: 2, r: 0 }, { type: 'target', x: 2, y: 4, r: 1 }])).lit).toEqual([2, 3]);
  // Checkpoint: open left–right passes the beam, turned it blocks; the blocker lets it through
  expect(await lit([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'check', x: 1, y: 0, r: 0 }, { type: 'block', x: 2, y: 0, r: 0 }, { type: 'target', x: 4, y: 0, r: 0 }])).toEqual({ lit: [3], touched: [1, 2, 3], passed: [1] });
  expect(await lit([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'check', x: 1, y: 0, r: 1 }, { type: 'target', x: 4, y: 0, r: 0 }])).toEqual({ lit: [], touched: [1], passed: [] });
  // What the rules report: pieces left in the supply, too few targets, a checkpoint not passed, a piece not hit
  const issues = (pieces, targets, left) => page.evaluate(([p, t, l]) => LaserEngine.evaluate(p, t, l).issues.map(x => x.k).sort(), [pieces, targets, left]);
  expect(await issues([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'check', x: 1, y: 0, r: 1 }, { type: 'target', x: 4, y: 0, r: 0 }, { type: 'double', x: 3, y: 3, r: 0 }], 1, 2))
    .toEqual(['check', 'count', 'tray', 'untouched', 'untouched']);
  expect(await issues([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'target', x: 4, y: 0, r: 0, must: true }], 1, 0)).toEqual([]);
  expect(await issues([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'target', x: 4, y: 0, r: 2, must: true }], 0, 0)).toEqual(['must']);
  // A wall stops the beam from every side; it is hit but need not be
  for (const r of [0, 1, 2, 3]) expect(await lit([{ type: 'laser', x: 2, y: 2, r }, { type: 'wall', x: [3, 2, 1, 2][r], y: [2, 3, 2, 1][r], r: 0 }, { type: 'target', x: [4, 2, 0, 2][r], y: [2, 4, 2, 0][r], r: 0 }])).toEqual({ lit: [], touched: [1], passed: [] });
  expect(await issues([{ type: 'laser', x: 0, y: 0, r: 0 }, { type: 'target', x: 4, y: 0, r: 0 }, { type: 'wall', x: 2, y: 2, r: 0 }], 1, 0)).toEqual([]);
  // Laser turned (r1) shoots down
  expect((await lit([{ type: 'laser', x: 0, y: 0, r: 1 }, { type: 'target', x: 0, y: 4, r: 1 }])).lit).toEqual([1]);
});

test('first puzzle: place the piece by tapping, turn it, drag it, switch on the laser, solved and marked', async ({ page }) => {
  // Laser A4 shoots down, the marked target on B5 has its target on the left: a double mirror on A5 sends the beam there
  expect(LEVELS[0]).toEqual({ id: 'e01', d: 'easy', t: 1, p: ['LA41', 'TB50m', 'BA20'], a: ['D'], s: ['DA50'] });
  const cell = (x, y) => page.locator(`.cell[data-x="${x}"][data-y="${y}"]`);
  await page.goto('/laser-mirrors/');
  await expect(page.locator('#solvedCount')).toHaveText('0 von 50 Rätseln gelöst');
  await expect(page.locator('.lvl')).toHaveCount(50);
  await page.click('[data-level="e01"]');
  await expect(page.locator('#levelName')).toHaveText('Leicht 1');
  await expect(page.locator('#status')).toHaveText('Ziel: 1 Ziel treffen. Teile setzen, dann den Laser einschalten.');
  await expect(cell(0, 3)).toHaveAttribute('data-type', 'laser');
  await expect(cell(1, 4)).toHaveAttribute('data-type', 'target');
  await expect(cell(1, 4).locator('.must')).toHaveCount(1);
  await expect(page.locator('.tray-piece')).toHaveCount(1);
  // Laser on before placing: the beam shows, the piece is missing
  await page.click('#btnLaser');
  await expect(page.locator('#btnLaser')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#beam')).toBeVisible();
  await expect(page.locator('#beam line.core')).toHaveCount(1);
  await expect(page.locator('#status')).toHaveText('Noch 1 Teil aus dem Vorrat einsetzen.');
  // Tapping a square without a chosen piece explains what to do
  await cell(2, 2).click();
  await expect(page.locator('#status')).toHaveText('Erst ein Teil im Vorrat antippen.');
  await page.click('.tray-piece');
  await expect(page.locator('.tray-piece')).toHaveAttribute('aria-pressed', 'true');
  await cell(2, 2).click();
  await expect(cell(2, 2)).toHaveAttribute('data-type', 'double');
  await expect(cell(2, 2)).toHaveClass(/own/);
  await expect(page.locator('.tray-piece')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Das Ziel mit rotem Ring auf B5 leuchtet nicht.');
  // Turn it, then drag it to A5: turned ("/") it sends the beam off to the left
  await cell(2, 2).click();
  await expect(cell(2, 2)).toHaveAttribute('data-r', '1');
  const from = await cell(2, 2).boundingBox(), to = await cell(0, 4).boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 + 20, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(cell(0, 4)).toHaveAttribute('data-type', 'double');
  await expect(cell(0, 4)).toHaveAttribute('data-r', '1');
  await expect(cell(2, 2)).not.toHaveAttribute('data-type', /./);
  await expect(page.locator('#status')).toHaveText('Das Ziel mit rotem Ring auf B5 leuchtet nicht.');
  await expect(page.locator('.goal .dot.on')).toHaveCount(0);
  // Fixed pieces without ↻ do not turn
  await cell(1, 4).click();
  await expect(cell(1, 4)).toHaveAttribute('data-r', '0');
  // Turn the mirror back: solved
  await cell(0, 4).click();
  await expect(page.locator('#status')).toHaveText('🎉 Geschafft! Alle Ziele leuchten.');
  await expect(cell(1, 4)).toHaveClass(/lit/);
  await expect(page.locator('.goal .dot.on')).toHaveCount(1);
  await expect(page.locator('#btnNext')).toBeVisible();
  await expect(page.locator('#btnHint')).toBeHidden();
  // Solved: nothing turns any more
  await cell(0, 4).click();
  await expect(cell(0, 4)).toHaveAttribute('data-r', '0');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('laser-mirrors.progress.v1')).solved)).toEqual({ e01: 1 });
  // Next puzzle, then back to the list: e01 has its tick
  await page.click('#btnNext');
  await expect(page.locator('#levelName')).toHaveText('Leicht 2');
  await page.click('#btnLevels');
  await expect(page.locator('#solvedCount')).toHaveText('1 von 50 Rätseln gelöst');
  await expect(page.locator('[data-level="e01"]')).toHaveClass(/solved/);
  await expect(page.locator('[data-level="e02"]')).not.toHaveClass(/solved/);
});

test('drag from the supply, back into the supply, Delete key, reload keeps the board', async ({ page }) => {
  await page.goto('/laser-mirrors/');
  await page.click('[data-level="h01"]');
  const n = LEVELS.find(l => l.id === 'h01').a.length;
  const trayCount = () => page.evaluate(() => JSON.parse(localStorage.getItem('laser-mirrors.game.v1')).tray.length);
  expect(await trayCount()).toBe(n);
  // A free square
  const free = await page.evaluate(() => [...document.querySelectorAll('.cell')].findIndex(c => !c.dataset.type));
  const cell = page.locator('.cell').nth(free);
  const drag = async (fromLoc, toLoc) => {
    const a = await fromLoc.boundingBox(), b = await toLoc.boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(a.x + a.width / 2 + 15, a.y + a.height / 2 - 15, { steps: 3 });
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 });
    await page.mouse.up();
  };
  await drag(page.locator('.tray-piece').first(), cell);
  await expect(cell).toHaveAttribute('data-type', /./);
  await expect(cell).toHaveClass(/own/);
  expect(await trayCount()).toBe(n - 1);
  // Reload: the piece is still there
  await page.reload();
  await expect(page.locator('#levelName')).toHaveText('Schwer 1');
  await expect(page.locator('.cell').nth(free)).toHaveClass(/own/);
  // Back into the supply by dragging
  await drag(page.locator('.cell').nth(free), page.locator('#tray'));
  await expect(page.locator('.cell').nth(free)).not.toHaveAttribute('data-type', /./);
  expect(await trayCount()).toBe(n);
  // Keyboard: Enter on a supply piece, Enter on the square, Delete takes it back
  await page.locator('.tray-piece').first().focus();
  await page.keyboard.press('Enter');
  await page.locator('.cell').nth(free).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.cell').nth(free)).toHaveClass(/own/);
  await page.keyboard.press('Delete');
  await expect(page.locator('.cell').nth(free)).not.toHaveAttribute('data-type', /./);
  // Start over restores the puzzle
  await page.locator('.tray-piece').first().click();
  await page.locator('.cell').nth(free).click();
  await page.click('#btnRestart');
  expect(await trayCount()).toBe(n);
});

// One test per difficulty, so they run in parallel
for (const d of ['easy', 'medium', 'hard', 'expert', 'walls']) {
  test(`the hint leads to the solution in every puzzle (${d})`, async ({ page }) => {
    await page.goto('/laser-mirrors/');
    for (const l of LEVELS.filter(l => l.d === d)) {
      if (await page.locator('#btnLevels').isVisible()) await page.click('#btnLevels');
      await page.click(`[data-level="${l.id}"]`);
      // Mess it up first: every supply piece somewhere (hints must also clear pieces in wrong places)
      for (let k = 0; k < l.a.length; k++) {
        const free = await page.evaluate(() => [...document.querySelectorAll('.cell')].findLastIndex(c => !c.dataset.type));
        const tp = page.locator('.tray-piece').first();
        if ((await tp.getAttribute('aria-pressed')) !== 'true') await tp.click();
        await page.locator('.cell').nth(free).click();
      }
      await expect(page.locator('.tray-piece')).toHaveCount(0);
      for (let k = 0; k < 12; k++) {
        await page.click('#btnHint');
        if ((await page.locator('#status').textContent()) === 'Alles richtig – schalte den Laser ein!') break;
      }
      await expect(page.locator('#status'), l.id).toHaveText('Alles richtig – schalte den Laser ein!');
      await page.click('#btnLaser');
      await expect(page.locator('#status'), l.id).toHaveText('🎉 Geschafft! Alle Ziele leuchten.');
      await expect(page.locator('.goal .dot.on')).toHaveCount(l.t);
    }
    await page.click('#btnLevels');
    await expect(page.locator('#solvedCount')).toHaveText('10 von 50 Rätseln gelöst');
  });
}

test('free play: every piece movable, the laser too, beam on from the start', async ({ page }) => {
  await page.goto('/laser-mirrors/');
  await page.click('#btnFree');
  await expect(page.locator('#levelName')).toHaveText('Freies Spiel');
  await expect(page.locator('#btnHint')).toBeHidden();
  await expect(page.locator('#btnLaser')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#status')).toHaveText('0 Ziele getroffen.');
  // Laser on A3 shoots right; a target on E3 lights up
  await page.locator('.tray-piece[data-type="target"]').click();
  await page.click('.cell[data-x="4"][data-y="2"]');
  await expect(page.locator('#status')).toHaveText('1 Ziel getroffen.');
  // Turning the laser (tap) points it down: nothing lit any more
  await page.click('.cell[data-x="0"][data-y="2"]');
  await expect(page.locator('#status')).toHaveText('0 Ziele getroffen.');
  await expect(page.locator('#btnNext')).toBeHidden();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts follow the language', async ({ page }) => {
    await page.goto('/laser-mirrors/');
    await expect(page.locator('#solvedCount')).toHaveText('0 of 50 puzzles solved');
    await page.click('[data-level="m02"]');
    await expect(page.locator('#levelName')).toHaveText('Medium 2');
    await page.click('#btnLaser');
    await expect(page.locator('#status')).toHaveText(/^Place \d more pieces? from the supply\.$/);
    await expect(page.locator('.cell').first()).toHaveAttribute('aria-label', /^A1: /);
  });
});
