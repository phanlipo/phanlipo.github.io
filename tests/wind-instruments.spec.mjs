// Wind instruments: fingerings of every instrument (checked against the real fingering tables),
// breath from a fake microphone, blow pad, overblowing, trumpet natural tones, fingering chart, settings, English.
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

// Fake microphone: low hum (100 Hz, where the app listens for breath); window.__mic.gain switches it on/off
async function fakeMic(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async constraints => {
      window.__constraints = constraints;
      if (window.__deny) throw new DOMException('denied', 'NotAllowedError');
      const ctx = new AudioContext();
      const osc = ctx.createOscillator(), gain = ctx.createGain(), dest = ctx.createMediaStreamDestination();
      osc.frequency.value = 100; gain.gain.value = 0;
      osc.connect(gain).connect(dest); osc.start();
      window.__mic = { ctx, gain };
      return dest.stream;
    };
  });
}
const play = page => page.locator('#play');
const midiOf = name => {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  return (Number(m[3]) + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
};
const expectNote = (page, name) => expect(play(page)).toHaveAttribute('data-note', String(midiOf(name)));
const KEY = i => `Digit${(i + 1) % 10}`;

async function touchMode(page, inst) {
  await page.goto('/wind-instruments/');
  await page.click('#btnTouch');
  await expect(play(page)).toHaveAttribute('data-mode', 'touch');
  if (inst) await page.click(`[data-inst="${inst}"]`);
}
/** Hold a fingering: string of 1 (closed) and 0 (open), counted from the mouthpiece */
async function finger(page, pattern) {
  for (let i = 0; i < 10; i++) await page.keyboard.up(KEY(i));
  for (let i = 0; i < pattern.length; i++) if (pattern[i] === '1') await page.keyboard.down(KEY(i));
}

test('flute (tin whistle in D): scale from the bottom up, cross-fingered C, overblowing', async ({ page }) => {
  await touchMode(page, 'whistle');
  await expect(page.locator('#inst .hole')).toHaveCount(6);
  // Standard tin whistle fingerings
  for (const [f, n] of [['111111', 'D5'], ['111110', 'E5'], ['111100', 'F#5'], ['111000', 'G5'], ['110000', 'A5'],
    ['100000', 'B5'], ['011000', 'C6'], ['000000', 'C#6']]) {
    await finger(page, f);
    await expectNote(page, n);
    await expect(page.locator('#inst .hole.on')).toHaveCount([...f].filter(x => x === '1').length);
  }
  // Not blowing: silent, the note of the fingering is still shown
  await finger(page, '111000');
  await expect(play(page)).toHaveAttribute('data-blowing', '0');
  await page.keyboard.down('Space');
  await expect(play(page)).toHaveAttribute('data-blowing', '1');
  await expectNote(page, 'G5');
  await page.keyboard.up('Space');
  // Blowing hard jumps an octave
  await page.keyboard.down('Shift');
  await page.keyboard.down('Space');
  await expectNote(page, 'G6');
  await page.keyboard.up('Space');
  await page.keyboard.up('Shift');
  await expectNote(page, 'G5');
  // … unless switched off
  await openMenu(page);
  await page.uncheck('#optOverblow');
  await closeMenu(page);
  await finger(page, '111000');
  await page.keyboard.down('Shift');
  await page.keyboard.down('Space');
  await expect(play(page)).toHaveAttribute('data-blowing', '1');
  await expectNote(page, 'G5');
  await page.keyboard.up('Space');
  await page.keyboard.up('Shift');
});

test('recorder: baroque fingerings, thumb hole, upper octave with the thumb open', async ({ page }) => {
  await touchMode(page, 'recorder');
  await expect(page.locator('#inst .hole')).toHaveCount(8);
  await expect(page.locator('#inst .hole.thumb')).toHaveCount(1);
  // thumb, holes 1–7 (soprano recorder, baroque fingering)
  for (const [f, n] of [['11111111', 'C5'], ['11111110', 'D5'], ['11111100', 'E5'], ['11111011', 'F5'], ['11111000', 'F5'],
    ['11110110', 'F#5'], ['11110000', 'G5'], ['11100000', 'A5'], ['11011000', 'Bb5'], ['11000000', 'B5'],
    ['10100000', 'C6'], ['00100000', 'D6'], ['00000000', 'C#6'],
    // Pinched thumb: E6 = Ø12345, G6 = Ø123
    ['01111100', 'E6'], ['01110000', 'G6']]) {
    await finger(page, f);
    await expectNote(page, n);
  }
});

test('ocarina: only the open area counts (Helmholtz resonator)', async ({ page }) => {
  await touchMode(page, 'ocarina');
  await expect(page.locator('#inst .hole')).toHaveCount(4);
  // Hole order: top left, top right, bottom left, bottom right. Areas 1.25, 0.5625, 1.75, 0.27;
  // f = f(C5) · sqrt(1 + open area), rounded to the nearest semitone
  const area = [1.25, 0.5625, 1.75, 0.27];
  for (let v = 0; v < 16; v++) {
    const f = [8, 4, 2, 1].map(b => (v & b ? '1' : '0')).join('');
    const open = [...f].reduce((a, x, i) => a + (x === '0' ? area[i] : 0), 0);
    const midi = 72 + Math.round(12 * Math.log2(Math.sqrt(1 + open)));
    await finger(page, f);
    await expect(play(page)).toHaveAttribute('data-note', String(midi));
  }
  // The landmarks: all closed C5, all open D6, a scale in between
  await finger(page, '1111'); await expectNote(page, 'C5');
  await finger(page, '0000'); await expectNote(page, 'D6');
  await finger(page, '0111'); await expectNote(page, 'G5');
});

test('pan flute: tap or slide across the pipes, nothing without a pipe', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await touchMode(page, 'panflute');
  const pipes = page.locator('#inst .pipe');
  await expect(pipes).toHaveCount(8);  // 375 px wide
  await expect(pipes.first()).toHaveText('C5');
  await expect(pipes.last()).toHaveText('C6');
  await page.keyboard.down('Space');
  await expect(play(page)).toHaveAttribute('data-note', '');
  await expect(play(page)).toHaveAttribute('data-blowing', '0');
  await expect(page.locator('#status')).toHaveText('Pfeife antippen und pusten');
  // Mouse down on E5, slide to A5
  const box = i => pipes.nth(i).boundingBox();
  const e = await box(2), a = await box(5);
  await page.mouse.move(e.x + e.width / 2, e.y + e.height - 20);
  await page.mouse.down();
  await expectNote(page, 'E5');
  await expect(play(page)).toHaveAttribute('data-blowing', '1');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height - 20, { steps: 5 });
  await expectNote(page, 'A5');
  await expect(pipes.nth(5)).toHaveClass(/on/);
  await page.mouse.up();
  await expect(play(page)).toHaveAttribute('data-note', '');
  await page.keyboard.up('Space');
});

