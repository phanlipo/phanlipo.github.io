// Tischtennis: ball flight checked against values computed here (gravity and bounce, length and speed of a shot from
// the swing, edge of the paddle angles the ball, the net, the paddle can't hit before the bounce), rules (out, net,
// missed, second bounce, serve rotation, win by two), the computer returns most shots at every strength and the
// stronger computer beats the weaker one. In the page: two fingers at once steer both paddles (each stays with the
// side where it touched down), a swipe serves, pause and resume, a whole game against the computer goes into the
// record, full screen, sideways on a wide screen, English.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

const E = (() => { const c = {}; vm.runInNewContext(readFileSync('table-tennis/engine.js', 'utf8'), { self: c, Math }); return c.PingEngine; })();
const { W, H, TX0, TY0, TY1, NET_Y, NET_H, BALL_R, PADDLE_R, DT, G } = E;
const lcg = seed => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const steps = (g, n) => { const ev = []; for (let k = 0; k < n; k++) ev.push(...E.step(g)); return ev; };
// A rally in progress: paddles out of the way in the corners of the room, the ball as given
function rally(ball) {
  const g = E.createGame();
  g.paddles.forEach((m, i) => { m.x = m.tx = PADDLE_R; m.y = m.ty = i ? PADDLE_R : H - PADDLE_R; });
  g.phase = 'play';
  g.ball = { x: W / 2, y: 140, z: 5, vx: 0, vy: 0, vz: 0, hitter: 1, bounced: false, net: false, serve: false, ...ball };
  return g;
}
// Steps until the first table bounce (or the end of the point); returns the ball at that moment
function untilBounce(g, max = 600) {
  for (let k = 0; k < max; k++) {
    const ev = E.step(g);
    if (ev.includes('table') || ev.some(e => e.startsWith('point'))) return { ...g.ball, ev };
  }
  return null;
}

