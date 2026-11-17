// Käsekästchen (dots and boxes): rules (closing boxes, moving again, end of the round), the
// computer levels against each other and in typical endgames, two players on one phone (score,
// undo, alternating start, persistence), the computer as opponent, board size, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LS = 'dots-and-boxes.state.v1';
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../dots-and-boxes/game.js', import.meta.url), 'utf8'), ctx);
const G = ctx.DotsBoxes;

const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
// Line between two dots given as "A1-B1", written down independently of game.js
function lineOf(n, s) {
  const [p, q] = s.split('-').map(d => [d.charCodeAt(0) - 65, Number(d.slice(1)) - 1]);
  const [a] = [p, q].sort((x, y) => x[0] + x[1] - y[0] - y[1]);
  return p[1] === q[1] ? a[1] * n + a[0] : n * (n + 1) + a[1] * (n + 1) + a[0];
}
// Box owners from scratch: a box is closed by whoever drew its last line
function replayIndependent(n, starter, moves) {
  const drawn = new Set(), owner = Array(n * n).fill(null);
  let turn = starter;
  for (const e of moves) {
    drawn.add(e);
    let closed = 0;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const b = r * n + c;
      const sides = [r * n + c, (r + 1) * n + c, n * (n + 1) + r * (n + 1) + c, n * (n + 1) + r * (n + 1) + c + 1];
      if (!owner[b] && sides.includes(e) && sides.every(x => drawn.has(x))) { owner[b] = turn; closed++; }
    }
    if (!closed) turn = turn === 'a' ? 'b' : 'a';
  }
  return { owner, turn };
}

test('rules: closing boxes, moving again and the score agree with an independent check', () => {
  const rnd = seeded(5);
  for (let k = 0; k < 300; k++) {
    const n = G.SIZES[k % 4], p = G.start(n, k % 2 ? 'b' : 'a'), moves = [];
    const total = 2 * n * (n + 1);
    expect(G.free(p).length).toBe(total);
    while (!G.over(p)) {
      const f = G.free(p), e = f[Math.floor(rnd() * f.length)];
      G.play(p, e); moves.push(e);
      if (rnd() < 0.1) {
        const ind = replayIndependent(n, k % 2 ? 'b' : 'a', moves);
        expect(p.owner).toEqual(ind.owner);
        expect(p.turn).toBe(ind.turn);
      }
    }
    expect(moves.length).toBe(total);
    const ind = replayIndependent(n, k % 2 ? 'b' : 'a', moves);
    expect(p.owner).toEqual(ind.owner);
    const a = ind.owner.filter(o => o === 'a').length, b = n * n - a;
    expect(G.result(p)).toEqual({ winner: a > b ? 'a' : b > a ? 'b' : null, score: { a, b } });
  }
  expect(() => G.play(G.start(3), 99)).toThrow('no_line');
  const p = G.start(3); G.play(p, 0);
  expect(() => G.play(p, 0)).toThrow('taken');
});

test('rules: line names', () => {
  expect(G.lineName(3, lineOf(3, 'A1-B1'))).toBe('A1-B1');
  expect(G.parseLine(3, 'B1-A1')).toBe(lineOf(3, 'A1-B1'));
  expect(G.parseLine(4, 'c2-c3')).toBe(lineOf(4, 'C2-C3'));
  expect(G.parseLine(3, 'D4-D3')).toBe(lineOf(3, 'D3-D4'));
  for (const bad of ['A1-B2', 'A1-C1', 'A1-A1', 'E1-E2', 'A0-B0', 'x']) expect(G.parseLine(3, bad), bad).toBe(-1);
  for (const n of G.SIZES) for (let e = 0; e < 2 * n * (n + 1); e++) expect(G.parseLine(n, G.lineName(n, e))).toBe(e);
});

