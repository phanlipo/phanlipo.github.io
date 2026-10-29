// Handy-Sensoren: sensor values are simulated with synthetic events (Chromium has no real sensors here).
// Expected values are recomputed independently in the tests.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './helpers.mjs';

const num = s => Number(String(s).replace(/[^\d,.\-−+]/g, '').replace('−', '-').replace(/\./g, '').replace(',', '.'));
const text = (page, id) => page.locator('#' + id).textContent();
const deg = r => r * 180 / Math.PI, rad = d => d * Math.PI / 180;

async function orientation(page, values, type = 'deviceorientation', times = 40) {
  await page.evaluate(({ values, type, times }) => {
    for (let i = 0; i < times; i++) window.dispatchEvent(new DeviceOrientationEvent(type, values));
  }, { values, type, times });
}
// Opens a tool: from the overview tiles, or in the tool view from the tab bar
async function tab(page, name) {
  if (await page.locator('#overview').isVisible()) await page.locator('#overview').getByRole('button', { name, exact: true }).click();
  else await page.getByRole('tab', { name }).click();
}
// Measurements start by themselves (on load and when a tab is chosen)
async function running(page, panel) {
  await expect(page.locator(`[data-start="${panel}"]`)).toHaveText('Stoppen');
}

// Chromium asks for motion-sensor permission like iOS does; grant it up front
test.use({ permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/sensors/');
  // Open the compass independent of the interface language
  if (await page.locator('#overview').isVisible()) await page.locator('#overview [data-open="compass"]').click();
  else await page.locator('#tab-compass').click();
});

test('overview: tiles open a tool, back returns, the last tool reopens', async ({ page }) => {
  // Fresh start shows the overview, nothing running
  await page.evaluate(() => localStorage.clear());
  await page.reload(); // like „Alle Daten löschen“: reload inside the tool's history entry
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#toolbar')).toBeHidden();
  await expect(page.locator('.panel:visible')).toHaveCount(0);
  await expect(page.locator('#overview .tile')).toHaveCount(12);
  await page.locator('#overview').getByRole('button', { name: 'Wasserwaage' }).click();
  await expect(page.locator('#p-level')).toBeVisible();
  await expect(page.locator('#overview')).toBeHidden();
  await running(page, 'level');
  await expect(page.getByRole('tab', { name: 'Wasserwaage' })).toHaveAttribute('aria-selected', 'true');
  // Browser/phone back button → overview, measurement stops
  await page.goBack();
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('[data-start="level"]')).toHaveText('Starten');
  // Forward again and the on-screen back button
  await page.locator('#overview').getByRole('button', { name: 'Tacho' }).click();
  await expect(page.locator('#p-speed')).toBeVisible();
  await page.getByRole('button', { name: 'Übersicht' }).click();
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#toolbar')).toBeHidden();
  // Reload: the overview stays; after opening a tool the app reopens it
  await page.reload();
  await expect(page.locator('#overview')).toBeVisible();
  await page.locator('#overview').getByRole('button', { name: 'Vibrometer' }).click();
  await page.reload();
  await expect(page.locator('#p-vibro')).toBeVisible();
  await running(page, 'vibro');
  await page.goBack();
  await expect(page.locator('#overview')).toBeVisible();
});

test('tab bar: swipeable without making the page scroll sideways; active tab scrolled into view', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await tab(page, 'Tacho');
  const bar = page.locator('#tabs');
  expect(await bar.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw).toBeLessThanOrEqual(iw);
  // The selected tab (last one) is fully visible inside the bar
  const inView = await page.getByRole('tab', { name: 'Tacho' }).evaluate(el => {
    const b = el.parentElement.getBoundingClientRect(), r = el.getBoundingClientRect();
    return r.left >= b.left - 1 && r.right <= b.right + 1;
  });
  expect(inView).toBe(true);
});

test('tabs switch panels, support arrow keys and are remembered', async ({ page }) => {
  await expect(page.locator('#p-compass')).toBeVisible();
  await running(page, 'compass');
  await tab(page, 'Vibrometer');
  await expect(page.locator('#p-vibro')).toBeVisible();
  await expect(page.locator('#p-compass')).toBeHidden();
  await running(page, 'vibro');
  await expect(page.locator('[data-start="compass"]')).toHaveText('Starten');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: 'Beschleunigung' })).toBeFocused();
  await expect(page.locator('#p-accel')).toBeVisible();
  await page.reload();
  await expect(page.locator('#p-accel')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Beschleunigung' })).toHaveAttribute('aria-selected', 'true');
  await running(page, 'accel');
});

for (const scheme of ['light', 'dark']) {
  test(`every tab has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const name of ['Kompass', 'Wasserwaage', 'Beschleunigung', 'Vibrometer', 'Schall', 'Stimmgerät', 'Tacho', 'Schritte', 'Tongenerator', 'Lampe & Morse', 'Puls', 'Klatsch-Stoppuhr']) {
      await tab(page, name);
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(violations.map(v => `${name}: ${v.id} → ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
    }
  });
}

