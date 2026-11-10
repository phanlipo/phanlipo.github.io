// MovePlay: motion engine with synthetic body poses (jump, duck, squat, arms, clap, jumping jacks, calibration),
// game engine and the four mechanics with a seeded random generator (scores computed independently),
// game descriptions (JSON) and their validation, the page with a fake camera and a fake pose worker
// (download prompt, calibration, countdown, counting, pause when nobody is seen, result and best score, errors)
// and the real MediaPipe worker: network guard, works offline.
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fakeCamera } from './camera-fakes.mjs';
import { POSES } from './move-play-poses.mjs';

const URL_ = '/move-play/';

const FAKE_WORKER = `
const MODE = %MODE%;
${POSES}
let cur = null;
const bc = new BroadcastChannel('move-play-test');
bc.onmessage = ({ data }) => { if (data !== 'hello') cur = data; };
// Ask the test page for the pose it set before this worker started
bc.postMessage('hello');
self.onmessage = ({ data }) => {
  if (data.type === 'load') {
    if (MODE === 'fail') return setTimeout(() => self.postMessage({ type: 'error', code: 'download', message: 'offline' }), 50);
    self.postMessage({ type: 'progress', loaded: 50, total: 100 });
    setTimeout(() => self.postMessage({ type: 'loaded', delegate: 'CPU' }), 50);
  } else if (data.type === 'frame') {
    data.bitmap.close();
    setTimeout(() => { const poses = cur ? [makePose(cur)] : []; self.postMessage({ type: 'result', poses, ms: 3 }, poses.map(p => p.buffer)); }, 10);
  }
};`;
async function fakePoseWorker(page, mode = 'ok') {
  await page.context().route(/move-play\/pose-worker\.mjs/, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_WORKER.replace('%MODE%', JSON.stringify(mode)) }));
}
// What the fake worker reports from now on (makePose options, null = nobody)
const pose = (page, o) => page.evaluate(o => {
  if (!window.__bc) { window.__bc = new BroadcastChannel('move-play-test'); window.__bc.onmessage = ({ data }) => { if (data === 'hello') window.__bc.postMessage(window.__pose); }; }
  window.__pose = o; window.__bc.postMessage(o);
}, o === undefined ? {} : o);
const hold = async (page, o, ms = 350) => { await pose(page, o); await page.waitForTimeout(ms); };

