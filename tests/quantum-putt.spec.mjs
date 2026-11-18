// Quantenputt: physics checked against formulas computed here (FFT against a plain DFT, free wave packet: speed 2k and
// spreading σ√(1+(t/σ²)²), norm kept at walls, classical ball turns back on the ramp and at the tunnel, the wave tunnels),
// position measurement follows |ψ|², every course has a shot with a good chance; in the page: aiming by keyboard and
// dragging, hit, measure (miss: next hit from there; in the hole: score saved), course choice, restart with undo,
// settings, reload keeps the game, English.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { test, expect, openMenu, onDialog, switchLang } from './helpers.mjs';

const E = (() => { const c = {}; vm.runInNewContext(readFileSync('quantum-putt/engine.js', 'utf8'), { self: c, Math, Float64Array, Float32Array, Uint8Array, Uint32Array }); return c.PuttEngine; })();
const course = id => E.COURSES.find(c => c.id === id);
const centroid = (sim, W) => {
  const d = sim.density(); let sx = 0, sy = 0, a = 0;
  for (let i = 0; i < d.length; i++) { sx += d[i] * (i % W + 0.5); sy += d[i] * (Math.floor(i / W) + 0.5); a += d[i]; }
  const cx = sx / a, cy = sy / a; let vx = 0;
  for (let i = 0; i < d.length; i++) vx += d[i] * (i % W + 0.5 - cx) ** 2;
  return { x: cx, y: cy, sx: Math.sqrt(vx / a) };
};

test.describe('engine', () => {
  test('the FFT matches a plain DFT', () => {
    const n = 16, p = E.fftPlan(n), re = [], im = [];
    for (let i = 0; i < n; i++) { re.push(Math.sin(i * 1.3) + 0.2 * i); im.push(Math.cos(i * i * 0.7)); }
    const r = Float64Array.from(re), m = Float64Array.from(im);
    E.fft(p, r, m, -1);
    for (let k = 0; k < n; k++) {
      let a = 0, b = 0;
      for (let j = 0; j < n; j++) { const ph = -2 * Math.PI * j * k / n; a += re[j] * Math.cos(ph) - im[j] * Math.sin(ph); b += re[j] * Math.sin(ph) + im[j] * Math.cos(ph); }
      expect(r[k]).toBeCloseTo(a, 9); expect(m[k]).toBeCloseTo(b, 9);
    }
  });

  test('a free wave packet moves with 2k and spreads like σ√(1+(t/σ²)²); the norm stays 1', () => {
    const f = E.buildField(course('open')), sim = E.createSim(f);
    const sigma = 7, k = E.kOf(0.5);
    sim.launch(64, 200, 0, 0.5, sigma);
    expect(sim.norm()).toBeCloseTo(1, 9);
    const c0 = centroid(sim, E.W);
    expect(c0.sx).toBeCloseTo(sigma, 1);
    sim.step(40);   // t = 20: still far from the walls
    const c = centroid(sim, E.W);
    expect(c.y).toBeCloseTo(200 - 2 * k * 20, 0);
    expect(c.x).toBeCloseTo(64, 3);
    expect(c.sx).toBeCloseTo(sigma * Math.sqrt(1 + (20 / sigma ** 2) ** 2), 1);
    expect(sim.norm()).toBeCloseTo(1, 6);
  });

  test('the wave bounces off the border: nothing is lost, the classical ball comes back too', () => {
    const f = E.buildField(course('open')), sim = E.createSim(f), ball = E.createBall(f);
    sim.launch(64, 60, 0, 1, 7); ball.launch(64, 60, 0, 1);
    sim.step(100); ball.step(100);   // t = 50: up to the wall at y = 4 and back
    expect(sim.norm()).toBeCloseTo(1, 3);
    const k = E.kOf(1), y = 4 + (2 * k * 50 - (60 - 4));
    expect(centroid(sim, E.W).y).toBeGreaterThan(y - 8);
    expect(ball.y).toBeCloseTo(y, -1);
    expect(ball.py).toBeGreaterThan(0);
  });

  test('ramp: too weak and the classical ball rolls back; tunnel: the ball never passes, the wave partly does', () => {
    const ramp = E.buildField(course('ramp'));
    // Height 1.1 at the top: k² must exceed 1.1
    expect(E.kOf(0.6) ** 2).toBeLessThan(1.1);
    let b = E.createBall(ramp); b.launch(64, 226, 0, 0.6); b.step(300);
    expect(b.y).toBeGreaterThan(80);
    b.launch(64, 226, 0, 1); b.step(200);
    expect(b.y).toBeLessThan(80);
    // Energy kept: on the flat top p² = k² − 1.1
    expect(b.px ** 2 + b.py ** 2).toBeCloseTo(E.kOf(1) ** 2 - 1.1, 1);

    const tun = E.buildField(course('tunnel')), sim = E.createSim(tun);
    expect(E.kOf(1) ** 2).toBeLessThan(1.85);
    b = E.createBall(tun); b.launch(64, 226, 0, 1);
    sim.launch(64, 226, 0, 1, 7);
    let above = 0;
    for (let s = 0; s < 16; s++) {
      sim.step(10); b.step(10);
      expect(b.y).toBeGreaterThan(110);   // the sill spans y 110–112
      const d = sim.density(); let a = 0, all = 0;
      for (let i = 0; i < d.length; i++) { all += d[i]; if (i < 110 * E.W) a += d[i]; }
      above = Math.max(above, a / all);
    }
    expect(above).toBeGreaterThan(0.1);
    expect(above).toBeLessThan(0.6);
  });

  test('the measurement picks points with probability |ψ|²', () => {
    const c = course('open'), f = E.buildField(c), sim = E.createSim(f);
    sim.launch(64, 120, 30, 0.5, 7);
    sim.step(30);
    const [hx, hy] = [Math.floor(64 + 25), Math.floor(100)];
    const p = sim.probIn(hx, hy, 10);
    expect(p).toBeGreaterThan(0.05);
    // Evenly spread u: the share of points inside the circle is its probability
    const n = 4000; let inside = 0;
    for (let i = 0; i < n; i++) {
      const q = sim.sample((i + 0.5) / n, 0.5, 0.5);
      expect(f.wall[Math.floor(q.y) * E.W + Math.floor(q.x)]).toBe(0);
      if (Math.hypot(q.x - hx, q.y - hy) <= 10) inside++;
    }
    expect(inside / n).toBeCloseTo(p, 1);
  });

  test('ten own courses, each with a shot that has a fair chance', () => {
    expect(E.COURSES.map(c => c.id)).toEqual(['open', 'lens', 'ramp', 'hill', 'funnel', 'slits', 'corner', 'crystal', 'tunnel', 'zigzag']);
    // Best chance of one hit straight at the hole (corner, crystal, zigzag: aimed, values from tuning)
    const shots = { open: [0, 1, 0.4], lens: [0, 1, 0.45], ramp: [0, 1, 0.3], hill: [15, 1, 0.12], funnel: [0, 1, 0.18],
      slits: [0, 0.7, 0.1], corner: [-10, 1, 0.05], crystal: [-10, 1, 0.03], tunnel: [0, 1, 0.06], zigzag: [30, 1, 0.005] };
    for (const c of E.COURSES) {
      const f = E.buildField(c), sim = E.createSim(f);
      expect(f.wall[Math.floor(c.start[1]) * E.W + c.start[0]], c.id).toBe(0);
      const [a, s, want] = shots[c.id];
      sim.launch(c.start[0], c.start[1], a, s, 7);
      let best = 0;
      for (let k = 0; k < 50; k++) { sim.step(8); best = Math.max(best, sim.probIn(...c.hole)); }
      expect(best, c.id).toBeGreaterThan(want);
      expect(sim.norm(), c.id).toBeCloseTo(1, 2);
    }
  });
});