function match(la, lb, n, games, rnd) {
  const w = { a: 0, b: 0, draw: 0 };
  for (let i = 0; i < games; i++) {
    const p = G.start(n, i % 2 ? 'b' : 'a');
    while (!G.over(p)) {
      const e = G.cpuMove(p, p.turn === 'a' ? la : lb, rnd);
      expect(p.lines[e]).toBe(0);
      G.play(p, e);
    }
    w[G.result(p).winner || 'draw']++;
  }
  return w;
}
test('computer: hard beats medium, medium beats easy', () => {
  const rnd = seeded(42);
  for (const n of [3, 5]) {
    const hm = match('hard', 'medium', n, 60, rnd), me = match('medium', 'easy', n, 60, rnd);
    expect(hm.a, `hard vs medium ${n}×${n}: ${JSON.stringify(hm)}`).toBeGreaterThan(hm.b * 2);
    expect(me.a, `medium vs easy ${n}×${n}: ${JSON.stringify(me)}`).toBeGreaterThan(me.b * 4);
  }
});

// Position from drawn lines (named by their dots), b to move; boxes with four sides belong to a
function position(n, names, turn = 'b') {
  const p = G.start(n, 'a');
  for (const s of names) p.lines[lineOf(n, s)] = 1;
  p.left = G.free(p).length; p.turn = turn;
  for (let b = 0; b < n * n; b++) if (G.sides(p, b) === 4) { p.owner[b] = 'a'; p.score.a++; }
  return p;
}
const all3 = () => G.free(G.start(3)).map(e => G.lineName(3, e));
const without = open => all3().filter(s => !open.includes(s));
// Boxes are named by their top left dot: box A1 has the corners A1, B1, A2, B2

test('computer: every level takes a box; medium avoids giving one away; hard opens a two-chain in the middle', () => {
  let p = position(3, ['A1-B1', 'A1-A2', 'A2-B2']);
  for (const lvl of ['easy', 'medium', 'hard']) for (let i = 0; i < 10; i++) expect(G.lineName(3, G.cpuMove(p, lvl))).toBe('B1-B2');
  p = position(3, ['A1-B1', 'A1-A2']);
  for (let i = 0; i < 30; i++) expect(G.safe(p, G.cpuMove(p, 'medium'))).toBe(true);
  // Only boxes A3 and B3 open, a chain from the left edge to the bottom edge
  p = position(3, without(['A3-A4', 'B3-B4', 'B4-C4']));
  expect(G.components(p).map(c => [c.loop, c.boxes.length])).toEqual([[false, 2]]);
  // The line between them: two single boxes, the opponent can't keep control with a double deal
  for (let i = 0; i < 10; i++) expect(G.lineName(3, G.cpuMove(p, 'hard'))).toBe('B3-B4');
});

test('computer: hard keeps control with a double deal before a long chain', () => {
  // The opponent just opened the chain A1–B1 at B1 (B1 has three sides). Below it a chain of six
  // boxes winds from C1 down to C3, left to A3 and up to A2 (B2 is taken). Taking both boxes means
  // opening the six-chain: 2 − 6 = −4. Leaving them as a double deal: −2 + 6 = +4.
  const p = position(3, without(['A1-A2', 'B1-B2', 'C1-D1', 'C2-D2', 'C3-D3', 'C3-C4', 'B3-B4', 'A3-B3', 'A2-A3']));
  const g = G.greedy(p);
  expect(g.count).toBe(2);
  expect(G.components(g.pos).map(c => [c.loop, c.boxes.length])).toEqual([[false, 6]]);
  // The deal: the far end of the chain (A1-A2) – no box closed, both stay for the opponent
  for (let i = 0; i < 5; i++) expect(G.lineName(3, G.cpuMove(p, 'hard'))).toBe('A1-A2');
  expect(G.closes(p, lineOf(3, 'A1-A2'))).toBe(false);
  // Medium simply takes
  expect(G.closes(p, G.cpuMove(p, 'medium'))).toBe(true);
  // Values of chain/loop endgames for the player who has to open (worked out by hand)
  expect(G.openValue(['c6'])).toBe(-6);
  expect(G.openValue(['c3', 'c3'])).toBe(-2);
  expect(G.openValue(['c1', 'c6'])).toBe(5);
  expect(G.openValue(['l4', 'l4'])).toBe(0);
});