/* ---------- Motion engine ---------- */
test.describe('motion engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(POSES + '\nwindow.makePose = makePose;');
    await page.goto(URL_);
    // Feeds a sequence of [pose options or null, ms] at 30 frames per second; returns the events
    await page.evaluate(() => {
      window.run = (m, seq) => {
        let t = window.lastT || 0; const events = [];
        for (const [o, ms] of seq) for (let i = 0; i < ms; i += 33) {
          t += 33;
          for (const e of m.update(o === null ? null : makePose(o), t, 4 / 3)) events.push(e.type);
        }
        window.lastT = t;
        return events;
      };
      window.calibrated = full => { const m = Motion.create({ full }); run(m, [[{}, 1500]]); return m; };
    });
  });

  test('calibration: whole body seen and standing still, then movements count', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = Motion.create({ full: true });
      const out = {};
      // Nobody, then only the upper body (ankles not seen): no calibration, no events
      out.before = run(m, [[null, 500], [{ hide: [27, 28], dy: 0.1 }, 300], [{ hide: [27, 28] }, 1500]]);
      out.partly = { calibrated: m.state.calibrated, visible: m.state.visible, present: m.state.present };
      // Whole body, but moving all the time
      for (let i = 0; i < 10; i++) run(m, [[{ x: (i % 2) * 0.06 }, 200]]);
      out.moving = m.state.calibrated;
      out.still = run(m, [[{}, 600]]);
      out.half = m.state.calib;
      run(m, [[{}, 800]]);
      out.done = m.state.calibrated;
      out.torso = Math.round(m.base.torso * 1000) / 1000;
      return out;
    });
    expect(r.before).toEqual([]);
    expect(r.partly).toEqual({ calibrated: false, visible: false, present: true });
    expect(r.moving).toBe(false);
    expect(r.still).toEqual([]);
    expect(r.half).toBeGreaterThan(0.3);
    expect(r.half).toBeLessThan(0.7);
    expect(r.done).toBe(true);
    // Shoulders (y 0.3) to hips (y 0.55) in the synthetic pose
    expect(r.torso).toBe(0.25);
  });

  test('upper body games calibrate without the feet', async ({ page }) => {
    expect(await page.evaluate(() => {
      const m = Motion.create({ full: false });
      run(m, [[{ hide: [25, 26, 27, 28, 29, 30, 31, 32] }, 1500]]);
      return m.state.calibrated;
    })).toBe(true);
  });

  test('jump: once per jump, not on tiptoe', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      return {
        tiptoe: run(m, [[{ dy: 0.03 }, 400], [{}, 400]]),
        jumps: run(m, [[{ dy: 0.08 }, 300], [{}, 400], [{ dy: 0.1 }, 200], [{ dy: 0.07 }, 200], [{}, 400]]),
        // Only the arms go up, the body stays: no jump
        arms: run(m, [[{ arms: 'up' }, 400], [{}, 400]]).filter(e => e === 'jump'),
      };
    });
    expect(r.tiptoe).toEqual([]);
    expect(r.jumps).toEqual(['jump', 'jump']);
    expect(r.arms).toEqual([]);
  });

  test('duck and squat', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      const duck = run(m, [[{ duck: 0.15 }, 400]]);
      const ducking = m.state.ducking;
      run(m, [[{}, 400]]);
      return { duck, ducking, after: m.state.ducking, small: run(m, [[{ duck: 0.06 }, 400], [{}, 300]]),
        // A squat lowers the head too
        squat: run(m, [[{ squat: 0.12 }, 400], [{}, 400]]).sort() };
    });
    expect(r.duck).toEqual(['duck']);
    expect(r.ducking).toBe(true);
    expect(r.after).toBe(false);
    expect(r.small).toEqual([]);
    expect(r.squat).toEqual(['duck', 'squat']);
  });

  test('arms: both up, left, right – and lowering both does not count as one', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      return {
        both: run(m, [[{ arms: 'up' }, 400], [{}, 400]]),
        // The player's left arm (on the right of the picture)
        left: run(m, [[{ arms: 'left' }, 500], [{}, 400]]),
        right: run(m, [[{ arms: 'right' }, 500], [{}, 400]]),
        // Too short to count as one arm
        brief: run(m, [[{ arms: 'left' }, 150], [{}, 400]]),
        // Raising one arm a little earlier than the other: only "both"
        stagger: run(m, [[{ arms: 'left' }, 120], [{ arms: 'up' }, 400], [{ arms: 'right' }, 400], [{}, 400]]),
        state: (run(m, [[{ arms: 'up' }, 300]]), m.state.armsUp),
      };
    });
    expect(r.both).toEqual(['armsUp']);
    expect(r.left).toEqual(['armLeft']);
    expect(r.right).toEqual(['armRight']);
    expect(r.brief).toEqual([]);
    expect(r.stagger).toEqual(['armsUp']);
    expect(r.state).toBe(true);
  });

  test('clap: hands together after being apart, hands start together do not count', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      const claps = run(m, [[{ arms: 'clap' }, 300], [{}, 300], [{ arms: 'clap' }, 300], [{ arms: 'clap' }, 300], [{}, 300]]);
      // Calibrated with the hands together: the first frames do not count as a clap
      const m2 = Motion.create({ full: true });
      run(m2, [[{ arms: 'clap' }, 1500]]);
      return { claps, start: run(m2, [[{ arms: 'clap' }, 500]]) };
    });
    expect(r.claps).toEqual(['clap', 'clap']);
    expect(r.start).toEqual([]);
  });

  test('jumping jacks: arms up and legs apart, then together = one', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      const seq = [];
      for (let i = 0; i < 5; i++) seq.push([{ arms: 'up', legs: 'apart' }, 300], [{}, 300]);
      const five = run(m, seq).filter(e => e === 'jumpingJack').length;
      // Arms only (legs stay together): not a jumping jack when the feet are seen
      const armsOnly = run(m, [[{ arms: 'up' }, 300], [{}, 300]]).filter(e => e === 'jumpingJack').length;
      // Feet not in the picture: the arms alone count
      const m2 = Motion.create({ full: false });
      run(m2, [[{ hide: [27, 28] }, 1500]]);
      const noFeet = run(m2, [[{ arms: 'up', hide: [27, 28] }, 300], [{ hide: [27, 28] }, 300]]).filter(e => e === 'jumpingJack').length;
      return { five, armsOnly, noFeet };
    });
    expect(r).toEqual({ five: 5, armsOnly: 0, noFeet: 1 });
  });

  test('coming much closer calibrates again; leaving for long forgets the calibration', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      // 35 % bigger (the feet stay in the picture)
      const closer = run(m, [[{ scale: 1.35 }, 2000]]);
      const after = m.state.calibrated;
      run(m, [[{ scale: 1.35 }, 1500]]);
      const again = m.state.calibrated;
      run(m, [[null, 2000]]);
      const short = m.state.calibrated;
      run(m, [[null, 4000]]);
      return { closer, after, again, short, long: m.state.calibrated, present: m.state.present };
    });
    expect(r.closer).toContain('recalibrate');
    expect(r.after).toBe(false);
    expect(r.again).toBe(true);
    expect(r.short).toBe(true);
    expect(r.long).toBe(false);
    expect(r.present).toBe(false);
  });

  test('hands and body in picture coordinates', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(false);
      run(m, [[{ hand: [0.3, 0.25] }, 300]]);
      return { hands: m.state.hands.map(h => [Math.round(h.x * 100) / 100, Math.round(h.y * 100) / 100]), body: m.state.body };
    });
    expect(r.hands).toContainEqual([0.3, 0.25]);
    expect(r.body.x).toBeCloseTo(0.5, 3);
    expect(r.body.u).toBeCloseTo(0.25, 2);
    // Torso length in picture widths: 0.25 heights × 3/4
    expect(r.body.ux).toBeCloseTo(0.1875, 3);
  });
});

