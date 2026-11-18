// Gesichter-Zeitraffer: test photos with red dots as eyes and a fake detection worker that finds them
// (face-timelapse-fakes.mjs). Checked against independently computed positions: eyes level, centred and as far
// apart as the face size says (preview, editor, GIF frames decoded with ImageDecoder, video read back), photos
// without a face left out, eyes set by hand (drag and keys), other face, order (arrows, position, EXIF date,
// reverse, undo), kept after a reload, download declined/failed, English – and the real MediaPipe worker with a
// stand-in model (network guard, offline, delete).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, openMenu, closeMenu, switchLang, onDialog, axe } from './helpers.mjs';
import { URL_, LS, fakeWorker, photo, withExifDate, pixel, near } from './face-timelapse-fakes.mjs';

const RED = [255, 0, 0];
// Expected eye positions as fractions of the result: centred at 40 % height, eye distance = face width / 2.5
const eyeX = face => [0.5 - face / 100 / 5, 0.5 + face / 100 / 5];
const EYE_Y = 0.4;

async function add(page, files) {
  const before = await page.locator('#photos li').count();
  await page.setInputFiles('#inPick', files);
  await expect(page.locator('#photos li')).toHaveCount(before + files.length);
  await expect(page.locator('#addInfo')).toContainText('hinzugefügt');
}
const png = (name, buffer) => ({ name, mimeType: 'image/png', buffer });
// Three photos of one "person": straight, smaller and further left, tilted – and one without a face
async function photos(page) {
  return [
    png('a.png', await photo(page, { bg: '#3050a0', eyes: [[160, 120], [240, 120]] })),
    png('b.png', await photo(page, { w: 600, h: 400, bg: '#30a050', eyes: [[100, 250], [140, 250]] })),
    png('c.png', await photo(page, { bg: '#a05030', eyes: [[150, 170], [230, 110]] })),
    png('d.png', await photo(page, { bg: '#a0a030' })),
  ];
}
async function expectEyes(page, id, face, tol = 30) {
  const [l, r] = eyeX(face);
  await expect.poll(async () => {
    const px = [await pixel(page, id, l, EYE_Y), await pixel(page, id, r, EYE_Y)];
    return px.every(p => near(p, RED, tol)) ? 'ok' : JSON.stringify(px);
  }, { message: `eyes in #${id}` }).toBe('ok');
  // Between the eyes there is no eye
  expect(near(await pixel(page, id, 0.5, EYE_Y), RED, 60)).toBe(false);
}

test.use({ reducedMotion: 'reduce' });