// ---------- In the browser ----------
const edge = (page, name) => page.locator(`#board .edge[data-line="${name}"]`);
async function draw(page, names) { for (const s of names) await edge(page, s).click(); }
const owners = page => page.locator('#board rect.bx').evaluateAll(els => els.map(e => e.dataset.owner));

test('two players: closing a box scores and moves again, the round ends, the start alternates', async ({ page }) => {
  await page.goto('/dots-and-boxes/');
  await expect(page.locator('#board .edge')).toHaveCount(40); // 4×4 boxes
  await expect(page.locator('#status')).toHaveText('Spieler 1 ist dran');
  await expect(page.locator('#btnNext')).toBeHidden();
  await draw(page, ['A1-B1', 'A1-A2', 'B1-B2']);
  await expect(page.locator('#status')).toHaveText('Spieler 2 ist dran');
  await expect(edge(page, 'A1-B1')).toBeDisabled();
  await expect(edge(page, 'A1-B1')).toHaveAccessibleName('Linie A1–B1, gezogen');
  await expect(edge(page, 'A2-B2')).toHaveAccessibleName('Linie A2–B2');
  await edge(page, 'A2-B2').click(); // player 2 closes the top left box
  await expect(page.locator('#ptsB')).toHaveText('1');
  expect((await owners(page))[0]).toBe('b');
  await expect(page.locator('#status')).toHaveText('Spieler 2 ist nochmal dran');
  await expect(page.locator('#pB')).toHaveClass(/turn/);
  // The rest of the board: every free line in order
  while (await page.locator('#status').getAttribute('data-state') !== 'over') await page.locator('#board .edge:not(:disabled)').first().click();
  const own = await owners(page);
  const a = own.filter(o => o === 'a').length, b = own.filter(o => o === 'b').length;
  expect(a + b).toBe(16);
  await expect(page.locator('#ptsA')).toHaveText(String(a));
  await expect(page.locator('#ptsB')).toHaveText(String(b));
  const winner = a > b ? 'a' : b > a ? 'b' : 'draw';
  await expect(page.locator('#board')).toHaveAttribute('data-result', winner);
  await expect(page.locator('#ptsR')).toHaveText(winner === 'a' ? '1 : 0' : winner === 'b' ? '0 : 1' : '0 : 0');
  await expect(page.locator('#status')).toHaveText(winner === 'draw' ? `Unentschieden ${a} : ${b}`
    : winner === 'a' ? `Spieler 1 gewinnt ${a} : ${b}!` : `Spieler 2 gewinnt ${b} : ${a}!`);
  await expect(page.locator('#board .edge:not(:disabled)')).toHaveCount(0);
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await page.click('#btnNext');
  await expect(page.locator('#board .edge:disabled')).toHaveCount(0);
  await expect(page.locator('#status')).toHaveText('Spieler 2 ist dran');
});

test('a tap between two dots draws the nearest line', async ({ page }) => {
  await page.goto('/dots-and-boxes/');
  const box = await page.locator('#board').boundingBox();
  const u = box.width / 5; // 4 boxes + half a box margin on each side
  // Just below the middle of the top edge of box A1: line A1-B1; left of the centre of B2: line B2-B3
  await page.mouse.click(box.x + u * 1, box.y + u * 0.5 + u * 0.15);
  await page.mouse.click(box.x + u * 1.5 + u * 0.15, box.y + u * 2);
  const drawn = await page.locator('#board .edge:disabled').evaluateAll(els => els.map(e => e.dataset.line));
  expect(drawn.sort()).toEqual(['A1-B1', 'B2-B3']);
});

