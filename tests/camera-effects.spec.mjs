// Kamera-Effekte: effects checked pixel by pixel on a fake camera picture, mirroring, camera switch,
// people detection with a fake worker (boxes, count, effect only on people / background), download prompt,
// photo, camera off in the background – and the real MediaPipe pipeline with the small selfie segmenter
// (tests/fixtures/selfie_segmenter.tflite): network guard against the library's usage statistics, offline.
import { test, expect, openMenu, closeMenu, switchLang, axe } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fakeCamera, fakeWorker, pixel, URL_, LS } from './camera-fakes.mjs';

// Settings before the page loads (e.g. mirroring off, so screen = camera picture)
const preset = (page, s) => page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [LS, JSON.stringify(s)]);

async function startCamera(page) {
  await page.click('#btnStart');
  await expect(page.locator('#overlay')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.getElementById('out').width)).toBe(320);
}
// Waits until the colour is within ±tol of the expected one (the video path rounds a little)
async function expectColor(page, fx, fy, rgb, tol = 14) {
  await expect.poll(async () => {
    const p = await pixel(page, fx, fy);
    return p.every((v, i) => Math.abs(v - rgb[i]) <= tol) ? 'ok' : p.join(',');
  }, { message: `colour at ${fx},${fy} ≈ ${rgb}` }).toBe('ok');
}
const effect = (page, id) => page.click(`#fx button[data-fx="${id}"]`);
const lum = ([r, g, b]) => Math.round(0.299 * r + 0.587 * g + 0.114 * b);

