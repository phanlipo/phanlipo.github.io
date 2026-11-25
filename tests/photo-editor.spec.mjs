// Foto-Editor: test photos are drawn in the browser – a red disc on green of almost the same brightness
// (only a colour-aware edge finder sees the outline), centre (300, 200), radius 100. Checked against these
// known shapes: colouring page = only grey values, a closed black ring on the disc's edge, white inside and
// outside; comic = red stays red, green stays green, black line on the edge only with lines > 0; the saved
// PNG (decoded separately): size, capped at 2400 px, pure grey; printing, reload (Tools.keep), discard and
// undo, a broken kept photo, transparency, English.
import { test, expect, switchLang } from './helpers.mjs';

const URL_ = '/photo-editor/';
const LS = 'photo-editor.settings.v1';
// Slider defaults of all filters (as in the help: middle values, palette 1)
const DEFAULTS = { detail: 40, thickness: 2, levels: 5, lines: 50, shading: 40, softness: 50, brush: 4, palette: 1, dotSize: 10, pixelSize: 10, contrast: 30, tone: 70 };

/** Draws the test photo in the page and returns it as a PNG file for setInputFiles */
async function photo(page, { w = 600, h = 400, transparent = false, name = 'foto.png' } = {}) {
  const b64 = await page.evaluate(({ w, h, transparent }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    if (transparent) { g.fillStyle = '#000'; g.fillRect(w / 2 - 20, h / 2 - 20, 40, 40); }
    else {
      g.fillStyle = '#3a9a3a'; g.fillRect(0, 0, w, h);                       // brightness ≈ 114
      g.fillStyle = '#e03a3a'; g.beginPath(); g.arc(w / 2, h / 2, h / 4, 0, 2 * Math.PI); g.fill();   // ≈ 108
    }
    return c.toDataURL('image/png').split(',')[1];
  }, { w, h, transparent });
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

/** Waits until the preview shows this filter (and these slider values) */
async function shows(page, filter, opts = {}) {
  await page.waitForFunction(({ filter, opts }) => {
    const v = document.getElementById('view').dataset.shows;
    if (!v || !document.getElementById('busy').hidden) return false;
    const [f, o] = JSON.parse(v);
    return f === filter && Object.entries(opts).every(([k, x]) => o[k] === x);
  }, { filter, opts });
}
async function open(page, file) {
  await page.setInputFiles('#inPick', file || await photo(page));
  await expect(page.locator('#resultCard')).toBeVisible();
}
const setSlider = (page, id, value) => page.locator('#' + id).evaluate((el, v) => {
  el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

/** Pixels of the preview: [r, g, b] at (x, y) */
const px = (page, x, y) => page.evaluate(([x, y]) =>
  [...document.getElementById('view').getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3), [x, y]);
/** Statistics of the preview: size, all grey, number of dark pixels, darkest brightness in a box */
const stats = (page, box) => page.evaluate(box => {
  const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let grey = true, dark = 0, boxMin = 255;
  for (let p = 0, i = 0; p < d.length; p += 4, i++) {
    if (d[p] !== d[p + 1] || d[p] !== d[p + 2]) grey = false;
    const l = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
    if (l < 80) dark++;
    if (box) { const x = i % c.width, y = (i - x) / c.width; if (x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]) boxMin = Math.min(boxMin, l); }
  }
  return { w: c.width, h: c.height, grey, dark, boxMin };
}, box);

async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), buf: Buffer.concat(chunks) };
}
/** Decodes a PNG in the page: size and whether every pixel is grey */
const decodePng = (page, buf) => page.evaluate(async b64 => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
  let grey = true, dark = 0;
  for (let p = 0; p < d.length; p += 4) { if (d[p] !== d[p + 1] || d[p] !== d[p + 2]) grey = false; if (d[p] < 80) dark++; }
  return { w: bmp.width, h: bmp.height, grey, dark };
}, buf.toString('base64'));

test.beforeEach(async ({ page }) => { await page.goto(URL_); });

test('first start shows only the photo picker', async ({ page }) => {
  await expect(page.locator('#btnPick')).toBeVisible();
  await expect(page.locator('#filterCard')).toBeHidden();
  await expect(page.locator('#resultCard')).toBeHidden();
});