test('compass: Android absolute orientation and iOS compass heading', async ({ page }) => {
  await running(page, 'compass');
  // alpha is counter-clockwise: alpha 90° → device top points west
  await orientation(page, { alpha: 90, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute');
  await expect(page.locator('#cDeg')).toHaveText('270°');
  await expect(page.locator('#cDir')).toHaveText('W');
  await page.reload();
  await running(page, 'compass');
  await page.evaluate(() => {
    for (let i = 0; i < 40; i++) {
      const e = new DeviceOrientationEvent('deviceorientation', { alpha: 10, beta: 0, gamma: 0 });
      Object.defineProperty(e, 'webkitCompassHeading', { value: 45 });
      window.dispatchEvent(e);
    }
  });
  await expect(page.locator('#cDeg')).toHaveText('45°');
  await expect(page.locator('#cDir')).toHaveText('NO');
  // Tilted phone → hint
  await orientation(page, { alpha: 90, beta: 60, gamma: 0, absolute: true }, 'deviceorientationabsolute', 1);
  await expect(page.locator('#st-compass')).toHaveText(/flach halten/);
});

test('stop and start by hand; pauses in the background and continues afterwards', async ({ page }) => {
  await running(page, 'compass');
  const setVisibility = state => page.evaluate(state => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
  await setVisibility('hidden');
  await expect(page.locator('[data-start="compass"]')).toHaveText('Starten');
  await setVisibility('visible');
  await running(page, 'compass');
  // Stopped by hand → stays stopped after returning
  await page.locator('[data-start="compass"]').click();
  await expect(page.locator('[data-start="compass"]')).toHaveText('Starten');
  await setVisibility('hidden');
  await setVisibility('visible');
  await expect(page.locator('[data-start="compass"]')).toHaveText('Starten');
  await page.locator('[data-start="compass"]').click();
  await running(page, 'compass');
  await orientation(page, { alpha: 180, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute');
  await expect(page.locator('#cDeg')).toHaveText('180°');
});

test('no data on automatic start: offers a permission request, then reports a missing sensor', async ({ page }) => {
  await page.reload(); // reopens the compass without a tap
  // Chromium (like iOS) has DeviceOrientationEvent.requestPermission, which needs a tap
  await expect(page.getByRole('button', { name: 'Zugriff erlauben' })).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#st-compass')).toHaveText(/Freigabe/);
  await page.getByRole('button', { name: 'Zugriff erlauben' }).click();
  await running(page, 'compass');
  await expect(page.locator('#st-compass')).toHaveText(/Keine Kompassdaten/, { timeout: 6000 });
  // Data after all → message disappears
  await orientation(page, { alpha: 0, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute', 1);
  await expect(page.locator('#st-compass')).toHaveText('');
});

test.describe('motion permission not granted', () => {
  test.use({ permissions: [] });
  test('tapping a tab asks; a refusal explains where to allow it', async ({ page }) => {
    await tab(page, 'Wasserwaage');
    await expect(page.locator('#st-level')).toHaveText(/abgelehnt.*Website-Einstellungen/);
    await expect(page.locator('[data-start="level"]')).toHaveText('Erneut versuchen');
  });
});

test('level: lying flat, calibration is stored', async ({ page }) => {
  await tab(page, 'Wasserwaage');
  await running(page, 'level');
  await orientation(page, { alpha: 0, beta: 3, gamma: 0 });
  await expect(page.locator('#lvDeg')).toHaveText('3,0°');
  await expect(page.locator('#lvInfo')).toHaveText(/Liegend/);
  await expect(page.locator('#lvBubble')).toBeVisible();
  await expect(page.locator('#lvLine')).toBeHidden();
  // Tube vials: top edge raised by 3° → vertical vial shows 3°, bubble moves up (towards the higher side)
  await expect(page.locator('#lvValV')).toHaveText('3,0°');
  await expect(page.locator('#lvValH')).toHaveText('0,0°');
  expect(Number(await page.locator('#lvVB').getAttribute('cy'))).toBeLessThan(100);
  expect(Number(await page.locator('#lvHB').getAttribute('cx'))).toBeCloseTo(100, 5);
  // Tilt about both axes: independent geometry – "up" vector from rotation matrices Rx(beta)·Ry(gamma)
  const b = 3, g = 4;
  const up = [-Math.sin(rad(g)) * Math.cos(rad(b)), Math.sin(rad(b)), Math.cos(rad(g)) * Math.cos(rad(b))];
  const expected = Math.hypot(deg(Math.atan(up[0] / up[2])), deg(Math.atan(up[1] / up[2])));
  await orientation(page, { alpha: 0, beta: b, gamma: g });
  await expect(page.locator('#lvDeg')).toHaveText(expected.toFixed(1).replace('.', ',') + '°');
  await expect(page.locator('#lvDial')).not.toHaveClass(/level-ok/);
  const side = deg(Math.atan(up[0] / up[2])), front = deg(Math.atan(up[1] / up[2]));
  const de = v => v.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '°';
  await expect(page.locator('#lvValH')).toHaveText(de(side));
  await expect(page.locator('#lvValV')).toHaveText(de(front));
  // Positive gamma lowers the right side → bubble moves left
  expect(Number(await page.locator('#lvHB').getAttribute('cx'))).toBeLessThan(100);
  // Set zero on this "uneven" table → 0°
  await page.click('#lvZero');
  await orientation(page, { alpha: 0, beta: b, gamma: g });
  await expect(page.locator('#lvDeg')).toHaveText('0,0°');
  await expect(page.locator('#lvDial')).toHaveClass(/level-ok/);
  await page.reload();
  await running(page, 'level');
  await orientation(page, { alpha: 0, beta: b, gamma: g });
  await expect(page.locator('#lvDeg')).toHaveText('0,0°');
  await page.click('#lvReset');
  await orientation(page, { alpha: 0, beta: b, gamma: g });
  await expect(page.locator('#lvDeg')).toHaveText(expected.toFixed(1).replace('.', ',') + '°');
});

test('level: standing on an edge', async ({ page }) => {
  await tab(page, 'Wasserwaage');
  await running(page, 'level');
  // Upright (portrait), turned 2° in the screen plane: up = (sin 2°, cos 2°, 0) ⇔ beta 88°, gamma −90°
  await orientation(page, { alpha: 0, beta: 88, gamma: -90 });
  await expect(page.locator('#lvDeg')).toHaveText('2,0°');
  await expect(page.locator('#lvInfo')).toHaveText(/Stehend.*senkrecht/);
  await expect(page.locator('#lvLine')).toBeVisible();
  await expect(page.locator('#lvBubble')).toBeHidden();
  // Landscape on the long edge, 2° off: up = (cos 2°, sin 2°, 0) ⇔ beta 2°, gamma −90°
  await orientation(page, { alpha: 0, beta: 2, gamma: -90 });
  await expect(page.locator('#lvDeg')).toHaveText('2,0°');
  await expect(page.locator('#lvInfo')).toHaveText(/Stehend.*waagerecht/);
});

test('level: standing on an edge, leaning forward/backward in the tube vial', async ({ page }) => {
  await tab(page, 'Wasserwaage');
  await running(page, 'level');
  // Upright, screen tilted 5° towards the sky: up = (0, cos 5°, sin 5°) ⇔ beta 85°, gamma 0°
  await orientation(page, { alpha: 0, beta: 85, gamma: 0 });
  await expect(page.locator('#lvInfo')).toHaveText(/Stehend/);
  await expect(page.locator('#lvDeg')).toHaveText('0,0°');
  await expect(page.locator('#lvLblV')).toHaveText('vorne/hinten');
  await expect(page.locator('#lvValV')).toHaveText('5,0°');
  await expect(page.locator('#lvVialV')).not.toHaveClass(/ok/);
  // Zero point also takes the lean
  await page.click('#lvZero');
  await orientation(page, { alpha: 0, beta: 85, gamma: 0 });
  await expect(page.locator('#lvValV')).toHaveText('0,0°');
  await expect(page.locator('#lvVialV')).toHaveClass(/ok/);
  await orientation(page, { alpha: 0, beta: 90, gamma: 0 });
  await expect(page.locator('#lvValV')).toHaveText('-5,0°');
});

test('acceleration with and without gravity', async ({ page }) => {
  await tab(page, 'Beschleunigung');
  await running(page, 'accel');
  const send = () => page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
      acceleration: { x: 3, y: 4, z: 0 }, accelerationIncludingGravity: { x: 3, y: 4, z: 9.81 }, interval: 16,
    }));
  });
  await send();
  const tot = Math.hypot(3, 4, 9.81);
  await expect(page.locator('#aTot')).toHaveText(tot.toFixed(2).replace('.', ','));
  await expect(page.locator('#aG')).toHaveText((tot / 9.80665).toFixed(2).replace('.', ','));
  await expect(page.locator('#aZ')).toHaveText('9,81');
  await page.getByRole('button', { name: 'ohne Schwerkraft' }).click();
  await send();
  await expect(page.locator('#aTot')).toHaveText('5,00');
  await expect(page.locator('#aMax')).toHaveText('5,00');
  await expect(page.locator('#aZ')).toHaveText('0,00');
  await page.reload();
  await expect(page.getByRole('button', { name: 'ohne Schwerkraft' })).toHaveAttribute('aria-pressed', 'true');
});

test('vibrometer: RMS, peak and frequency of a 5 Hz vibration', async ({ page }) => {
  await tab(page, 'Vibrometer');
  await running(page, 'vibro');
  const A = 2, f = 5, rate = 60, phase = 0.3;
  const xs = Array.from({ length: 3 * rate }, (_, k) => A * Math.sin(2 * Math.PI * f * (k + 1) / rate + phase));
  await page.evaluate(({ xs, rate }) => {
    for (const x of xs) window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
      acceleration: { x, y: 0, z: 0 }, accelerationIncludingGravity: { x, y: 0, z: 9.81 }, interval: 1000 / rate,
    }));
  }, { xs, rate });
  // Last second = last 60 samples
  const last = xs.slice(-rate);
  const rms = Math.sqrt(last.reduce((q, v) => q + v * v, 0) / last.length);
  const peak = Math.max(...xs.map(Math.abs));
  await expect(page.locator('#vRms')).toHaveText(rms.toFixed(2).replace('.', ','));
  await expect(page.locator('#vPeak')).toHaveText(peak.toFixed(2).replace('.', ','));
  expect(num(await text(page, 'vFreq'))).toBeCloseTo(f, 1);
  await expect(page.locator('#vRate')).toHaveText('60');
  await expect(page.locator('#vLevel')).toHaveText('deutlich');
  await page.click('#vReset');
  await expect(page.locator('#vPeak')).toHaveText('0,00');
});