/* ---------- Game descriptions and game engine ---------- */
test.describe('game engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL_);
    await page.evaluate(async () => {
      window.defs = {};
      for (const id of ['simon', 'jumping-jacks', 'duck-jump', 'bubbles']) defs[id] = await (await fetch(`games/${id}.json`)).json();
      // Runs the game clock in steps of 50 ms
      window.clock = g => { let t = 0; g.update(0); return (ms, motion) => { for (let i = 0; i < ms; i += 50) { t += 50; g.update(t, motion || {}); } return t; }; };
    });
  });

  test('built-in games are valid and listed; broken descriptions are rejected', async ({ page }) => {
    await expect(page.locator('#games .game')).toHaveCount(4);
    await expect(page.locator('#games .game .n')).toHaveText(['Simon sagt', 'Hampelmann-Challenge', 'Ducken & Springen', 'Blasen fangen']);
    await expect(page.locator('#games .game .b').first()).toHaveText('Noch nicht gespielt');
    const errors = await page.evaluate(() => {
      const bad = (fn, base = 'simon') => {
        const d = structuredClone(defs[base]); fn(d);
        try { MoveEngine.validate(d, Tools.mcp.checkSchema); return 'valid'; } catch (e) { return e.message; }
      };
      return {
        ok: Object.keys(defs).map(k => bad(() => {}, k)),
        format: bad(d => { d.format = 'other'; }),
        id: bad(d => { d.id = 'Simon Says'; }),
        mechanic: bad(d => { d.mechanic = 'fly'; }),
        title: bad(d => { delete d.title.en; }),
        extra: bad(d => { d.colour = 'red'; }),
        param: bad(d => { d.params.speed = 2; }),
        command: bad(d => { d.params.commands = ['jump', 'fly']; }),
        empty: bad(d => { d.params.commands = []; }),
        window: bad(d => { d.params.window = [3000]; }),
        duration: bad(d => { d.duration = 5; }),
        interval: bad(d => { d.params.interval = [900, 900]; }, 'duck-jump'),
        bombs: bad(d => { d.params.bombs = 0.9; }, 'bubbles'),
      };
    });
    expect(errors.ok).toEqual(['valid', 'valid', 'valid', 'valid']);
    expect(errors.format).toBe('game.format must be one of: moveplay-game');
    expect(errors.id).toBe('game.id must be lowercase letters, digits and -');
    expect(errors.mechanic).toBe('game.mechanic must be one of: command, count, dodge, targets');
    expect(errors.title).toBe('game.title.en is required');
    expect(errors.extra).toBe('game.colour is not allowed');
    expect(errors.param).toBe('game.params.speed is not allowed');
    expect(errors.command).toMatch(/^game\.params\.commands\[1\] must be one of: jump, duck/);
    expect(errors.empty).toBe('game.params.commands must not be empty');
    expect(errors.window).toBe('game.params.window must have 2 items (start, end)');
    expect(errors.duration).toBe('game.duration must be >= 10');
    expect(errors.interval).toBe('game.params.interval must be at least 2 × window + 200');
    expect(errors.bombs).toBe('game.params.bombs must be <= 0.6');
  });

  test('countdown, then the clock runs; paused games wait', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = MoveEngine.create(defs['jumping-jacks']), step = clock(g);
      const out = { start: [g.phase, g.countdown] };
      step(1000); out.ticks = g.take();
      step(2000); out.go = g.take(); out.phase = g.phase;
      g.event({ type: 'jumpingJack' }); out.counted = g.count; g.take();
      step(10000); out.left = g.timeLeft;
      g.pause(); step(5000); g.event({ type: 'jumpingJack' });
      out.paused = [g.timeLeft, g.count];
      g.resume(); step(20000);
      out.end = [g.phase, g.result.why, g.result.seconds, g.take().map(e => e.type)];
      return out;
    });
    expect(r.start).toEqual(['countdown', 3]);
    expect(r.ticks).toEqual([{ type: 'tick', n: 2 }]);
    expect(r.go.map(e => e.type)).toEqual(['tick', 'go', 'prompt']);
    expect(r.go[2].prompt).toEqual({ cmd: 'jumpingJack', count: true });
    expect(r.phase).toBe('play');
    expect(r.counted).toBe(1);
    expect(r.left).toBe(20);
    expect(r.paused).toEqual([20, 1]);
    expect(r.end).toEqual(['done', 'time', 30, ['end']]);
  });

  test('count: only the chosen movement counts', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = MoveEngine.create(defs['jumping-jacks']), step = clock(g);
      g.event({ type: 'jumpingJack' });   // during the countdown: ignored
      step(3000);
      for (const type of ['jumpingJack', 'jump', 'jumpingJack', 'armsUp', 'jumpingJack', 'jumpingJack', 'jumpingJack']) g.event({ type });
      step(30000);
      return g.result;
    });
    expect(r).toMatchObject({ why: 'time', count: 5, score: 5, hits: 5, misses: 0 });
  });

  test('command (Simon says): right movement, tricks, too late, lives', async ({ page }) => {
    const r = await page.evaluate(() => {
      const def = defs.simon, p = def.params;
      const g = MoveEngine.create(def, { rng: MoveEngine.seeded(7) }), step = clock(g);
      const log = [];
      let expected = 0, streak = 0;
      const ok = () => { streak++; expected += 10 + 2 * (streak - 1); };
      step(3000);
      const next = () => { while (!g.prompt) step(50); return g.prompt; };
      // 1: do it right (the first one is never a trick); a different movement does not count
      let q = next();
      log.push(['first', q.trick, q.prefix.de]);
      g.event({ type: q.cmd === 'jump' ? 'duck' : 'jump' });
      log.push(['other', g.score, !!g.prompt]);
      g.event({ type: q.cmd }); ok();
      log.push(['right', g.score === expected]);
      // Go on until there was a trick that the player ignored, a trick they fell for and a late one
      let ignored = 0, fell = 0, late = 0, guard = 0;
      while (g.phase === 'play' && guard++ < 50) {
        q = next();
        if (q.trick && !ignored) { const t0 = g.clock; while (g.prompt) step(50); ignored++; ok(); log.push(['ignored', g.score === expected, g.lives, g.clock - t0 <= p.window[0] + 50]); }
        else if (q.trick && !fell) { g.event({ type: q.cmd }); fell++; streak = 0; log.push(['fell', g.lives]); }
        else if (!q.trick && !late && ignored) { while (g.prompt) step(50); late++; streak = 0; log.push(['late', g.lives]); }
        else if (!q.trick) { g.event({ type: q.cmd }); ok(); }
        else { while (g.prompt) step(50); ok(); }
        if (late && fell && ignored) break;
      }
      // The third mistake ends the game
      q = next();
      if (q.trick) g.event({ type: q.cmd }); else while (g.prompt) step(50);
      return { log, score: g.score, expected, phase: g.phase, why: g.result && g.result.why, lives: g.lives };
    });
    expect(r.log[0]).toEqual(['first', false, 'Simon sagt']);
    expect(r.log[1]).toEqual(['other', 0, true]);
    expect(r.log[2]).toEqual(['right', true]);
    const kinds = r.log.slice(3).map(l => l[0]);
    expect(kinds).toContain('ignored');
    expect(kinds).toContain('fell');
    expect(kinds).toContain('late');
    expect(r.log.find(l => l[0] === 'ignored')).toEqual(['ignored', true, 3, true]);
    expect(r.log.filter(l => l[0] === 'fell' || l[0] === 'late').map(l => l[1])).toEqual([2, 1]);
    expect(r.score).toBe(r.expected);
    expect([r.phase, r.why, r.lives]).toEqual(['done', 'lives', 0]);
  });

  test('command: the time to react gets shorter', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = MoveEngine.create(defs.simon, { rng: MoveEngine.seeded(3) }), step = clock(g);
      step(3000);
      const windows = [];
      while (g.phase === 'play') {
        if (g.prompt && !windows.some(w => w.from === g.prompt.from)) { windows.push({ from: g.prompt.from, len: g.prompt.until - g.prompt.from, at: g.progress }); g.event({ type: g.prompt.trick ? 'none' : g.prompt.cmd }); }
        step(50);
      }
      return windows.map(w => [w.len, Math.round(3500 - 1500 * w.at)]);
    });
    expect(r.length).toBeGreaterThan(10);
    // Linear from 3.5 s at the start to 2 s at the end
    for (const [len, want] of r) expect(Math.abs(len - want)).toBeLessThanOrEqual(1);
    expect(r[0][0]).toBeGreaterThan(r[r.length - 1][0]);
  });

  test('dodge: duck under high bars, jump over low ones, in time', async ({ page }) => {
    const r = await page.evaluate(() => {
      const def = defs['duck-jump'], p = def.params;
      const g = MoveEngine.create(def, { rng: MoveEngine.seeded(11) }), step = clock(g);
      step(3000);
      const out = [];
      // Before the first obstacle arrives: drawn on the right, coming closer
      step(1100);
      const o = g.objects[0];
      out.push(['coming', o.kind, o.state, Math.round(o.x * 100) / 100]);
      const upcoming = () => { let o; while (!(o = g.m.list.find(x => !x.done))) step(50); return o; };
      const first = g.m.list[0];
      // Wait until it is just before the player, then do the right thing
      while (g.clock < first.at - 100) step(50);
      out.push(['at player', Math.round(g.objects[0].x * 100) / 100]);
      out.push(['prompt', g.prompt]);
      const right = first.kind === 'high' ? { ducking: true } : { airborne: true };
      step(200, right); step(600);
      out.push(['first', g.score, g.lives]);
      // Second one: the wrong movement
      const second = upcoming();
      while (g.clock < second.at - 100) step(50);
      const wrong = second.kind === 'high' ? { airborne: true } : { ducking: true };
      step(200, wrong); step(600);
      out.push(['second', g.score, g.lives]);
      // Third one: a short movement between two frames still counts (event)
      const third = upcoming();
      while (g.clock < third.at) step(50);
      g.event({ type: third.kind === 'high' ? 'duck' : 'jump', t: 0 }, {});
      step(800);
      out.push(['third', g.score, g.lives]);
      // Too early does not count
      const fourth = upcoming();
      while (g.clock < fourth.at - p.window - 300) step(50);
      step(100, fourth.kind === 'high' ? { ducking: true } : { airborne: true });
      while (g.clock < fourth.at + p.window + 100) step(50);
      out.push(['early', g.lives]);
      // Doing nothing: the last life goes, game over
      while (g.phase === 'play') step(50);
      out.push(['end', g.result.why, g.lives]);
      return out;
    });
    expect(r[0][0]).toBe('coming');
    expect(['high', 'low']).toContain(r[0][1]);
    expect(r[0][2]).toBe('come');
    // Spawned after 1 s, 0.1 s ago: 0.5 + (2.5 / 2.6) × 0.6
    expect(r[0][3]).toBeCloseTo(1.08, 1);
    expect(r[1][1]).toBeCloseTo(0.52, 1);
    expect(r[2][1]).toEqual({ cmd: r[0][1] === 'high' ? 'duck' : 'jump' });
    expect(r[3]).toEqual(['first', 10, 3]);
    expect(r[4]).toEqual(['second', 10, 2]);
    expect(r[5]).toEqual(['third', 20, 2]);
    expect(r[6]).toEqual(['early', 1]);
    expect(r[7]).toEqual(['end', 'lives', 0]);
  });

  test('targets: bubbles around the player, touched with a hand; bombs cost points', async ({ page }) => {
    const r = await page.evaluate(() => {
      const def = defs.bubbles, p = def.params;
      const body = { x: 0.5, shoulderY: 0.3, hipY: 0.55, headY: 0.2, u: 0.25, ux: 0.1875 };
      const motion = hands => ({ body, aspect: 4 / 3, hands });
      const g = MoveEngine.create(def, { rng: MoveEngine.seeded(5) }), step = clock(g);
      step(3000);
      step(600, motion([]));
      const out = { first: g.objects.map(o => o.kind) };
      const b = g.m.list[0];
      // Within reach of the shoulders, size from the torso length
      out.inside = Math.abs(b.x - body.x) <= p.reach * body.ux + 1e-9 && b.y >= body.shoulderY - 1.1 * body.u - 1e-9 && b.y <= body.shoulderY + 0.6 * body.u + 1e-9;
      out.r = b.r;
      // A hand just outside the bubble: nothing; inside: popped
      step(50, motion([{ x: b.x + (b.r + 0.05) / (4 / 3), y: b.y }]));
      out.near = g.score;
      step(50, motion([{ x: b.x, y: b.y + b.r * 0.5 }]));
      out.hit = g.score;
      // Pop bubbles until a bomb shows up, then touch it
      let expected = 5, streak = 1, guard = 0, bomb = null;
      while (!bomb && guard++ < 400) {
        step(50, motion([]));
        const o = g.m.list.find(x => !x.pop);
        if (!o) continue;
        if (o.bomb) { bomb = o; break; }
        step(50, motion([{ x: o.x, y: o.y }])); streak++; expected += 5 + (streak - 1);
      }
      out.beforeBomb = g.score === expected;
      const s0 = g.score;
      step(50, motion([{ x: bomb.x, y: bomb.y }]));
      out.bomb = [s0 - g.score, g.streak, g.lives, Math.min(10, s0)];
      // Bubbles that are not caught disappear after their time
      const id = g.m.id;
      step(p.life + 500, motion([]));
      out.expired = g.m.list.filter(o => o.id <= id).length;
      return out;
    });
    expect(r.first).toEqual(['bubble']);
    expect(r.inside).toBe(true);
    expect(r.r).toBeCloseTo(0.075, 5);
    expect(r.near).toBe(0);
    expect(r.hit).toBe(5);
    expect(r.beforeBomb).toBe(true);
    // Penalty 10 (never below 0), streak gone, no lives in this game
    expect(r.bomb[0]).toBe(r.bomb[3]);
    expect(r.bomb.slice(1, 3)).toEqual([0, 0]);
    expect(r.expired).toBe(0);
  });
});

