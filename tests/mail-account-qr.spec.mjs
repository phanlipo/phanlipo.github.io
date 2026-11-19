// Mail-Konto per QR: accounts → QR code in the format of Thunderbird's "Export for Mobile", and reading such codes.
// Expected payloads are written out by hand after comm-central mail/modules/QRExport.sys.mjs (see account-qr.js).
import { test, expect, switchLang, onDialog } from './helpers.mjs';

const URL_ = '/mail-account-qr/';
const LS = 'mail-account-qr.accounts.v1';
const qrText = page => page.locator('#qr').getAttribute('data-text');

// As Thunderbird desktop writes it: IMAP SSL/TLS normal password, SMTP STARTTLS, with passwords, two identities
const TB = JSON.stringify([1, [1, 1],
  [0, 'imap.example.org', 993, 3, 1, 'anna', 'Work', 'secret-in'],
  [[[0, 'smtp.example.org', 587, 2, 1, 'anna', 'secret-out'], ['anna@example.org', 'Anna Muster'], ['info@example.org', 'Info']]],
  [1, 'pop.example.net', 995, 3, 2, 'ben@example.net', '', ''],
  [[[0, 'mail.example.net', 465, 3, 2, 'ben@example.net', ''], ['ben@example.net', 'Ben']]],
]);

async function addAccount(page, { email, name = '', host, smtp }) {
  await page.fill('#fEmail', email);
  if (name) await page.fill('#fName', name);
  if (host) await page.fill('#fInHost', host);
  if (smtp) await page.fill('#fOutHost', smtp);
  await page.click('#btnFormSave');
  await expect(page.locator('#qrCard')).toBeVisible();
}

test.beforeEach(async ({ page }) => { await page.goto(URL_); });

test('first start shows only the form; a known provider fills the servers; the code matches Thunderbird’s format', async ({ page }) => {
  await expect(page.locator('#formCard')).toBeVisible();
  await expect(page.locator('#qrCard')).toBeHidden();
  await expect(page.locator('#btnFormCancel')).toBeHidden();
  await page.fill('#fEmail', 'max@gmx.de');
  await expect(page.locator('#fInHost')).toHaveValue('imap.gmx.net');
  await expect(page.locator('#fInPort')).toHaveValue('993');
  await expect(page.locator('#fOutHost')).toHaveValue('mail.gmx.net');
  await expect(page.locator('#fOutPort')).toHaveValue('587');
  await expect(page.locator('#fOutSec')).toHaveValue('2');
  await expect(page.locator('#fInUser')).toHaveValue('max@gmx.de');
  await expect(page.locator('#providerNote')).toContainText('gmx.de');
  await page.fill('#fName', 'Max Müller');
  await page.click('#btnFormSave');
  await expect(page.locator('#qrCard')).toBeVisible();
  await expect(page.locator('#qrNav')).toBeHidden();
  await expect(page.locator('#pwWarn')).toBeHidden();
  expect(JSON.parse(await qrText(page))).toEqual([1, [1, 1],
    [0, 'imap.gmx.net', 993, 3, 1, 'max@gmx.de', '', ''],
    [[[0, 'mail.gmx.net', 587, 2, 1, 'max@gmx.de', ''], ['max@gmx.de', 'Max Müller']]]]);
  await expect(page.locator('#accList li')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('#qrCard')).toBeVisible();
  expect(JSON.parse(await qrText(page))[2][1]).toBe('imap.gmx.net');
});

test('passwords go into the code but are never stored; saving the picture asks first', async ({ page }) => {
  await page.fill('#fEmail', 'eva@example.com');
  await page.fill('#fInHost', 'imap.example.com');
  await page.fill('#fOutHost', 'smtp.example.com');
  await page.fill('#fInPw', 'top-secret');
  await page.click('#btnFormSave');
  await expect(page.locator('#pwWarn')).toBeVisible();
  const data = JSON.parse(await qrText(page));
  expect(data[2][7]).toBe('top-secret');
  expect(data[3][0][0][6]).toBe('top-secret');          // same login for SMTP
  const stored = await page.evaluate(k => localStorage.getItem(k), LS);
  expect(stored).not.toContain('top-secret');
  expect(JSON.parse(stored)[0]).toMatchObject({ email: 'eva@example.com', inHost: 'imap.example.com', inPort: 993, outPort: 587 });
  await onDialog(page, d => d.dismiss(), { once: true });
  let downloaded = false; page.on('download', () => { downloaded = true; });
  await page.click('#btnSaveImg');
  expect(downloaded).toBe(false);
  // After a reload the password is gone (not stored), the account stays
  await page.reload();
  await expect(page.locator('#pwWarn')).toBeHidden();
  expect(JSON.parse(await qrText(page))[2][7]).toBe('');
  const download = page.waitForEvent('download');
  await page.click('#btnSaveImg');
  expect((await download).suggestedFilename()).toBe('mail-account-qr.png');
});

