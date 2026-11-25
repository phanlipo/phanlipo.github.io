// PDF ansehen: full-screen PDF viewer. Test PDFs are built by pdf-tools.mjs, so every page is recognised
// by its own text; rendering is checked by reading pixels back from the canvas.
import { test, expect, openMenu, closeMenu, switchLang, mockAndroidShare, mockLaunchQueue, onDialog } from './helpers.mjs';

/** Opens the menu at its settings page ("Anzeige", a sub page of the menu) */
async function openSettings(page) {
  await openMenu(page);
  if (!(await page.locator('#setPage').evaluate(d => d.open))) await page.locator('#setPage > summary').click();
}
import { makePdf, scanPdf, SCAN_TITLE, SCAN_LINES } from './pdf-tools.mjs';

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
  await openSettings(page);
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
  await openSettings(page);
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

test('opened with the installed app (Windows "Open with"): the PDF opens right away', async ({ page }) => {
  await mockLaunchQueue(page, [P('doppelklick.pdf', ['D1', 'D2', 'D3'])]);
  await page.goto(`${URL_}?opened=1`);
  await expect(pages(page)).toHaveCount(3);
  await expect(page.locator('#docName')).toHaveText('doppelklick.pdf');
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

const kept = page => page.evaluate(async () => {
  const r = await (await caches.open('file:pdf-viewer')).match('kept-file');
  return r ? { name: decodeURIComponent(r.headers.get('X-File-Name')), size: (await r.blob()).size } : null;
});

test('the open PDF is kept: after a reload (app update) it opens again at the remembered page', async ({ page }) => {
  await page.goto(URL_);
  const f = P();
  await openPdf(page, f);
  await expect.poll(() => kept(page)).toEqual({ name: 'bericht.pdf', size: f.buffer.length });
  await page.locator('#pageRange').fill('3');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('pdf-viewer.positions.v1'))).toMatch(/"p":3/);
  await page.reload();
  await expect(pages(page)).toHaveCount(5);
  await expect(page.locator('#docName')).toHaveText('bericht.pdf');
  await expect(page.locator('#pageLabel')).toHaveText('3 / 5');
  await expect(page.locator('.toast')).toContainText('Weiter auf Seite 3');
  await expect(pages(page).nth(2).locator('canvas')).toHaveCount(1);
  expect((await inked(page, 3)).dark).toBeGreaterThan(50);
  // a newly opened PDF replaces the kept one
  await page.setInputFiles('#inPick', P('neu.pdf', ['N1', 'N2']));
  await expect(pages(page)).toHaveCount(2);
  await expect.poll(() => kept(page).then(k => k && k.name)).toBe('neu.pdf');
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('kept: true');
  expect(text).toContain('restore kept file');
  expect(text).not.toContain('bericht');
});

test('closing the PDF, turning keeping off and deleting all data remove the kept file', async ({ page }) => {
  await page.goto(URL_);
  await openPdf(page);
  await expect.poll(() => kept(page)).not.toBeNull();
  // close: back to the start screen, nothing reopens
  await openMenu(page);
  await page.click('#btnClose');
  await expect(page.locator('#appMenu')).toBeHidden();
  await expect(page.locator('#btnPick')).toBeVisible();
  await expect(page.locator('#pages')).toBeHidden();
  await expect(page.locator('#bar')).toBeHidden();
  await expect(page).toHaveTitle('PDF ansehen');
  await expect.poll(() => kept(page)).toBeNull();
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.locator('#btnPick')).toBeVisible();
  await expect(pages(page)).toHaveCount(0);
  // the setting off: not kept
  await openSettings(page);
  await page.locator('#optKeep').uncheck();
  await closeMenu(page);
  await openPdf(page);
  await page.waitForTimeout(300);
  expect(await kept(page)).toBeNull();
  await page.reload();
  await page.waitForTimeout(500);
  await expect(pages(page)).toHaveCount(0);
  // on again: the open PDF is kept right away
  await openPdf(page);
  await openSettings(page);
  await page.locator('#optKeep').check();
  await expect.poll(() => kept(page)).not.toBeNull();
  // "Alle Daten löschen" removes it too (back from the settings page to the menu list first)
  await onDialog(page, d => d.accept(), { once: true });
  await page.locator('#setPage > summary').click();
  await page.locator('#appMenu details.data summary').click();
  await page.locator('[data-data="clear"]').click();
  await page.waitForURL(/pdf-viewer/);
  await expect.poll(() => kept(page)).toBeNull();
  await expect(page.locator('#btnPick')).toBeVisible();
});

