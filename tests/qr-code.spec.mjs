// QR-Code-Generator: codes are decoded with an independent reader (ZXing-JS from assets/vendor,
// not the generator library), WLAN format, size limit, share target (Android) and history.
import { test, expect, onDialog } from './helpers.mjs';

const URL_ = '/qr-code/';

/** Decodes the QR code in a canvas (selector) or in PNG bytes with ZXing-JS */
async function decode(page, { selector = '#qr', png } = {}) {
  if (!(await page.evaluate(() => !!window.ZXing)))
    await page.addScriptTag({ url: new URL('/assets/vendor/zxing-library/index.min.js', page.url()).href });
  return page.evaluate(async ({ selector, b64 }) => {
    const Z = window.ZXing;
    let canvas = document.querySelector(selector);
    if (b64) {
      const img = new Image();
      img.src = 'data:image/png;base64,' + b64;
      await img.decode();
      canvas = document.createElement('canvas');
      canvas.width = img.width; canvas.height = img.height;
      canvas.getContext('2d').drawImage(img, 0, 0);
    }
    const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
    // PURE_BARCODE: a generated image (no camera photo) – the reader takes the grid from the corners
    const hints = new Map([[Z.DecodeHintType.CHARACTER_SET, 'UTF-8'], [Z.DecodeHintType.PURE_BARCODE, true]]);
    return { text: new Z.QRCodeReader().decode(bitmap, hints).getText(), width: canvas.width, height: canvas.height };
  }, { selector, b64: png ? png.toString('base64') : null });
}

const histTexts = page => page.locator('#hist .snip').allTextContents();

test.beforeEach(async ({ page }) => {
  await page.goto(URL_);
});

test('a link becomes a readable QR code', async ({ page }) => {
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#btnSave')).toBeDisabled();
  const link = 'https://example.org/pfad?x=1&y=zwei#anker';
  await page.fill('#txt', link);
  await expect(page.locator('#qr')).toBeVisible();
  expect((await decode(page)).text).toBe(link);
  await expect(page.locator('#link')).toHaveAttribute('href', link);
  await expect(page.locator('#info')).toContainText('Module');
});

test('umlauts and emoji survive (UTF-8)', async ({ page }) => {
  const text = 'Grüße aus Köln – 👋\nZweite Zeile';
  await page.fill('#txt', text);
  expect((await decode(page)).text).toBe(text);
  await expect(page.locator('#linkLine')).toBeHidden();
});

test('WLAN code uses the standard format with escaped special characters', async ({ page }) => {
  await page.click('[data-type="wifi"]');
  await page.fill('#wSsid', 'Mein;Netz');
  await page.fill('#wPass', 'pa:ss\\w,"x"');
  // Written out by hand from the format: WIFI:T:<enc>;S:<ssid>;P:<pass>;H:true;; with \ ; , : " escaped
  expect((await decode(page)).text).toBe('WIFI:T:WPA;S:Mein\\;Netz;P:pa\\:ss\\\\w\\,\\"x\\";;');
  await page.selectOption('#wEnc', 'nopass');
  await expect(page.locator('#wPass')).toBeDisabled();
  await page.check('#wHidden');
  expect((await decode(page)).text).toBe('WIFI:T:nopass;S:Mein\\;Netz;H:true;;');
});

test('higher error correction gives a denser code; too long text shows an error', async ({ page }) => {
  await page.fill('#txt', 'https://example.org/etwas-laengerer-pfad/fuer-den-test');
  const modules = async () => Number((await page.locator('#info').textContent()).match(/^(\d+)/)[1]);
  await page.selectOption('#ec', 'L');
  const low = await modules();
  await page.selectOption('#ec', 'H');
  const high = await modules();
  expect(high).toBeGreaterThan(low);
  expect((await decode(page)).text).toBe('https://example.org/etwas-laengerer-pfad/fuer-den-test');

  // Version 40 holds at most 2953 bytes (level L) – one more cannot fit
  await page.selectOption('#ec', 'L');
  await page.fill('#txt', 'a'.repeat(2954));
  await expect(page.locator('#info')).toHaveClass(/err/);
  await expect(page.locator('#info')).toContainText('Zu lang');
  await expect(page.locator('#qr')).toBeHidden();
  await expect(page.locator('#btnSave')).toBeDisabled();
  await page.fill('#txt', 'a'.repeat(2953));
  await expect(page.locator('#qr')).toBeVisible();
});

test('saved PNG is large, readable and lands in the history once', async ({ page }) => {
  await page.fill('#txt', 'https://example.org/bild');
  for (let i = 0; i < 2; i++) {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    expect(dl.suggestedFilename()).toBe('qr-example-org-bild.png');
    const { readFileSync } = await import('node:fs');
    const res = await decode(page, { png: readFileSync(await dl.path()) });
    expect(res.text).toBe('https://example.org/bild');
    expect(res.width).toBeGreaterThanOrEqual(900);
  }
  expect(await histTexts(page)).toEqual(['https://example.org/bild']);
});

