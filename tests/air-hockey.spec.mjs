// Airhockey: physics checked against values computed here (bounces off cushions and mallets, goals only in the mouth,
// mallets stay in their half, the predicted crossing point matches the simulated path), whole games end with the
// right winner and serve; the computer scores against a passive player at every strength and the stronger computer
// beats the weaker one. In the page: two fingers at once steer both mallets (each stays with the half where it touched
// down), against the computer one finger anywhere steers blue, pause and resume, result and record, settings, English.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

const E = (() => { const c = {}; vm.runInNewContext(readFileSync('air-hockey/engine.js', 'utf8'), { self: c, Math }); return c.HockeyEngine; })();
const { W, H, GOAL, PUCK_R, MALLET_R, DT } = E;
// Fixed random numbers for the computer player (no flaky games)
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
// Mallets out of the way in the corners
const parkMallets = g => { g.mallets.forEach((m, i) => { m.x = m.tx = MALLET_R; m.y = m.ty = i ? MALLET_R : H - MALLET_R; }); };
const steps = (g, n) => { const ev = []; for (let k = 0; k < n; k++) ev.push(...E.step(g)); return ev; };

test.describe('engine', () => {
  test('the puck bounces off the side cushion with the cushion factor and slows only by the air friction', () => {
    const g = E.createGame(); parkMallets(g);
    Object.assign(g.puck, { x: W - 20, y: H / 2 + 30, vx: 120, vy: 0 });
    const ev = steps(g, Math.round(0.5 / DT));
    expect(ev).toContain('wall');
    // Without friction it would have to be 120 · 0.9 after the bounce; friction: e^(−0.25 · 0.5)
    expect(g.puck.vx).toBeCloseTo(-120 * E.WALL_E * Math.exp(-E.FRICTION * 0.5), 6);
    expect(g.puck.vy).toBe(0);
    expect(g.puck.x).toBeLessThan(W - PUCK_R);
  });

  test('a goal only counts inside the mouth; beside it the puck bounces off the short cushion', () => {
    let g = E.createGame(); parkMallets(g);
    Object.assign(g.puck, { x: W / 2 + GOAL / 2 - PUCK_R - 1, y: 30, vx: 0, vy: -150 });
    let ev = steps(g, 60);
    expect(ev).toContain('goal0');
    expect(g.score).toEqual([1, 0]);
    expect(g.phase).toBe('goal');

    g = E.createGame(); parkMallets(g);
    Object.assign(g.puck, { x: W / 2 + GOAL / 2 + PUCK_R + 2, y: 30, vx: 0, vy: -150 });
    ev = steps(g, 60);
    expect(ev).toContain('wall');
    expect(ev.some(e => e.startsWith('goal'))).toBe(false);
    expect(g.puck.vy).toBeGreaterThan(0);

    g = E.createGame(); parkMallets(g);   // bottom goal for red
    Object.assign(g.puck, { x: W / 2, y: H - 30, vx: 0, vy: 150 });
    steps(g, 60);
    expect(g.score).toEqual([0, 1]);
  });

  test('a moving mallet hits a resting puck with (1 + e) times its speed', () => {
    const g = E.createGame();
    const m = g.mallets[0];
    m.x = m.tx = W / 2; m.y = m.ty = H - 30;
    Object.assign(g.puck, { x: W / 2, y: H - 30 - MALLET_R - PUCK_R - 1, vx: 0, vy: 0 });
    // The mallet moves 100 units/s upwards (target far away, speed limited)
    m.speed = 100; E.setTarget(g, 0, W / 2, H / 2);
    const ev = steps(g, 3);
    expect(ev).toContain('hit0');
    expect(g.puck.vx).toBeCloseTo(0, 6);
    // The puck then moves one step away, slowed once by friction
    expect(g.puck.vy).toBeCloseTo(-(1 + E.HIT_E) * 100 * Math.exp(-E.FRICTION * DT), 6);
    expect(Math.hypot(g.puck.vx, g.puck.vy)).toBeLessThanOrEqual(E.MAX_PUCK);
  });

  test('mallets stay in their own half and inside the cushions and never move faster than their top speed', () => {
    const g = E.createGame();
    E.setTarget(g, 0, -50, 10);
    E.setTarget(g, 1, 500, H);
    expect([g.mallets[0].tx, g.mallets[0].ty]).toEqual([MALLET_R, H / 2 + MALLET_R]);
    expect([g.mallets[1].tx, g.mallets[1].ty]).toEqual([W - MALLET_R, H / 2 - MALLET_R]);
    const before = { x: g.mallets[0].x, y: g.mallets[0].y };
    E.step(g);
    expect(Math.hypot(g.mallets[0].x - before.x, g.mallets[0].y - before.y)).toBeCloseTo(E.MALLET_SPEED * DT, 6);
    steps(g, 120);
    expect(g.mallets[0].y).toBe(H / 2 + MALLET_R);
    expect(g.mallets[1].y).toBe(H / 2 - MALLET_R);
  });

  test('rounded corners: a puck pushed into a corner slides out instead of getting stuck', () => {
    const g = E.createGame(); parkMallets(g);
    const m = g.mallets[0];
    m.x = m.tx = 40; m.y = m.ty = H - 12;
    Object.assign(g.puck, { x: 20, y: H - 10, vx: 0, vy: 0 });
    E.setTarget(g, 0, 0, H);   // the finger pushes on into the corner
    expect(E.cornerOut(m.tx, m.ty, MALLET_R)).toBeNull();
    let out = false;
    for (let k = 0; k < 240 && !out; k++) { E.step(g); out = g.puck.y < H - E.CORNER - 5; }
    expect(out).toBe(true);
    // Never outside the rounded corner
    expect(E.cornerOut(g.puck.x, g.puck.y, PUCK_R)).toBeNull();
  });

  test('predictX gives the point where the simulated puck crosses a line, with bounces off the side cushions', () => {
    for (const [vx, vy] of [[90, -120], [-200, -60], [37, -150], [0, -100]]) {
      const g = E.createGame(); parkMallets(g);
      Object.assign(g.puck, { x: 30, y: 140, vx, vy });
      const lineY = 40, want = E.predictX(g.puck, lineY);
      while (g.puck.y > lineY) E.step(g);
      expect(Math.abs(g.puck.x - want)).toBeLessThan(Math.abs(vx) * DT + 0.01);
    }
    expect(E.predictX({ x: 50, y: 100, vx: 10, vy: 50 }, 40)).toBeNull();   // moving away
  });

  test('a goal pauses, then the player who conceded gets the puck on their side; the game ends at the goals to win', () => {
    const g = E.createGame({ goalsToWin: 2 }); parkMallets(g);
    Object.assign(g.puck, { x: W / 2, y: 20, vx: 0, vy: -150 });
    steps(g, 30);
    expect(g.phase).toBe('goal');
    const ev = steps(g, Math.ceil(E.PAUSE_GOAL / DT) + 1);
    expect(ev).toContain('serve');
    expect(g.phase).toBe('play');
    expect(g.puck).toMatchObject({ x: W / 2, y: H / 2 - 20, vx: 0, vy: 0 });   // red conceded: puck in the top half
    Object.assign(g.puck, { x: W / 2, y: 20, vx: 0, vy: -150 });
    expect(steps(g, 30)).toContain('over');
    expect(g.phase).toBe('over');
    expect(g.winner).toBe(0);
    expect(g.score).toEqual([2, 0]);
  });

  test('the computer scores the first goal against a passive player in most games at every strength', () => {
    // A passive blue mallet in front of its goal: shots can bounce back off it into the computer's goal
    const need = { easy: 6, medium: 6, hard: 6 };
    for (const level of ['easy', 'medium', 'hard']) {
      let first = 0;
      for (let seed = 1; seed <= 8; seed++) {
        const g = E.createGame({ goalsToWin: 3 }), mem = {}, rnd = lcg(seed);
        let t = 0;
        while (g.score[0] + g.score[1] === 0 && t < 60) { const p = E.aiTarget(g, level, mem, rnd); E.setTarget(g, 1, p.x, p.y); E.step(g); t += DT; }
        if (g.score[1] === 1) first++;
      }
      expect(first, level).toBeGreaterThanOrEqual(need[level]);
    }
  });

  test('the stronger computer beats the weaker one', () => {
    // Blue plays as the easy computer: the same code on the mirrored table
    const mirror = g => ({ phase: g.phase, puck: { x: g.puck.x, y: H - g.puck.y, vx: g.puck.vx, vy: -g.puck.vy },
      mallets: [g.mallets[1], g.mallets[0]].map(m => ({ ...m, y: H - m.y })) });
    let hardWins = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const g = E.createGame({ goalsToWin: 5 }), memA = {}, memB = {}, rnd = lcg(seed);
      let t = 0;
      while (g.phase !== 'over' && t < 900) {
        const a = E.aiTarget(g, 'hard', memA, rnd); E.setTarget(g, 1, a.x, a.y);
        const b = E.aiTarget(mirror(g), 'easy', memB, rnd); g.mallets[0].speed = E.LEVELS.easy.speed; E.setTarget(g, 0, b.x, H - b.y);
        E.step(g); t += DT;
      }
      expect(g.phase).toBe('over');
      if (g.winner === 1) hardWins++;
    }
    expect(hardWins).toBeGreaterThanOrEqual(3);
  });
});

