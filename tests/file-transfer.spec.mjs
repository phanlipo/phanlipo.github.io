// Dateiübertragung: two browsers connect like the two-device games (codes by hand), files go both ways and
// arrive byte for byte (checked through the real download), texts and links, waiting files start after
// connecting, cancelling on the receiving side keeps the protocol in step for the next file, kept list and
// files after a reload, English. The protocol itself is described in file-transfer/index.html.
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test, expect, axe, switchLang, clipboardText, privateClipboard, openDetails, openMenu, onDialog } from './helpers.mjs';

const URL_ = '/file-transfer/';
const sha = buf => createHash('sha256').update(buf).digest('hex');

/** A second device: own context and clipboard, fails on JS errors or external requests */
async function secondDevice(browser, baseURL) {
  const context = await browser.newContext({ baseURL, locale: 'de-DE' });
  const page = await context.newPage();
  await privateClipboard(page);
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(baseURL) && !/^(data|blob):/.test(u)) problems.push(`external request: ${u}`); });
  await page.goto(URL_);
  return { context, page, problems };
}
async function connect(host, guest) {
  await host.click('#btnHost');
  await expect(host.locator('#qrOffer')).toHaveAttribute('data-text', /#join=O1~/);
  await host.click('#btnCopyOffer');
  const link = await clipboardText(host);
  await openDetails(guest, 'Verbindungs-Code von Hand eingeben');
  await guest.fill('#offerIn', link);
  await guest.click('#btnOfferIn');
  await expect(guest.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  await guest.click('#btnCopyAnswer');
  const reply = await clipboardText(guest);
  await openDetails(host, 'Antwort-Code von Hand eingeben');
  await host.fill('#answerIn', reply);
  await host.click('#btnAnswerIn');
  for (const p of [host, guest]) await expect(p.locator('#connOn')).toBeVisible({ timeout: 15000 });
}
/** Number of rows in the stored list (Tools.keep, written shortly after each change) */
const keptRows = page => page.evaluate(async () => ((await Tools.keep.json('list', null)) || { items: [] }).items.length);
const row = (page, text) => page.locator('#list li', { hasText: text });
/** Downloads a received file through its button and returns the bytes */
async function download(page, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), row(page, name).getByRole('button', { name: `Herunterladen: ${name}` }).click()]);
  expect(dl.suggestedFilename()).toBe(name);
  return readFileSync(await dl.path());
}