test('colouring page: closed black outline on white, also between colours of the same brightness', async ({ page }) => {
  await open(page);
  await expect(page.locator('#photoInfo')).toHaveText('600 × 400 Pixel');
  // Colouring page is the default filter
  await expect(page.locator('#filters [data-filter="coloring"]')).toHaveAttribute('aria-pressed', 'true');
  await shows(page, 'coloring');
  const s = await stats(page);
  expect(s).toMatchObject({ w: 600, h: 400, grey: true });
  expect(await px(page, 300, 200)).toEqual([255, 255, 255]);   // inside the disc
  expect(await px(page, 40, 40)).toEqual([255, 255, 255]);     // background
  // A line crosses every ray from the centre near radius 100 – the outline is closed
  for (let a = 0; a < 360; a += 15) {
    const r = a * Math.PI / 180, x = Math.round(300 + 100 * Math.cos(r)), y = Math.round(200 + 100 * Math.sin(r));
    expect((await stats(page, [x - 4, y - 4, x + 4, y + 4])).boxMin, `angle ${a}`).toBeLessThan(60);
  }
  // Only the circle: about its circumference (2π·100 ≈ 628) in dark pixels, not the whole picture
  expect(s.dark).toBeGreaterThan(400);
  expect(s.dark).toBeLessThan(3000);
  // Thicker lines
  await setSlider(page, 'thickness', 5);
  await expect(page.locator('#thicknessOut')).toHaveText('5');
  await shows(page, 'coloring', { thickness: 5 });
  expect((await stats(page)).dark).toBeGreaterThan(s.dark * 2.5);
});

test('comic: colours kept, lines only when wanted', async ({ page }) => {
  await open(page);
  await page.click('#filters [data-filter="comic"]');
  await expect(page.locator('#levels')).toBeVisible();
  await expect(page.locator('#lines')).toBeVisible();
  await expect(page.locator('#detail')).toBeHidden();
  await shows(page, 'comic', { levels: 5, lines: 50 });
  const [r1, g1] = await px(page, 300, 200), [r2, g2] = await px(page, 40, 40);
  expect(r1 - g1).toBeGreaterThan(80);    // red
  expect(g2 - r2).toBeGreaterThan(60);    // green
  expect((await stats(page, [394, 196, 406, 204])).boxMin).toBeLessThan(60);
  await setSlider(page, 'lines', 0);
  await expect(page.locator('#linesOut')).toHaveText('0 %');
  await shows(page, 'comic', { lines: 0 });
  expect((await stats(page, [394, 196, 406, 204])).boxMin).toBeGreaterThan(80);
  expect((await stats(page)).dark).toBe(0);
  // Reset brings the default values back
  await page.click('#btnDefaults');
  await expect(page.locator('#lines')).toHaveValue('50');
  await shows(page, 'comic', { lines: 50 });
});

test('original: the photo itself; press and hold compares with the original', async ({ page }) => {
  await open(page);
  await shows(page, 'coloring');
  await page.locator('#view').hover();
  await page.mouse.down();
  const [r, g] = await px(page, 300, 200);
  expect(r - g).toBeGreaterThan(100);
  await page.mouse.up();
  expect(await px(page, 300, 200)).toEqual([255, 255, 255]);
  await page.click('#filters [data-filter="original"]');
  await shows(page, 'original');
  expect(await px(page, 300, 200)).toEqual([224, 58, 58]);
  await expect(page.locator('#resetRow')).toBeHidden();
  await expect(page.locator('#compareHint')).toBeHidden();
});

test('transparent parts become white paper', async ({ page }) => {
  await open(page, await photo(page, { transparent: true }));
  await page.click('#filters [data-filter="original"]');
  await shows(page, 'original');
  expect(await px(page, 10, 10)).toEqual([255, 255, 255]);
  expect(await px(page, 300, 200)).toEqual([0, 0, 0]);
});

test('save: PNG at full size, capped at 2400 px; preview smaller', async ({ page }) => {
  await open(page);
  let f = await download(page, () => page.click('#btnSave'));
  expect(f.name).toBe('ausmalbild.png');
  let d = await decodePng(page, f.buf);
  expect(d).toMatchObject({ w: 600, h: 400, grey: true });
  expect(d.dark).toBeGreaterThan(400);
  await expect(page.locator('#status')).toContainText('Bild gespeichert');
  // A large photo: kept at 2400 px, preview at 1000 px
  await open(page, await photo(page, { w: 3000, h: 1500 }));
  await expect(page.locator('#photoInfo')).toHaveText('3.000 × 1.500 Pixel');
  await page.click('#filters [data-filter="comic"]');
  await shows(page, 'comic');
  expect(await stats(page)).toMatchObject({ w: 1000, h: 500 });
  f = await download(page, () => page.click('#btnSave'));
  expect(f.name).toBe('comic.png');
  d = await decodePng(page, f.buf);
  expect(d).toMatchObject({ w: 2400, h: 1200, grey: false });
});

test('print: only the picture, buttons and texts left out', async ({ page }) => {
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await open(page);
  await page.click('#btnPrint');
  await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
  await expect(page.locator('#printImg')).toHaveAttribute('src', /^blob:/);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#printImg')).toBeVisible();
  for (const sel of ['header', 'main', 'details.help', 'footer']) await expect(page.locator(sel).first()).toBeHidden();
  const pdf = await page.pdf({ format: 'A4' });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#printImg')).toBeHidden();
});

