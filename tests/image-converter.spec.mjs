// Bildkonverter: test images are drawn in the browser (or read from tests/fixtures/photo.heic), converted,
// downloaded and checked independently: the file headers are parsed here (BMP, ICO, ZIP with CRC-32 from
// node:zlib), pixels are read back by decoding the downloaded file in a fresh page context.
import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import { test, expect, mockLaunchQueue } from './helpers.mjs';

const URL_ = '/image-converter/';
const HEIC = readFileSync(new URL('./fixtures/photo.heic', import.meta.url));
const heic = () => ({ name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: HEIC });

/** PNG of w×h: left half red, right half transparent (or blue with opaque) */
async function png(page, w = 200, h = 100, { opaque = false } = {}) {
  const b64 = await page.evaluate(({ w, h, opaque }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#ff0000'; g.fillRect(0, 0, w / 2, h);
    if (opaque) { g.fillStyle = '#0000ff'; g.fillRect(w / 2, 0, w / 2, h); }
    return c.toDataURL('image/png').split(',')[1];
  }, { w, h, opaque });
  return Buffer.from(b64, 'base64');
}

async function add(page, files) {
  const before = await page.locator('#inList li').count();
  await page.setInputFiles('#inPick', files);
  await expect(page.locator('#inList li')).toHaveCount(before + files.length);
  await expect(page.locator('#status')).toHaveText('');
}
const pickFormat = (page, f) => page.locator(`#formats input[value="${f}"]`).check({ force: true });

async function convert(page, n = 1) {
  await page.click('#btnConvert');
  await expect(page.locator('#outList li')).toHaveCount(n);
}
/** Saves result i and returns { name, buf } */
async function save(page, i = 0) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#outList li a').nth(i).click()]);
  return { name: dl.suggestedFilename(), buf: readFileSync(await dl.path()) };
}

