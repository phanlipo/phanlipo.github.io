// Videoanalyse: a synthetic video (tests/fixtures/fall.webm, 320×240, 30 fps, 1,5 s) shows a red 16×16 square
// moving with constant velocity to the right and accelerating downwards: top-left corner x = 52 + 40·t,
// y = 22 + 60·t² (pixels). VP8 stores colour at half resolution, so the encoder puts the square on even pixels:
// centre x = 2·⌊(52 + 40t)/2⌋ + 8, y = 2·⌊(22 + 60t²)/2⌋ + 8. A black bar from x = 0 to 200 at y = 220…223 is the
// scale (200 px = 1 m). Expected: vx = 40/200 = 0,2 m/s, a = −120/200 = −0,6 m/s² (y upwards).
import { readFileSync } from 'node:fs';
import { test, expect, switchLang, mockLaunchQueue } from './helpers.mjs';

const VIDEO = new URL('./fixtures/fall.webm', import.meta.url).pathname;
const truth = k => { const t = k / 30; return { x: 2 * Math.floor((52 + 40 * t) / 2) + 8, y: 2 * Math.floor((22 + 60 * t * t) / 2) + 8 }; };
const num = s => Number(String(s).replace(/[^\d,.\-−]/g, '').replace('−', '-').replace(/\./g, '').replace(',', '.'));
const numEn = s => Number(String(s).replace(/[^\d.\-−]/g, '').replace('−', '-'));

async function open(page) {
  await page.locator('#fileIn').setInputFiles(VIDEO);
  await expect(page.locator('#videoCard')).toBeVisible();
  await expect(page.locator('#frameInfo')).toContainText(/(Bild|Frame) 1 (von|of) 45/);
}
// Tap a point given in video pixels (the overlay shows the video scaled to its width)
async function tap(page, x, y) {
  const box = await page.locator('#ov').boundingBox(), s = box.width / 320;
  await page.locator('#ov').click({ position: { x: x * s, y: y * s } });
}
async function frame(page, k) {
  await page.locator('#seek').fill(String(k));
  await expect(page.locator('#frameInfo')).toContainText(new RegExp(`(Bild|Frame) ${k + 1} `));
}
const kept = page => page.evaluate(async () => {
  const c = await caches.open('file:video-analysis'), r = await c.match('state');
  return r ? r.json() : null;
});
async function scaleAndOrigin(page) {
  await page.getByRole('button', { name: 'Maßstab', exact: true }).click();
  await tap(page, 0, 222);
  await expect(page.locator('#hint')).toHaveText('Jetzt das zweite Ende antippen.');
  await tap(page, 200, 222);
  await expect(page.locator('#hint')).toHaveText(/^Maßstab: 200,0 Pixel = 1 m\./);
  await page.getByRole('button', { name: 'Ursprung' }).click();
  await tap(page, 0, 222);
  await page.getByRole('button', { name: 'Punkte', exact: true }).click();
}
async function autoTrack(page) {
  await frame(page, 0);
  await tap(page, truth(0).x, truth(0).y);
  await frame(page, 0);
  await page.getByRole('button', { name: 'Automatisch verfolgen' }).click();
  await expect(page.locator('#hint')).toHaveText('44 Bilder automatisch verfolgt.', { timeout: 30000 });
}