test('pan flute: more pipes in landscape', async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 375 });
  await touchMode(page, 'panflute');
  const n = await page.locator('#inst .pipe').count();
  expect(n).toBeGreaterThan(8);
  expect(n).toBeLessThanOrEqual(15);
  // C major upwards: pipe 9 = D6
  await expect(page.locator('#inst .pipe').nth(8)).toHaveText('D6');
});

test('trumpet: valves lower the pitch, breath picks the natural tone', async ({ page }) => {
  await touchMode(page, 'trumpet');
  await expect(page.locator('#inst .hole')).toHaveCount(3);
  await expect(page.locator('#ladder')).toBeVisible();
  // Blow pad: pressing higher up = harder. Strength = 0.25 + 0.75 · height from the bottom
  const pad = await page.locator('#blowpad').boundingBox();
  const blowAt = async strength => {
    await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height * (1 - (strength - 0.25) / 0.75));
    await page.mouse.down();
  };
  // Natural tones of C3: 2nd C4, 3rd G4, 4th C5, 5th E5, 6th G5
  for (const [strength, n] of [[0.27, 'C4'], [0.4, 'G4'], [0.6, 'C5'], [0.76, 'E5'], [0.97, 'G5']]) {
    await blowAt(strength);
    await expectNote(page, n);
    await expect(page.locator('#ladder b.on')).toHaveCount(['C4', 'G4', 'C5', 'E5', 'G5'].indexOf(n) + 1);
    await page.mouse.up();
  }
  // Valves on G4 (3rd natural tone): 1 = −2, 2 = −1, 3 = −3, 1+2+3 = −6 semitones
  await blowAt(0.4);
  for (const [f, n] of [['100', 'F4'], ['010', 'F#4'], ['001', 'E4'], ['110', 'E4'], ['011', 'D#4'], ['101', 'D4'], ['111', 'C#4']]) {
    await finger(page, f);
    await expectNote(page, n);
  }
  await page.mouse.up();
});

test('microphone: breath from the low hum switches the sound on and off', async ({ page }) => {
  await fakeMic(page);
  await page.goto('/wind-instruments/');
  await expect(page.locator('#intro')).toBeVisible();
  await page.click('#btnStart');
  await expect(play(page)).toHaveAttribute('data-mode', 'mic');
  await expect(page.locator('#intro')).toBeHidden();
  await expect(page.locator('#btnMic')).toHaveAttribute('aria-pressed', 'true');
  // Raw microphone signal: no noise suppression (it would remove the breath), no automatic gain
  const c = await page.evaluate(() => window.__constraints);
  expect(c.audio).toMatchObject({ noiseSuppression: false, autoGainControl: false, echoCancellation: true });
  await expect(page.locator('#status')).toHaveText('Puste ins Mikrofon');
  await expect(play(page)).toHaveAttribute('data-blowing', '0');
  // Blow (overblowing off: the fake breath is as strong as it gets)
  await openMenu(page);
  await page.uncheck('#optOverblow');
  await closeMenu(page);
  await page.evaluate(() => { window.__mic.gain.gain.value = 0.3; });
  await expect(play(page)).toHaveAttribute('data-blowing', '1');
  await expectNote(page, 'C#6');  // no fingers: all holes open
  await expect(page.locator('#status')).toHaveText('Pustest du – super!');
  await expect.poll(async () => Number(await page.locator('#meter').getAttribute('aria-valuenow'))).toBeGreaterThan(80);
  await finger(page, '111111');
  await expectNote(page, 'D5');
  // Stop blowing
  await page.evaluate(() => { window.__mic.gain.gain.value = 0; });
  await expect(play(page)).toHaveAttribute('data-blowing', '0');
  // Microphone off in the header: blow pad instead
  await page.click('#btnMic');
  await expect(play(page)).toHaveAttribute('data-mode', 'touch');
  await expect(page.locator('#blowpad')).toBeVisible();
  // Echo cancellation can be switched off (new stream with the new setting)
  await page.click('#btnMic');
  await expect(play(page)).toHaveAttribute('data-mode', 'mic');
  await openMenu(page);
  await page.uncheck('#optEcho');
  await expect.poll(() => page.evaluate(() => window.__constraints.audio.echoCancellation)).toBe(false);
  await closeMenu(page);
  // Diagnostics: states only
  const info = await page.evaluate(() => Tools.diag.text());
  expect(info).toContain('microphone on');
  expect(info).toContain('instrument: whistle');
});

