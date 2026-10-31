// Dokumentenscanner: synthetic "photos" (a rotated A4 sheet on a dark table, with a shadow and a
// black mark in its top left corner) are drawn in the browser. Checked: corner detection against the
// known corners, the PDF structure (parsed here, xref offsets verified) and the page images in it
// (decoded separately): straightened, mark position, shadow removed, black & white, order, rotation.
import { test, expect } from './helpers.mjs';

const URL_ = '/doc-scanner/';
const W = 1200, H = 900;

/**
 * Draws a test photo and returns { png (Buffer), corners (TL, TR, BR, BL normalised) }.
 * mark: 'tl' or 'br' – where the black square sits on the sheet. angle in degrees.
 */
async function photo(page, { angle = 8, mark = 'tl', shadow = true, scale = 1 } = {}) {
  const r = await page.evaluate(({ W, H, angle, mark, shadow, scale }) => {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#383b40'; g.fillRect(0, 0, W, H);
    // a little texture on the table
    for (let i = 0; i < 400; i++) { g.fillStyle = i % 2 ? '#30333a' : '#41444a'; g.fillRect((i * 97) % W, (i * 53) % H, 6, 6); }
    const pw = 540 * scale, ph = pw * Math.SQRT2, a = angle * Math.PI / 180, cx = W / 2, cy = H / 2;
    const at = (x, y) => ({ x: cx + (x - pw / 2) * Math.cos(a) - (y - ph / 2) * Math.sin(a), y: cy + (x - pw / 2) * Math.sin(a) + (y - ph / 2) * Math.cos(a) });
    g.save();
    g.translate(cx, cy); g.rotate(a); g.translate(-pw / 2, -ph / 2);
    g.fillStyle = '#ece9e2'; g.fillRect(0, 0, pw, ph);
    g.fillStyle = '#222';
    for (let y = ph * 0.3; y < ph * 0.85; y += ph * 0.03) g.fillRect(pw * 0.12, y, pw * 0.7, 3);
    const m = pw * 0.18;
    if (mark === 'tl') g.fillRect(pw * 0.08, pw * 0.08, m, m); else g.fillRect(pw * 0.92 - m, ph - pw * 0.08 - m, m, m);
    if (shadow) {
      const grad = g.createLinearGradient(0, 0, pw, 0);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.4)');
      g.fillStyle = grad; g.fillRect(0, 0, pw, ph);
    }
    g.restore();
    const corners = [at(0, 0), at(pw, 0), at(pw, ph), at(0, ph)].map(p => ({ x: p.x / W, y: p.y / H }));
    return { b64: c.toDataURL('image/png').split(',')[1], corners };
  }, { W, H, angle, mark, shadow, scale });
  return { png: Buffer.from(r.b64, 'base64'), corners: r.corners };
}

const file = (png, name = 'foto.png') => ({ name, mimeType: 'image/png', buffer: png });

async function addPhotos(page, files) {
  const before = await page.locator('#pages li').count();
  await page.setInputFiles('#inPick', files);
  await expect(page.locator('#pages li img[src^="blob:"]')).toHaveCount(before + files.length);
}

