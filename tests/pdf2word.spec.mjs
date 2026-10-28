// PDF zu Word: paragraphs, hanging indents, hyphenation, columns, page breaks and page numbers
// are rebuilt from a generated PDF; the expected Word values are computed from the PDF geometry.
// Images: position, size and orientation; scanned pages: text recognition (Tesseract, local files).
import { test, expect } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import { makePdf, wrap, unzip, docxParagraphs } from './pdf-tools.mjs';

const URL_ = '/pdf2word/';
const SIZE = 11, PITCH = 13, LEFT = 72, CHAR = 0.6 * SIZE;   // Courier: 0.6 em per character
const TW = pt => Math.round(pt * 20);                         // points → Word twips

// Document content
const TITLE = 'Testvertrag';
const PARA_A = 'Dieser Vertrag regelt die Zusammenarbeit zwischen beiden Parteien. Die Prüfung der Unterlagen ' +
  'erfolgt gemäß den üblichen Regeln und wird schriftlich festgehalten. Änderungen bedürfen der Schriftform.';
const ITEM = 'Die Parteien verpflichten sich, alle Vorgänge vertraulich zu behandeln, und zwar auch nach dem ' +
  'Ende der Zusammenarbeit und ohne zeitliche Begrenzung.';
const HYPH_1 = 'Die beiden Vertragsparteien unterschreiben gemeinsam den neuen Arbeits-';
const HYPH_2 = 'vertrag am selben Tag.';
const COL_2_X = 330;

function fixture() {
  const t = [];
  let y = 780;
  t.push({ x: LEFT, y, size: 16, text: TITLE, bold: true });
  y -= 30;
  const linesA = wrap(PARA_A, 70);
  for (const l of linesA) { t.push({ x: LEFT, y, size: SIZE, text: l }); y -= PITCH; }
  y -= PITCH;                                             // one empty line
  t.push({ x: LEFT, y, size: SIZE, text: '§ 1', bold: true });
  const gapHeading = 2 * PITCH;
  y -= PITCH;
  const itemLines = wrap(ITEM, 66);
  itemLines.forEach((l, i) => { t.push({ x: i ? LEFT + 4 * CHAR : LEFT, y, size: SIZE, text: i ? l : '(1) ' + l }); y -= PITCH; });
  y -= PITCH;
  t.push({ x: LEFT, y, size: SIZE, text: HYPH_1 }); y -= PITCH;
  t.push({ x: LEFT, y, size: SIZE, text: HYPH_2 }); y -= 3 * PITCH;
  t.push({ x: LEFT, y, size: SIZE, text: 'Ort, Datum' });
  t.push({ x: COL_2_X, y, size: SIZE, text: 'Unterschrift' }); y -= 2 * PITCH;
  const right = LEFT + Math.max(...linesA.map(l => l.length), ('(1) ' + itemLines[0]).length, HYPH_1.length) * CHAR;
  t.push({ x: (LEFT + right) / 2 - 2.5 * CHAR, y, size: SIZE, text: 'Mitte' });
  t.push({ x: 294, y: 40, size: SIZE, text: '1' });       // page number
  const page2 = [{ x: LEFT, y: 780, size: SIZE, text: 'Seite zwei beginnt hier.' }, { x: 294, y: 40, size: SIZE, text: '2' }];
  return { pdf: makePdf([{ texts: t }, { texts: page2 }]), linesA, itemLines, right, gapHeading };
}

async function convert(page, buffer, name = 'vertrag.pdf') {
  await page.setInputFiles('#file', { name, mimeType: 'application/pdf', buffer });
  await page.click('#btnRun');
  await expect(page.locator('#result')).toBeVisible({ timeout: 120000 });
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const files = unzip(readFileSync(await download.path()));
  return { name: download.suggestedFilename(), files, paras: docxParagraphs(files.get('word/document.xml').toString('utf8')) };
}