test('form checks the input; ports follow encryption and protocol unless typed by hand', async ({ page }) => {
  await page.fill('#fEmail', 'ü@example.com');
  await page.click('#btnFormSave');
  await expect(page.locator('#formError')).toContainText('E-Mail-Adresse');
  await page.fill('#fEmail', 'a@example.com');
  await page.click('#btnFormSave');
  await expect(page.locator('#formError')).toContainText('Posteingang');
  await page.fill('#fInHost', 'mail.example.com');
  await expect(page.locator('#fInPort')).toHaveValue('993');
  await page.selectOption('#fInSec', '2');
  await expect(page.locator('#fInPort')).toHaveValue('143');
  await page.locator('#fInProto [data-proto="1"]').click();
  await expect(page.locator('#fInPort')).toHaveValue('110');
  await page.selectOption('#fInSec', '3');
  await expect(page.locator('#fInPort')).toHaveValue('995');
  await page.selectOption('#fOutSec', '3');
  await expect(page.locator('#fOutPort')).toHaveValue('465');
  await page.fill('#fOutPort', '2525');
  await page.selectOption('#fOutSec', '2');
  await expect(page.locator('#fOutPort')).toHaveValue('2525');
  await page.fill('#fOutHost', 'mail.example.com');
  await page.uncheck('#fSame');
  await page.fill('#fOutUser', 'smtp-user');
  await page.click('#btnFormSave');
  expect(JSON.parse(await qrText(page))).toEqual([1, [1, 1],
    [1, 'mail.example.com', 995, 3, 1, 'a@example.com', '', ''],
    [[[0, 'mail.example.com', 2525, 2, 1, 'smtp-user', ''], ['a@example.com', '']]]]);
});

test('four accounts make two codes of three and one; edit and delete with undo', async ({ page }) => {
  await addAccount(page, { email: 'a@gmail.com' });
  for (const n of ['b', 'c', 'd']) {
    await page.click('#btnAdd');
    await addAccount(page, { email: `${n}@web.de` });
  }
  await expect(page.locator('#accList li')).toHaveCount(4);
  await expect(page.locator('#qrCount')).toHaveText('Code 2 von 2');
  let data = JSON.parse(await qrText(page));
  expect(data[1]).toEqual([2, 2]);
  expect(data.length).toBe(4);
  await page.click('#btnPrev');
  await expect(page.locator('#qrCount')).toHaveText('Code 1 von 2');
  data = JSON.parse(await qrText(page));
  expect(data[1]).toEqual([1, 2]);
  expect(data.length).toBe(2 + 3 * 2);
  expect(data[2]).toEqual([0, 'imap.gmail.com', 993, 3, 6, 'a@gmail.com', '', '']);
  await expect(page.locator('#oauthNote')).toBeVisible();
  // Edit
  await page.getByRole('button', { name: 'Bearbeiten: b@web.de' }).click();
  await expect(page.locator('#formTitle')).toHaveText('Konto bearbeiten');
  await expect(page.locator('#fInHost')).toHaveValue('imap.web.de');
  await page.fill('#fAccName', 'Privat');
  await page.click('#btnFormSave');
  await expect(page.locator('#accList li').nth(1)).toContainText('Privat');
  // Delete one, then undo
  await page.getByRole('button', { name: 'Löschen: d@web.de' }).click();
  await expect(page.locator('#accList li')).toHaveCount(3);
  await expect(page.locator('#qrNav')).toBeHidden();
  await page.locator('#toast .toast-action').click();
  await expect(page.locator('#accList li')).toHaveCount(4);
});

test('reads a pasted Thunderbird code, hides passwords until asked, takes it over unchanged', async ({ page }) => {
  await page.locator('#viewSeg [data-view="read"]').click();
  await expect(page.locator('#readCard')).toBeVisible();
  await page.locator('#readCard summary').click();
  await page.fill('#pasteIn', TB);
  await page.click('#btnPaste');
  await expect(page.locator('#partsInfo')).toHaveText('2 Konto/Konten gelesen.');
  const first = page.locator('#resultList .acc').first();
  await expect(first.locator('h3')).toHaveText('Work');
  await expect(first).toContainText('imap.example.org');
  await expect(first).toContainText('SSL/TLS');
  await expect(first).toContainText('info@example.org');
  await expect(first).not.toContainText('secret-in');
  await first.getByRole('button', { name: 'Passwort zeigen' }).first().click();
  await expect(first).toContainText('secret-in');
  const second = page.locator('#resultList .acc').nth(1);
  await expect(second.locator('h3')).toHaveText('ben@example.net');
  await expect(second).toContainText('POP3');
  await expect(second).toContainText('Passwort, verschlüsselt');
  await expect(second).toContainText('wird auf dem Handy gefragt');
  // Taking over gives the very same code again (round trip)
  await page.click('#btnTakeOver');
  await expect(page.locator('#qrCard')).toBeVisible();
  expect(JSON.parse(await qrText(page))).toEqual(JSON.parse(TB));
  expect(await page.evaluate(k => localStorage.getItem(k), LS)).not.toContain('secret');
});