test.describe('sound level', () => {
  test.beforeEach(async ({ page }) => {
    // Fake microphone: 1 kHz sine with amplitude 0.5 → RMS 0.5/√2 → −9.03 dBFS
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
        osc.frequency.value = 1000; gain.gain.value = 0.5;
        osc.connect(gain).connect(dest); osc.start();
        return dest.stream;
      };
    });
    await page.reload();
  });

  test('level = microphone dBFS + calibration', async ({ page }) => {
    const dbfs = 20 * Math.log10(0.5 / Math.SQRT2);
    await tab(page, 'Schall');
    await running(page, 'sound');
    await expect.poll(async () => num(await text(page, 'sNow')), { timeout: 8000 }).toBeGreaterThan(dbfs + 100 - 0.3);
    await page.waitForTimeout(800);
    expect(num(await text(page, 'sNow'))).toBeCloseTo(dbfs + 100, 0);
    expect(num(await text(page, 'sAvg'))).toBeCloseTo(dbfs + 100, 0);
    expect(num(await text(page, 'sDbfs'))).toBeCloseTo(dbfs, 0);
    await page.fill('#sCal', '90,5');
    await expect.poll(async () => num(await text(page, 'sNow'))).toBeCloseTo(dbfs + 90.5, 0);
    await page.reload();
    await expect(page.locator('#sCal')).toHaveValue('90,5');
  });

  test('denied microphone shows a message', async ({ page }) => {
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('denied', 'NotAllowedError'); };
    });
    await tab(page, 'Schall');
    await expect(page.locator('#st-sound')).toHaveText('Zugriff auf das Mikrofon wurde abgelehnt.');
    await expect(page.locator('[data-start="sound"]')).toHaveText('Erneut versuchen');
  });
});

