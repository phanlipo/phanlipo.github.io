/* Murmel-Labyrinth – levels, physics and tilt maths without DOM, window.MarbleEngine. The page (app.js) and the
   tests use the same code. Architecture: marble-maze/README.md

   Units: one maze cell is CELL × CELL units, x to the right, y down (as on the screen); time in seconds.
   The page calls step() with the fixed time step DT, so the marble rolls the same on every device and in the tests.
   Levels are generated from a fixed seed per level number: level 7 looks the same on every device, always. */
(function (root) {
  'use strict';
  const CELL = 12;             // cell size; walls lie on the cell borders
  const WALL_R = 1;            // walls are capsules (segment + radius): corridors are CELL − 2·WALL_R = 10 wide
  const BALL_R = 3.2;
  const HOLE_R = 3.9;          // drawn radius; the marble drops in once its centre is within FALL_R
  const FALL_R = 3.1;          // > the room left beside a hole (corridor 10 − ball 6.4 → centre ±1.8): no way past it
  const GOAL_R = 4.2, GOAL_IN = 2.2;
  const PULL = 240;            // units/s² towards a hole or the goal when the marble is on its rim
  const DT = 1 / 240;          // at top speed the marble moves 0.75 units per step: never through a wall
  const GRAVITY = 320;         // acceleration at a tilt of 90° (sin 1); at 15° about 83 units/s²
  const MAX_V = 180;
  const DAMP = 0.55;           // rolling friction: v · e^(−DAMP·t)
  const BOUNCE = 0.35;         // share of the speed into a wall that comes back
  const STICK_A = 10, STICK_V = 3;   // below this tilt (about 2°) a resting marble stays put
  const FALL_TIME = 0.6;       // drop animation before the marble is back on the start
  const HIT_V = 45;            // from this speed into a wall: event 'hit'
  const LEVELS = 30;

  /* ---------- Levels ---------- */
  // Small seeded random generator (mulberry32): the same numbers for a level on every device
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Grid size: 5 × 8 at level 1, one column more every 3 levels, up to 12 × 19 (portrait like a phone)
  function size(n) { const cols = Math.min(12, 5 + Math.floor((n - 1) / 3)); return { cols, rows: Math.round(cols * 1.6) }; }
  // Holes: none on levels 1–2, then more with every level, at most 18 % of the cells
  const holeCount = (n, cells) => n < 3 ? 0 : Math.min(Math.round(cells * 0.18), Math.floor((n - 2) * 1.4));
  // Extra openings (loops) from level 4: more than one way, so holes can sit beside the way
  const loopCount = (n, cells) => n < 4 ? 0 : Math.round(cells * Math.min(0.1, 0.012 * (n - 3)));

  // Open neighbours of a cell: [index, …]. wall.e[i] / wall.s[i]: wall on the east / south side of cell i
  function neighbours(L, i) {
    const { cols, rows, e, s } = L, x = i % cols, y = (i - x) / cols, out = [];
    if (x < cols - 1 && !e[i]) out.push(i + 1);
    if (x > 0 && !e[i - 1]) out.push(i - 1);
    if (y < rows - 1 && !s[i]) out.push(i + cols);
    if (y > 0 && !s[i - cols]) out.push(i - cols);
    return out;
  }
  // Breadth-first search: distances from a cell (−1 = not reachable), avoiding blocked cells
  function distances(L, from, blocked) {
    const d = new Array(L.cols * L.rows).fill(-1), q = [from];
    d[from] = 0;
    for (let k = 0; k < q.length; k++) for (const j of neighbours(L, q[k])) {
      if (d[j] < 0 && !(blocked && blocked.has(j))) { d[j] = d[q[k]] + 1; q.push(j); }
    }
    return d;
  }
  // The shortest way from start to goal around all holes, as cell indices (null if there is none)
  function solve(L) {
    const blocked = new Set(L.holes.map(h => h.cell)), d = distances(L, L.goal, blocked);
    if (d[L.start] < 0) return null;
    const path = [L.start];
    for (let i = L.start; i !== L.goal;) { i = neighbours(L, i).find(j => d[j] === d[i] - 1 && !blocked.has(j)); path.push(i); }
    return path;
  }

  function createLevel(n) {
    n = Math.max(1, Math.min(LEVELS, Math.floor(n) || 1));
    const rand = rng(n * 7919 + 104729), { cols, rows } = size(n), cells = cols * rows;
    const L = { n, cols, rows, w: cols * CELL, h: rows * CELL, e: new Array(cells).fill(true), s: new Array(cells).fill(true), holes: [] };
    // Perfect maze: depth-first search with backtracking from a random cell
    const seen = new Array(cells).fill(false), stack = [Math.floor(rand() * cells)];
    seen[stack[0]] = true;
    while (stack.length) {
      const i = stack[stack.length - 1], x = i % cols, y = (i - x) / cols, opts = [];
      if (x < cols - 1 && !seen[i + 1]) opts.push(i + 1);
      if (x > 0 && !seen[i - 1]) opts.push(i - 1);
      if (y < rows - 1 && !seen[i + cols]) opts.push(i + cols);
      if (y > 0 && !seen[i - cols]) opts.push(i - cols);
      if (!opts.length) { stack.pop(); continue; }
      const j = opts[Math.floor(rand() * opts.length)];
      if (j === i + 1) L.e[i] = false; else if (j === i - 1) L.e[j] = false; else if (j === i + cols) L.s[i] = false; else L.s[j] = false;
      seen[j] = true; stack.push(j);
    }
    // Loops: remove some inner walls
    for (let k = loopCount(n, cells), tries = 0; k > 0 && tries < 1000; tries++) {
      const i = Math.floor(rand() * cells), x = i % cols, y = (i - x) / cols;
      if (rand() < 0.5) { if (x < cols - 1 && L.e[i]) { L.e[i] = false; k--; } } else if (y < rows - 1 && L.s[i]) { L.s[i] = false; k--; }
    }
    // Start in the top left corner, goal in the cell farthest away from it
    L.start = 0;
    const d0 = distances(L, 0);
    L.goal = d0.reduce((best, v, i) => v > d0[best] ? i : best, 0);
    // Holes: random cells, never on the start, next to it or on the goal; each must leave a way around all holes
    const order = Array.from({ length: cells }, (_, i) => i);
    for (let i = cells - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const keep = new Set([L.start, L.goal, ...neighbours(L, L.start)]), blocked = new Set();
    for (const i of order) {
      if (blocked.size >= holeCount(n, cells)) break;
      if (keep.has(i)) continue;
      blocked.add(i);
      if (distances(L, L.start, blocked)[L.goal] < 0) blocked.delete(i);
    }
    L.holes = [...blocked].sort((a, b) => a - b).map(cell => ({ cell, ...centre(L, cell) }));
    L.segs = segments(L);
    L.path = solve(L);
    return L;
  }
  function centre(L, i) { const x = i % L.cols; return { x: (x + 0.5) * CELL, y: ((i - x) / L.cols + 0.5) * CELL }; }

  // Walls as few long segments: runs of walls on the same border line are merged
  function segments(L) {
    const { cols, rows, e, s } = L, out = [];
    const run = (on, n, make) => { for (let k = 0, a = -1; k <= n; k++) { if (k < n && on(k)) { if (a < 0) a = k; } else if (a >= 0) { out.push(make(a, k)); a = -1; } } };
    for (let y = 0; y <= rows; y++) {   // horizontal lines y·CELL: top border, south walls, bottom border
      run(x => y === 0 || y === rows || s[(y - 1) * cols + x], cols, (a, b) => ({ x0: a * CELL, y0: y * CELL, x1: b * CELL, y1: y * CELL }));
    }
    for (let x = 0; x <= cols; x++) {   // vertical lines x·CELL
      run(y => x === 0 || x === cols || e[y * cols + x - 1], rows, (a, b) => ({ x0: x * CELL, y0: a * CELL, x1: x * CELL, y1: b * CELL }));
    }
    return out;
  }

  /* ---------- Game ---------- */
  function createGame(n) {
    const L = typeof n === 'object' ? n : createLevel(n), s = centre(L, L.start);
    return { level: L, x: s.x, y: s.y, vx: 0, vy: 0, phase: 'play', time: 0, falls: 0, fallT: 0, hole: null };
  }
  function resetBall(g) { const s = centre(g.level, g.level.start); Object.assign(g, { x: s.x, y: s.y, vx: 0, vy: 0, phase: 'play', fallT: 0, hole: null }); }

  function closest(px, py, s) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - s.x0) * dx + (py - s.y0) * dy) / l2)) : 0;
    return { x: s.x0 + t * dx, y: s.y0 + t * dy };
  }

  // One time step. tx, ty: tilt of the board in screen directions (sine of the angle, |t| ≤ 1). Returns the events
  // of this step: 'hit' (into a wall, with g.hitV), 'fall' (into a hole), 'respawn' (back on the start), 'goal'.
  function step(g, tx = 0, ty = 0) {
    const ev = [], L = g.level;
    if (g.phase === 'won') return ev;
    g.time += DT;
    if (g.phase === 'falling') {
      g.fallT += DT;
      g.x += (g.hole.x - g.x) * 0.25; g.y += (g.hole.y - g.y) * 0.25;
      if (g.fallT >= FALL_TIME) { resetBall(g); ev.push('respawn'); }
      return ev;
    }
    const m = Math.hypot(tx, ty);
    if (m > 1) { tx /= m; ty /= m; }
    let ax = GRAVITY * tx, ay = GRAVITY * ty;
    // On the rim of a hole or the goal the marble is drawn in
    const goal = centre(L, L.goal);
    for (const h of [...L.holes, { ...goal, r: GOAL_R }]) {
      const dx = h.x - g.x, dy = h.y - g.y, d = Math.hypot(dx, dy), range = (h.r || HOLE_R) + BALL_R * 0.5;
      if (d > 1e-6 && d < range) { const k = PULL * (1 - d / range) / d; ax += dx * k; ay += dy * k; }
    }
    if (Math.hypot(g.vx, g.vy) < STICK_V && Math.hypot(ax, ay) < STICK_A) { g.vx = 0; g.vy = 0; }
    else {
      const f = Math.exp(-DAMP * DT);
      g.vx = (g.vx + ax * DT) * f; g.vy = (g.vy + ay * DT) * f;
      const v = Math.hypot(g.vx, g.vy);
      if (v > MAX_V) { g.vx *= MAX_V / v; g.vy *= MAX_V / v; }
      g.x += g.vx * DT; g.y += g.vy * DT;
    }
    // Walls: push out and bounce back (two passes for corners)
    let hit = 0;
    for (let pass = 0; pass < 2; pass++) for (const s of L.segs) {
      if (g.x < Math.min(s.x0, s.x1) - 6 || g.x > Math.max(s.x0, s.x1) + 6 || g.y < Math.min(s.y0, s.y1) - 6 || g.y > Math.max(s.y0, s.y1) + 6) continue;
      const c = closest(g.x, g.y, s), dx = g.x - c.x, dy = g.y - c.y, d = Math.hypot(dx, dy), min = BALL_R + WALL_R;
      if (d >= min || d < 1e-9) continue;
      const nx = dx / d, ny = dy / d;
      g.x = c.x + nx * min; g.y = c.y + ny * min;
      const vn = g.vx * nx + g.vy * ny;
      if (vn < 0) { hit = Math.max(hit, -vn); g.vx -= (1 + BOUNCE) * vn * nx; g.vy -= (1 + BOUNCE) * vn * ny; }
    }
    if (hit >= HIT_V) { g.hitV = hit; ev.push('hit'); }
    if (Math.hypot(goal.x - g.x, goal.y - g.y) < GOAL_IN) {
      g.phase = 'won'; g.x = goal.x; g.y = goal.y; g.vx = 0; g.vy = 0; ev.push('goal'); return ev;
    }
    for (const h of L.holes) if (Math.hypot(h.x - g.x, h.y - g.y) < FALL_R) {
      g.phase = 'falling'; g.hole = h; g.fallT = 0; g.falls++; g.vx = 0; g.vy = 0; ev.push('fall'); break;
    }
    return ev;
  }

  /* ---------- Tilt from the orientation sensor ----------
     deviceorientation gives beta (front/back, top edge up = positive) and gamma (left/right, right edge down =
     positive). down(): the direction of gravity in device coordinates (x right, y towards the top edge, z out of the
     screen). tilt(): its share along the screen directions right and down – the screen content may be rotated
     (angle = screen.orientation.angle, 90 = device turned counter-clockwise). With a reference (gravity when the
     game started) that position counts as level: the screen axes are first turned into the plane across it. */
  const rad = d => d * Math.PI / 180;
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const unit = a => { const l = Math.hypot(a[0], a[1], a[2]); return l ? a.map(v => v / l) : a; };
  function down(beta, gamma) {
    const b = rad(beta), c = rad(gamma);
    return [Math.sin(c) * Math.cos(b), -Math.sin(b), -Math.cos(c) * Math.cos(b)];
  }
  function tilt(d, angle = 0, ref = null) {
    const A = rad(angle);
    let ex = [Math.cos(A), -Math.sin(A), 0], ey = [-Math.sin(A), -Math.cos(A), 0];
    if (ref) {
      const r = unit(ref), px = ex.map((v, i) => v - dot(ex, r) * r[i]), qx = unit(px);
      const py = ey.map((v, i) => v - dot(ey, r) * r[i] - dot(ey, qx) * qx[i]);
      // Held nearly upright along a screen axis the plane is ill-defined: then measure as if lying flat
      if (Math.hypot(...px) > 0.3 && Math.hypot(...py) > 0.3) { ex = qx; ey = unit(py); }
    }
    return { x: dot(d, ex), y: dot(d, ey) };
  }

  root.MarbleEngine = { CELL, WALL_R, BALL_R, HOLE_R, FALL_R, GOAL_R, GOAL_IN, PULL, DT, GRAVITY, MAX_V, DAMP, BOUNCE, FALL_TIME, HIT_V, LEVELS,
    size, holeCount, createLevel, centre, neighbours, solve, createGame, resetBall, step, down, tilt };
})(typeof self !== 'undefined' ? self : globalThis);
