// Collage: Layout-Logik (lückenlos, ohne Beschnitt, Seitenverhältnis), PNG-Streifen-Encoder (selbst zerlegt:
// CRC, zlib, Filter) und die Seite mit erzeugten einfarbigen Test-Fotos.
import { readFileSync } from 'node:fs';
import zlib from 'node:zlib';
import { test, expect, openMenu, onDialog, switchLang, axe, expectNoHorizontalScroll } from './helpers.mjs';

/* ---------- Test images and an independent PNG reader (Node zlib) ---------- */
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  let c = 0xFFFFFFFF;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// One-colour PNG of w × h pixels
function solidPng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) { row[1 + x * 3] = r; row[2 + x * 3] = g; row[3 + x * 3] = b; }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// Reads an 8-bit RGB PNG: checks every CRC, inflates, undoes all five filter types
function readPng(buf) {
  expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let o = 8, w = 0, h = 0; const idat = []; const types = [];
  while (o < buf.length) {
    const len = buf.readUInt32BE(o), type = buf.toString('ascii', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + len);
    expect(buf.readUInt32BE(o + 8 + len), `CRC of ${type}`).toBe(crc32(buf.subarray(o + 4, o + 8 + len)));
    types.push(type);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); expect(data[8]).toBe(8); expect(data[9]).toBe(2); }
    if (type === 'IDAT') idat.push(data);
    o += 12 + len;
  }
  expect(types[0]).toBe('IHDR'); expect(types.at(-1)).toBe('IEND');
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 3; expect(raw.length).toBe(h * (stride + 1));
  const px = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 3 ? px[dst + i - 3] : 0, b = y ? px[dst - stride + i] : 0, c = i >= 3 && y ? px[dst - stride + i - 3] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f];
      px[dst + i] = (raw[src + i] + pred) & 255;
    }
  }
  return { w, h, idat: idat.length, at: (x, y) => [...px.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)] };
}

const COLORS = [[230, 30, 30], [30, 160, 40], [30, 60, 220], [240, 200, 20], [150, 40, 170]];
const SIZES = [[400, 300], [300, 450], [500, 250], [320, 320], [240, 400]];
const photos = (n = 5) => Array.from({ length: n }, (_, i) => ({
  name: `photo-${i + 1}.png`, mimeType: 'image/png', buffer: solidPng(...SIZES[i % 5], COLORS[i % 5]),
}));
const near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const isPhoto = p => COLORS.some(c => near(p, c, 12));
async function add(page, files) {
  await page.setInputFiles('#inPick', files);
  await expect(page.locator('#collage > button')).toHaveCount(files.length);
}
async function savePng(page) {
  await page.locator('#format [data-format="png"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  return { name: dl.suggestedFilename(), png: readPng(readFileSync(await dl.path())) };
}

test.beforeEach(async ({ page }) => { await page.goto('/collage-maker/'); });

/* ---------- Layout logic ---------- */
test('layouts tile the rectangle exactly and keep every photo uncropped', async ({ page }) => {
  const res = await page.evaluate(() => {
    const L = window.CollageLayout, r = L.rng(42), out = [];
    for (const n of [1, 2, 3, 7, 20, 60]) {
      const asp = {}; const ids = [];
      for (let i = 0; i < n; i++) { ids.push('p' + i); asp['p' + i] = r() < 0.5 ? 0.5 + r() * 0.5 : 1 + r(); }
      const a = id => asp[id];
      for (const [mode, target] of [['auto', null], ['auto', 1], ['auto', 16 / 9], ['rows', null], ['cols', 3 / 4]]) {
        const lay = mode === 'auto' ? L.geometry(L.search(ids, a, target, 3), a) : L.rows(ids, a, target, mode === 'cols');
        out.push({ n, mode, target, A: lay.A, cells: lay.cells, asp: lay.cells.map(c => asp[c.id]), ids: lay.cells.map(c => c.id), order: ids });
      }
    }
    return out;
  });
  for (const l of res) {
    const what = `${l.mode} n=${l.n} target=${l.target}`;
    expect(l.cells.length, what).toBe(l.n);
    expect(new Set(l.ids).size, what).toBe(l.n);
    // Area sums to the whole and no two cells overlap → no gaps
    expect(l.cells.reduce((s, c) => s + c.w * c.h, 0), what).toBeCloseTo(1, 9);
    for (const c of l.cells) {
      expect(c.x, what).toBeGreaterThanOrEqual(-1e-9); expect(c.y).toBeGreaterThanOrEqual(-1e-9);
      expect(c.x + c.w, what).toBeLessThanOrEqual(1 + 1e-9); expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9);
    }
    for (let i = 0; i < l.n; i++) for (let k = i + 1; k < l.n; k++) {
      const p = l.cells[i], q = l.cells[k];
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x), oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
      expect(ox <= 1e-9 || oy <= 1e-9, `${what}: cells ${i} and ${k} overlap`).toBe(true);
    }
    // Shape of each cell (collage A : 1) is exactly the shape of its photo
    l.cells.forEach((c, i) => expect(c.w * l.A / c.h, what).toBeCloseTo(l.asp[i], 6));
    if (l.mode === 'auto' && l.target && l.n >= 7) expect(Math.abs(Math.log(l.A / l.target)), what).toBeLessThan(0.03);
    if (!l.target && l.n >= 3) { expect(l.A, what).toBeGreaterThan(2 / 3 - 0.05); expect(l.A, what).toBeLessThan(1.5 + 0.05); }
    if (l.mode !== 'auto') expect(l.ids, `${what} keeps the order`).toEqual(l.order);
  }
});

