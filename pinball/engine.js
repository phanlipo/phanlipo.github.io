/* Flipper – table, physics and rules without DOM, window.PinballEngine. The page (app.js) and the tests use the
   same code. Architecture: pinball/README.md

   Units: the table is W × H = 100 × 180 units, x to the right, y down (towards the player); time in seconds.
   The page calls step() with the fixed time step DT, so the game runs the same on every device and in the tests.
   The playfield is x 0…91; on the right, x 91…100, lies the shooter lane with the plunger. */
(function (root) {
  'use strict';
  const W = 100, H = 180;
  const BALL_R = 2.6;
  const DT = 1 / 240;          // fixed physics step: a ball at top speed moves less than half its radius per step
  const GRAVITY = 190;         // units/s² down the sloped table
  const MAX_BALL = 300;        // units/s
  const DAMP = 0.12;           // per second: rolling friction, speed falls to e^(−0.12 t)
  const WALL_E = 0.45;         // bounce off walls and posts (share of the normal speed kept)
  const FLIP_E = 0.25;         // bounce off a flipper (relative to its moving surface)
  const FLIP_LEN = 13, FLIP_R = 1.6;
  const FLIP_REST = 0.5, FLIP_UP = -0.42;   // radians, left flipper (right one mirrored); positive = tip down
  const FLIP_SPEED = 20;       // rad/s, up and down
  const BUMPER_R = 5.5, BUMPER_KICK = 150;
  const SLING_KICK = 120;
  const LAUNCH_MIN = 228, LAUNCH_MAX = 300;  // plunger: ball speed for no / full pull
  const PULL_TIME = 0.9;       // seconds until the plunger is fully pulled
  const SAVE_TIME = 8;         // ball save after a launch
  const MAX_MULT = 5;
  const SCORE = { bumper: 100, sling: 10, lane: 500, lanesAll: 2000, target: 250, bankAll: 3000, bonusStep: 100 };
  const LANE_X = 95.5, LANE_REST = 172.4;   // where the ball waits on the plunger
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const CX = 45.5;             // middle of the playfield; the table is symmetric around it
  const mirror = x => 2 * CX - x;

  /* ---------- Table ---------- */
  // Walls: capsules (segment with radius). kind: 'wall' (passive), 'sling' (kicks), 'gate' (one-way)
  const walls = [];
  const wall = (x0, y0, x1, y1, r = 0, kind = 'wall', id) => { walls.push({ x0, y0, x1, y1, r, kind, id }); };
  // Outer walls and the round top (an arc around (50, 50) with radius 50)
  wall(0, 50, 0, H + 10); wall(W, 50, W, H + 10);
  const ARC_N = 24;
  for (let k = 0; k < ARC_N; k++) {
    const a0 = Math.PI + Math.PI * k / ARC_N, a1 = Math.PI + Math.PI * (k + 1) / ARC_N;
    wall(50 + 50 * Math.cos(a0), 50 + 50 * Math.sin(a0), 50 + 50 * Math.cos(a1), 50 + 50 * Math.sin(a1));
  }
  // Shooter lane: separator, the one-way gate at its top (sloping left, so a ball on it rolls into the playfield)
  const SEP_X = 91, GATE = { x0: SEP_X, y0: 62, x1: W, y1: 55 };
  wall(SEP_X, 62, SEP_X, H + 10, 0.6);
  wall(GATE.x0, GATE.y0, GATE.x1, GATE.y1, 0.4, 'gate');
  // Plunger tip (the ball rests on it)
  wall(SEP_X, LANE_REST + BALL_R + 0.5, W, LANE_REST + BALL_R + 0.5);
  // Inlane guides with the outlanes beside them, down to the flipper pivots; mirrored on the right
  const PIVOT_L = { x: 28, y: 158 }, PIVOT_R = { x: mirror(28), y: 158 };
  for (const m of [x => x, mirror]) {
    wall(m(7.5), 124, m(7.5), 145, 0.8);
    wall(m(7.5), 145, m(27), 156.6, 0.8);
    // Slingshot triangle above the inlane: the long side facing the middle kicks
    wall(m(15.5), 120, m(15.5), 137, 0.8);
    wall(m(15.5), 137, m(25), 144, 0.8);
    wall(m(15.5), 120, m(25), 144, 0.8, 'sling', m === mirror ? 'slingR' : 'slingL');
    // Outlane: a short wall at the bottom of the outer wall narrows it, so not every ball there is lost at once
    wall(m(0), 146, m(3), 150, 0.6);
  }
  // Top lanes: posts between three rollover lanes
  const LANES = [29, 45, 61], LANE_POSTS = [21, 37, 53, 69], LANE_Y0 = 15, LANE_Y1 = 25;
  for (const x of LANE_POSTS) wall(x, LANE_Y0, x, LANE_Y1, 1);
  // Upper left: a guide from the outer wall that sends balls falling down the left side back into the middle
  wall(0, 54, 10, 64, 0.8);
  // Drop targets on the right, facing left, in front of the separator (no ball fits behind them)
  const TARGETS = [{ y0: 80, y1: 86 }, { y0: 88, y1: 94 }, { y0: 96, y1: 102 }], TARGET_X = 86.8;
  // Above and below the bank short walls sloping towards the middle: a ball behind a dropped target rolls out
  wall(TARGET_X, 77, SEP_X - 0.6, 74, 0.8); wall(SEP_X - 0.6, 100, TARGET_X, 105, 0.8);
  // Pop bumpers
  const BUMPERS = [{ x: 28, y: 46 }, { x: 60, y: 44 }, { x: 44, y: 66 }];

  /* ---------- Geometry helpers ---------- */
  // Closest point on segment a–b to p
  function closest(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const u = l2 ? clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1) : 0;
    return { x: x0 + u * dx, y: y0 + u * dy };
  }
  // Ball against a capsule whose surface moves with velocity (svx, svy) at the contact. Returns the approach speed
  // (> 0) if it bounced, 0 if it only touched, -1 if no contact.
  function hitCapsule(b, x0, y0, x1, y1, r, e, svx = 0, svy = 0, contactVel) {
    const q = closest(b.x, b.y, x0, y0, x1, y1);
    let dx = b.x - q.x, dy = b.y - q.y;
    const d = Math.hypot(dx, dy), min = r + BALL_R;
    if (d >= min) return -1;
    if (d < 1e-9) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
    b.x = q.x + dx * min; b.y = q.y + dy * min;
    if (contactVel) { const v = contactVel(q.x, q.y); svx = v.x; svy = v.y; }
    const vn = (b.vx - svx) * dx + (b.vy - svy) * dy;
    if (vn < 0) { b.vx -= (1 + e) * vn * dx; b.vy -= (1 + e) * vn * dy; b.nx = dx; b.ny = dy; return -vn; }
    return 0;
  }
  function limit(b) {
    const s = Math.hypot(b.vx, b.vy);
    if (s > MAX_BALL) { b.vx *= MAX_BALL / s; b.vy *= MAX_BALL / s; }
  }

  /* ---------- Flippers ---------- */
  // side 0 = left, 1 = right. Angle a: direction pivot → tip is (cos a, sin a) on the left, mirrored on the right
  function flipperTip(f) {
    const a = f.a, c = Math.cos(a) * FLIP_LEN, s = Math.sin(a) * FLIP_LEN;
    return f.side === 0 ? { x: f.px + c, y: f.py + s } : { x: f.px - c, y: f.py + s };
  }
  function moveFlipper(f, dt) {
    const target = f.up ? FLIP_UP : FLIP_REST, d = target - f.a, max = FLIP_SPEED * dt;
    const da = Math.abs(d) <= max ? d : Math.sign(d) * max;
    f.a += da;
    f.w = da / dt;   // angular speed in the left flipper's sense (negative = swinging up)
  }
  // Velocity of a point (x, y) on the flipper
  function flipperVel(f, x, y) {
    const rx = x - f.px, ry = y - f.py;
    // Left: angle grows clockwise on screen (y down) → v = w × r = (−w·ry, w·rx); right flipper mirrored in x
    return f.side === 0 ? { x: -f.w * ry, y: f.w * rx } : { x: f.w * ry, y: -f.w * rx };
  }

  /* ---------- Game ---------- */
  function createGame(opts = {}) {
    const g = {
      balls: clamp(Math.round(opts.balls || 3), 1, 9),
      ball: 1, score: 0, phase: 'launch', timer: 0, time: 0,
      b: { x: LANE_X, y: LANE_REST, vx: 0, vy: 0 },
      flippers: [{ side: 0, px: PIVOT_L.x, py: PIVOT_L.y, a: FLIP_REST, w: 0, up: false },
        { side: 1, px: PIVOT_R.x, py: PIVOT_R.y, a: FLIP_REST, w: 0, up: false }],
      pull: 0, pulling: false,        // plunger: 0…1
      lanes: [false, false, false], targets: [false, false, false],
      mult: 1, bonus: 0, saveUntil: 0, saved: 0, launched: false,
      flash: {},                       // element id → time it last lit up (drawing)
      stuck: 0, laneIn: -1, bumperHits: 0, lastBonus: 0, lastMult: 1,
    };
    return g;
  }
  function setFlipper(g, side, up) {
    const f = g.flippers[side];
    if (up && !f.up && g.phase !== 'over') {
      // Lane change: a flipper press moves the lit top lanes one step (left flipper to the left), as on real tables
      const l = g.lanes;
      g.lanes = side === 0 ? [l[1], l[2], l[0]] : [l[2], l[0], l[1]];
    }
    f.up = !!up;
  }
  // Plunger: hold to pull, release to launch (only while the ball waits in the shooter lane)
  function setPlunger(g, down) {
    if (down) { if (g.phase === 'launch') g.pulling = true; return []; }
    const ev = [];
    if (g.pulling && g.phase === 'launch') {
      const b = g.b;
      b.y = LANE_REST; b.vy = -(LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * g.pull); b.vx = 0;
      g.phase = 'play';
      if (!g.launched) { g.launched = true; g.saveUntil = g.time + SAVE_TIME; }
      ev.push('launch');
    }
    g.pulling = false; g.pull = 0;
    return ev;
  }
  const award = (g, pts) => { g.score += pts; };
  const inShooterLane = b => b.x > SEP_X && b.y > GATE.y0;

  function newBall(g) {
    Object.assign(g.b, { x: LANE_X, y: LANE_REST, vx: 0, vy: 0 });
    g.phase = 'launch'; g.launched = false; g.saveUntil = 0; g.stuck = 0; g.laneIn = -1;
  }

  /* One step of DT. Returns events for sounds and display: 'launch', 'wall', 'flip0', 'flip1' (ball hit by a moving
     flipper), 'bumper', 'sling', 'lane', 'lanesAll', 'target', 'bankAll', 'drain', 'saved', 'ball' (next ball
     ready), 'over'. */
  function step(g, dt = DT) {
    const ev = [];
    g.time += dt;
    for (const f of g.flippers) moveFlipper(f, dt);
    if (g.pulling) g.pull = Math.min(1, g.pull + dt / PULL_TIME);
    if (g.phase === 'over') return ev;
    if (g.phase === 'drain') {
      g.timer -= dt;
      if (g.timer <= 0) {
        if (g.ball >= g.balls) { g.phase = 'over'; ev.push('over'); }
        else { g.ball++; newBall(g); ev.push('ball'); }
      }
      return ev;
    }
    const b = g.b;
    // While the ball waits on the plunger it does not move
    if (g.phase === 'launch' && b.vy === 0) { b.x = LANE_X; b.y = LANE_REST + g.pull * 6; return ev; }
    b.vy += GRAVITY * dt;
    const k = Math.exp(-DAMP * dt);
    b.vx *= k; b.vy *= k;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // Too weak (or fallen back through the lane): the ball lands on the plunger and can be launched again
    if (inShooterLane(b) && b.vy > 0 && b.y >= LANE_REST) { b.x = LANE_X; b.y = LANE_REST; b.vy = 0; b.vx = 0; g.phase = 'launch'; return ev; }
    if (g.phase === 'launch' && !inShooterLane(b)) g.phase = 'play';
    // Walls, slingshots, the gate
    let wallHit = 0;
    for (const w of walls) {
      if (w.kind === 'gate') {
        // One-way: only blocks a ball coming from above (back into the shooter lane)
        const side = (w.x1 - w.x0) * (b.y - w.y0) - (w.y1 - w.y0) * (b.x - w.x0);
        if (side > 0) continue;   // below the gate line: let it pass upwards
      }
      const s = hitCapsule(b, w.x0, w.y0, w.x1, w.y1, w.r, WALL_E);
      if (s < 0) continue;
      if (w.kind === 'sling' && s > 20) {
        b.vx += b.nx * SLING_KICK; b.vy += b.ny * SLING_KICK;
        award(g, SCORE.sling); g.flash[w.id] = g.time; ev.push('sling');
      } else if (s > 25) wallHit = Math.max(wallHit, s);
    }
    if (wallHit) ev.push('wall');
    // Drop targets
    TARGETS.forEach((t, i) => {
      if (g.targets[i]) return;
      const s = hitCapsule(b, TARGET_X, t.y0, TARGET_X, t.y1, 1, WALL_E);
      if (s > 10) {
        g.targets[i] = true; g.flash['t' + i] = g.time;
        award(g, SCORE.target); g.bonus += SCORE.bonusStep; ev.push('target');
        if (g.targets.every(Boolean)) {
          award(g, SCORE.bankAll * g.mult); g.targets = [false, false, false]; ev.push('bankAll');
          g.saveUntil = Math.max(g.saveUntil, g.time + 4);   // a short ball save as reward
        }
      }
    });
    // Pop bumpers: kick the ball away with a fixed speed
    BUMPERS.forEach((p, i) => {
      const s = hitCapsule(b, p.x, p.y, p.x, p.y, BUMPER_R, WALL_E);
      if (s >= 0) {
        const vn = b.vx * b.nx + b.vy * b.ny;
        if (vn < BUMPER_KICK) { b.vx += (BUMPER_KICK - vn) * b.nx; b.vy += (BUMPER_KICK - vn) * b.ny; }
        award(g, SCORE.bumper); g.bumperHits++; g.flash['b' + i] = g.time; ev.push('bumper');
      }
    });
    // Flippers
    for (const f of g.flippers) {
      const tip = flipperTip(f);
      const s = hitCapsule(b, f.px, f.py, tip.x, tip.y, FLIP_R, FLIP_E, 0, 0, (x, y) => flipperVel(f, x, y));
      if (s > 40 && Math.abs(f.w) > 1) ev.push('flip' + f.side);
    }
    limit(b);
    // Never outside the cabinet (a ball pressed against a wall by a flipper stays inside)
    b.x = clamp(b.x, BALL_R, W - BALL_R);
    if (b.y < BALL_R) { b.y = BALL_R; if (b.vy < 0) b.vy = -b.vy * WALL_E; }
    // Rollover lanes at the top: crossing a lane lights it
    let lane = -1;
    if (b.y > LANE_Y0 + 1 && b.y < LANE_Y1 - 1) LANES.forEach((x, i) => { if (Math.abs(b.x - x) < 7) lane = i; });
    if (lane >= 0 && lane !== g.laneIn) {
      g.flash['l' + lane] = g.time;
      if (!g.lanes[lane]) { g.lanes[lane] = true; award(g, SCORE.lane); g.bonus += SCORE.bonusStep; ev.push('lane'); }
      else award(g, SCORE.lane / 5);
      if (g.lanes.every(Boolean)) {
        g.lanes = [false, false, false]; award(g, SCORE.lanesAll);
        g.mult = Math.min(MAX_MULT, g.mult + 1); ev.push('lanesAll');
      }
    }
    g.laneIn = lane;
    // A ball that hardly moves for a few seconds outside the plunger and off a raised flipper gets a nudge
    const slow = Math.hypot(b.vx, b.vy) < 3, cradled = g.flippers.some(f => f.up) && b.y > 140;
    g.stuck = slow && !cradled && !inShooterLane(b) ? g.stuck + dt : 0;
    if (g.stuck > 3) { b.vy = -80; b.vx = b.x < CX ? 30 : -30; g.stuck = 0; ev.push('nudge'); }
    // Drain: the ball leaves the table at the bottom
    if (b.y > H + BALL_R && !inShooterLane(b)) {
      if (g.time < g.saveUntil) {
        // Ball save: the ball comes back on the plunger, it is not lost
        g.saved++; newBall(g); g.launched = true; g.saveUntil = 0; ev.push('saved');
      } else {
        g.lastMult = g.mult; g.lastBonus = g.bonus * g.mult;
        award(g, g.lastBonus);
        g.bonus = 0; g.mult = 1;
        g.phase = 'drain'; g.timer = 1.6; ev.push('drain');
      }
    }
    return ev;
  }

  root.PinballEngine = { W, H, BALL_R, DT, GRAVITY, MAX_BALL, WALL_E, FLIP_LEN, FLIP_R, FLIP_REST, FLIP_UP, FLIP_SPEED,
    BUMPER_R, BUMPER_KICK, SLING_KICK, LAUNCH_MIN, LAUNCH_MAX, PULL_TIME, SAVE_TIME, MAX_MULT, SCORE, LANE_X, LANE_REST,
    SEP_X, GATE, CX, walls, BUMPERS, TARGETS, TARGET_X, LANES, LANE_POSTS, LANE_Y0, LANE_Y1,
    closest, flipperTip, flipperVel, createGame, setFlipper, setPlunger, step, newBall };
})(typeof self !== 'undefined' ? self : globalThis);