test.describe('German', () => {
  test.use({ locale: 'de-DE' });
  test.beforeEach(async ({ page }) => { await page.goto('/video-analysis/'); });

  test('opens a video: frame rate detected, frames stepped, the decoder shows exactly that frame', async ({ page }) => {
    await open(page);
    await expect(page.locator('#fps')).toHaveValue('30');
    await expect(page.locator('#fpsAuto')).toHaveText('(erkannt: 30)');
    await page.getByRole('button', { name: '1 Bild vor' }).click();
    await expect(page.locator('#frameInfo')).toContainText('Bild 2 von 45');
    await page.getByRole('button', { name: '10 Bilder vor' }).click();
    await expect(page.locator('#frameInfo')).toContainText('Bild 12 von 45');
    await page.getByRole('button', { name: '10 Bilder zurück' }).click();
    await page.getByRole('button', { name: '1 Bild zurück' }).click();
    await expect(page.getByRole('button', { name: '1 Bild zurück' })).toBeDisabled();
    // Every frame: the red square in the picture is where the encoder put it
    for (const k of [0, 1, 7, 23, 44]) {
      await frame(page, k);
      const c = await page.evaluate(() => {
        const v = document.getElementById('vid'), cv = document.createElement('canvas');
        cv.width = 320; cv.height = 240;
        const g = cv.getContext('2d'); g.drawImage(v, 0, 0);
        const d = g.getImageData(0, 0, 320, 240).data;
        let sx = 0, sy = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i] > 180 && d[i + 1] < 90) { sx += (i / 4) % 320; sy += Math.floor(i / 4 / 320); n++; }
        return { x: sx / n + 0.5, y: sy / n + 0.5 };
      });
      expect(c).toEqual(truth(k));
    }
  });

  test('scale, origin and points by hand: table values recomputed independently', async ({ page }) => {
    await open(page);
    await scaleAndOrigin(page);
    for (const k of [0, 15, 30]) {
      await frame(page, k);
      await tap(page, truth(k).x, truth(k).y);
      // after a point the app moves on by one frame
      await expect(page.locator('#frameInfo')).toContainText(`Bild ${k + 2} von 45`);
    }
    await expect(page.locator('#summary')).toHaveText('3 Punkte · Maßstab 200,0 px = 1 m');
    const rows = await page.locator('#tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent)));
    expect(rows).toHaveLength(3);
    [0, 15, 30].forEach((k, i) => {
      const p = truth(k), [t, x, y] = rows[i].map(num);
      expect(t).toBeCloseTo(k / 30, 3);
      expect(x).toBeCloseTo(p.x / 200, 2);
      expect(y).toBeCloseTo((222 - p.y) / 200, 2);
    });
    // vx at the middle point: central difference over frames 0 and 30
    expect(num(rows[1][3])).toBeCloseTo((truth(30).x - truth(0).x) / 200 / 1, 2);
    // a tap in the same frame replaces the point; delete removes it
    await frame(page, 15);
    await expect(page.locator('#tbody tr.cur')).toHaveCount(1);
    await page.getByRole('button', { name: 'Punkt in diesem Bild löschen' }).click();
    await expect(page.locator('#tbody tr')).toHaveCount(2);
    // tapping the time in the table jumps to that frame
    await page.locator('#tbody tr').nth(1).getByRole('button').click();
    await expect(page.locator('#frameInfo')).toContainText('Bild 31 von 45');
  });

  test('loupe while touching; the point is set where the finger is lifted', async ({ page }) => {
    await open(page);
    const box = await page.locator('#ov').boundingBox(), s = box.width / 320;
    await page.mouse.move(box.x + 100 * s, box.y + 100 * s);
    await page.mouse.down();
    await expect(page.locator('#loupe')).toBeVisible();
    await page.mouse.move(box.x + 60 * s, box.y + 30 * s, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('#loupe')).toBeHidden();
    await expect(page.locator('#frameInfo')).toContainText('Bild 2 von 45');
    await expect.poll(async () => (await kept(page) || { points: {} }).points['0']).toBeTruthy();
    const st = await kept(page);
    expect(st.points['0'].x).toBeCloseTo(60, 0);
    expect(st.points['0'].y).toBeCloseTo(30, 0);
  });

  test('automatic tracking follows the square; fits give vx and the acceleration; CSV', async ({ page }) => {
    await open(page);
    await scaleAndOrigin(page);
    await autoTrack(page);
    // the work is kept shortly after a change
    await expect.poll(async () => Object.keys((await kept(page) || { points: {} }).points).length).toBe(45);
    const st = await kept(page);
    for (let k = 0; k <= 44; k++) {
      expect(Math.abs(st.points[k].x - truth(k).x), `x in frame ${k}`).toBeLessThan(1);
      expect(Math.abs(st.points[k].y - truth(k).y), `y in frame ${k}`).toBeLessThan(1);
    }
    await page.locator('#model').selectOption('quad');
    const accel = page.locator('#fitOut li').nth(1);
    await expect(accel).toHaveText(/^Beschleunigung 2c₂ = −?-?0,\d+ ± 0,\d+ m\/s²$/);
    const [a, da] = (await accel.textContent()).split('=')[1].split('±').map(num);
    // y = 2·⌊(22 + 60t²)/2⌋ + 8 is the parabola up to the rounding to even pixels
    expect(Math.abs(a - -0.6)).toBeLessThan(0.012);
    expect(da).toBeGreaterThan(0);
    expect(da).toBeLessThan(0.02);
    await page.locator('#qty').selectOption('x');
    await page.locator('#model').selectOption('lin');
    const [v] = (await page.locator('#fitOut li').nth(1).textContent()).split('=')[1].split('±').map(num);
    expect(Math.abs(v - 0.2)).toBeLessThan(0.004);
    // the choice of graph and fit is kept
    await page.reload();
    await expect(page.locator('#qty')).toHaveValue('x');
    await expect(page.locator('#model')).toHaveValue('lin');
    // CSV: German format, all points
    await expect(page.locator('#csv')).toBeEnabled();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#csv').click()]);
    expect(dl.suggestedFilename()).toMatch(/^videoanalyse-\d{4}-\d\d-\d\d\.csv$/);
    const lines = readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split(/\r\n/);
    expect(lines[0]).toBe('t (s);x (m);y (m);vx (m/s);vy (m/s)');
    expect(lines).toHaveLength(46);
    const last = lines[45].split(';').map(num);
    expect(last[0]).toBeCloseTo(44 / 30, 3);
    expect(Math.abs(last[1] - truth(44).x / 200)).toBeLessThan(0.006);
  });

  test('survives a reload; closing the video discards it', async ({ page }) => {
    await open(page);
    await scaleAndOrigin(page);
    await tap(page, truth(0).x, truth(0).y);
    await tap(page, truth(1).x, truth(1).y);
    await page.locator('#slow').fill('8');
    await page.waitForTimeout(500);
    await page.reload();
    await expect(page.locator('#videoCard')).toBeVisible();
    await expect(page.locator('#summary')).toHaveText('2 Punkte · Maßstab 200,0 px = 1 m');
    await expect(page.locator('#slow')).toHaveValue('8');
    // Zeitlupe 8: one frame is 1/240 s
    await expect(page.locator('#tbody tr').nth(1).locator('td').first()).toHaveText('0,004');
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Video schließen' }).click();
    await expect(page.locator('#loadCard')).toBeVisible();
    await expect(page.locator('#videoCard')).toBeHidden();
    expect(await page.evaluate(() => caches.has('file:video-analysis'))).toBe(false);
    await page.reload();
    await expect(page.locator('#loadCard')).toBeVisible();
  });

  test('x axis along a tilted scale; without a scale the values are in pixels', async ({ page }) => {
    await open(page);
    await tap(page, truth(0).x, truth(0).y);
    await expect(page.locator('#summary')).toHaveText('1 Punkt · ohne Maßstab – Werte in Pixeln');
    await expect(page.locator('#thead')).toContainText('x (px)');
    // bottom left corner is the default origin
    let cells = (await page.locator('#tbody tr').first().locator('td').allTextContents()).map(num);
    expect(cells[1]).toBeCloseTo(60, 0);
    expect(cells[2]).toBeCloseTo(240 - 30, 0);
    // scale from (20, 200) to (180, 80): 200 px = 1 m, tilted by atan(120/160)
    await page.getByRole('button', { name: 'Maßstab', exact: true }).click();
    await tap(page, 20, 200);
    await tap(page, 180, 80);
    await page.getByRole('button', { name: 'Ursprung' }).click();
    await tap(page, 20, 200);
    await page.getByLabel('x-Achse entlang des Maßstabs (bei schräg gehaltener Kamera)').check();
    // (60, 30) relative to the origin: (40, 170) up → rotated by −θ
    const th = Math.atan2(120, 160), dx = 40 / 200, dy = 170 / 200;
    cells = (await page.locator('#tbody tr').first().locator('td').allTextContents()).map(num);
    expect(cells[1]).toBeCloseTo(dx * Math.cos(th) + dy * Math.sin(th), 2);
    expect(cells[2]).toBeCloseTo(-dx * Math.sin(th) + dy * Math.cos(th), 2);
  });

  test('a file that is no playable video gives a message', async ({ page }) => {
    await page.locator('#fileIn').setInputFiles({ name: 'kaputt.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a video at all') });
    await expect(page.locator('#loadHint')).toHaveText('Dieses Video lässt sich im Browser nicht abspielen.');
    await expect(page.locator('#videoCard')).toBeHidden();
    await page.locator('#fileIn').setInputFiles({ name: 'notiz.txt', mimeType: 'text/plain', buffer: Buffer.from('hallo') });
    await expect(page.locator('#loadHint')).toHaveText('Das ist kein Video.');
  });

  test('fits: sine with period and errors, recomputed independently', async ({ page }) => {
    const r = await page.evaluate(() => {
      const ts = Array.from({ length: 90 }, (_, i) => i / 30);
      let s = 7;
      const noise = () => { s = (s * 16807) % 2147483647; return (s / 2147483647 - 0.5) * 0.004; };
      const ys = ts.map(t => 0.12 * Math.sin(2 * Math.PI / 1.3 * t + 0.4) + 0.5 + noise());
      return { sine: window.VideoMath.sineFit(ts, ys), quad: window.VideoMath.polyFit(ts, ts.map(t => 2 - 4.905 * t * t), 2) };
    });
    // within the noise (±0,002): the period to 0,1 %, and inside four standard errors
    const T = 2 * Math.PI / r.sine.omega, dT = T * r.sine.err.omega / r.sine.omega;
    expect(Math.abs(T - 1.3)).toBeLessThan(Math.min(1.3e-3, 4 * dT));
    expect(r.sine.A).toBeCloseTo(0.12, 3);
    expect(r.sine.c).toBeCloseTo(0.5, 3);
    expect(r.sine.err.omega).toBeGreaterThan(0);
    expect(r.sine.err.omega).toBeLessThan(0.01);
    expect(r.quad.coef[2]).toBeCloseTo(-4.905, 9);
    expect(r.quad.coef[0]).toBeCloseTo(2, 9);
  });
});