test('a damaged kept file is dropped instead of failing on every start', async ({ page }) => {
  await page.goto(URL_);
  await page.evaluate(async () => {
    const c = await caches.open('file:pdf-viewer');
    await c.put('kept-file', new Response('%PDF-1.4\nnonsense', { headers: { 'Content-Type': 'application/pdf', 'X-File-Name': 'x.pdf' } }));
  });
  await page.reload();
  await expect(page.locator('#emptyMsg')).toHaveText('Die PDF konnte nicht geöffnet werden – sie ist vielleicht beschädigt.');
  await expect.poll(() => kept(page)).toBeNull();
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

/** A PDF whose first page holds web and mail addresses as plain text, a link area to a web address and one to page 3 */
const linkPdf = () => ({
  name: 'links.pdf', mimeType: 'application/pdf', buffer: makePdf([
    { texts: [
      { x: 72, y: 760, size: 14, text: 'Mehr unter www.example.org.' },
      { x: 72, y: 730, size: 14, text: 'Formular: https://example.com/a/b?x=1, danke' },
      { x: 72, y: 700, size: 14, text: 'Mail an info@example.net oder nicht' },
      { x: 72, y: 670, size: 14, text: 'Kein Link: foo.bar und 1.5 und wwwx' },
      { x: 72, y: 600, size: 14, text: 'HIER KLICKEN' },
      { x: 72, y: 560, size: 14, text: 'ZU SEITE DREI' },
    ], links: [
      { rect: [70, 595, 200, 615], uri: 'https://example.com/hidden' },
      { rect: [70, 555, 200, 575], page: 2 },
    ] },
    { texts: [{ x: 72, y: 700, size: 40, text: 'S2' }] },
    { texts: [{ x: 72, y: 700, size: 40, text: 'S3' }] },
  ]),
});

test('text can be selected and copied: invisible text layer over the page, following the zoom', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  await openPdf(page, P('text.pdf', ['Hallo Welt', 'Zweite Seite', 'S3']), 3);
  const layer = pages(page).first().locator('.textLayer');
  await expect(layer).toHaveText(/Hallo Welt/);
  // the text sits where the canvas shows it: Courier 40 pt at x 72, y 700 (from the bottom) of 595 × 842
  const span = layer.locator('span', { hasText: 'Hallo Welt' });
  const check = async () => {
    const pb = await pages(page).first().boundingBox(), sb = await span.boundingBox();
    const k = pb.width / 595;
    expect(sb.x - pb.x).toBeCloseTo(72 * k, -0.5);
    expect(sb.width).toBeCloseTo(10 * 0.6 * 40 * k, -0.5);        // Courier: 0.6 em per character
    expect(sb.y - pb.y + sb.height).toBeGreaterThan((842 - 700 - 4) * k);
    expect(sb.y - pb.y).toBeLessThan((842 - 700) * k);
  };
  await check();
  await page.keyboard.press('+');
  await expect.poll(() => pages(page).first().evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(400);
  await check();
  // selecting with the mouse selects the text and does not toggle the bars
  await page.keyboard.press('0');
  const sb = await span.boundingBox();
  const before = await hidden(page);
  await page.mouse.move(sb.x + 2, sb.y + sb.height / 2);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width - 2, sb.y + sb.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => getSelection().toString())).toMatch(/^Hallo Wel/);
  await page.waitForTimeout(400);
  expect(await hidden(page)).toBe(before);
});

