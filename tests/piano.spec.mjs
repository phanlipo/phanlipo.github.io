// Klavier: playing by touch and keyboard, MIDI parsing (tempo map, running status, pedal, drums), playback
// with lit keys over time, muting parts, persistence, examples, share target and English note names.
import { test, expect, openMenu, closeMenu, switchLang, VIEWPORTS } from './helpers.mjs';
import { testSong } from './midi-files.mjs';

const URL_ = '/piano/';
// Phone size: 9 white keys in free play (C4…D5)
test.use({ viewport: VIEWPORTS.mobile });
const lit = page => page.locator('#keys').getAttribute('data-lit');
const key = (page, n) => page.locator(`#keys .key[data-n="${n}"]`);
async function loadTestSong(page) {
  await page.setInputFiles('#file', { name: 'test.mid', mimeType: 'audio/midi', buffer: testSong() });
  await expect(page.locator('#songName')).toHaveText('test');
}

test('touch a key: it sounds and lights up, sliding plays the next key, black keys hit first', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('#rangeLabel')).not.toBeEmpty();
  const c4 = await key(page, 60).boundingBox();
  // Lower half of C4 (below the black keys)
  await page.mouse.move(c4.x + c4.width / 2, c4.y + c4.height * 0.85);
  await page.mouse.down();
  await expect.poll(() => lit(page)).toBe('60');
  await expect(key(page, 60)).toHaveClass(/\bon\b/);
  const d4 = await key(page, 62).boundingBox();
  await page.mouse.move(d4.x + d4.width / 2, d4.y + d4.height * 0.85, { steps: 4 });
  await expect.poll(() => lit(page)).toBe('62');
  await page.mouse.up();
  await expect.poll(() => lit(page)).toBe('');
  // Upper part between C4 and D4 is C#4
  const cs = await key(page, 61).boundingBox();
  await page.mouse.move(cs.x + cs.width / 2, cs.y + cs.height / 3);
  await page.mouse.down();
  await expect.poll(() => lit(page)).toBe('61');
  await page.mouse.up();
  await expect(page.locator('#keys')).toHaveAttribute('data-played', '3');
});

test('computer keyboard plays from the first C; octave buttons shift and are remembered', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('#keys')).toHaveAttribute('data-lo', '60');
  await page.keyboard.down('a');
  await page.keyboard.down('w');
  await expect.poll(() => lit(page)).toBe('60 61');
  await page.keyboard.up('a');
  await page.keyboard.up('w');
  await expect.poll(() => lit(page)).toBe('');
  await page.click('#btnUp');
  await expect(page.locator('#keys')).toHaveAttribute('data-lo', '72');
  await page.keyboard.press('k');   // one octave above the first C
  await expect(page.locator('#keys')).toHaveAttribute('data-last', '84');
  await page.reload();
  await expect(page.locator('#keys')).toHaveAttribute('data-lo', '72');
  await page.click('#btnDown');
  await page.click('#btnDown');
  await expect(page.locator('#keys')).toHaveAttribute('data-lo', '48');
});

test('MIDI file: parts, length and range; playback lights the right keys over time', async ({ page }) => {
  await page.clock.install();
  await page.goto(URL_);
  await loadTestSong(page);
  await expect(page.locator('#empty')).toBeHidden();
  await expect(page.locator('#time')).toHaveText('0:00 / 0:02');
  // Keyboard covers whole octaves around C3…G4
  await expect(page.locator('#keys')).toHaveAttribute('data-lo', '48');
  await expect(page.locator('#keys')).toHaveAttribute('data-hi', '71');
  await openMenu(page);
  await expect(page.locator('#songInfo')).toHaveText('0:02 · 4 Noten · 2 Spuren');
  await expect(page.locator('#parts li')).toHaveText(['Spur 1 · Rechts (3 Noten)', 'Spur 2 · Links (1 Noten)']);
  await closeMenu(page);

  await page.click('#btnPlay');
  await expect(page.locator('#btnPlay')).toHaveAttribute('data-state', 'playing');
  await page.clock.runFor(250);
  await expect.poll(() => lit(page)).toBe('48 60');           // C3 (held by the pedal) + C4
  await page.clock.runFor(500);                               // 0.75 s
  await expect.poll(() => lit(page)).toBe('64');              // pedal released at 0.5 s
  await page.clock.runFor(750);                               // 1.5 s: G4 lasts 1 s after the tempo change
  await expect.poll(() => lit(page)).toBe('67');
  await page.clock.runFor(1000);                              // 2.5 s: finished
  await expect(page.locator('#btnPlay')).toHaveAttribute('data-state', 'paused');
  await expect.poll(() => lit(page)).toBe('');
  await expect(page.locator('#time')).toHaveText('0:02 / 0:02');
  await expect(page.locator('#roll')).toHaveAttribute('data-sounded', '4');
});

