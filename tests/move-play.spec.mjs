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
let parts = 1;
self.onmessage = ({ data }) => {
  if (data.type === 'options') parts = data.parts;
  if (data.type === 'load') {
    parts = data.parts || 1;
    if (MODE === 'fail') return setTimeout(() => self.postMessage({ type: 'error', code: 'download', message: 'offline' }), 50);
    self.postMessage({ type: 'progress', loaded: 50, total: 100 });
    setTimeout(() => self.postMessage({ type: 'loaded', delegate: 'CPU' }), 50);
  } else if (data.type === 'frame') {
    data.bitmap.close();
    setTimeout(() => {
      // { dance: true }: arms up and down and swaying, changing every 250 ms
      const now = cur && cur.dance ? (Math.floor(performance.now() / 250) % 2 ? { arms: 'up', x: 0.03 } : { x: -0.03 }) : cur;
      const poses = !now ? [] : (Array.isArray(now) ? now : [now]).map(makePose);
      // Two players: like the real worker, one person per half of the picture
      const halves = parts === 2 ? [0, 1].map(h => poses.find(p => ((p[4 * 23] + p[4 * 24]) / 2 < 0.5) === (h === 0)) || null) : null;
      self.postMessage({ type: 'result', poses, halves, ms: 3, delegate: 'CPU' }, poses.map(p => p.buffer));
    }, 10);
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

  test('pose: arm angles, legs and a raised knee; matching a pose', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      const at = o => { run(m, [[o, 300]]); return m.state.pose; };
      const star = at({ armL: 135, armR: 135, legs: 'apart' });
      const out = { star: [star.left, star.right, Math.round(star.spread * 100) / 100] };
      out.down = at({}).left;
      out.wave = [at({ armL: 165, armR: 0 }).left, m.state.pose.right];
      const stork = at({ armL: 90, armR: 90, knee: 'left' });
      out.knee = [stork.kneeL, stork.kneeR];
      const T = (left, right, legs) => ({ left, right, legs });
      out.match = {
        star: Motion.matchPose(T(135, 135, 'apart'), star, 30).ok,
        starTogether: Motion.matchPose(T(135, 135, 'together'), star, 30).ok,
        rocket: Motion.matchPose(T(170, 170, 'together'), star, 30).ok,
        stork: Motion.matchPose(T(90, 90, 'oneUp'), stork, 30).ok,
        plane: Motion.matchPose(T(90, 90, 'together'), stork, 30).ok,
        any: Motion.matchPose(T(90, 90, 'any'), stork, 30).ok,
        within: Motion.matchPose(T(115, 115, 'any'), stork, 30).ok,
        outside: Motion.matchPose(T(125, 90, 'any'), stork, 30).ok,
        nobody: Motion.matchPose(T(90, 90), null, 30).ok,
      };
      return out;
    });
    // Synthetic arms at exactly these angles, ankles 0.22 picture widths = 1.17 torso lengths apart
    expect(r.star).toEqual([135, 135, 1.17]);
    expect(r.down).toBeLessThan(15);
    expect(r.wave).toEqual([165, 0]);
    expect(r.knee).toEqual([true, false]);
    expect(r.match).toEqual({ star: true, starTogether: false, rocket: false, stork: true, plane: false, any: true, within: true, outside: false, nobody: false });
  });

  test('energy: dancing is a lot, standing still and small jitter is little', async ({ page }) => {
    const r = await page.evaluate(() => {
      const m = calibrated(true);
      const out = {};
      run(m, [[{}, 600]]); out.still = m.state.energy;
      // Jitter of ±0.003 picture heights every frame (detection noise)
      const seq = []; for (let i = 0; i < 30; i++) seq.push([{ dy: (i % 2 ? 1 : -1) * 0.003, x: (i % 3 - 1) * 0.003 }, 33]);
      run(m, seq); out.jitter = m.state.energy;
      // Dancing: arms up and down, swaying
      const dance = []; for (let i = 0; i < 12; i++) dance.push([i % 2 ? { arms: 'up', x: 0.03 } : { x: -0.03 }, 200]);
      run(m, dance); out.dance = m.state.energy;
      run(m, [[{}, 800]]); out.after = m.state.energy;
      return out;
    });
    expect(r.still).toBeLessThan(0.05);
    expect(r.jitter).toBeLessThan(0.5);
    expect(r.dance).toBeGreaterThan(4);
    expect(r.after).toBeLessThan(0.05);
  });

  test('easier detection: smaller jumps and ducks count', async ({ page }) => {
    const r = await page.evaluate(() => {
      const normal = calibrated(true);
      const easy = Motion.create({ full: true, easy: true }); run(easy, [[{}, 1500]]);
      const seq = [[{ dy: 0.042 }, 300], [{}, 400], [{ duck: 0.09 }, 300], [{}, 400]];
      return { normal: run(normal, seq), easy: run(easy, seq), tiptoe: run(easy, [[{ dy: 0.02 }, 300], [{}, 400]]), flag: easy.state.easy };
    });
    expect(r.normal).toEqual([]);
    expect(r.easy).toEqual(['jump', 'duck']);
    expect(r.tiptoe).toEqual([]);
    expect(r.flag).toBe(true);
  });
});