test('history: remember, reopen, delete; input survives a reload', async ({ page }) => {
  await expect(page.locator('#hist')).toContainText('Noch keine Einträge');
  await page.fill('#txt', 'erster');
  await page.click('#btnKeep');
  await page.click('[data-type="wifi"]');
  await page.fill('#wSsid', 'Gast');
  await page.fill('#wPass', 'geheim123');
  await page.click('#btnKeep');
  expect(await histTexts(page)).toEqual(['Gast', 'erster']);
  await expect(page.locator('#hist .meta').first()).toContainText('WLAN');

  await page.reload();
  await expect(page.locator('#wSsid')).toHaveValue('Gast');
  expect(await histTexts(page)).toEqual(['Gast', 'erster']);

  await page.locator('#hist .open').nth(1).click();
  await expect(page.locator('#txt')).toBeVisible();
  await expect(page.locator('#txt')).toHaveValue('erster');
  expect((await decode(page)).text).toBe('erster');
  await page.locator('#hist .open').first().click();
  await expect(page.locator('#wPass')).toHaveValue('geheim123');

  await page.getByRole('button', { name: 'Eintrag löschen: erster' }).click();
  expect(await histTexts(page)).toEqual(['Gast']);
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnClearHist');
  await expect(page.locator('#hist')).toContainText('Noch keine Einträge');
});

test('share target: a link shared from another app becomes the code and a history entry', async ({ page, request }) => {
  const manifest = await (await request.get(URL_ + 'manifest.webmanifest')).json();
  expect(manifest.share_target).toEqual({ action: './', method: 'GET', params: { title: 'title', text: 'text', url: 'url' } });

  // Android puts the link into "text" (often after a sentence), the page title into "title"
  const q = new URLSearchParams({ title: 'Beispielseite', text: 'Schau mal: https://example.org/artikel?id=7' });
  await page.goto(`${URL_}?${q}`);
  await expect(page.locator('#txt')).toHaveValue('https://example.org/artikel?id=7');
  expect((await decode(page)).text).toBe('https://example.org/artikel?id=7');
  expect(new URL(page.url()).search).toBe('');
  expect(await histTexts(page)).toEqual(['Beispielseite – https://example.org/artikel?id=7']);

  // A reload must not add it again; "url" wins over text, a title equal to the link is dropped
  await page.reload();
  await page.goto(`${URL_}?${new URLSearchParams({ title: 'https://example.org/b', url: 'https://example.org/b', text: 'egal' })}`);
  expect(await histTexts(page)).toEqual(['https://example.org/b', 'Beispielseite – https://example.org/artikel?id=7']);

  // Plain text without a link is taken as it is
  await page.goto(`${URL_}?${new URLSearchParams({ text: 'Nur ein Satz' })}`);
  await expect(page.locator('#txt')).toHaveValue('Nur ein Satz');
});

test('page link: opens the generator with exactly this content', async ({ page, browser, baseURL }) => {
  await expect(page.locator('#pageLinkBox')).toBeHidden();
  // A sentence with a link: the page link must keep the whole text (no link extraction as for Android shares)
  const text = 'Schau mal: https://example.org/?a=1&b=2 – Grüße';
  await page.fill('#txt', text);
  await page.selectOption('#ec', 'H');
  const link = await page.locator('#pageLink').inputValue();
  expect(link).toBe(`${baseURL}${URL_}?${new URLSearchParams({ q: text, ec: 'H' })}`);
  await expect(page.locator('#pageLinkWarn')).toBeHidden();
  await page.click('#btnCopyLink');
  await expect(page.locator('#toast')).toHaveText('Link kopiert');

  // Fresh browser profile = someone else opening the link
  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await other.goto(link);
  await expect(other.locator('#txt')).toHaveValue(text);
  await expect(other.locator('#ec')).toHaveValue('H');
  expect((await decode(other)).text).toBe(text);
  expect(new URL(other.url()).search).toBe('');
  await expect(other.locator('#hist')).toContainText('Noch keine Einträge');
  await ctx.close();
});

