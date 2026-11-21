/* Flipper – physics and rules without DOM, window.PinballEngine. The tables are data (tables.js); the engine plays
   any of them. The page (app.js) and the tests use the same code. Architecture: pinball/README.md

   Units: the table is W × H = 100 × 180 units, x to the right, y down (towards the player); time in seconds.
   The page calls step() with the fixed time step DT, so the game runs the same on every device and in the tests.
   The playfield is x 0…91; on the right, x 91…100, lies the shooter lane with the plunger (the same on every table). */
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
  const BALL_E = 0.9;          // ball against ball (multiball)
  const FLIP_R = 1.6;
  const FLIP_SPEED = 20;       // rad/s, up and down
  const BUMPER_KICK = 150;
  const SLING_KICK = 120;
  const LAUNCH_MIN = 228, LAUNCH_MAX = 300;  // plunger: ball speed for no / full pull
  const AUTO_LAUNCH = 270;     // extra balls of a multiball and saved balls during one are shot in by themselves
  const PULL_TIME = 0.9;       // seconds until the plunger is fully pulled
  const SAVE_TIME = 8;         // ball save after a launch
  const SAUCER_HOLD = 1, SAUCER_R = 2.4;     // seconds a saucer holds the ball; a ball centre this close drops in
  const MAX_MULT = 5, BONUS_STEP = 100;
  const SEP_X = 91, GATE_Y = 62;
  const LANE_X = 95.5, LANE_REST = 172.4;   // where the ball waits on the plunger
  const CX = 45.5;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;

  /* ---------- Geometry helpers ---------- */
  // Closest point on segment a–b to p
  function closest(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const u = l2 ? clamp(((px - x0) * dx + (py - y0) * dy) / l2, 0, 1) : 0;
    return { x: x0 + u * dx, y: y0 + u * dy };
  }
  // Ball against a capsule whose surface moves with velocity (svx, svy) at the contact. Returns the approach speed
  // (> 0) if it bounced, 0 if it only touched, -1 if no contact. The contact normal is left in b.nx, b.ny.
  function hitCapsule(b, x0, y0, x1, y1, r, e, contactVel) {
    const q = closest(b.x, b.y, x0, y0, x1, y1);
    let dx = b.x - q.x, dy = b.y - q.y;
    const d = Math.hypot(dx, dy), min = r + BALL_R;
    if (d >= min) return -1;
    if (d < 1e-9) { dx = 0; dy = -1; } else { dx /= d; dy /= d; }
    b.x = q.x + dx * min; b.y = q.y + dy * min;
    b.nx = dx; b.ny = dy;
    let svx = 0, svy = 0;
    if (contactVel) { const v = contactVel(q.x, q.y); svx = v.x; svy = v.y; }
    const vn = (b.vx - svx) * dx + (b.vy - svy) * dy;
    if (vn < 0) { b.vx -= (1 + e) * vn * dx; b.vy -= (1 + e) * vn * dy; return -vn; }
    return 0;
  }
  function limit(b) {
    const s = Math.hypot(b.vx, b.vy);
    if (s > MAX_BALL) { b.vx *= MAX_BALL / s; b.vy *= MAX_BALL / s; }
  }
  // Which side of a directed line a point lies on (> 0: the side a "forward" crossing starts from, see tables.js)
  const side = (l, x, y) => (l.x1 - l.x0) * (y - l.y0) - (l.y1 - l.y0) * (x - l.x0);
  // Did the ball cross the sensor line between its last and its current position? +1 forward, −1 backward, 0 no
  function crossed(l, b) {
    const s0 = side(l, b.px, b.py), s1 = side(l, b.x, b.y);
    if ((s0 > 0) === (s1 > 0)) return 0;
    // Where along the line: only within its ends
    const dx = b.x - b.px, dy = b.y - b.py, ex = l.x1 - l.x0, ey = l.y1 - l.y0, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) return 0;
    const u = ((b.px - l.x0) * dy - (b.py - l.y0) * dx) / -den;
    if (u < -0.02 || u > 1.02) return 0;
    return s0 > 0 ? 1 : -1;
  }

  /* ---------- Flippers ---------- */
  // side 0 = left, 1 = right. Angle a: direction pivot → tip is (cos a, sin a) on the left, mirrored on the right
  function flipperTip(f) {
    const c = Math.cos(f.a) * f.len, s = Math.sin(f.a) * f.len;
    return f.side === 0 ? { x: f.px + c, y: f.py + s } : { x: f.px - c, y: f.py + s };
  }
  function moveFlipper(f, dt) {
    const target = f.held ? f.upA : f.restA, d = target - f.a, max = FLIP_SPEED * dt;
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
  const newBallObj = (x, y, vx = 0, vy = 0) => ({ x, y, vx, vy, px: x, py: y, layer: 0, hold: 0, saucer: null, cool: 0, zone: {}, stuck: 0, nx: 0, ny: 0 });
  function createGame(table, opts = {}) {
    const g = {
      table, balls: clamp(Math.round(opts.balls || 3), 1, 9),
      ball: 1, score: 0, phase: 'launch', timer: 0, time: 0,
      live: [newBallObj(LANE_X, LANE_REST)],   // balls on the table
      queue: 0,                                 // balls still to be shot in automatically (multiball, saves during one)
      flippers: table.flippers.map(f => ({ side: f.side, px: f.x, py: f.y, len: f.len, restA: f.rest, upA: f.up, a: f.rest, w: 0, held: false })),
      held: [false, false],                     // flipper buttons
      pull: 0, pulling: false,                  // plunger: 0…1
      lit: Object.fromEntries(table.rollovers.map(r => [r.id, r.lanes.map(() => false)])),
      down: Object.fromEntries(table.banks.map(k => [k.id, k.targets.map(() => false)])),
      spin: Object.fromEntries(table.spinners.map(s => [s.id, { a: 0, w: 0 }])),   // spinner angle (drawing)
      raise: {},                                // bank id → time its targets stand up again
      lamps: { kickback: false, lock: false }, multiball: false, ramps: 0, jackpots: 0,
      mult: 1, bonus: 0, saveUntil: 0, saved: 0, launched: false,
      flash: {},                                // element id → time it last lit up (drawing)
      bumperHits: 0, lastBonus: 0, lastMult: 1,
    };
    return g;
  }
  function setFlipper(g, side, up) {
    up = !!up;
    if (up && !g.held[side] && g.phase !== 'over') {
      // Lane change: a flipper press moves the lit rollover lanes one step (left flipper to the left)
      for (const r of g.table.rollovers) if (r.laneChange) {
        const l = g.lit[r.id];
        g.lit[r.id] = side === 0 ? [...l.slice(1), l[0]] : [l[l.length - 1], ...l.slice(0, -1)];
      }
    }
    g.held[side] = up;
    for (const f of g.flippers) if (f.side === side) f.held = up;
  }
  const waiting = g => g.phase === 'launch';
  // Plunger: hold to pull, release to launch (only while the ball waits in the shooter lane)
  function setPlunger(g, down) {
    if (down) { if (waiting(g)) g.pulling = true; return []; }
    const ev = [];
    if (g.pulling && waiting(g)) {
      const b = g.live[0];
      b.y = b.py = LANE_REST; b.vy = -(LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * g.pull); b.vx = 0;
      g.phase = 'play';
      if (!g.launched) { g.launched = true; g.saveUntil = g.time + SAVE_TIME; }
      ev.push('launch');
    }
    g.pulling = false; g.pull = 0;
    return ev;
  }
  const inShooterLane = b => b.x > SEP_X && b.y > GATE_Y;
  const award = (g, pts) => { g.score += pts; };

  function newBall(g) {
    g.live = [newBallObj(LANE_X, LANE_REST)];
    g.phase = 'launch'; g.launched = false; g.saveUntil = 0; g.queue = 0; g.multiball = false;
  }
  function effect(g, what, ev) {
    if (what === 'mult') g.mult = Math.min(MAX_MULT, g.mult + 1);
    else if (what === 'save') g.saveUntil = Math.max(g.saveUntil, g.time + 4);
    else if (what === 'kickback') { if (!g.lamps.kickback) ev.push('kickbackLit'); g.lamps.kickback = true; }
  }
  function startMultiball(g, ev) {
    const mb = g.table.multiball;
    g.lamps.lock = false; g.multiball = true;
    g.queue += mb.balls - 1;
    g.saveUntil = Math.max(g.saveUntil, g.time + mb.save);
    ev.push('multiball');
  }

  /* One ball, one step: move, bounce, sensors, rules. Returns false if the ball left the table. */
  function stepBall(g, b, dt, ev) {
    const T = g.table;
    if (b.hold > 0) {
      // In a saucer: kicked out when the time is up
      b.hold -= dt;
      if (b.hold <= 0) {
        const s = b.saucer; b.hold = 0; b.saucer = null; b.cool = 0.5;
        b.vx = s.out.vx; b.vy = s.out.vy; ev.push('saucerKick');
      }
      return true;
    }
    b.px = b.x; b.py = b.y;
    b.vy += GRAVITY * dt;
    const k = Math.exp(-DAMP * dt);
    b.vx *= k; b.vy *= k;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.cool > 0) b.cool -= dt;
    // Back down the shooter lane onto the plunger: wait there (one ball) or shoot again (multiball)
    if (inShooterLane(b) && b.vy > 0 && b.y >= LANE_REST) {
      b.x = LANE_X; b.y = LANE_REST; b.vx = 0;
      if (g.live.length === 1 && g.queue === 0) { b.vy = 0; g.phase = 'launch'; return true; }
      b.vy = -AUTO_LAUNCH;
    }
    // Ramps: crossing the mouth upwards lifts the ball onto the ramp, back down drops it; the end drops it too
    for (const r of T.ramps) {
      if (b.layer === 0 && crossed(r.enter, b) === 1) { b.layer = 1; ev.push('rampIn'); }
      else if (b.layer === 1 && crossed(r.enter, b) === -1) { b.layer = 0; ev.push('rampBack'); }
      else if (b.layer === 1 && crossed(r.exit, b) === 1) {
        b.layer = 0; g.ramps++; g.flash[r.id] = g.time;
        award(g, r.score); g.bonus += BONUS_STEP; ev.push('ramp');
        if (g.multiball && T.multiball) { award(g, T.multiball.jackpot); g.jackpots++; ev.push('jackpot'); }
        else if (r.lockEvery && T.multiball && g.ramps % r.lockEvery === 0 && !g.lamps.lock) { g.lamps.lock = true; ev.push('lockLit'); }
      }
    }
    // Walls, rails, slingshots, the gate – on the ball's level
    let wallHit = 0;
    for (const w of T.walls) {
      if (w.layer !== 2 && w.layer !== b.layer) continue;
      if (w.kind === 'gate' && side(w, b.x, b.y) > 0) continue;   // one-way: only blocks a ball coming from above
      const s = hitCapsule(b, w.x0, w.y0, w.x1, w.y1, w.r, WALL_E);
      if (s < 0) continue;
      if (w.kind === 'sling' && s > 20) {
        b.vx += b.nx * SLING_KICK; b.vy += b.ny * SLING_KICK;
        award(g, 10); g.flash[w.id] = g.time; ev.push('sling');
      } else if (s > 25) wallHit = Math.max(wallHit, s);
    }
    if (wallHit) ev.push('wall');
    if (b.layer === 0) {
      // Drop targets
      for (const bank of T.banks) {
        const down = g.down[bank.id];
        if (g.raise[bank.id]) continue;   // all down, about to stand up again
        bank.targets.forEach((t, i) => {
          if (down[i]) return;
          if (hitCapsule(b, t.x0, t.y0, t.x1, t.y1, 1, WALL_E) > 10) {
            down[i] = true; g.flash[bank.id + i] = g.time;
            award(g, bank.score); g.bonus += BONUS_STEP; ev.push('target');
            if (down.every(Boolean)) {
              award(g, bank.allScore * g.mult); ev.push('bankAll');
              g.raise[bank.id] = g.time + 0.4;   // they stand up again shortly (not under a ball, see step)
              effect(g, bank.effect, ev);
            }
          }
        });
      }
      // Pop bumpers: kick the ball away with a fixed speed
      for (const p of T.bumpers) {
        if (hitCapsule(b, p.x, p.y, p.x, p.y, p.r, WALL_E) < 0) continue;
        const vn = b.vx * b.nx + b.vy * b.ny;
        if (vn < BUMPER_KICK) { b.vx += (BUMPER_KICK - vn) * b.nx; b.vy += (BUMPER_KICK - vn) * b.ny; }
        award(g, p.score); g.bumperHits++; g.flash[p.id] = g.time; ev.push('bumper');
      }
      // Flippers
      for (const f of g.flippers) {
        const tip = flipperTip(f);
        const s = hitCapsule(b, f.px, f.py, tip.x, tip.y, FLIP_R, FLIP_E, (x, y) => flipperVel(f, x, y));
        if (s > 40 && Math.abs(f.w) > 1) ev.push('flip' + f.side);
      }
      // Spinners: a ball passing turns them, the faster the more turns
      for (const sp of T.spinners) {
        if (!crossed(sp, b)) continue;
        const turns = Math.max(1, Math.round(Math.hypot(b.vx, b.vy) / 25));
        award(g, turns * sp.score); g.spin[sp.id].w = turns * 6; ev.push('spinner');
      }
      // Saucers
      for (const s of T.saucers) {
        if (b.cool > 0 || Math.hypot(b.x - s.x, b.y - s.y) > SAUCER_R) continue;
        Object.assign(b, { x: s.x, y: s.y, vx: 0, vy: 0, hold: SAUCER_HOLD, saucer: s });
        award(g, s.score); g.bonus += BONUS_STEP; g.flash[s.id] = g.time; ev.push('saucer');
        if (g.lamps.lock && T.multiball && !g.multiball) { startMultiball(g, ev); b.hold += 1; }
        return true;
      }
      // Kickbacks: a lit one shoots a ball in the outlane back up
      for (const kb of T.kickbacks) {
        if (g.lamps.kickback && crossed(kb, b) === 1) {
          b.vx = 0; b.vy = -kb.speed; g.lamps.kickback = false; g.flash[kb.id] = g.time; ev.push('kickback');
        }
      }
      // Rollover lanes: crossing a lane lights it
      for (const r of T.rollovers) {
        let lane = -1;
        r.lanes.forEach((l, i) => { if (b.y > l.y0 && b.y < l.y1 && Math.abs(b.x - l.x) < l.w / 2) lane = i; });
        if (lane >= 0 && lane !== b.zone[r.id]) {
          const lit = g.lit[r.id];
          g.flash[r.id + lane] = g.time;
          if (!lit[lane]) { lit[lane] = true; award(g, r.score); g.bonus += BONUS_STEP; ev.push('lane'); }
          else award(g, r.score / 5);
          if (lit.every(Boolean)) { lit.fill(false); award(g, r.allScore); effect(g, r.effect, ev); ev.push('lanesAll'); }
        }
        b.zone[r.id] = lane;
      }
    }
    limit(b);
    // Never outside the cabinet (a ball pressed against a wall by a flipper stays inside)
    b.x = clamp(b.x, BALL_R, W - BALL_R);
    if (b.y < BALL_R) { b.y = BALL_R; if (b.vy < 0) b.vy = -b.vy * WALL_E; }
    // A ball that hardly moves for a few seconds (not on a held flipper, not in the shooter lane) gets a nudge
    const slow = Math.hypot(b.vx, b.vy) < 3, cradled = g.held.some(Boolean) && b.y > 140;
    b.stuck = slow && !cradled && !inShooterLane(b) ? b.stuck + dt : 0;
    if (b.stuck > 3) { b.vy = -80; b.vx = b.x < CX ? 30 : -30; b.stuck = 0; ev.push('nudge'); }
    return !(b.y > H + BALL_R && !inShooterLane(b));
  }

  // Two balls (multiball): push apart, exchange the normal speed
  function collideBalls(a, b) {
    if (a.layer !== b.layer || a.hold > 0 || b.hold > 0) return;
    let dx = b.x - a.x, dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= 2 * BALL_R || d < 1e-9) return;
    dx /= d; dy /= d;
    const push = (2 * BALL_R - d) / 2;
    a.x -= dx * push; a.y -= dy * push; b.x += dx * push; b.y += dy * push;
    const vn = (b.vx - a.vx) * dx + (b.vy - a.vy) * dy;
    if (vn < 0) { const j = (1 + BALL_E) / 2 * vn; a.vx += j * dx; a.vy += j * dy; b.vx -= j * dx; b.vy -= j * dy; }
  }

  /* One step of DT. Returns events for sounds and display: 'launch', 'wall', 'flip0', 'flip1', 'bumper', 'sling',
     'lane', 'lanesAll', 'target', 'bankAll', 'spinner', 'saucer', 'saucerKick', 'rampIn', 'rampBack', 'ramp',
     'lockLit', 'multiball', 'jackpot', 'multiballEnd', 'kickbackLit', 'kickback', 'nudge', 'saved', 'drain',
     'ball' (next ball ready), 'over'. */
  function step(g, dt = DT) {
    const ev = [];
    g.time += dt;
    for (const f of g.flippers) moveFlipper(f, dt);
    for (const id in g.spin) { const s = g.spin[id]; s.a += s.w * dt; s.w *= Math.exp(-2.5 * dt); }
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
    // While the ball waits on the plunger it does not move
    if (waiting(g)) { const b = g.live[0]; b.x = b.px = LANE_X; b.y = b.py = LANE_REST + g.pull * 6; return ev; }
    // A completed bank stands up again – each target only where no ball lies on it
    for (const bank of g.table.banks) {
      if (!g.raise[bank.id] || g.time < g.raise[bank.id]) continue;
      const down = g.down[bank.id];
      bank.targets.forEach((t, i) => {
        if (!g.live.some(b => { const q = closest(b.x, b.y, t.x0, t.y0, t.x1, t.y1); return Math.hypot(b.x - q.x, b.y - q.y) < 1 + BALL_R + 0.5; })) down[i] = false;
      });
      if (!down.some(Boolean)) delete g.raise[bank.id];
    }
    // Shoot in queued balls when the shooter lane is free
    if (g.queue > 0 && !g.live.some(b => inShooterLane(b) && b.y > 120)) {
      g.queue--; g.live.push(newBallObj(LANE_X, LANE_REST, 0, -AUTO_LAUNCH)); ev.push('launch');
    }
    const lost = [];
    for (const b of g.live) if (!stepBall(g, b, dt, ev)) lost.push(b);
    if (waiting(g)) return ev;
    for (let i = 0; i < g.live.length; i++) for (let j = i + 1; j < g.live.length; j++) collideBalls(g.live[i], g.live[j]);
    for (const b of lost) {
      g.live.splice(g.live.indexOf(b), 1);
      const others = g.live.length + g.queue;
      if (g.time < g.saveUntil) {
        // Ball save: the ball comes back – onto the plunger, or shot in by itself while other balls are in play
        g.saved++; ev.push('saved');
        if (others) g.queue++;
        else { g.live = [newBallObj(LANE_X, LANE_REST)]; g.phase = 'launch'; g.saveUntil = 0; }
        continue;
      }
      if (others) {
        if (g.multiball && others === 1) { g.multiball = false; ev.push('multiballEnd'); }
        continue;
      }
      g.lastMult = g.mult; g.lastBonus = g.bonus * g.mult;
      award(g, g.lastBonus);
      g.bonus = 0; g.mult = 1; g.multiball = false; g.lamps.lock = false;
      g.phase = 'drain'; g.timer = 1.6; ev.push('drain');
    }
    return ev;
  }

  root.PinballEngine = { W, H, BALL_R, DT, GRAVITY, MAX_BALL, DAMP, WALL_E, FLIP_R, FLIP_SPEED, BUMPER_KICK, SLING_KICK,
    LAUNCH_MIN, LAUNCH_MAX, AUTO_LAUNCH, PULL_TIME, SAVE_TIME, SAUCER_HOLD, SAUCER_R, MAX_MULT, BONUS_STEP,
    LANE_X, LANE_REST, SEP_X, GATE_Y, CX,
    closest, crossed, flipperTip, flipperVel, createGame, setFlipper, setPlunger, step, inShooterLane };
})(typeof self !== 'undefined' ? self : globalThis);