/* ---------- Extensions and further tabs ---------- */

const de = (v, d) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

// Fake microphone: sine with known frequency and amplitude; window.__mic gives access to it
async function fakeMic(page, freq = 1000, amp = 0.5) {
  await page.addInitScript(({ freq, amp }) => {
    navigator.mediaDevices.getUserMedia = async c => {
      if (c && c.video) throw new DOMException('no camera', 'NotFoundError');
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
      osc.frequency.value = freq; gain.gain.value = amp;
      osc.connect(gain).connect(dest); osc.start();
      window.__mic = { ctx, osc, gain };
      return dest.stream;
    };
  }, { freq, amp });
  await page.reload();
}
// Fake camera: a canvas stream (optionally pulsing red) with a switchable torch
async function fakeCamera(page, { pulseHz = 0 } = {}) {
  await page.addInitScript(({ pulseHz }) => {
    window.__torch = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = 32;
      const c = cv.getContext('2d'), t0 = performance.now();
      const paint = () => {
        const r = pulseHz ? Math.round(170 + 40 * Math.sin(2 * Math.PI * pulseHz * (performance.now() - t0) / 1000)) : 90;
        c.fillStyle = `rgb(${r},30,30)`; c.fillRect(0, 0, 32, 32);
      };
      paint(); setInterval(paint, 15);
      const stream = cv.captureStream(30), track = stream.getVideoTracks()[0];
      track.getCapabilities = () => (window.__noTorch ? {} : { torch: true });
      track.applyConstraints = async c => { window.__torch.push(c.advanced[0].torch); };
      return stream;
    };
  }, { pulseHz });
  await page.reload();
}
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const { readFileSync } = await import('node:fs');
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8').replace(/^\ufeff/, '') };
}