/** Minimal PDF reader: objects by number, xref offsets checked, page boxes and JPEG streams */
function parsePdf(buf) {
  const s = buf.toString('latin1');
  expect(s.startsWith('%PDF-1.')).toBe(true);
  expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
  const xrefAt = Number(s.match(/startxref\s+(\d+)\s+%%EOF\s*$/)[1]);
  expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref');
  const [, first, count] = s.slice(xrefAt).match(/^xref\s+(\d+) (\d+)\s/);
  const entries = s.slice(xrefAt).split('\n').slice(2, 2 + Number(count));
  const objs = {};
  entries.forEach((line, i) => {
    const n = Number(first) + i;
    if (!line.includes(' n')) return;
    const off = Number(line.slice(0, 10));
    // every offset points exactly at "<n> 0 obj"
    expect(s.slice(off, off + `${n} 0 obj`.length)).toBe(`${n} 0 obj`);
    const end = s.indexOf('endobj', off);
    const body = s.slice(off, end);
    const st = body.indexOf('stream\n');
    const dict = st >= 0 ? body.slice(0, st) : body;
    let stream = null;
    if (st >= 0) {
      const len = Number(dict.match(/\/Length (\d+)/)[1]);
      stream = buf.subarray(off + st + 7, off + st + 7 + len);
      expect(s.slice(off + st + 7 + len, off + st + 7 + len + 10)).toBe('\nendstream');
    }
    objs[n] = { dict, stream };
  });
  const trailer = s.slice(xrefAt).match(/trailer\s*<<([\s\S]*?)>>/)[1];
  const root = objs[Number(trailer.match(/\/Root (\d+) 0 R/)[1])];
  const pagesObj = objs[Number(root.dict.match(/\/Pages (\d+) 0 R/)[1])];
  const kids = [...pagesObj.dict.match(/\/Kids \[([^\]]*)\]/)[1].matchAll(/(\d+) 0 R/g)].map(m => Number(m[1]));
  expect(Number(pagesObj.dict.match(/\/Count (\d+)/)[1])).toBe(kids.length);
  const pages = kids.map(k => {
    const p = objs[k].dict;
    const box = p.match(/\/MediaBox \[([^\]]+)\]/)[1].split(' ').map(Number);
    const img = objs[Number(p.match(/\/Im0 (\d+) 0 R/)[1])];
    const content = objs[Number(p.match(/\/Contents (\d+) 0 R/)[1])].stream.toString('latin1');
    expect(img.dict).toContain('/Filter /DCTDecode');
    return {
      width: box[2], height: box[3], content,
      imgW: Number(img.dict.match(/\/Width (\d+)/)[1]), imgH: Number(img.dict.match(/\/Height (\d+)/)[1]),
      jpeg: img.stream,
    };
  });
  const infoRef = trailer.match(/\/Info (\d+) 0 R/);
  return { pages, info: infoRef ? objs[Number(infoRef[1])].dict : '' };
}

async function savePdf(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnPdf')]);
  const path = await dl.path();
  const { readFileSync } = await import('node:fs');
  return { name: dl.suggestedFilename(), pdf: parsePdf(readFileSync(path)) };
}

/** Decodes a JPEG and measures mean brightness in regions given as fractions [x0, y0, x1, y1] */
async function measure(page, jpeg, regions) {
  return page.evaluate(async ({ b64, regions }) => {
    const img = new Image(); img.src = 'data:image/jpeg;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const out = {};
    let extreme = 0, n = 0, sat = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3; n++;
      if (v < 50 || v > 205) extreme++;
      sat = Math.max(sat, Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]));
    }
    for (const [k, [x0, y0, x1, y1]] of Object.entries(regions)) {
      let sum = 0, cnt = 0;
      for (let y = Math.floor(y0 * c.height); y < Math.floor(y1 * c.height); y++)
        for (let x = Math.floor(x0 * c.width); x < Math.floor(x1 * c.width); x++) { const i = (y * c.width + x) * 4; sum += (d[i] + d[i + 1] + d[i + 2]) / 3; cnt++; }
      out[k] = sum / cnt;
    }
    return { ...out, extremeShare: extreme / n, width: c.width, height: c.height };
  }, { b64: jpeg.toString('base64'), regions });
}

// Regions on the straightened sheet (fractions of the page image)
const REGIONS = {
  markTL: [0.1, 0.06, 0.22, 0.14],       // black square top left (0.08…0.26 of the width)
  markBR: [0.78, 0.86, 0.9, 0.94],
  paperLeft: [0.02, 0.18, 0.1, 0.26],    // plain paper, light side
  paperRight: [0.88, 0.18, 0.97, 0.26],  // plain paper, shadow side
  cornerTL: [0, 0, 0.03, 0.02],
  cornerBR: [0.97, 0.98, 1, 1],
};

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto(URL_);
});

test('finds the corners of the sheet automatically', async ({ page }) => {
  const { png, corners } = await photo(page, { angle: 8 });
  await addPhotos(page, [file(png)]);
  await expect(page.locator('#addInfo')).toHaveText('1 Seite(n) hinzugefügt.');
  await page.click('#pages li .thumb');
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#edTitle')).toHaveText('Seite 1 von 1 zuschneiden');
  const found = await page.locator('.handle').evaluateAll(hs => hs.map(h => ({ x: parseFloat(h.style.left) / 100, y: parseFloat(h.style.top) / 100 })));
  for (let i = 0; i < 4; i++) {
    expect(Math.abs(found[i].x - corners[i].x), `corner ${i} x`).toBeLessThan(0.02);
    expect(Math.abs(found[i].y - corners[i].y), `corner ${i} y`).toBeLessThan(0.02);
  }
});