test('the same seed gives the same layout; swap and remove keep the tree valid', async ({ page }) => {
  const r = await page.evaluate(() => {
    const L = window.CollageLayout, asp = { a: 1.5, b: 0.66, c: 1, d: 2, e: 0.75 }, ids = Object.keys(asp), f = id => asp[id];
    const t1 = L.search(ids, f, 1, 9), t2 = L.search(ids, f, 1, 9);
    const sw = L.refit(L.swapLeaves(t1, 'a', 'b'), f, 1);
    const rm = L.refit(L.removeLeaf(t1, 'c'), f, 1);
    return { same: JSON.stringify(t1) === JSON.stringify(t2), valid: L.validTree(t1, ids), sw: L.validTree(sw, ids),
      rm: L.validTree(rm, ids.filter(i => i !== 'c')), bad: L.validTree({ d: 'x', a: { id: 'a' }, b: { id: 'b' } }, ['a', 'b']),
      dup: L.validTree({ d: 'h', a: { id: 'a' }, b: { id: 'a' } }, ['a', 'b']) };
  });
  expect(r).toEqual({ same: true, valid: true, sw: true, rm: true, bad: false, dup: false });
});

test('PNG writer: strips, CRCs and filter decoded independently', async ({ page }) => {
  const b64 = await page.evaluate(async () => {
    const W = 37, H = 23, w = window.CollagePng.writer(W, H);
    for (let y0 = 0; y0 < H; y0 += 5) {
      const n = Math.min(5, H - y0), d = new Uint8ClampedArray(W * n * 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 4, Y = y0 + y;
        d[o] = x * 7 & 255; d[o + 1] = Y * 11 & 255; d[o + 2] = (x * Y) & 255; d[o + 3] = 255;
      }
      await w.rows(d, n);
    }
    const blob = await w.finish();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  const png = readPng(Buffer.from(b64, 'base64'));
  expect([png.w, png.h]).toEqual([37, 23]);
  for (const [x, y] of [[0, 0], [36, 0], [5, 7], [36, 22], [20, 13]]) expect(png.at(x, y)).toEqual([x * 7 & 255, y * 11 & 255, (x * y) & 255]);
});

/* ---------- Page ---------- */
test('first start shows only the image picker; photos give a gapless collage', async ({ page }) => {
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#previewCard')).toBeHidden();
  await add(page, photos());
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#stats')).toHaveText('5 Bilder · keine Lücken · nichts abgeschnitten');
  // Preview cells cover the collage box completely
  const cover = await page.evaluate(() => {
    const box = document.getElementById('collage').getBoundingClientRect();
    const cells = [...document.querySelectorAll('#collage > button')].map(b => b.getBoundingClientRect());
    return { box: box.width * box.height, cells: cells.reduce((s, r) => s + r.width * r.height, 0) };
  });
  expect(Math.abs(cover.cells - cover.box) / cover.box).toBeLessThan(0.01);
});

test('saved PNG: exact size, no gaps, every photo in its cell', async ({ page }) => {
  await add(page, photos());
  await page.locator('#aspect [data-aspect="1:1"]').click();
  await page.locator('#size [data-size="2000"]').click();
  await expect(page.locator('#exportInfo')).toHaveText('Ergebnis: 2.000 × 2.000 Pixel (4,0 Megapixel)');
  const { name, png } = await savePng(page);
  expect(name).toBe('collage-2000x2000.png');
  expect([png.w, png.h]).toEqual([2000, 2000]);
  for (let y = 0; y < 2000; y += 37) for (let x = 0; x < 2000; x += 41) expect(isPhoto(png.at(x, y)), `pixel ${x},${y}`).toBe(true);
  for (const [x, y] of [[0, 0], [1999, 0], [0, 1999], [1999, 1999]]) expect(isPhoto(png.at(x, y))).toBe(true);
  await expect(page.locator('#exportStatus')).toContainText('Gespeichert: collage-2000x2000.png');
});

test('wide PNG is drawn in tiles and strips and still matches the preview layout', async ({ page }) => {
  await add(page, photos(4));
  await page.locator('#aspect [data-aspect="16:9"]').click();
  await page.locator('#size [data-size="8000"]').click();
  await expect(page.locator('#exportInfo')).toHaveText('Ergebnis: 8.000 × 4.500 Pixel (36 Megapixel)');
  const layout = await page.evaluate(() => [...document.querySelectorAll('#collage > button')].map(b => {
    const box = document.getElementById('collage').getBoundingClientRect(), r = b.getBoundingClientRect();
    return { cx: (r.left - box.left + r.width / 2) / box.width, cy: (r.top - box.top + r.height / 2) / box.height, n: Number(b.getAttribute('aria-label').replace(/\D/g, '')) };
  }));
  const { png } = await savePng(page);
  expect([png.w, png.h]).toEqual([8000, 4500]);
  expect(png.idat).toBeGreaterThan(0);
  for (const c of layout) expect(near(png.at(Math.round(c.cx * 7999), Math.round(c.cy * 4499)), COLORS[c.n - 1], 12), `centre of image ${c.n}`).toBe(true);
  // Across the tile border at x = 4096 nothing but photos
  for (let y = 0; y < 4500; y += 97) for (const x of [4094, 4095, 4096, 4097]) expect(isPhoto(png.at(x, y))).toBe(true);
});

test('spacing shows the background colour at the edges and between photos', async ({ page }) => {
  await add(page, photos(3));
  await page.locator('#gap').fill('20');
  await expect(page.locator('#gapOut')).toHaveText('2,0 %');
  await page.locator('#bg').fill('#ff00ff');
  await page.locator('#size [data-size="2000"]').click();
  const { png } = await savePng(page);
  const long = Math.max(png.w, png.h), g = 0.02 * long;
  for (const [x, y] of [[2, 2], [png.w - 3, png.h - 3], [Math.round(g / 2), Math.round(png.h / 2)]]) expect(png.at(x, y)).toEqual([255, 0, 255]);
  await expect(page.locator('#stats')).toContainText('abgeschnitten');
});

test('JPG has the chosen size', async ({ page }) => {
  await add(page, photos(3));
  await page.locator('#aspect [data-aspect="4:3"]').click();
  await page.locator('#size [data-size="2000"]').click();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  expect(dl.suggestedFilename()).toBe('collage-2000x1500.jpg');
  const buf = readFileSync(await dl.path());
  // SOF0 marker: height and width
  let o = 2; let size = null;
  while (o < buf.length) {
    const m = buf[o + 1], len = buf.readUInt16BE(o + 2);
    if (m >= 0xC0 && m <= 0xC2) { size = [buf.readUInt16BE(o + 7), buf.readUInt16BE(o + 5)]; break; }
    o += 2 + len;
  }
  expect(size).toEqual([2000, 1500]);
});

test('JPG too big for the browser offers PNG instead', async ({ page }) => {
  await add(page, photos(2));
  await page.locator('#size [data-size="2000"]').click();
  // Simulate a canvas limit as on an iPhone: big canvases cannot be read back
  await page.evaluate(() => {
    const orig = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...a) {
      if (this.canvas.width * this.canvas.height > 1e6) return new ImageData(1, 1);
      return orig.apply(this, a);
    };
  });
  let asked = '';
  await onDialog(page, d => { asked = d.message(); d.accept(); }, { once: true });
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  expect(asked).toContain('zu groß');
  expect(dl.suggestedFilename()).toMatch(/\.png$/);
  await expect(page.locator('#format [data-format="png"]')).toHaveAttribute('aria-pressed', 'true');
});

test('tap two images to swap them; remove one with undo', async ({ page }) => {
  await add(page, photos(4));
  await page.locator('#mode [data-mode="rows"]').click();
  const ids = () => page.locator('#collage > button').evaluateAll(bs => bs.map(b => b.dataset.id));
  const before = await ids();
  await page.locator('#collage > button').nth(0).click();
  await expect(page.locator('#selText')).toHaveText('Bild 1 ausgewählt – tippe ein anderes Bild an, um die beiden zu tauschen.');
  await page.locator('#collage > button').nth(1).click();
  await expect(page.locator('#selBar')).toBeHidden();
  expect(await ids()).toEqual([before[1], before[0], before[2], before[3]]);

  await page.locator(`#collage > button[data-id="${before[2]}"]`).click();
  await page.click('#btnRemove');
  await expect(page.locator('#collage > button')).toHaveCount(3);
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('#collage > button')).toHaveCount(4);
  expect(await ids()).toEqual([before[1], before[0], before[2], before[3]]);
});

