// Visitenkarten: editing, dragging and resizing on the canvas, undo, PNG size and colours, A4 PDF
// (pages, cards per page, crop marks – read with an own minimal parser), vCard QR code (decoded with
// ZXing-JS, independent of the generator), pictures kept over a reload, offline.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { test, expect } from './helpers.mjs';

const URL_ = '/business-card/';
const design = page => page.evaluate(() => JSON.parse(localStorage.getItem('business-card.design.v1')));
const els = async (page, side = 'front') => (await design(page)).sides[side].els;
const item = (page, text) => page.locator('#elList button', { hasText: text });

/** Waits until the debounced save has the expected state */
async function saved(page, fn) {
  await expect.poll(async () => fn(await design(page))).toBe(true);
}

/** Canvas position (CSS px, page coordinates) of a point given in mm on the card */
async function at(page, x, y) {
  const box = await page.locator('#cv').boundingBox();
  const d = await design(page);
  // Same layout rule as the app: card centred horizontally, 14 px padding at the top
  const [W, H] = { landscape: [85, 55], portrait: [55, 85] }[d.orient || 'landscape'];
  const k = Math.min((box.width - 28) / W, (box.height - 28) / H);
  return { x: box.x + (box.width - W * k) / 2 + x * k, y: box.y + 14 + y * k, k };
}

async function blank(page) {
  page.once('dialog', d => d.accept());
  await page.selectOption('#tpl', 'blank');
  await page.click('#tplApply');
  await saved(page, d => d.sides.front.els.length === 0);
}

async function download(page, button) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(button)]);
  return { name: dl.suggestedFilename(), buf: readFileSync(await dl.path()) };
}

/** PNG size and the colour of one pixel (decoded by the browser) */
async function png(page, buf, px = [2, 2]) {
  return page.evaluate(async ([b64, px]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(px[0], px[1], 1, 1).data;
    return { w: img.width, h: img.height, rgb: [d[0], d[1], d[2]] };
  }, [buf.toString('base64'), px]);
}

/** Minimal reader for the PDF (saved without object streams): pages, images, drawn images and lines per page */
function readPdf(buf) {
  const s = buf.toString('latin1');
  expect(s.startsWith('%PDF-')).toBe(true);
  const objs = {};
  for (const m of s.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) {
    const body = m[2], st = body.indexOf('stream');
    const dict = st >= 0 ? body.slice(0, st) : body;
    let data = null;
    if (st >= 0) {
      const start = m.index + m[0].indexOf(body) + st + body.slice(st).match(/^stream\r?\n/)[0].length;
      const len = Number(dict.match(/\/Length (\d+)/)[1]);
      data = buf.subarray(start, start + len);
      if (/FlateDecode/.test(dict) && !/\/Subtype \/Image/.test(dict)) data = inflateSync(data);
    }
    objs[m[1]] = { dict, data };
  }
  const pages = Object.values(objs).filter(o => /\/Type \/Page\b(?!s)/.test(o.dict)).map(o => {
    const box = o.dict.match(/\/MediaBox \[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number);
    const refs = o.dict.match(/\/Contents (?:\[([^\]]+)\]|(\d+) 0 R)/);
    const ids = (refs[1] || refs[2]).match(/\d+(?= 0 R)|^\d+$/g);
    const content = ids.map(id => objs[id].data.toString('latin1')).join('\n');
    return { width: box[2], height: box[3], images: (content.match(/ Do\b/g) || []).length, lines: (content.match(/ l\b/g) || []).length };
  });
  // Colour images only (pdf-lib stores the alpha channel of a PNG as a separate grey /SMask image)
  const images = Object.values(objs).filter(o => /\/Subtype \/Image/.test(o.dict) && /\/DeviceRGB/.test(o.dict))
    .map(o => ({ w: Number(o.dict.match(/\/Width (\d+)/)[1]), h: Number(o.dict.match(/\/Height (\d+)/)[1]) }));
  return { pages, images };
}

test.beforeEach(async ({ page }) => {
  await page.goto(URL_);
});