test.describe('effects', () => {
  test.beforeEach(async ({ page }) => {
    await fakeCamera(page);
    await preset(page, { mirror: false });
    await page.goto(URL_);
    await startCamera(page);
  });

  test('colour effects change every pixel as computed', async ({ page }) => {
    await expect(page.locator('#fx button[data-fx="none"]')).toHaveAttribute('aria-pressed', 'true');
    await expectColor(page, 0.25, 0.25, [255, 0, 0]);
    await expectColor(page, 0.75, 0.25, [0, 255, 0]);
    await expectColor(page, 0.25, 0.75, [0, 0, 255]);
    await effect(page, 'gray');
    await expect(page.locator('#fx button[data-fx="gray"]')).toHaveAttribute('aria-pressed', 'true');
    for (const [fx, fy, c] of [[0.25, 0.25, [255, 0, 0]], [0.75, 0.25, [0, 255, 0]], [0.25, 0.75, [0, 0, 255]]])
      await expectColor(page, fx, fy, [lum(c), lum(c), lum(c)]);
    await effect(page, 'invert');
    await expectColor(page, 0.25, 0.25, [0, 255, 255]);
    await expectColor(page, 0.75, 0.75, [0, 0, 0]);
    await effect(page, 'sepia');
    // Sepia matrix on pure red: 0.393/0.349/0.272 × 255
    await expectColor(page, 0.25, 0.25, [100, 89, 69]);
    await effect(page, 'thermal');
    await expectColor(page, 0.75, 0.75, [255, 255, 255]);
    await expect(page.locator('#out')).toHaveAttribute('aria-label', 'Kamerabild mit Effekt Wärmebild');
    // Still the same after a reload
    await page.reload();
    await expect(page.locator('#fx button[data-fx="thermal"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('strength mixes original and effect', async ({ page }) => {
    await effect(page, 'invert');
    await openMenu(page);
    await page.locator('#optStrength').fill('50');
    await expect(page.locator('#strengthOut')).toHaveText('50 %');
    await closeMenu(page);
    // Halfway between red (255,0,0) and its negative (0,255,255)
    await expectColor(page, 0.25, 0.25, [128, 128, 128]);
  });

  test('geometric effects: mirror, pixel, kaleidoscope', async ({ page }) => {
    await effect(page, 'mirror');
    // Right half shows the left half mirrored: red at the top on both sides
    await expectColor(page, 0.75, 0.25, [255, 0, 0]);
    await expectColor(page, 0.75, 0.75, [0, 0, 255]);
    await effect(page, 'pixel');
    await expectColor(page, 0.25, 0.25, [255, 0, 0]);
    await expectColor(page, 0.75, 0.75, [255, 255, 255]);
    await effect(page, 'kaleido');
    await expect.poll(async () => (await pixel(page, 0.5, 0.5)).join(',')).not.toBe('0,0,0');
  });

  test('every effect draws without errors', async ({ page }) => {
    const ids = await page.$$eval('#fx button', b => b.map(x => x.dataset.fx));
    expect(ids).toHaveLength(16);
    for (const id of ids) {
      await effect(page, id);
      await expect(page.locator(`#fx button[data-fx="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await page.waitForTimeout(60);
      expect(await page.evaluate(() => document.getElementById('out').getContext('webgl').getError())).toBe(0);
    }
  });
});

test('selfie camera is mirrored, rear camera is not', async ({ page }) => {
  await fakeCamera(page);
  await page.goto(URL_);
  await startCamera(page);
  expect(await page.evaluate(() => window.__gum[0].video.facingMode)).toEqual({ ideal: 'user' });
  // Mirrored: the red top-left quadrant of the camera shows up at the top right
  await expectColor(page, 0.75, 0.25, [255, 0, 0]);
  await openMenu(page);
  await page.locator('#optMirror').uncheck();
  await closeMenu(page);
  await expectColor(page, 0.25, 0.25, [255, 0, 0]);
  await page.locator('#optMirror').evaluate(e => { e.checked = true; e.dispatchEvent(new Event('change')); });
  await expectColor(page, 0.75, 0.25, [255, 0, 0]);
  await page.click('#btnFlip');
  await expect.poll(() => page.evaluate(() => window.__gum.length)).toBe(2);
  expect(await page.evaluate(() => window.__gum[1].video.facingMode)).toEqual({ ideal: 'environment' });
  // The first camera is switched off, the rear one is not mirrored
  expect(await page.evaluate(() => window.__tracks[0].readyState)).toBe('ended');
  await expectColor(page, 0.25, 0.25, [255, 0, 0]);
  await page.reload();
  await startCamera(page);
  expect(await page.evaluate(() => window.__gum[0].video.facingMode)).toEqual({ ideal: 'environment' });
});

test('camera denied: message and try again', async ({ page }) => {
  await fakeCamera(page, { deny: 'NotAllowedError' });
  await page.goto(URL_);
  await page.click('#btnStart');
  await expect(page.locator('#ovText')).toContainText('abgelehnt');
  await expect(page.locator('#btnStart')).toHaveText('Nochmal versuchen');
  await expect(page.locator('#btnPhoto')).toBeDisabled();
  await page.click('#btnStart');
  await expect.poll(() => page.evaluate(() => window.__gum.length)).toBe(2);
  expect(await page.evaluate(() => Tools.diag.text())).toContain('camera error {"name":"NotAllowedError"}');
});

test('no camera found', async ({ page }) => {
  await fakeCamera(page, { deny: 'NotFoundError' });
  await page.goto(URL_);
  await page.click('#btnStart');
  await expect(page.locator('#ovText')).toHaveText('Keine Kamera gefunden.');
});

test('camera turns off in the background and on again', async ({ page }) => {
  await fakeCamera(page);
  await page.goto(URL_);
  await startCamera(page);
  const setHidden = h => page.evaluate(h => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  }, h);
  await setHidden(true);
  expect(await page.evaluate(() => window.__tracks[0].readyState)).toBe('ended');
  await setHidden(false);
  await expect.poll(() => page.evaluate(() => window.__gum.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__tracks[1].readyState)).toBe('live');
});

test('photo with the effect: preview, save', async ({ page }) => {
  await fakeCamera(page);
  await preset(page, { mirror: false, effect: 'invert' });
  await page.goto(URL_);
  await startCamera(page);
  await expectColor(page, 0.25, 0.25, [0, 255, 255]);
  await page.click('#btnPhoto');
  await expect(page.locator('#photo')).toBeVisible();
  // The photo shows the effect: negative of red at the top left
  const c = await page.locator('#photoImg').evaluate(async img => {
    await img.decode();
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
    return [cv.width, cv.height, ...x.getImageData(80, 60, 1, 1).data.slice(0, 3)];
  });
  expect(c.slice(0, 2)).toEqual([320, 240]);
  c.slice(2).forEach((v, i) => expect(Math.abs(v - [0, 255, 255][i])).toBeLessThan(20));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  expect(dl.suggestedFilename()).toMatch(/^kamera-effekte-\d{4}-\d\d-\d\d-\d{6}\.jpg$/);
  await page.click('#btnClose');
  await expect(page.locator('#photo')).toBeHidden();
});

test.describe('people (fake detection worker)', () => {
  test('asks before the download, then frames and counts people', async ({ page }) => {
    await fakeCamera(page);
    await preset(page, { mirror: false });
    const w = await fakeWorker(page);
    await page.goto(URL_);
    await startCamera(page);
    let msg = '';
    page.once('dialog', d => { msg = d.message(); d.accept(); });
    await page.click('#btnDetect');
    await expect(page.locator('#badge')).toHaveText('👤 2 Personen');
    // Not cached yet: engine (14.5 MB) + model (4.6 MB)
    expect(msg).toContain('ca. 19,1 MB');
    expect(msg).toContain('Google');
    expect(w.n).toBe(1);
    await expect(page.locator('#btnDetect')).toHaveAttribute('aria-pressed', 'true');
    // Frame of person 1 (x 0.1–0.4, y 0.2–0.8): magenta line on its left edge, nothing inside
    await expect.poll(async () => (await pixel(page, 0.1, 0.5, 'boxes')).join(',')).toBe('255,43,214');
    const inside = await page.evaluate(() => {
      const c = document.getElementById('boxes'); return c.getContext('2d').getImageData(c.width * 0.25, c.height * 0.5, 1, 1).data[3];
    });
    expect(inside).toBe(0);
    // Turning it off removes the frames and the count
    await page.click('#btnDetect');
    await expect(page.locator('#badge')).toBeHidden();
    await expect.poll(async () => page.evaluate(() => {
      const c = document.getElementById('boxes'); return c.getContext('2d').getImageData(c.width * 0.1, c.height * 0.5, 1, 1).data[3];
    })).toBe(0);
  });

  test('effect only on people or only on the background', async ({ page }) => {
    await fakeCamera(page);
    await preset(page, { mirror: false, effect: 'invert' });
    await fakeWorker(page);
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    await startCamera(page);
    await page.click('[data-scope="people"]');
    await expect(page.locator('[data-scope="people"]')).toHaveAttribute('aria-pressed', 'true');
    // The fake mask marks the left half as person: only there the picture is negative
    await expectColor(page, 0.25, 0.25, [0, 255, 255]);
    await expectColor(page, 0.75, 0.25, [0, 255, 0]);
    await expect(page.locator('#out')).toHaveAttribute('aria-label', 'Kamerabild mit Effekt Negativ auf Personen');
    await page.click('[data-scope="background"]');
    await expectColor(page, 0.25, 0.25, [255, 0, 0]);
    await expectColor(page, 0.75, 0.25, [255, 0, 255]);
    await page.click('[data-scope="all"]');
    await expectColor(page, 0.25, 0.25, [0, 255, 255]);
    await expectColor(page, 0.75, 0.25, [255, 0, 255]);
  });

  test('mirrored selfie: mask and frames follow the picture', async ({ page }) => {
    await fakeCamera(page);
    await preset(page, { effect: 'invert', scope: 'people', detect: true });
    await fakeWorker(page);
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    await startCamera(page);
    // Left half of the camera = right half of the mirrored screen
    await expectColor(page, 0.75, 0.25, [0, 255, 255]);
    await expectColor(page, 0.25, 0.25, [0, 255, 0]);
    // Person 1 (camera x 0.1–0.4) appears at 0.6–0.9 on screen
    await expect.poll(async () => (await pixel(page, 0.9, 0.5, 'boxes')).join(',')).toBe('255,43,214');
  });

  test('declined download: nothing is loaded, the choice goes back', async ({ page }) => {
    await fakeCamera(page);
    await fakeWorker(page);
    await page.goto(URL_);
    await startCamera(page);
    page.once('dialog', d => d.dismiss());
    await page.click('[data-scope="background"]');
    await expect(page.locator('[data-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
    page.once('dialog', d => d.dismiss());
    await page.click('#btnDetect');
    await expect(page.locator('#btnDetect')).toHaveAttribute('aria-pressed', 'false');
    // No detection worker was started (the service worker only caches the file)
    expect(page.workers().filter(x => x.url().endsWith('vision-worker.mjs'))).toEqual([]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('camera-effects.settings.v1')))).toMatchObject({ scope: 'all', detect: false });
  });

  test('failed download: message, the choice goes back', async ({ page }) => {
    await fakeCamera(page);
    await fakeWorker(page, 'fail');
    page.on('dialog', d => d.accept());
    await page.goto(URL_);
    await startCamera(page);
    await page.click('#btnDetect');
    await expect(page.locator('#toast')).toContainText('Download fehlgeschlagen');
    await expect(page.locator('#btnDetect')).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => Tools.diag.text())).toContain('model error {"task":"detect","code":"download"');
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('labels and count in English', async ({ page }) => {
      await fakeCamera(page);
      await fakeWorker(page);
      let msg = '';
      page.on('dialog', d => { msg = d.message(); d.accept(); });
      await page.goto(URL_);
      await expect(page.locator('#btnStart')).toHaveText('Start camera');
      await expect(page.locator('#fx button[data-fx="thermal"] .l')).toHaveText('Thermal');
      await startCamera(page);
      await page.click('#btnDetect');
      await expect(page.locator('#badge')).toHaveText('👤 2 people');
      expect(msg).toContain('about 19.1 MB');
      await switchLang(page, 'de');
      await expect(page.locator('#badge')).toHaveText('👤 2 Personen');
      await expect(page.locator('#fx button[data-fx="thermal"] .l')).toHaveText('Wärmebild');
    });
  });
});

test.describe('real detection engine (MediaPipe, small segmenter model)', () => {
  const MODEL = readFileSync(fileURLToPath(new URL('fixtures/selfie_segmenter.tflite', import.meta.url)));
  test.use({ allowedProblems: /storage\.googleapis\.com\/mediapipe-models\/(image_segmenter|object_detector)|ERR_INTERNET_DISCONNECTED|Failed to fetch|StartGraph failed: INVALID_ARGUMENT: Expected a model with 2 or 4 output tensors/ });

  test('mask from the real engine, usage statistics blocked, works offline, can be deleted', async ({ page, context }) => {
    test.setTimeout(90000);
    const external = [];
    await context.route(/^https:\/\//, r => {
      const u = r.request().url();
      external.push(u);
      // The segmenter model also stands in for the people detector (see below)
      if (u.endsWith('/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite') || u.endsWith('/efficientdet_lite0/int8/1/efficientdet_lite0.tflite'))
        return r.fulfill({ body: MODEL, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' } });
      return r.abort();
    });
    await fakeCamera(page);
    await preset(page, { mirror: false, effect: 'invert' });
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.goto(URL_);
    await startCamera(page);
    await page.click('[data-scope="people"]');
    await expect.poll(() => page.evaluate(() => Tools.diag.text()), { timeout: 30000 }).toMatch(/mask: true/);
    // Engine (14.5 MB) + segmenter model (0.25 MB)
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toContain('ca. 14,8 MB');
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('worker: model ready {"task":"segment"');
    expect(diag).toMatch(/models: segment/);
    // No person in the fake picture: the mask is (nearly) empty, so the picture stays as it is
    await expectColor(page, 0.25, 0.25, [255, 0, 0], 40);

    // The worker may only fetch its own files and the model files – MediaPipe's statistics endpoint is blocked
    const worker = page.workers().find(w => w.url().endsWith('/camera-effects/vision-worker.mjs'));
    expect(worker).toBeTruthy();
    const tries = await worker.evaluate(async () => {
      const out = {};
      out.fetch = await fetch('https://odml.pa.googleapis.com/v1/log', { method: 'POST', body: 'x' }).then(() => 'sent', e => e.message);
      try { const x = new XMLHttpRequest(); x.open('POST', 'https://example.org/'); out.xhr = 'opened'; } catch (e) { out.xhr = e.message; }
      out.own = (await fetch('vision-worker.mjs')).ok;
      return out;
    });
    expect(tries.fetch).toMatch(/blocked/);
    expect(tries.xhr).toMatch(/blocked/);
    expect(tries.own).toBe(true);
    expect(external.filter(u => !/selfie_segmenter\.tflite|efficientdet_lite0\.tflite/.test(u))).toEqual([]);
    expect(await page.evaluate(() => Tools.diag.text())).toContain('worker: blocked request {"host":"odml.pa.googleapis.com"}');

    // A second part started later gets the engine again (MediaPipe clears it after each part – once it said
    // "ModuleFactory not set"). With the stand-in model the detector then fails on the model itself.
    await page.click('#btnDetect');
    await expect.poll(() => page.evaluate(() => Tools.diag.text()), { timeout: 30000 }).toContain('model error {"task":"detect"');
    const err = (await page.evaluate(() => Tools.diag.text())).split('\n').find(l => l.includes('model error'));
    expect(err).not.toMatch(/ModuleFactory/);
    await expect(page.locator('#btnDetect')).toHaveAttribute('aria-pressed', 'false');
    expect(dialogs).toHaveLength(2);
    // Offline: engine (service worker cache) and model (own cache) come from the device, no new prompt
    await context.setOffline(true);
    await page.reload();
    await startCamera(page);
    await expect(page.locator('[data-scope="people"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => Tools.diag.text()), { timeout: 30000 }).toMatch(/mask: true/);
    expect(dialogs).toHaveLength(2);
    await context.setOffline(false);

    // Menu: shows what was downloaded and deletes it
    await openMenu(page);
    await expect(page.locator('#modelsInfo')).toHaveText(/Person und Hintergrund trennen, Rechenprogramm/);
    await page.click('#btnDelModels');
    expect(dialogs[2]).toContain('löschen');
    await expect(page.locator('#modelsInfo')).toHaveText('Noch nichts heruntergeladen.');
    expect(await page.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('vendor:mediapipe') || k === 'camera-effects-models'))).toEqual([]);
    await closeMenu(page);
    await expect(page.locator('[data-scope="all"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('face accessories and distortions (fake worker)', () => {
  // Overlay colour (with alpha) at camera pixel x, y of the 320×240 picture
  const overlay = (page, x, y) => page.evaluate(([x, y]) => [...document.getElementById('boxes').getContext('2d').getImageData(x, y, 1, 1).data], [x, y]);
  const near = (a, b, tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  async function open(page, settings, mode) {
    await fakeCamera(page);
    await preset(page, { mirror: false, ...settings });
    await fakeWorker(page, mode);
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.goto(URL_);
    await startCamera(page);
    return dialogs;
  }

  test('asks once, accessories follow the face, also in the photo', async ({ page }) => {
    const dialogs = await open(page, {});
    await page.click('#tabs [data-tab="face"]');
    await expect(page.locator('#paneFace')).toBeVisible();
    await expect(page.locator('#paneFx')).toBeHidden();
    await expect(page.locator('#acc button')).toHaveCount(12);
    await expect(page.locator('#warp button')).toHaveCount(9);
    await page.click('#acc [data-id="clown"]');
    await expect(page.locator('#acc [data-id="clown"]')).toHaveAttribute('aria-pressed', 'true');
    // Engine 14.5 MB + face model 3.8 MB, asked once
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toContain('Gesichtserkennung');
    expect(dialogs[0]).toContain('ca. 18,3 MB');
    // Red nose on the nose tip (80, 100), radius 0.22 × eye distance 80 = 17.6 px; nothing far from the face
    await expect.poll(async () => near(await overlay(page, 80, 104), [225, 29, 42, 255])).toBe(true);
    expect((await overlay(page, 300, 230))[3]).toBe(0);
    // Sunglasses: dark lens on each eye (40, 80) and (120, 80), the nose stays free
    await page.click('#acc [data-id="glasses"]');
    await expect.poll(async () => { const p = await overlay(page, 40, 85); return p[0] < 40 && p[3] > 200; }).toBe(true);
    const right = await overlay(page, 120, 85);
    expect(right[0] < 40 && right[3] > 200).toBe(true);
    expect((await overlay(page, 80, 104))[3]).toBe(0);
    // Photo = picture + accessory
    await page.click('#btnPhoto');
    await expect(page.locator('#photo')).toBeVisible();
    const px = await page.locator('#photoImg').evaluate(async img => {
      await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const x = cv.getContext('2d'); x.drawImage(img, 0, 0);
      return [...x.getImageData(40, 85, 1, 1).data.slice(0, 3)];
    });
    expect(Math.max(...px)).toBeLessThan(50);
    await page.click('#btnClose');
    // Kept after a reload: tab and accessory
    await page.reload();
    await expect(page.locator('#paneFace')).toBeVisible();
    await expect(page.locator('#acc [data-id="glasses"]')).toHaveAttribute('aria-pressed', 'true');
    // "None" removes it
    await startCamera(page);
    await page.click('#acc [data-id="none"]');
    await expect.poll(async () => (await overlay(page, 40, 85))[3]).toBe(0);
  });

  test('mirrored selfie: the accessory sits on the mirrored face', async ({ page }) => {
    await open(page, { mirror: true, tab: 'face', accessory: 'clown' });
    await expect.poll(async () => near(await overlay(page, 320 - 80, 104), [225, 29, 42, 255])).toBe(true);
    expect((await overlay(page, 80, 104))[3]).toBe(0);
  });

  test('dog sticks out its tongue only with the mouth open', async ({ page }) => {
    await open(page, { tab: 'face', accessory: 'dog' }, 'open');
    // Tongue below the lower lip (80, 140): pink at (85, 160)
    await expect.poll(async () => near(await overlay(page, 85, 160), [251, 113, 133, 255])).toBe(true);
    // Black dog nose on the nose tip
    expect(near(await overlay(page, 85, 104), [17, 17, 17, 255])).toBe(true);
  });

  test('dog: no tongue with the mouth closed', async ({ page }) => {
    await open(page, { tab: 'face', accessory: 'dog' });
    await expect.poll(async () => near(await overlay(page, 85, 104), [17, 17, 17, 255])).toBe(true);
    expect((await overlay(page, 85, 160))[3]).toBe(0);
  });

  test('fisheye magnifies the face, "Normal" restores it', async ({ page }) => {
    await open(page, { tab: 'face' });
    // Below the red/blue border (y = 120): blue without distortion
    await expectColor(page, 80 / 320, 124 / 240, [0, 0, 255]);
    await page.click('#warp [data-id="bulge"]');
    // Face centre (80, 100), radius 0.62 × 180 = 111.6 px; at 24 px below the centre the picture is taken from
    // 24 × (1 − 0.55 × (1 − 24/111.6)²) = 15.9 px below it, i.e. above the border: red
    await expectColor(page, 80 / 320, 124 / 240, [255, 0, 0]);
    // Far away from the face nothing changes
    await expectColor(page, 300 / 320, 230 / 240, [255, 255, 255]);
    await page.click('#warp [data-id="none"]');
    await expectColor(page, 80 / 320, 124 / 240, [0, 0, 255]);
  });

  test('fisheye on the mirrored selfie', async ({ page }) => {
    await open(page, { mirror: true, tab: 'face', warp: 'bulge' });
    await expectColor(page, (320 - 80) / 320, 124 / 240, [255, 0, 0]);
  });

  test('declined download: nothing chosen', async ({ page }) => {
    await fakeCamera(page);
    await fakeWorker(page);
    await page.goto(URL_);
    await startCamera(page);
    await page.click('#tabs [data-tab="face"]');
    page.once('dialog', d => d.dismiss());
    await page.click('#warp [data-id="swirl"]');
    await expect(page.locator('#warp [data-id="none"]')).toHaveAttribute('aria-pressed', 'true');
    expect(page.workers().filter(x => x.url().endsWith('vision-worker.mjs'))).toEqual([]);
  });

  test('face tab with accessory and distortion is accessible, light and dark', async ({ page }) => {
    await open(page, { tab: 'face', accessory: 'crown', warp: 'swirl' });
    for (const scheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: scheme });
      const { violations } = await axe(page).analyze();
      expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('face tab in English', async ({ page }) => {
      await page.goto(URL_);
      await page.click('#tabs [data-tab="face"]');
      await expect(page.locator('#acc [data-id="crown"] .l')).toHaveText('Crown');
      await expect(page.locator('#warp [data-id="bulge"] .l')).toHaveText('Fisheye');
    });
  });
});