/* ---------- Game descriptions and game engine ---------- */
test.describe('game engine', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(URL_);
    await page.evaluate(async () => {
      window.defs = {};
      for (const id of ['simon', 'jumping-jacks', 'duck-jump', 'bubbles', 'freeze-dance', 'poses']) defs[id] = await (await fetch(`games/${id}.json`)).json();
      // Runs the game clock in steps of 50 ms
      window.clock = g => { let t = 0; g.update(0); return (ms, motion) => { for (let i = 0; i < ms; i += 50) { t += 50; g.update(t, motion || {}); } return t; }; };
    });
  });

  test('built-in games are valid and listed; broken descriptions are rejected', async ({ page }) => {
    await expect(page.locator('#games .game')).toHaveCount(6);
    await expect(page.locator('#games .game .n')).toHaveText(['Simon sagt', 'Hampelmann-Challenge', 'Ducken & Springen', 'Blasen fangen', 'Stopptanz', 'Posen nachmachen']);
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
        players: bad(d => { d.players = 3; }),
        still: bad(d => { d.params.moving = 1; }, 'freeze-dance'),
        poseAngle: bad(d => { d.params.poses[0].left = 200; }, 'poses'),
        poseLegs: bad(d => { d.params.poses[0].legs = 'crossed'; }, 'poses'),
        onePose: bad(d => { d.params.poses = d.params.poses.slice(0, 1); }, 'poses'),
      };
    });
    expect(errors.ok).toEqual(['valid', 'valid', 'valid', 'valid', 'valid', 'valid']);
    expect(errors.format).toBe('game.format must be one of: moveplay-game');
    expect(errors.id).toBe('game.id must be lowercase letters, digits and -');
    expect(errors.mechanic).toBe('game.mechanic must be one of: command, count, dodge, targets, freeze, pose');
    expect(errors.title).toBe('game.title.en is required');
    expect(errors.extra).toBe('game.colour is not allowed');
    expect(errors.param).toBe('game.params.speed is not allowed');
    expect(errors.command).toMatch(/^game\.params\.commands\[1\] must be one of: jump, duck/);
    expect(errors.empty).toBe('game.params.commands must not be empty');
    expect(errors.window).toBe('game.params.window must have 2 items (start, end)');
    expect(errors.duration).toBe('game.duration must be >= 10');
    expect(errors.interval).toBe('game.params.interval must be at least 2 × window + 200');
    expect(errors.bombs).toBe('game.params.bombs must be <= 0.6');
    expect(errors.players).toBe('game.players must be <= 2');
    expect(errors.still).toBe('game.params.moving must be more than still');
    expect(errors.poseAngle).toBe('game.params.poses[0].left must be <= 180');
    expect(errors.poseLegs).toBe('game.params.poses[0].legs must be one of: any, together, apart, oneUp');
    expect(errors.onePose).toBe('game.params.poses must have at least 2 items');
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
      out.push(['coming', o.kind, o.state, Math.round(o.dist * 100) / 100]);
      const upcoming = () => { let o; while (!(o = g.m.list.find(x => !x.done))) step(50); return o; };
      const first = g.m.list[0];
      // Wait until it is just before the player, then do the right thing
      while (g.clock < first.at - 100) step(50);
      out.push(['at player', Math.round(g.objects[0].dist * 100) / 100]);
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
    // Spawned after 1 s, 0.1 s ago: 2.5 s of 2.6 s still to go
    expect(r[0][3]).toBeCloseTo(2.5 / 2.6, 2);
    expect(r[1][1]).toBeCloseTo(0.1 / 2.6, 1);
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

  test('freeze dance: freeze when the music stops, dance while it plays', async ({ page }) => {
    const r = await page.evaluate(() => {
      const def = defs['freeze-dance'], p = def.params;
      const g = MoveEngine.create(def, { rng: MoveEngine.seeded(9) }), step = clock(g);
      step(3000);
      const out = [];
      const dancing = { energy: 6 }, still = { energy: 0.3 };
      const until = (cmd, motion) => { while (g.phase === 'play' && g.prompt.cmd !== cmd) step(50, motion); };
      out.push(['start', g.prompt.cmd, g.m.until - g.m.from >= p.dance[0] && g.m.until - g.m.from <= p.dance[1]]);
      // 1: dance, then freeze properly (moving in the first moment after the stop is allowed)
      until('freeze', dancing);
      out.push(['freeze', g.m.until - g.m.from >= p.freeze[0] && g.m.until - g.m.from <= p.freeze[1]]);
      step(p.grace - 100, dancing);
      until('dance', still);
      out.push(['statue', g.score, g.lives]);
      // 2: dance, then move while frozen → caught once (not a life per frame)
      until('freeze', dancing);
      step(p.grace + 100, still);
      until('dance', dancing);
      out.push(['moved', g.score, g.lives]);
      // 3: do not dance → "dance more!", then freeze properly
      until('freeze', still);
      out.push(['lazy', g.lives]);
      until('dance', still);
      out.push(['statue 2', g.score]);
      return out;
    });
    expect(r[0]).toEqual(['start', 'dance', true]);
    expect(r[1]).toEqual(['freeze', true]);
    expect(r[2]).toEqual(['statue', 10, 3]);
    expect(r[3]).toEqual(['moved', 10, 2]);
    expect(r[4]).toEqual(['lazy', 1]);
    // Streak was broken: 10 again, no bonus
    expect(r[5]).toEqual(['statue 2', 20]);
  });

  test('freeze dance, easier: a little wobbling is allowed', async ({ page }) => {
    const r = await page.evaluate(() => {
      const res = {};
      for (const easy of [false, true]) {
        const g = MoveEngine.create(defs['freeze-dance'], { rng: MoveEngine.seeded(9) }), step = clock(g);
        step(3000);
        while (g.prompt.cmd !== 'freeze') step(50, { energy: 6, easy });
        while (g.prompt.cmd !== 'dance') step(50, { energy: 1.5, easy });
        res[easy ? 'easy' : 'normal'] = [g.score, g.lives];
      }
      return res;
    });
    expect(r).toEqual({ normal: [0, 2], easy: [10, 3] });
  });

  test('pose: hold the shown pose, wrong poses and running out of time', async ({ page }) => {
    const r = await page.evaluate(() => {
      const def = defs.poses, p = def.params;
      const g = MoveEngine.create(def, { rng: MoveEngine.seeded(4) }), step = clock(g);
      step(3000);
      const out = [];
      const shown = () => { while (!g.prompt) step(50); return g.prompt.pose; };
      const right = pose => ({ pose: { left: pose.left, right: pose.right, spread: pose.legs === 'apart' ? 1.2 : 0.4, kneeL: pose.legs === 'oneUp', kneeR: false } });
      // 1: copy it – held for 1 s it counts, then the next pose comes after the pause
      let q = shown();
      // Time per pose: 6 s at the start, 3.5 s at the end (linear)
      out.push(['first', p.poses.some(x => x.id === q.id), g.prompt.until - g.prompt.from === Math.round(6000 - 2500 * g.prompt.from / 60000)]);
      step(500, right(q));
      out.push(['half', Math.round(g.m.held * 10) / 10, g.score]);
      step(600, right(q));
      out.push(['held', g.score, g.prompt]);
      // 2: a different pose all the time → miss when the time is up; poses do not repeat directly
      const q2 = shown();
      out.push(['next', q2.id !== q.id]);
      step(g.prompt.until - g.clock + 50, { pose: { left: 0, right: 0, spread: 0.4, kneeL: false, kneeR: false } });
      out.push(['missed', g.score, g.misses, g.prompt]);
      // 3: nobody seen → nothing held
      shown(); step(1500, {});
      out.push(['nobody', g.m.held]);
      return out;
    });
    expect(r[0]).toEqual(['first', true, true]);
    expect(r[1]).toEqual(['half', 0.5, 0]);
    expect(r[2]).toEqual(['held', 10, null]);
    expect(r[3]).toEqual(['next', true]);
    expect(r[4]).toEqual(['missed', 10, 1, null]);
    expect(r[5]).toEqual(['nobody', 0]);
  });

  test('two players: same seed and sync – the same commands at the same time', async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = {};
      for (const id of ['simon', 'poses', 'freeze-dance', 'duck-jump']) {
        const a = MoveEngine.create(defs[id], { rng: MoveEngine.seeded(21), sync: true });
        const b = MoveEngine.create(defs[id], { rng: MoveEngine.seeded(21), sync: true });
        let t = 0; a.update(0); b.update(0);
        const seen = [];
        while (a.phase !== 'done' && t < 60000) {
          t += 50;
          // A reacts at once (right command / right pose), B never
          if (id === 'simon' && a.prompt && !a.prompt.trick) a.event({ type: a.prompt.cmd });
          const pa = a.prompt && a.prompt.pose ? { pose: { left: a.prompt.pose.left, right: a.prompt.pose.right, spread: a.prompt.pose.legs === 'apart' ? 1.2 : 0.4, kneeL: a.prompt.pose.legs === 'oneUp', kneeR: false } } : {};
          a.update(t, id === 'freeze-dance' ? { energy: a.prompt && a.prompt.cmd === 'dance' ? 6 : 0.2 } : pa);
          b.update(t, id === 'freeze-dance' ? { energy: 6 } : {});
          const key = p => p ? JSON.stringify([p.cmd, p.trick, p.pose && p.pose.id, p.from]) : null;
          if (b.phase === 'play' && key(a.prompt) !== key(b.prompt)) { seen.push(['differs', t, key(a.prompt), key(b.prompt)]); break; }
          if (id === 'duck-jump' && b.phase === 'play' && JSON.stringify(a.objects.map(o => [o.kind, o.dist])) !== JSON.stringify(b.objects.map(o => [o.kind, o.dist]))) { seen.push(['objects', t]); break; }
        }
        out[id] = { differs: seen, a: a.score, b: b.score };
      }
      return out;
    });
    for (const id of ['simon', 'poses', 'freeze-dance', 'duck-jump']) expect(r[id].differs, id).toEqual([]);
    expect(r.simon.a).toBeGreaterThan(r.simon.b);
    expect(r.poses.a).toBeGreaterThan(0);
    expect(r.poses.b).toBe(0);
    expect(r['freeze-dance'].a).toBeGreaterThan(0);
  });

  test('command, two players: answering does not bring the next command earlier', async ({ page }) => {
    const r = await page.evaluate(() => {
      const g = MoveEngine.create(defs.simon, { rng: MoveEngine.seeded(7), sync: true }), step = clock(g);
      step(3000);
      while (!g.prompt) step(50);
      const q = g.prompt;
      g.event({ type: q.cmd }); g.event({ type: q.cmd });
      const after = [g.score, !!g.prompt];
      while (g.prompt === q) step(50);
      return { after, at: g.clock >= q.until, lives: g.lives };
    });
    // Counted once, the prompt stays until its time is up, no life lost for "too late"
    expect(r).toEqual({ after: [10, true], at: true, lives: 3 });
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
    await expect(page.locator('#hudAScore')).toHaveText('🤸 0');
    await expect(page.locator('#hudTime')).toHaveText(/⏱ (30|29|28)/);
    await expect(page.locator('#hudALives')).toBeHidden();
    for (let i = 0; i < 3; i++) { await hold(page, { arms: 'up', legs: 'apart' }); await hold(page, {}); }
    await expect(page.locator('#hudAScore')).toHaveText('🤸 3');
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
    await expect(page.locator('#hudAScore')).toHaveText('🤸 1');
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
    await expect(page.locator('#hudALives')).toHaveText('❤️❤️❤️');
    await expect(page.locator('#hudALives')).toHaveAttribute('aria-label', 'Leben: 3');
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
    await expect(page.locator('#games .game .n')).toHaveText(['Simon Says', 'Jumping Jack Challenge', 'Duck & Jump', 'Catch the Bubbles', 'Freeze Dance', 'Copy the Pose']);
    await pose(page, { hide: [25, 26, 27, 28, 29, 30, 31, 32] });
    await page.click('[data-game="bubbles"]');
    await expect(page.locator('#calSpace')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hudAScore')).toHaveText('⭐ 0');
    await page.click('#btnStop');
    await expect(page.locator('#resTitle')).toHaveText('🫧 Game ended');
    await expect(page.locator('#resDetail')).toHaveText('0 hits · 0 misses · best streak 0');
    // Nothing scored: no "new best"
    await expect(page.locator('#resBest')).toHaveText('Best: 0');
  });

  test('game choice on a small phone: heading at the top, every game reachable by scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto(URL_);
    await expect(page.locator('#games .game')).toHaveCount(6);
    const box = await page.evaluate(() => {
      const sc = document.getElementById('scMenu'), r = sc.getBoundingClientRect();
      const top = el => el.getBoundingClientRect().top - r.top;
      return { overflow: sc.scrollHeight > sc.clientHeight, scrollTop: sc.scrollTop, h2: top(sc.querySelector('h2')), intro: top(sc.querySelector('.intro')) };
    });
    // More than fits: it scrolls, and starts with the heading and the hint fully visible (not cut off above)
    expect(box.overflow).toBe(true);
    expect(box.scrollTop).toBe(0);
    expect(box.h2).toBeGreaterThanOrEqual(0);
    expect(box.intro).toBeGreaterThan(box.h2);
    await page.locator('[data-game="poses"]').scrollIntoViewIfNeeded();
    await expect(page.locator('[data-game="poses"]')).toBeInViewport({ ratio: 1 });
    await page.locator('#scMenu h2').scrollIntoViewIfNeeded();
    await expect(page.locator('#scMenu h2')).toBeInViewport({ ratio: 1 });
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
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('move-play.settings.v1')))).toEqual({ mirror: false, cam: false, voice: true, sound: false, easy: false, gpu: true, players: 1 });
  });

  test('two players: side by side, each counted, the winner is shown', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    // Mirrored picture: the person at x + 0.22 in the camera picture stands on the left of the screen
    const L = o => ({ x: 0.22, scale: 0.8, ...o }), R = o => ({ x: -0.22, scale: 0.8, ...o });
    await pose(page, [L({})]);
    await page.click('[data-players="2"]');
    await expect(page.locator('[data-players="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#games .game .b').first()).toHaveText('');
    await page.click('[data-game="jumping-jacks"]');
    await expect(page.locator('#calTwo')).toBeVisible();
    await expect(page.locator('#calText')).toHaveText(/^Links: (Gut so! Jetzt kurz still stehen …|Bereit ✓)$/);
    await expect(page.locator('#calText2')).toHaveText('Rechts: Noch nicht zu sehen – stell dich auf deine Hälfte.');
    await expect(page.locator('#hud')).toBeHidden();
    await pose(page, [R({}), L({})]);
    await expect(page.locator('#cd')).toBeVisible();
    await expect(page.locator('#hudB')).toBeVisible();
    await expect(page.locator('#cd')).toBeHidden({ timeout: 5000 });
    for (let i = 0; i < 3; i++) { await hold(page, [L({ arms: 'up', legs: 'apart' }), R({})]); await hold(page, [L({}), R({})]); }
    await hold(page, [L({}), R({ arms: 'up', legs: 'apart' })]); await hold(page, [L({}), R({})]);
    await expect(page.locator('#hudAScore')).toHaveText('🤸 3');
    await expect(page.locator('#hudBScore')).toHaveText('🤸 1');
    // One of them leaves: everybody waits
    await pose(page, [L({})]);
    await expect(page.locator('#away')).toHaveText('Rechts ist nicht zu sehen – das Spiel wartet.');
    await pose(page, [L({}), R({})]);
    await expect(page.locator('#away')).toBeHidden();
    await page.click('#btnStop');
    await expect(page.locator('#resTitle')).toHaveText('🏆 Links gewinnt!');
    await expect(page.locator('#resScore')).toHaveText('3 : 1');
    await expect(page.locator('#resBest')).toHaveText('Bestwerte gibt es nur für 1 Spieler.');
    expect(await page.evaluate(() => localStorage.getItem('move-play.scores.v1'))).toBeNull();
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('move-play.settings.v1'))).players).toBe(2);
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('players: 2');
    expect(diag).toContain('game start {"id":"jumping-jacks","players":2}');
  });

  test('freeze dance: music while dancing, freeze when it stops', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.addInitScript(() => {
      // Count the notes started (music and sounds)
      window.__notes = 0;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...a) { window.__notes++; return start.apply(this, a); };
    });
    await page.goto(URL_);
    await pose(page, {});
    await page.click('[data-game="freeze-dance"]');
    await expect(page.locator('#cd')).toBeVisible();
    // Dance from the countdown on: who dances for less than 40 % of a (possibly short) dance loses a life,
    // and noticing "Tanzen!" from here can take a second
    await pose(page, { dance: true });
    await expect(page.locator('#cd')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#prompt')).toHaveText('Tanzen! 🎵');
    const n0 = await page.evaluate(() => window.__notes);
    // The tune adds 4 to 7 notes in 600 ms (4 steps per second with 1 to 3 notes each) – wait for them instead of a fixed time
    await expect.poll(() => page.evaluate(() => window.__notes), { timeout: 3000 }).toBeGreaterThan(n0 + 4);
    // Sound off: the music stops
    await page.click('#btnSound');
    const n1 = await page.evaluate(() => window.__notes);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__notes)).toBe(n1);
    await page.click('#btnSound');
    // Dance until the stop, then freeze – at once, in the page: after the stop there are about 800 ms to stand still
    // (grace 1200 ms minus the 400 ms the movement is averaged over); waiting for the text from here can take longer
    await page.evaluate(() => {
      const el = document.getElementById('prompt');
      new MutationObserver(() => { if (el.textContent === 'Stopp! Einfrieren!' && window.__pose.dance) { window.__pose = {}; window.__bc.postMessage({}); } })
        .observe(el, { childList: true, characterData: true, subtree: true });
    });
    await expect(page.locator('#prompt')).toHaveText('Stopp! Einfrieren!', { timeout: 10000 });
    await expect(page.locator('#prompt')).toHaveText('Tanzen! 🎵', { timeout: 6000 });
    await expect(page.locator('#hudAScore')).toHaveText('⭐ 10');
    await expect(page.locator('#hudALives')).toHaveText('❤️❤️❤️');
  });

  test('copy the pose: the figure is shown, holding it scores', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    const def = await page.evaluate(async () => (await fetch('games/poses.json')).json());
    await pose(page, {});
    await page.click('[data-game="poses"]');
    await expect(page.locator('#cd')).toBeVisible();
    await expect(page.locator('#cd')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('#prompt')).not.toHaveText('', { timeout: 4000 });
    const text = await page.locator('#prompt').textContent();
    const target = def.params.poses.find(p => text === `${p.emoji} ${p.name.de}!`);
    expect(target, text).toBeTruthy();
    await pose(page, { armL: target.left, armR: target.right, legs: target.legs === 'apart' ? 'apart' : undefined, knee: target.legs === 'oneUp' ? 'left' : undefined });
    await expect(page.locator('#hudAScore')).toHaveText('⭐ 10', { timeout: 4000 });
    await expect(page.locator('#prompt')).toHaveText('');
  });

  test('settings: easier detection and graphics chip are passed on', async ({ page }) => {
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    await openMenu(page);
    await page.locator('#optEasy').check();
    await page.locator('#optGpu').uncheck();
    await closeMenu(page);
    await pose(page, {});
    await page.click('[data-game="simon"]');
    await expect(page.locator('#hud')).toBeVisible();
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('loading model {"mb":20.3,"gpu":false}');
    expect(diag).toContain('easy: true');
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
    // The graphics chip is tried first, then the processor
    expect(diag).toContain('loading model {"mb":20.3,"gpu":true}');

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