/* ---------- The page ---------- */
test.describe('page', () => {
  test.beforeEach(async ({ page }) => {
    await fakeCamera(page);
    await fakePoseWorker(page);
  });

  test('jumping jacks: download prompt, calibration, countdown, counting, result and best score', async ({ page }) => {
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.goto(URL_);
    await pose(page, null);
    await page.click('[data-game="jumping-jacks"]');
    await expect(page.locator('#scCalib')).toBeVisible();
    await expect(page.locator('#calTitle')).toHaveText('Hampelmann-Challenge');
    await expect(page.locator('#calText')).toHaveText('Niemand zu sehen – stell dich vor die Kamera.');
    await expect(page.locator('#calSpace')).toBeVisible();
    // Engine (14.5 MB) + model (5.8 MB), asked once
    expect(dialogs).toEqual([expect.stringContaining('ca. 20,3 MB')]);
    // Feet not in the picture
    await pose(page, { hide: [27, 28] });
    await expect(page.locator('#calText')).toHaveText('Geh weiter zurück, bis du von Kopf bis Fuß zu sehen bist.');
    await pose(page, {});
    await expect(page.locator('#calText')).toHaveText('Gut so! Jetzt kurz still stehen …');
    // Calibrated: the countdown starts
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#cd')).toHaveText(/^[123]$/);
    await expect(page.locator('#btnStop')).toBeVisible();
    await expect(page.locator('#cd')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#prompt')).toHaveText('Hampelmann!');
    await expect(page.locator('#hudScore')).toHaveText('🤸 0');
    await expect(page.locator('#hudTime')).toHaveText(/⏱ (30|29|28)/);
    await expect(page.locator('#hudLives')).toBeHidden();
    for (let i = 0; i < 3; i++) { await hold(page, { arms: 'up', legs: 'apart' }); await hold(page, {}); }
    await expect(page.locator('#hudScore')).toHaveText('🤸 3');
    // Ending early still shows the result
    await page.click('#btnStop');
    await expect(page.locator('#scResult')).toBeVisible();
    await expect(page.locator('#resTitle')).toHaveText('🤸 Spiel beendet');
    await expect(page.locator('#resScore')).toHaveText('3');
    await expect(page.locator('#resDetail')).toHaveText('3 geschafft');
    await expect(page.locator('#resBest')).toHaveText('🏆 Neuer Bestwert!');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('move-play.scores.v1')))['jumping-jacks']).toEqual({ best: 3, plays: 1, last: 3 });
    // Again: no new calibration, straight to the countdown; fewer this time – the best score stays
    await page.click('#btnAgain');
    await expect(page.locator('#cd')).toBeVisible();
    await expect(page.locator('#cd')).toBeHidden({ timeout: 5000 });
    await hold(page, { arms: 'up', legs: 'apart' }); await hold(page, {});
    await expect(page.locator('#hudScore')).toHaveText('🤸 1');
    await page.click('#btnStop');
    await expect(page.locator('#resBest')).toHaveText('Bestwert: 3');
    await page.click('#btnOther');
    await expect(page.locator('#scMenu')).toBeVisible();
    await expect(page.locator('[data-game="jumping-jacks"] .b')).toHaveText('Bestwert: 3');
    // The camera is off in the game choice
    expect(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('calibrated');
    expect(diag).toMatch(/game end \{"id":"jumping-jacks","why":"stopped","score":3,"count":3/);
    expect(diag).toContain('camera: off');
  });

  test('nobody in the picture: the game waits and goes on', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    await pose(page, {});
    await page.click('[data-game="simon"]');
    await expect(page.locator('#cd')).toBeVisible();
    await expect(page.locator('#cd')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#hudLives')).toHaveText('❤️❤️❤️');
    await expect(page.locator('#hudLives')).toHaveAttribute('aria-label', 'Leben: 3');
    await expect(page.locator('#prompt')).toHaveText(/^Simon sagt: (Spring!|Duck dich!|Arme hoch!|Linken Arm hoch!|Rechten Arm hoch!|Klatsch in die Hände!)$/, { timeout: 4000 });
    await pose(page, null);
    await expect(page.locator('#away')).toHaveText('Wo bist du? Stell dich wieder ins Bild – das Spiel wartet.');
    const time = await page.locator('#hudTime').textContent();
    await page.waitForTimeout(1500);
    await expect(page.locator('#hudTime')).toHaveText(time);
    await pose(page, {});
    await expect(page.locator('#away')).toBeHidden();
    await expect(page.locator('#hudTime')).not.toHaveText(time, { timeout: 3000 });
    expect(await page.evaluate(() => Tools.diag.text())).toContain('paused (nobody)');
  });

  test('upper body game in English: calibrates without the feet', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    await switchLang(page, 'en');
    await expect(page.locator('#games .game .n')).toHaveText(['Simon Says', 'Jumping Jack Challenge', 'Duck & Jump', 'Catch the Bubbles']);
    await pose(page, { hide: [25, 26, 27, 28, 29, 30, 31, 32] });
    await page.click('[data-game="bubbles"]');
    await expect(page.locator('#calSpace')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hudScore')).toHaveText('⭐ 0');
    await page.click('#btnStop');
    await expect(page.locator('#resTitle')).toHaveText('🫧 Game ended');
    await expect(page.locator('#resDetail')).toHaveText('0 hits · 0 misses · best streak 0');
    // Nothing scored: no "new best"
    await expect(page.locator('#resBest')).toHaveText('Best: 0');
  });

  test('settings are kept, the sound button toggles', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#btnSound')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#btnSound');
    await expect(page.locator('#btnSound')).toHaveAttribute('aria-pressed', 'false');
    await openMenu(page);
    await expect(page.locator('#optMirror')).toBeChecked();
    await page.locator('#optMirror').uncheck();
    await page.locator('#optCam').uncheck();
    await expect(page.locator('#modelsInfo')).toHaveText('Noch nicht heruntergeladen.');
    await expect(page.locator('#btnDelModels')).toBeDisabled();
    await closeMenu(page);
    await page.reload();
    await expect(page.locator('#btnSound')).toHaveAttribute('aria-pressed', 'false');
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('move-play.settings.v1')))).toEqual({ mirror: false, cam: false, voice: true, sound: false });
  });
});