test('PDF: straightened A4 page, mark top left, shadow and table gone', async ({ page }) => {
  const { png } = await photo(page, { angle: 8 });
  await addPhotos(page, [file(png)]);
  const { name, pdf } = await savePdf(page);
  expect(name).toMatch(/^Scan \d{4}-\d{2}-\d{2}\.pdf$/);
  await expect(page.locator('#status')).toContainText('PDF gespeichert: 1 Seite(n)');
  expect(pdf.pages).toHaveLength(1);
  const p = pdf.pages[0];
  // A4 portrait in points, image fills it
  expect(p.width).toBeCloseTo(595.28, 1);
  expect(p.height).toBeCloseTo(841.89, 1);
  expect(p.imgH / p.imgW).toBeCloseTo(Math.SQRT2, 2);
  const [a, , , d, x, y] = p.content.match(/^q (.+) cm \/Im0 Do Q$/)[1].split(' ').map(Number);
  expect(Math.abs(a - 595.28)).toBeLessThan(1);
  expect(Math.abs(d - 841.89)).toBeLessThan(1);
  expect(Math.abs(x) + Math.abs(y)).toBeLessThan(1);
  // Never larger than the sheet in the photo (~760 px tall)
  expect(p.imgH).toBeLessThanOrEqual(800);
  const m = await measure(page, p.jpeg, REGIONS);
  expect(m.markTL).toBeLessThan(80);
  expect(m.markBR).toBeGreaterThan(200);
  // colour filter: paper white on both sides – the shadow (40 % darker on the right) is evened out
  expect(m.paperLeft).toBeGreaterThan(235);
  expect(m.paperRight).toBeGreaterThan(235);
  expect(Math.abs(m.paperLeft - m.paperRight)).toBeLessThan(12);
  // no dark table in the corners
  expect(m.cornerTL).toBeGreaterThan(180);
  expect(m.cornerBR).toBeGreaterThan(180);
});

test('original filter keeps the shadow; black & white has only black and white', async ({ page }) => {
  const { png } = await photo(page);
  await addPhotos(page, [file(png)]);
  await page.check('input[name="filterAll"][value="original"]', { force: true });
  let m = await measure(page, (await savePdf(page)).pdf.pages[0].jpeg, REGIONS);
  expect(m.paperLeft - m.paperRight).toBeGreaterThan(50);

  await page.check('input[name="filterAll"][value="bw"]', { force: true });
  m = await measure(page, (await savePdf(page)).pdf.pages[0].jpeg, REGIONS);
  expect(m.extremeShare).toBeGreaterThan(0.98);
  expect(m.markTL).toBeLessThan(40);
  expect(m.paperRight).toBeGreaterThan(240);

  await page.check('input[name="filterAll"][value="gray"]', { force: true });
  m = await measure(page, (await savePdf(page)).pdf.pages[0].jpeg, REGIONS);
  expect(m.paperRight).toBeGreaterThan(230);
});