test('rebuilds paragraphs, indents, columns, page breaks and page numbers', async ({ page }) => {
  const f = fixture();
  await page.goto(URL_);
  await expect(page.locator('#btnRun')).toBeDisabled();
  const { name, files, paras } = await convert(page, f.pdf);
  expect(name).toBe('vertrag.docx');

  // Text of every paragraph – page numbers are not part of the body
  expect(paras.map(p => p.text)).toEqual([
    TITLE, PARA_A, '§ 1', '(1) ' + ITEM, 'Die beiden Vertragsparteien unterschreiben gemeinsam den neuen Arbeitsvertrag am selben Tag.',
    'Ort, Datum\tUnterschrift', 'Mitte', 'Seite zwei beginnt hier.',
  ]);
  const [title, a, heading, item, , cols, mid, p2] = paras;
  expect(title.bold).toBe(true);
  expect(title.xml).toContain('<w:sz w:val="32"/>');                // 16 pt
  expect(heading.bold).toBe(true);
  expect(a.bold).toBe(false);
  // Hanging indent of the list item: continuation lines start 4 characters further right
  expect(item.xml).toContain(`<w:ind w:left="${TW(4 * CHAR)}" w:hanging="${TW(4 * CHAR)}"/>`);
  // Space before the heading: one empty line above it
  expect(heading.xml).toContain(`w:before="${TW(f.gapHeading - PITCH)}"`);
  // Line spacing = baseline distance in the PDF
  expect(a.xml).toContain(`w:line="${TW(PITCH)}" w:lineRule="atLeast"`);
  // Column: tab stop where the second column starts
  expect(cols.xml).toContain(`<w:tab w:val="left" w:pos="${TW(COL_2_X - LEFT)}"/>`);
  expect(cols.xml).toContain('<w:tab/>');
  expect(mid.xml).toContain('<w:jc w:val="center"/>');
  // Every PDF page starts on a new page; the first one does not need a break
  expect(p2.xml).toContain('<w:pageBreakBefore/>');
  expect(paras.filter(p => p.xml.includes('pageBreakBefore'))).toHaveLength(1);

  // Page: A4, left margin from the text, page number field in the footer
  const doc = files.get('word/document.xml').toString('utf8');
  expect(doc).toContain(`<w:pgSz w:w="${TW(595)}" w:h="${TW(842)}"`);
  expect(doc).toMatch(new RegExp(`<w:pgMar[^>]*w:left="${TW(LEFT)}"`));
  expect(doc).toMatch(new RegExp(`<w:pgMar[^>]*w:right="${TW(595 - f.right - 3)}"`));
  const footer = [...files.keys()].filter(k => /^word\/footer\d*\.xml$/.test(k)).map(k => files.get(k).toString('utf8')).join('');
  expect(footer).toMatch(/PAGE/);
  expect(footer).toContain('<w:jc w:val="center"/>');

  // Preview and summary on the page
  await expect(page.locator('#preview')).toContainText('Arbeitsvertrag am selben Tag');
  await expect(page.locator('#preview')).toContainText('Seitenumbruch');
  await expect(page.locator('#resultMeta')).toContainText('2 Seiten');
  await expect(page.locator('#resultMeta')).toContainText('8 Absätze');
  await expect(page.locator('#status')).toHaveClass(/ok/);
});

test('without page breaks the text flows on; the setting is remembered', async ({ page }) => {
  await page.goto(URL_);
  await page.uncheck('#optPages');
  await page.reload();
  await expect(page.locator('#optPages')).not.toBeChecked();
  const { paras } = await convert(page, fixture().pdf);
  expect(paras.some(p => p.xml.includes('pageBreakBefore'))).toBe(false);
  expect(paras.at(-1).text).toBe('Seite zwei beginnt hier.');
});

test('rejects files that are not PDFs', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#file', { name: 'notiz.pdf', mimeType: 'application/pdf', buffer: Buffer.from('kein pdf') });
  await page.click('#btnRun');
  await expect(page.locator('#status')).toHaveClass(/err/);
  await expect(page.locator('#status')).toContainText('keine lesbare PDF');
  await expect(page.locator('#result')).toBeHidden();
});