test('photo, filter and sliders survive a reload', async ({ page }) => {
  await open(page);
  await page.click('#filters [data-filter="comic"]');
  await setSlider(page, 'levels', 3);
  await shows(page, 'comic', { levels: 3 });
  await expect.poll(() => page.evaluate(async () => (await Tools.keep.names()).includes('photo'))).toBe(true);
  await page.reload();
  await expect(page.locator('#resultCard')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('Foto vom letzten Mal geladen.');
  await expect(page.locator('#photoInfo')).toHaveText('600 × 400 Pixel');
  await expect(page.locator('#filters [data-filter="comic"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#levels')).toHaveValue('3');
  await shows(page, 'comic', { levels: 3 });
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS))
    .toEqual({ filter: 'comic', ...DEFAULTS, levels: 3 });
});

test('discard removes the kept photo; undo brings it back', async ({ page }) => {
  await open(page);
  await expect.poll(() => page.evaluate(async () => (await Tools.keep.names()).includes('photo'))).toBe(true);
  await page.click('#btnDiscard');
  await expect(page.locator('#btnPick')).toBeVisible();
  await expect(page.locator('#resultCard')).toBeHidden();
  await expect.poll(() => page.evaluate(() => Tools.keep.names())).toEqual([]);
  await page.locator('#toast').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('#resultCard')).toBeVisible();
  await shows(page, 'coloring');
  await expect.poll(() => page.evaluate(async () => (await Tools.keep.names()).includes('photo'))).toBe(true);
});

test('a broken kept photo is dropped instead of failing on every start', async ({ page }) => {
  await page.evaluate(() => Tools.keep.put('photo', new File(['not a picture'], 'x.png', { type: 'image/png' })));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Tools.keep.names())).toEqual([]);
  await expect(page.locator('#btnPick')).toBeVisible();
  await expect(page.locator('#status')).toHaveText('');
  // A file that is no picture, chosen by the user, gets a message
  await page.setInputFiles('#inPick', { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('nope') });
  await expect(page.locator('#status')).toHaveText('Dieses Foto lässt sich nicht öffnen.');
  await expect(page.locator('#resultCard')).toBeHidden();
});

test('every filter: its own sliders only, a picture comes out', async ({ page }) => {
  await open(page);
  const own = { original: [], coloring: ['detail', 'thickness'], comic: ['levels', 'lines'], sketch: ['shading'], watercolor: ['softness'],
    oil: ['brush'], popart: ['palette'], halftone: ['dotSize'], pixel: ['pixelSize'], bw: ['contrast'], vintage: ['tone'] };
  await expect(page.locator('#filters button')).toHaveCount(Object.keys(own).length);
  for (const [f, keys] of Object.entries(own)) {
    await page.click(`#filters [data-filter="${f}"]`);
    await expect(page.locator(`#filters [data-filter="${f}"]`)).toHaveAttribute('aria-pressed', 'true');
    await shows(page, f);
    await expect(page.locator('#sliders input:visible')).toHaveCount(keys.length);
    for (const k of keys) await expect(page.locator('#' + k)).toBeVisible();
    await expect(page.locator('#resetRow')).toBeVisible({ visible: keys.length > 0 });
    expect((await stats(page)).w, f).toBe(600);
  }
});

