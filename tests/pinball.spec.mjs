// Flipper: physics checked against values computed here (plunger, flippers, bumper, slingshot, spinner, ball against
// ball, sensor lines), the rules (top lanes with lane change and multiplier, drop targets, ramp, lock and multiball with
// jackpot, saucer, kickback, bonus on drain, ball save, game over after the last ball) and long seeded runs on every
// table in which the ball never leaves the cabinet, never slips back into the shooter lane and never gets stuck.
// In the page: the right half pulls and releases the plunger, two fingers hold both flippers, the table choice, pause
// and resume, a whole game ends with the best score stored per table, settings of the first version are taken over,
// English.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

const { E, T } = (() => {
  const c = {};
  vm.runInNewContext(readFileSync('pinball/tables.js', 'utf8') + readFileSync('pinball/engine.js', 'utf8'), { self: c, Math });
  return { E: c.PinballEngine, T: c.PinballTables };
})();
const KOMET = T.byId.komet, DEEP = T.byId.tiefsee;
const { DT, BALL_R, FLIP_R, LANE_REST, LANE_X, SEP_X, CX } = E;
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const steps = (g, n) => { const ev = []; for (let k = 0; k < n; k++) ev.push(...E.step(g)); return ev; };
const ball = g => g.live[0];
const put = (b, p) => Object.assign(b, p, { px: p.x ?? b.x, py: p.y ?? b.y });
// A game with the ball already in play at a given spot (ball save off)
const inPlay = (table, b, opts) => { const g = E.createGame(table, opts); g.phase = 'play'; g.launched = true; put(ball(g), b); return g; };
// Run until a condition holds (or the time is up); returns the events on the way
const until = (g, cond, secs = 5) => { const ev = []; for (let k = 0; k < secs / DT && !cond(); k++) ev.push(...E.step(g)); return ev; };