test('explains when a PDF has neither text nor pictures', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(URL_);
  const pdf = makePdf([{ draw: '72 700 m 500 700 l S 100 600 200 100 re f' }]);
  await page.setInputFiles('#file', { name: 'linien.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.click('#btnRun');
  await expect(page.locator('#status')).toContainText('weder Text noch ein Bild', { timeout: 90000 });
  await expect(page.locator('#status')).toHaveClass(/err/);
  await expect(page.locator('#btnRun')).toBeEnabled();
});

test('warns about pages without text', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(URL_);
  const pdf = makePdf([{ texts: [{ x: 72, y: 780, size: 11, text: 'Nur hier steht Text.' }] }, { draw: '72 700 m 500 700 l S' }]);
  const { paras } = await convert(page, pdf);
  expect(paras.map(p => p.text)).toEqual(['Nur hier steht Text.']);
  await expect(page.locator('#status')).toHaveClass(/warn/);
  await expect(page.locator('#status')).toContainText('1 von 2 Seiten');
});

test('share target: a PDF shared to the installed app is picked up', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target.params.files[0].accept).toContain('application/pdf');
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const b64 = fixture().pdf.toString('base64');
  const ok = await page.evaluate(async b64 => {
    const fd = new FormData();
    fd.append('file', new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'geteilt.pdf', { type: 'application/pdf' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, b64);
  expect(ok).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(page.locator('#fileInfo')).toContainText('geteilt.pdf');
  await expect(page.locator('#btnRun')).toBeEnabled();
});

test('converts offline (pdf.js worker and docx come from the offline cache)', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  const { paras } = await convert(page, fixture().pdf);
  expect(paras[0].text).toBe(TITLE);
  await context.setOffline(false);
});

/* ---------- Images ---------- */

// 60 × 40 px picture: left half red, right half blue (rows top to bottom)
const PIC_W = 60, PIC_H = 40;
function picture() {
  const rgb = Buffer.alloc(PIC_W * PIC_H * 3);
  for (let y = 0; y < PIC_H; y++) for (let x = 0; x < PIC_W; x++) rgb[(y * PIC_W + x) * 3 + (x < PIC_W / 2 ? 0 : 2)] = 220;
  return rgb;
}

// Colour of the left and right edge of an image from the .docx, decoded by the browser
async function edgeColours(page, files, name) {
  const b64 = files.get(name).toString('base64');
  return page.evaluate(async b64 => {
    const img = await createImageBitmap(new Blob([Uint8Array.from(atob(b64), c => c.charCodeAt(0))]));
    const c = new OffscreenCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    const at = x => { const d = g.getImageData(x, img.height >> 1, 1, 1).data; return d[0] > d[2] ? 'red' : 'blue'; };
    return { w: img.width, h: img.height, left: at(2), right: at(img.width - 3) };
  }, b64);
}

const EMU = pt => Math.round(pt * 96 / 72) * 9525;   // docx: pixels at 96 dpi, 9525 EMU per pixel

