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
async function tab(page, name) {
  await page.getByRole('tab', { name }).click();
}
// Measurements start by themselves (on load and when a tab is chosen)
async function running(page, panel) {
  await expect(page.locator(`[data-start="${panel}"]`)).toHaveText('Stoppen');
}

// Chromium asks for motion-sensor permission like iOS does; grant it up front
test.use({ permissions: ['accelerometer', 'gyroscope', 'magnetometer'] });

test.beforeEach(async ({ page }) => {
  await page.goto('/sensors/');
});

test('tabs switch panels, support arrow keys and are remembered', async ({ page }) => {
  await expect(page.locator('#p-compass')).toBeVisible();
  await running(page, 'compass');
  await tab(page, 'Vibrometer');
  await expect(page.locator('#p-vibro')).toBeVisible();
  await expect(page.locator('#p-compass')).toBeHidden();
  await running(page, 'vibro');
  await expect(page.locator('[data-start="compass"]')).toHaveText('Starten');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Metalldetektor' })).toBeFocused();
  await expect(page.locator('#p-mag')).toBeVisible();
  await page.reload();
  await expect(page.locator('#p-mag')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Metalldetektor' })).toHaveAttribute('aria-selected', 'true');
  await running(page, 'mag');
});

for (const scheme of ['light', 'dark']) {
  test(`every tab has no accessibility violations (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    for (const name of ['Kompass', 'Wasserwaage', 'Beschleunigung', 'Vibrometer', 'Metalldetektor', 'Schall']) {
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
  // Tilt about both axes: independent geometry – "up" vector from rotation matrices Rx(beta)·Ry(gamma)
  const b = 3, g = 4;
  const up = [-Math.sin(rad(g)) * Math.cos(rad(b)), Math.sin(rad(b)), Math.cos(rad(g)) * Math.cos(rad(b))];
  const expected = Math.hypot(deg(Math.atan(up[0] / up[2])), deg(Math.atan(up[1] / up[2])));
  await orientation(page, { alpha: 0, beta: b, gamma: g });
  await expect(page.locator('#lvDeg')).toHaveText(expected.toFixed(1).replace('.', ',') + '°');
  await expect(page.locator('#lvDial')).not.toHaveClass(/level-ok/);
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
  // Landscape on the long edge, 2° off: up = (cos 2°, sin 2°, 0) ⇔ beta 2°, gamma −90°
  await orientation(page, { alpha: 0, beta: 2, gamma: -90 });
  await expect(page.locator('#lvDeg')).toHaveText('2,0°');
  await expect(page.locator('#lvInfo')).toHaveText(/Stehend.*waagerecht/);
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

test('magnetometer: field strength and change against the zero point', async ({ page }) => {
  await page.addInitScript(() => {
    window.Magnetometer = class extends EventTarget {
      constructor() { super(); this.x = null; this.y = null; this.z = null; }
      start() { window.__mag = this; }
      stop() { window.__magStopped = true; }
    };
    window.__read = (x, y, z) => { Object.assign(window.__mag, { x, y, z }); window.__mag.dispatchEvent(new Event('reading')); };
  });
  await page.reload();
  await tab(page, 'Metalldetektor');
  await running(page, 'mag');
  await page.evaluate(() => window.__read(30, 0, 40));
  await expect(page.locator('#mVal')).toHaveText('50,0');
  await expect(page.locator('#mDelta')).toHaveText('0,0 µT');
  await page.evaluate(() => window.__read(30, 40, 40));
  const tot = Math.hypot(30, 40, 40);
  await expect(page.locator('#mVal')).toHaveText(tot.toFixed(1).replace('.', ','));
  await expect(page.locator('#mDelta')).toHaveText('+' + (tot - 50).toFixed(1).replace('.', ',') + ' µT');
  await page.click('#mZero');
  await page.evaluate(() => window.__read(30, 40, 40));
  await expect(page.locator('#mDelta')).toHaveText('0,0 µT');
  // Switching the tab stops the sensor
  await tab(page, 'Kompass');
  expect(await page.evaluate(() => window.__magStopped)).toBe(true);
  await expect(page.locator('[data-start="mag"]')).toHaveText('Starten');
});

test('magnetometer: compass fallback without the sensor API', async ({ page }) => {
  await page.addInitScript(() => { delete window.Magnetometer; });
  await page.reload();
  await tab(page, 'Metalldetektor');
  await running(page, 'mag');
  await expect(page.locator('#mMode')).toHaveText(/Kompass ablenk/);
  await orientation(page, { alpha: 0, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute', 1);
  await orientation(page, { alpha: 330, beta: 0, gamma: 0, absolute: true }, 'deviceorientationabsolute', 1);
  await expect(page.locator('#mVal')).toHaveText('30°');
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
