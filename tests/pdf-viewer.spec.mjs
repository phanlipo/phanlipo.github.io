// PDF ansehen: full-screen PDF viewer. Test PDFs are built by pdf-tools.mjs, so every page is recognised
// by its own text; rendering is checked by reading pixels back from the canvas.
import { test, expect, openMenu, closeMenu, switchLang, mockAndroidShare } from './helpers.mjs';
import { makePdf } from './pdf-tools.mjs';

const URL_ = '/pdf-viewer/';
const doc = labels => makePdf(labels.map(l => ({ texts: [{ x: 72, y: 700, size: 40, text: l }] })));
const P = (name = 'bericht.pdf', labels = ['S1', 'S2', 'S3', 'S4', 'S5']) => ({ name, mimeType: 'application/pdf', buffer: doc(labels) });
const pages = page => page.locator('#pages .page');
const hidden = page => page.evaluate(() => document.body.classList.contains('bars-hidden'));

async function openPdf(page, file = P(), count = 5) {
  await page.setInputFiles('#inPick', file);
  await expect(pages(page)).toHaveCount(count);
  await expect(pages(page).first().locator('canvas')).toHaveCount(1);
}
/** A canvas that pdf.js really drew on: white page with some dark text pixels */
const inked = (page, n) => page.locator('#pages .page').nth(n - 1).locator('canvas').evaluate(c => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let dark = 0, white = 0;
  for (let i = 0; i < d.length; i += 4) { if (d[i] < 100) dark++; else if (d[i] > 240) white++; }
  return { dark, white, total: d.length / 4 };
});
/** Tap in the middle of the document (single tap = bars on/off after the double-tap wait) */
async function tap(page) {
  const b = await page.locator('main').boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

test('opens a PDF full width, renders pages, shows page and title', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  await expect(page.locator('#btnPick')).toBeVisible();
  await expect(page.locator('#bar')).toBeHidden();
  await openPdf(page);
  await expect(page.locator('#empty')).toBeHidden();
  await expect(page.locator('#docName')).toHaveText('bericht.pdf');
  await expect(page).toHaveTitle('bericht.pdf');
  await expect(page.locator('#pageLabel')).toHaveText('1 / 5');
  // A4 at page width: 375 - 2 × 8 px wide, height in A4 proportion
  const box = await pages(page).first().boundingBox();
  expect(box.width).toBeCloseTo(359, 0);
  expect(box.height).toBeCloseTo(359 * 842 / 595, 0);
  const ink = await inked(page, 1);
  expect(ink.dark, 'text drawn').toBeGreaterThan(50);
  expect(ink.white / ink.total, 'mostly white paper').toBeGreaterThan(0.9);
  // Only pages near the screen are drawn
  expect(await page.locator('#pages canvas').count()).toBeLessThan(5);
  await openMenu(page);
  await expect(page.locator('#docInfo')).toHaveText(/^bericht\.pdf · 5 Seite\(n\) · \d+ KB$/);
});

test('bars hide by themselves and while scrolling; a tap brings them back and hides them again', async ({ page }) => {
  await page.goto(URL_);
  // without a document the bars always stay
  await tap(page);
  expect(await hidden(page)).toBe(false);
  await openPdf(page);
  expect(await hidden(page)).toBe(false);
  await expect.poll(() => hidden(page), { timeout: 5000 }).toBe(true);
  await expect(page.locator('body > header')).not.toBeInViewport();
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(false);
  await expect(page.locator('.menu-btn')).toBeInViewport();
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(true);
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(false);
  // scrolling hides them, the page number follows
  await page.locator('main').evaluate(m => m.scrollBy(0, m.scrollHeight));
  await expect.poll(() => hidden(page)).toBe(true);
  await expect(page.locator('#pageLabel')).toHaveText('5 / 5');
  await expect(page.locator('#badge')).toHaveText('5 / 5');
  // keyboard focus on the bar shows it
  await page.locator('#pageRange').focus();
  await expect.poll(() => hidden(page)).toBe(false);
});

test('with automatic hiding turned off the bars stay until tapped', async ({ page }) => {
  await page.goto(URL_);
  await openMenu(page);
  await page.locator('#optAutoHide').uncheck();
  await closeMenu(page);
  await openPdf(page);
  await page.waitForTimeout(3000);
  await page.locator('main').evaluate(m => m.scrollBy(0, 600));
  await page.waitForTimeout(300);
  expect(await hidden(page)).toBe(false);
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(true);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('pdf-viewer.settings.v1'))).autoHide).toBe(false);
});

