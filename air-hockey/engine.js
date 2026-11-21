/* Airhockey – table, physics and computer player without DOM, window.HockeyEngine. The page (app.js) and the
   tests use the same code. Architecture: air-hockey/README.md

   Units: the table is W × H = 100 × 170 units, x to the right, y down; time in seconds. Player 0 plays from the
   bottom (defends the goal at y = H), player 1 from the top (goal at y = 0). The page always calls step() with
   the fixed time step DT, so the game runs the same on every device and in the tests. */
(function (root) {
  'use strict';
  const W = 100, H = 170;
  const GOAL = 36;            // width of the goal mouth in the short walls
  const CORNER = 16;          // rounded corners: a puck can't get stuck in them
  const PUCK_R = 4.5, MALLET_R = 8;
  const DT = 1 / 120;         // fixed physics step
  const MAX_PUCK = 240;       // units/s – fast, but never further than half a puck radius per step
  const MALLET_SPEED = 420;   // units/s a mallet follows the finger at most (no teleporting)
  const WALL_E = 0.9;         // bounce off the cushions (share of the speed kept)
  const HIT_E = 0.85;         // bounce off a mallet
  const FRICTION = 0.25;      // per second: speed falls to e^(−0.25 t) – the air table barely slows the puck
  const PAUSE_GOAL = 1.2;     // seconds between a goal and the next serve
  const LEVELS = {            // computer player: top speed, how exactly it guards, how long before it reacts
    easy: { speed: 110, aim: 0.45, react: 0.28, attack: 0.55, cover: false },
    medium: { speed: 190, aim: 0.75, react: 0.14, attack: 0.8, cover: true },
    hard: { speed: 250, aim: 0.9, react: 0.08, attack: 1, cover: true },
  };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  // A circle of radius r inside a rounded corner? If not: the nearest allowed point and the outward normal there
  function cornerOut(x, y, r) {
    const cx = x < CORNER ? CORNER : x > W - CORNER ? W - CORNER : null;
    const cy = y < CORNER ? CORNER : y > H - CORNER ? H - CORNER : null;
    if (cx === null || cy === null) return null;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy), max = CORNER - r;
    if (d <= max) return null;
    const nx = dx / d, ny = dy / d;
    return { x: cx + nx * max, y: cy + ny * max, nx, ny };
  }

  // Where a mallet may go: its own half, inside the cushions (it may touch the centre line)
  function bounds(i) {
    return i === 0
      ? { x0: MALLET_R, x1: W - MALLET_R, y0: H / 2 + MALLET_R, y1: H - MALLET_R }
      : { x0: MALLET_R, x1: W - MALLET_R, y0: MALLET_R, y1: H / 2 - MALLET_R };
  }
  const home = i => ({ x: W / 2, y: i === 0 ? H - 22 : 22 });

  function createGame(opts = {}) {
    const g = {
      goalsToWin: clamp(Math.round(opts.goalsToWin || 7), 1, 99),
      score: [0, 0], phase: 'play', timer: 0, winner: null, lastScorer: null, hits: 0, time: 0,
      puck: { x: W / 2, y: H / 2, vx: 0, vy: 0 },
      mallets: [0, 1].map(i => { const h = home(i); return { x: h.x, y: h.y, vx: 0, vy: 0, tx: h.x, ty: h.y, speed: MALLET_SPEED }; }),
    };
    return g;
  }

  // The finger (or the computer) sets a target; the mallet moves there at its top speed
  function setTarget(g, i, x, y) {
    const b = bounds(i), m = g.mallets[i];
    m.tx = clamp(x, b.x0, b.x1); m.ty = clamp(y, b.y0, b.y1);
    const c = cornerOut(m.tx, m.ty, MALLET_R);
    if (c) { m.tx = c.x; m.ty = c.y; }
  }

  function moveMallet(g, i, dt) {
    const m = g.mallets[i], dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy), max = m.speed * dt;
    const f = d > max ? max / d : 1;
    const nx = m.x + dx * f, ny = m.y + dy * f;
    m.vx = (nx - m.x) / dt; m.vy = (ny - m.y) / dt;
    m.x = nx; m.y = ny;
  }

  function limitPuck(p) {
    const s = Math.hypot(p.vx, p.vy);
    if (s > MAX_PUCK) { p.vx *= MAX_PUCK / s; p.vy *= MAX_PUCK / s; }
  }

  // Puck against a circle (mallet with its velocity, or a goal post at rest): push out, reflect the relative velocity
  function collide(p, cx, cy, cr, cvx, cvy, e) {
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy), min = cr + PUCK_R;
    if (d >= min) return false;
    const nx = d > 1e-9 ? dx / d : 0, ny = d > 1e-9 ? dy / d : -1;
    p.x = cx + nx * min; p.y = cy + ny * min;
    const vn = (p.vx - cvx) * nx + (p.vy - cvy) * ny;
    if (vn < 0) { p.vx -= (1 + e) * vn * nx; p.vy -= (1 + e) * vn * ny; }
    limitPuck(p);
    return vn < -15;   // only a real hit counts (not resting or pushing contact)
  }

  const inMouth = x => Math.abs(x - W / 2) < GOAL / 2;

  function serve(g, toPlayer) {
    const p = g.puck;
    p.x = W / 2; p.y = toPlayer === 0 ? H / 2 + 20 : toPlayer === 1 ? H / 2 - 20 : H / 2; p.vx = 0; p.vy = 0;
    // A mallet resting on the serve spot steps back towards its goal, so the puck lies free
    for (const m of g.mallets) {
      if (Math.hypot(m.x - p.x, m.y - p.y) < MALLET_R + PUCK_R + 2) {
        const dir = m.y > H / 2 ? 1 : -1;
        m.y = clamp(p.y + dir * (MALLET_R + PUCK_R + 3), MALLET_R, H - MALLET_R);
        m.ty = m.y; m.tx = m.x; m.vx = m.vy = 0;
      }
    }
  }

  /* One step of DT. Returns events for sound and display: 'wall', 'hit0', 'hit1', 'post', 'goal0' (player 0 scored),
     'goal1', 'serve', 'over'. */
  function step(g, dt = DT) {
    const ev = [];
    g.time += dt;
    moveMallet(g, 0, dt); moveMallet(g, 1, dt);
    if (g.phase === 'over') return ev;
    if (g.phase === 'goal') {
      g.timer -= dt;
      if (g.timer <= 0) {
        g.phase = 'play';
        serve(g, g.lastScorer === 0 ? 1 : 0);   // the player who conceded gets the puck
        ev.push('serve');
      }
      return ev;
    }
    const p = g.puck, k = Math.exp(-FRICTION * dt);
    p.vx *= k; p.vy *= k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    // Side cushions
    if (p.x < PUCK_R) { p.x = PUCK_R; if (p.vx < 0) { p.vx = -p.vx * WALL_E; ev.push('wall'); } }
    else if (p.x > W - PUCK_R) { p.x = W - PUCK_R; if (p.vx > 0) { p.vx = -p.vx * WALL_E; ev.push('wall'); } }
    // Short cushions, except in the goal mouth
    if (!inMouth(p.x)) {
      if (p.y < PUCK_R) { p.y = PUCK_R; if (p.vy < 0) { p.vy = -p.vy * WALL_E; ev.push('wall'); } }
      else if (p.y > H - PUCK_R) { p.y = H - PUCK_R; if (p.vy > 0) { p.vy = -p.vy * WALL_E; ev.push('wall'); } }
    }
    // Rounded corners
    const c = cornerOut(p.x, p.y, PUCK_R);
    if (c) {
      p.x = c.x; p.y = c.y;
      const vn = p.vx * c.nx + p.vy * c.ny;
      if (vn > 0) { p.vx -= (1 + WALL_E) * vn * c.nx; p.vy -= (1 + WALL_E) * vn * c.ny; ev.push('wall'); }
    }
    // Goal posts (ends of the cushions)
    for (const py of [0, H]) for (const px of [W / 2 - GOAL / 2, W / 2 + GOAL / 2]) {
      if (collide(p, px, py, 0, 0, 0, WALL_E)) ev.push('post');
    }
    // Mallets
    g.mallets.forEach((m, i) => {
      if (collide(p, m.x, m.y, MALLET_R, m.vx, m.vy, HIT_E)) { g.hits++; ev.push('hit' + i); }
    });
    // A puck pressed against a cushion by a mallet stays on the table
    p.x = clamp(p.x, PUCK_R, W - PUCK_R);
    const c2 = cornerOut(p.x, p.y, PUCK_R);
    if (c2) { p.x = c2.x; p.y = c2.y; }
    // Goal: the centre of the puck crosses the goal line inside the mouth
    let scorer = null;
    if (p.y < 0 && inMouth(p.x)) scorer = 0;
    else if (p.y > H && inMouth(p.x)) scorer = 1;
    else if (p.y < -PUCK_R || p.y > H + PUCK_R) { p.y = clamp(p.y, PUCK_R, H - PUCK_R); p.vy = -p.vy; }   // never off the table
    if (scorer !== null) {
      g.score[scorer]++; g.lastScorer = scorer;
      ev.push('goal' + scorer);
      p.vx = p.vy = 0;
      if (g.score[scorer] >= g.goalsToWin) { g.phase = 'over'; g.winner = scorer; ev.push('over'); }
      else { g.phase = 'goal'; g.timer = PAUSE_GOAL; }
    }
    return ev;
  }

  /* Where the puck crosses the line y = lineY, with bounces off the side cushions (which also take some of the
     sideways speed); null if it moves away. Friction slows the puck but does not change its path. */
  function predictX(p, lineY) {
    let { x, y, vx, vy } = p;
    if (Math.abs(vy) < 1e-6 || (lineY - y) / vy < 0) return null;
    for (let n = 0; n < 50; n++) {
      const tLine = (lineY - y) / vy;
      const tWall = vx > 0 ? (W - PUCK_R - x) / vx : vx < 0 ? (PUCK_R - x) / vx : Infinity;
      if (tLine <= tWall) return x + vx * tLine;
      x += vx * tWall; y += vy * tWall; vx = -vx * WALL_E;
    }
    return x;
  }

  /* Computer player for player 1 (top). Returns the target for its mallet; mem keeps its reaction delay and
     aim error between calls. rnd: random numbers 0…1 (the tests pass a fixed sequence). */
  function aiTarget(g, level, mem, rnd = Math.random) {
    const L = LEVELS[level] || LEVELS.medium, p = g.puck, m = g.mallets[1], b = bounds(1);
    m.speed = L.speed;
    mem.wait = (mem.wait || 0) - DT;
    if (mem.err === undefined || mem.wait <= 0) {
      mem.wait = L.react + rnd() * L.react;
      mem.err = (rnd() - 0.5) * 2 * (1 - L.aim) * GOAL * 0.6;   // a weaker player guards less exactly
    }
    const guardY = b.y0 + 8;
    if (g.phase !== 'play') return { x: W / 2, y: guardY };
    // Attack: the puck is in its half and not racing towards its goal
    if (p.y < H / 2 + PUCK_R && p.vy > -60 * L.attack - 20) {
      mem.stuck = (mem.stuck || 0) + DT;
      // Aim at the middle of the other goal: get behind the puck on that line, then push through it
      const ax = W / 2 + mem.err * 0.5, ay = H, dx = ax - p.x, dy = ay - p.y, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      const behind = m.y < p.y - PUCK_R, clear = MALLET_R + PUCK_R;
      // Behind the puck: strike through it towards a fixed point (chasing it would only carry the puck along)
      if (behind && !mem.strike) mem.strike = { x: p.x + ux * 16, y: p.y + uy * 16, t: 0.3 };
      if (mem.strike) { mem.strike.t -= DT; const s = mem.strike; if (s.t <= 0) mem.strike = null; return { x: s.x, y: s.y }; }
      // Can't get behind it for a while (puck at the cushion): push it from the side, never towards the own goal
      if (mem.stuck > 3 && m.y <= p.y + 2) { if (mem.stuck > 3.6) mem.stuck = 0; return { x: p.x, y: p.y }; }
      // Puck between mallet and its own goal: first step aside on the mallet's side (away from a cushion), then go up past it
      let side = m.x >= p.x ? 1 : -1;
      if (p.x + side * (clear + 4) > W - MALLET_R || p.x + side * (clear + 4) < MALLET_R) side = -side;
      if (Math.abs(m.x - p.x) < clear + 2) return { x: p.x + side * (clear + 5), y: m.y };
      return { x: p.x + side * (clear + 4), y: p.y - clear - 2 };
    }
    mem.stuck = 0; mem.strike = null;
    // Defend: stand between the puck and the goal; where it will arrive if it comes, else watch it from the middle
    // Puck already past the guard line and heading for the goal: drop back onto the goal line and block it
    if (L.cover && p.y < guardY + PUCK_R && p.vy < 0) {
      const gx = predictX(p, b.y0) ?? p.x;
      return { x: clamp(gx, W / 2 - GOAL / 2, W / 2 + GOAL / 2), y: b.y0 };
    }
    const px = p.vy < 0 ? predictX(p, guardY) : null;
    const want = px === null ? W / 2 + (p.x - W / 2) * 0.35 : px;
    const x = clamp(W / 2 + (want - W / 2) * L.aim + mem.err, W / 2 - GOAL / 2 - 4, W / 2 + GOAL / 2 + 4);
    return { x, y: guardY };
  }

  root.HockeyEngine = { W, H, GOAL, CORNER, PUCK_R, MALLET_R, DT, MAX_PUCK, MALLET_SPEED, WALL_E, HIT_E, FRICTION, PAUSE_GOAL, LEVELS,
    bounds, cornerOut, createGame, setTarget, step, serve, predictX, aiTarget };
})(typeof self !== 'undefined' ? self : globalThis);
