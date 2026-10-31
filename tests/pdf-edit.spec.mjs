// PDF bearbeiten: merge, remove, rotate and reorder pages. The saved PDF is read back with a small
// independent parser (pdf-tools.mjs) – page order from the page tree, rotation from /Rotate,
// and each page is recognised by the text it shows.
import { test, expect } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { makePdf, readPdfPages } from './pdf-tools.mjs';

const URL_ = '/pdf-edit/';
// The vendored browser bundle, used in Node only to create an AES-256 test file
const libInNode = () => {
  const file = new URL('../assets/vendor/pdf-lib/pdf-lib.min.js', import.meta.url).pathname;
  const m = createRequire(import.meta.url)(file);
  return globalThis.PDFLib || m;
};
const doc = (labels, rotate = {}) => makePdf(labels.map(l => ({ rotate: rotate[l], texts: [{ x: 72, y: 700, size: 40, text: l }] })));
const A = () => ({ name: 'a.pdf', mimeType: 'application/pdf', buffer: doc(['A1', 'A2', 'A3']) });
// B2 is already turned 90° in the source file – user rotation adds to it
const B = () => ({ name: 'b.pdf', mimeType: 'application/pdf', buffer: doc(['B1', 'B2'], { B2: 90 }) });

const thumbs = page => page.locator('#pages li');
const pageBtn = (page, n, act) => thumbs(page).nth(n - 1).locator(`[data-act="${act}"]`);
async function save(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
  const pdf = readFileSync(await download.path());
  return { name: download.suggestedFilename(), pdf, pages: readPdfPages(pdf).map(p => `${p.texts.join('')}@${p.rotate}`) };
}
async function openFiles(page, files, pages) {
  await page.setInputFiles('#inPick', files);
  await expect(thumbs(page)).toHaveCount(pages);
}

test('merges two PDFs, moves, rotates and removes pages', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('#btnSave')).toBeDisabled();
  await expect(page.locator('#tools')).toBeHidden();
  await openFiles(page, [A(), B()], 5);
  await expect(page.locator('#addInfo')).toHaveText('2 Datei(en) mit 5 Seite(n) hinzugefügt.');
  await expect(page.locator('#pageCount')).toHaveText('5');
  await expect(page.locator('#files li')).toHaveCount(2);
  await expect(page.locator('#files li').nth(1)).toContainText('b.pdf');
  await expect(page.locator('#files li').nth(1)).toContainText('2 Seite(n)');
  await expect(page.locator('#fileName')).toHaveValue('a + b');
  await expect(thumbs(page).nth(4).locator('.thumb')).toHaveAttribute('aria-label', 'Seite 5 – Datei B, Seite 2');
  await expect(thumbs(page).nth(4).locator('.src')).toHaveText('B·2');

  // unchanged merge first
  let r = await save(page);
  expect(r.name).toBe('a + b.pdf');
  expect(r.pages).toEqual(['A1@0', 'A2@0', 'A3@0', 'B1@0', 'B2@90']);
  // document title, written by pdf-lib as UTF-16 (hex string with byte order mark)
  const hex = r.pdf.toString('latin1').match(/\/Title <FEFF([0-9A-F]*)>/i)[1];
  expect(Buffer.from(hex, 'hex').swap16().toString('utf16le')).toBe('a + b');
  await expect(page.locator('#status')).toContainText('PDF gespeichert: 5 Seite(n)');

  await pageBtn(page, 5, 'up').click();            // B2 before B1
  await pageBtn(page, 1, 'rot').click();           // A1 → 90
  await pageBtn(page, 4, 'rot').click();           // B2 → 90 + 90
  await pageBtn(page, 2, 'del').click();           // A2 gone
  await expect(thumbs(page)).toHaveCount(4);
  await expect(page.locator('#pageCount')).toHaveText('4');
  await expect(thumbs(page).nth(0).locator('img')).toHaveCSS('transform', /matrix\(0, 1, -1, 0/);   // shown rotated 90°
  await expect(thumbs(page).nth(2).locator('.thumb')).toHaveAttribute('aria-label', 'Seite 3 – Datei B, Seite 2, gedreht um 90°');
  // first page cannot move earlier, last page not later
  await expect(pageBtn(page, 1, 'up')).toBeDisabled();
  await expect(pageBtn(page, 4, 'down')).toBeDisabled();

  await page.fill('#fileName', 'Ergebnis/neu');
  r = await save(page);
  expect(r.name).toBe('Ergebnis-neu.pdf');
  expect(r.pages).toEqual(['A1@90', 'A3@0', 'B2@180', 'B1@0']);
});