test('takes over pictures at their place, size and orientation', async ({ page }) => {
  await page.goto(URL_);
  const pdf = makePdf([{
    texts: [{ x: 72, y: 780, size: 11, text: 'Text oben.' }, { x: 72, y: 600, size: 11, text: 'Text unten.' },
      { x: 72, y: 250, size: 11, text: 'Ende.' }],
    images: [{ x: 72, y: 640, w: 120, h: 80, width: PIC_W, height: PIC_H, rgb: picture() }],
    // the same picture mirrored (negative width) and turned by 90° (80 × 120 pt) below "Text unten."
    draw: `q -120 0 0 80 192 500 cm /Im0 Do Q q 0 120 -80 0 152 300 cm /Im0 Do Q`,
  }]);
  const { files, paras } = await convert(page, pdf, 'bilder.pdf');
  const kinds = paras.map(p => p.xml.includes('<w:drawing>') ? 'BILD' : p.text);
  expect(kinds).toEqual(['Text oben.', 'BILD', 'Text unten.', 'BILD', 'BILD', 'Ende.']);
  const extent = p => p.xml.match(/<wp:extent cx="(\d+)" cy="(\d+)"\/>/).slice(1).map(Number);
  const pics = paras.filter(p => p.xml.includes('<w:drawing>'));
  expect(extent(pics[0])).toEqual([EMU(120), EMU(80)]);
  expect(extent(pics[1])).toEqual([EMU(120), EMU(80)]);
  expect(extent(pics[2])).toEqual([EMU(80), EMU(120)]);     // turned: width and height swap

  // Picture files in the order of the paragraphs (relationship ids → media files)
  const rels = files.get('word/_rels/document.xml.rels').toString('utf8');
  const media = pics.map(p => {
    const id = p.xml.match(/r:embed="([^"]+)"/)[1];
    return 'word/' + rels.match(new RegExp(`Id="${id}"[^>]*Target="([^"]+)"`))[1];
  });
  expect(await edgeColours(page, files, media[0])).toMatchObject({ left: 'red', right: 'blue' });
  expect(await edgeColours(page, files, media[1])).toMatchObject({ left: 'blue', right: 'red' });   // mirrored
  const turned = await edgeColours(page, files, media[2]);
  expect(turned.h).toBeGreaterThan(turned.w);
  await expect(page.locator('#resultMeta')).toContainText('3 Bilder');
  await expect(page.locator('#preview img')).toHaveCount(3);
});

test('skips a full-page background picture behind text', async ({ page }) => {
  await page.goto(URL_);
  const pdf = makePdf([{ images: [{ x: 0, y: 0, w: 595, h: 842, width: PIC_W, height: PIC_H, rgb: picture() }],
    texts: [{ x: 72, y: 780, size: 11, text: 'Briefpapier mit Hintergrund.' }] }]);
  const { files, paras } = await convert(page, pdf);
  expect(paras.map(p => p.text)).toEqual(['Briefpapier mit Hintergrund.']);
  expect([...files.keys()].some(k => k.startsWith('word/media/'))).toBe(false);
});

/* ---------- Scanned pages (text recognition) ---------- */

const SCAN_TITLE = 'Mietvertrag';
const SCAN_LINES = ['Zwischen dem Vermieter und dem Mieter wird folgender Vertrag über',
  'die Wohnung im ersten Stock geschlossen. Die Miete beträgt monatlich',
  'achthundert Euro und ist bis zum dritten Werktag zu zahlen.'];
const SCAN_LAST = 'Die Kündigungsfrist beträgt drei Monate.';

// A "scan": the page is one picture (150 dpi) with text drawn by the browser – title 20 pt bold,
// body 12 pt with 18 pt line pitch. The font is loaded from the repository (Liberation Sans, as
// shipped with pdf.js), so the picture is the same on every machine – "Arial" would be a
// different fallback font depending on the system.
async function scanPdf(page) {
  const dpi = 150, px = pt => pt * dpi / 72;
  const rgb = await page.evaluate(async ({ title, lines, last, sizes }) => {
    const dir = '/assets/vendor/pdfjs/standard_fonts/';
    for (const [file, weight] of [['LiberationSans-Regular.ttf', 'normal'], ['LiberationSans-Bold.ttf', 'bold']]) {
      const face = new FontFace('ScanFont', `url(${dir}${file})`, { weight });
      document.fonts.add(await face.load());
    }
    const c = document.createElement('canvas'); c.width = 1240; c.height = 1754;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#000';
    g.font = `bold ${sizes.title}px ScanFont`; g.fillText(title, sizes.left, sizes.top);
    g.font = `${sizes.body}px ScanFont`;
    [...lines, '', last].forEach((l, i) => g.fillText(l, sizes.left, sizes.top + sizes.gap + i * sizes.pitch));
    // RGB bytes as base64 (much faster to hand over than a plain array)
    const d = g.getImageData(0, 0, c.width, c.height).data, rgb = new Uint8Array(d.length / 4 * 3);
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) { rgb[j] = d[i]; rgb[j + 1] = d[i + 1]; rgb[j + 2] = d[i + 2]; }
    let bin = '';
    for (let i = 0; i < rgb.length; i += 0x8000) bin += String.fromCharCode(...rgb.subarray(i, i + 0x8000));
    return btoa(bin);
  }, { title: SCAN_TITLE, lines: SCAN_LINES, last: SCAN_LAST,
    sizes: { title: px(20), body: px(12), pitch: px(18), left: px(72), top: px(100), gap: px(48) } });
  return makePdf([{ images: [{ x: 0, y: 0, w: 595, h: 842, width: 1240, height: 1754, rgb: Buffer.from(rgb, 'base64') }] }]);
}