/* ---------- Page ---------- */
const diag = async page => {
  const txt = await page.evaluate(() => Tools.diag.text());
  const get = k => JSON.parse(txt.match(new RegExp(`^${k}: (.*)$`, 'm'))[1]);
  return { mallets: get('mallets'), puck: get('puck'), fingers: get('fingers') };
};
// Table point → share of the canvas (portrait: the table with its rim as large as fits, as in app.js resize())
const screenPoint = (page, x, y) => page.evaluate(([x, y, W, H]) => {
  const r = document.getElementById('cv').getBoundingClientRect(), s = Math.min((r.width - 12) / (W + 8), (r.height - 12) / (H + 8));
  return [((r.width - W * s) / 2 + x * s) / r.width, ((r.height - H * s) / 2 + y * s) / r.height];
}, [x, y, W, H]);
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

  test('two players: two fingers at once steer both mallets, each stays with its half', async ({ page }) => {
    await page.goto('/air-hockey/');
    await page.click('#modes [data-mode="two"]');
    await expect(page.locator('#levels')).toBeHidden();
    await page.click('#btnStart');
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'play');
    await finger(page, 'pointerdown', 1, 0.25, 0.8);
    await finger(page, 'pointerdown', 2, 0.75, 0.2);
    expect((await diag(page)).fingers).toBe(2);
    await page.clock.runFor(1000);
    let d = await diag(page);
    // The table fills the width; finger at 25 % / 75 % of the width → about x = 22 / 78 in table units
    expect(d.mallets[0][0]).toBeLessThan(30);
    expect(d.mallets[0][1]).toBeGreaterThan(H / 2);
    expect(d.mallets[1][0]).toBeGreaterThan(70);
    expect(d.mallets[1][1]).toBeLessThan(H / 2);
    // The bottom finger slides into the top half: blue stops at the centre line, red stays where it is
    await finger(page, 'pointermove', 1, 0.5, 0.1);
    await page.clock.runFor(1000);
    d = await diag(page);
    expect(d.mallets[0]).toEqual([50, H / 2 + MALLET_R]);
    expect(d.mallets[1][0]).toBeGreaterThan(70);
    await finger(page, 'pointerup', 1, 0.5, 0.1);
    await finger(page, 'pointerup', 2, 0.75, 0.2);
    expect((await diag(page)).fingers).toBe(0);
  });

  test('against the computer: a finger anywhere steers blue; pause and resume', async ({ page }) => {
    await page.goto('/air-hockey/');
    await expect(page.locator('#modes [data-mode="cpu"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#record')).toHaveText('Noch keine Spiele gegen „Mittel“.');
    await expect(page.locator('#btnPause')).toBeHidden();
    await page.click('#btnStart');
    await finger(page, 'pointerdown', 5, 0.8, 0.15);   // top half – still blue
    await page.clock.runFor(1000);
    const d = await diag(page);
    expect(d.mallets[0][0]).toBeGreaterThan(70);
    expect(d.mallets[0][1]).toBe(H / 2 + MALLET_R);
    await page.click('#btnPause');
    await expect(page.locator('#panelTitle')).toHaveText('Pause');
    await expect(page.locator('#panelScore')).toHaveText(/^\d+ : \d+$/);
    await expect(page.locator('#modes')).toBeHidden();
    await expect(page.locator('#startLabel')).toHaveText('Weiterspielen');
    const frozen = (await diag(page)).puck;
    await page.clock.runFor(1000);
    expect((await diag(page)).puck).toEqual(frozen);
    await page.click('#btnStart');
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'play');
  });

  test('a finished game against the computer goes into the record; settings are kept', async ({ page }) => {
    // Fixed random numbers: the computer plays the same game every time
    await page.addInitScript(() => { let s = 42; Math.random = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; });
    await page.goto('/air-hockey/');
    await openMenu(page);
    await page.click('#optGoals [data-v="3"]');
    await page.locator('#optSound').uncheck();
    await page.locator('#optVibrate').uncheck();
    await closeMenu(page);
    await page.click('#levels [data-level="hard"]');
    await page.click('#btnStart');
    // Blue only pushes the puck over the centre line whenever it lies in the blue half
    for (let n = 0; n < 60 && await page.locator('#rink').getAttribute('data-phase') !== 'over'; n++) {
      await page.clock.runFor(1500);
      const { puck } = await diag(page);
      if (puck[1] <= H / 2 + PUCK_R) continue;
      // From below; at the bottom cushion from the side
      const low = puck[1] > H - 24, side = puck[0] < W / 2 ? 1 : -1;
      const from = await screenPoint(page, low ? puck[0] + side * 18 : puck[0], low ? puck[1] : puck[1] + 18);
      const to = await screenPoint(page, low ? puck[0] - side * 10 : puck[0], H / 2 - 20);
      await finger(page, 'pointerdown', 1, ...from);
      await page.clock.runFor(400);
      await finger(page, 'pointermove', 1, ...to);
      await page.clock.runFor(400);
      await finger(page, 'pointerup', 1, ...to);
    }
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'over');
    const score = (await page.locator('#panelScore').textContent()).split(' : ').map(Number);
    const won = score[0] === 3;
    expect(score).toContain(3);
    await expect(page.locator('#panelTitle')).toHaveText(won ? 'Gewonnen!' : 'Verloren');
    await expect(page.locator('#record')).toHaveText(won ? 'Bilanz (Schwer): 1 Sieg · 0 Niederlagen' : 'Bilanz (Schwer): 0 Siege · 1 Niederlage');
    await expect(page.locator('#startLabel')).toHaveText('Nochmal');
    await expect(page.locator('#status')).toContainText(/Tor für (Du|Computer)\./);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('air-hockey.settings.v1')));
    expect(saved).toEqual({ mode: 'cpu', level: 'hard', goals: 3, sound: false, fullscreen: true, vibrate: false, record: { hard: won ? { w: 1, l: 0 } : { w: 0, l: 1 } } });
    await page.reload();
    await expect(page.locator('#levels [data-level="hard"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#record')).toContainText('Bilanz (Schwer): ');
  });

  test('while playing the header is hidden; the pause button in the corner brings it back', async ({ page }) => {
    await page.goto('/air-hockey/');
    await expect(page.locator('body > header')).toBeVisible();
    await expect(page.locator('#btnPause')).toBeHidden();
    const before = (await page.locator('#cv').boundingBox()).height;
    await page.click('#btnStart');
    await expect(page.locator('body > header')).toBeHidden();
    await expect(page.locator('#btnPause')).toBeVisible();
    expect((await page.locator('#cv').boundingBox()).height).toBeGreaterThan(before);   // the table gets the room
    await page.click('#btnPause');
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'paused');
    await expect(page.locator('body > header')).toBeVisible();
    await expect(page.locator('#btnPause')).toBeHidden();
    // Space pauses too
    await page.click('#btnStart');
    await page.locator('#cv').press(' ');
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'paused');
  });

  test('Play switches to full screen; leaving it during the game pauses; the setting turns it off', async ({ page }) => {
    // Fake full screen API: records the calls, the back gesture is simulated by exitFullscreen()
    await page.addInitScript(() => {
      let el = null;
      const set = v => { el = v; document.dispatchEvent(new Event('fullscreenchange')); };
      Object.defineProperty(document, 'fullscreenElement', { get: () => el, configurable: true });
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => true, configurable: true });
      window.__fsCalls = 0;
      Element.prototype.requestFullscreen = function () { window.__fsCalls++; set(this); return Promise.resolve(); };
      document.exitFullscreen = () => { set(null); return Promise.resolve(); };
    });
    await page.goto('/air-hockey/');
    await page.click('#btnStart');
    await expect.poll(() => page.evaluate(() => window.__fsCalls)).toBe(1);
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'play');
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'paused');
    await page.click('#btnStart');   // resume: full screen again
    await expect.poll(() => page.evaluate(() => window.__fsCalls)).toBe(2);
    await page.click('#btnPause');
    await openMenu(page);
    await expect(page.locator('#optFullscreen')).toBeChecked();
    await page.locator('#optFullscreen').uncheck();
    await closeMenu(page);
    await page.evaluate(() => document.exitFullscreen());
    await page.click('#btnStart');
    await expect(page.locator('#rink')).toHaveAttribute('data-phase', 'play');
    expect(await page.evaluate(() => window.__fsCalls)).toBe(2);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('air-hockey.settings.v1'))).fullscreen).toBe(false);
  });

  test('the table lies sideways on a wide screen: blue plays from the right', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await page.goto('/air-hockey/');
    await page.click('#modes [data-mode="two"]');
    await page.click('#btnStart');
    await finger(page, 'pointerdown', 1, 0.6, 0.2);   // right half of the screen = blue, near the top = table x high
    await finger(page, 'pointerdown', 2, 0.4, 0.8);   // left half = red
    await page.clock.runFor(1000);
    const d = await diag(page);
    expect(d.mallets[0][1]).toBeGreaterThan(H / 2);
    expect(d.mallets[0][0]).toBeGreaterThan(60);
    expect(d.mallets[1][1]).toBeLessThan(H / 2);
    expect(d.mallets[1][0]).toBeLessThan(40);
    expect(await page.evaluate(() => Tools.diag.text())).toMatch(/^rotated: true$/m);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('texts in English', async ({ page }) => {
      await page.goto('/air-hockey/');
      await expect(page.locator('h1')).toHaveText('Air Hockey');
      await expect(page.locator('#record')).toHaveText('No games against “Medium” yet.');
      await page.click('#modes [data-mode="two"]');
      await expect(page.locator('#panelText')).toHaveText(/^Lay the device flat/);
      await switchLang(page, 'de');
      await expect(page.locator('#panelText')).toHaveText(/^Gerät flach hinlegen/);
    });
  });
});