test('microphone denied: message, playing without microphone still works', async ({ page }) => {
  await fakeMic(page);
  await page.addInitScript(() => { window.__deny = true; });
  await page.goto('/wind-instruments/');
  await page.click('#btnStart');
  await expect(page.locator('#introErr')).toContainText('Mikrofon nicht erlaubt');
  await expect(play(page)).toHaveAttribute('data-mode', 'idle');
  await page.click('#btnTouch');
  await expect(page.locator('#blowpad')).toBeVisible();
  await page.keyboard.down('Space');
  await expect(play(page)).toHaveAttribute('data-blowing', '1');
  await page.keyboard.up('Space');
});

test('fingering chart: every note with its fingering, tapping plays it', async ({ page }) => {
  await touchMode(page, 'whistle');
  await openMenu(page);
  const items = page.locator('#chart button');
  // D5 … C#6 plus the overblown octave D6 … B6
  await expect(items).toHaveCount(14);
  await expect(items.first()).toHaveAccessibleName('D5 ●●●●●●');
  await expect(items.nth(8)).toHaveAccessibleName('D6 ●●●●●● kräftig');
  await items.nth(3).click();  // G5
  await expect(play(page)).toHaveAttribute('data-blowing', '1');
  await expectNote(page, 'G5');
  await closeMenu(page);
  await expect(page.locator('#inst .hole.on')).toHaveCount(3);
  await expect(play(page)).toHaveAttribute('data-blowing', '0', { timeout: 3000 });
  // Every instrument has a chart; the recorder starts with the thumb
  await page.click('[data-inst="recorder"]');
  await openMenu(page);
  await expect(page.locator('#chartInfo')).toContainText('Daumen');
  await expect(items.first()).toHaveAccessibleName('C5 ●●●●●●●●');
  await expect(items.last()).toHaveAccessibleName('G6 ○●●●○○○○');
});

test('settings and instrument stay after reload', async ({ page }) => {
  await touchMode(page, 'ocarina');
  await openMenu(page);
  await page.locator('#sens').fill('8');
  await page.locator('#volume').fill('40');
  await page.uncheck('#optOverblow');
  await expect(page.locator('#volumeOut')).toHaveText('40 %');
  await page.reload();
  await expect(page.locator('[data-inst="ocarina"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#inst .hole')).toHaveCount(4);
  await openMenu(page);
  await expect(page.locator('#sens')).toHaveValue('8');
  await expect(page.locator('#volume')).toHaveValue('40');
  await expect(page.locator('#optOverblow')).not.toBeChecked();
});

test('German note names: B is B flat, H is B', async ({ page }) => {
  await touchMode(page, 'recorder');
  await finger(page, '11011000');
  await expect(page.locator('#note')).toHaveText('B5');
  await finger(page, '11000000');
  await expect(page.locator('#note')).toHaveText('H5');
  await finger(page, '11110110');
  await expect(page.locator('#note')).toHaveText('Fis5');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and note names', async ({ page }) => {
    await page.goto('/wind-instruments/');
    await expect(page.locator('h1')).toHaveText('Wind Instruments');
    await expect(page.locator('#btnStart')).toHaveText('Start microphone');
    await page.click('#btnTouch');
    await page.click('[data-inst="recorder"]');
    await finger(page, '11011000');
    await expect(page.locator('#note')).toHaveText('B♭5');
    await finger(page, '11000000');
    await expect(page.locator('#note')).toHaveText('B5');
    await switchLang(page, 'de');
    await expect(page.locator('#note')).toHaveText('H5');
    await expect(page.locator('[data-inst="whistle"]')).toHaveText('Flöte');
  });
});

test('offline after the first visit: plays without network', async ({ page, context }) => {
  await page.goto('/wind-instruments/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await page.click('#btnTouch');
  await finger(page, '111111');
  await page.keyboard.down('Space');
  await expectNote(page, 'D5');
  await expect(play(page)).toHaveAttribute('data-blowing', '1');
  await page.keyboard.up('Space');
  await context.setOffline(false);
});