test('compass: geographic north and a stored bearing', async ({ page }) => {
  await running(page, 'compass');
  await orientation(page, { alpha: 90, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute');
  await expect(page.locator('#cDeg')).toHaveText('270°');
  await page.getByRole('button', { name: 'Geografisch Nord' }).click();
  // Declination 4° east (default) is added to the magnetic heading
  await expect(page.locator('#cDeg')).toHaveText('274°');
  await expect(page.locator('#cNorthInfo')).toHaveText('geografisch Nord (+4,0°)');
  await page.getByRole('button', { name: 'Peilung merken' }).click();
  await expect(page.locator('#cBearInfo')).toHaveText('Peilung 274° · auf Kurs');
  // Turn 30° to the right (magnetic 300°) → turn back 30° to the left
  await orientation(page, { alpha: 60, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute');
  await expect(page.locator('#cDeg')).toHaveText('304°');
  await expect(page.locator('#cBearInfo')).toHaveText('Peilung 274° · 30° nach links drehen');
  await expect(page.locator('#cMark')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Peilung löschen' })).toBeVisible();
  await page.getByRole('button', { name: 'Peilung löschen' }).click();
  await expect(page.locator('#cMark')).toBeHidden();
});

test('level: angle between two surfaces, hold, beep when level', async ({ page }) => {
  await page.addInitScript(() => {
    window.__osc = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  });
  await page.reload();
  await tab(page, 'Wasserwaage');
  await running(page, 'level');
  await orientation(page, { alpha: 0, beta: 0, gamma: 0 });
  await page.getByRole('button', { name: 'Bezug setzen' }).click();
  // Second surface: tilted 30° about X, then 60° (phone now standing) – angle between the "up" vectors
  for (const b of [30, 60]) {
    await orientation(page, { alpha: 0, beta: b, gamma: 0 });
    const up = [0, Math.sin(rad(b)), Math.cos(rad(b))];
    await expect(page.locator('#lvRef')).toHaveText(de(deg(Math.acos(up[2])), 1) + '°');
  }
  // Hold freezes the display
  await page.getByRole('button', { name: 'Wert halten' }).click();
  const held = await text(page, 'lvDeg');
  await orientation(page, { alpha: 0, beta: 10, gamma: 0 });
  await expect(page.locator('#lvDeg')).toHaveText(held);
  await page.locator('#lvHold').click();
  await orientation(page, { alpha: 0, beta: 10, gamma: 0 });
  await expect(page.locator('#lvDeg')).toHaveText('10,0°');
  // Beep when it becomes level
  await page.check('#lvBeep');
  const before = await page.evaluate(() => window.__osc);
  await orientation(page, { alpha: 0, beta: 0, gamma: 0 });
  await expect(page.locator('#lvDial')).toHaveClass(/level-ok/);
  expect(await page.evaluate(() => window.__osc)).toBeGreaterThan(before);
});

test('acceleration: rotation rate from the gyroscope', async ({ page }) => {
  await tab(page, 'Beschleunigung');
  await running(page, 'accel');
  await page.evaluate(() => window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
    accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 }, rotationRate: { alpha: 10, beta: -5, gamma: 2.5 }, interval: 16,
  })));
  await expect(page.locator('#rA')).toHaveText('10,0');
  await expect(page.locator('#rB')).toHaveText(de(-5, 1));
  await expect(page.locator('#rG')).toHaveText('2,5');
});

test('vibrometer: recording exported as CSV', async ({ page }) => {
  await tab(page, 'Vibrometer');
  await running(page, 'vibro');
  await page.getByRole('button', { name: 'Aufnahme starten' }).click();
  await page.evaluate(() => {
    for (let i = 0; i < 60; i++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
      acceleration: { x: 0.3, y: 0.4, z: 0 }, accelerationIncludingGravity: { x: 0.3, y: 0.4, z: 9.81 }, interval: 1000 / 60,
    }));
  });
  await expect(page.locator('#vRecInfo')).toHaveText(/60 Werte/);
  await page.getByRole('button', { name: 'Aufnahme beenden' }).click();
  const { name, text: csv } = await download(page, () => page.getByRole('button', { name: 'CSV speichern' }).click());
  expect(name).toMatch(/^vibration-\d{4}-\d\d-\d\d-\d{4}\.csv$/);
  const lines = csv.trim().split(/\r\n/);
  expect(lines[0]).toBe('Zeit (s);X (m/s²);Y (m/s²);Z (m/s²);Betrag (m/s²)');
  expect(lines).toHaveLength(61);
  expect(lines[1]).toBe('0,017;0,3000;0,4000;0,0000;0,5000');
  expect(lines[60].split(';')[0]).toBe('1,000');
});

test.describe('sound extensions', () => {
  test('dB(A) of a 100 Hz tone, main frequency and spectrum', async ({ page }) => {
    await fakeMic(page, 100, 0.5);
    await tab(page, 'Schall');
    await running(page, 'sound');
    const z = 20 * Math.log10(0.5 / Math.SQRT2) + 100;
    await expect.poll(async () => num(await text(page, 'sNow')), { timeout: 8000 }).toBeGreaterThan(z - 0.5);
    await expect.poll(async () => Math.abs(num(await text(page, 'sPeak')) - 100)).toBeLessThan(1);
    // A-weighting at 100 Hz (IEC 61672): computed independently
    const f2 = 100 ** 2;
    const ra = 12194 ** 2 * f2 ** 2 / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2));
    const a100 = 20 * Math.log10(ra) + 2;
    expect(a100).toBeCloseTo(-19.1, 1);
    await page.getByRole('button', { name: 'dB(A)' }).click();
    await expect(page.locator('#sUnit')).toHaveText('dB(A)');
    await expect.poll(async () => Math.abs(num(await text(page, 'sNow')) - (z + a100)), { timeout: 8000 }).toBeLessThan(1);
  });

  test('main frequency of 1 kHz; noise log exported as CSV', async ({ page }) => {
    await fakeMic(page, 1000, 0.5);
    await tab(page, 'Schall');
    await running(page, 'sound');
    await expect(page.locator('#sPeak')).toHaveText('1.000 Hz', { timeout: 8000 });
    await page.getByRole('button', { name: 'Protokoll starten' }).click();
    await page.waitForTimeout(2600);
    await page.getByRole('button', { name: 'Protokoll beenden' }).click();
    const info = await text(page, 'sLogInfo');
    expect(info).toMatch(/^Beendet: 0:0[23] · Mittel \(Leq\) \d+,\d dB · lautester Wert \d+,\d dB$/);
    // 90,97 dB lies on a rounding boundary – compare the number, not the rounded text
    expect(Math.abs(num(info.match(/Leq\) ([\d,]+)/)[1]) - (20 * Math.log10(0.5 / Math.SQRT2) + 100))).toBeLessThan(0.3);
    const { name, text: csv } = await download(page, () => page.locator('#sLogCsv').click());
    expect(name).toMatch(/^laermprotokoll-.*\.csv$/);
    const lines = csv.trim().split(/\r\n/);
    expect(lines[0]).toBe('Uhrzeit;Pegel (dB)');
    expect(lines.length).toBeGreaterThanOrEqual(3);
    for (const l of lines.slice(1)) {
      expect(l).toMatch(/^\d\d:\d\d:\d\d;\d+,\d$/);
      expect(num(l.split(';')[1])).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2) + 100, 0);
    }
  });
});