test.describe('page: problems', () => {
  test('camera denied', async ({ page }) => {
    await fakeCamera(page, { deny: 'NotAllowedError' });
    await fakePoseWorker(page);
    await page.goto(URL_);
    await page.click('[data-game="simon"]');
    await expect(page.locator('#msgText')).toHaveText('Kein Zugriff auf die Kamera. Bitte in den Einstellungen des Browsers erlauben und nochmal versuchen.');
    await page.click('#btnBack');
    await expect(page.locator('#scMenu')).toBeVisible();
  });

  test('download declined or failed: message, try again', async ({ page }) => {
    await fakeCamera(page);
    await fakePoseWorker(page, 'fail');
    let accept = false;
    page.on('dialog', d => (accept ? d.accept() : d.dismiss()));
    await page.goto(URL_);
    await page.click('[data-game="duck-jump"]');
    await expect(page.locator('#msgText')).toHaveText('Ohne Körpererkennung geht es leider nicht.');
    expect(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
    accept = true;
    await page.click('#btnRetry');
    await expect(page.locator('#msgText')).toHaveText('Download fehlgeschlagen. Beim ersten Mal braucht die App Internet – bitte nochmal versuchen.');
    await expect(page.locator('#btnRetry')).toBeVisible();
    expect(await page.evaluate(() => Tools.diag.text())).toContain('model error {"code":"download"');
  });
});

/* ---------- The real worker (MediaPipe) ---------- */
test.describe('real pose worker (MediaPipe)', () => {
  // Stand-in model: the small selfie segmenter (no pose model) – the engine loads, then rejects the model.
  const MODEL = readFileSync(fileURLToPath(new URL('fixtures/selfie_segmenter.tflite', import.meta.url)));
  test.use({ allowedProblems: /storage\.googleapis\.com\/mediapipe-models\/pose_landmarker|ERR_INTERNET_DISCONNECTED|Failed to fetch|INVALID_ARGUMENT|Unable to open zip archive|Failed to open|graph|Graph/ });

  test('loads the engine from this site, blocks usage statistics, works offline', async ({ page, context }) => {
    test.setTimeout(90000);
    const external = [];
    await context.route(/^https:\/\//, r => {
      const u = r.request().url();
      external.push(u);
      if (u.endsWith('/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'))
        return r.fulfill({ body: MODEL, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' } });
      return r.abort();
    });
    await fakeCamera(page);
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    await page.click('[data-game="simon"]');
    await expect(page.locator('#msgText')).toHaveText('Die Körpererkennung ließ sich nicht starten.', { timeout: 60000 });
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('model error {"code":"engine"');

    const worker = page.workers().find(w => w.url().endsWith('/move-play/pose-worker.mjs'));
    expect(worker).toBeTruthy();
    const tries = await worker.evaluate(async () => {
      const out = {};
      out.fetch = await fetch('https://odml.pa.googleapis.com/v1/log', { method: 'POST', body: 'x' }).then(() => 'sent', e => e.message);
      try { const x = new XMLHttpRequest(); x.open('POST', 'https://example.org/'); out.xhr = 'opened'; } catch (e) { out.xhr = e.message; }
      out.own = (await fetch('pose-worker.mjs')).ok;
      return out;
    });
    expect(tries).toEqual({ fetch: expect.stringMatching(/blocked/), xhr: expect.stringMatching(/blocked/), own: true });
    expect(external.filter(u => !u.endsWith('pose_landmarker_lite.task'))).toEqual([]);
    expect(await page.evaluate(() => Tools.diag.text())).toContain('worker: blocked request {"host":"odml.pa.googleapis.com"}');
    // Engine and model are kept for offline use
    await openMenu(page);
    await expect(page.locator('#modelsInfo')).toHaveText(/^Heruntergeladen: Rechenprogramm, Modell \(/);
    await closeMenu(page);

    // Offline: engine and model come from the cache – the stand-in model fails the same way, not the download
    await context.setOffline(true);
    await page.reload();
    await page.click('[data-game="simon"]');
    await expect(page.locator('#msgText')).toHaveText('Die Körpererkennung ließ sich nicht starten.', { timeout: 60000 });
    expect(await page.evaluate(() => Tools.diag.text())).toContain('model error {"code":"engine"');
    await context.setOffline(false);

    // Deleting removes both
    page.removeAllListeners('dialog');
    page.on('dialog', d => d.accept());
    await page.click('#btnBack');
    await openMenu(page);
    await page.click('#btnDelModels');
    await expect(page.locator('#modelsInfo')).toHaveText('Noch nicht heruntergeladen.');
  });
});