test.describe('with the fake worker', () => {
  test.beforeEach(async ({ page }) => {
    await fakeWorker(page);
    await page.goto(URL_);
  });

  test('asks once before the download, finds the faces and aligns them; a photo without face is left out', async ({ page }) => {
    const asked = [];
    await onDialog(page, d => { asked.push(d.message()); d.accept(); });
    await add(page, await photos(page));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatch(/^Für die Gesichtserkennung lädt die App einmalig ca\. 18,3 MB herunter/);
    await expect(page.locator('#photoCount')).toHaveText('4');
    await expect(page.locator('#photos li .flag:visible')).toHaveCount(1);
    await expect(page.locator('#photos li').nth(3).locator('.thumb')).toHaveAccessibleName('Foto 4 korrigieren – kein Gesicht gefunden');
    await expect(page.locator('#noFaceText')).toHaveText('1 Foto(s) ohne erkanntes Gesicht – antippen und die Augen setzen, sonst kommen sie nicht in den Zeitraffer.');
    await expect(page.locator('#exportHintText')).toHaveText('3 Fotos · 2 s · 720 × 720 px');
    await expect(page.locator('#frameInfo')).toHaveText('Foto 1 von 3');
    // Preview (first photo) and every thumbnail: eyes level, centred, as far apart as the face size says
    await expectEyes(page, 'preview', 55);
    for (let i = 0; i < 3; i++) {
      await page.locator('#photos li canvas').nth(i).evaluate((c, i) => { c.id = 'thumb' + i; }, i);
      await expectEyes(page, 'thumb' + i, 55, 60);
    }
    // More photos later: no new question
    await add(page, [png('e.png', await photo(page, { eyes: [[100, 100], [200, 100]] }))]);
    expect(asked).toHaveLength(1);
    expect(await page.evaluate(() => Tools.diag.text())).toContain('faces {"n":1');
  });

  test('face size and format change the result as computed', async ({ page }) => {
    await onDialog(page, d => d.accept());
    await add(page, (await photos(page)).slice(0, 2));
    await page.locator('#optFace').fill('80');
    await expect(page.locator('#faceOut')).toHaveText('80 %');
    await expectEyes(page, 'preview', 80);
    await page.locator('input[name="format"][value="story"]').check({ force: true });
    expect(await page.evaluate(() => [document.getElementById('preview').width, document.getElementById('preview').height])).toEqual([360, 640]);
    await expectEyes(page, 'preview', 80);
    await expect(page.locator('#exportHintText')).toHaveText('2 Fotos · 1,5 s · 720 × 1280 px');
    await page.reload();
    await expect(page.locator('input[name="format"][value="story"]')).toBeChecked();
    expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS)).toMatchObject({ format: 'story', face: 80 });
  });

  test('eyes set by hand: drag and arrow keys; the photo then joins the timelapse', async ({ page }) => {
    await onDialog(page, d => d.accept());
    const all = await photos(page);
    await add(page, [all[0], all[3]]);
    await expect(page.locator('#exportHintText')).toHaveText('Erst oben mindestens zwei Fotos mit Gesicht wählen.');
    await expect(page.locator('#btnSave')).toBeDisabled();
    await page.locator('#photos li').nth(1).locator('.thumb').click();
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#edTitle')).toHaveText('Foto 2 von 2');
    await expect(page.locator('#edInfo')).toHaveText('Kein Gesicht gefunden – Augen von Hand setzen.');
    // Drag the circles onto (100, 150) and (300, 140) of the 400×300 photo
    const box = await page.locator('#stage').boundingBox();
    const drag = async (eye, fx, fy) => {
      const h = await page.locator(`.handle[data-eye="${eye}"]`).boundingBox();
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + fx * box.width, box.y + fy * box.height, { steps: 5 });
      await expect(page.locator('#loupe')).toBeVisible();
      await page.mouse.up();
    };
    await drag('l', 100 / 400, 150 / 300);
    await drag('r', 300 / 400, 140 / 300);
    // Ten steps of 0.3 % down with the keyboard: (300, 140) → (300, 149)
    await page.locator('.handle[data-eye="r"]').focus();
    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowDown');
    await expect(page.locator('#edInfo')).toHaveText('Augen von Hand gesetzt.');
    await page.click('#edDone');
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('#photos li .flag:visible')).toHaveCount(0);
    await expect(page.locator('#exportHintText')).toHaveText('2 Fotos · 1,5 s · 720 × 720 px');
    await expect.poll(() => page.evaluate(async () => (await Tools.keep.json('state', { photos: [] })).photos[1]?.manual)).toBe(true);
    const eyes = await page.evaluate(async () => (await Tools.keep.json('state')).photos[1]);
    expect(eyes.eyes.l[0] * 400).toBeCloseTo(100, -0.5);
    expect(eyes.eyes.l[1] * 300).toBeCloseTo(150, -0.5);
    expect(eyes.eyes.r[0] * 400).toBeCloseTo(300, -0.5);
    expect(eyes.eyes.r[1] * 300).toBeCloseTo(149, -0.5);
  });

  test('small face: found in the quarters of the photo, editor opens zoomed in; zoom, move and drag while zoomed', async ({ page }) => {
    await onDialog(page, d => d.accept());
    // 3000 × 2000, eyes 60 px apart (2 % of the width – too small for the detector on the whole photo)
    await add(page, [png('far.png', await photo(page, { w: 3000, h: 2000, r: 12, eyes: [[2100, 1400], [2160, 1400]] }))]);
    expect(await page.evaluate(() => Tools.diag.text())).toContain('faces {"n":1,"tiles":9');
    await expect(page.locator('#photos li .flag:visible')).toHaveCount(0);
    await page.locator('#photos .thumb').click();
    // Zoom so the eyes are 30 % of the view apart: 0.3 / 0.02 = 15×, centred between the eyes (found eyes ± 1 px)
    const zoom = async () => Number((await page.locator('#edZoom').textContent()).replace(/\D/g, ''));
    await expect.poll(zoom).toBeGreaterThan(1480);
    expect(await zoom()).toBeLessThan(1520);
    const handles = () => page.evaluate(() => [...document.querySelectorAll('.handle')].map(h => [parseFloat(h.style.left), parseFloat(h.style.top)].map(v => Math.round(v))));
    expect(await handles()).toEqual([[35, 50], [65, 50]]);
    await page.click('#edZoomOut');
    expect(Math.abs(await zoom() - 750)).toBeLessThan(10);
    expect(await handles()).toEqual([[43, 50], [58, 50]]);
    // Move the photo with one finger: 10 % of the stage to the left → photo centre 0.1 / 7.5 further right
    const box = await page.locator('#stage').boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.8, { steps: 4 });
    await page.mouse.up();
    expect(await handles()).toEqual([[33, 50], [48, 50]]);
    // Drag the right circle 10 % of the stage to the right: 0.1 / 7.5 × 3000 = 40 px in the photo
    const h = await page.locator('.handle[data-eye="r"]').boundingBox();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + box.width * 0.1, h.y + h.height / 2, { steps: 4 });
    await page.mouse.up();
    // Mouse wheel zooms out around the pointer; "Onto the eyes" zooms in again
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => Math.abs(await zoom() - 600)).toBeLessThan(10);
    await page.click('#edFocus');
    await expect.poll(zoom).toBeGreaterThan(900);
    await page.click('#edDone');
    await expect.poll(() => page.evaluate(async () => (await Tools.keep.json('state', { photos: [] })).photos[0]?.manual)).toBe(true);
    const e = (await page.evaluate(async () => (await Tools.keep.json('state')).photos[0])).eyes;
    expect(e.l[0] * 3000).toBeCloseTo(2100, -0.5);
    expect(e.r[0] * 3000).toBeCloseTo(2200, -0.5);
    expect(e.r[1] * 2000).toBeCloseTo(1400, -0.5);
  });

  test('several faces: the biggest is taken, "other face" picks the next', async ({ page }) => {
    await onDialog(page, d => d.accept());
    // Small face on the left (eyes 40 px apart), big face on the right (100 px apart, eyes 2 px wide red marks differ)
    await add(page, [png('group.png', await photo(page, { w: 600, h: 300, eyes: [[60, 100], [100, 100], [350, 150], [450, 150]] }))]);
    await page.locator('#photos .thumb').click();
    await expect(page.locator('#edInfo')).toHaveText('2 Gesicht(er) gefunden.');
    await expect(page.locator('#edNext')).toHaveText('Anderes Gesicht (2/2)');
    const handleAt = () => page.evaluate(() => [...document.querySelectorAll('.handle')].map(h => [parseFloat(h.style.left), parseFloat(h.style.top)].map(v => Math.round(v))));
    expect(await handleAt()).toEqual([[Math.round(350 / 6), 50], [75, 50]]);
    await expect(page.locator('#edZoom')).toHaveText('100 %');
    await page.click('#edNext');
    await expect(page.locator('#edNext')).toHaveText('Anderes Gesicht (1/2)');
    // The small face (eyes 40 px = 6,7 % of the width apart) is shown zoomed in: 0.3 / (40 / 600) = 4.5×, centred
    await expect(page.locator('#edZoom')).toHaveText('450 %');
    expect(await handleAt()).toEqual([[35, 50], [65, 50]]);
    await page.click('#edAuto');
    await expect(page.locator('#edNext')).toHaveText('Anderes Gesicht (2/2)');
    await page.click('#edNext');
    await page.click('#edDone');
    await expect.poll(() => page.evaluate(async () => (await Tools.keep.json('state', { photos: [] })).photos[0]?.face)).toBe(0);
  });

  test('order: arrows, position, date taken, reverse, remove with undo – all kept after a reload', async ({ page }) => {
    await onDialog(page, d => d.accept());
    const jpg = async (bg, when) => withExifDate(await photo(page, { bg, eyes: [[160, 120], [240, 120]], type: 'image/jpeg' }), when);
    await add(page, [
      { name: '2019.jpg', mimeType: 'image/jpeg', buffer: await jpg('#3050a0', '2019:05:04 10:20:30') },
      { name: '2015.jpg', mimeType: 'image/jpeg', buffer: await jpg('#30a050', '2015:01:02 08:00:00') },
      png('now.png', await photo(page, { bg: '#a05030', eyes: [[160, 120], [240, 120]] })),
      { name: '2017.jpg', mimeType: 'image/jpeg', buffer: await jpg('#a0a030', '2017:12:24 18:00:00') },
    ]);
    const order = () => page.evaluate(() => [...document.querySelectorAll('#photos li')].map(li => li.dataset.id).join(','));
    await expect.poll(order).toBe('1,2,3,4');
    await page.locator('#photos li').nth(0).locator('[data-act="down"]').click();
    await expect.poll(order).toBe('2,1,3,4');
    await expect(page.locator('#photos li').nth(1).locator('[data-act="down"]')).toBeFocused();
    await page.click('#btnSortDate');
    // 2015, 2017, 2019, then the PNG without EXIF (file date = now)
    await expect.poll(order).toBe('2,4,1,3');
    await page.click('#btnReverse');
    await expect.poll(order).toBe('3,1,4,2');
    // Position in the editor
    await page.locator('#photos li').nth(0).locator('.thumb').click();
    await page.selectOption('#edPos', { value: '2' });
    await page.click('#edDone');
    await expect.poll(order).toBe('1,4,3,2');
    // Date label: first photo (2019-05-04) in the preview
    await page.check('#optDate');
    await expect(page.locator('#optDate')).toBeChecked();
    // Remove one, undo, remove again
    await page.locator('#photos li').nth(1).locator('[data-act="del"]').click();
    await expect.poll(order).toBe('1,3,2');
    await page.locator('.toast button').click();
    await expect.poll(order).toBe('1,4,3,2');
    await page.locator('#photos li').nth(3).locator('[data-act="del"]').click();
    await expect.poll(order).toBe('1,4,3');
    // Kept on the device: same order, eyes and dates after a reload, without asking or detecting again
    await expect.poll(() => page.evaluate(async () => (await Tools.keep.json('state', { photos: [] })).photos.map(p => p.id).join(','))).toBe('1,4,3');
    await page.reload();
    await expect(page.locator('#addInfo')).toHaveText('3 Foto(s) vom letzten Mal wieder da.');
    await expect.poll(order).toBe('1,4,3');
    await expect(page.locator('#optDate')).toBeChecked();
    await expectEyes(page, 'preview', 55);
    expect(await page.evaluate(() => Tools.diag.text())).not.toContain('loading model');
    expect(await page.evaluate(async () => (await Tools.keep.names()).sort())).toEqual(['photo-1', 'photo-3', 'photo-4', 'state']);
    // Remove all (menu) asks first
    await openMenu(page);
    await page.click('#btnClear');
    await expect(page.locator('#photos li')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Tools.keep.names())).toEqual([]);
  });

  test('GIF: frames, durations, eyes and crossfade checked by decoding the file', async ({ page }) => {
    await onDialog(page, d => d.accept());
    const all = await photos(page);
    await add(page, all.slice(0, 2));
    await page.locator('input[name="out"][value="gif"]').check({ force: true });
    await page.selectOption('#optSize', '480');
    await page.locator('#optSecs').fill('1');
    await expect(page.locator('#saveLabel')).toHaveText('GIF speichern');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    expect(dl.suggestedFilename()).toMatch(/^Zeitraffer \d{4}-\d\d-\d\d\.gif$/);
    const buf = readFileSync(await dl.path());
    expect(buf.subarray(0, 6).toString('latin1')).toBe('GIF89a');
    await expect(page.locator('#status')).toContainText('Gespeichert: Zeitraffer');
    // Independent schedule at 15 fps: 1 s per photo = 15 frames, half of them (7.5 → 8) fade (t = 1/9 … 8/9),
    // 7 frames held; last photo 1 s. GIF delays are whole hundredths: 7/15 s → 47, then the rest of the time
    const info = await page.evaluate(async b64 => {
      const data = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const dec = new ImageDecoder({ data, type: 'image/gif' });
      await dec.tracks.ready;
      const n = dec.tracks.selectedTrack.frameCount, out = [];
      for (let i = 0; i < n; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        const c = new OffscreenCanvas(image.displayWidth, image.displayHeight), g = c.getContext('2d');
        g.drawImage(image, 0, 0);
        const at = (fx, fy) => [...g.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data.slice(0, 3)];
        out.push({ w: c.width, h: c.height, ms: image.duration / 1000, l: at(0.39, 0.4), r: at(0.61, 0.4), bg: at(0.5, 0.15) });
        image.close();
      }
      return out;
    }, buf.toString('base64'));
    expect(info).toHaveLength(10);
    expect(info.every(f => f.w === 480 && f.h === 480)).toBe(true);
    const total = info.reduce((a, f) => a + f.ms, 0);
    expect(total).toBe(2000);
    expect(info[0].ms).toBe(470);
    expect(info.slice(1, 9).map(f => f.ms).reduce((a, b) => a + b)).toBe(530);
    expect(info[9].ms).toBe(1000);
    for (const f of [info[0], info[9]]) { expect(near(f.l, RED, 12)).toBe(true); expect(near(f.r, RED, 12)).toBe(true); }
    expect(near(info[0].bg, [0x30, 0x50, 0xa0], 4)).toBe(true);
    expect(near(info[9].bg, [0x30, 0xa0, 0x50], 4)).toBe(true);
    // Halfway through the fade (frame 4 of 8: t = 4/9) a mix of both backgrounds
    const mix = [0x30, 0x50 + (0xa0 - 0x50) * 4 / 9, 0xa0 + (0x50 - 0xa0) * 4 / 9];
    expect(near(info[4].bg, mix, 20)).toBe(true);
  });

  test('video: a playable file of the expected length and size', async ({ page }) => {
    await onDialog(page, d => d.accept());
    await add(page, (await photos(page)).slice(0, 3));
    await page.selectOption('#optSize', '480');
    await page.locator('input[name="format"][value="portrait"]').check({ force: true });
    await page.uncheck('#optFade');
    await expect(page.locator('#saveLabel')).toHaveText('Video speichern');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    expect(dl.suggestedFilename()).toMatch(/^Zeitraffer \d{4}-\d\d-\d\d\.(mp4|webm)$/);
    const buf = readFileSync(await dl.path());
    const mime = dl.suggestedFilename().endsWith('.mp4') ? 'video/mp4' : 'video/webm';
    // Read back with Mediabunny: container, size, length and the decoded pictures at 0.2 s and 1.5 s
    const v = await page.evaluate(async ({ b64, mime }) => {
      const MB = await import('/assets/vendor/mediabunny/mediabunny.min.mjs');
      const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mime });
      const input = new MB.Input({ source: new MB.BlobSource(blob), formats: MB.ALL_FORMATS });
      const track = await input.getPrimaryVideoTrack();
      const sink = new MB.CanvasSink(track);
      const shot = async ts => {
        const { canvas: c } = await sink.getCanvas(ts);
        const g = c.getContext('2d');
        const at = (fx, fy) => [...g.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data.slice(0, 3)];
        return { l: at(0.39, 0.4), r: at(0.61, 0.4), bg: at(0.5, 0.15) };
      };
      return { w: track.displayWidth, h: track.displayHeight, d: await input.computeDuration(), first: await shot(0.2), last: await shot(1.5) };
    }, { b64: buf.toString('base64'), mime });
    expect([v.w, v.h]).toEqual([480, 600]);
    // 0.5 s + 0.5 s + last photo 1 s
    expect(v.d).toBeCloseTo(2, 1);
    for (const f of [v.first, v.last]) { expect(near(f.l, RED, 70)).toBe(true); expect(near(f.r, RED, 70)).toBe(true); }
    expect(near(v.first.bg, [0x30, 0x50, 0xa0], 30)).toBe(true);
    expect(near(v.last.bg, [0xa0, 0x50, 0x30], 30)).toBe(true);
    expect(await page.evaluate(() => Tools.diag.text())).toMatch(/file built \{"kind":"video","photos":3,"frames":3,"w":480,"h":600/);
  });

  test('big photos are decoded only as big as needed; an unreadable photo is named', async ({ page }) => {
    await onDialog(page, d => d.accept());
    // 2400 × 1800 with eyes 400 px apart: in a 480 px result they are 0.55 × 480 / 2.5 = 105.6 px apart,
    // so the photo is decoded at 105.6 / 400 × 1.25 = 33 % → 792 × 594
    await add(page, [
      png('big.png', await photo(page, { w: 2400, h: 1800, bg: '#3050a0', eyes: [[1000, 800], [1400, 800]] })),
      png('b.png', await photo(page, { bg: '#30a050', eyes: [[160, 120], [240, 120]] })),
    ]);
    await page.locator('input[name="out"][value="gif"]').check({ force: true });
    await page.selectOption('#optSize', '480');
    await page.evaluate(() => {
      const orig = window.createImageBitmap;
      window.__sizes = [];
      window.createImageBitmap = async (src, o) => { const b = await orig(src, o); if (src instanceof Blob) window.__sizes.push([b.width, b.height]); return b; };
    });
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    expect(await page.evaluate(() => window.__sizes)).toEqual([[792, 594], [400, 300]]);
    const first = await page.evaluate(async b64 => {
      const dec = new ImageDecoder({ data: Uint8Array.from(atob(b64), c => c.charCodeAt(0)), type: 'image/gif' });
      const { image } = await dec.decode({ frameIndex: 0 });
      const c = new OffscreenCanvas(image.displayWidth, image.displayHeight), g = c.getContext('2d');
      g.drawImage(image, 0, 0);
      return [0.39, 0.61].map(fx => [...g.getImageData(Math.floor(fx * c.width), Math.floor(0.4 * c.height), 1, 1).data.slice(0, 3)]);
    }, readFileSync(await dl.path()).toString('base64'));
    for (const px of first) expect(near(px, RED, 12)).toBe(true);
    // A photo that cannot be decoded any more (neither the chosen file nor the kept copy): message names it
    await page.evaluate(() => {
      window.createImageBitmap = async () => { throw new DOMException('broken', 'InvalidStateError'); };
      Object.defineProperty(HTMLImageElement.prototype, 'src', { set() { setTimeout(() => this.onerror?.(), 0); } });
    });
    await page.locator('#optSecs').fill('1');
    await page.click('#btnSave');
    await expect(page.locator('#status')).toHaveText('Foto 1 ließ sich nicht lesen. Bitte entfernen und neu hinzufügen oder eine kleinere Größe wählen.');
    expect(await page.evaluate(() => Tools.diag.text())).toContain('photo not readable {"n":1,"w":2400,"h":1800');
    await expect(page.locator('#btnSave')).toBeEnabled();
  });

  test('download declined: eyes by hand, later "find faces" looks for them', async ({ page }) => {
    let accept = false;
    await onDialog(page, d => (accept ? d.accept() : d.dismiss()));
    const all = await photos(page);
    await add(page, all.slice(0, 2));
    await expect(page.locator('#addInfo')).toHaveText('2 Foto(s) hinzugefügt. Ohne Gesichtserkennung: Fotos antippen und die Augen von Hand setzen.');
    await expect(page.locator('#noFaceText')).toHaveText('2 Foto(s) noch nicht durchsucht.');
    await expect(page.locator('#btnSave')).toBeDisabled();
    accept = true;
    await page.click('#btnDetect');
    await expect(page.locator('#detectRow')).toBeHidden();
    await expect(page.locator('#noFaceHint')).toBeHidden();
    await expectEyes(page, 'preview', 55);
  });

  test('axe in light and dark, with the editor open', async ({ page }) => {
    await onDialog(page, d => d.accept());
    await add(page, (await photos(page)).slice(0, 2));
    expect((await axe(page).analyze()).violations).toEqual([]);
    await page.locator('#photos .thumb').first().click();
    await expect(page.locator('#editor')).toBeVisible();
    expect((await axe(page).analyze()).violations).toEqual([]);
    await page.emulateMedia({ colorScheme: 'dark' });
    expect((await axe(page).analyze()).violations).toEqual([]);
  });
});