test('starts with the classic template; editing a text changes the card and is saved', async ({ page }) => {
  await expect(item(page, 'Erika Mustermann')).toBeVisible();
  await expect(page.locator('#noSel')).toBeVisible();
  await item(page, 'Erika Mustermann').click();
  await expect(page.locator('#selBox')).toBeVisible();
  await expect(page.locator('#pText')).toHaveValue('Erika Mustermann');
  const before = (await els(page)).find(e => e.text === 'Erika Mustermann');
  await page.fill('#pText', 'Dr. Erika Mustermann-Lüdenscheid');
  await page.fill('#pSize', '10,5');
  await saved(page, d => d.sides.front.els.some(e => e.text === 'Dr. Erika Mustermann-Lüdenscheid' && e.size === 10.5));
  const after = (await els(page)).find(e => e.id === before.id);
  // Left aligned: the left edge stays, the box grew with the longer text
  expect(after.x).toBeCloseTo(before.x, 5);
  expect(after.w).toBeGreaterThan(before.w);
  await page.reload();
  await expect(item(page, 'Dr. Erika Mustermann-Lüdenscheid')).toBeVisible();
});

test('drag moves an element, the handle resizes it, undo and redo restore both', async ({ page }) => {
  await blank(page);
  await page.click('[data-add="rect"]');
  await saved(page, d => d.sides.front.els.length === 1);
  const r0 = (await els(page))[0];
  // New elements sit in the middle: 85 × 55 card, 24 × 14 rectangle
  expect(r0).toMatchObject({ type: 'rect', w: 24, h: 14 });
  expect(r0.x).toBeCloseTo((85 - 24) / 2, 5);
  expect(r0.y).toBeCloseTo((55 - 14) / 2, 5);
  // Drag 10 mm right and 5 mm down (Alt: no snapping)
  const p = await at(page, r0.x + 5, r0.y + 5);
  await page.keyboard.down('Alt');
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 10 * p.k, p.y + 5 * p.k, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await saved(page, d => Math.abs(d.sides.front.els[0].x - (r0.x + 10)) < 0.3);
  const r1 = (await els(page))[0];
  expect(r1.y).toBeCloseTo(r0.y + 5, 0);
  await expect(page.locator('#pX')).toHaveValue(/^4[0-1][,.]?\d?$/);
  // Handle at the bottom right corner: +6 mm in both directions
  const h = await at(page, r1.x + r1.w, r1.y + r1.h);
  await page.mouse.move(h.x + 2, h.y + 2);
  await page.mouse.down();
  await page.mouse.move(h.x + 2 + 6 * h.k, h.y + 2 + 6 * h.k, { steps: 5 });
  await page.mouse.up();
  await saved(page, d => Math.abs(d.sides.front.els[0].w - 30) < 0.5);
  const r2 = (await els(page))[0];
  expect(r2.h).toBeCloseTo(20, 0);
  expect(r2.x).toBeCloseTo(r1.x, 5);
  // Undo: back to the moved size, then to the start position; redo again
  await page.click('#btnUndo');
  await saved(page, d => d.sides.front.els[0].w === 24);
  await page.click('#btnUndo');
  await saved(page, d => Math.abs(d.sides.front.els[0].x - r0.x) < 1e-6);
  await page.click('#btnRedo');
  await saved(page, d => Math.abs(d.sides.front.els[0].x - r1.x) < 1e-6);
});

test('dragging snaps to the card centre', async ({ page }) => {
  await blank(page);
  await page.click('[data-add="ellipse"]');
  await saved(page, d => d.sides.front.els.length === 1);
  const e = (await els(page))[0];
  const p = await at(page, e.x + e.w / 2, e.y + e.h / 2);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 15 * p.k, p.y, { steps: 5 });
  // 1 mm left of the centre line plus 15 mm: no snap; back to 0.6 mm off centre: snaps
  await page.mouse.move(p.x + 0.6 * p.k, p.y, { steps: 5 });
  await page.mouse.up();
  await saved(page, d => Math.abs(d.sides.front.els[0].x + d.sides.front.els[0].w / 2 - 42.5) < 1e-6);
});