test('hiding the bars by tap also hides the system bars (full screen); button and setting', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('#btnFs')).toBeVisible();
  await openPdf(page);
  await tap(page);                                   // bars were visible → hide
  await expect.poll(() => hidden(page)).toBe(true);
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(page.locator('#btnFs')).toHaveAttribute('aria-pressed', 'true');
  await tap(page);                                   // bars back, full screen stays
  await expect.poll(() => hidden(page)).toBe(false);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await page.click('#btnFs');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.locator('#btnFs')).toHaveAttribute('aria-pressed', 'false');
  // turned off: hiding the bars leaves the system bars alone
  await openMenu(page);
  await page.locator('#optSystem').uncheck();
  await closeMenu(page);
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(true);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  // the button alone turns it on (and hides the bars)
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(false);
  await page.click('#btnFs');
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect.poll(() => hidden(page)).toBe(true);
  expect(await page.evaluate(() => Tools.diag.text())).toContain('fullscreen: page');
});

test('installed app in display mode "fullscreen": manifest, no full screen button', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.display).toBe('fullscreen');
  await page.addInitScript(() => {
    const mm = window.matchMedia.bind(window);
    window.matchMedia = q => q === '(display-mode: fullscreen)' ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q);
  });
  await page.goto(URL_);
  expect(await page.evaluate(() => [Tools.fullscreen.system(), Tools.fullscreen.active()])).toEqual([true, true]);
  await expect(page.locator('#btnFs')).toBeHidden();
  await openPdf(page);
  await expect.poll(() => hidden(page), { timeout: 5000 }).toBe(true);
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(false);
  expect(await page.evaluate(() => Tools.diag.text())).toContain('fullscreen: app');
});

test('share button shares the PDF unchanged; download from the menu', async ({ page }) => {
  await mockAndroidShare(page);
  await page.goto(URL_);
  await expect(page.locator('#btnShare')).toBeHidden();      // nothing open yet
  const f = P();
  await openPdf(page, f);
  await page.click('#btnShare');
  await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([[{ name: 'bericht.pdf', type: 'application/pdf', size: f.buffer.length }]]);
  await openMenu(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnDownload')]);
  expect(download.suggestedFilename()).toBe('bericht.pdf');
});

test('without file sharing (computer) there is no share button', async ({ page }) => {
  await page.addInitScript(() => { navigator.canShare = () => false; });
  await page.goto(URL_);
  await openPdf(page);
  await expect(page.locator('#btnShare')).toBeHidden();
});

test('share target: a PDF shared to the installed app opens right away', async ({ page, request }) => {
  const manifest = await (await request.get(`${URL_}manifest.webmanifest`)).json();
  expect(manifest.share_target.params.files[0].accept).toContain('application/pdf');
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const b64 = P('geteilt.pdf', ['G1', 'G2']).buffer.toString('base64');
  const ok = await page.evaluate(async b64 => {
    const fd = new FormData();
    fd.append('file', new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'geteilt.pdf', { type: 'application/pdf' }));
    return (await fetch('share-target', { method: 'POST', body: fd })).ok;
  }, b64);
  expect(ok).toBe(true);
  await page.goto(`${URL_}?shared=1`);
  await expect(pages(page)).toHaveCount(2);
  await expect(page.locator('#docName')).toHaveText('geteilt.pdf');
  expect(new URL(page.url()).search).toBe('');
});

test('page slider, go to page in the menu, remembered page when opened again', async ({ page }) => {
  await page.goto(URL_);
  await openPdf(page);
  await page.locator('#pageRange').fill('4');
  await expect(page.locator('#pageLabel')).toHaveText('4 / 5');
  await expect(pages(page).nth(3)).toBeInViewport();
  await expect(pages(page).nth(3).locator('canvas')).toHaveCount(1);
  expect((await inked(page, 4)).dark).toBeGreaterThan(50);
  await openMenu(page);
  await page.fill('#gotoInput', '9');
  await page.click('#btnGoto');
  await expect(page.locator('.toast')).toContainText('Seite 1 bis 5 eingeben.');
  await page.fill('#gotoInput', '2');
  await page.press('#gotoInput', 'Enter');
  await expect(page.locator('#appMenu')).toBeHidden();
  await expect(page.locator('#pageLabel')).toHaveText('2 / 5');
  // stored under the PDF's ID, without the file name
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pdf-viewer.positions.v1'))).toMatch(/"p":2/);
  expect(await page.evaluate(() => localStorage.getItem('pdf-viewer.positions.v1'))).not.toContain('bericht');
  await page.reload();
  await page.setInputFiles('#inPick', { ...P(), name: 'umbenannt.pdf' });
  await expect(page.locator('.toast')).toContainText('Weiter auf Seite 2');
  await expect(page.locator('#pageLabel')).toHaveText('2 / 5');
  // another document starts at page 1
  await page.setInputFiles('#inPick', P('neu.pdf', ['N1', 'N2', 'N3']));
  await expect(pages(page)).toHaveCount(3);
  await expect(page.locator('#pageLabel')).toHaveText('1 / 3');
});

