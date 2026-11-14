// Visitenkarten: editing, dragging and resizing on the canvas, undo, PNG size and colours, A4 PDF
// (pages, cards per page, crop marks – read with an own minimal parser), vCard QR code (decoded with
// ZXing-JS, independent of the generator), pictures kept over a reload, offline.
import { readFileSync } from 'node:fs';
import { inflateSync, crc32 } from 'node:zlib';
import { test, expect, mockLaunchQueue } from './helpers.mjs';

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

/* ---------- Templates ---------- */

/** PNG chunks read independently of the app: [{ type, data }] (CRC checked) */
function chunks(buf) {
  expect([...buf.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const out = [];
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o), type = buf.toString('latin1', o + 4, o + 8), data = buf.subarray(o + 8, o + 8 + len);
    expect(buf.readUInt32BE(o + 8 + len), type).toBe(crc32(buf.subarray(o + 4, o + 8 + len)));
    out.push({ type, data });
    o += 12 + len;
  }
  return out;
}
/** The same PNG with the data of chunk bcRd replaced (valid CRC) */
function withData(buf, json) {
  const parts = [buf.subarray(0, 8)];
  for (const c of chunks(buf)) {
    const data = c.type === 'bcRd' ? Buffer.from(json) : c.data;
    const head = Buffer.alloc(8); head.writeUInt32BE(data.length); head.write(c.type, 4, 'latin1');
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
    parts.push(head, data, crc);
  }
  return Buffer.concat(parts);
}
const blue = async page => Buffer.from(await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#2244cc'; x.fillRect(0, 0, 400, 200);
  return c.toDataURL('image/png').split(',')[1];
}), 'base64');
const forgetAll = page => page.evaluate(async () => {
  localStorage.clear();
  for (const k of await caches.keys()) if (k.startsWith('file:')) await caches.delete(k);
});

test('own template: save in the app, load it again after changes, overwrite, delete', async ({ page }) => {
  await page.fill('#tplName', 'Firma');
  await page.click('#tplSave');
  await expect(page.locator('#tplStatus')).toHaveText('Vorlage „Firma“ gespeichert.');
  await expect(page.locator('#tpl')).toHaveValue(/^own:/);
  await expect(page.locator('#tplDel')).toBeVisible();
  // Change the card: blank template
  page.once('dialog', d => d.accept());
  await page.selectOption('#tpl', 'blank');
  await expect(page.locator('#tplDel')).toBeHidden();
  await page.click('#tplApply');
  await saved(page, d => d.sides.front.els.length === 0);
  // After a reload the own template is still in the list and brings everything back
  await page.reload();
  await expect(page.locator('#tpl optgroup#tplOwn option')).toHaveText(['Firma']);
  await page.selectOption('#tpl', { label: 'Firma' });
  // The card is empty: no question before loading
  await page.click('#tplApply');
  await expect(page.locator('#tplStatus')).toHaveText('Vorlage „Firma“ geladen.');
  await expect(item(page, 'Erika Mustermann')).toBeVisible();
  expect((await design(page)).sides.back.bg).toBe('#0f766e');
  // Same name: asks, then overwrites (one entry)
  await item(page, 'Erika Mustermann').click();
  await page.fill('#pText', 'Max');
  page.once('dialog', d => { expect(d.message()).toBe('Es gibt schon eine Vorlage „Firma“. Überschreiben?'); d.accept(); });
  await page.click('#tplSave');
  const own = await page.evaluate(() => JSON.parse(localStorage.getItem('business-card.templates.v1')));
  expect(own).toHaveLength(1);
  expect(own[0].design.sides.front.els.some(e => e.text === 'Max')).toBe(true);
  page.once('dialog', d => d.accept());
  await page.click('#tplDel');
  await expect(page.locator('#tplStatus')).toHaveText('Vorlage „Firma“ gelöscht.');
  await expect(page.locator('#tplOwn')).toHaveCount(0);
});