test('page previews are rendered and turn with the page', async ({ page }) => {
  await page.goto(URL_);
  await openFiles(page, [A()], 3);
  const img = thumbs(page).nth(0).locator('img');
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('src', /^blob:/);
  const size = await img.evaluate(i => [i.naturalWidth, i.naturalHeight]);
  // A4 portrait (595 × 842) scaled to 280 px on the long side
  expect(size).toEqual([Math.round(595 * 280 / 842), 280]);
  // the text "A1" is drawn: some dark pixels in the top left quarter of the page, none at the bottom
  const dark = await img.evaluate(i => {
    const c = document.createElement('canvas'); c.width = i.naturalWidth; c.height = i.naturalHeight;
    const g = c.getContext('2d'); g.drawImage(i, 0, 0);
    const count = (y0, y1) => { const d = g.getImageData(0, y0, c.width, y1 - y0).data; let n = 0; for (let k = 0; k < d.length; k += 4) if (d[k] < 100) n++; return n; };
    return { top: count(0, c.height / 4), bottom: count(c.height / 2, c.height) };
  });
  expect(dark.top).toBeGreaterThan(20);
  expect(dark.bottom).toBe(0);
});

test('page selection: rotate, remove, keep only, wrong input, undo', async ({ page }) => {
  await page.goto(URL_);
  await openFiles(page, [A(), B()], 5);
  // wrong input changes nothing
  for (const [input, msg] of [['', 'Bitte zuerst Seiten eintragen'], ['2-x', 'nicht verstanden'], ['4-2', 'nicht verstanden'], ['1, 6', 'nur 5 Seite(n)']]) {
    await page.fill('#range', input);
    await page.click('#btnDelSel');
    await expect(page.locator('.toast')).toContainText(msg);
    await expect(thumbs(page)).toHaveCount(5);
  }
  // all pages may not be removed
  await page.fill('#range', '1-');
  await page.click('#btnDelSel');
  await expect(page.locator('.toast')).toContainText('Es müssen Seiten übrig bleiben');
  await expect(thumbs(page)).toHaveCount(5);

  await page.fill('#range', ' 2 , 4- ');
  await page.click('#btnRotSel');
  await expect(page.locator('.toast')).toContainText('3 Seite(n) gedreht');
  await page.fill('#range', '-1;3');                // 1 and 3
  await page.click('#btnDelSel');
  await expect(thumbs(page)).toHaveCount(3);
  await expect(page.locator('#range')).toHaveValue('');
  let r = await save(page);
  expect(r.pages).toEqual(['A2@90', 'B1@90', 'B2@180']);

  await page.fill('#range', '3');
  await page.click('#btnKeepSel');
  await expect(thumbs(page)).toHaveCount(1);
  await expect(page.locator('#files li')).toHaveCount(1);     // file A has no pages left
  await expect(pageBtn(page, 1, 'del')).toBeDisabled();       // the last page stays
  r = await save(page);
  expect(r.pages).toEqual(['B2@180']);

  // undo: keep → delete → rotate → back to the start
  await page.click('#btnUndo');
  await expect(thumbs(page)).toHaveCount(3);
  await expect(page.locator('#files li')).toHaveCount(2);
  await page.click('#btnUndo');
  await page.click('#btnUndo');
  await expect(thumbs(page)).toHaveCount(5);
  r = await save(page);
  expect(r.pages).toEqual(['A1@0', 'A2@0', 'A3@0', 'B1@0', 'B2@90']);
  await page.click('#btnUndo');                     // adding the files is undone, too
  await expect(thumbs(page)).toHaveCount(0);
  await expect(page.locator('#btnUndo')).toBeDisabled();
  await expect(page.locator('#btnSave')).toBeDisabled();
});

test('rotate all, move and remove whole files, add more later, start over', async ({ page }) => {
  await page.goto(URL_);
  await openFiles(page, [A()], 3);
  await expect(page.locator('#fileName')).toHaveValue('a (bearbeitet)');
  await openFiles(page, [B()], 5);                  // added at the end
  await expect(page.locator('#fileName')).toHaveValue('a + b');
  await openFiles(page, [{ ...A(), name: 'c.PDF' }], 8);
  await expect(page.locator('#fileName')).toHaveValue('a + 2 weitere');
  await page.locator('#files li').nth(2).locator('[data-act="fdel"]').click();
  await expect(thumbs(page)).toHaveCount(5);
  await pageBtn(page, 1, 'down').click();           // A2 A1 A3 B1 B2
  await page.locator('#files li').nth(1).locator('[data-act="fup"]').click();
  await expect(page.locator('#files li').nth(0)).toContainText('b.pdf');
  await expect(page.locator('#files li').nth(0).locator('[data-act="fup"]')).toBeDisabled();
  await page.click('#btnRotAllL');
  let r = await save(page);
  expect(r.pages).toEqual(['B1@270', 'B2@0', 'A2@270', 'A1@270', 'A3@270']);   // order inside A is kept

  await page.locator('#files li').nth(0).locator('[data-act="fdel"]').click();
  await expect(thumbs(page)).toHaveCount(3);
  await page.click('#btnRotAllR');
  r = await save(page);
  expect(r.pages).toEqual(['A2@0', 'A1@0', 'A3@0']);

  page.once('dialog', d => d.accept());
  await page.click('#btnReset');
  await expect(thumbs(page)).toHaveCount(0);
  await expect(page.locator('#files li')).toHaveCount(0);
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#btnReset')).toBeHidden();
});