test('keyboard: arrows move, Delete removes, Escape clears the selection', async ({ page }) => {
  await blank(page);
  await page.click('[data-add="line"]');
  await saved(page, d => d.sides.front.els.length === 1);
  const x0 = (await els(page))[0].x;
  await page.focus('#cv');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await saved(page, d => Math.abs(d.sides.front.els[0].x - (x0 + 5.5)) < 0.06);
  await page.keyboard.press('Escape');
  await expect(page.locator('#selBox')).toBeHidden();
  await item(page, 'Linie').click();
  await page.focus('#cv');
  await page.keyboard.press('Delete');
  await saved(page, d => d.sides.front.els.length === 0);
  await expect(page.locator('#elList button')).toHaveCount(0);
});

test('PNG of the back side: print size at 300 and 600 dpi, background colour', async ({ page }) => {
  await page.click('label:has(input[name="side"][value="back"])');
  await expect(item(page, 'Muster & Partner')).toBeVisible();
  const a = await download(page, '#btnPng');
  expect(a.name).toBe('visitenkarte-rueckseite.png');
  // 85 × 55 mm at 300 dpi: 85 / 25.4 × 300 = 1003.9, 55 / 25.4 × 300 = 649.6
  expect(await png(page, a.buf)).toEqual({ w: 1004, h: 650, rgb: [0x0f, 0x76, 0x6e] });
  await expect(page.locator('#status')).toHaveText('Bild gespeichert (1004 × 650 Pixel).');
  await page.click('label:has(input[name="dpi"][value="600"])');
  await page.locator('#bgColor').fill('#ff8800');
  const b = await download(page, '#btnPng');
  expect(await png(page, b.buf)).toEqual({ w: 2008, h: 1299, rgb: [255, 136, 0] });
});

test('A4 PDF: 10 cards per page, back as page 2, crop marks; without a back only one page', async ({ page }) => {
  await expect(page.locator('#btnPdf')).toHaveText('PDF (A4, 10 Karten)');
  await expect(page.locator('#optBack')).toBeChecked();
  const a = await download(page, '#btnPdf');
  expect(a.name).toBe('visitenkarten-a4.pdf');
  const pdf = readPdf(a.buf);
  expect(pdf.pages).toHaveLength(2);
  for (const p of pdf.pages) {
    // A4 in points: 210 / 25.4 × 72 = 595.28, 297 / 25.4 × 72 = 841.89
    expect(p.width).toBeCloseTo(595.28, 1);
    expect(p.height).toBeCloseTo(841.89, 1);
    expect(p.images).toBe(10);
    // Crop marks: 3 vertical cutting lines (2 columns) and 6 horizontal (5 rows), each marked on both sides
    expect(p.lines).toBe(2 * 3 + 2 * 6);
  }
  expect(pdf.images).toEqual([{ w: 1004, h: 650 }, { w: 1004, h: 650 }]);
  await expect(page.locator('#status')).toHaveText('PDF gespeichert (2 Seite(n), 10 Karten je Seite).');

  // With a 4 mm gap: 2 × 4 cards ((297 − 16 + 4) / 59 = 4.8), no marks; minimal template has no back
  await page.check('#optGap');
  await page.uncheck('#optMarks');
  await expect(page.locator('#btnPdf')).toHaveText('PDF (A4, 8 Karten)');
  page.once('dialog', d => d.accept());
  await page.selectOption('#tpl', 'minimal');
  await page.click('#tplApply');
  await expect(page.locator('#optBack')).toBeDisabled();
  const b = readPdf((await download(page, '#btnPdf')).buf);
  expect(b.pages.map(p => [p.images, p.lines])).toEqual([[8, 0]]);
});

test('portrait: the card turns, elements stay on the card', async ({ page }) => {
  await page.click('label:has(input[name="orient"][value="portrait"])');
  await saved(page, d => d.orient === 'portrait');
  for (const e of await els(page)) {
    expect(e.x).toBeGreaterThanOrEqual(-1e-6);
    expect(e.x + e.w).toBeLessThanOrEqual(55 + 1e-6);
    expect(e.y + e.h).toBeLessThanOrEqual(85 + 1e-6);
  }
  await expect(page.locator('#btnPdf')).toHaveText('PDF (A4, 9 Karten)');
  const a = await download(page, '#btnPng');
  expect(await png(page, a.buf)).toMatchObject({ w: 650, h: 1004 });
});