// Drags with the mouse from the centre of one cell to the centre of another
async function mouseDrag(page, from, to) {
  await page.locator('#collage').scrollIntoViewIfNeeded();
  const a = await page.locator(`#collage > button[data-id="${from}"]`).boundingBox();
  const b = await page.locator(`#collage > button[data-id="${to}"]`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 20, { steps: 3 });
  await expect(page.locator(`#collage > button[data-id="${from}"]`)).toHaveClass(/dragging/);
  await expect(page.locator('.drag-ghost')).toHaveCount(1);
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await expect(page.locator(`#collage > button[data-id="${to}"]`)).toHaveClass(/drop/);
  await page.mouse.up();
  await expect(page.locator('.drag-ghost')).toHaveCount(0);
}
const cellIds = page => page.locator('#collage > button').evaluateAll(bs => bs.map(b => b.dataset.id));
// The image whose cell covers a point (centre of a cell before a change)
const idAt = (page, { x, y, width, height }) => page.evaluate(([px, py]) => document.elementFromPoint(px, py).closest('#collage > button').dataset.id, [x + width / 2, y + height / 2]);

test('drag in rows: the image moves to the new place, the others shift along; saved', async ({ page }) => {
  await add(page, photos(4));
  await page.locator('#mode [data-mode="rows"]').click();
  const [a, b, c, d] = await cellIds(page);
  await mouseDrag(page, a, d);
  expect(await cellIds(page)).toEqual([b, c, d, a]);
  // the drop does not select an image; dragging back moves it to the front again
  await expect(page.locator('#selBar')).toBeHidden();
  await mouseDrag(page, a, b);
  expect(await cellIds(page)).toEqual([a, b, c, d]);
  await mouseDrag(page, b, d);
  expect(await cellIds(page)).toEqual([a, c, d, b]);
  await expect.poll(() => page.evaluate(async () => ((await Tools.keep.json('state', null)) || {}).order)).toEqual([a, c, d, b]);
  await page.reload();
  await expect(page.locator('#collage > button')).toHaveCount(4);
  expect(await cellIds(page)).toEqual([a, c, d, b]);
});

