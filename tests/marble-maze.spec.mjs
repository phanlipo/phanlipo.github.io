// Murmel-Labyrinth: every level is checked with an own search over its walls (border closed, a way from start to goal
// around all holes, holes never on or next to the start), levels are the same every time and grow; the physics against
// values computed here (tilt → acceleration, bounce off a wall, drawn into a hole and back to the start, resting
// marble stays put); the tilt maths (flat, sideways, rotated screen, held at an angle as reference); a steering player
// rolls through all 30 levels without passing through a wall. In the page: tilt events move the marble the right way,
// re-levelling, missing sensor, finger drag, the board turned in landscape, a level played to the goal with sensor
// events (best time, next level unlocked, survives a reload), falling into a hole, pause, deleting progress, English.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openMenu, onDialog, switchLang } from './helpers.mjs';

const E = (() => { const c = {}; vm.runInNewContext(readFileSync('marble-maze/engine.js', 'utf8'), { self: c, Math }); return c.MarbleEngine; })();
const { CELL, BALL_R, WALL_R, DT, GRAVITY, DAMP, BOUNCE, FALL_TIME } = E;
const LS = 'marble-maze.settings.v1';

// Own reading of the walls: which neighbour cells are open (not the engine's neighbours())
function open(L, i) {
  const x = i % L.cols, y = Math.floor(i / L.cols), out = [];
  if (x + 1 < L.cols && !L.e[i]) out.push(i + 1);
  if (x > 0 && !L.e[i - 1]) out.push(i - 1);
  if (y + 1 < L.rows && !L.s[i]) out.push(i + L.cols);
  if (y > 0 && !L.s[i - L.cols]) out.push(i - L.cols);
  return out;
}
function bfs(L, from, blocked = new Set()) {
  const prev = new Map([[from, -1]]), q = [from];
  for (let k = 0; k < q.length; k++) for (const j of open(L, q[k])) if (!prev.has(j) && !blocked.has(j)) { prev.set(j, q[k]); q.push(j); }
  return prev;
}
const pathTo = (L, to, blocked) => {
  const prev = bfs(L, L.start, blocked);
  if (!prev.has(to)) return null;
  const p = []; for (let i = to; i >= 0; i = prev.get(i)) p.unshift(i);
  return p;
};
const centre = (L, i) => ({ x: (i % L.cols + 0.5) * CELL, y: (Math.floor(i / L.cols) + 0.5) * CELL });
// Steering along a list of cells: aim at the next cell centre, brake with the speed
function steer(g, path) {
  let i = 0;
  return () => {
    const c = centre(g.level, path[Math.min(i + 1, path.length - 1)]);
    if (Math.hypot(c.x - g.x, c.y - g.y) < 3 && i < path.length - 1) i++;
    const cl = v => Math.max(-0.5, Math.min(0.5, v));
    return [cl(0.04 * (c.x - g.x) - 0.02 * g.vx), cl(0.04 * (c.y - g.y) - 0.02 * g.vy)];
  };
}
// Distance from the marble centre to the nearest wall line (walls are capsules of radius WALL_R)
function wallGap(L, x, y) {
  let m = Infinity;
  for (const s of L.segs) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, t = Math.max(0, Math.min(1, ((x - s.x0) * dx + (y - s.y0) * dy) / (dx * dx + dy * dy)));
    m = Math.min(m, Math.hypot(x - s.x0 - t * dx, y - s.y0 - t * dy));
  }
  return m;
}