test('template file: a picture of both sides with the whole design inside, opened on another device', async ({ page }) => {
  await page.locator('#pickImg').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await blue(page) });
  await saved(page, d => d.sides.front.els.some(e => e.type === 'image'));
  await item(page, 'Erika Mustermann').click();
  await page.fill('#pText', 'Jörg Groß · „Köln“');
  await page.fill('#tplName', 'Jörg Groß');
  const { name, buf } = await download(page, '#tplFile');
  expect(name).toBe('vorlage-jorg-gross.png');
  await expect(page.locator('#tplStatus')).toHaveText(/^Vorlagendatei gespeichert \(\d+ KB\)\.$/);
  // A normal picture: front and back at 200 dpi with a 4 mm grey frame
  // (85 mm → 669 px, 55 mm → 433 px, 4 mm → 31 px): 669 + 62 wide, 2 × 433 + 3 × 31 high
  expect(await png(page, buf, [5, 5])).toEqual({ w: 731, h: 959, rgb: [0xe5, 0xe7, 0xeb] });
  const data = JSON.parse(chunks(buf).find(c => c.type === 'bcRd').data.toString('utf8'));
  expect(data).toMatchObject({ format: 'phanlipo-business-card', formatVersion: 1, name: 'Jörg Groß' });
  expect(Object.keys(data.images)).toHaveLength(1);

  // "Another device": nothing stored
  await forgetAll(page);
  await page.reload();
  await expect(item(page, 'Erika Mustermann')).toBeVisible();
  page.once('dialog', d => { expect(d.message()).toBe('Vorlage „Jörg Groß“ laden? Sie ersetzt die aktuelle Karte.'); d.accept(); });
  await page.locator('#pickTpl').setInputFiles({ name, mimeType: 'image/png', buffer: buf });
  await expect(page.locator('#tplStatus')).toHaveText('Vorlage „Jörg Groß“ geladen.');
  await expect(item(page, 'Jörg Groß · „Köln“')).toBeVisible();
  await expect(page.locator('#tplName')).toHaveValue('Jörg Groß');
  // The picture is back (kept under a new id) and printed in the middle of the card
  const d = await design(page);
  const img = d.sides.front.els.find(e => e.type === 'image');
  expect(img.img).not.toBe(Object.keys(data.images)[0]);
  const out = await download(page, '#btnPng');
  expect((await png(page, out.buf, [502, 325])).rgb).toEqual([0x22, 0x44, 0xcc]);
  await page.reload();
  expect((await png(page, (await download(page, '#btnPng')).buf, [502, 325])).rgb).toEqual([0x22, 0x44, 0xcc]);
});

test('template files: a plain picture, broken data and a newer version are refused with a message', async ({ page }) => {
  const file = (await download(page, '#tplFile')).buf;
  const open = async buffer => {
    await page.locator('#pickTpl').setInputFiles({ name: 'x.png', mimeType: 'image/png', buffer });
  };
  await open(await blue(page));
  await expect(page.locator('#tplStatus')).toHaveText(/^Dieses Bild enthält keine Visitenkarten-Vorlage/);
  await open(withData(file, '{"format":"phanlipo-business-card"'));
  await expect(page.locator('#tplStatus')).toHaveText('Die Vorlagendatei ist beschädigt oder stammt nicht aus dieser App.');
  await open(withData(file, JSON.stringify({ format: 'phanlipo-business-card', formatVersion: 2, design: {} })));
  await expect(page.locator('#tplStatus')).toHaveText(/^Die Vorlage stammt aus einer neueren Version/);
  // Unknown elements and values are dropped or replaced, the rest loads
  page.once('dialog', d => d.accept());
  await open(withData(file, JSON.stringify({ format: 'phanlipo-business-card', formatVersion: 1, name: 'Fremd', images: {},
    design: { format: 'xx', orient: 'portrait', sides: { front: { bg: 'red', els: [
      { type: 'script', x: 1 }, { type: 'text', text: 'Hallo', size: 1e9, color: 'javascript:1', x: 'a' },
      { type: 'image', img: 'img-gone', x: 5, y: 5, w: 10, h: 10 },
    ] } } } })));
  await expect(page.locator('#tplStatus')).toHaveText('Vorlage „Fremd“ geladen. 1 Bild(er) der Vorlage fehlen.');
  const d = await design(page);
  expect(d).toMatchObject({ format: '85x55', orient: 'portrait' });
  expect(d.sides.front.bg).toBe('#ffffff');
  expect(d.sides.front.els.map(e => e.type)).toEqual(['text', 'image']);
  expect(d.sides.front.els[0]).toMatchObject({ text: 'Hallo', size: 120, color: '#1f2937', x: 0 });
  expect(d.sides.back.els).toEqual([]);
});

test('shared to the app / opened with it: a template file loads, a photo is inserted', async ({ page }) => {
  const file = (await download(page, '#tplFile')).buf;
  await forgetAll(page);
  await mockLaunchQueue(page, [{ name: 'vorlage.png', mimeType: 'image/png', buffer: file }]);
  page.once('dialog', d => d.accept());
  await page.goto(`${URL_}?opened=1`);
  await expect(page.locator('#tplStatus')).toHaveText('Vorlage „Visitenkarte“ geladen.');
  expect(new URL(page.url()).search).toBe('');
});

test('a photo opened with the app becomes a picture on the card', async ({ page }) => {
  const photo = await blue(page);
  await mockLaunchQueue(page, [{ name: 'foto.png', mimeType: 'image/png', buffer: photo }]);
  await page.goto(`${URL_}?opened=1`);
  await expect(item(page, 'Bild')).toBeVisible();
  await expect(page.locator('#tplStatus')).toHaveText('');
});
