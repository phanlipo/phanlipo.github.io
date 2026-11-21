// Flipper: physics checked against values computed here (plunger, flippers, bumper, slingshot), the rules (top lanes
// with lane change and multiplier, drop targets, bonus on drain, ball save, game over after the last ball) and a long
// seeded run in which the ball never leaves the cabinet, never slips back into the shooter lane and never gets stuck.
// In the page: the right half pulls and releases the plunger, two fingers hold both flippers, pause and resume, a whole
// game ends with the best score stored, settings, English.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

const E = (() => { const c = {}; vm.runInNewContext(readFileSync('pinball/engine.js', 'utf8'), { self: c, Math }); return c.PinballEngine; })();
const { DT, BALL_R, FLIP_R, LANE_REST, LANE_X, SEP_X, CX } = E;
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const steps = (g, n) => { const ev = []; for (let k = 0; k < n; k++) ev.push(...E.step(g)); return ev; };
// A game with the ball already in play at a given spot (ball save off)
const inPlay = (b, opts) => { const g = E.createGame(opts); g.phase = 'play'; g.launched = true; Object.assign(g.b, b); return g; };

test.describe('engine', () => {
  test('the ball waits on the plunger; pulling moves it down; letting go launches it with the pulled strength', () => {
    const g = E.createGame();
    steps(g, 100);
    expect(g.b).toMatchObject({ x: LANE_X, y: LANE_REST, vx: 0, vy: 0 });
    E.setPlunger(g, true);
    steps(g, Math.round(E.PULL_TIME / 2 / DT));
    expect(g.pull).toBeCloseTo(0.5, 6);
    expect(g.b.y).toBeCloseTo(LANE_REST + 3, 6);
    const ev = E.setPlunger(g, false);
    expect(ev).toEqual(['launch']);
    expect(g.b.vy).toBeCloseTo(-(228 + (300 - 228) * 0.5), 6);
    expect(g.b.y).toBe(LANE_REST);
    expect(g.saveUntil).toBeCloseTo(g.time + 8, 6);
    // Full pull is capped at 1
    const h = E.createGame(); E.setPlunger(h, true); steps(h, Math.round(2 * E.PULL_TIME / DT));
    expect(h.pull).toBe(1);
  });

  test('a weak shot rises as high as gravity allows and falls back onto the plunger, ready again', () => {
    const g = E.createGame();
    g.b.vy = -150;
    let top = LANE_REST;
    for (let k = 0; k < 600 && !(k > 10 && g.b.vy === 0); k++) { E.step(g); top = Math.min(top, g.b.y); }
    // Rise against gravity g with friction k (dv/dt = −g − k·v): v₀/k − g/k² · ln(1 + k·v₀/g) – a little below v₀² / 2g
    const k = 0.12, g0 = E.GRAVITY, rise = 150 / k - g0 / (k * k) * Math.log(1 + k * 150 / g0);
    expect(rise).toBeLessThan(150 * 150 / (2 * g0));
    expect(Math.abs(top - (LANE_REST - rise))).toBeLessThan(1);
    expect(g.phase).toBe('launch');
    expect(g.b).toMatchObject({ x: LANE_X, y: LANE_REST, vx: 0, vy: 0 });
    expect(E.setPlunger(g, true)).toEqual([]);
    expect(E.setPlunger(g, false)).toEqual(['launch']);
  });

  test('a launch at any strength brings the ball through the gate into the playfield; the gate keeps it out of the lane', () => {
    for (const pull of [0, 0.5, 1]) {
      const g = E.createGame();
      E.setPlunger(g, true); steps(g, Math.round(pull * E.PULL_TIME / DT)); E.setPlunger(g, false);
      let k = 0;
      while (g.b.x > SEP_X && k++ < 2 / DT) E.step(g);
      expect(g.b.x, `pull ${pull}`).toBeLessThan(SEP_X);
      expect(g.phase).toBe('play');
    }
    // A ball dropping onto the gate from above rolls off to the left
    const g = inPlay({ x: 96, y: 40, vx: 0, vy: 0 });
    const ev = steps(g, Math.round(1.5 / DT));
    expect(g.b.x).toBeLessThan(SEP_X - BALL_R);
    expect(ev).not.toContain('saved');
  });

  test('flippers swing between rest and up at their speed; the right one mirrors the left', () => {
    const g = E.createGame();
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
    const g = inPlay({ x: 28 + d * Math.cos(a) + c * Math.sin(a), y: 158 + d * Math.sin(a) - c * Math.cos(a), vx: 0, vy: 0 });
    E.setFlipper(g, 0, true);
    const ev = steps(g, 8);
    expect(ev).toContain('flip0');
    // The surface there moves at ω·r = 20 · 9 = 180 units/s; the ball leaves at least that fast, upwards
    expect(Math.hypot(g.b.vx, g.b.vy)).toBeGreaterThan(180);
    expect(g.b.vy).toBeLessThan(-150);
  });

  test('a pop bumper kicks the ball away at its kick speed and scores 100', () => {
    const p = E.BUMPERS[2];
    const g = inPlay({ x: p.x, y: p.y + E.BUMPER_R + BALL_R + 2, vx: 0, vy: -40 });
    const ev = steps(g, 20);
    expect(ev.filter(e => e === 'bumper')).toHaveLength(1);
    expect(g.score).toBe(100);
    // Straight from below: straight back down, at the kick speed (plus gravity and friction of a few steps)
    expect(Math.abs(g.b.vx)).toBeLessThan(1e-6);
    expect(g.b.vy).toBeGreaterThan(E.BUMPER_KICK - 2);
    expect(g.b.vy).toBeLessThan(E.BUMPER_KICK + E.GRAVITY * 20 * DT);
  });

  test('a slingshot kicks the ball back towards the middle and scores 10', () => {
    // The kicking side of the left slingshot runs from (15.5, 120) to (25, 144); the ball comes from the middle
    const sx = 20.25, sy = 132, len = Math.hypot(9.5, 24), nx = 24 / len, ny = -9.5 / len;
    const g = inPlay({ x: sx + nx * 6, y: sy + ny * 6, vx: -nx * 60, vy: -ny * 60 });
    const ev = steps(g, 30);
    expect(ev).toContain('sling');
    expect(g.score).toBe(10);
    expect(g.b.vx * nx + g.b.vy * ny).toBeGreaterThan(E.SLING_KICK);
  });

  test('top lanes light up; all three raise the multiplier; a flipper press moves the lit lanes', () => {
    const g = inPlay({});
    const through = i => { Object.assign(g.b, { x: E.LANES[i], y: E.LANE_Y0 - 1, vx: 0, vy: 40 }); return steps(g, 30); };
    expect(through(0)).toContain('lane');
    expect(g.lanes).toEqual([true, false, false]);
    E.setFlipper(g, 1, true); E.setFlipper(g, 1, false);
    expect(g.lanes).toEqual([false, true, false]);
    E.setFlipper(g, 0, true); E.setFlipper(g, 0, false);
    E.setFlipper(g, 0, true);
    expect(g.lanes).toEqual([false, false, true]);
    E.setFlipper(g, 0, true);   // still held: no second step
    expect(g.lanes).toEqual([false, false, true]);
    E.setFlipper(g, 0, false);
    through(2);   // already lit: 100
    expect(g.score).toBe(600);
    through(0);
    const ev = through(1);
    expect(ev).toContain('lanesAll');
    expect(g.mult).toBe(2);
    expect(g.lanes).toEqual([false, false, false]);
    expect(g.score).toBe(500 + 100 + 500 + 500 + 2000);
    expect(g.bonus).toBe(300);
  });

  test('drop targets fall when hit; all three score 3000 × multiplier and stand up again', () => {
    const g = inPlay({});
    g.mult = 2;
    const hit = i => { const t = E.TARGETS[i]; Object.assign(g.b, { x: E.TARGET_X - 1 - BALL_R - 3, y: (t.y0 + t.y1) / 2, vx: 80, vy: 0 }); return steps(g, 12); };
    expect(hit(1)).toContain('target');
    expect(g.targets).toEqual([false, true, false]);
    expect(g.b.vx).toBeLessThan(0);
    hit(0);
    const ev = hit(2);
    expect(ev).toContain('bankAll');
    expect(g.targets).toEqual([false, false, false]);
    expect(g.score).toBe(3 * 250 + 3000 * 2);
    expect(g.bonus).toBe(300);
    expect(g.saveUntil).toBeGreaterThan(g.time + 3);
  });

  test('a lost ball adds bonus × multiplier, then the next ball waits; after the last ball the game is over', () => {
    const g = inPlay({ x: CX, y: 170, vx: 0, vy: 50 }, { balls: 2 });
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
    Object.assign(g.b, { x: CX, y: 170, vx: 0, vy: 50 }); g.saveUntil = 0;
    ev = steps(g, 60 + Math.ceil(1.6 / DT));
    expect(ev).toContain('over');
    expect(g.phase).toBe('over');
    expect(g.ball).toBe(2);
  });

  test('ball save: a ball lost right after the launch comes back onto the plunger', () => {
    const g = E.createGame();
    E.setPlunger(g, true); E.setPlunger(g, false);
    steps(g, 120);
    Object.assign(g.b, { x: CX, y: 170, vx: 0, vy: 50 });
    const ev = steps(g, 60);
    expect(ev).toContain('saved');
    expect(ev).not.toContain('drain');
    expect([g.ball, g.saved, g.phase]).toEqual([1, 1, 'launch']);
    expect(g.b).toMatchObject({ x: LANE_X, y: LANE_REST, vy: 0 });
    // Only once per launch: the next launch does not start a new ball save
    E.setPlunger(g, true); E.setPlunger(g, false);
    expect(g.saveUntil).toBe(0);
  });

  test('long seeded games: the ball stays in the cabinet, never slips into the shooter lane and never gets stuck', () => {
    const rnd = lcg(11), count = {};
    let games = 0, problem = null;
    for (let n = 0; n < 12; n++) {
      const g = E.createGame({ balls: 3 }), hold = [0, 0];
      let wasLane = true, t = 0;
      while (g.phase !== 'over' && t < 600) {
        if (g.phase === 'launch' && g.b.vy === 0) { E.setPlunger(g, true); steps(g, Math.floor(rnd() * 200)); E.setPlunger(g, false); }
        const b = g.b;
        for (const s of [0, 1]) {
          const f = g.flippers[s], near = b.y > 145 && b.y < 168 && (s === 0 ? b.x > 22 && b.x < CX : b.x > CX && b.x < 69) && b.vy > -20;
          if (near && !f.up && rnd() < 0.5) { E.setFlipper(g, s, true); hold[s] = 0.15; }
          if (f.up && (hold[s] -= DT) <= 0) E.setFlipper(g, s, false);
        }
        for (const e of E.step(g)) count[e] = (count[e] || 0) + 1;
        t += DT;
        // Plain checks per step (an expect() per step would make the test very slow); the first problem is reported below
        const lane = b.x > SEP_X && b.y > 62;
        if (!problem && !(Number.isFinite(b.x) && Number.isFinite(b.y) && b.x >= BALL_R - 1e-9 && b.x <= 100 - BALL_R + 1e-9 && b.y >= BALL_R - 1e-9)) problem = `outside the cabinet at ${b.x}, ${b.y}`;
        if (!problem && lane && !wasLane && g.phase === 'play') problem = `slipped into the shooter lane at ${b.x}, ${b.y}`;
        wasLane = lane;
      }
      if (g.phase === 'over') games++;
    }
    expect(problem).toBeNull();
    expect(games).toBe(12);
    expect(count.nudge || 0).toBe(0);
    for (const e of ['bumper', 'sling', 'lane', 'target', 'flip0', 'flip1', 'drain', 'saved']) expect(count[e], e).toBeGreaterThan(0);
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
    await expect(page.locator('#best')).toHaveText('Noch kein Bestwert mit 3 Kugeln.');
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
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('pinball.settings.v1'))))
      .toEqual({ balls: 3, sound: false, fullscreen: true, vibrate: false, best: { 3: score } });
    await page.reload();
    await expect(page.locator('#best')).toHaveText(`Bestwert (3 Kugeln): ${score.toLocaleString('de-DE')}`);
    await expect(page.locator('#optSound')).not.toBeChecked();
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
      await expect(page.locator('#best')).toHaveText('No best score with 3 balls yet.');
      await expect(page.locator('#hudBall')).toHaveText('Ball 1/3');
      await expect(page.locator('#panelText')).toHaveText(/^Left half of the screen/);
      await switchLang(page, 'de');
      await expect(page.locator('#panelText')).toHaveText(/^Linke Bildschirmhälfte/);
      await expect(page.locator('#hudBall')).toHaveText('Kugel 1/3');
    });
  });
});