test.describe('engine', () => {
  test('every level: closed border, a way around all holes, holes not at the start or goal; the same every time, growing', () => {
    let prevCells = 0;
    for (let n = 1; n <= E.LEVELS; n++) {
      const L = E.createLevel(n);
      expect(JSON.stringify(E.createLevel(n)), `level ${n} same again`).toBe(JSON.stringify(L));
      const cells = L.cols * L.rows;
      expect(cells, `level ${n}`).toBeGreaterThanOrEqual(prevCells);
      prevCells = cells;
      expect(L.cols).toBe(Math.min(12, 5 + Math.floor((n - 1) / 3)));
      // Border: the engine's wall segments cover the four sides completely
      const len = (pred) => L.segs.filter(pred).reduce((a, s) => a + Math.hypot(s.x1 - s.x0, s.y1 - s.y0), 0);
      expect(len(s => s.y0 === 0 && s.y1 === 0)).toBe(L.w);
      expect(len(s => s.y0 === L.h && s.y1 === L.h)).toBe(L.h ? L.w : 0);
      expect(len(s => s.x0 === 0 && s.x1 === 0)).toBe(L.h);
      expect(len(s => s.x0 === L.w && s.x1 === L.w)).toBe(L.h);
      // Every inner wall flag appears as a segment piece and vice versa: total inner length matches
      const inner = L.e.filter((w, i) => w && i % L.cols < L.cols - 1).length + L.s.filter((w, i) => w && i < cells - L.cols).length;
      expect(L.segs.reduce((a, s) => a + Math.hypot(s.x1 - s.x0, s.y1 - s.y0), 0)).toBe((inner + 2 * L.cols + 2 * L.rows) * CELL);
      // All cells reachable without holes; with holes still a way to the goal
      expect(bfs(L, L.start).size, `level ${n} connected`).toBe(cells);
      const holes = new Set(L.holes.map(h => h.cell));
      expect(pathTo(L, L.goal, holes), `level ${n} solvable`).not.toBeNull();
      expect(E.solve(L).length).toBe(pathTo(L, L.goal, holes).length);
      for (const c of [L.start, L.goal, ...open(L, L.start)]) expect(holes.has(c), `level ${n} cell ${c}`).toBe(false);
      for (const h of L.holes) expect(h).toMatchObject(centre(L, h.cell));
      expect(L.holes.length).toBe(n < 3 ? 0 : Math.min(E.holeCount(n, cells), L.holes.length));
      // The goal is a farthest cell from the start (in steps without holes)
      const steps = c => pathTo(L, c).length;
      expect(steps(L.goal)).toBe(Math.max(...Array.from({ length: cells }, (_, i) => steps(i))));
    }
    expect(E.createLevel(1).holes).toHaveLength(0);
    expect(E.createLevel(3).holes.length).toBeGreaterThan(0);
    expect(E.createLevel(30).holes.length).toBeGreaterThan(E.createLevel(10).holes.length);
  });

  test('tilt accelerates by g · sine, damped by rolling friction; a resting marble on a flat board stays put', () => {
    const g = E.createGame(1);
    const x0 = g.x;
    E.step(g, 0.25, 0);
    expect(g.vx).toBeCloseTo(GRAVITY * 0.25 * DT * Math.exp(-DAMP * DT), 9);
    expect(g.x).toBeCloseTo(x0 + g.vx * DT, 9);
    // Over a short time v = a/k · (1 − e^(−k t)) (stepwise: almost)
    const h = E.createGame(1), n = 48;
    for (let k = 0; k < n; k++) E.step(h, 0.25, 0);
    const f = Math.exp(-DAMP * DT), a = GRAVITY * 0.25 * DT;
    expect(h.vx).toBeCloseTo(a * f * (1 - f ** n) / (1 - f), 9);
    // Tilt larger than 1 is cut to 1
    const big = E.createGame(1); E.step(big, 3, 4);
    expect(Math.hypot(big.vx, big.vy)).toBeCloseTo(GRAVITY * DT * Math.exp(-DAMP * DT), 9);
    // Very slight tilt (below about 2°) does not start the marble
    const r = E.createGame(1); for (let k = 0; k < 240; k++) E.step(r, 0.02, 0.01);
    expect([r.x, r.y, r.vx, r.vy]).toEqual([centre(r.level, 0).x, centre(r.level, 0).y, 0, 0]);
  });

  test('into a wall: pushed out to touch it, the normal speed comes back times the bounce, a hit event', () => {
    const g = E.createGame(1);
    Object.assign(g, { x: BALL_R + WALL_R + 0.3, y: 6, vx: -100, vy: 20 });
    const ev = E.step(g, 0, 0);
    expect(ev).toContain('hit');
    const vx = -100 * Math.exp(-DAMP * DT), vy = 20 * Math.exp(-DAMP * DT);
    expect(g.x).toBeCloseTo(BALL_R + WALL_R, 9);
    expect(g.vx).toBeCloseTo(-vx * BOUNCE, 9);
    expect(g.vy).toBeCloseTo(vy, 9);
    expect(g.hitV).toBeCloseTo(-vx, 9);
    // A soft touch is no hit
    Object.assign(g, { x: BALL_R + WALL_R + 0.05, vx: -10, vy: 0 });
    expect(E.step(g, 0, 0)).not.toContain('hit');
  });

  test('on the rim of a hole the marble is drawn in, falls and comes back to the start after the drop', () => {
    const L = E.createLevel(5), h = L.holes[0], g = E.createGame(L);
    Object.assign(g, { x: h.x + E.HOLE_R + BALL_R * 0.3, y: h.y, vx: 0, vy: 0 });
    let ev = [];
    for (let k = 0; k < 240 && !ev.includes('fall'); k++) ev = ev.concat(E.step(g, 0, 0));
    expect(ev).toContain('fall');
    expect(g).toMatchObject({ phase: 'falling', falls: 1 });
    expect(g.hole).toEqual(h);
    ev = [];
    for (let k = 0; k < Math.round(FALL_TIME / DT) + 1; k++) ev = ev.concat(E.step(g, 1, 0));
    expect(ev).toEqual(['respawn']);
    expect(g).toMatchObject({ phase: 'play', ...centre(L, L.start), vx: 0, vy: 0, falls: 1 });
    // The pull grows linearly towards the centre: PULL · (1 − d / (HOLE_R + BALL_R / 2)), zero beyond
    // (measured from the open side of a hole, along the passage)
    const range = E.HOLE_R + BALL_R / 2, nb = centre(L, open(L, h.cell)[0]), ux = Math.sign(nb.x - h.x), uy = Math.sign(nb.y - h.y);
    for (const d of [4, range + 0.5]) {
      const one = E.createGame(L);
      Object.assign(one, { x: h.x + ux * d, y: h.y + uy * d, vx: 0, vy: 0 });
      E.step(one, 0, 0);
      const v = Math.max(0, E.PULL * (1 - d / range)) * DT * Math.exp(-DAMP * DT);
      expect(one.vx).toBeCloseTo(-ux * v, 9);
      expect(one.vy).toBeCloseTo(-uy * v, 9);
    }
  });

  test('a steering player rolls through all 30 levels into the goal without falling or touching through a wall', () => {
    for (let n = 1; n <= E.LEVELS; n++) {
      const L = E.createLevel(n), g = E.createGame(L), drive = steer(g, pathTo(L, L.goal, new Set(L.holes.map(h => h.cell))));
      const ev = [];
      let minGap = Infinity, outside = 0;
      for (let k = 0; k < 120 / DT && g.phase !== 'won'; k++) {
        ev.push(...E.step(g, ...drive()));
        if (k % 4 === 0) minGap = Math.min(minGap, wallGap(L, g.x, g.y));
        if (!(g.x > 0 && g.x < L.w && g.y > 0 && g.y < L.h)) outside++;
      }
      expect(outside, `level ${n} inside`).toBe(0);
      expect(g.phase, `level ${n}`).toBe('won');
      expect(ev, `level ${n}`).not.toContain('fall');
      expect(ev.filter(e => e === 'goal')).toHaveLength(1);
      expect(minGap, `level ${n}`).toBeGreaterThan(BALL_R + WALL_R - 1e-6);
      expect(E.step(g, 1, 1)).toEqual([]);   // after the goal nothing moves
    }
  });

  test('tilt maths: flat, sideways, forwards, rotated screen, held at an angle as reference', () => {
    const near = (t, x, y) => { expect(t.x).toBeCloseTo(x, 9); expect(t.y).toBeCloseTo(y, 9); };
    const s = d => Math.sin(d * Math.PI / 180), c = d => Math.cos(d * Math.PI / 180);
    near(E.tilt(E.down(0, 0)), 0, 0);
    near(E.tilt(E.down(0, 30)), 0.5, 0);           // right edge down: rolls right
    near(E.tilt(E.down(30, 0)), 0, 0.5);           // top edge up: rolls down the screen
    near(E.tilt(E.down(-20, -10)), -s(10) * c(20), -s(20));
    // Screen turned by 90° (device counter-clockwise): the device's right edge is the screen's top
    near(E.tilt(E.down(0, 30), 90), 0, -0.5);
    near(E.tilt(E.down(30, 0), 90), 0.5, 0);           // its top edge (raised) is the screen's left
    near(E.tilt(E.down(0, 30), 270), 0, 0.5);
    near(E.tilt(E.down(0, 30), 180), -0.5, 0);
    // Held at 40° towards you as reference: that is level; rolling the phone around its long axis tilts sideways
    const ref = E.down(40, 0);
    near(E.tilt(E.down(40, 0), 0, ref), 0, 0);
    const side = E.tilt(E.down(40, 20), 0, ref);
    expect(side.x).toBeCloseTo(s(20) * c(40), 9);
    expect(Math.abs(side.y)).toBeLessThan(0.05);
    // Tipping further forwards or back from there: up or down the screen by about the angle
    expect(E.tilt(E.down(55, 0), 0, ref).y).toBeCloseTo(s(15), 9);
    expect(E.tilt(E.down(25, 0), 0, ref).y).toBeCloseTo(-s(15), 9);
    // Held upright: the reference is ignored (measured as if flat)
    near(E.tilt(E.down(30, 0), 0, E.down(90, 0)), 0, 0.5);
  });
});