test('links: web and mail addresses in the text and link areas of the PDF can be tapped', async ({ page, context }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  await page.setInputFiles('#inPick', linkPdf());
  await expect(pages(page)).toHaveCount(3);
  const p1 = pages(page).first();
  const textLinks = p1.locator('.textLayer a');
  await expect(textLinks).toHaveCount(3);
  expect(await textLinks.evaluateAll(as => as.map(a => [a.textContent, a.getAttribute('href'), a.target]))).toEqual([
    ['www.example.org', 'https://www.example.org/', '_blank'],
    ['https://example.com/a/b?x=1', 'https://example.com/a/b?x=1', '_blank'],
    ['info@example.net', 'mailto:info@example.net', ''],
  ]);
  expect(await textLinks.first().getAttribute('rel')).toBe('noopener noreferrer');
  // the text stays whole for copying
  await expect(p1.locator('.textLayer')).toContainText('Mehr unter www.example.org.');
  // link areas of the PDF
  const areas = p1.locator('.linkLayer a');
  await expect(areas).toHaveCount(2);
  await expect(areas.first()).toHaveAttribute('href', 'https://example.com/hidden');
  await expect(areas.first()).toHaveAttribute('aria-label', 'Link: https://example.com/hidden');
  const pb = await p1.boundingBox(), ab = await areas.first().boundingBox(), k = pb.width / 595;
  expect(ab.x - pb.x).toBeCloseTo(70 * k, 0);
  expect(ab.y - pb.y).toBeCloseTo((842 - 615) * k, 0);
  expect(ab.width).toBeCloseTo(130 * k, 0);
  // tapping a web address opens it in a new tab (blocked here: no request leaves the test)
  await context.route('https://www.example.org/**', r => r.fulfill({ body: 'ok', contentType: 'text/plain' }));
  const before = await hidden(page);
  const [popup] = await Promise.all([context.waitForEvent('page'), textLinks.first().click()]);
  await expect.poll(() => popup.url()).toBe('https://www.example.org/');
  await popup.close();
  await page.waitForTimeout(400);
  expect(await hidden(page), 'a link tap does not toggle the bars').toBe(before);
  // a link to a page of the document scrolls there
  await areas.nth(1).click();
  await expect(page.locator('#pageLabel')).toHaveText('3 / 3');
});

/** Pages of Courier text lines (14 pt, from y 760 down in steps of 30) */
const textPdf = (pages, options) => makePdf(pages.map(lines => ({ texts: lines.map((text, i) => ({ x: 72, y: 760 - 30 * i, size: 14, text })) })), options);

test('search: finds text on all pages, marks the hits, steps through them and wraps around', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  await expect(page.locator('#btnFind')).toBeHidden();
  const pdf = textPdf([
    ['Erste Seite mit Apfel', 'und noch ein APFEL hier'],
    ['Zweite Seite ohne Treffer'],
    ['Dritte Seite', 'Birne und Apfelkuchen'],
    ['Vierte Seite: Mitglieder', 'versammlung am Abend'],
  ]);
  await openPdf(page, { name: 'suche.pdf', mimeType: 'application/pdf', buffer: pdf }, 4);
  await page.click('#btnFind');
  await expect(page.locator('#findInput')).toBeFocused();
  await expect(page.locator('#appTitle, #docName').first()).toBeHidden();
  await page.locator('#findInput').fill('apfel');
  // 3 hits: two on page 1 (case-insensitive), one on page 3 – the first is shown and marked
  await expect(page.locator('#findCount')).toHaveText('1 / 3');
  const hl = n => pages(page).nth(n - 1).locator('.hlLayer div');
  await expect(hl(1)).toHaveCount(2);
  await expect(hl(1).first()).toHaveClass('cur');
  // the box covers the word: "Apfel" = characters 16–20 of line 1 (Courier 0.6 em at 14 pt, from x 72)
  const pb = await pages(page).first().boundingBox(), hb = await hl(1).first().boundingBox(), k = pb.width / 595;
  expect(hb.x - pb.x).toBeCloseTo((72 + 16 * 0.6 * 14) * k, -0.5);
  expect(hb.width).toBeCloseTo(5 * 0.6 * 14 * k, -0.5);
  // Enter = next, arrows, wrap around at the end
  await page.keyboard.press('Enter');
  await expect(page.locator('#findCount')).toHaveText('2 / 3');
  await expect(hl(1).nth(1)).toHaveClass('cur');
  await page.click('#findNext');
  await expect(page.locator('#findCount')).toHaveText('3 / 3');
  await expect(page.locator('#pageLabel')).toHaveText('3 / 4');
  await expect(pages(page).nth(2).locator('.hlLayer .cur')).toBeInViewport();
  await page.click('#findNext');
  await expect(page.locator('#findCount')).toHaveText('1 / 3');
  await page.locator('#findInput').press('Shift+Enter');
  await expect(page.locator('#findCount')).toHaveText('3 / 3');
  // words are found across a line break and with missing spaces
  await page.locator('#findInput').fill('mitglieder versammlung');
  await expect(page.locator('#findCount')).toHaveText('1 / 1');
  await expect(page.locator('#pageLabel')).toHaveText('4 / 4');
  await page.locator('#findInput').fill('banane');
  await expect(page.locator('#findCount')).toHaveText('0 / 0');
  await expect(page.locator('#findNext')).toBeDisabled();
  await expect(page.locator('.hlLayer')).toHaveCount(0);
  // the bars stay while searching; Esc closes the search and removes the marks
  await page.locator('#findInput').fill('apfel');
  await expect(page.locator('#findCount')).toHaveText(/^\d \/ 3$/);
  await page.locator('main').evaluate(m => { m.scrollTop += 400; });
  await page.waitForTimeout(300);
  expect(await hidden(page)).toBe(false);
  await page.locator('#findInput').press('Escape');
  await expect(page.locator('#findBar')).toBeHidden();
  await expect(page.locator('.hlLayer')).toHaveCount(0);
  await expect(page.locator('#docName')).toBeVisible();
  // Ctrl + F opens it again with the last text selected
  await page.keyboard.press('Control+f');
  await expect(page.locator('#findInput')).toBeFocused();
  // the diagnosis never contains the search text
  const diag = await page.evaluate(() => Tools.diag.text());
  expect(diag).toContain('search');
  expect(diag.toLowerCase()).not.toContain('apfel');
});