test.describe('engine', () => {
  test('the ball waits on the plunger; pulling moves it down; letting go launches it with the pulled strength', () => {
    const g = E.createGame(KOMET);
    steps(g, 100);
    expect(ball(g)).toMatchObject({ x: LANE_X, y: LANE_REST, vx: 0, vy: 0 });
    E.setPlunger(g, true);
    steps(g, Math.round(E.PULL_TIME / 2 / DT));
    expect(g.pull).toBeCloseTo(0.5, 6);
    expect(ball(g).y).toBeCloseTo(LANE_REST + 3, 6);
    const ev = E.setPlunger(g, false);
    expect(ev).toEqual(['launch']);
    expect(ball(g).vy).toBeCloseTo(-(228 + (300 - 228) * 0.5), 6);
    expect(ball(g).y).toBe(LANE_REST);
    expect(g.saveUntil).toBeCloseTo(g.time + 8, 6);
    // Full pull is capped at 1
    const h = E.createGame(KOMET); E.setPlunger(h, true); steps(h, Math.round(2 * E.PULL_TIME / DT));
    expect(h.pull).toBe(1);
  });

  test('a weak shot rises as high as gravity allows and falls back onto the plunger, ready again', () => {
    const g = E.createGame(KOMET);
    g.phase = 'play'; ball(g).vy = -150;
    let top = LANE_REST;
    for (let k = 0; k < 600 && g.phase !== 'launch'; k++) { E.step(g); top = Math.min(top, ball(g).y); }
    // Rise against gravity g with friction k (dv/dt = −g − k·v): v₀/k − g/k² · ln(1 + k·v₀/g) – a little below v₀² / 2g
    const k = 0.12, g0 = E.GRAVITY, rise = 150 / k - g0 / (k * k) * Math.log(1 + k * 150 / g0);
    expect(rise).toBeLessThan(150 * 150 / (2 * g0));
    expect(Math.abs(top - (LANE_REST - rise))).toBeLessThan(1);
    expect(g.phase).toBe('launch');
    expect(ball(g)).toMatchObject({ x: LANE_X, y: LANE_REST, vx: 0, vy: 0 });
    expect(E.setPlunger(g, true)).toEqual([]);
    expect(E.setPlunger(g, false)).toEqual(['launch']);
  });

  test('on every table a launch at any strength brings the ball through the gate; the gate keeps it out of the lane', () => {
    for (const table of T.list) {
      for (const pull of [0, 0.5, 1]) {
        const g = E.createGame(table);
        E.setPlunger(g, true); steps(g, Math.round(pull * E.PULL_TIME / DT)); E.setPlunger(g, false);
        until(g, () => ball(g).x < SEP_X, 2);
        expect(ball(g).x, `${table.id} pull ${pull}`).toBeLessThan(SEP_X);
        expect(g.phase).toBe('play');
      }
      // A ball dropping onto the gate from above rolls off to the left
      const g = inPlay(table, { x: 96, y: 40, vx: 0, vy: 0 });
      const ev = steps(g, Math.round(1.5 / DT));
      expect(ball(g).x, table.id).toBeLessThan(SEP_X - BALL_R);
      expect(ev).not.toContain('saved');
    }
  });

  test('flippers swing between rest and up at their speed; the right one mirrors the left', () => {
    const g = E.createGame(KOMET);
    const [l, r] = g.flippers;
    const tip = E.flipperTip(l);
    expect(tip.x).toBeCloseTo(28 + 13 * Math.cos(0.5), 9);
    expect(tip.y).toBeCloseTo(158 + 13 * Math.sin(0.5), 9);
    expect(E.flipperTip(r).x).toBeCloseTo(2 * CX - tip.x, 9);
    // The gap between the tips at rest lets the ball through
    expect(E.flipperTip(r).x - tip.x - 2 * FLIP_R).toBeGreaterThan(2 * BALL_R);
    E.setFlipper(g, 0, true);
    const n = Math.ceil((0.5 + 0.42) / (E.FLIP_SPEED * DT));
    steps(g, n - 1);
    expect(l.a).toBeGreaterThan(-0.42);
    expect(l.w).toBeCloseTo(-E.FLIP_SPEED, 6);
    steps(g, 1);
    expect(l.a).toBeCloseTo(-0.42, 9);
    steps(g, 1);
    expect(l.w).toBe(0);
    expect(r.a).toBe(0.5);
    // flipperVel is the speed of a point on the moving flipper: compare with how far the tip really moved
    E.setFlipper(g, 0, false); E.setFlipper(g, 1, true);
    for (const f of [l, r]) {
      E.step(g);
      const t0 = E.flipperTip(f); E.step(g); const t1 = E.flipperTip(f);
      const mid = { x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2 }, v = E.flipperVel(f, mid.x, mid.y);
      expect(v.x).toBeCloseTo((t1.x - t0.x) / DT, 0);
      expect(v.y).toBeCloseTo((t1.y - t0.y) / DT, 0);
    }
  });

  test('a ball lying on the flipper is shot upwards when the flipper swings up', () => {
    const a = 0.5, d = 9, c = FLIP_R + BALL_R + 0.05;
    // On the left flipper, 9 units from the pivot, touching its upper side
    const g = inPlay(KOMET, { x: 28 + d * Math.cos(a) + c * Math.sin(a), y: 158 + d * Math.sin(a) - c * Math.cos(a), vx: 0, vy: 0 });
    E.setFlipper(g, 0, true);
    const ev = steps(g, 8);
    expect(ev).toContain('flip0');
    // The surface there moves at ω·r = 20 · 9 = 180 units/s; the ball leaves at least that fast, upwards
    expect(Math.hypot(ball(g).vx, ball(g).vy)).toBeGreaterThan(180);
    expect(ball(g).vy).toBeLessThan(-150);
  });

  test('a pop bumper kicks the ball away at its kick speed and scores 100', () => {
    const p = KOMET.bumpers[2];
    const g = inPlay(KOMET, { x: p.x, y: p.y + p.r + BALL_R + 2, vx: 0, vy: -40 });
    const ev = steps(g, 20);
    expect(ev.filter(e => e === 'bumper')).toHaveLength(1);
    expect(g.score).toBe(100);
    // Straight from below: straight back down, at the kick speed (plus gravity and friction of a few steps)
    expect(Math.abs(ball(g).vx)).toBeLessThan(1e-6);
    expect(ball(g).vy).toBeGreaterThan(E.BUMPER_KICK - 2);
    expect(ball(g).vy).toBeLessThan(E.BUMPER_KICK + E.GRAVITY * 20 * DT);
  });

  test('a slingshot kicks the ball back towards the middle and scores 10', () => {
    // The kicking side of the left slingshot runs from (15.5, 120) to (25, 144); the ball comes from the middle
    const sx = 20.25, sy = 132, len = Math.hypot(9.5, 24), nx = 24 / len, ny = -9.5 / len;
    const g = inPlay(KOMET, { x: sx + nx * 6, y: sy + ny * 6, vx: -nx * 60, vy: -ny * 60 });
    const ev = steps(g, 30);
    expect(ev).toContain('sling');
    expect(g.score).toBe(10);
    expect(ball(g).vx * nx + ball(g).vy * ny).toBeGreaterThan(E.SLING_KICK);
  });

  test('two balls bounce off each other and exchange most of their speed', () => {
    const g = inPlay(KOMET, { x: 40, y: 100, vx: 50, vy: 0 });
    g.live.push(put({ ...ball(g), zone: {} }, { x: 46, y: 100, vx: -50, vy: 0 }));
    steps(g, 12);
    // Equal masses, bounce 0.9: each keeps −0.9 × the relative speed / 2 = ∓45 along the line (friction: a few ‰ less)
    expect(g.live[0].vx).toBeCloseTo(-45, 0);
    expect(g.live[1].vx).toBeCloseTo(45, 0);
    expect(g.live[1].x - g.live[0].x).toBeGreaterThanOrEqual(2 * BALL_R - 1e-9);
  });

  test('a sensor line counts a crossing forwards or backwards, only between its ends', () => {
    const line = { x0: 0, y0: 10, x1: 10, y1: 10 };   // forward = upwards (from y > 10 to y < 10)
    expect(E.crossed(line, { px: 5, py: 11, x: 5, y: 9 })).toBe(1);
    expect(E.crossed(line, { px: 5, py: 9, x: 5, y: 11 })).toBe(-1);
    expect(E.crossed(line, { px: 5, py: 12, x: 5, y: 11 })).toBe(0);
    expect(E.crossed(line, { px: 12, py: 11, x: 12, y: 9 })).toBe(0);
    expect(E.crossed(line, { px: 2, py: 11, x: 4, y: 9 })).toBe(1);
  });

  test('top lanes light up; all three raise the multiplier; a flipper press moves the lit lanes', () => {
    const g = inPlay(KOMET, {});
    const lanes = KOMET.rollovers[0].lanes;
    const through = i => { put(ball(g), { x: lanes[i].x, y: lanes[i].y0 - 2, vx: 0, vy: 40 }); return steps(g, 30); };
    expect(through(0)).toContain('lane');
    expect(g.lit.top).toEqual([true, false, false]);
    E.setFlipper(g, 1, true); E.setFlipper(g, 1, false);
    expect(g.lit.top).toEqual([false, true, false]);
    E.setFlipper(g, 0, true); E.setFlipper(g, 0, false);
    E.setFlipper(g, 0, true);
    expect(g.lit.top).toEqual([false, false, true]);
    E.setFlipper(g, 0, true);   // still held: no second step
    expect(g.lit.top).toEqual([false, false, true]);
    E.setFlipper(g, 0, false);
    through(2);   // already lit: 100
    expect(g.score).toBe(600);
    through(0);
    const ev = through(1);
    expect(ev).toContain('lanesAll');
    expect(g.mult).toBe(2);
    expect(g.lit.top).toEqual([false, false, false]);
    expect(g.score).toBe(500 + 100 + 500 + 500 + 2000);
    expect(g.bonus).toBe(300);
  });

  test('drop targets fall when hit; all three score 3000 × multiplier and stand up again, never under a ball', () => {
    const g = inPlay(KOMET, {});
    g.mult = 2;
    const bank = KOMET.banks[0];
    const hit = i => { const t = bank.targets[i]; put(ball(g), { x: t.x0 - 1 - BALL_R - 3, y: (t.y0 + t.y1) / 2, vx: 80, vy: 0 }); return steps(g, 12); };
    expect(hit(1)).toContain('target');
    expect(g.down.right).toEqual([false, true, false]);
    expect(ball(g).vx).toBeLessThan(0);
    hit(0);
    const ev = hit(2);
    expect(ev).toContain('bankAll');
    expect(g.score).toBe(3 * 250 + 3000 * 2);
    expect(g.bonus).toBe(300);
    expect(g.saveUntil).toBeGreaterThan(g.time + 3);   // Komet: the bank gives a short ball save
    // A ball lies where the middle target stands (held there): that one waits, the others stand up
    const t = bank.targets[1];
    for (let k = 0; k < 0.5 / DT; k++) { put(ball(g), { x: t.x0 + 0.5, y: (t.y0 + t.y1) / 2, vx: 0, vy: 0 }); E.step(g); }
    expect(g.down.right).toEqual([false, true, false]);
    put(ball(g), { x: 40, y: 100, vx: 0, vy: 0 });
    steps(g, 1);
    expect(g.down.right).toEqual([false, false, false]);
  });

  test('a lost ball adds bonus × multiplier, then the next ball waits; after the last ball the game is over', () => {
    const g = inPlay(KOMET, { x: CX, y: 170, vx: 0, vy: 50 }, { balls: 2 });
    g.bonus = 700; g.mult = 3; g.score = 1000;
    let ev = steps(g, 60);
    expect(ev).toContain('drain');
    expect(g.score).toBe(1000 + 2100);
    expect([g.bonus, g.mult, g.lastBonus, g.lastMult]).toEqual([0, 1, 2100, 3]);
    ev = steps(g, Math.ceil(1.6 / DT));
    expect(ev).toContain('ball');
    expect(g.ball).toBe(2);
    expect(g.phase).toBe('launch');
    E.setPlunger(g, true); E.setPlunger(g, false);
    put(ball(g), { x: CX, y: 170, vx: 0, vy: 50 }); g.saveUntil = 0;
    ev = steps(g, 60 + Math.ceil(1.6 / DT));
    expect(ev).toContain('over');
    expect(g.phase).toBe('over');
    expect(g.ball).toBe(2);
  });

  test('ball save: a ball lost right after the launch comes back onto the plunger', () => {
    const g = E.createGame(KOMET);
    E.setPlunger(g, true); E.setPlunger(g, false);
    steps(g, 120);
    put(ball(g), { x: CX, y: 170, vx: 0, vy: 50 });
    const ev = steps(g, 60);
    expect(ev).toContain('saved');
    expect(ev).not.toContain('drain');
    expect([g.ball, g.saved, g.phase]).toEqual([1, 1, 'launch']);
    expect(ball(g)).toMatchObject({ x: LANE_X, y: LANE_REST, vy: 0 });
    // Only once per launch: the next launch does not start a new ball save
    E.setPlunger(g, true); E.setPlunger(g, false);
    expect(g.saveUntil).toBe(0);
  });

  test('Tiefsee ramp: a strong shot goes over the ramp into the left inlane; a weak one rolls back out', () => {
    const ramp = DEEP.ramps[0], mouth = (ramp.enter.x0 + ramp.enter.x1) / 2;
    let g = inPlay(DEEP, { x: mouth, y: 104, vx: 0, vy: -280 });
    let ev = until(g, () => ball(g).y > 132 && ball(g).layer === 0 && g.ramps === 1);
    expect(ev.filter(e => /^ramp/.test(e))).toEqual(['rampIn', 'ramp']);
    expect(g.score).toBe(1000);
    expect(ball(g).layer).toBe(0);
    // Dropped inside the left inlane: between the inlane guide (x 7.5) and the slingshot (x 15.5)
    expect(ball(g).x).toBeGreaterThan(7.5);
    expect(ball(g).x).toBeLessThan(15.5);
    // Weak: up the ramp, back out of the mouth, onto the playfield
    g = inPlay(DEEP, { x: mouth, y: 104, vx: 0, vy: -150 });
    ev = until(g, () => ball(g).y > 106 && ball(g).vy > 0);
    expect(ev.filter(e => /^ramp/.test(e))).toEqual(['rampIn', 'rampBack']);
    expect(ball(g).layer).toBe(0);
    expect(g.score).toBe(0);
  });

  test('Tiefsee multiball: two ramps light the lock, the saucer starts it, ramps then score the jackpot', () => {
    const ramp = DEEP.ramps[0], mouth = (ramp.enter.x0 + ramp.enter.x1) / 2, saucer = DEEP.saucers[0];
    const g = inPlay(DEEP, {});
    const shoot = () => { put(ball(g), { x: mouth, y: 104, vx: 0, vy: -280, layer: 0 }); const n = g.ramps; return until(g, () => g.ramps > n); };
    expect(shoot()).not.toContain('lockLit');
    expect(shoot()).toContain('lockLit');
    expect(g.lamps.lock).toBe(true);
    // Into the saucer: held, a second ball is shot in, then the first comes out
    put(ball(g), { x: saucer.x, y: saucer.y - 4, vx: 0, vy: 30 });
    let ev = until(g, () => g.live.length === 2 && g.live.every(b => b.hold === 0), 4);
    expect(ev).toEqual(expect.arrayContaining(['saucer', 'multiball', 'launch', 'saucerKick']));
    expect(ev.indexOf('launch')).toBeLessThan(ev.indexOf('saucerKick'));
    expect([g.multiball, g.lamps.lock, g.queue]).toEqual([true, false, 0]);
    expect(g.saveUntil).toBeGreaterThan(g.time);
    // The second ball waits in the saucer meanwhile, so only the ramp scores
    Object.assign(g.live[1], { hold: 30, saucer: saucer });
    const before = g.score;
    ev = shoot();
    expect(ev).toContain('jackpot');
    expect(g.score - before).toBe(1000 + 5000);
    // One ball lost (no ball save any more): the multiball ends, the game goes on with the other ball
    g.saveUntil = 0;
    put(g.live[1], { x: CX, y: 175, vx: 0, vy: 80, hold: 0, saucer: null });
    put(g.live[0], { x: 40, y: 100, vx: 0, vy: 0 });
    ev = steps(g, 30);
    expect(ev).toContain('multiballEnd');
    expect(ev).not.toContain('drain');
    expect([g.multiball, g.live.length, g.phase]).toEqual([false, 1, 'play']);
  });

  test('Tiefsee saucer without lock: holds the ball, then kicks it out towards the flippers', () => {
    const s = DEEP.saucers[0];
    const g = inPlay(DEEP, { x: s.x, y: s.y - 4, vx: 0, vy: 30 });
    let ev = until(g, () => ball(g).hold > 0, 1);
    expect(ev).toContain('saucer');
    expect(g.score).toBe(750);
    expect(ball(g)).toMatchObject({ x: s.x, y: s.y, vx: 0, vy: 0 });
    ev = steps(g, Math.round(E.SAUCER_HOLD / DT) + 1);
    expect(ev).toEqual(['saucerKick']);
    expect([ball(g).vx, ball(g).vy]).toEqual([s.out.vx, s.out.vy]);
    expect(g.multiball).toBe(false);
  });

  test('Tiefsee spinner: turns per pass grow with the speed, 30 points each', () => {
    const sp = DEEP.spinners[0];
    const g = inPlay(DEEP, { x: 86, y: sp.y0 + 8, vx: 0, vy: -200 });
    const ev = until(g, () => ball(g).y < sp.y0 - 4, 1);
    expect(ev).toContain('spinner');
    // About 8 units up from 200 units/s: gravity takes ≈ 8 units/s → ≈ 192 → 192 / 25 ≈ 8 turns
    expect(g.score).toBe(8 * 30);
  });

  test('Tiefsee kickback: the drop targets switch it on, it shoots one ball back out of the outlane', () => {
    const g = inPlay(DEEP, {});
    const bank = DEEP.banks[0];
    for (const t of bank.targets) { put(ball(g), { x: t.x0 - 1 - BALL_R - 3, y: (t.y0 + t.y1) / 2, vx: 80, vy: 0 }); steps(g, 12); }
    expect(g.lamps.kickback).toBe(true);
    put(ball(g), { x: 3.6, y: 128, vx: 0, vy: 60 });
    const ev = until(g, () => ball(g).vy < 0, 1);
    expect(ev).toContain('kickback');
    expect(ball(g).vy).toBeCloseTo(-250, 0);
    expect(g.lamps.kickback).toBe(false);
    until(g, () => ball(g).y < 115, 1);
    expect(ball(g).y).toBeLessThan(115);   // back above the outlane
    // Not lit any more: the next ball in the outlane is lost
    put(ball(g), { x: 3.6, y: 128, vx: 0, vy: 60 });
    expect(until(g, () => g.phase !== 'play', 2)).toContain('drain');
  });

  test('long seeded games on every table: the ball stays in the cabinet, never slips into the shooter lane and never gets stuck', () => {
    for (const table of T.list) {
      const rnd = lcg(11), count = {};
      let games = 0, problem = null;
      for (let n = 0; n < 12; n++) {
        const g = E.createGame(table, { balls: 3 }), hold = [0, 0], wasLane = new Map();
        let t = 0;
        while (g.phase !== 'over' && t < 600) {
          if (g.phase === 'launch') { E.setPlunger(g, true); steps(g, Math.floor(rnd() * 200)); E.setPlunger(g, false); }
          for (const s of [0, 1]) {
            const near = g.live.some(b => b.layer === 0 && b.y > 145 && b.y < 168 && (s === 0 ? b.x > 22 && b.x < CX : b.x > CX && b.x < 69) && b.vy > -20);
            if (near && !g.held[s] && rnd() < 0.5) { E.setFlipper(g, s, true); hold[s] = 0.15; }
            if (g.held[s] && (hold[s] -= DT) <= 0) E.setFlipper(g, s, false);
          }
          for (const e of E.step(g)) count[e] = (count[e] || 0) + 1;
          t += DT;
          // Plain checks per step (an expect() per step would make the test very slow); the first problem is reported below
          for (const b of g.live) {
            const lane = b.x > SEP_X && b.y > 62;
            if (!problem && !(Number.isFinite(b.x) && Number.isFinite(b.y) && b.x >= BALL_R - 1e-9 && b.x <= 100 - BALL_R + 1e-9 && b.y >= BALL_R - 1e-9)) problem = `outside the cabinet at ${b.x}, ${b.y}`;
            if (!problem && lane && wasLane.get(b) === false && g.phase === 'play') problem = `slipped into the shooter lane at ${b.x}, ${b.y}`;
            wasLane.set(b, lane);
          }
        }
        if (g.phase === 'over') games++;
      }
      expect(problem, table.id).toBeNull();
      expect(games, table.id).toBe(12);
      expect(count.nudge || 0, table.id).toBe(0);
      const want = ['bumper', 'sling', 'lane', 'target', 'flip0', 'flip1', 'drain', 'saved'];
      if (table.ramps.length) want.push('ramp', 'spinner', 'saucer', 'kickback');
      for (const e of want) expect(count[e], `${table.id}: ${e}`).toBeGreaterThan(0);
    }
  });
});

