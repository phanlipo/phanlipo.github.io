/* Tischtennis – table, ball flight, rules and computer player without DOM, window.PingEngine. The page (app.js) and
   the tests use the same code. Architecture: table-tennis/README.md

   Units: the room seen from above is W × H = 100 × 200 units, x to the right, y down; the ball also has a height z
   above the table (z = 0: table top or floor). Time in seconds. The table lies in the middle (TX0…TX1 × TY0…TY1),
   the net across it at y = NET_Y. Player 0 plays from the bottom (y > NET_Y), player 1 from the top. The page always
   calls step() with the fixed time step DT, so the game runs the same on every device and in the tests. */
(function (root) {
  'use strict';
  const W = 100, H = 200;
  const TX0 = 12, TX1 = 88, TY0 = 32, TY1 = 168;   // the table: 76 × 136 (the proportions of a real one)
  const NET_Y = 100, NET_H = 6, NET_OVER = 5;       // net height; it sticks out NET_OVER beyond each side of the table
  const BALL_R = 2, PADDLE_R = 9;
  const DT = 1 / 120;          // fixed physics step
  const G = 150;               // gravity, units/s²
  const BOUNCE = 0.8;          // the table gives back this share of the falling speed
  const PADDLE_SPEED = 420;    // units/s a paddle follows the finger at most (no teleporting)
  // A shot: the faster the paddle moves towards the other side, the faster and the longer the ball flies
  const V_MIN = 80, V_ADD = 120;     // forward speed V_MIN … V_MIN + V_ADD
  const L_MIN = 26, L_ADD = 43;      // lands this far behind the net: L_MIN … L_MIN + L_ADD (the other half is 68 deep)
  const SWING = 160;                 // swing speed (units/s) at which 63 % of the extra speed and length are reached
  const SIDE = 30;                   // sideways speed from hitting with the edge of the paddle (−1 … 1)
  const PAUSE_POINT = 1.1;           // seconds between a point and the next serve
  const SERVE_Z = 10;                // the ball waits for the serve at this height
  /* Computer player: top speed, how long it takes to react to a shot, swing range, aim error (share of the paddle
     edge), margin from the table edges it aims at, how long after the bounce it hits, how often it plays away from
     the other paddle */
  const LEVELS = {
    easy: { speed: 90, think: 0.35, swing: [30, 90], err: 2, margin: 20, late: 0.3, away: 0 },
    medium: { speed: 160, think: 0.22, swing: [80, 190], err: 1.2, margin: 12, late: 0.18, away: 0.4 },
    hard: { speed: 240, think: 0.12, swing: [140, 280], err: 0.65, margin: 8, late: 0.1, away: 0.75 },
  };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const overTable = (x, y) => x >= TX0 && x <= TX1 && y >= TY0 && y <= TY1;
  const sideOf = y => y > NET_Y ? 0 : 1;
  const dirOf = i => i === 0 ? -1 : 1;   // direction (in y) towards the other side

  // Where a paddle may go: its own side of the net, in the room
  function bounds(i) {
    return i === 0
      ? { x0: PADDLE_R, x1: W - PADDLE_R, y0: NET_Y + PADDLE_R, y1: H - PADDLE_R }
      : { x0: PADDLE_R, x1: W - PADDLE_R, y0: PADDLE_R, y1: NET_Y - PADDLE_R };
  }
  const home = i => ({ x: W / 2, y: i === 0 ? H - 16 : 16 });

  function createGame(opts = {}) {
    const g = {
      pointsToWin: clamp(Math.round(opts.pointsToWin || 11), 1, 99),
      score: [0, 0], phase: 'serve', server: opts.server === 1 ? 1 : 0, timer: 0, winner: null,
      lastPoint: null,   // { to, reason: 'out' | 'net' | 'miss' }
      time: 0, rally: 0, shots: 0,
      ball: null,
      paddles: [0, 1].map(i => { const h = home(i); return { x: h.x, y: h.y, vx: 0, vy: 0, tx: h.x, ty: h.y, speed: PADDLE_SPEED }; }),
    };
    g.firstServer = g.server;
    serve(g, g.server);
    return g;
  }

  // The finger (or the computer) sets a target; the paddle moves there at its top speed
  function setTarget(g, i, x, y) {
    const b = bounds(i), m = g.paddles[i];
    m.tx = clamp(x, b.x0, b.x1); m.ty = clamp(y, b.y0, b.y1);
  }
  function movePaddle(g, i, dt) {
    const m = g.paddles[i], dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy), max = m.speed * dt;
    const f = d > max ? max / d : 1;
    const nx = m.x + dx * f, ny = m.y + dy * f;
    m.vx = (nx - m.x) / dt; m.vy = (ny - m.y) / dt;
    m.x = nx; m.y = ny;
  }

  // The ball waits above the server's end of the table until the server hits it
  function serve(g, i) {
    g.phase = 'serve'; g.server = i; g.rally = 0;
    const y = i === 0 ? TY1 + 4 : TY0 - 4;
    g.ball = { x: W / 2, y, z: SERVE_Z, vx: 0, vy: 0, vz: 0, hitter: null, bounced: false, net: false, serve: true };
    // A paddle on the serve spot steps back, so the serve doesn't go off by itself
    const m = g.paddles[i];
    if (Math.hypot(m.x - W / 2, m.y - y) < PADDLE_R + BALL_R + 4) {
      m.y = m.ty = clamp(y - dirOf(i) * (PADDLE_R + BALL_R + 6), bounds(i).y0, bounds(i).y1);
      m.vx = m.vy = 0;
    }
  }

  // Server per point as in table tennis: change every 2 points, every point once both are one point from the end
  function serverFor(g) {
    const [a, b] = g.score, n = a + b, end = g.pointsToWin - 1;
    if (a >= end && b >= end) return (g.firstServer + end + n - 2 * end) % 2;
    return (g.firstServer + Math.floor(n / 2)) % 2;
  }

  /* The outgoing ball of a shot by player i. Forward speed and length grow with the swing (paddle speed towards the
     other side); the spot on the paddle (edge = ±1) and a sideways movement of the paddle angle the ball. The height
     is chosen so that the ball lands at that length – and clears the net (then it flies further, maybe out). */
  function shot(b, m, i) {
    const dir = dirOf(i), swing = Math.max(0, m.vy * dir);
    const k = 1 - Math.exp(-swing / SWING);
    const vf = V_MIN + V_ADD * k, len = L_MIN + L_ADD * k;
    const off = clamp((b.x - m.x) / (PADDLE_R + BALL_R), -1, 1);
    const vx = off * SIDE + m.vx * 0.15 + b.vx * 0.2;
    const land = NET_Y + dir * len;
    const T = Math.max(0.15, Math.abs(land - b.y) / vf), tn = Math.abs(NET_Y - b.y) / vf;
    let vz = G * T / 2 - b.z / T;
    const clear = NET_H + BALL_R + 1;
    if (b.z + vz * tn - G * tn * tn / 2 < clear && tn > 0.02) vz = (clear - b.z + G * tn * tn / 2) / tn;
    return { vx, vy: dir * vf, vz };
  }

  /* Ball flight for one step (gravity, table, net, floor), without paddles. Returns null or the event
     { type: 'table', side } | { type: 'net' } | { type: 'floor' }. Used by step() and for predictions. */
  function fly(b, dt) {
    const y0 = b.y;
    b.vz -= G * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    // Net: the ball crosses the net line too low, beside the table edges plus the posts
    if ((y0 - NET_Y) * (b.y - NET_Y) <= 0 && y0 !== b.y && b.z < NET_H + BALL_R && b.x > TX0 - NET_OVER && b.x < TX1 + NET_OVER) {
      b.y = NET_Y + Math.sign(y0 - NET_Y || 1) * (BALL_R + 0.01);
      b.vy = -b.vy * 0.15; b.vx *= 0.3;
      b.net = true;
      return { type: 'net' };
    }
    if (b.z <= 0) {
      if (overTable(b.x, b.y)) {
        b.z = -b.z; b.vz = -b.vz * BOUNCE;
        return { type: 'table', side: sideOf(b.y) };
      }
      return { type: 'floor' };
    }
    if (b.x < -10 || b.x > W + 10 || b.y < -10 || b.y > H + 10) return { type: 'floor' };   // flew out of the room
    return null;
  }

  function point(g, to, reason, ev) {
    g.score[to]++;
    g.lastPoint = { to, reason };
    ev.push('point' + to);
    const [a, b] = g.score;
    if (Math.max(a, b) >= g.pointsToWin && Math.abs(a - b) >= 2) { g.phase = 'over'; g.winner = a > b ? 0 : 1; ev.push('over'); }
    else { g.phase = 'point'; g.timer = PAUSE_POINT; }
  }

  /* One step of DT. Returns events for sound and display: 'hit0', 'hit1', 'table', 'net', 'point0' (player 0 won the
     point), 'point1', 'serve', 'over'. */
  function step(g, dt = DT) {
    const ev = [];
    g.time += dt;
    movePaddle(g, 0, dt); movePaddle(g, 1, dt);
    if (g.phase === 'over') return ev;
    if (g.phase === 'point') {
      g.timer -= dt;
      if (g.timer <= 0) { serve(g, serverFor(g)); ev.push('serve'); }
      return ev;
    }
    const b = g.ball;
    if (g.phase === 'play') {
      const e = fly(b, dt);
      if (e && e.type === 'net') ev.push('net');
      else if (e && e.type === 'table') {
        ev.push('table');
        // On the hitter's own side (after the net): their point is lost. The second bounce on the other side: won.
        if (e.side === b.hitter) { point(g, 1 - b.hitter, b.net ? 'net' : 'out', ev); return ev; }
        if (b.bounced) { point(g, b.hitter, 'miss', ev); return ev; }
        b.bounced = true;
      } else if (e && e.type === 'floor') {
        // Didn't reach the other side of the table: out (or net); reached it and wasn't returned: missed
        if (b.bounced) point(g, b.hitter, 'miss', ev);
        else point(g, 1 - b.hitter, b.net ? 'net' : 'out', ev);
        return ev;
      }
    }
    // Hits: the server hits the waiting ball; the receiver only after the ball bounced on their side
    for (const i of [0, 1]) {
      const m = g.paddles[i];
      const can = g.phase === 'serve' ? i === g.server : b.hitter !== i && b.bounced && sideOf(b.y) === i;
      if (!can || Math.hypot(b.x - m.x, b.y - m.y) > PADDLE_R + BALL_R) continue;
      // Serve: the paddle has to move into the ball (a resting paddle doesn't serve)
      if (g.phase === 'serve' && Math.hypot(m.vx, m.vy) < 20) continue;
      const v = shot(b, m, i);
      Object.assign(b, v, { hitter: i, bounced: false, net: false, serve: false, z: Math.max(b.z, 1) });
      // Out of the paddle, so it isn't hit again at once
      b.y = m.y + dirOf(i) * Math.max(Math.abs(b.y - m.y), 0.5);
      g.phase = 'play'; g.rally++; g.shots++;
      ev.push('hit' + i);
      break;
    }
    return ev;
  }

  /* The flight of the ball from now on (no paddles): samples { t, x, y, z, vx, vy } after each step, until it lands on
     the floor, bounces a second time or maxT is over. The first bounce on side `side` is marked with `bounce`. */
  function predict(b, maxT = 3) {
    const c = { ...b }, out = [];
    let bounces = 0, tBounce = null;
    for (let t = DT; t <= maxT; t += DT) {
      const e = fly(c, DT);
      if (e && (e.type === 'floor' || e.type === 'net')) break;
      if (e && e.type === 'table') {
        if (sideOf(c.y) === c.hitter || ++bounces > 1) break;
        tBounce = t;
      }
      out.push({ t, x: c.x, y: c.y, z: c.z, vx: c.vx, vy: c.vy, after: tBounce !== null });
    }
    return { samples: out, tBounce };
  }

  // Swing speed needed for a shot from (x, y) that lands `len` behind the net, and its flight time
  const lenOf = sw => L_MIN + L_ADD * (1 - Math.exp(-sw / SWING));
  const vfOf = sw => V_MIN + V_ADD * (1 - Math.exp(-sw / SWING));

  /* Computer player for player 1 (top). Returns the target for its paddle; mem keeps the plan for the current shot
     (where and when it meets the ball, swing, aim) between calls. rnd: random numbers 0…1 (tests: fixed sequence).
     It places the paddle behind the meeting point and moves it through it with the chosen swing. */
  function aiTarget(g, level, mem, rnd = Math.random, i = 1) {
    const L = LEVELS[level] || LEVELS.medium, b = g.ball, m = g.paddles[i], dir = dirOf(i), bd = bounds(i);
    const h = home(i);
    const id = g.phase + ':' + g.shots + ':' + g.score.join('-');
    if (mem.id !== id) {
      mem.id = id; mem.plan = null; mem.t0 = g.time;
      if (g.phase === 'serve' && g.server === i) {
        mem.plan = { x: b.x, y: b.y, vx: 0, t: L.think + 0.5 + rnd() * 0.4 };
      } else if (g.phase === 'play' && b.hitter !== i) {
        const { samples, tBounce } = predict(b);
        if (tBounce !== null) {
          // Meet the ball a little after the bounce, while it is still in reach
          const want = tBounce + L.late + rnd() * 0.08;
          const reach = samples.filter(s => s.after && s.x > bd.x0 && s.x < bd.x1 && s.y > bd.y0 + 2 && s.y < bd.y1);
          const s = reach.find(s => s.t >= want) || reach[reach.length - 1];
          if (s) mem.plan = { x: s.x, y: s.y, vx: s.vx, t: s.t };
        }
      }
      if (mem.plan) {
        // Swing and aim: a random spot on the other half, with a margin from the edges
        const sw = L.swing[0] + rnd() * (L.swing[1] - L.swing[0]);
        let tx = TX0 + L.margin + rnd() * (TX1 - TX0 - 2 * L.margin);
        // A stronger computer often plays to the side away from the other paddle
        if (rnd() < L.away) {
          const o = g.paddles[1 - i].x, half = (TX1 - TX0) / 2 - L.margin;
          tx = (o > W / 2 ? TX0 + L.margin : TX1 - L.margin) + (o > W / 2 ? 1 : -1) * rnd() * half * 0.5;
        }
        const land = NET_Y + dir * lenOf(sw);
        const T = Math.abs(land - mem.plan.y) / vfOf(sw);
        const off = clamp(((tx - mem.plan.x) / T - mem.plan.vx * 0.2) / SIDE + (rnd() - 0.5) * 2 * L.err, -0.9, 0.9);
        mem.plan.sw = sw; mem.plan.dx = -off * (PADDLE_R + BALL_R) * 0.95;
      }
    }
    m.speed = L.speed;
    const p = mem.plan;
    if (!p) {
      // Waiting: back to the base line, following the ball sideways a little
      const bx = b ? b.x : W / 2;
      return { x: W / 2 + (bx - W / 2) * 0.5, y: h.y };
    }
    const tau = p.t - (g.time - mem.t0);
    if (g.time - mem.t0 < L.think) return { x: m.tx, y: m.ty };   // still taking in the shot
    if (tau < -0.25) return { x: W / 2, y: h.y };
    // A point that moves through the meeting point with the swing speed; the paddle follows it
    const y = p.y - dir * p.sw * Math.max(tau, -0.15) - dir * (PADDLE_R + BALL_R) * 0.5;
    return { x: p.x + p.dx, y: clamp(y, bd.y0, bd.y1) };
  }

  root.PingEngine = { W, H, TX0, TX1, TY0, TY1, NET_Y, NET_H, NET_OVER, BALL_R, PADDLE_R, DT, G, BOUNCE, PADDLE_SPEED,
    V_MIN, V_ADD, L_MIN, L_ADD, SWING, SIDE, PAUSE_POINT, SERVE_Z, LEVELS,
    bounds, overTable, createGame, setTarget, step, serve, serverFor, shot, fly, predict, aiTarget };
})(typeof self !== 'undefined' ? self : globalThis);