test('search: the text layer of each page matches the searched text', async ({ page }) => {
  // hits are found in pdf.js' text content and drawn on the text layer – both must give the same string
  await page.goto(URL_);
  await openPdf(page, { name: 'x.pdf', mimeType: 'application/pdf', buffer: linkPdf().buffer }, 3);
  await expect(pages(page).first().locator('.textLayer')).toHaveCount(1);
  await page.click('#btnFind');
  await page.locator('#findInput').fill('example');
  await expect(page.locator('#findCount')).toHaveText('1 / 3');   // www.example.org, example.com, info@example.net (the link area has no text)
  await expect(pages(page).first().locator('.hlLayer div')).toHaveCount(3);   // also inside the links of the text layer
});

test('table of contents: bookmarks of the PDF in the menu, a tap goes to the page', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  await openPdf(page);
  await openMenu(page);
  await expect(page.locator('#tocPage')).toBeHidden();       // no bookmarks
  await closeMenu(page);
  const pdf = textPdf([['Titel'], ['Kapitel 1'], ['Teil 1.1'], ['Kapitel 2'], ['Anhang']], {
    outline: [
      { title: 'Kapitel 1', page: 1, children: [{ title: 'Teil 1.1', page: 2 }] },
      { title: 'Kapitel 2', page: 3 },
      { title: 'Anhang (A)', page: 4 },
    ],
  });
  await openPdf(page, { name: 'buch.pdf', mimeType: 'application/pdf', buffer: pdf }, 5);
  await openMenu(page);
  await expect(page.locator('#tocPage')).toBeVisible();
  await page.locator('#tocPage > summary').click();
  const rows = page.locator('#tocList button');
  await expect(rows).toHaveCount(4);
  await expect(rows.locator('.toc-title')).toHaveText(['Kapitel 1', 'Teil 1.1', 'Kapitel 2', 'Anhang (A)']);
  await expect(rows.locator('.toc-page')).toHaveText(['S. 2', 'S. 3', 'S. 4', 'S. 5']);
  // the sub entry is indented
  const x = async n => (await rows.nth(n).locator('.toc-title').boundingBox()).x;
  expect(await x(1)).toBeGreaterThan(await x(0) + 10);
  await rows.nth(2).click();
  await expect(page.locator('#appMenu')).not.toBeVisible();
  await expect(page.locator('#pageLabel')).toHaveText('4 / 5');
});

test('text layer of a rotated page lies on the turned text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  const pdf = makePdf([{ rotate: 90, texts: [{ x: 72, y: 700, size: 40, text: 'Hallo Welt' }] }]);
  await openPdf(page, { name: 'quer.pdf', mimeType: 'application/pdf', buffer: pdf }, 1);
  const span = pages(page).first().locator('.textLayer span', { hasText: 'Hallo Welt' });
  await expect(span).toHaveCount(1);
  // turned 90° clockwise (842 × 595 on screen): PDF (x, y) → screen (y, x); the text runs downwards from (700, 72)
  const pb = await pages(page).first().boundingBox(), sb = await span.boundingBox(), k = pb.width / 842;
  expect(sb.y - pb.y).toBeCloseTo(72 * k, -0.5);
  expect(sb.height).toBeCloseTo(10 * 0.6 * 40 * k, -0.5);
  expect(sb.x - pb.x).toBeGreaterThan(690 * k);
  expect(sb.x - pb.x + sb.width).toBeLessThan(750 * k);
});