/* ---------- Page ---------- */
const diag = async page => {
  const txt = await page.evaluate(() => Tools.diag.text());
  const get = k => { const v = txt.match(new RegExp(`^${k}: (.*)$`, 'm'))[1]; try { return JSON.parse(v); } catch { return v; } };
  return { game: get('game'), held: get('held'), flippers: get('flippers'), pull: get('pull'), pos: get('pos'), ball: get('ball') };
};
// Synthetic pointer events with their own pointerId (several fingers at once), position as a share of the canvas
async function finger(page, type, id, fx, fy) {
  await page.evaluate(([type, id, fx, fy]) => {
    const cv = document.getElementById('cv'), r = cv.getBoundingClientRect();
    cv.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, bubbles: true, cancelable: true,
      clientX: r.left + r.width * fx, clientY: r.top + r.height * fy, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
  }, [type, id, fx, fy]);
}

test.describe('page', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: 0 });
    await page.setViewportSize({ width: 375, height: 740 });
  });

  test('the right half pulls and launches the plunger; two fingers hold both flippers', async ({ page }) => {
    await page.goto('/pinball/');
    await expect(page.locator('#hudBall')).toHaveText('Kugel 1/3');
    await page.click('#btnStart');
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('#table')).toHaveAttribute('data-phase', 'play');
    await expect(page.locator('#status')).toHaveText('Kugel 1 von 3. Rechts gedrückt halten und loslassen zum Abschießen.');
    await finger(page, 'pointerdown', 1, 0.75, 0.6);
    await page.clock.runFor(500);
    let d = await diag(page);
    expect(d.held).toBe('P');
    expect(d.pull).toBeGreaterThan(0.4);
    expect(d.flippers).toEqual([false, false]);   // the right half pulls the spring instead of flipping
    await finger(page, 'pointerup', 1, 0.75, 0.6);
    await page.clock.runFor(1500);
    d = await diag(page);
    expect(d.game).toBe('play');
    expect(d.pos[0]).toBeLessThan(91);
    // Now both halves flip, both at once
    await finger(page, 'pointerdown', 2, 0.2, 0.9);
    await finger(page, 'pointerdown', 3, 0.8, 0.9);
    d = await diag(page);
    expect(d.flippers).toEqual([true, true]);
    expect(d.held).toBe('LR');
    await finger(page, 'pointerup', 2, 0.2, 0.9);
    expect((await diag(page)).flippers).toEqual([false, true]);
    await finger(page, 'pointerup', 3, 0.8, 0.9);
    expect((await diag(page)).flippers).toEqual([false, false]);
  });

  test('vibration on a flipper is long enough to be felt (30 ms); off in the settings', async ({ page }) => {
    await page.addInitScript(() => {
      window.__vib = [];
      Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: p => { window.__vib.push(p); return true; } });
    });
    await page.goto('/pinball/');
    await page.click('#btnStart');
    await finger(page, 'pointerdown', 1, 0.75, 0.6);
    await finger(page, 'pointerup', 1, 0.75, 0.6);
    await page.clock.runFor(1500);
    await finger(page, 'pointerdown', 2, 0.2, 0.9);
    await finger(page, 'pointerup', 2, 0.2, 0.9);
    const vib = await page.evaluate(() => window.__vib);
    expect(vib.length).toBeGreaterThan(0);
    // Every vibration at least 30 ms – 8 ms were not felt on many Android phones
    for (const p of vib) for (const [i, v] of [p].flat().entries()) if (i % 2 === 0) expect(v).toBeGreaterThanOrEqual(30);
    // Switched off: no vibration at all
    await page.evaluate(() => { Tools.save('pinball.settings.v2', Object.assign(Tools.load('pinball.settings.v2', {}), { vibrate: false })); });
    await page.reload();
    await page.click('#btnStart');
    await finger(page, 'pointerdown', 1, 0.75, 0.6);
    await finger(page, 'pointerup', 1, 0.75, 0.6);
    await page.clock.runFor(1500);
    await finger(page, 'pointerdown', 2, 0.2, 0.9);
    expect(await page.evaluate(() => window.__vib)).toEqual([]);
  });

  test('keyboard: arrows flip, space launches; P pauses, the header comes back; resume', async ({ page }) => {
    await page.goto('/pinball/');
    await expect(page.locator('#btnPause')).toBeHidden();
    await page.click('#btnStart');
    await expect(page.locator('body > header')).toBeHidden();
    await expect(page.locator('#btnPause')).toBeVisible();
    await page.keyboard.down('Space');
    await page.clock.runFor(300);
    expect((await diag(page)).held).toBe('P');
    await page.keyboard.up('Space');
    await page.clock.runFor(1500);
    expect((await diag(page)).pos[0]).toBeLessThan(91);
    await page.keyboard.down('ArrowLeft');
    expect((await diag(page)).flippers).toEqual([true, false]);
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('p');
    await expect(page.locator('#table')).toHaveAttribute('data-phase', 'paused');
    await expect(page.locator('#panelTitle')).toHaveText('Pause');
    await expect(page.locator('#startLabel')).toHaveText('Weiterspielen');
    await expect(page.locator('body > header')).toBeVisible();
    const frozen = (await diag(page)).pos;
    await page.clock.runFor(1000);
    expect((await diag(page)).pos).toEqual(frozen);
    await page.click('#btnStart');
    await expect(page.locator('#table')).toHaveAttribute('data-phase', 'play');
    await page.click('#btnPause');
    await expect(page.locator('#table')).toHaveAttribute('data-phase', 'paused');
  });

  test('a whole game without flipping ends; the best score is stored; settings are kept', async ({ page }) => {
    await page.goto('/pinball/');
    await openMenu(page);
    await page.locator('#optSound').uncheck();
    await page.locator('#optVibrate').uncheck();
    await page.click('#optBalls [data-v="5"]');
    await page.click('#optBalls [data-v="3"]');
    await closeMenu(page);
    await expect(page.locator('#best')).toHaveText('Noch kein Bestwert auf „Komet“ mit 3 Kugeln.');
    await page.click('#btnStart');
    // Launch whenever the ball waits on the plunger, never flip
    for (let n = 0; n < 200 && await page.locator('#table').getAttribute('data-phase') !== 'over'; n++) {
      const d = await diag(page);
      if (d.game === 'launch') { await page.keyboard.down('Enter'); await page.clock.runFor(400); await page.keyboard.up('Enter'); }
      await page.clock.runFor(2000);
    }
    await expect(page.locator('#table')).toHaveAttribute('data-phase', 'over');
    const score = Number((await page.locator('#panelScore').textContent()).replace(/\D/g, ''));
    expect(score).toBeGreaterThan(0);
    await expect(page.locator('#panelTitle')).toHaveText('Neuer Bestwert!');
    await expect(page.locator('#startLabel')).toHaveText('Nochmal');
    await expect(page.locator('#status')).toHaveText(/^Spiel vorbei\. [\d.]+ Punkte\.$/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pinball.settings.v2'))))
      .toEqual({ table: 'komet', balls: 3, sound: false, fullscreen: true, vibrate: false, best: { komet: { 3: score } } });
    await page.reload();
    await expect(page.locator('#best')).toHaveText(`Bestwert (Komet, 3 Kugeln): ${score.toLocaleString('de-DE')}`);
    await expect(page.locator('#optSound')).not.toBeChecked();
  });

  test('choosing a table: its layout and colours, description and best score; kept after a reload', async ({ page }) => {
    await page.goto('/pinball/');
    await expect(page.locator('#tables button')).toHaveText(['Komet', 'Tiefsee']);
    await expect(page.locator('#tables [data-table="komet"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#table')).toHaveAttribute('data-table', 'komet');
    const field = () => page.locator('#table').evaluate(el => getComputedStyle(el).getPropertyValue('--field').trim());
    const kometField = await field();
    await page.click('#tables [data-table="tiefsee"]');
    await expect(page.locator('#tables [data-table="tiefsee"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#table')).toHaveAttribute('data-table', 'tiefsee');
    expect(await field()).not.toBe(kometField);
    await expect(page.locator('#tableDesc')).toHaveText(/^Mittel: Rampe/);
    await expect(page.locator('#best')).toHaveText('Noch kein Bestwert auf „Tiefsee“ mit 3 Kugeln.');
    await page.reload();
    await expect(page.locator('#tables [data-table="tiefsee"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#btnStart');
    expect(await page.evaluate(async () => (await Tools.diag.text()).match(/^table: (.*)$/m)[1])).toBe('tiefsee');
    await expect(page.locator('#tables')).toBeHidden();
    // Paused: no table choice; after the game it is back
    await page.click('#btnPause');
    await expect(page.locator('#tables')).toBeHidden();
  });

  test('settings and best score of the first version are taken over (Komet)', async ({ page }) => {
    await page.addInitScript(() => { if (!localStorage.getItem('pinball.settings.v2')) localStorage.setItem('pinball.settings.v1', JSON.stringify({ balls: 3, sound: false, fullscreen: true, vibrate: false, best: { 3: 1234 } })); });
    await page.goto('/pinball/');
    await expect(page.locator('#best')).toHaveText('Bestwert (Komet, 3 Kugeln): 1.234');
    await page.click('#tables [data-table="tiefsee"]');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pinball.settings.v2'))))
      .toEqual({ table: 'tiefsee', balls: 3, sound: false, fullscreen: true, vibrate: false, best: { komet: { 3: 1234 } } });
  });

  test('Play switches to full screen; leaving it during the game pauses', async ({ page }) => {
    await page.addInitScript(() => {
      let el = null;
      const set = v => { el = v; document.dispatchEvent(new Event('fullscreenchange')); };
      Object.defineProperty(document, 'fullscreenElement', { get: () => el, configurable: true });
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => true, configurable: true });
      window.__fsCalls = 0;
      Element.prototype.requestFullscreen = function () { window.__fsCalls++; set(this); return Promise.resolve(); };
      document.exitFullscreen = () => { set(null); return Promise.resolve(); };
    });
    await page.goto('/pinball/');
    await page.click('#btnStart');
    await expect.poll(() => page.evaluate(() => window.__fsCalls)).toBe(1);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#table')).toHaveAttribute('data-phase', 'paused');
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('texts in English', async ({ page }) => {
      await page.goto('/pinball/');
      await expect(page.locator('h1')).toHaveText('Pinball');
      await expect(page.locator('#best')).toHaveText('No best score on “Comet” with 3 balls yet.');
      await expect(page.locator('#tables button')).toHaveText(['Comet', 'Deep Sea']);
      await expect(page.locator('#hudBall')).toHaveText('Ball 1/3');
      await expect(page.locator('#panelText')).toHaveText(/^Left half of the screen/);
      await switchLang(page, 'de');
      await expect(page.locator('#panelText')).toHaveText(/^Linke Bildschirmhälfte/);
      await expect(page.locator('#hudBall')).toHaveText('Kugel 1/3');
    });
  });
});