test('sort, rotate and delete pages; order is kept in the PDF', async ({ page }) => {
  const a = await photo(page, { mark: 'tl' }), b = await photo(page, { mark: 'br', angle: -5 });
  await addPhotos(page, [file(a.png, 'a.png'), file(b.png, 'b.png')]);
  await expect(page.locator('#pageCount')).toHaveText('2');
  // first page: "earlier" disabled, last page: "later" disabled
  await expect(page.getByRole('button', { name: 'Seite 1 nach vorne' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Seite 2 nach hinten' })).toBeDisabled();
  await page.getByRole('button', { name: 'Seite 2 nach vorne' }).click();
  let pdf = (await savePdf(page)).pdf;
  expect(pdf.pages).toHaveLength(2);
  let first = await measure(page, pdf.pages[0].jpeg, REGIONS), second = await measure(page, pdf.pages[1].jpeg, REGIONS);
  expect(first.markBR).toBeLessThan(80);   // b is first now
  expect(second.markTL).toBeLessThan(80);

  // rotate page 2 (a) to the right: landscape A4, mark now top right
  await page.getByRole('button', { name: 'Seite 2 zuschneiden' }).click();
  await page.click('#edRotR');
  await page.click('#edDone');
  await expect(page.locator('#editor')).toBeHidden();
  pdf = (await savePdf(page)).pdf;
  const rot = pdf.pages[1];
  expect(rot.width).toBeCloseTo(841.89, 1);
  expect(rot.height).toBeCloseTo(595.28, 1);
  expect(rot.imgW).toBeGreaterThan(rot.imgH);
  const m = await measure(page, rot.jpeg, { topRight: [0.86, 0.1, 0.94, 0.22], topLeft: [0.06, 0.1, 0.14, 0.22] });
  expect(m.topRight).toBeLessThan(80);
  expect(m.topLeft).toBeGreaterThan(200);

  await page.getByRole('button', { name: 'Seite 1 löschen' }).click();
  await expect(page.locator('#pageCount')).toHaveText('1');
  pdf = (await savePdf(page)).pdf;
  expect(pdf.pages).toHaveLength(1);
  expect(pdf.pages[0].width).toBeCloseTo(841.89, 1);
  await page.getByRole('button', { name: 'Seite 1 löschen' }).click();
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#btnPdf')).toBeDisabled();
});

test('corners can be moved by dragging and with the keyboard', async ({ page }) => {
  const { png } = await photo(page);
  await addPhotos(page, [file(png)]);
  await page.click('#pages li .thumb');
  await page.click('#edFull');
  const pos = i => page.locator('.handle').nth(i).evaluate(h => [parseFloat(h.style.left), parseFloat(h.style.top)]);
  expect(await pos(0)).toEqual([0, 0]);
  expect(await pos(2)).toEqual([100, 100]);
  // drag the top left corner by a quarter of the image
  const stage = await page.locator('#stage').boundingBox();
  const h0 = await page.locator('.handle').nth(0).boundingBox();
  await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2);
  await page.mouse.down();
  await page.mouse.move(h0.x + h0.width / 2 + stage.width / 4, h0.y + h0.height / 2 + stage.height / 4, { steps: 5 });
  await expect(page.locator('#loupe')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('#loupe')).toBeHidden();
  const [x, y] = await pos(0);
  expect(x).toBeCloseTo(25, 0);
  expect(y).toBeCloseTo(25, 0);
  await page.locator('.handle').nth(0).focus();
  await page.keyboard.press('Shift+ArrowRight');
  expect((await pos(0))[0]).toBeCloseTo(27, 0);
  // "Automatic" brings back the detected corners
  await page.click('#edAuto');
  expect((await pos(0))[0]).toBeGreaterThan(20);
  expect((await pos(0))[0]).toBeLessThan(40);
  // Escape closes the editor
  await page.keyboard.press('Escape');
  await expect(page.locator('#editor')).toBeHidden();
});

test('the whole image is used when no sheet is found; a non-image is rejected', async ({ page }) => {
  const plain = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 400; c.height = 300;
    const g = c.getContext('2d'); g.fillStyle = '#777'; g.fillRect(0, 0, 400, 300);
    return c.toDataURL('image/png').split(',')[1];
  });
  await addPhotos(page, [file(Buffer.from(plain, 'base64'))]);
  await expect(page.locator('#addInfo')).toContainText('Ecken nicht sicher erkannt');
  await page.click('#pages li .thumb');
  await expect(page.locator('#edAuto')).toBeDisabled();
  expect(await page.locator('.handle').nth(2).evaluate(h => [h.style.left, h.style.top])).toEqual(['100%', '100%']);
  await page.click('#edDone');

  await page.setInputFiles('#inPick', { name: 'notiz.png', mimeType: 'image/png', buffer: Buffer.from('kein Bild') });
  await expect(page.locator('.toast')).toContainText('„notiz.png“ konnte nicht gelesen werden');
  await expect(page.locator('#pageCount')).toHaveText('1');
});

test('settings are kept; file name, page size and quality reach the PDF', async ({ page }) => {
  const { png } = await photo(page);
  await addPhotos(page, [file(png)]);
  await page.check('input[name="filterAll"][value="gray"]', { force: true });
  await page.selectOption('#pageSize', 'fit');
  await page.selectOption('#quality', '150');
  await page.fill('#fileName', 'Befund Kinderarzt: U7a');
  const { name, pdf } = await savePdf(page);
  // characters that file systems refuse are replaced
  expect(name).toBe('Befund Kinderarzt- U7a.pdf');
  // title as UTF-16BE hex string: "Bef" = 0042 0065 0066 (umlauts: see below)
  expect(pdf.info).toMatch(/\/Title <FEFF004200650066/);
  const p = pdf.pages[0];
  // "same as image": page = image size at 150 dpi
  expect(p.width).toBeCloseTo(p.imgW / 150 * 72, 1);
  expect(p.height).toBeCloseTo(p.imgH / 150 * 72, 1);

  // umlaut in the title (ä = 00E4); the download name keeps it too (headless Chromium alone
  // replaces non-ASCII download names with "download", so it is not checked here)
  await page.fill('#fileName', 'Kinderärztin');
  expect((await savePdf(page)).pdf.info).toContain('/Title <FEFF004B0069006E00640065007200E4');

  await page.reload();
  await expect(page.locator('input[name="filterAll"][value="gray"]')).toBeChecked();
  await expect(page.locator('#pageSize')).toHaveValue('fit');
  await expect(page.locator('#quality')).toHaveValue('150');
  await expect(page.locator('#pageCount')).toHaveText('0');
});