test.describe('shared and English', () => {
  test('a video opened with the installed app (file handler)', async ({ page }) => {
    await mockLaunchQueue(page, [{ name: 'wurf.webm', mimeType: 'video/webm', buffer: readFileSync(VIDEO) }]);
    await page.goto('/video-analysis/?opened=1');
    await expect(page.locator('#videoCard')).toBeVisible();
    await expect(page.locator('#frameInfo')).toContainText(/45/);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('texts, numbers and CSV in English', async ({ page }) => {
      await page.goto('/video-analysis/');
      await open(page);
      await page.getByRole('button', { name: 'Scale', exact: true }).click();
      await tap(page, 0, 222);
      await tap(page, 200, 222);
      await page.locator('#len').fill('100');
      await page.locator('#unit').selectOption('0.01');
      await expect(page.locator('#hint')).toHaveText(/^Scale: 200\.0 pixels = 100 cm\./);
      await page.getByRole('button', { name: 'Points', exact: true }).click();
      await tap(page, truth(0).x, truth(0).y);
      await tap(page, truth(1).x, truth(1).y);
      await expect(page.locator('#summary')).toHaveText('2 points · scale 200.0 px = 100 cm');
      const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#csv').click()]);
      expect(dl.suggestedFilename()).toMatch(/^video-analysis-/);
      const lines = readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '').trim().split(/\r\n/);
      expect(lines[0]).toBe('t (s),x (m),y (m),vx (m/s),vy (m/s)');
      expect(numEn(lines[2].split(',')[0])).toBeCloseTo(1 / 30, 4);
      await switchLang(page, 'de');
      await expect(page.locator('#summary')).toHaveText('2 Punkte · Maßstab 200,0 px = 100 cm');
    });
  });
});