test('drag in the automatic layout swaps two images; dropping outside changes nothing', async ({ page }) => {
  await add(page, photos(5));
  const [a, , , d] = await cellIds(page);
  await page.locator('#collage').scrollIntoViewIfNeeded();
  const boxA = await page.locator(`#collage > button[data-id="${a}"]`).boundingBox();
  const boxD = await page.locator(`#collage > button[data-id="${d}"]`).boundingBox();
  await mouseDrag(page, a, d);
  expect(await idAt(page, boxA)).toBe(d);
  expect(await idAt(page, boxD)).toBe(a);
  // dropped on itself or outside the collage: nothing changes, nothing gets selected
  const before = await cellIds(page);
  const box = await page.locator(`#collage > button[data-id="${a}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y - 200, { steps: 5 });
  await page.mouse.up();
  expect(await cellIds(page)).toEqual(before);
  await expect(page.locator('#selBar')).toBeHidden();
  await expect(page.locator('#collage > button.dragging, #collage > button.drop')).toHaveCount(0);
});

test('touch: swiping does not drag (the page scrolls), holding first does', async ({ page }) => {
  await add(page, photos(4));
  await page.locator('#mode [data-mode="rows"]').click();
  const [a, b, c, d] = await cellIds(page);
  await page.locator('#collage').scrollIntoViewIfNeeded();
  const centre = async id => { const r = await page.locator(`#collage > button[data-id="${id}"]`).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
  const [ax, ay] = await centre(a), [dx, dy] = await centre(d);
  // touch pointer events as a phone sends them (pointerType "touch")
  const touch = (type, x, y) => page.evaluate(([type, x, y]) => {
    const el = document.elementFromPoint(x, y);
    el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y }));
  }, [type, x, y]);
  // moving right away is a swipe: no drag, even after the hold time
  await touch('pointerdown', ax, ay);
  await touch('pointermove', ax, ay + 40);
  await touch('pointerup', ax, ay + 40);
  await expect(page.locator('#collage > button.dragging')).toHaveCount(0);
  expect(await cellIds(page)).toEqual([a, b, c, d]);
  // press and hold: the image fades, then it can be dragged
  await touch('pointerdown', ax, ay);
  await expect(page.locator(`#collage > button[data-id="${a}"]`)).toHaveClass(/dragging/);
  await touch('pointermove', (ax + dx) / 2, (ay + dy) / 2);
  await touch('pointermove', dx, dy);
  await expect(page.locator(`#collage > button[data-id="${d}"]`)).toHaveClass(/drop/);
  await touch('pointerup', dx, dy);
  expect(await cellIds(page)).toEqual([b, c, d, a]);
});