test('the camera button opens the crop view after the photo', async ({ page }) => {
  await expect(page.locator('#inCamera')).toHaveAttribute('capture', 'environment');
  const { png } = await photo(page);
  await page.setInputFiles('#inCamera', file(png));
  await expect(page.locator('#editor')).toBeVisible();
  await page.click('input[name="filterPage"][value="bw"]', { force: true });
  await page.click('#edDone');
  const m = await measure(page, (await savePdf(page)).pdf.pages[0].jpeg, REGIONS);
  expect(m.extremeShare).toBeGreaterThan(0.98);
  // the filter of all pages did not change
  await expect(page.locator('input[name="filterAll"][value="color"]')).toBeChecked();
});

test('share target: several photos shared to the installed app become pages in that order', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
  expect(manifest.share_target.params.files[0].accept).toContain('image/*');
  // The service worker must control the page for the POST to be intercepted
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const a = await photo(page, { mark: 'tl' }), b = await photo(page, { mark: 'br' }), c = await photo(page, { mark: 'tl', angle: -6 });
  // Simulate the share sheet: Android sends one multipart POST with all files under the same name
  const share = list => page.evaluate(async list => {
    const fd = new FormData();
    for (const [name, b64] of list) fd.append('file', new File([Uint8Array.from(atob(b64), ch => ch.charCodeAt(0))], name, { type: 'image/png' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, list.map(([n, p]) => [n, p.toString('base64')]));
  // an earlier share that was never opened must not mix in
  expect(await share([['alt1.png', c.png], ['alt2.png', c.png], ['alt3.png', c.png]])).toBe(true);
  expect(await share([['b.png', b.png], ['a.png', a.png]])).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(page).toHaveURL(/\/doc-scanner\/$/);   // parameter removed again
  await expect(page.locator('#pages li img[src^="blob:"]')).toHaveCount(2);
  await expect(page.locator('#addInfo')).toHaveText('2 Seite(n) hinzugefügt.');
  // several photos: no crop view opens by itself
  await expect(page.locator('#editor')).toBeHidden();
  const pdf = (await savePdf(page)).pdf;
  expect((await measure(page, pdf.pages[0].jpeg, REGIONS)).markBR).toBeLessThan(80);   // b first
  expect((await measure(page, pdf.pages[1].jpeg, REGIONS)).markTL).toBeLessThan(80);   // then a
  // picked up once: nothing left in the cache, a reload adds nothing
  expect(await page.evaluate(async () => (await (await caches.open('share:doc-scanner')).keys()).length)).toBe(0);
  await page.goto(`${URL_}?shared=1`);
  await expect(page.locator('#pageCount')).toHaveText('0');

  // a single shared photo opens the crop view
  expect(await share([['a.png', a.png]])).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(page.locator('#editor')).toBeVisible();
  await expect(page.locator('#pageCount')).toHaveText('1');
});

test('works offline: add a photo and save the PDF', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  const { png } = await photo(page);
  await addPhotos(page, [file(png)]);
  expect((await savePdf(page)).pdf.pages).toHaveLength(1);
  await context.setOffline(false);
});

test('diagnostics report pages and steps, but no file names', async ({ page }) => {
  const { png } = await photo(page);
  await addPhotos(page, [file(png, 'Geheimer-Befund.png')]);
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('pages: 1');
  expect(text).toContain('page added');
  expect(text).not.toContain('Geheimer');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and messages in English', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Document Scanner');
    const { png } = await photo(page);
    await addPhotos(page, [file(png)]);
    await expect(page.locator('#addInfo')).toHaveText('1 page(s) added.');
    await expect(page.getByRole('button', { name: 'Crop page 1' })).toBeVisible();
    await savePdf(page);
    await expect(page.locator('#status')).toContainText('PDF saved: 1 page(s)');
  });
});