test('QR code as a contact (vCard) can be scanned, details taken from the card texts', async ({ page }) => {
  await page.click('[data-add="qr"]');
  await page.click('label:has(input[name="pQrMode"][value="vcard"])');
  await page.fill('#vcN', 'Erika Mustermann');
  await page.fill('#vcOrg', 'Muster; Partner');
  await page.click('#vcFill');
  await expect(page.locator('#vcTel')).toHaveValue('+49 30 1234567');
  await expect(page.locator('#vcEmail')).toHaveValue('erika@example.com');
  await expect(page.locator('#vcUrl')).toHaveValue('www.example.com');
  await page.fill('#pW', '40');
  await page.fill('#pY', '7');
  await page.click('#aCenter');
  const { buf } = await download(page, '#btnPng');
  await page.addScriptTag({ url: new URL('/assets/vendor/zxing-library/index.min.js', page.url()).href });
  const text = await page.evaluate(async b64 => {
    const Z = window.ZXing, img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    // Only the code (with its own white margin): 40 mm square at 22.5 / 7 mm, 300 dpi
    const px = mm => Math.round(mm / 25.4 * 300), c = document.createElement('canvas');
    c.width = c.height = px(40);
    c.getContext('2d').drawImage(img, px(22.5), px(7), px(40), px(40), 0, 0, px(40), px(40));
    const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)));
    return new Z.QRCodeReader().decode(bitmap, new Map([[Z.DecodeHintType.CHARACTER_SET, 'UTF-8'], [Z.DecodeHintType.PURE_BARCODE, true]])).getText();
  }, buf.toString('base64'));
  expect(text.split('\r\n')).toEqual([
    'BEGIN:VCARD', 'VERSION:3.0', 'N:Mustermann;Erika;;;', 'FN:Erika Mustermann', 'ORG:Muster\\; Partner',
    'TEL;TYPE=WORK,VOICE:+49 30 1234567', 'EMAIL;TYPE=INTERNET:erika@example.com', 'URL:https://www.example.com', 'END:VCARD',
  ]);
});

test('a picture is scaled into the card and survives a reload', async ({ page }) => {
  const pngBuf = Buffer.from(await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 200;
    const x = c.getContext('2d');
    x.fillStyle = '#2244cc'; x.fillRect(0, 0, 400, 200);
    return c.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await blank(page);
  await page.locator('#pickImg').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: pngBuf });
  await saved(page, d => d.sides.front.els.length === 1);
  const img = (await els(page))[0];
  // 2:1 picture in at most 45 % of the width and 60 % of the height: 38.25 × 19.125 mm, centred
  expect(img.w).toBeCloseTo(85 * 0.45, 5);
  expect(img.h).toBeCloseTo(85 * 0.45 / 2, 5);
  await page.reload();
  await expect(item(page, 'Bild')).toBeVisible();
  const { buf } = await download(page, '#btnPng');
  expect((await png(page, buf, [502, 325])).rgb).toEqual([0x22, 0x44, 0xcc]);
  // Removing it and reloading clears the kept file as well
  await item(page, 'Bild').click();
  await page.click('#aDel');
  await saved(page, d => d.sides.front.els.length === 0);
  await page.reload();
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes('file:business-card')
    ? (await (await caches.open('file:business-card')).keys()).length : 0)).toBe(0);
});

test('works offline: PDF library cached on first use', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  expect(readPdf((await download(page, '#btnPdf')).buf).pages).toHaveLength(2);
  await context.setOffline(false);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('template texts, labels and file names in English', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(item(page, 'Alex Example')).toBeVisible();
    await expect(page.locator('#btnPdf')).toHaveText('PDF (A4, 10 cards)');
    expect((await download(page, '#btnPng')).name).toBe('business-card-front.png');
  });
});