test.describe('page', () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.install({ time: 0 });   // the wave only runs when the test lets time pass
    await page.clock.pauseAt(1000);   // time stands still: no animation frames on their own
    await page.goto('/quantum-putt/');
  });
  const setGame = (page, game, settings) => page.evaluate(([g, s]) => {
    localStorage.setItem('quantum-putt.game.v1', JSON.stringify(g));
    if (s) localStorage.setItem('quantum-putt.settings.v1', JSON.stringify(s));
  }, [game, settings]);

  test('aim with keys and by dragging, hit, the wave runs, measure a miss: the next hit starts there', async ({ page }) => {
    await expect(page.locator('#courseName')).toHaveText('Bahn 1: Freie Bahn');
    await expect(page.locator('#strokes')).toHaveText('Par 2');
    await expect(page.locator('#status')).toHaveText('Wie weit läuft die Welle auseinander? Richtung geradeaus · Stärke 60 %');
    await page.focus('#cv');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('#status')).toContainText('Richtung 4° rechts · Stärke 65 %');
    // Drag: 50 cells straight left of the ball (64, 226) = −90°, strength 0.5
    const box = await page.locator('#cv').boundingBox();
    const geo = await page.evaluate(() => { const r = document.getElementById('view').getBoundingClientRect(); const s = Math.min((r.width - 12) / 128, (r.height - 12) / 256); return { s, ox: (r.width - 128 * s) / 2, oy: (r.height - 256 * s) / 2 }; });
    const at = (x, y) => [box.x + geo.ox + x * geo.s, box.y + geo.oy + y * geo.s];
    await page.mouse.move(...at(64, 180));
    await page.mouse.down();
    await page.mouse.move(...at(14, 226));
    await page.mouse.up();
    await expect(page.locator('#status')).toContainText('Richtung 90° links · Stärke 50 %');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('#btnMain')).toHaveText('Messen');
    await expect(page.locator('#chance')).toBeVisible();
    await expect(page.locator('#strokes')).toHaveText('Schlag 1 · Par 2');
    await page.clock.runFor(500);
    await expect(page.locator('#chanceVal')).toHaveText('0 %');
    await page.evaluate(() => { Math.random = () => 0.5; });
    await page.click('#btnMain');
    await expect(page.locator('#status')).toContainText('Gemessen: daneben. Der nächste Schlag geht von hier.');
    await expect(page.locator('#btnMain')).toHaveText('Schlagen');
    const g = await page.evaluate(() => JSON.parse(localStorage.getItem('quantum-putt.game.v1')));
    expect(g.course).toBe('open');
    expect(g.strokes).toBe(1);
    expect(g.holed).toBe(false);
    // Hit to the left (−80°): the ball was found left of the tee, about level with it
    expect(g.ball[0]).toBeLessThan(60);
    expect(Math.abs(g.ball[1] - 226)).toBeLessThan(30);
    await page.reload();
    await expect(page.locator('#strokes')).toHaveText('Schlag 1 · Par 2');
  });

  test('measured in the hole: sunk, best result saved, next course; course list shows it', async ({ page }) => {
    // Ball just below the hole centre, narrow wave, measured at once. The cells are summed row by row: u = 0.45
    // ends in the middle of the row just above the packet's centre (0.5 would end exactly at a row's last cell).
    await setGame(page, { course: 'open', strokes: 2, ball: [64, 54], holed: false }, { size: 'small' });
    await page.reload();
    await page.evaluate(() => { Math.random = () => 0.45; });
    await page.click('#btnMain');
    await page.click('#btnMain');
    await expect(page.locator('#status')).toHaveText('Eingelocht mit 3 Schlägen – 1 über Par! Neuer Bestwert.');
    await expect(page.locator('#status')).toHaveClass(/ok/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quantum-putt.scores.v1')))).toEqual({ open: 3 });
    await page.click('#btnCourses');
    await expect(page.locator('#total')).toHaveText('Gespielt: 1 von 10 Bahnen · zusammen 3 Schläge (Par 2)');
    await expect(page.locator('[data-course="open"]')).toContainText('Par 2 · Bestwert 3');
    await expect(page.locator('[data-course="tunnel"]')).toContainText('Par 4 · noch nicht gespielt');
    await page.click('#btnCourses');
    await expect(page.locator('#btnMain')).toHaveText('Nächste Bahn');
    await page.click('#btnMain');
    await expect(page.locator('#courseName')).toHaveText('Bahn 2: Linse');
    await expect(page.locator('#strokes')).toHaveText('Par 2');
    // A worse result does not replace the best one
    await setGame(page, { course: 'open', strokes: 5, ball: [64, 54], holed: false });
    await page.reload();
    await page.evaluate(() => { Math.random = () => 0.45; });
    await page.click('#btnMain');
    await page.click('#btnMain');
    await expect(page.locator('#status')).toHaveText('Eingelocht mit 6 Schlägen – 4 über Par!');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quantum-putt.scores.v1')))).toEqual({ open: 3 });
    // Deleting the best results asks first
    await onDialog(page, d => d.accept(), { once: true });
    await openMenu(page);
    await page.click('#btnClearScores');
    await expect(page.locator('#toast')).toHaveText('Bestwerte gelöscht');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quantum-putt.scores.v1')))).toEqual({});
  });

  test('choosing a course, restarting it with undo', async ({ page }) => {
    await page.click('#btnCourses');
    await expect(page.locator('#game')).toBeHidden();
    await expect(page.locator('#btnRestart')).toBeHidden();
    await page.click('[data-course="tunnel"]');
    await expect(page.locator('#courseName')).toHaveText('Bahn 9: Tunnel');
    await page.click('#btnMain');
    await page.click('#btnMain');
    await expect(page.locator('#strokes')).toHaveText('Schlag 1 · Par 4');
    await page.click('#btnRestart');
    await expect(page.locator('#strokes')).toHaveText('Par 4');
    await page.locator('#toast button').click();
    await expect(page.locator('#strokes')).toHaveText('Schlag 1 · Par 4');
  });

  test('settings are saved', async ({ page }) => {
    await openMenu(page);
    await page.locator('#optSize [data-v="large"]').click();
    await page.locator('#optSpeed [data-v="fast"]').click();
    await page.uncheck('#optGhost');
    await page.check('#optPhase');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('quantum-putt.settings.v1'))))
      .toEqual({ size: 'large', speed: 'fast', ghost: false, phase: true });
    await page.reload();
    await openMenu(page);
    await expect(page.locator('#optSize [data-v="large"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#optPhase')).toBeChecked();
    await expect(page.locator('#optGhost')).not.toBeChecked();
  });

  test('English', async ({ page }) => {
    await switchLang(page, 'en');
    await expect(page.locator('#courseName')).toHaveText('Course 1: Open green');
    await expect(page.locator('#status')).toHaveText('How far does the wave spread? Direction straight · strength 60 %');
    await expect(page.locator('#btnMain')).toHaveText('Hit');
    await page.click('#btnMain');
    await expect(page.locator('#btnMain')).toHaveText('Measure');
    await expect(page.locator('#chance')).toContainText('In the hole');
  });
});