/* ---------- Page ---------- */
const diag = async page => {
  const txt = await page.evaluate(() => Tools.diag.text());
  const get = k => { const m = txt.match(new RegExp(`^${k}: (.*)$`, 'm')); if (!m) return undefined; try { return JSON.parse(m[1]); } catch { return m[1]; } };
  return Object.fromEntries(['phase', 'game', 'level', 'source', 'sensor', 'tilt', 'pos', 'falls', 'ref', 'rotated', 'unlocked'].map(k => [k, get(k)]));
};
// Sensor values as the browser sends them (a few in a row, as the page smooths them)
const orient = (page, beta, gamma, times = 4) => page.evaluate(([b, g, n]) => {
  for (let k = 0; k < n; k++) window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: b, gamma: g }));
}, [beta, gamma, times]);
// A tilt (share of g to the right and down) as beta/gamma of a phone otherwise lying flat
const tiltTo = (page, tx, ty) => { const b = Math.asin(ty), g = Math.asin(tx / Math.cos(b)); return orient(page, b * 180 / Math.PI, g * 180 / Math.PI); };
async function finger(page, type, fx, fy) {
  await page.evaluate(([type, fx, fy]) => {
    const cv = document.getElementById('cv'), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true,
      clientX: r.left + fx, clientY: r.top + fy, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }, [type, fx, fy]);
}
// Steer along cells with sensor events, reading the marble from the diagnostics (started flat: flat = level)
async function drive(page, L, path, until, secs = 60) {
  const pos = { i: 0 };
  await orient(page, 0, 0);
  for (let k = 0; k < secs * 20; k++) {
    const d = await diag(page);
    if (until(d)) return d;
    const [x, y] = d.pos;
    const c = centre(L, path[Math.min(pos.i + 1, path.length - 1)]);
    if (Math.hypot(c.x - x, c.y - y) < 3 && pos.i < path.length - 1) pos.i++;
    const prev = pos.p || [x, y], vx = (x - prev[0]) * 20, vy = (y - prev[1]) * 20;
    pos.p = [x, y];
    const cl = v => Math.max(-0.5, Math.min(0.5, v));
    await tiltTo(page, cl(0.04 * (c.x - x) - 0.02 * vx), cl(0.04 * (c.y - y) - 0.02 * vy));
    await page.clock.runFor(50);
  }
  return diag(page);
}