test('page link of a WLAN code restores the form, special characters included', async ({ page }) => {
  await page.click('[data-type="wifi"]');
  await page.fill('#wSsid', 'Café;Netz:1');
  await page.fill('#wPass', 'a\\b,"c";');
  await page.check('#wHidden');
  await expect(page.locator('#pageLinkWarn')).toBeVisible();
  const expected = 'WIFI:T:WPA;S:Café\\;Netz\\:1;P:a\\\\b\\,\\"c\\"\\;;H:true;;';
  expect((await decode(page)).text).toBe(expected);
  const link = await page.locator('#pageLink').inputValue();

  await page.evaluate(() => localStorage.clear());
  await page.goto(link);
  await expect(page.locator('#wSsid')).toHaveValue('Café;Netz:1');
  await expect(page.locator('#wPass')).toHaveValue('a\\b,"c";');
  await expect(page.locator('#wEnc')).toHaveValue('WPA');
  await expect(page.locator('#wHidden')).toBeChecked();
  expect((await decode(page)).text).toBe(expected);

  // Open network: no password, no warning
  await page.goto(`${URL_}?${new URLSearchParams({ q: 'WIFI:T:nopass;S:Gast;;' })}`);
  await expect(page.locator('#wSsid')).toHaveValue('Gast');
  await expect(page.locator('#wEnc')).toHaveValue('nopass');
  await expect(page.locator('#pageLinkWarn')).toBeHidden();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('labels, info and history in English', async ({ page }) => {
    await page.goto('/qr-code/');
    await expect(page.locator('#empty')).toHaveText('Enter a link or text – the QR code appears here.');
    await page.fill('#txt', 'https://example.org');
    await expect(page.locator('#info')).toHaveText(/^\d+ × \d+ modules · 19 bytes$/);
    await expect(page.locator('#qr')).toHaveAttribute('aria-label', 'QR code for: https://example.org');
    await page.click('#btnKeep');
    await expect(page.locator('#hist .meta').first()).toContainText('Link · ');
    await page.click('[data-type=wifi]');
    await expect(page.locator('#empty')).toHaveText('Enter a network name – the QR code appears here.');
    await expect(page.locator('footer')).toContainText('“QR Code” is a registered trademark of DENSO WAVE INCORPORATED');
  });
});

test('contact (vCard): scannable, page link and history open it again', async ({ page }) => {
  await page.click('[data-type="contact"]');
  await expect(page.locator('#empty')).toHaveText('Kontaktdaten eingeben – der QR-Code erscheint hier.');
  await page.fill('#cN', 'Jörg van der Berg');
  await page.fill('#cOrg', 'Bau; Partner');
  await page.fill('#cEmail', 'joerg@example.com');
  await page.fill('#cUrl', 'example.com/jb');
  // Written out by hand (vCard 3.0): family name = last word, ";" escaped, https:// added
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'N:Berg;Jörg van der;;;', 'FN:Jörg van der Berg', 'ORG:Bau\\; Partner',
    'EMAIL;TYPE=INTERNET:joerg@example.com', 'URL:https://example.com/jb', 'END:VCARD'].join('\r\n');
  expect((await decode(page)).text).toBe(vcard);
  await expect(page.locator('#qr')).toHaveAttribute('aria-label', 'QR-Code mit dem Kontakt „Jörg van der Berg“');
  await page.click('#btnKeep');
  await expect(histTexts(page)).resolves.toEqual(['Jörg van der Berg']);
  await expect(page.locator('#hist .meta').first()).toContainText('Kontakt');

  // Page link: opens exactly this contact
  const link = await page.inputValue('#pageLink');
  await page.click('[data-type="text"]');
  await page.goto(link);
  await expect(page.locator('[data-type="contact"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#cOrg')).toHaveValue('Bau; Partner');
  expect((await decode(page)).text).toBe(vcard);
  // History entry
  await page.click('[data-type="text"]');
  await page.locator('#hist .open').first().click();
  await expect(page.locator('#cUrl')).toHaveValue('https://example.com/jb');
  expect((await decode(page)).text).toBe(vcard);
});

test('page link with a vCard from elsewhere (folded lines, 4.0, several values) is read', async ({ page }) => {
  const foreign = 'BEGIN:VCARD\r\nVERSION:4.0\r\nN:Doe;Jane;;Dr.;\r\nORG:Acme;Sales\r\nTEL;TYPE=cell:tel:+1-555-0100\r\nTEL;TYPE=work:+1-555-0199\r\n'
    + 'EMAIL:jane@exam\r\n ple.com\r\nADR;TYPE=home:;;1 Main St;Springfield;;12345;USA\r\nEND:VCARD';
  await page.goto(URL_ + '?q=' + encodeURIComponent(foreign));
  await expect(page.locator('#cN')).toHaveValue('Dr. Jane Doe');
  await expect(page.locator('#cOrg')).toHaveValue('Acme, Sales');
  await expect(page.locator('#cTel')).toHaveValue('+1-555-0100');
  await expect(page.locator('#cEmail')).toHaveValue('jane@example.com');
  await expect(page.locator('#cAdr')).toHaveValue('1 Main St, Springfield, 12345, USA');
});