test('sketch, black & white: grey; vintage: sepia values computed by hand', async ({ page }) => {
  await open(page);
  // Sketch: flat areas are paper, the outline is drawn
  await page.click('#filters [data-filter="sketch"]');
  await shows(page, 'sketch');
  // shading 40 %: paper × (1 − 0,4·0,5·(1 − g/255)) with the lifted grey g = 24 + L·231/255 of the red disc
  const L = 0.299 * 224 + 0.587 * 58 + 0.114 * 58, gl = 24 + L * 231 / 255;
  const [sr, sg, sb] = await px(page, 300, 200);
  expect(Math.abs(sr - 255 * (1 - 0.2 * (1 - gl / 255)))).toBeLessThanOrEqual(1.5);
  expect(sg).toBe(sr); expect(Math.abs(sb - sr * 0.97)).toBeLessThanOrEqual(1);
  // the outline is drawn (red and green differ only by 6 in brightness, so the stroke is faint)
  expect((await stats(page, [394, 196, 406, 204])).boxMin).toBeLessThan(sr - 5);
  // without shading flat areas are white paper
  await setSlider(page, 'shading', 0);
  await shows(page, 'sketch', { shading: 0 });
  expect((await px(page, 300, 200)).slice(0, 2)).toEqual([255, 255]);
  // Black & white: the disc (brightness 108) stays darker than the green (114), all grey
  await page.click('#filters [data-filter="bw"]');
  await shows(page, 'bw');
  expect((await stats(page)).grey).toBe(true);
  expect((await px(page, 300, 200))[0]).toBeLessThan((await px(page, 40, 40))[0]);
  // Vintage at 100 %: sepia matrix of (224, 58, 58), blacks lifted by 28, no vignette in the centre
  await page.click('#filters [data-filter="vintage"]');
  await setSlider(page, 'tone', 100);
  await expect(page.locator('#toneOut')).toHaveText('100 %');
  await shows(page, 'vintage', { tone: 100 });
  const sep = [0.393 * 224 + 0.769 * 58 + 0.189 * 58, 0.349 * 224 + 0.686 * 58 + 0.168 * 58, 0.272 * 224 + 0.534 * 58 + 0.131 * 58];
  const want = [28, 28 * 0.9, 28 * 0.75].map((f, i) => f + sep[i] * (1 - 28 / 255));
  const got = await px(page, 300, 200);
  got.forEach((v, i) => expect(Math.abs(v - want[i]), `channel ${i}`).toBeLessThanOrEqual(1.5));
  // the corner is darker (vignette): green (58, 154, 58) through the same matrix would be brighter than this
  expect((await px(page, 1, 1))[1]).toBeLessThan(0.349 * 58 + 0.686 * 154 + 0.168 * 58);
});

test('pixel, pop art, halftone, oil, watercolour', async ({ page }) => {
  await open(page);
  // Pixel: 10 × 0,6 = 6 px squares, each channel in steps of 51 – the disc (224, 58, 58) becomes (204, 51, 51)
  await page.click('#filters [data-filter="pixel"]');
  await shows(page, 'pixel');
  expect(await px(page, 300, 198)).toEqual([204, 51, 51]);
  expect(await px(page, 305, 203)).toEqual([204, 51, 51]);
  const block = await page.evaluate(() => {
    const d = document.getElementById('view').getContext('2d').getImageData(0, 0, 6, 6).data;
    return new Set(Array.from({ length: 36 }, (_, i) => d.slice(i * 4, i * 4 + 3).join())).size;
  });
  expect(block).toBe(1);
  // Pop art: only colours of the chosen palette; disc and background differ
  await page.click('#filters [data-filter="popart"]');
  await expect(page.locator('#paletteOut')).toHaveText('Knallig');
  await setSlider(page, 'palette', 2);
  await expect(page.locator('#paletteOut')).toHaveText('Klassisch');
  await shows(page, 'popart', { palette: 2 });
  const pal = ['10,10,10', '220,30,40', '30,90,220', '255,230,40'];
  const colours = await page.evaluate(() => {
    const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, set = new Set();
    for (let p = 0; p < d.length; p += 4) set.add(`${d[p]},${d[p + 1]},${d[p + 2]}`);
    return [...set];
  });
  for (const c of colours) expect(pal).toContain(c);
  expect((await px(page, 300, 200)).join()).not.toBe((await px(page, 40, 40)).join());
  // Halftone: white paper between the dots
  await page.click('#filters [data-filter="halftone"]');
  await shows(page, 'halftone');
  expect(await page.evaluate(() => {
    const c = document.getElementById('view'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let paper = 0; for (let p = 0; p < d.length; p += 4) if (d[p] === 255 && d[p + 1] === 255 && d[p + 2] === 250) paper++;
    return paper / (d.length / 4);
  })).toBeGreaterThan(0.1);
  // Oil and watercolour keep red red and green green
  for (const f of ['oil', 'watercolor']) {
    await page.click(`#filters [data-filter="${f}"]`);
    await shows(page, f);
    const [r1, g1] = await px(page, 300, 200), [r2, g2] = await px(page, 40, 40);
    expect(r1 - g1, f).toBeGreaterThan(50);
    expect(g2 - r2, f).toBeGreaterThan(30);
  }
});

test('an unknown filter name only gives the photo back, never another function', async ({ page }) => {
  const out = await page.evaluate(() => {
    const px = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
    return ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'nope'].map(f => [...PhotoFilters.apply(px, 2, 1, f, {})].join());
  });
  for (const o of out) expect(o).toBe('10,20,30,255,40,50,60,255');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and file name follow the language', async ({ page }) => {
    await switchLang(page, 'en');
    await open(page);
    await expect(page.locator('#photoInfo')).toHaveText('600 × 400 pixels');
    await expect(page.locator('#filters [data-filter="coloring"]')).toHaveText('Colouring page');
    await expect(page.locator('#thicknessOut')).toHaveText('2');
    const f = await download(page, () => page.click('#btnSave'));
    expect(f.name).toBe('colouring-page.png');
    await expect(page.locator('#status')).toContainText('Picture saved');
  });
});