test.describe('engine', () => {
  test('the ball falls with gravity and bounces off the table with the bounce factor; the second bounce wins the point', () => {
    const g = rally({ y: 130, z: 20, hitter: 1 });   // red's ball over blue's half
    const b = untilBounce(g);
    expect(b.ev).toEqual(['table']);
    // Falling 20 units: speed √(2 g h), given back with the bounce factor (one step of discretisation)
    expect(b.vz).toBeGreaterThan(E.BOUNCE * Math.sqrt(2 * G * 20) - G * DT * 2);
    expect(b.vz).toBeLessThan(E.BOUNCE * Math.sqrt(2 * G * 20) + G * DT * 2);
    expect(g.ball.bounced).toBe(true);
    const b2 = untilBounce(g);
    expect(b2.ev).toContain('point1');
    expect(g.lastPoint).toEqual({ to: 1, reason: 'miss' });
    expect(g.score).toEqual([0, 1]);
  });

  test('a shot flies faster and longer the faster the paddle swings, straight on from the middle of the paddle', () => {
    for (const swing of [0, 100, 250, E.PADDLE_SPEED]) {
      const k = 1 - Math.exp(-swing / E.SWING);
      const g = rally({ x: 40, y: 175, z: 8, hitter: null });
      const v = E.shot(g.ball, { x: 40, y: 183, vx: 0, vy: -swing }, 0);
      expect(v.vx).toBe(0);
      expect(v.vy).toBeCloseTo(-(E.V_MIN + E.V_ADD * k), 9);
      Object.assign(g.ball, v, { hitter: 0 });
      // Height over the net: the parabola z + vz·t − g t²/2 at the time it reaches the net
      const tn = (175 - NET_Y) / -v.vy;
      expect(8 + v.vz * tn - G * tn * tn / 2).toBeGreaterThan(NET_H + BALL_R);
      const b = untilBounce(g);
      expect(b.ev).toEqual(['table']);
      expect(Math.abs(b.y - (NET_Y - (E.L_MIN + E.L_ADD * k)))).toBeLessThan(1.5);
      expect(b.y).toBeGreaterThan(TY0);   // even the fastest swing lands on the table
    }
  });

  test('the edge of the paddle and a sideways movement angle the ball', () => {
    const b = { x: 50 + PADDLE_R + BALL_R, y: 170, z: 8, vx: 0, vy: 0, vz: 0 };
    expect(E.shot(b, { x: 50, y: 170, vx: 0, vy: -100 }, 0).vx).toBeCloseTo(E.SIDE, 9);
    expect(E.shot({ ...b, x: 50 - (PADDLE_R + BALL_R) / 2 }, { x: 50, y: 170, vx: 0, vy: -100 }, 0).vx).toBeCloseTo(-E.SIDE / 2, 9);
    expect(E.shot({ ...b, x: 50 }, { x: 50, y: 170, vx: 100, vy: -100 }, 0).vx).toBeCloseTo(15, 9);
    // Red's shot goes down
    expect(E.shot({ ...b, y: 30 }, { x: b.x, y: 22, vx: 0, vy: 100 }, 1).vy).toBeGreaterThan(0);
    // A ball from the very edge of the table, angled outwards: lands beside the table – out, point for red
    const g = rally({ x: TX0 + 2, y: 175, z: 8, hitter: null });
    Object.assign(g.ball, E.shot(g.ball, { x: TX0 + 2 + PADDLE_R, y: 175, vx: -150, vy: -150 }, 0), { hitter: 0 });
    const end = untilBounce(g);
    expect(end.ev).toContain('point1');
    expect(g.lastPoint).toEqual({ to: 1, reason: 'out' });
  });

  test('a ball flying too low into the net drops back on the hitter\'s side: point for the other player', () => {
    const g = rally({ y: 115, z: 3, vy: -150, vz: 0, hitter: 0 });
    const ev = steps(g, 30);
    expect(ev).toContain('net');
    expect(g.ball.y).toBeGreaterThan(NET_Y);
    steps(g, 120);
    expect(g.lastPoint).toEqual({ to: 1, reason: 'net' });
    expect(g.score).toEqual([0, 1]);
  });

  test('the receiver can only hit the ball after it bounced on their side; the ball then goes back', () => {
    // Red's ball comes down onto blue's half; blue's paddle stands in its way before the bounce
    const g = rally({ x: 50, y: 104, z: 9, vx: 0, vy: 90, vz: 0, hitter: 1 });
    const m = g.paddles[0];
    m.x = m.tx = 50; m.y = m.ty = 112;
    const before = steps(g, 12);
    expect(before.filter(e => e.startsWith('hit'))).toEqual([]);
    expect(g.ball.y).toBeGreaterThan(112);   // flew past (over) the paddle
    const b = untilBounce(g);
    expect(b.ev).toEqual(['table']);
    // Now the paddle moves into the ball from behind
    E.setTarget(g, 0, g.ball.x, g.ball.y);
    let hit = false;
    for (let k = 0; k < 60 && !hit; k++) hit = E.step(g).includes('hit0');
    expect(hit).toBe(true);
    expect(g.ball.vy).toBeLessThan(0);
    expect(g.ball).toMatchObject({ hitter: 0, bounced: false });
  });

  test('the server hits the waiting ball only with a moving paddle; the serve changes every 2 points, at the end after each', () => {
    const g = E.createGame({ pointsToWin: 11 });
    expect(g).toMatchObject({ phase: 'serve', server: 0 });
    expect(g.ball).toMatchObject({ x: W / 2, y: TY1 + 4, z: E.SERVE_Z });
    const m = g.paddles[0];
    m.x = m.tx = W / 2; m.y = m.ty = g.ball.y + PADDLE_R;   // touching, but at rest
    expect(steps(g, 30)).toEqual([]);
    E.setTarget(g, 0, W / 2, NET_Y);
    expect(steps(g, 10)).toContain('hit0');
    expect(g.phase).toBe('play');
    // Server per score: first server blue
    const sv = (a, b) => { g.score = [a, b]; return E.serverFor(g); };
    expect([sv(0, 0), sv(1, 0), sv(1, 1), sv(2, 1), sv(2, 2), sv(5, 4), sv(10, 9)]).toEqual([0, 0, 1, 1, 0, 0, 1]);
    expect([sv(10, 10), sv(11, 10), sv(11, 11), sv(12, 11)]).toEqual([0, 1, 0, 1]);
    const g5 = E.createGame({ pointsToWin: 5, server: 1 });
    g5.score = [4, 4];
    expect(E.serverFor(g5)).toBe(1);
  });

  test('a game is won with a lead of 2; after a point the next serve comes', () => {
    const g = E.createGame({ pointsToWin: 11 });
    // Blue's ball bounced on red's side and lands beside the table: blue's point
    const win = i => { g.phase = 'play'; g.ball = { x: 2, y: i === 0 ? 20 : 180, z: 0.1, vx: 0, vy: 0, vz: -30, hitter: i, bounced: true, net: false, serve: false }; return steps(g, 2); };
    g.score = [10, 10];
    expect(win(0)).toEqual(['point0']);
    expect(g).toMatchObject({ phase: 'point', score: [11, 10] });
    const ev = steps(g, Math.ceil(E.PAUSE_POINT / DT) + 1);
    expect(ev).toContain('serve');
    expect(g).toMatchObject({ phase: 'serve', server: 1 });   // 21 points played: every point from 10 : 10
    expect(g.ball).toMatchObject({ y: TY0 - 4, z: E.SERVE_Z, vx: 0, vy: 0 });
    expect(win(1)).toEqual(['point1']);
    expect(win(0)).toEqual(['point0']);
    expect(g.phase).toBe('point');
    expect(win(0)).toEqual(['point0', 'over']);
    expect(g).toMatchObject({ phase: 'over', winner: 0, score: [13, 11] });
  });

  test('the computer returns most shots onto the table at every strength', () => {
    const need = { easy: 28, medium: 32, hard: 36 };
    for (const level of ['easy', 'medium', 'hard']) {
      let ok = 0;
      const r2 = lcg(99);
      for (let k = 0; k < 40; k++) {
        // Blue's shot from behind its end with a random swing, position and spot on the paddle
        const sw = 60 + r2() * 260, x = TX0 + 10 + r2() * 56, off = (r2() - 0.5) * 1;
        const g = rally({ x, y: 172, z: 8, hitter: 0 }), mem = {}, rnd = lcg(k + 1);
        Object.assign(g.paddles[1], { x: W / 2, y: 16, tx: W / 2, ty: 16 });   // red waits at home
        Object.assign(g.ball, E.shot(g.ball, { x: x - off * (PADDLE_R + BALL_R), y: 180, vx: 0, vy: -sw }, 0));
        let back = false;
        for (let t = 0; t < 6 && !back && g.phase === 'play'; t += DT) {
          const p = E.aiTarget(g, level, mem, rnd); E.setTarget(g, 1, p.x, p.y);
          back = E.step(g).includes('table') && g.ball.hitter === 1 && g.ball.y > NET_Y;
        }
        if (back) ok++;
      }
      expect(ok, level).toBeGreaterThanOrEqual(need[level]);
    }
  });

  test('the stronger computer beats the weaker one', () => {
    // Blue plays as the easy computer: the same code on the mirrored room
    const mirror = g => ({ ...g, server: 1 - g.server,
      ball: { ...g.ball, y: H - g.ball.y, vy: -g.ball.vy, hitter: g.ball.hitter === null ? null : 1 - g.ball.hitter },
      paddles: [g.paddles[1], g.paddles[0]].map(m => ({ ...m, y: H - m.y, vy: -m.vy, ty: H - m.ty })) });
    let hardWins = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const g = E.createGame({ pointsToWin: 5 }), memA = {}, memB = {}, rnd = lcg(seed);
      let t = 0;
      while (g.phase !== 'over' && t < 600) {
        const a = E.aiTarget(g, 'hard', memA, rnd); E.setTarget(g, 1, a.x, a.y);
        const b = E.aiTarget(mirror(g), 'easy', memB, rnd); g.paddles[0].speed = E.LEVELS.easy.speed; E.setTarget(g, 0, b.x, H - b.y);
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
  const get = k => { const v = txt.match(new RegExp(`^${k}: (.*)$`, 'm'))[1]; try { return JSON.parse(v); } catch { return v; } };
  return { paddles: get('paddles'), ball: get('ball'), fingers: get('fingers'), engine: get('engine'), server: get('server'), score: get('score') };
};
// Room point → share of the canvas (portrait: the room as large as fits, as in app.js resize())
const screenPoint = (page, x, y) => page.evaluate(([x, y, W, H]) => {
  const r = document.getElementById('cv').getBoundingClientRect(), s = Math.min(r.width / W, r.height / H);
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
// Blue serves: finger behind the waiting ball, then through it towards the net
async function serveBlue(page) {
  const { ball } = await diag(page);
  await finger(page, 'pointerdown', 1, ...await screenPoint(page, ball[0], ball[1] + 14));
  await page.clock.runFor(300);
  await finger(page, 'pointermove', 1, ...await screenPoint(page, ball[0], ball[1] - 30));
  await page.clock.runFor(300);
  await finger(page, 'pointerup', 1, ...await screenPoint(page, ball[0], ball[1] - 30));
}

test.describe('page', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: 0 });
    await page.setViewportSize({ width: 375, height: 740 });
  });

  test('two players: two fingers at once steer both paddles, each stays with its side of the net', async ({ page }) => {
    await page.goto('/table-tennis/');
    await page.click('#modes [data-mode="two"]');
    await expect(page.locator('#levels')).toBeHidden();
    await page.click('#btnStart');
    await expect(page.locator('#panel')).toBeHidden();
    await expect(page.locator('#court')).toHaveAttribute('data-phase', 'play');
    await finger(page, 'pointerdown', 1, 0.25, 0.8);
    await finger(page, 'pointerdown', 2, 0.75, 0.2);
    expect((await diag(page)).fingers).toBe(2);
    await page.clock.runFor(1000);
    let d = await diag(page);
    expect(d.paddles[0][0]).toBeLessThan(32);
    expect(d.paddles[0][1]).toBeGreaterThan(NET_Y);
    expect(d.paddles[1][0]).toBeGreaterThan(68);
    expect(d.paddles[1][1]).toBeLessThan(NET_Y);
    // The bottom finger slides over the net: blue stops at the net, red stays where it is
    await finger(page, 'pointermove', 1, 0.5, 0.1);
    await page.clock.runFor(1000);
    d = await diag(page);
    expect(d.paddles[0]).toEqual([50, NET_Y + PADDLE_R]);
    expect(d.paddles[1][0]).toBeGreaterThan(68);
    await finger(page, 'pointerup', 1, 0.5, 0.1);
    await finger(page, 'pointerup', 2, 0.75, 0.2);
    expect((await diag(page)).fingers).toBe(0);
  });

  test('against the computer: a finger anywhere steers blue, a swipe serves; pause and resume', async ({ page }) => {
    await page.goto('/table-tennis/');
    await expect(page.locator('#modes [data-mode="cpu"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#record')).toHaveText('Noch keine Spiele gegen „Mittel“.');
    await expect(page.locator('#btnPause')).toBeHidden();
    await page.click('#btnStart');
    let d = await diag(page);
    expect(d).toMatchObject({ engine: 'serve', server: 0 });
    // Holding the paddle still next to the ball doesn't serve
    await finger(page, 'pointerdown', 5, ...await screenPoint(page, 20, 170));
    await page.clock.runFor(1000);
    expect((await diag(page)).engine).toBe('serve');
    await finger(page, 'pointerup', 5, 0.2, 0.8);
    await serveBlue(page);
    d = await diag(page);
    expect(d.engine).not.toBe('serve');
    expect(d.ball[1]).toBeLessThan(TY1);   // on its way to red
    // A finger in the top half still steers blue, which stops at the net
    await finger(page, 'pointerdown', 6, 0.8, 0.15);
    await page.clock.runFor(1000);
    d = await diag(page);
    expect(d.paddles[0][0]).toBeGreaterThan(70);
    expect(d.paddles[0][1]).toBe(NET_Y + PADDLE_R);
    await page.click('#btnPause');
    await expect(page.locator('#panelTitle')).toHaveText('Pause');
    await expect(page.locator('#panelScore')).toHaveText(/^\d+ : \d+$/);
    await expect(page.locator('#modes')).toBeHidden();
    await expect(page.locator('#startLabel')).toHaveText('Weiterspielen');
    const frozen = (await diag(page)).ball;
    await page.clock.runFor(1000);
    expect((await diag(page)).ball).toEqual(frozen);
    await page.click('#btnStart');
    await expect(page.locator('#court')).toHaveAttribute('data-phase', 'play');
  });

  test('a finished game against the computer goes into the record; settings are kept', async ({ page }) => {
    // Fixed random numbers: the computer plays the same game every time
    await page.addInitScript(() => { let s = 42; Math.random = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; });
    await page.goto('/table-tennis/');
    await openMenu(page);
    await page.click('#optPoints [data-v="5"]');
    await page.locator('#optSound').uncheck();
    await page.locator('#optVibrate').uncheck();
    await closeMenu(page);
    await page.click('#levels [data-level="hard"]');
    await page.click('#btnStart');
    // Blue only serves; it never returns a ball
    for (let n = 0; n < 80 && await page.locator('#court').getAttribute('data-phase') !== 'over'; n++) {
      const d = await diag(page);
      if (d.engine === 'serve' && d.server === 0) await serveBlue(page);
      else await page.clock.runFor(1000);
    }
    await expect(page.locator('#court')).toHaveAttribute('data-phase', 'over');
    const score = (await page.locator('#panelScore').textContent()).split(' : ').map(Number);
    const won = score[0] > score[1];
    expect(Math.max(...score)).toBeGreaterThanOrEqual(5);
    expect(Math.abs(score[0] - score[1])).toBeGreaterThanOrEqual(2);
    await expect(page.locator('#panelTitle')).toHaveText(won ? 'Gewonnen!' : 'Verloren');
    await expect(page.locator('#record')).toHaveText(won ? 'Bilanz (Schwer): 1 Sieg · 0 Niederlagen' : 'Bilanz (Schwer): 0 Siege · 1 Niederlage');
    await expect(page.locator('#startLabel')).toHaveText('Nochmal');
    await expect(page.locator('#status')).toContainText(/Punkt für (Du|Computer)\./);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('table-tennis.settings.v1')));
    expect(saved).toEqual({ mode: 'cpu', level: 'hard', points: 5, sound: false, fullscreen: true, vibrate: false, record: { hard: won ? { w: 1, l: 0 } : { w: 0, l: 1 } } });
    await page.reload();
    await expect(page.locator('#levels [data-level="hard"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#record')).toContainText('Bilanz (Schwer): ');
  });

  test('while playing the header is hidden; the pause button in the corner brings it back', async ({ page }) => {
    await page.goto('/table-tennis/');
    await expect(page.locator('body > header')).toBeVisible();
    await expect(page.locator('#btnPause')).toBeHidden();
    const before = (await page.locator('#cv').boundingBox()).height;
    await page.click('#btnStart');
    await expect(page.locator('body > header')).toBeHidden();
    await expect(page.locator('#btnPause')).toBeVisible();
    expect((await page.locator('#cv').boundingBox()).height).toBeGreaterThan(before);
    await page.click('#btnPause');
    await expect(page.locator('#court')).toHaveAttribute('data-phase', 'paused');
    await expect(page.locator('body > header')).toBeVisible();
    // Space pauses too
    await page.click('#btnStart');
    await page.locator('#cv').press(' ');
    await expect(page.locator('#court')).toHaveAttribute('data-phase', 'paused');
  });

  test('Play switches to full screen; leaving it during the game pauses; the setting turns it off', async ({ page }) => {
    await page.addInitScript(() => {
      let el = null;
      const set = v => { el = v; document.dispatchEvent(new Event('fullscreenchange')); };
      Object.defineProperty(document, 'fullscreenElement', { get: () => el, configurable: true });
      Object.defineProperty(document, 'fullscreenEnabled', { get: () => true, configurable: true });
      window.__fsCalls = 0;
      Element.prototype.requestFullscreen = function () { window.__fsCalls++; set(this); return Promise.resolve(); };
      document.exitFullscreen = () => { set(null); return Promise.resolve(); };
    });
    await page.goto('/table-tennis/');
    await page.click('#btnStart');
    await expect.poll(() => page.evaluate(() => window.__fsCalls)).toBe(1);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#court')).toHaveAttribute('data-phase', 'paused');
    await openMenu(page);
    await page.locator('#optFullscreen').uncheck();
    await closeMenu(page);
    await page.click('#btnStart');
    await expect(page.locator('#court')).toHaveAttribute('data-phase', 'play');
    expect(await page.evaluate(() => window.__fsCalls)).toBe(1);
    expect(JSON.parse(await page.evaluate(() => localStorage.getItem('table-tennis.settings.v1'))).fullscreen).toBe(false);
  });

  test('the table lies sideways on a wide screen: blue plays from the right', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 400 });
    await page.goto('/table-tennis/');
    await page.click('#modes [data-mode="two"]');
    await page.click('#btnStart');
    await finger(page, 'pointerdown', 1, 0.6, 0.2);   // right half of the screen = blue, near the top = room x high
    await finger(page, 'pointerdown', 2, 0.4, 0.8);   // left half = red
    await page.clock.runFor(1000);
    const d = await diag(page);
    expect(d.paddles[0][1]).toBeGreaterThan(NET_Y);
    expect(d.paddles[0][0]).toBeGreaterThan(60);
    expect(d.paddles[1][1]).toBeLessThan(NET_Y);
    expect(d.paddles[1][0]).toBeLessThan(40);
    expect(await page.evaluate(() => Tools.diag.text())).toMatch(/^rotated: true$/m);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('texts in English', async ({ page }) => {
      await page.goto('/table-tennis/');
      await expect(page.locator('h1')).toHaveText('Table Tennis');
      await expect(page.locator('#record')).toHaveText('No games against “Medium” yet.');
      await page.click('#modes [data-mode="two"]');
      await expect(page.locator('#panelText')).toHaveText(/^Lay the device flat/);
      await switchLang(page, 'de');
      await expect(page.locator('#panelText')).toHaveText(/^Gerät flach hinlegen/);
    });
  });
});