test('zoom: double tap, keys, page width button; sharper canvas when zoomed', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  await openPdf(page);
  const width = () => pages(page).first().evaluate(el => el.getBoundingClientRect().width);
  const canvasW = () => pages(page).first().locator('canvas').evaluate(c => c.width);
  const w1 = await width(), c1 = await canvasW();
  const b = await page.locator('main').boundingBox();
  await page.mouse.dblclick(b.x + 100, b.y + 200);
  await expect.poll(width).toBeCloseTo(w1 * 2.5, 0);
  await expect.poll(canvasW).toBeGreaterThan(c1 * 2);
  expect(await page.locator('main').evaluate(m => m.scrollWidth > m.clientWidth)).toBe(true);
  await page.mouse.dblclick(b.x + 100, b.y + 200);
  await expect.poll(width).toBeCloseTo(w1, 0);
  await page.keyboard.press('+');
  await expect.poll(width).toBeCloseTo(w1 * 1.25, 0);
  await page.keyboard.press('+');
  await page.keyboard.press('-');
  await expect.poll(width).toBeCloseTo(w1 * 1.25, 0);
  await page.keyboard.press('0');
  await expect.poll(width).toBeCloseTo(w1, 0);
  for (let i = 0; i < 12; i++) await page.keyboard.press('+');
  await expect.poll(width).toBeCloseTo(w1 * 4, 0);          // at most 4 ×
  await tap(page);
  await expect.poll(() => hidden(page)).toBe(false);
  await page.click('#btnFit');
  await expect.poll(width).toBeCloseTo(w1, 0);
  // the zoom never leaves the page scrolling sideways at page width
  expect(await page.locator('main').evaluate(m => m.scrollWidth <= m.clientWidth)).toBe(true);
});

test('night mode inverts the pages', async ({ page }) => {
  await page.goto(URL_);
  await openPdf(page);
  await openMenu(page);
  await page.locator('#optNight').check();
  await closeMenu(page);
  await expect(pages(page).first()).toHaveCSS('filter', /invert\(1\)/);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/night/);
});

test('password-protected PDF: asks, rejects wrong passwords, can be cancelled', async ({ page }) => {
  const S = { name: 'geheim.pdf', mimeType: 'application/pdf',
    buffer: makePdf([{ texts: [{ x: 72, y: 700, size: 40, text: 'X1' }] }], { encrypt: { user: 'Sesam', owner: 'chef' } }) };
  await page.goto(URL_);
  await page.setInputFiles('#inPick', S);
  await expect(page.locator('#pwTitle')).toHaveText('„geheim.pdf“ ist passwortgeschützt');
  await page.click('#pwCancel');
  await expect(page.locator('#emptyMsg')).toHaveText('Ohne Passwort lässt sich die PDF nicht öffnen.');
  await page.setInputFiles('#inPick', S);
  await page.click('#pwOk');
  await expect(page.locator('#pwErr')).toHaveText('Bitte das Passwort eingeben.');
  await page.fill('#pwInput', 'sesam');
  await page.press('#pwInput', 'Enter');
  await expect(page.locator('#pwErr')).toHaveText('Falsches Passwort – bitte noch einmal versuchen.');
  await page.fill('#pwInput', 'Sesam');
  await page.click('#pwOk');
  await expect(pages(page)).toHaveCount(1);
  await expect(pages(page).first().locator('canvas')).toHaveCount(1);
  expect((await inked(page, 1)).dark).toBeGreaterThan(50);
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('encrypted: true');
  expect(text).toContain('wrong password');
  expect(text).not.toMatch(/sesam/i);
});

test('not a PDF or a damaged one gets a clear message; an open PDF stays', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#inPick', { name: 'bild.pdf', mimeType: 'application/pdf', buffer: Buffer.from('kein pdf') });
  await expect(page.locator('#emptyMsg')).toHaveText('Das ist keine PDF-Datei.');
  await page.setInputFiles('#inPick', { name: 'kaputt.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\nnonsense') });
  await expect(page.locator('#emptyMsg')).toHaveText('Die PDF konnte nicht geöffnet werden – sie ist vielleicht beschädigt.');
  await openPdf(page);
  await page.setInputFiles('#inPick', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('hallo') });
  await expect(page.locator('.toast')).toContainText('Das ist keine PDF-Datei.');
  await expect(pages(page)).toHaveCount(5);
});

test('works offline: pdf.js and its worker come from the offline cache', async ({ page, context }) => {
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await openPdf(page);
  expect((await inked(page, 1)).dark).toBeGreaterThan(50);
  await context.setOffline(false);
});

test('diagnostics count pages but never contain the file name', async ({ page }) => {
  await page.goto(URL_);
  await openPdf(page);
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('pages: 5');
  expect(text).toContain('opened');
  expect(text).not.toContain('bericht');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and messages in English, switching the language re-renders', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('h1')).toHaveText('PDF Viewer');
    await expect(page.locator('#btnPick')).toHaveText('Open PDF');
    await openPdf(page);
    await openMenu(page);
    await expect(page.locator('#docInfo')).toHaveText(/^bericht\.pdf · 5 page\(s\) · \d+ KB$/);
    await closeMenu(page);
    await switchLang(page, 'de');
    await openMenu(page);
    await expect(page.locator('#docInfo')).toHaveText(/5 Seite\(n\)/);
  });
});