test('download failed: message, photos stay for setting the eyes by hand', async ({ page }) => {
  await fakeWorker(page, 'fail');
  await onDialog(page, d => d.accept());
  await page.goto(URL_);
  await page.setInputFiles('#inPick', [png('a.png', await photo(page, { eyes: [[160, 120], [240, 120]] }))]);
  await expect(page.locator('.toast')).toHaveText('Download fehlgeschlagen – Internetverbindung prüfen.');
  await expect(page.locator('#photos li')).toHaveCount(1);
  await expect(page.locator('#noFaceText')).toHaveText('1 Foto(s) noch nicht durchsucht.');
  expect(await page.evaluate(() => Tools.diag.text())).toContain('model error {"code":"download"');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script follow the language', async ({ page }) => {
    await fakeWorker(page);
    await onDialog(page, d => d.accept());
    await page.goto(URL_);
    await page.setInputFiles('#inPick', [png('a.png', await photo(page, { eyes: [[160, 120], [240, 120]] })), png('b.png', await photo(page))]);
    await expect(page.locator('#addInfo')).toHaveText('2 photo(s) added.');
    await expect(page.locator('#noFaceText')).toHaveText('1 photo(s) without a face found – tap and set the eyes, otherwise they stay out of the timelapse.');
    await expect(page.locator('#saveLabel')).toHaveText('Save video');
    await expect(page.locator('#secsOut')).toHaveText('0.5 s');
    await switchLang(page, 'de');
    await expect(page.locator('#secsOut')).toHaveText('0,5 s');
    await expect(page.locator('#photos li').nth(1).locator('.flag')).toHaveText('Kein Gesicht');
  });
});