test('reads scanned pages with text recognition', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto(URL_);
  await expect(page.locator('#optOcr')).toBeChecked();
  await expect(page.locator('#optLang')).toHaveValue('deu');
  const { files, paras } = await convert(page, await scanPdf(page), 'scan.pdf');
  expect(paras.map(p => p.text)).toEqual([SCAN_TITLE, SCAN_LINES.join(' '), SCAN_LAST]);
  // Font sizes from the letter heights: 20 pt title, 12 pt body (Word: half points)
  expect(paras[0].xml).toContain('<w:sz w:val="40"/>');
  expect(files.get('word/styles.xml').toString('utf8')).toMatch(/<w:docDefaults>[\s\S]*?<w:sz w:val="24"\/>/);
  // The scan itself is not added as a picture on top of the recognised text
  expect([...files.keys()].some(k => k.startsWith('word/media/'))).toBe(false);
  await expect(page.locator('#status')).toContainText('1 gescannte Seite per Texterkennung');
});

test('without text recognition a scanned page comes over as a picture', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(URL_);
  await page.uncheck('#optOcr');
  await expect(page.locator('#optLang')).toBeHidden();
  await page.reload();
  await expect(page.locator('#optOcr')).not.toBeChecked();
  const { files, paras } = await convert(page, await scanPdf(page), 'scan.pdf');
  expect(paras).toHaveLength(1);
  expect(paras[0].xml).toContain('<w:drawing>');
  expect([...files.keys()].filter(k => k.startsWith('word/media/'))).toHaveLength(1);
});

test.describe('text recognition not available', () => {
  test.use({ allowedProblems: /tesseract|Failed to load resource|ERR_FAILED|net::/i });

  test('falls back to the picture and says so', async ({ page }) => {
    test.setTimeout(120000);
    await page.context().route(/tesseract-core/, r => r.abort());
    await page.goto(URL_);
    const { files, paras } = await convert(page, await scanPdf(page), 'scan.pdf');
    expect(paras).toHaveLength(1);
    expect(paras[0].xml).toContain('<w:drawing>');
    expect([...files.keys()].filter(k => k.startsWith('word/media/'))).toHaveLength(1);
    await expect(page.locator('#status')).toHaveClass(/warn/);
    await expect(page.locator('#status')).toContainText('als Bild übernommen');
  });
});

test('the language of the text recognition is remembered', async ({ page }) => {
  await page.goto(URL_);
  await page.selectOption('#optLang', 'eng');
  await page.reload();
  await expect(page.locator('#optLang')).toHaveValue('eng');
});

test('text recognition works offline once it was used', async ({ page, context }) => {
  test.setTimeout(240000);
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                               // page now controlled → downloads go through the cache
  const pdf = await scanPdf(page);
  await convert(page, pdf, 'scan.pdf');
  await context.setOffline(true);
  await page.reload();
  const { paras } = await convert(page, pdf, 'scan.pdf');
  expect(paras[0].text).toBe(SCAN_TITLE);
  await context.setOffline(false);
});
