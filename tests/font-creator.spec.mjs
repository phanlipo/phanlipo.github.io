// Schrift-Baukasten: draw characters, live font in the sample text, valid TTF download, eraser/undo, extra characters.
import { readFileSync } from 'node:fs';
import { test, expect, openMenu, onDialog, switchLang } from './helpers.mjs';

const LS = 'font-creator.font.v1';

/** Drags across the drawing area; coordinates as fractions (0…1) of its size */
async function stroke(page, x1, y1, x2, y2) {
  const box = await page.locator('#pad').boundingBox();
  await page.mouse.move(box.x + x1 * box.width, box.y + y1 * box.height);
  await page.mouse.down();
  await page.mouse.move(box.x + x2 * box.width, box.y + y2 * box.height, { steps: 12 });
  await page.mouse.up();
}

/** Width of text in the live font at 100 px, once the browser has the font (null while it is missing) */
const liveWidth = (page, text) => page.evaluate(async text => {
  await document.fonts.ready;
  if (![...document.fonts].some(f => f.family.replace(/"/g, '') === 'FontCreatorLive' && f.status === 'loaded')) return null;
  const c = document.createElement('canvas').getContext('2d');
  c.font = '100px FontCreatorLive, monospace';
  return c.measureText(text).width;
}, text);

/** Minimal TrueType reader for the checks below: table directory, cmap format 4, name strings */
function readTtf(buf) {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const tables = {};
  for (let i = 0; i < v.getUint16(4); i++) {
    const o = 12 + i * 16;
    tables[String.fromCharCode(...buf.subarray(o, o + 4))] = { offset: v.getUint32(o + 8), length: v.getUint32(o + 12) };
  }
  const cm = tables.cmap.offset, sub = cm + v.getUint32(cm + 8), seg = v.getUint16(sub + 6) / 2;
  const cmap = {};
  for (let i = 0; i < seg; i++) {
    const end = v.getUint16(sub + 14 + i * 2), start = v.getUint16(sub + 16 + seg * 2 + i * 2), delta = v.getInt16(sub + 16 + seg * 4 + i * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) cmap[String.fromCharCode(c)] = (c + delta) & 0xffff;
  }
  const nm = tables.name.offset, strOff = nm + v.getUint16(nm + 4), names = {};
  for (let i = 0; i < v.getUint16(nm + 2); i++) {
    const r = nm + 6 + i * 12, len = v.getUint16(r + 8), off = strOff + v.getUint16(r + 10);
    let s = ''; for (let k = 0; k < len; k += 2) s += String.fromCharCode(v.getUint16(off + k));
    names[v.getUint16(r + 6)] = s;
  }
  // Whole-file checksum must be 0xB1B0AFBA (checkSumAdjustment in head is set for that)
  let sum = 0;
  for (let i = 0; i < buf.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  const hm = tables.hmtx.offset;
  return { version: v.getUint32(0), tables, cmap, names, sum, advance: gid => v.getUint16(hm + gid * 4), numGlyphs: v.getUint16(tables.maxp.offset + 4) };
}

test.beforeEach(async ({ page }) => { await page.goto('/font-creator/'); });

test('starts empty on A with the German sample text', async ({ page }) => {
  await expect(page.locator('#grid [data-char="A"]')).toHaveAttribute('aria-pressed', 'true');
  // 29 capitals (with ÄÖÜ), 30 small letters (with äöüß), 19 digits and signs, 19 punctuation marks
  await expect(page.locator('#progress')).toHaveText('0 von 97 Zeichen gezeichnet');
  await expect(page.locator('#grid button')).toHaveCount(29);
  await expect(page.locator('#sample')).toHaveValue(/^Franz jagt/);
  await expect(page.locator('#grid .drawn')).toHaveCount(0);
});

test('a drawn stroke becomes a glyph of the live font with the expected width', async ({ page }) => {
  // Horizontal line from 20 % to 80 % of the box: 600 units long, 80 wide (default) → ink 680 units,
  // plus the default gap of 50 units on each side = 780 units = 78 px at 100 px font size
  await stroke(page, 0.2, 0.5, 0.8, 0.5);
  await expect(page.locator('#grid [data-char="A"]')).toHaveClass(/drawn/);
  await expect(page.locator('#progress')).toHaveText('1 von 97 Zeichen gezeichnet');
  // The font of the empty start is loaded first; wait for the rebuilt one
  await expect.poll(() => liveWidth(page, 'A')).toBeGreaterThan(76);
  expect(await liveWidth(page, 'A')).toBeLessThan(80);
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
  expect(saved.glyphs.A).toHaveLength(1);
  expect(saved.glyphs.A[0][0]).toBe(80);
  // Only a straight line is left after simplifying: width, start and end point
  expect(saved.glyphs.A[0]).toHaveLength(5);
  // Still there after a reload
  await page.reload();
  await expect(page.locator('#grid [data-char="A"]')).toHaveClass(/drawn/);
  await expect.poll(() => liveWidth(page, 'A')).toBeGreaterThan(76);
});

test('downloads a valid TrueType file with the drawn characters and the chosen name', async ({ page }) => {
  await stroke(page, 0.3, 0.1, 0.3, 0.8);
  await page.click('#grid [data-char="B"]');
  await stroke(page, 0.2, 0.5, 0.7, 0.5);
  await page.fill('#fontName', 'Meine Hand');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnDownload')]);
  expect(download.suggestedFilename()).toBe('Meine-Hand.ttf');
  const ttf = readTtf(readFileSync(await download.path()));
  expect(ttf.version).toBe(0x00010000);
  expect(Object.keys(ttf.tables).sort()).toEqual(['OS/2', 'cmap', 'glyf', 'head', 'hhea', 'hmtx', 'loca', 'maxp', 'name', 'post']);
  expect(ttf.sum).toBe(0xB1B0AFBA);
  // .notdef, space, A, B
  expect(ttf.numGlyphs).toBe(4);
  expect(ttf.cmap).toEqual({ ' ': 1, A: 2, B: 3 });
  expect(ttf.names[1]).toBe('Meine Hand');
  expect(ttf.names[6]).toBe('MeineHand-Regular');
  // A: vertical line of width 80 → ink 80 + gaps 2 × 50; B: 500 long + 80 → 580 + 100; space 300
  expect(ttf.advance(1)).toBe(300);
  expect(ttf.advance(2)).toBeGreaterThanOrEqual(178);
  expect(ttf.advance(2)).toBeLessThanOrEqual(182);
  expect(ttf.advance(3)).toBeGreaterThanOrEqual(676);
  expect(ttf.advance(3)).toBeLessThanOrEqual(684);
});

test('a browser that refuses to share .ttf (Chrome on Android) saves the font instead', async ({ page }) => {
  // Chrome's canShare() says yes, share() then rejects the type with NotAllowedError
  await page.addInitScript(() => {
    navigator.canShare = () => true;
    navigator.share = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
  });
  await page.reload();
  await stroke(page, 0.3, 0.1, 0.3, 0.8);
  await page.fill('#fontName', 'Meine Hand');
  await expect(page.locator('#btnShare')).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnShare')]);
  expect(download.suggestedFilename()).toBe('Meine-Hand.ttf');
  await expect(page.locator('#toast')).toContainText('kann Schriftdateien nicht teilen');
  await expect(page.locator('#btnShare')).toBeHidden();
});

test('download without any drawn character says what is missing', async ({ page }) => {
  await page.click('#btnDownload');
  await expect(page.locator('#dlError')).toHaveText('Zeichne zuerst mindestens ein Zeichen.');
});

test('eraser removes a whole stroke, undo brings it back', async ({ page }) => {
  await stroke(page, 0.2, 0.3, 0.8, 0.3);
  await stroke(page, 0.2, 0.7, 0.8, 0.7);
  const strokes = () => page.evaluate(k => JSON.parse(localStorage.getItem(k)).glyphs.A?.length ?? 0, LS);
  expect(await strokes()).toBe(2);
  await page.click('[data-tool="eraser"]');
  await stroke(page, 0.5, 0.25, 0.5, 0.35);
  expect(await strokes()).toBe(1);
  await page.click('#btnUndo');
  expect(await strokes()).toBe(2);
  await page.click('#btnUndo');
  await page.click('#btnUndo');
  expect(await strokes()).toBe(0);
  await expect(page.locator('#btnUndo')).toBeDisabled();
});

test('deleting a character offers undo', async ({ page }) => {
  await stroke(page, 0.2, 0.3, 0.8, 0.3);
  await page.click('#btnClear');
  await expect(page.locator('#grid [data-char="A"]')).not.toHaveClass(/drawn/);
  await page.getByRole('button', { name: 'Rückgängig' }).last().click();
  await expect(page.locator('#grid [data-char="A"]')).toHaveClass(/drawn/);
});

test('characters are picked by group, arrows and keyboard; the sample lists what is missing', async ({ page }) => {
  await page.click('#groups [data-group="digits"]');
  await expect(page.locator('#grid [data-char="0"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#btnPrev');
  await expect(page.locator('#grid [data-char="ß"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#btnNext');
  await page.click('#btnNext');
  await expect(page.locator('#grid [data-char="1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#pad').focus();
  await page.keyboard.press('g');
  await expect(page.locator('#grid [data-char="g"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pad')).toHaveAttribute('aria-label', 'Zeichenfläche für g');
  await page.fill('#sample', 'gag');
  await expect(page.locator('#missing')).toHaveText('Im Beispiel noch nicht gezeichnet: g a');
  await stroke(page, 0.3, 0.4, 0.6, 0.4);
  await expect(page.locator('#missing')).toHaveText('Im Beispiel noch nicht gezeichnet: a');
});

test('an extra character can be added from the menu', async ({ page }) => {
  await onDialog(page, d => d.accept('Ω'), { once: true });
  await openMenu(page);
  await page.click('#btnAddChar');
  await expect(page.locator('#grid [data-char="Ω"]')).toHaveAttribute('aria-pressed', 'true');
  await stroke(page, 0.2, 0.5, 0.8, 0.5);
  await page.reload();
  await page.click('#groups [data-group="symbols"]');
  await expect(page.locator('#grid [data-char="Ω"]')).toHaveClass(/drawn/);
});

test('delete all asks first', async ({ page }) => {
  await stroke(page, 0.2, 0.5, 0.8, 0.5);
  await onDialog(page, d => d.dismiss(), { once: true });
  await openMenu(page);
  await page.click('#btnClearAll');
  await expect(page.locator('#progress')).toHaveText('1 von 97 Zeichen gezeichnet');
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnClearAll');
  await expect(page.locator('#progress')).toHaveText('0 von 97 Zeichen gezeichnet');
});

test('English: default name and sample follow the language, stored values stay untranslated', async ({ page }) => {
  await switchLang(page, 'en');
  await expect(page.locator('#sample')).toHaveValue(/^The quick brown fox/);
  await expect(page.locator('#fontName')).toHaveAttribute('placeholder', 'My Font');
  await expect(page.locator('#progress')).toHaveText('0 of 97 characters drawn');
  const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || '{}'), LS);
  expect(saved.sample ?? null).toBeNull();
});