test('photos and arrangement survive a reload; remove all asks first', async ({ page }) => {
  await add(page, photos(5));
  await page.locator('#btnShuffle').click();
  const snap = () => page.locator('#collage > button').evaluateAll(bs => bs.map(b => b.dataset.id + ':' + b.style.cssText));
  const before = await snap();
  // Kept after the rearrangement (new seed, the tree with all five photos)
  await expect.poll(() => page.evaluate(async () => {
    const s = await Tools.keep.json('state', null);
    return !!s && s.seed !== 1 && s.order.length === 5 && !!s.tree && (await Tools.keep.names()).length === 6;
  })).toBe(true);
  await page.reload();
  await expect(page.locator('#collage > button')).toHaveCount(5);
  expect(await snap()).toEqual(before);

  await onDialog(page, d => d.dismiss(), { once: true });
  await openMenu(page);
  await page.click('#btnClear');
  await expect(page.locator('#collage > button')).toHaveCount(5);
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnClear');
  await expect(page.locator('#setup')).toBeVisible();
  await page.reload();
  await expect(page.locator('#setup')).toBeVisible();
});

test('settings are saved; English texts', async ({ page }) => {
  await add(page, photos(2));
  await page.locator('#mode [data-mode="cols"]').click();
  await page.locator('#aspect [data-aspect="9:16"]').click();
  await page.locator('#format [data-format="png"]').click();
  await page.locator('#size [data-size="4000"]').click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('collage-maker.settings.v1'))))
    .toEqual({ mode: 'cols', aspect: '9:16', gap: 0, bg: '#ffffff', size: 4000, format: 'png' });
  await switchLang(page, 'en');
  await expect(page.locator('#stats')).toContainText('2 images · no gaps');
  await expect(page.locator('#exportInfo')).toHaveText('Result: 2,250 × 4,000 pixels (9.0 megapixels)');
  await expect(page.locator('#btnSave')).toHaveText('Save collage');
});