test('a file name typed by the user is kept when more files are added', async ({ page }) => {
  await page.goto(URL_);
  await openFiles(page, [A()], 3);
  await page.fill('#fileName', 'Mein Vertrag.pdf');
  await openFiles(page, [B()], 5);
  await expect(page.locator('#fileName')).toHaveValue('Mein Vertrag.pdf');
  expect((await save(page)).name).toBe('Mein Vertrag.pdf');
});

test('not a PDF or damaged files get a clear message', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#inPick', [
    { name: 'bild.png', mimeType: 'image/png', buffer: Buffer.from('not a pdf at all') },
    { name: 'kaputt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n garbage without objects') },
    A(),
  ]);
  await expect(thumbs(page)).toHaveCount(3);
  const info = page.locator('#addInfo');
  await expect(info).toContainText('1 Datei(en) mit 3 Seite(n) hinzugefügt.');
  await expect(info).toContainText('„bild.png“ ist keine PDF-Datei.');
  await expect(info).toContainText('„kaputt.pdf“ konnte nicht gelesen werden');
  await expect(info).toHaveClass(/err/);
});

/* ---------- Password-protected PDFs ---------- */
// Encrypted by pdf-tools.mjs itself (RC4, PDF standard security handler) – independent of the library
const S = () => ({ name: 'geheim.pdf', mimeType: 'application/pdf',
  buffer: makePdf([{ texts: [{ x: 72, y: 700, size: 40, text: 'S1' }] }, { texts: [{ x: 72, y: 700, size: 40, text: 'S2' }] }], { encrypt: { user: 'Sesam 1', owner: 'chef' } }) });
// only protected against changes: opens with the empty user password
const R = () => ({ name: 'schreibschutz.pdf', mimeType: 'application/pdf',
  buffer: makePdf([{ rotate: 180, texts: [{ x: 72, y: 700, size: 40, text: 'R1' }] }], { encrypt: { user: '', owner: 'chef' } }) });
const dlg = page => page.locator('#pwDlg');

test('password-protected PDFs: asks for the password, wrong ones are rejected, saved without password', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#inPick', [A(), S(), R()]);
  await expect(dlg(page)).toBeVisible();
  await expect(page.locator('#pwTitle')).toHaveText('„geheim.pdf“ ist passwortgeschützt');
  await expect(page.locator('#pwInput')).toBeFocused();
  await expect(page.locator('#pwInput')).toHaveAttribute('type', 'password');
  await page.click('#pwOk');                                       // nothing entered
  await expect(page.locator('#pwErr')).toHaveText('Bitte das Passwort eingeben.');
  await page.fill('#pwInput', 'sesam 1');                          // wrong case
  await page.press('#pwInput', 'Enter');
  await expect(page.locator('#pwErr')).toHaveText('Falsches Passwort – bitte noch einmal versuchen.');
  await expect(page.locator('#pwInput')).toHaveValue('');
  await page.fill('#pwInput', 'Sesam 1');
  await page.click('#pwOk');
  await expect(dlg(page)).toBeHidden();
  // the write-protected file opened without asking
  await expect(thumbs(page)).toHaveCount(6);
  await expect(page.locator('#addInfo')).toHaveText('3 Datei(en) mit 6 Seite(n) hinzugefügt.');
  // previews of the encrypted file (pdf.js gets the password, too)
  await expect(thumbs(page).nth(3).locator('img')).toHaveAttribute('src', /^blob:/);
  await expect(thumbs(page).nth(5).locator('img')).toHaveAttribute('src', /^blob:/);

  await pageBtn(page, 4, 'rot').click();
  const r = await save(page);
  // readable by a parser that knows nothing about encryption → really decrypted
  expect(r.pages).toEqual(['A1@0', 'A2@0', 'A3@0', 'S1@90', 'S2@0', 'R1@180']);
  expect(r.pdf.toString('latin1')).not.toContain('/Encrypt');

  // the password never shows up in the diagnostics
  // same text as "Diagnose kopieren" (the button itself is tested in diag.spec.mjs)
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('encrypted: 2');
  expect(text).toContain('wrong password');
  expect(text).not.toContain('Sesam');
  expect(text).not.toContain('sesam');
});