test('tuner: note, cents and guitar strings', async ({ page }) => {
  await fakeMic(page, 440, 0.4);
  await tab(page, 'Stimmgerät');
  await running(page, 'tuner');
  await expect(page.locator('#tNote')).toHaveText('A', { timeout: 8000 });
  await expect(page.locator('#tOct')).toHaveText('4');
  await expect(page.locator('#tCents')).toHaveText('0');
  await expect(page.locator('#tState')).toHaveText('stimmt');
  // 445 Hz: 1200·log2(445/440) ≈ +19,6 cent
  await page.evaluate(() => { window.__mic.osc.frequency.value = 445; });
  await expect(page.locator('#tCents')).toHaveText('+' + Math.round(1200 * Math.log2(445 / 440)));
  await expect(page.locator('#tState')).toHaveText(/zu hoch/);
  // Guitar: 112 Hz is nearest to the A string (110 Hz)
  await page.getByRole('button', { name: 'Gitarre' }).click();
  await page.evaluate(() => { window.__mic.osc.frequency.value = 112; });
  await expect(page.locator('#tTarget')).toHaveText('110,0');
  await expect(page.locator('#tNote')).toHaveText('A');
  await expect(page.locator('#tCents')).toHaveText('+' + Math.round(1200 * Math.log2(112 / 110)));
  // E string: 80 Hz is below E2 (82,41 Hz)
  await page.evaluate(() => { window.__mic.osc.frequency.value = 80; });
  await expect(page.locator('#tNote')).toHaveText('E');
  await expect(page.locator('#tState')).toHaveText(/zu tief/);
});

test('speedometer: speed, distance, average and inaccurate fixes', async ({ page }) => {
  await page.addInitScript(() => {
    const watchers = new Map();
    let id = 0;
    const geo = { watchPosition(ok) { watchers.set(++id, ok); return id; }, clearWatch(i) { watchers.delete(i); }, getCurrentPosition() {} };
    Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
    window.__fix = (lat, lon, t, extra = {}) => watchers.forEach(cb => cb({ timestamp: t, coords: {
      latitude: lat, longitude: lon, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null, ...extra } }));
  });
  await page.reload();
  await tab(page, 'Tacho');
  await running(page, 'speed');
  // Independent great-circle distance for 0,001° north
  const R = 6371008.8, d = 2 * R * Math.asin(Math.sin(rad(0.001) / 2));
  await page.evaluate(() => window.__fix(50, 8, 0, { altitude: 312, altitudeAccuracy: 4 }));
  await expect(page.locator('#gAlt')).toHaveText('312 ± 4');
  await page.evaluate(() => window.__fix(50.001, 8, 10000));
  await expect(page.locator('#gSpeed')).toHaveText(de(d / 10 * 3.6, 1));
  await expect(page.locator('#gDist')).toHaveText(de(d, 0) + ' m');
  await page.evaluate(() => window.__fix(50.002, 8, 20000, { speed: 5, heading: 0 }));
  await expect(page.locator('#gSpeed')).toHaveText('18,0');
  await expect(page.locator('#gDir')).toHaveText('N');
  await expect(page.locator('#gMax')).toHaveText(de(d / 10 * 3.6, 1));
  await expect(page.locator('#gAvg')).toHaveText(de(2 * d / 20 * 3.6, 1));
  await expect(page.locator('#gTime')).toHaveText('0:20');
  // Jitter while standing and inaccurate fixes do not count
  await page.evaluate(() => window.__fix(50.00201, 8, 25000));
  await page.evaluate(() => window.__fix(50.01, 8, 30000, { accuracy: 80 }));
  await expect(page.locator('#st-speed')).toHaveText(/Ungenaues Signal/);
  await expect(page.locator('#gDist')).toHaveText(de(2 * d, 0) + ' m');
  await page.getByRole('button', { name: 'Strecke zurücksetzen' }).click();
  await expect(page.locator('#gDist')).toHaveText('0 m');
});

test('pedometer: counts steps of a walking rhythm and keeps them for the day', async ({ page }) => {
  await tab(page, 'Schritte');
  await running(page, 'steps');
  // 5 s walking at 2 steps/s: vertical acceleration 9,81 ± 3 m/s²
  await page.evaluate(() => {
    for (let k = 1; k <= 300; k++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
      accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 + 3 * Math.sin(2 * Math.PI * 2 * k / 60) }, interval: 1000 / 60,
    }));
  });
  await expect(page.locator('#stCount')).toHaveText('10');
  await expect(page.locator('#stDist')).toHaveText('7 m'); // 10 × 0,7 m
  await expect(page.locator('#stRate')).toHaveText('60');  // 10 steps in the last 10 s
  // Standing still: small shaking does not count
  await page.evaluate(() => {
    for (let k = 1; k <= 120; k++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
      accelerationIncludingGravity: { x: 0, y: 0, z: 9.81 + 0.3 * Math.sin(2 * Math.PI * 3 * k / 60) }, interval: 1000 / 60,
    }));
  });
  await expect(page.locator('#stCount')).toHaveText('10');
  await page.fill('#stLen', '0,8');
  await expect(page.locator('#stDist')).toHaveText('8 m');
  await page.getByRole('tab', { name: 'Kompass' }).click(); // stopping saves
  await page.reload();
  await tab(page, 'Schritte');
  await expect(page.locator('#stCount')).toHaveText('10');
  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(page.locator('#stCount')).toHaveText('0');
});