test('codes of a multi-code export are collected; wrong codes give a clear message', async ({ page }) => {
  await page.locator('#viewSeg [data-view="read"]').click();
  await page.locator('#readCard summary').click();
  await page.fill('#pasteIn', 'https://example.com');
  await page.click('#btnPaste');
  await expect(page.locator('#readError')).toHaveText('Das ist kein Konten-Code von Thunderbird.');
  await page.fill('#pasteIn', JSON.stringify([2, [1, 1]]));
  await page.click('#btnPaste');
  await expect(page.locator('#readError')).toContainText('neueres Format');
  await page.fill('#pasteIn', JSON.stringify([1, [1, 1], [0, 'h', 0, 3, 1, 'u'], [[[0, 'h', 25, 0, 0, 'u'], ['a@b.c', '']]]]));
  await page.click('#btnPaste');
  await expect(page.locator('#readError')).toContainText('beschädigt');
  const acc = (h, e) => [[0, h, 993, 3, 1, e], [[[0, h, 465, 3, 1, e], [e, '']]]];
  await page.fill('#pasteIn', JSON.stringify([1, [2, 2], ...acc('two.example', 'b@two.example')]));
  await page.click('#btnPaste');
  await expect(page.locator('#readError')).toBeHidden();
  await expect(page.locator('#partsInfo')).toContainText('Code 1 von 2 gelesen');
  await expect(page.locator('#btnTakeOver')).toBeDisabled();
  await page.fill('#pasteIn', JSON.stringify([1, [1, 2], ...acc('one.example', 'a@one.example')]));
  await page.click('#btnPaste');
  await expect(page.locator('#partsInfo')).toHaveText('2 Konto/Konten gelesen.');
  // In the order of the codes, not of scanning
  await expect(page.locator('#resultList .acc h3')).toHaveText(['a@one.example', 'b@two.example']);
  await page.click('#btnDiscard');
  await expect(page.locator('#resultCard')).toBeHidden();
});

test('reads the QR code in a picture (zxing-wasm), also UTF-8 names', async ({ page }) => {
  const code = JSON.stringify([1, [1, 1], [0, 'imap.example.de', 993, 3, 1, 'jörg'], [[[0, 'smtp.example.de', 587, 2, 1, 'jörg'], ['joerg@example.de', 'Jörg Groß']]]]);
  const png = await page.evaluate(async text => {
    const c = document.createElement('canvas'); P2P.drawQr(c, text);
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    return [...new Uint8Array(await b.arrayBuffer())];
  }, code);
  await page.locator('#viewSeg [data-view="read"]').click();
  await page.setInputFiles('#fileIn', { name: 'qr.png', mimeType: 'image/png', buffer: Buffer.from(png) });
  await expect(page.locator('#partsInfo')).toHaveText('1 Konto/Konten gelesen.');
  await expect(page.locator('#resultList')).toContainText('Jörg Groß');
  await expect(page.locator('#resultList')).toContainText('jörg');
  // A picture without a code
  const blank = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = c.height = 200;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200);
    return [...new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())];
  });
  await page.setInputFiles('#fileIn', { name: 'blank.png', mimeType: 'image/png', buffer: Buffer.from(blank) });
  await expect(page.locator('#readError')).toHaveText('Im Bild wurde kein QR-Code gefunden.');
});

test('UTF-8 read as Latin-1 by a decoder is repaired', async ({ page }) => {
  expect(await page.evaluate(() => AccountQr.fixUtf8('JÃ¶rg GroÃ\u009f'))).toBe('Jörg Groß');
  expect(await page.evaluate(() => AccountQr.fixUtf8('Jörg'))).toBe('Jörg');
  expect(await page.evaluate(() => AccountQr.fixUtf8('plain'))).toBe('plain');
});

test('camera denied: message, back to the choices', async ({ page }) => {
  await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('no', 'NotAllowedError'); }; });
  await page.reload();
  await page.locator('#viewSeg [data-view="read"]').click();
  await page.click('#btnScan');
  await expect(page.locator('#readError')).toContainText('Kamera nicht erlaubt');
  await expect(page.locator('#scanArea')).toBeHidden();
  await expect(page.locator('#btnScan')).toBeVisible();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script follow the language', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#formTitle')).toHaveText('Add account');
    await expect(page.locator('#fInSec option').first()).toHaveText('SSL/TLS');
    await expect(page.locator('#fInAuth option').first()).toHaveText('Password, normal');
    await addAccount(page, { email: 'x@posteo.de' });
    for (const n of ['y', 'z', 'w']) { await page.click('#btnAdd'); await addAccount(page, { email: `${n}@posteo.de` }); }
    await expect(page.locator('#qrCount')).toHaveText('Code 2 of 2');
    await switchLang(page, 'de');
    await expect(page.locator('#qrCount')).toHaveText('Code 2 von 2');
  });
});