/* ---------- Scanned pages: text recognition (Tesseract from assets/vendor, as in PDF zu Word) ---------- */

async function openScan(page) {
  const pdf = await scanPdf(page);
  await page.setInputFiles('#inPick', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(pages(page)).toHaveCount(1);
}
async function recognise(page, how = 'toast') {
  if (how === 'toast') {
    await expect(page.locator('.toast')).toContainText('1 Seite(n) ohne Text');
    await page.locator('.toast .toast-action').click();
  } else {
    await openMenu(page);
    await expect(page.locator('#btnOcr')).toHaveText('Text erkennen (1 gescannte Seite(n))');
    await page.click('#btnOcr');
  }
  await expect(page.locator('#ocrStatus')).toBeVisible();
  await expect(page.locator('.toast')).toContainText('Text auf 1 Seite(n) erkannt', { timeout: 150000 });
  await expect(page.locator('#ocrStatus')).toBeHidden();
}

test('scanned page: offers text recognition; afterwards it can be selected, searched and read by agents', async ({ page }) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto(URL_);
  await expect(page.locator('#optOcrLang')).toHaveValue('deu');      // follows the app language
  await openScan(page);
  await expect(pages(page).first().locator('.textLayer')).toHaveText('');
  await recognise(page);
  const layer = pages(page).first().locator('.textLayer');
  await expect(layer).toContainText(SCAN_TITLE);
  await expect(layer).toContainText('Kündigungsfrist');
  // the invisible word lies on the word in the picture: title 20 pt bold at x 72 pt, baseline 100 pt from the top –
  // capitals reach about 0.72 em (14.4 pt) above it
  const pb = await pages(page).first().boundingBox(), k = pb.width / 595;
  const tb = await layer.locator('span', { hasText: SCAN_TITLE }).first().boundingBox();
  expect(Math.abs((tb.x - pb.x) / k - 72)).toBeLessThan(3);
  expect(Math.abs((tb.y - pb.y) / k - (100 - 14.4))).toBeLessThan(5);
  expect((tb.y - pb.y + tb.height) / k).toBeGreaterThan(98);
  // the menu has nothing left to recognise
  await openMenu(page);
  await expect(page.locator('#btnOcr')).toBeHidden();
  await closeMenu(page);
  // search finds the recognised text
  await page.click('#btnFind');
  await page.locator('#findInput').fill('miete beträgt');
  await expect(page.locator('#findCount')).toHaveText('1 / 1');
  await expect(pages(page).first().locator('.hlLayer .cur')).toHaveCount(2);   // one box per word
  // the diagnosis has counts only
  const diag = await page.evaluate(() => Tools.diag.text());
  expect(diag).toContain('ocr page');
  expect(diag).not.toContain('Kündigungsfrist');
});

test.describe('text recognition not available', () => {
  test.use({ allowedProblems: /tesseract|Failed to load resource|ERR_FAILED|net::/i });

  test('says so and can be tried again', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(URL_);
  await page.context().route(/tesseract-core/, r => r.abort());
  await openScan(page);
  await openMenu(page);
  await page.click('#btnOcr');
  await expect(page.locator('.toast')).toContainText('Texterkennung nicht möglich', { timeout: 60000 });
  await expect(page.locator('#ocrStatus')).toBeHidden();
  await openMenu(page);
  await expect(page.locator('#btnOcr')).toBeEnabled();     // can be tried again
  });
});

test('text recognition can be cancelled', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(URL_);
  await openScan(page);
  await openMenu(page);
  await page.click('#btnOcr');
  await expect(page.locator('#ocrStatus')).toBeVisible();
  await page.click('#ocrCancel');
  await expect(page.locator('#ocrStatus')).toBeHidden();
  await expect(page.locator('.toast')).toContainText('Texterkennung abgebrochen');
  await openMenu(page);
  await expect(page.locator('#btnOcr')).toHaveText('Text erkennen (1 gescannte Seite(n))');
});