test('tone generator: waveforms, frequency, noise and sweep', async ({ page }) => {
  await page.addInitScript(() => {
    window.__nodes = [];
    const o = AudioContext.prototype.createOscillator, b = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createOscillator = function () { const n = o.call(this); window.__nodes.push(n); return n; };
    AudioContext.prototype.createBufferSource = function () { const n = b.call(this); window.__nodes.push(n); return n; };
  });
  await page.reload();
  await tab(page, 'Tongenerator');
  // Does not start by itself
  await expect(page.locator('[data-start="tone"]')).toHaveText('Abspielen');
  expect(await page.evaluate(() => window.__nodes.length)).toBe(0);
  await page.locator('[data-start="tone"]').click();
  await expect(page.locator('[data-start="tone"]')).toHaveText('Stopp');
  const last = () => page.evaluate(() => { const n = window.__nodes[window.__nodes.length - 1]; return n.frequency ? { type: n.type, f: n.frequency.value } : { type: 'buffer', loop: n.loop }; });
  expect(await last()).toEqual({ type: 'sine', f: 1000 });
  await page.fill('#toFreq', '440');
  expect(await last()).toEqual({ type: 'sine', f: 440 });
  expect(Number(await page.locator('#toFreqR').inputValue())).toBe(Math.round(Math.log(440 / 20) / Math.log(1000) * 1000));
  await page.selectOption('#toType', 'square');
  await expect.poll(last).toEqual({ type: 'square', f: 440 });
  await page.selectOption('#toType', 'pink');
  await expect.poll(last).toEqual({ type: 'buffer', loop: true });
  await expect(page.locator('#toFreq')).toBeDisabled();
  await page.locator('[data-start="tone"]').click();
  await expect(page.locator('[data-start="tone"]')).toHaveText('Abspielen');
  // Sweep stops by itself after the set time
  await page.selectOption('#toType', 'sine');
  await page.check('#toSweep');
  await page.fill('#toDur', '1');
  await page.locator('[data-start="tone"]').click();
  await expect(page.locator('#st-tone')).toHaveText('Sweep 440 → 10.000 Hz in 1 s');
  await expect(page.locator('[data-start="tone"]')).toHaveText('Abspielen', { timeout: 4000 });
});

test('flashlight and Morse code', async ({ page }) => {
  await fakeCamera(page);
  await tab(page, 'Lampe & Morse');
  await expect(page.locator('[data-start="torch"]')).toHaveText('Lampe an');
  await page.locator('[data-start="torch"]').click();
  await expect(page.locator('[data-start="torch"]')).toHaveText('Lampe aus');
  expect(await page.evaluate(() => window.__torch)).toEqual([true]);
  await page.locator('[data-start="torch"]').click();
  await expect(page.locator('[data-start="torch"]')).toHaveText('Lampe an');
  expect(await page.evaluate(() => window.__torch.at(-1))).toBe(false);
  // Morse code display (ß stays one sign)
  await page.fill('#mText', 'Fuß 7');
  await expect(page.locator('#mCode')).toHaveText('··−· ··− ···−−·· / −−···');
  // SOS at 30 words/min: 9 flashes
  await page.locator('#mWpm').fill('30');
  await page.evaluate(() => { window.__torch = []; });
  await page.getByRole('button', { name: 'SOS' }).click();
  await expect(page.getByRole('button', { name: 'Abbrechen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Morse senden' })).toBeVisible({ timeout: 5000 });
  const seq = await page.evaluate(() => window.__torch);
  expect(seq.filter(Boolean)).toHaveLength(9);
  expect(seq.at(-1)).toBe(false);
  await expect(page.locator('[data-start="torch"]')).toHaveText('Lampe an');
});

test('flashlight without torch: the screen lights up', async ({ page }) => {
  await fakeCamera(page);
  await page.evaluate(() => { window.__noTorch = true; });
  await tab(page, 'Lampe & Morse');
  await page.locator('[data-start="torch"]').click();
  await expect(page.locator('#screenLight')).toBeVisible();
  await expect(page.locator('#st-torch')).toHaveText(/Kein Blitz/);
  await page.locator('#screenLight').click();
  await expect(page.locator('#screenLight')).toBeHidden();
  await expect(page.locator('[data-start="torch"]')).toHaveText('Lampe an');
  await page.getByRole('button', { name: 'Bildschirm als Lampe' }).click();
  await expect(page.locator('#screenLight')).toBeVisible();
  await page.locator('#screenLight').click();
  await expect(page.locator('#screenLight')).toBeHidden();
});

test('pulse: heart rate from a pulsing red camera image', async ({ page }) => {
  test.slow();
  await fakeCamera(page, { pulseHz: 1.2 }); // 72 beats per minute
  await tab(page, 'Puls');
  await expect(page.locator('[data-start="pulse"]')).toHaveText('Messen');
  await page.locator('[data-start="pulse"]').click();
  await expect(page.locator('#pInfo')).toHaveText(/Messung läuft/, { timeout: 5000 });
  await expect.poll(async () => num(await text(page, 'pBpm')), { timeout: 20000 }).toBeGreaterThan(68);
  expect(num(await text(page, 'pBpm'))).toBeLessThan(76);
  expect(await page.evaluate(() => window.__torch)).toContain(true);
});