/** Decodes an image file in the page; returns size and the RGBA values at the given points */
function pixels(page, buf, mime, points) {
  return page.evaluate(async ({ b64, mime, points }) => {
    const blob = new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], { type: mime });
    const url = URL.createObjectURL(blob);
    const img = new Image(); img.src = url; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    return { w: c.width, h: c.height, px: points.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data]) };
  }, { b64: buf.toString('base64'), mime, points });
}
const near = (a, b, tol = 12) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test.describe('Bildkonverter', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('PNG with transparency → JPG: background colour, size, file name, quality', async ({ page }) => {
    await add(page, [{ name: 'logo.png', mimeType: 'image/png', buffer: await png(page) }]);
    await expect(page.locator('#inList .meta')).toContainText('PNG · 200×100');
    await pickFormat(page, 'jpg');
    await expect(page.locator('#bgRow')).toBeVisible();
    await expect(page.locator('#qRow')).toBeVisible();
    await page.locator('#bg').fill('#00ff00');
    await convert(page);
    await expect(page.locator('#outList .meta')).toContainText('200×100');
    const { name, buf } = await save(page);
    expect(name).toBe('logo.jpg');
    expect([buf[0], buf[1], buf[2]]).toEqual([0xFF, 0xD8, 0xFF]);
    const r = await pixels(page, buf, 'image/jpeg', [[20, 50], [180, 50]]);
    expect([r.w, r.h]).toEqual([200, 100]);
    expect(near(r.px[0], [255, 0, 0, 255], 30)).toBe(true);
    expect(near(r.px[1], [0, 255, 0, 255], 30)).toBe(true);   // transparent → chosen background
    // lower quality → smaller file
    await page.locator('#quality').fill('10');
    await page.locator('#quality').dispatchEvent('change');
    await convert(page);
    const small = await save(page);
    expect(small.buf.length).toBeLessThan(buf.length);
  });

  test('PNG keeps transparency; WebP is written; settings are remembered', async ({ page }) => {
    await add(page, [{ name: 'a.png', mimeType: 'image/png', buffer: await png(page) }]);
    await pickFormat(page, 'png');
    await expect(page.locator('#bgRow')).toBeHidden();
    await expect(page.locator('#qRow')).toBeHidden();
    await convert(page);
    let r = await pixels(page, (await save(page)).buf, 'image/png', [[180, 50]]);
    expect(r.px[0][3]).toBe(0);
    await pickFormat(page, 'webp');
    await convert(page);
    const w = await save(page);
    expect(w.name).toBe('a.webp');
    expect(w.buf.subarray(8, 12).toString('latin1')).toBe('WEBP');
    r = await pixels(page, w.buf, 'image/webp', [[20, 50], [180, 50]]);
    expect(near(r.px[0], [255, 0, 0, 255], 20)).toBe(true);
    expect(r.px[1][3]).toBeLessThan(10);
    await page.reload();
    await expect(page.locator('#formats input[value="webp"]')).toBeChecked();
  });

  test('size: longest side, percent; photos are not enlarged', async ({ page }) => {
    await add(page, [{ name: 'a.png', mimeType: 'image/png', buffer: await png(page, 200, 100, { opaque: true }) }]);
    await pickFormat(page, 'png');
    await page.selectOption('#resize', 'max');
    await page.locator('#resizeVal').fill('50');
    await page.locator('#resizeVal').dispatchEvent('change');
    await convert(page);
    let r = await pixels(page, (await save(page)).buf, 'image/png', [[5, 12], [45, 12]]);
    expect([r.w, r.h]).toEqual([50, 25]);
    expect(near(r.px[0], [255, 0, 0, 255])).toBe(true);
    expect(near(r.px[1], [0, 0, 255, 255])).toBe(true);
    await page.locator('#resizeVal').fill('1000');
    await page.locator('#resizeVal').dispatchEvent('change');
    await convert(page);
    r = await pixels(page, (await save(page)).buf, 'image/png', []);
    expect([r.w, r.h]).toEqual([200, 100]);
    await page.selectOption('#resize', 'percent');
    await page.locator('#resizeVal').fill('150');
    await page.locator('#resizeVal').dispatchEvent('change');
    await convert(page);
    r = await pixels(page, (await save(page)).buf, 'image/png', []);
    expect([r.w, r.h]).toEqual([300, 150]);
  });

  test('SVG without width/height is drawn sharp at the chosen size', async ({ page }) => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 10"><rect width="10" height="10" fill="#f00"/><rect x="10" width="10" height="10" fill="#00f"/></svg>';
    await add(page, [{ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) }]);
    await expect(page.locator('#inList .meta')).toContainText('SVG · 20×10');
    await pickFormat(page, 'png');
    await page.selectOption('#resize', 'max');
    await page.locator('#resizeVal').fill('800');
    await page.locator('#resizeVal').dispatchEvent('change');
    await convert(page);
    const r = await pixels(page, (await save(page)).buf, 'image/png', [[398, 200], [402, 200]]);
    expect([r.w, r.h]).toEqual([800, 400]);
    // a sharp edge in the middle (an enlarged 20 px image would blur it)
    expect(near(r.px[0], [255, 0, 0, 255], 4)).toBe(true);
    expect(near(r.px[1], [0, 0, 255, 255], 4)).toBe(true);
  });

  test('HEIC (iPhone) → JPG with the libheif decoder, also offline', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                               // page now controlled → the decoder goes through the cache
    await add(page, [heic()]);
    await expect(page.locator('#inList .meta')).toContainText('HEIC · 64×48');
    await pickFormat(page, 'jpg');
    await convert(page);
    const check = async () => {
      const { name, buf } = await save(page);
      expect(name).toBe('IMG_0001.jpg');
      const r = await pixels(page, buf, 'image/jpeg', [[8, 8], [56, 8], [8, 40], [56, 40]]);
      expect([r.w, r.h]).toEqual([64, 48]);
      expect(near(r.px[0], [220, 30, 30, 255], 30)).toBe(true);
      expect(near(r.px[1], [30, 200, 60, 255], 30)).toBe(true);
      expect(near(r.px[2], [40, 60, 220, 255], 30)).toBe(true);
      expect(near(r.px[3], [255, 255, 255, 255], 30)).toBe(true);
    };
    await check();
    // offline: the decoder was cached on first use
    await context.setOffline(true);
    await page.reload();
    await add(page, [heic()]);
    await convert(page);
    await check();
    await context.setOffline(false);
  });

  test('ICO: favicon with six PNG sizes, square', async ({ page }) => {
    await add(page, [{ name: 'logo.png', mimeType: 'image/png', buffer: await png(page, 200, 100, { opaque: true }) }]);
    await pickFormat(page, 'ico');
    await expect(page.locator('#sizeRow')).toBeHidden();
    await convert(page);
    const { name, buf } = await save(page);
    expect(name).toBe('logo.ico');
    expect([buf.readUInt16LE(0), buf.readUInt16LE(2), buf.readUInt16LE(4)]).toEqual([0, 1, 6]);
    const sizes = [];
    for (let i = 0; i < 6; i++) {
      const e = 6 + 16 * i, len = buf.readUInt32LE(e + 8), off = buf.readUInt32LE(e + 12);
      sizes.push(buf[e] || 256);
      expect(buf[e + 1] || 256).toBe(buf[e] || 256);
      expect(buf.readUInt16LE(e + 6)).toBe(32);
      const p = buf.subarray(off, off + len);
      expect(p.subarray(0, 4).toString('latin1')).toBe('\x89PNG');
      expect([p.readUInt32BE(16), p.readUInt32BE(20)]).toEqual([buf[e] || 256, buf[e] || 256]);
      if (i === 5) {
        // 256×256: the 2:1 image sits in the middle, transparent above and below
        const r = await pixels(page, p, 'image/png', [[10, 10], [60, 128], [200, 128]]);
        expect(r.px[0][3]).toBe(0);
        expect(near(r.px[1], [255, 0, 0, 255])).toBe(true);
        expect(near(r.px[2], [0, 0, 255, 255])).toBe(true);
      }
    }
    expect(sizes).toEqual([16, 32, 48, 64, 128, 256]);
  });

  test('BMP: 24 bit, bottom-up, background for transparency', async ({ page }) => {
    await add(page, [{ name: 'a.png', mimeType: 'image/png', buffer: await png(page, 6, 3) }]);
    await pickFormat(page, 'bmp');
    await convert(page);
    const { name, buf } = await save(page);
    expect(name).toBe('a.bmp');
    expect(buf.subarray(0, 2).toString('latin1')).toBe('BM');
    expect(buf.readUInt32LE(2)).toBe(buf.length);
    expect([buf.readInt32LE(18), buf.readInt32LE(22), buf.readUInt16LE(28)]).toEqual([6, 3, 24]);
    const row = 20; // 6 px × 3 bytes = 18, padded to 20
    expect(buf.length).toBe(54 + row * 3);
    const at = (x, y) => { const o = 54 + (2 - y) * row + x * 3; return [buf[o + 2], buf[o + 1], buf[o]]; };
    expect(at(0, 0)).toEqual([255, 0, 0]);
    expect(at(5, 2)).toEqual([255, 255, 255]); // transparent → white (default)
  });

  test('SVG output embeds the image; several images → ZIP with correct CRCs and unique names', async ({ page }) => {
    const a = await png(page, 40, 20, { opaque: true });
    await add(page, [{ name: 'x.png', mimeType: 'image/png', buffer: a }, { name: 'x.jpg', mimeType: 'image/png', buffer: a }, heic()]);
    await pickFormat(page, 'svg');
    await convert(page, 3);
    const svg = (await save(page)).buf.toString('utf8');
    expect(svg).toMatch(/<svg [^>]*width="40" height="20"/);
    expect(svg).toContain('href="data:image/png;base64,');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnZip')]);
    expect(dl.suggestedFilename()).toMatch(/^bilder-svg-\d{4}-\d\d-\d\d\.zip$/);
    const zip = readFileSync(await dl.path());
    const names = [];
    let o = 0;
    while (zip.readUInt32LE(o) === 0x04034b50) {
      const crc = zip.readUInt32LE(o + 14), size = zip.readUInt32LE(o + 18), nlen = zip.readUInt16LE(o + 26);
      const name = zip.subarray(o + 30, o + 30 + nlen).toString('utf8');
      const data = zip.subarray(o + 30 + nlen, o + 30 + nlen + size);
      expect(crc32(data), name).toBe(crc);
      expect(data.toString('utf8', 0, 5)).toBe('<?xml');
      names.push(name); o += 30 + nlen + size;
    }
    expect(names).toEqual(['x.svg', 'x-2.svg', 'IMG_0001.svg']);
    // end of central directory: 3 entries
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(zip.readUInt16LE(eocd + 10)).toBe(3);
    expect(zip.readUInt32LE(eocd + 16)).toBe(o);
  });

  test('a file that is no image is reported; removing images works', async ({ page }) => {
    await page.setInputFiles('#inPick', [{ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
    await expect(page.locator('#inList .meta.err')).toContainText('„notes.txt“ lässt sich nicht öffnen');
    await expect(page.locator('#btnConvert')).toBeDisabled();
    await add(page, [{ name: 'a.png', mimeType: 'image/png', buffer: await png(page) }]);
    await expect(page.locator('#btnConvert')).toBeEnabled();
    await page.getByRole('button', { name: 'Entfernen: notes.txt' }).click();
    await expect(page.locator('#inList li')).toHaveCount(1);
    await page.click('#btnClear');
    await expect(page.locator('#inList li')).toHaveCount(0);
    await expect(page.locator('#btnPick')).toBeVisible();
  });
});

test('opened with the installed app ("Open with", Windows/Mac): files arrive from the launch queue', async ({ page }) => {
  await mockLaunchQueue(page, [heic()]);
  await page.goto(URL_ + '?opened=1');
  await expect(page.locator('#inList .meta')).toContainText('HEIC · 64×48');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, results and errors in English', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#btnPick')).toHaveText('Choose images');
    await page.locator('#formats input[value="png"]').check({ force: true });
    await expect(page.locator('#fmtHint')).toContainText('Lossless');
    await page.setInputFiles('#inPick', [{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
    await expect(page.locator('#inList .meta.err')).toContainText('cannot be opened');
  });
});