test('password-protected PDF can be skipped (button or Escape); the other files are still added', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#inPick', [S(), A(), { ...S(), name: 'zwei.pdf' }]);
  await expect(page.locator('#pwTitle')).toHaveText('„geheim.pdf“ ist passwortgeschützt');
  await page.click('#pwCancel');
  await expect(page.locator('#pwTitle')).toHaveText('„zwei.pdf“ ist passwortgeschützt');
  await page.keyboard.press('Escape');
  await expect(dlg(page)).toBeHidden();
  await expect(thumbs(page)).toHaveCount(3);
  const info = page.locator('#addInfo');
  await expect(info).toContainText('1 Datei(en) mit 3 Seite(n) hinzugefügt.');
  await expect(info).toContainText('„geheim.pdf“ wurde ohne Passwort nicht geöffnet.');
  await expect(info).toContainText('„zwei.pdf“ wurde ohne Passwort nicht geöffnet.');
});

test('password-protected PDF with AES-256 (current standard)', async ({ page }) => {
  // made with the library's own encrypt() – the content is checked with the independent parser
  const lib = libInNode();
  const d = await lib.PDFDocument.load(doc(['N1', 'N2']));
  d.encrypt({ userPassword: 'neu', ownerPassword: 'chef' });
  const buffer = Buffer.from(await d.save());
  expect(buffer.toString('latin1')).toMatch(/\/V 5/);               // AES-256
  await page.goto(URL_);
  await page.setInputFiles('#inPick', [{ name: 'aes.pdf', mimeType: 'application/pdf', buffer }]);
  await page.fill('#pwInput', 'neu');
  await page.click('#pwOk');
  await expect(thumbs(page)).toHaveCount(2);
  await expect(thumbs(page).nth(0).locator('img')).toHaveAttribute('src', /^blob:/);
  await pageBtn(page, 2, 'up').click();
  expect((await save(page)).pages).toEqual(['N2@0', 'N1@0']);
});

test('share target: several PDFs shared to the installed app are merged in order', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target.params.files[0].accept).toContain('application/pdf');
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const files = [B(), A()].map(f => ({ name: f.name, b64: f.buffer.toString('base64') }));
  const ok = await page.evaluate(async files => {
    const fd = new FormData();
    for (const f of files) fd.append('file', new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name, { type: 'application/pdf' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, files);
  expect(ok).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(thumbs(page)).toHaveCount(5);
  const r = await save(page);
  expect(r.pages).toEqual(['B1@0', 'B2@90', 'A1@0', 'A2@0', 'A3@0']);
});

test('works offline: editing library, pdf.js and its worker come from the offline cache', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await openFiles(page, [A(), B()], 5);
  await expect(thumbs(page).nth(4).locator('img')).toHaveAttribute('src', /^blob:/);
  await pageBtn(page, 1, 'rot').click();
  const r = await save(page);
  expect(r.pages).toEqual(['A1@90', 'A2@0', 'A3@0', 'B1@0', 'B2@90']);
  await context.setOffline(false);
});

test('diagnostics count pages but never contain file names', async ({ page }) => {
  await page.goto(URL_);
  await openFiles(page, [A(), B()], 5);
  await pageBtn(page, 2, 'rot').click();
  // same text as "Diagnose kopieren" (the button itself is tested in diag.spec.mjs)
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('files: 2');
  expect(text).toContain('pages: 5');
  expect(text).toContain('rotated: 1');
  expect(text).toContain('file added');
  expect(text).not.toContain('a.pdf');
  expect(text).not.toContain('b.pdf');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, file name and messages in English', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('h1')).toHaveText('Edit PDF');
    await openFiles(page, [A()], 3);
    await expect(page.locator('#addInfo')).toHaveText('1 file(s) with 3 page(s) added.');
    await expect(page.locator('#fileName')).toHaveValue('a (edited)');
    await expect(thumbs(page).nth(1).locator('.thumb')).toHaveAttribute('aria-label', 'Page 2 – file A, page 2');
    await page.fill('#range', '9');
    await page.click('#btnRotSel');
    await expect(page.locator('.toast')).toContainText('There are only 3 page(s).');
    await page.setInputFiles('#inPick', [S()]);
    await expect(page.locator('#pwTitle')).toHaveText('“geheim.pdf” is password-protected');
    await page.fill('#pwInput', 'x');
    await page.click('#pwOk');
    await expect(page.locator('#pwErr')).toHaveText('Wrong password – please try again.');
    await page.click('#pwCancel');
    await expect(page.locator('#addInfo')).toHaveText('“geheim.pdf” was not opened without a password.');
    // switching the language renames the suggested file name until the user types one
    await page.click('[data-set-lang="de"]');
    await expect(page.locator('#fileName')).toHaveValue('a (bearbeitet)');
    await expect(thumbs(page).nth(1).locator('.thumb')).toHaveAttribute('aria-label', 'Seite 2 – Datei A, Seite 2');
  });
});