test('clap stopwatch: a clap starts, the next one stops', async ({ page }) => {
  await fakeMic(page, 1000, 0.001); // quiet background (−60 dBFS)
  await tab(page, 'Klatsch-Stoppuhr');
  await running(page, 'clap');
  await expect(page.locator('#kState')).toHaveText('Klatschen startet die Zeit');
  await page.waitForTimeout(300);
  await page.evaluate(async () => {
    const g = window.__mic.gain.gain, wait = ms => new Promise(r => setTimeout(r, ms));
    g.value = 0.8; await wait(80); g.value = 0.001;
    await wait(1000);
    g.value = 0.8; await wait(80); g.value = 0.001;
  });
  await expect(page.locator('#kState')).toHaveText(/gestoppt/);
  const t = num(await text(page, 'kTime'));
  expect(t).toBeGreaterThan(0.95);
  expect(t).toBeLessThan(1.3);
  await expect(page.locator('#kList li')).toHaveCount(1);
  await page.getByRole('button', { name: 'Zurücksetzen' }).click();
  await expect(page.locator('#kTime')).toHaveText('0,00');
});

test('speedometer: coordinates in both formats, copy and map link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const watchers = new Map();
    let id = 0;
    const geo = { watchPosition(ok) { watchers.set(++id, ok); return id; }, clearWatch(i) { watchers.delete(i); }, getCurrentPosition() {} };
    Object.defineProperty(Navigator.prototype, 'geolocation', { get: () => geo, configurable: true });
    window.__fix = (lat, lon, acc) => watchers.forEach(cb => cb({ timestamp: Date.now(), coords: {
      latitude: lat, longitude: lon, accuracy: acc, altitude: null, altitudeAccuracy: null, heading: null, speed: null } }));
  });
  await page.reload();
  await tab(page, 'Tacho');
  await running(page, 'speed');
  await expect(page.locator('#gCopy')).toBeDisabled();
  await expect(page.locator('#gMap')).toBeHidden();
  await page.evaluate(() => window.__fix(50.11023, 8.68212, 6));
  await expect(page.locator('#gCoord')).toHaveText('50,11023° N, 8,68212° O (± 6 m)');
  // Degrees, minutes, seconds – computed independently
  const toDms = a => { const d = Math.trunc(a), mf = (a - d) * 60, m = Math.trunc(mf); return `${d}° ${m}′ ${de((mf - m) * 60, 1)}″`; };
  await page.getByRole('button', { name: 'Grad, Minuten, Sekunden' }).click();
  await expect(page.locator('#gCoord')).toHaveText(`${toDms(50.11023)} N, ${toDms(8.68212)} O (± 6 m)`);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Grad, Minuten, Sekunden' })).toHaveAttribute('aria-pressed', 'true');
  // Southern/western hemisphere, also shown for an inaccurate fix
  await page.evaluate(() => window.__fix(-33.85678, -70.6505, 80));
  await expect(page.locator('#gCoord')).toHaveText(`${toDms(33.85678)} S, ${toDms(70.6505)} W (± 80 m)`);
  await page.getByRole('button', { name: 'Dezimalgrad' }).click();
  await expect(page.locator('#gCoord')).toHaveText('33,85678° S, 70,65050° W (± 80 m)');
  await expect(page.locator('#gMap')).toHaveAttribute('href', 'geo:-33.856780,-70.650500?q=-33.856780,-70.650500');
  await page.getByRole('button', { name: 'Koordinaten kopieren' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('-33.856780, -70.650500');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('tools, compass directions, number inputs and CSV in English', async ({ page }) => {
    await expect(page.locator('#overview')).toBeHidden();
    await expect(page.getByRole('tab', { name: 'Compass' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('[data-start="compass"]')).toHaveText('Stop');
    // alpha 270° → the top of the device points east (German: O)
    await orientation(page, { alpha: 270, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute');
    await expect(page.locator('#cDeg')).toHaveText('90°');
    await expect(page.locator('#cDir')).toHaveText('E');
    await expect(page.locator('#cNorthInfo')).toHaveText('magnetic north');
    // Number fields use the decimal point
    await page.getByRole('tab', { name: 'Tuner' }).click();
    await expect(page.locator('#tRef')).toHaveValue('440.0');

    await page.getByRole('tab', { name: 'Vibrometer' }).click();
    await expect(page.locator('[data-start="vibro"]')).toHaveText('Stop');
    await page.getByRole('button', { name: 'Start recording' }).click();
    await page.evaluate(() => {
      for (let i = 0; i < 60; i++) window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
        acceleration: { x: 0.3, y: 0.4, z: 0 }, accelerationIncludingGravity: { x: 0.3, y: 0.4, z: 9.81 }, interval: 1000 / 60,
      }));
    });
    await expect(page.locator('#vRecInfo')).toHaveText(/60 values/);
    await page.getByRole('button', { name: 'Stop recording' }).click();
    const { text: csv } = await download(page, () => page.getByRole('button', { name: 'Save CSV' }).click());
    const lines = csv.trim().split(/\r\n/);
    expect(lines[0]).toBe('Time (s),X (m/s²),Y (m/s²),Z (m/s²),Magnitude (m/s²)');
    expect(lines[1]).toBe('0.017,0.3000,0.4000,0.0000,0.5000');
    // Switching back to German changes the texts at once
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(page.locator('#vRec')).toHaveText('Aufnahme starten');
  });
});