test('undo takes back the last line; the round survives a reload', async ({ page }) => {
  await page.goto('/dots-and-boxes/');
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await draw(page, ['A1-B1', 'A1-A2', 'C3-C4']);
  await page.click('#btnUndo');
  await expect(edge(page, 'C3-C4')).toBeEnabled();
  await expect(page.locator('#status')).toHaveText('Spieler 1 ist dran');
  await page.reload();
  await expect(edge(page, 'A1-B1')).toBeDisabled();
  await expect(edge(page, 'A1-A2')).toBeDisabled();
  await expect(page.locator('#status')).toHaveText('Spieler 1 ist dran');
  const saved = JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS));
  expect(saved.moves).toEqual([lineOf(4, 'A1-B1'), lineOf(4, 'A1-A2')]);
});

test('settings: names, board size (from the next round once lines are drawn), the computer answers, undo removes its turn', async ({ page }) => {
  await page.goto('/dots-and-boxes/');
  await openMenu(page);
  await expect(page.locator('#levelBox')).toBeHidden();
  await page.fill('#inA', 'Anna');
  await page.fill('#inB', 'Ben');
  await page.click('#sizes [data-s="3"]');
  await closeMenu(page);
  await expect(page.locator('#board .edge')).toHaveCount(24);
  await expect(page.locator('#status')).toHaveText('Anna ist dran');
  await expect(page.locator('#nameB')).toHaveText('Ben');
  await edge(page, 'A1-B1').click();
  await openMenu(page);
  await page.click('#sizes [data-s="5"]');
  await expect(page.locator('#sizeInfo')).toBeVisible();
  await page.click('#opp [data-o="cpu"]');
  await expect(page.locator('#levelBox')).toBeVisible();
  await expect(page.locator('#fieldB')).toBeHidden();
  await page.click('#levels [data-l="hard"]');
  await closeMenu(page);
  // New opponent: new round in the new size, new score
  await expect(page.locator('#board .edge')).toHaveCount(60);
  await expect(page.locator('#board .edge:disabled')).toHaveCount(0);
  await expect(page.locator('#nameB')).toHaveText('Computer');
  await edge(page, 'C3-D3').click();
  await expect(page.locator('#status')).toHaveText('Anna ist dran');
  await expect(page.locator('#board .edge:disabled')).toHaveCount(2);
  await expect(page.locator('#board line.ln.last.pb')).toHaveCount(1);
  await page.click('#btnUndo');
  await expect(page.locator('#board .edge:disabled')).toHaveCount(0);
});

test('against the computer: it takes the boxes it is given and plays its whole turn', async ({ page }) => {
  // 3×3, five lines drawn (a, b, a, b, a): boxes A1 and B1 each miss only their bottom side
  const moves = ['A1-B1', 'B1-C1', 'A1-A2', 'C1-C2', 'B1-B2'].map(s => lineOf(3, s));
  await page.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [LS, { n: 3, size: 3, moves, opp: 'cpu', level: 'medium' }]);
  await page.goto('/dots-and-boxes/');
  // The computer takes both, then draws one more line and it's the player's turn again
  await expect(page.locator('#status')).toHaveText('Spieler 1 ist dran');
  expect(await owners(page)).toEqual(['b', 'b', '', '', '', '', '', '', '']);
  await expect(page.locator('#ptsB')).toHaveText('2');
  await expect(page.locator('#board line.ln.last.pb')).toHaveCount(3);
  await expect(page.locator('#board .edge:disabled')).toHaveCount(8);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts', async ({ page }) => {
    await page.goto('/dots-and-boxes/');
    await expect(page.locator('h1')).toHaveText('Dots and Boxes');
    await expect(page.locator('#status')).toHaveText('Player 1’s turn');
    await draw(page, ['A1-B1', 'A1-A2', 'B1-B2', 'A2-B2']);
    await expect(page.locator('#status')).toHaveText('Player 2 moves again');
    await expect(edge(page, 'A1-B1')).toHaveAccessibleName('Line A1–B1, drawn');
  });
});