test('text recognition works offline once it was used', async ({ page, context }) => {
  test.setTimeout(300000);
  await page.goto(URL_);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();                               // page controlled → downloads go through the cache
  const pdf = await scanPdf(page);
  await page.setInputFiles('#inPick', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf });
  await recognise(page);
  await context.setOffline(true);
  await page.reload();
  await page.setInputFiles('#inPick', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: pdf });
  await recognise(page);
  await expect(pages(page).first().locator('.textLayer')).toContainText(SCAN_LINES[0].split(' ')[0]);
  await context.setOffline(false);
});

test('hand-over: the open PDF goes to "PDF bearbeiten" and "PDF zu Word" on the device', async ({ page }) => {
  await page.goto(URL_);
  await openMenu(page);
  await expect(page.locator('#btnToEdit')).toBeDisabled();
  await closeMenu(page);
  await openPdf(page, P('bericht.pdf', ['S1', 'S2', 'S3']), 3);
  await openMenu(page);
  await page.click('#btnToEdit');
  await expect(page).toHaveURL(/\/pdf-edit\/$/);                 // ?shared=1 taken and removed
  await expect(page.locator('#pages li')).toHaveCount(3);
  await expect(page.locator('#files li')).toContainText('bericht.pdf');
  // back: the viewer still has its PDF (kept on the device)
  await page.goBack();
  await expect(page).toHaveURL(/\/pdf-viewer\//);
  await expect(pages(page)).toHaveCount(3);
  await openMenu(page);
  await page.click('#btnToWord');
  await expect(page).toHaveURL(/\/pdf2word\/$/);
  await expect(page.locator('#fileInfo')).toContainText('bericht.pdf');
  await expect(page.locator('#btnRun')).toBeEnabled();
});

test('night mode inverts the pages', async ({ page }) => {
  await page.goto(URL_);
  await openPdf(page);
  await openSettings(page);
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
  // the kept PDF opens again offline
  await page.reload();
  await expect(pages(page)).toHaveCount(5);
  await expect(pages(page).first().locator('canvas')).toHaveCount(1);
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

test('page slider ignores a swipe up from the bottom edge and a gesture the system takes over', async ({ page }) => {
  await page.goto(URL_);
  await openPdf(page);
  const touch = (type, x, y) => page.locator('#pageRange').evaluate((el, [type, x, y]) =>
    el.dispatchEvent(new PointerEvent(type, { pointerType: 'touch', clientX: x, clientY: y, bubbles: true })), [type, x, y]);
  const setValue = v => page.locator('#pageRange').evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  // finger lands on the slider (the browser jumps the value), then moves up: page stays
  await touch('pointerdown', 300, 640);
  await setValue('4');
  await expect(page.locator('#pageLabel')).toHaveText('1 / 5');
  await touch('pointermove', 302, 600);
  await touch('pointerup', 302, 560);
  await expect(page.locator('#pageLabel')).toHaveText('1 / 5');
  await expect(page.locator('#pageRange')).toHaveValue('1');
  // the system takes over the gesture: back to the page from before
  await touch('pointerdown', 300, 640);
  await setValue('5');
  await touch('pointercancel', 300, 640);
  await expect(page.locator('#pageLabel')).toHaveText('1 / 5');
  await expect(page.locator('#pageRange')).toHaveValue('1');
  // tap on the slider still jumps
  await touch('pointerdown', 200, 640);
  await setValue('3');
  await touch('pointerup', 200, 640);
  await expect(page.locator('#pageLabel')).toHaveText('3 / 5');
  // sideways drag turns pages while dragging
  await touch('pointerdown', 200, 640);
  await touch('pointermove', 240, 642);
  await setValue('5');
  await expect(page.locator('#pageLabel')).toHaveText('5 / 5');
  await touch('pointerup', 240, 642);
  await expect(page.locator('#pageLabel')).toHaveText('5 / 5');
});

test('in full screen the bottom bar keeps a free edge for the system swipe', async ({ page }) => {
  await page.goto(URL_);
  await openPdf(page);
  const pad = () => page.locator('#bar').evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
  expect(await pad()).toBeLessThan(10);
  await page.evaluate(() => document.documentElement.requestFullscreen());
  await expect(page.locator('body')).toHaveClass(/edge-gap/);
  expect(await pad()).toBeGreaterThanOrEqual(28);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator('body')).not.toHaveClass(/edge-gap/);
});