test('tempo, seeking and a muted part', async ({ page }) => {
  await page.clock.install();
  await page.goto(URL_);
  await loadTestSong(page);
  await openMenu(page);
  await page.locator('#speed').fill('50');
  await page.locator('#speed').dispatchEvent('change');
  await expect(page.locator('#speedOut')).toHaveText('50 %');
  await page.uncheck('#parts [data-part="0"]');               // mute "Rechts"
  await closeMenu(page);
  await page.click('#btnPlay');
  await page.clock.runFor(1500);                              // half speed: song at 0.75 s
  await expect.poll(() => lit(page)).toBe('64');              // muted parts still light up
  await page.clock.runFor(3000);
  await expect(page.locator('#btnPlay')).toHaveAttribute('data-state', 'paused');
  await expect(page.locator('#roll')).toHaveAttribute('data-sounded', '1');   // only C3 sounded
  // Seek to 1.5 s while paused: G4 shows as the current note once playing
  await page.locator('#seek').fill('750');
  await page.locator('#seek').dispatchEvent('change');
  await expect(page.locator('#time')).toHaveText('0:01 / 0:02');
  await page.click('#btnRestart');
  await expect(page.locator('#time')).toHaveText('0:00 / 0:02');
});

test('the last song stays after a reload; closing it returns to free play', async ({ page }) => {
  await page.goto(URL_);
  await loadTestSong(page);
  await page.reload();
  await expect(page.locator('#songName')).toHaveText('test');
  await expect(page.locator('#keys')).toHaveAttribute('data-lo', '48');
  await page.click('#btnClose');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#barFree')).toBeVisible();
  await page.reload();
  await expect(page.locator('#empty')).toBeVisible();
});

test('broken and non-MIDI files show a message', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#file', { name: 'x.mid', mimeType: 'audio/midi', buffer: Buffer.from('hello, not a midi file') });
  await expect(page.locator('#toast')).toHaveText('Das ist keine MIDI-Datei.');
  const cut = testSong().subarray(0, 40);
  await page.setInputFiles('#file', { name: 'y.mid', mimeType: 'audio/midi', buffer: cut });
  await expect(page.locator('#toast')).toHaveText(/beschädigt|keine Klavier-Noten/);
  await expect(page.locator('#empty')).toBeVisible();
});

test('example song: Ode to Joy starts with E4 over C3', async ({ page }) => {
  await page.clock.install();
  await page.goto(URL_);
  await page.click('#empty [data-demo="ode"]');
  await expect(page.locator('#songName')).toHaveText('Ode an die Freude');
  await openMenu(page);
  // 62 melody notes, 22 bass notes (4+5+8+5 per phrase); 16 bars of 4 beats at 100 bpm = 38.4 s
  await expect(page.locator('#parts li')).toHaveText(['Rechte Hand (62 Noten)', 'Linke Hand (22 Noten)']);
  await expect(page.locator('#songInfo')).toHaveText('0:38 · 84 Noten · 2 Spuren');
  await closeMenu(page);
  await page.click('#btnPlay');
  await page.clock.runFor(300);
  await expect.poll(() => lit(page)).toBe('48 64');
});

test('short landscape phone: the whole keyboard with its note names fits without scrolling', async ({ page }) => {
  // Phone in landscape minus the browser bars – before, main scrolled and cut off the bottom of the keys
  for (const viewport of [{ width: 780, height: 270 }, { width: 800, height: 300 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto(URL_);
    for (const withSong of [false, true]) {
      if (withSong) await page.click('[data-demo="ode"]');
      const box = await page.locator('#keys').boundingBox();
      expect(box.y + box.height, `keys inside ${viewport.height}px`).toBeLessThanOrEqual(viewport.height + 0.5);
      expect(await page.locator('main').evaluate(m => m.scrollHeight - m.clientHeight)).toBeLessThanOrEqual(1);
      const label = page.locator('#keys .key.c .lbl').first();
      await expect(label).toBeVisible();
      const lb = await label.boundingBox();
      expect(lb.y + lb.height).toBeLessThanOrEqual(viewport.height);
      expect(box.height).toBeGreaterThanOrEqual(80);
    }
    await page.click('#btnClose');   // the song would otherwise come back after the next reload
  }
});

test('share target: a MIDI file shared to the installed app is opened', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target.params.files[0].accept).toContain('audio/midi');
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const ok = await page.evaluate(async b64 => {
    const fd = new FormData();
    fd.append('file', new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'shared.mid', { type: 'audio/midi' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, testSong().toString('base64'));
  expect(ok).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(page.locator('#songName')).toHaveText('shared');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('note names: B instead of H, part names in English', async ({ page }) => {
    await page.goto(URL_);
    await expect(key(page, 71).locator('.lbl')).toHaveText('B');
    await expect(key(page, 60).locator('.lbl')).toHaveText('C4');
    await page.click('#empty [data-demo="entchen"]');
    await expect(page.locator('#songName')).toHaveText('All My Little Ducklings');
    await openMenu(page);
    await expect(page.locator('#parts li').first()).toHaveText('Melody (27 notes)');
    await switchLang(page, 'de');
    await expect(page.locator('#parts li').first()).toHaveText('Melodie (27 Noten)');
    await closeMenu(page);
    await expect(key(page, 59).locator('.lbl')).toHaveText('H');
  });
});