test('HEIC photo with the libheif decoder, also offline after the first time; kept as JPG', async ({ page, context }) => {
  const heic = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: readFileSync(new URL('./fixtures/photo.heic', import.meta.url)) };
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                                 // controlled by the service worker → the decoder is cached
  await page.setInputFiles('#inPick', [heic, ...photos(1)]);
  await expect(page.locator('#collage > button')).toHaveCount(2);
  expect(await page.evaluate(() => Heic.info())).toEqual({ native: false, worker: true });
  await expect.poll(() => page.evaluate(async () => (await Tools.keep.names()).length)).toBe(3);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#collage > button')).toHaveCount(2);
  await expect(page.locator('#addInfo2')).toHaveText('2 Bilder vom letzten Mal.');
  await page.setInputFiles('#inPick', heic);
  await expect(page.locator('#collage > button')).toHaveCount(3);
  await page.locator('#size [data-size="2000"]').click();
  const { png } = await savePng(page);
  expect(Math.max(png.w, png.h)).toBe(2000);
  await context.setOffline(false);
});

test.describe('HEIC decoder cannot load', () => {
  test.use({ allowedProblems: /libheif|Failed to load resource/ });
  test('clear message, nothing added', async ({ page, context }) => {
    await context.route('**/assets/vendor/libheif/**', r => r.abort());
    await page.setInputFiles('#inPick', { name: 'IMG_0002.HEIC', mimeType: 'image/heic', buffer: readFileSync(new URL('./fixtures/photo.heic', import.meta.url)) });
    await expect(page.locator('#toast')).toContainText('HEIC-Foto „IMG_0002.HEIC“ ließ sich nicht öffnen');
    await expect(page.locator('#setup')).toBeVisible();
  });
});

test('not an image: message, the others are added', async ({ page }) => {
  await page.setInputFiles('#inPick', [{ name: 'notes.png', mimeType: 'image/png', buffer: Buffer.from('not a picture') }, ...photos(2)]);
  await expect(page.locator('#collage > button')).toHaveCount(2);
  await expect(page.locator('#toast')).toContainText('„notes.png“ ließ sich nicht öffnen.');
  await expect(page.locator('#addInfo2')).toHaveText('2 Bilder hinzugefügt.');
});

test('saving can be cancelled', async ({ page }) => {
  await add(page, photos(5));
  await page.locator('#format [data-format="png"]').click();
  await page.locator('#size [data-size="16000"]').click();
  await page.click('#btnSave');
  await expect(page.locator('#progressRow')).toBeVisible();
  await expect(page.locator('#btnSave')).toBeDisabled();
  await page.click('#btnCancel');
  await expect(page.locator('#exportStatus')).toHaveText('Abgebrochen.');
  await expect(page.locator('#progressRow')).toBeHidden();
  await expect(page.locator('#btnSave')).toBeEnabled();
});

test('with photos: accessible, light and dark, and no horizontal scrolling at 375 px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await add(page, photos(5));
  await page.locator('#collage > button').first().click();
  await expectNoHorizontalScroll(page);
  expect((await axe(page).analyze()).violations).toEqual([]);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect((await axe(page).analyze()).violations).toEqual([]);
});