test('two devices: waiting files start after connecting, arrive unchanged; text back; kept after reload', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(90000);
  await privateClipboard(host);
  await host.goto(URL_);
  await expect(host.locator('#empty')).toBeVisible();
  const big = randomBytes(2.5 * 1024 * 1024 + 123), small = Buffer.from('Hallo Welt\n');
  await host.setInputFiles('#fileIn', [
    { name: 'video.bin', mimeType: 'application/octet-stream', buffer: big },
    { name: 'notiz.txt', mimeType: 'text/plain', buffer: small },
  ]);
  await expect(row(host, 'video.bin')).toContainText('wartet auf Verbindung');
  await expect(row(host, 'notiz.txt')).toContainText('wartet auf Verbindung');
  // An empty file works too (no bytes, only header and end)
  await host.setInputFiles('#fileIn', { name: 'leer.dat', mimeType: '', buffer: Buffer.alloc(0) });

  const g = await secondDevice(browser, baseURL), guest = g.page;
  await connect(host, guest);
  for (const n of ['video.bin', 'notiz.txt', 'leer.dat']) {
    await expect(row(guest, n)).toContainText('empfangen', { timeout: 20000 });
    await expect(row(host, n)).toContainText('gesendet');
  }
  await expect(row(guest, 'video.bin')).toContainText('2,5 MB');
  expect(sha(await download(guest, 'video.bin'))).toBe(sha(big));
  expect((await download(guest, 'notiz.txt')).toString()).toBe('Hallo Welt\n');
  expect((await download(guest, 'leer.dat')).length).toBe(0);
  // Sent rows have no download, received ones do
  await expect(row(host, 'video.bin').getByRole('button', { name: /Herunterladen/ })).toHaveCount(0);

  // The other way round: a link as text, shown as a link and copyable
  await guest.fill('#textIn', 'https://example.org/seite?a=1');
  await guest.click('#btnSendText');
  const link = host.locator('#list a.text');
  await expect(link).toHaveText('https://example.org/seite?a=1');
  await expect(link).toHaveAttribute('rel', /noopener/);
  await row(host, 'https://example.org').getByRole('button', { name: 'Text kopieren' }).click();
  expect(await clipboardText(host)).toBe('https://example.org/seite?a=1');
  await expect(guest.locator('#textIn')).toHaveValue('');
  // No empty text
  await guest.click('#btnSendText');
  await expect(guest.locator('#toast')).toHaveText('Erst einen Text eingeben.');

  // Received files survive a reload of the receiver (Tools.keep)
  await expect.poll(() => keptRows(guest)).toBe(4);
  await guest.reload();
  await expect(row(guest, 'video.bin')).toContainText('empfangen');
  expect(sha(await download(guest, 'video.bin'))).toBe(sha(big));
  await expect(guest.locator('#connLobby')).toBeVisible();
  // Host noticed the reload as a lost connection
  await expect(host.locator('#connLobby')).toBeVisible({ timeout: 20000 });
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test('two devices: receiver cancels a running file, the next one still arrives intact; both send at once', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(90000);
  // The sender reads its files in 1 MB blocks: from the second block on it waits until the test lets it go,
  // so the cancel surely comes in the middle of the file
  await host.addInitScript(() => {
    const read = Blob.prototype.arrayBuffer;
    let n = 0;
    Blob.prototype.arrayBuffer = async function () {
      if (window.__stall && n++ >= 1) await new Promise(r => { window.__release = r; });
      return read.call(this);
    };
  });
  await privateClipboard(host);
  await host.goto(URL_);
  const g = await secondDevice(browser, baseURL), guest = g.page;
  await connect(host, guest);
  await host.evaluate(() => { window.__stall = true; });
  const big = randomBytes(5 * 1024 * 1024), after = randomBytes(300 * 1024);
  await host.setInputFiles('#fileIn', { name: 'gross.bin', mimeType: 'application/octet-stream', buffer: big });
  await expect(row(guest, 'gross.bin')).toContainText('wird empfangen … 1,0 MB von 5,0 MB');
  await expect(row(guest, 'gross.bin').locator('progress')).toHaveAttribute('value', String(1024 * 1024));
  await row(guest, 'gross.bin').getByRole('button', { name: 'Abbrechen: gross.bin' }).click();
  await expect(row(guest, 'gross.bin')).toContainText('abgebrochen');
  await expect(row(host, 'gross.bin')).toContainText('abgebrochen');
  await host.evaluate(() => { window.__stall = false; window.__release && window.__release(); });
  // Both send at the same time
  await host.setInputFiles('#fileIn', { name: 'danach.bin', mimeType: 'application/octet-stream', buffer: after });
  await guest.setInputFiles('#fileIn', { name: 'zurueck.bin', mimeType: 'application/octet-stream', buffer: big });
  await expect(row(guest, 'danach.bin')).toContainText('empfangen', { timeout: 20000 });
  await expect(row(host, 'zurueck.bin')).toContainText('empfangen', { timeout: 20000 });
  expect(sha(await download(guest, 'danach.bin'))).toBe(sha(after));
  const [dl] = await Promise.all([host.waitForEvent('download'), row(host, 'zurueck.bin').getByRole('button', { name: 'Herunterladen: zurueck.bin' }).click()]);
  expect(sha(readFileSync(await dl.path()))).toBe(sha(big));
  // The cancelled file left nothing behind on the receiver
  await expect(row(guest, 'gross.bin').getByRole('button', { name: /Herunterladen/ })).toHaveCount(0);

  // Disconnect: the other side is told and back at the start
  await host.click('#btnLeave');
  await expect(guest.locator('#connLobby')).toBeVisible();
  await expect(guest.locator('#lobbyStatus')).toHaveText('Verbindung getrennt.');
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test('waiting files and texts are kept over a reload; remove with undo; clear list', async ({ page }) => {
  await page.goto(URL_);
  await page.setInputFiles('#fileIn', { name: 'foto.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.fill('#textIn', 'Einkaufsliste');
  await page.click('#btnSendText');
  await expect(page.locator('#list li')).toHaveCount(2);
  // Pictures get a preview
  await expect(row(page, 'foto.png').locator('img.thumb')).toHaveAttribute('src', /^blob:/);
  await expect.poll(() => keptRows(page)).toBe(2);
  await page.reload();
  await expect(page.locator('#toast')).toHaveText('2 Einträge vom letzten Mal wieder da.');
  await expect(row(page, 'foto.png')).toContainText('wartet auf Verbindung');
  await expect(row(page, 'Einkaufsliste')).toContainText('wartet auf Verbindung');
  // A waiting entry is cancelled, a finished one removed with undo
  await row(page, 'foto.png').getByRole('button', { name: 'Abbrechen: foto.png' }).click();
  await expect(row(page, 'foto.png')).toContainText('abgebrochen');
  await row(page, 'foto.png').getByRole('button', { name: 'Aus der Liste entfernen: foto.png' }).click();
  await expect(row(page, 'foto.png')).toHaveCount(0);
  await page.locator('#toast').getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row(page, 'foto.png')).toHaveCount(1);
  // Clear the list (asks first)
  await onDialog(page, d => d.accept());
  await openMenu(page);
  await page.click('#btnClear');
  await expect(page.locator('#empty')).toBeVisible();
  await expect.poll(() => keptRows(page)).toBe(0);
  await page.reload();
  await expect(page.locator('#empty')).toBeVisible();
  expect(await page.evaluate(() => Tools.keep.names())).toEqual(['list']);
});

test('wrong codes are explained, cancel returns to the start', async ({ page }) => {
  await page.goto(URL_);
  await openDetails(page, 'Verbindungs-Code von Hand eingeben');
  await page.fill('#offerIn', 'hallo');
  await page.click('#btnOfferIn');
  await expect(page.locator('#lobbyStatus')).toHaveText('Das ist kein gültiger Code.');
  await page.click('#btnHost');
  await expect(page.locator('#qrOffer')).toHaveAttribute('data-text', /#join=O1~/);
  const link = await page.locator('#qrOffer').getAttribute('data-text');
  await openDetails(page, 'Antwort-Code von Hand eingeben');
  await page.fill('#answerIn', link);
  await page.click('#btnAnswerIn');
  await expect(page.locator('#hostStatus')).toHaveText('Das ist ein Verbindungs-Code – hier wird der Antwort-Code gebraucht.');
  await page.click('#btnHostCancel');
  await expect(page.locator('#connLobby')).toBeVisible();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, states and axe', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#btnHost')).toContainText('Start connection');
    await page.setInputFiles('#fileIn', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('a') });
    await expect(row(page, 'a.txt')).toContainText('waiting for a connection');
    await expect(row(page, 'a.txt').getByRole('button', { name: 'Cancel: a.txt' })).toBeVisible();
    await switchLang(page, 'de');
    await expect(row(page, 'a.txt')).toContainText('wartet auf Verbindung');
    await switchLang(page, 'en');
    expect((await axe(page).analyze()).violations).toEqual([]);
  });
});