test.describe('page', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: 0 });
    await page.setViewportSize({ width: 375, height: 740 });
  });
  // Stored settings before the first load only (a reload keeps what the page saved)
  const seed = (page, s) => page.addInitScript(s => { if (!localStorage.getItem('marble-maze.settings.v1')) localStorage.setItem('marble-maze.settings.v1', JSON.stringify(s)); }, s);

  test('start card; tilting the phone rolls the marble that way; the start position counts as level; re-level', async ({ page }) => {
    await seed(page, { control: 'tilt', sound: false });
    await page.goto('/marble-maze/');
    await expect(page.locator('#lvLabel')).toHaveText('Level 1 von 30');
    await expect(page.locator('#lvDesc')).toHaveText('5 × 8 Felder, keine Löcher');
    await expect(page.locator('#btnPrev')).toBeDisabled();
    await expect(page.locator('#btnNext')).toBeDisabled();
    await expect(page.locator('#best')).toHaveText('Noch keine Bestzeit.');
    await page.click('#btnStart');
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('body')).toHaveClass(/playing/);
    await expect(page.locator('#status')).toHaveText('Level 1. Neige das Handy, um die Murmel ins Ziel zu rollen.');
    // Held at 30° towards you when the level starts: that is level, the marble stays
    await orient(page, 30, 0);
    await page.clock.runFor(500);
    let d = await diag(page);
    expect(d).toMatchObject({ sensor: 'data', ref: true, source: 'sensor', tilt: [0, 0], pos: [6, 6] });
    await expect(page.locator('#btnLevel0')).toBeVisible();
    // Rolled to the right around the long axis: the marble rolls right (the first row is open there)
    await orient(page, 30, 15, 8);
    await page.clock.runFor(400);
    d = await diag(page);
    expect(d.tilt[0]).toBeCloseTo(Math.sin(15 * Math.PI / 180) * Math.cos(30 * Math.PI / 180), 1);
    expect(d.pos[0]).toBeGreaterThan(8);
    // Re-level: this position is now level
    await page.click('#btnLevel0');
    await expect(page.locator('#toast')).toHaveText('Ausgerichtet');
    await orient(page, 30, 15);
    await page.clock.runFor(100);
    expect((await diag(page)).tilt).toEqual([0, 0]);
    // Pause: time stands still; resume
    await page.click('#btnPause');
    await expect(page.locator('#panelTitle')).toHaveText('Pause');
    const t0 = await page.locator('#hudTime').textContent();
    await page.clock.runFor(2000);
    await expect(page.locator('#hudTime')).toHaveText(t0);
    await expect(page.locator('#startLabel')).toHaveText('Weiterspielen');
    await page.click('#btnStart');
    await expect(page.locator('#panel')).toBeHidden();
  });

  test('no sensor values: a hint after 1.5 s, the finger steers anyway', async ({ page }) => {
    await seed(page, { control: 'tilt', sound: false });
    await page.goto('/marble-maze/');
    await page.click('#btnStart');
    await page.clock.runFor(2000);
    await expect(page.locator('#toast')).toHaveText('Kein Neigungssensor gefunden – steuere mit dem Finger.');
    expect((await diag(page)).sensor).toBe('missing');
    await finger(page, 'pointerdown', 150, 300);
    await finger(page, 'pointermove', 230, 300);
    await page.clock.runFor(400);
    const d = await diag(page);
    expect(d.source).toBe('finger');
    expect(d.tilt).toEqual([0.45, 0]);
    expect(d.pos[0]).toBeGreaterThan(8);
    await finger(page, 'pointerup', 230, 300);
    await page.click('#btnPause');
    await expect(page.locator('#sensorText')).toHaveText('Kein Neigungssensor gefunden – steuere mit dem Finger.');
  });

  test('finger control: dragging is a tilt by the drag distance; in landscape the board is turned', async ({ page }) => {
    await seed(page, { control: 'touch', sound: false, fullscreen: false });   // the window size changes below
    await page.goto('/marble-maze/');
    await expect(page.locator('#panelText')).toHaveText('Auf das Labyrinth tippen und den Finger in die Richtung ziehen, in die die Murmel rollen soll.');
    await page.click('#btnStart');
    await finger(page, 'pointerdown', 150, 300);
    await finger(page, 'pointermove', 178, 300);
    await page.clock.runFor(100);
    expect((await diag(page)).tilt).toEqual([0.23, 0]);   // half way (28 of 56 px): half of 0.45
    await finger(page, 'pointerup', 178, 300);
    await page.clock.runFor(100);
    expect((await diag(page)).source).toBe('-');
    // Landscape: the board's x runs up the screen – dragging up rolls the marble along the first row
    await page.click('#btnPause');
    await page.setViewportSize({ width: 740, height: 375 });
    await page.click('#btnStart');
    await page.clock.runFor(100);
    const before = (await diag(page)).pos;
    await finger(page, 'pointerdown', 370, 250);
    await finger(page, 'pointermove', 370, 190);
    await page.clock.runFor(400);
    const d = await diag(page);
    expect(d.rotated).toBe(true);
    expect(d.tilt).toEqual([0.45, 0]);
    expect(d.pos[0]).toBeGreaterThan(before[0] + 2);
  });

  test('a level played to the goal: best time, next level unlocked and started; it survives a reload', async ({ page }) => {
    await seed(page, { control: 'tilt', sound: false });
    await page.goto('/marble-maze/');
    await page.click('#btnStart');
    const L = E.createLevel(1);
    const d = await drive(page, L, pathTo(L, L.goal), d => d.game === 'won');
    expect(d).toMatchObject({ phase: 'won', falls: 0, unlocked: 2 });
    await expect(page.locator('#panelTitle')).toHaveText('Geschafft!');
    const time = (await page.locator('#panelTime').textContent()).trim();
    expect(time).toMatch(/^\d+,\d s$/);
    await expect(page.locator('#best')).toHaveText(`Bestzeit: ${time}`);
    await expect(page.locator('#lvDesc')).toHaveText('5 × 8 Felder, keine Löcher · 0× ins Loch');
    await expect(page.locator('#startLabel')).toHaveText('Nächstes Level');
    await expect(page.locator('#status')).toHaveText(`Geschafft in ${time}.`);
    const stored = JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS));
    expect(stored).toMatchObject({ done: 1 });
    expect(stored.best['1']).toBeCloseTo(Number(time.replace(',', '.').replace(' s', '')), 0);
    await page.click('#btnStart');
    await expect(page.locator('#hudLevel')).toHaveText('Level 2');
    await page.reload();
    await expect(page.locator('#lvLabel')).toHaveText('Level 2 von 30');
    await expect(page.locator('#btnNext')).toBeDisabled();
    await page.click('#btnPrev');
    await expect(page.locator('#lvLabel')).toHaveText('Level 1 von 30');
    await expect(page.locator('#best')).toHaveText(`Bestzeit: ${time}`);
  });

  test('rolling into a hole: counted, said, and back on the start', async ({ page }) => {
    await seed(page, { control: 'tilt', sound: false, done: 2, level: 3 });
    await page.goto('/marble-maze/');
    await expect(page.locator('#lvDesc')).toHaveText('5 × 8 Felder, 1 Loch');
    await page.click('#btnStart');
    const L = E.createLevel(3), hole = L.holes[0];
    await drive(page, L, pathTo(L, hole.cell), d => d.falls > 0, 30);
    await expect(page.locator('#hudFalls')).toHaveText('1× ins Loch');
    await expect(page.locator('#status')).toHaveText('Ins Loch gefallen. Zurück zum Start.');
    await tiltTo(page, 0, 0);
    await page.clock.runFor(1000);
    expect((await diag(page))).toMatchObject({ game: 'play', pos: [6, 6], falls: 1 });
  });

  test('new game asks during a level; deleting best times and progress asks first', async ({ page }) => {
    await seed(page, { control: 'touch', sound: false, done: 4, level: 5, best: { 1: 9.5, 4: 30 } });
    await page.goto('/marble-maze/');
    await expect(page.locator('#lvLabel')).toHaveText('Level 5 von 30');
    await page.click('#btnStart');
    await page.clock.runFor(300);
    await onDialog(page, d => d.dismiss(), { once: true });
    await page.click('#btnPause');
    await page.click('#btnNew');
    await expect(page.locator('#panelTitle')).toHaveText('Pause');
    await onDialog(page, d => d.accept(), { once: true });
    await page.click('#btnNew');
    await expect(page.locator('#lvLabel')).toHaveText('Level 5 von 30');
    await page.click('#btnPrev');
    await expect(page.locator('#best')).toHaveText('Bestzeit: 30,0 s');
    await onDialog(page, d => d.accept(), { once: true });
    await openMenu(page);
    await page.click('#btnClearBest');
    await expect(page.locator('#lvLabel')).toHaveText('Level 1 von 30');
    await expect(page.locator('#best')).toHaveText('Noch keine Bestzeit.');
    expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS))).toMatchObject({ done: 0, level: 1, best: {} });
  });

  test('English', async ({ page }) => {
    await seed(page, { control: 'tilt', sound: false, done: 3, level: 4 });
    await page.goto('/marble-maze/');
    await switchLang(page, 'en');
    await expect(page.locator('#lvLabel')).toHaveText('Level 4 of 30');
    await expect(page.locator('#lvDesc')).toHaveText('6 × 10 cells, 2 holes');
    await expect(page.locator('#panelText')).toHaveText('Hold the phone however is comfortable, tap “Play” and tilt – the marble has to reach the green goal.');
    await expect(page.locator('#startLabel')).toHaveText('Play');
    await expect(page.locator('#hudFalls')).toHaveText('0× into a hole');
  });
});
