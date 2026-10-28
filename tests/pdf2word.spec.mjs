// PDF zu Word: paragraphs, hanging indents, hyphenation, columns, page breaks and page numbers
// are rebuilt from a generated PDF; the expected Word values are computed from the PDF geometry.
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
  await expect(page.locator('#result')).toBeVisible({ timeout: 30000 });
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

test('explains that scanned PDFs without text are not supported', async ({ page }) => {
  await page.goto(URL_);
  const pdf = makePdf([{ draw: '72 700 m 500 700 l S 100 600 200 100 re f' }]);
  await page.setInputFiles('#file', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf });
  await page.click('#btnRun');
  await expect(page.locator('#status')).toContainText('keinen Text', { timeout: 30000 });
  await expect(page.locator('#status')).toHaveClass(/err/);
  await expect(page.locator('#btnRun')).toBeEnabled();
});

test('warns about pages without text', async ({ page }) => {
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