/* ---------- Unit checks of the logic (timelapse.js, gif.js) against independent numbers ---------- */
test('transform, schedule and EXIF date', async ({ page }) => {
  await page.goto(URL_);
  const jpeg = withExifDate(await photo(page, { type: 'image/jpeg' }), '2020:02:29 23:59:58');
  const r = await page.evaluate(b64 => {
    const TL = window.Timelapse;
    // Eyes (100, 200) and (200, 300) in a 1000 × 500 picture → result 300 × 400 with face 50 %
    const m = TL.transform({ l: [0.1, 0.4], r: [0.2, 0.6] }, 1000, 500, 300, 400, 0.5);
    const map = ([x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const s = TL.schedule(3, 0.5, true, 30);
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    return { l: map([100, 200]), r: map([200, 300]), dims: [TL.dims('story', 720), TL.dims('portrait', 480), TL.dims('square', 1080)],
      sched: s.map(x => [x.i, x.j, Math.round(x.t * 1000) / 1000, Math.round(x.dur * 30)]),
      date: TL.exifDate(bytes) === new Date(2020, 1, 29, 23, 59, 58).getTime(), none: TL.exifDate(new Uint8Array([0x89, 0x50, 0x4e, 0x47])) };
  }, jpeg.toString('base64'));
  // Eye distance 0.5 × 300 / 2.5 = 60 px, centred at x = 150, y = 0.4 × 400 = 160, level
  expect(r.l[0]).toBeCloseTo(120, 6); expect(r.l[1]).toBeCloseTo(160, 6);
  expect(r.r[0]).toBeCloseTo(180, 6); expect(r.r[1]).toBeCloseTo(160, 6);
  expect(r.dims).toEqual([{ w: 720, h: 1280 }, { w: 480, h: 600 }, { w: 1080, h: 1080 }]);
  // 0.5 s per photo at 30 fps = 15 frames: 7 held + 8 fade frames (t = k/9), last photo 30 frames (1 s)
  const fade = i => Array.from({ length: 8 }, (_, k) => [i, i + 1, Math.round((k + 1) / 9 * 1000) / 1000, 1]);
  expect(r.sched).toEqual([[0, 0, 0, 7], ...fade(0), [1, 1, 0, 7], ...fade(1), [2, 2, 0, 30]]);
  expect(r.date).toBe(true);
  expect(r.none).toBe(null);
});

test('GIF encoder: many colours and a large frame decode to the same picture', async ({ page }) => {
  await page.goto(URL_);
  const r = await page.evaluate(async () => {
    // Gradient with thousands of colours (fills the LZW table several times) and a sharp red square
    const W = 300, H = 200, c = new OffscreenCanvas(W, H), g = c.getContext('2d');
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y += 4) { g.fillStyle = `rgb(${x * 255 / W | 0},${y * 255 / H | 0},${(x + y) % 256})`; g.fillRect(x, y, 1, 4); }
    g.fillStyle = '#f00'; g.fillRect(100, 50, 40, 40);
    const src = g.getImageData(0, 0, W, H).data;
    const enc = GifEncoder(W, H); enc.frame(src, 50); enc.frame(new Uint8ClampedArray(W * H * 4).fill(255), 30);
    const dec = new ImageDecoder({ data: enc.finish(), type: 'image/gif' });
    await dec.tracks.ready;
    const { image } = await dec.decode({ frameIndex: 0 });
    const o = new OffscreenCanvas(W, H), og = o.getContext('2d'); og.drawImage(image, 0, 0);
    const out = og.getImageData(0, 0, W, H).data;
    let worst = 0, sum = 0;
    for (let i = 0; i < out.length; i += 4) for (let k = 0; k < 3; k++) { const d = Math.abs(out[i + k] - src[i + k]); worst = Math.max(worst, d); sum += d; }
    const two = (await dec.decode({ frameIndex: 1 })).image;
    og.drawImage(two, 0, 0);
    return { frames: dec.tracks.selectedTrack.frameCount, worst, mean: sum / (W * H * 3), red: [...og.getImageData(0, 0, 1, 1).data.slice(0, 3)], ms: [image.duration / 1000, two.duration / 1000],
      square: (og.drawImage(image, 0, 0), [...og.getImageData(120, 70, 1, 1).data.slice(0, 3)]) };
  });
  expect(r.frames).toBe(2);
  expect(r.ms).toEqual([500, 300]);
  expect(r.mean).toBeLessThan(6);
  expect(r.worst).toBeLessThan(48);
  expect(r.square).toEqual([255, 0, 0]);
  expect(r.red).toEqual([255, 255, 255]);
});

/* ---------- The real worker (MediaPipe) ---------- */
test.describe('real face worker (MediaPipe)', () => {
  // Stand-in model: the small selfie segmenter (no face model) – the engine loads, then rejects the model.
  const MODEL = readFileSync(fileURLToPath(new URL('fixtures/selfie_segmenter.tflite', import.meta.url)));
  test.use({ allowedProblems: /storage\.googleapis\.com\/mediapipe-models\/face_landmarker|ERR_INTERNET_DISCONNECTED|Failed to fetch|INVALID_ARGUMENT|Unable to open zip archive|Failed to open|graph|Graph/ });

  test('loads the engine from this site, blocks usage statistics, works offline', async ({ page, context }) => {
    test.setTimeout(90000);
    const external = [];
    await context.route(/^https:\/\//, r => {
      const u = r.request().url();
      external.push(u);
      if (u.endsWith('/face_landmarker/face_landmarker/float16/1/face_landmarker.task'))
        return r.fulfill({ body: MODEL, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' } });
      return r.abort();
    });
    await onDialog(page, d => d.accept());
    await page.goto(URL_);
    const file = png('a.png', await photo(page, { eyes: [[160, 120], [240, 120]] }));
    await page.setInputFiles('#inPick', [file]);
    await expect(page.locator('.toast')).toHaveText('Die Gesichtserkennung ließ sich auf diesem Gerät nicht starten.', { timeout: 60000 });
    await expect(page.locator('#photos li')).toHaveCount(1);
    expect(await page.evaluate(() => Tools.diag.text())).toContain('model error {"code":"engine"');

    const worker = page.workers().find(w => w.url().endsWith('/face-timelapse/face-worker.mjs'));
    expect(worker).toBeTruthy();
    const tries = await worker.evaluate(async () => {
      const out = {};
      out.fetch = await fetch('https://odml.pa.googleapis.com/v1/log', { method: 'POST', body: 'x' }).then(() => 'sent', e => e.message);
      try { const x = new XMLHttpRequest(); x.open('POST', 'https://example.org/'); out.xhr = 'opened'; } catch (e) { out.xhr = e.message; }
      out.own = (await fetch('face-worker.mjs')).ok;
      return out;
    });
    expect(tries).toEqual({ fetch: expect.stringMatching(/blocked/), xhr: expect.stringMatching(/blocked/), own: true });
    expect(await page.evaluate(() => Tools.diag.text())).toContain('worker: blocked request {"host":"odml.pa.googleapis.com"}');
    expect(external.filter(u => !u.endsWith('face_landmarker.task'))).toEqual([]);
    await openMenu(page);
    await expect(page.locator('#modelsInfo')).toHaveText(/^Heruntergeladen: Rechenprogramm, Gesichtsmodell \(18,3 MB\)\.$/);
    await closeMenu(page);

    // Offline: engine and model come from the cache – the stand-in model fails the same way, not the download
    await context.setOffline(true);
    await page.reload();
    await page.locator('#photos li .thumb').first().click();
    await page.click('#edAuto');
    await expect(page.locator('.toast')).toHaveText('Die Gesichtserkennung ließ sich auf diesem Gerät nicht starten.', { timeout: 60000 });
    await context.setOffline(false);
    await page.click('#edCancel');

    await openMenu(page);
    await page.click('#btnDelModels');
    await expect(page.locator('#modelsInfo')).toHaveText('Noch nicht heruntergeladen.');
  });
});
