// Mailto-Generator: links are checked against hand-written strings (RFC 6068) and parsed back with an
// independent reader (new URL + decodeURIComponent); the QR code is read with ZXing-JS from assets/vendor.
import { test, expect, openMenu, onDialog, switchLang, clipboardText } from './helpers.mjs';

const URL_ = '/mailto-generator/';

async function decodeQr(page) {
  await page.addScriptTag({ url: new URL('/assets/vendor/zxing-library/index.min.js', page.url()).href });
  return page.evaluate(() => {
    const Z = window.ZXing;
    const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(document.querySelector('#qr'))));
    const hints = new Map([[Z.DecodeHintType.CHARACTER_SET, 'UTF-8'], [Z.DecodeHintType.PURE_BARCODE, true]]);
    return new Z.QRCodeReader().decode(bitmap, hints).getText();
  });
}

/** Independent reader: what a mail app takes from the link */
function readMailto(link) {
  const u = new URL(link);
  expect(u.protocol).toBe('mailto:');
  const q = {};
  for (const part of u.search.slice(1).split('&').filter(Boolean)) {
    const [k, v] = part.split('=');
    q[k] = decodeURIComponent(v);
  }
  return { to: decodeURIComponent(u.pathname), ...q };
}

test.beforeEach(async ({ page }) => { await page.goto(URL_); });

test('fields become a correctly encoded mailto link that survives a reload', async ({ page }) => {
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#btnOpen')).toBeDisabled();
  await page.fill('#to', 'anna@example.org, Bernd <bernd+info@example.com>');
  await page.fill('#cc', 'chef@example.org');
  await page.fill('#subject', 'Frage & Antwort (100 %)');
  await page.fill('#body', 'Hallo,\nZeile 2 ä');
  const link = 'mailto:anna@example.org,bernd%2Binfo@example.com?cc=chef@example.org'
    + '&subject=Frage%20%26%20Antwort%20%28100%20%25%29&body=Hallo%2C%0D%0AZeile%202%20%C3%A4';
  await expect(page.locator('#out')).toHaveValue(link);
  await expect(page.locator('#btnOpen')).toBeEnabled();
  await expect(page.locator('#len')).toHaveText(`${link.length} Zeichen`);
  expect(readMailto(link)).toEqual({ to: 'anna@example.org,bernd+info@example.com', cc: 'chef@example.org',
    subject: 'Frage & Antwort (100 %)', body: 'Hallo,\r\nZeile 2 ä' });
  await page.click('#btnCopy');
  expect(await clipboardText(page)).toBe(link);
  await page.reload();
  await expect(page.locator('#out')).toHaveValue(link);
  await expect(page.locator('#to')).toHaveValue('anna@example.org, Bernd <bernd+info@example.com>');
});

test('invalid addresses are named; a subject alone is enough', async ({ page }) => {
  await page.fill('#subject', 'Nur Betreff');
  await expect(page.locator('#out')).toHaveValue('mailto:?subject=Nur%20Betreff');
  await page.fill('#to', 'gut@example.org, kaputt@, ohne-at');
  await expect(page.locator('#addrErr')).toHaveText('Keine gültige Adresse: kaputt@, ohne-at');
  await expect(page.locator('#to')).toHaveAttribute('aria-invalid', 'true');
  await page.fill('#to', 'gut@example.org');
  await expect(page.locator('#addrErr')).toBeHidden();
});

test('HTML and Markdown use the link text and escape it', async ({ page }) => {
  await page.fill('#to', 'a@example.org');
  await page.fill('#subject', "It's (fine)");
  const link = 'mailto:a@example.org?subject=It%27s%20%28fine%29';
  await page.click('#format [data-format="html"]');
  await expect(page.locator('#textField')).toBeVisible();
  await expect(page.locator('#out')).toHaveValue(`<a href="${link}">a@example.org</a>`);
  await page.fill('#linkText', 'Schreib <uns> & [mehr]');
  await expect(page.locator('#out')).toHaveValue(`<a href="${link}">Schreib &lt;uns&gt; &amp; [mehr]</a>`);
  await page.click('#format [data-format="md"]');
  await expect(page.locator('#out')).toHaveValue(`[Schreib <uns> & \\[mehr\\]](${link})`);
  await page.reload();
  await expect(page.locator('#format [data-format="md"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a long link warns', async ({ page }) => {
  await page.fill('#to', 'a@example.org');
  await expect(page.locator('#longWarn')).toBeHidden();
  await page.fill('#body', 'x'.repeat(2100));
  await expect(page.locator('#longWarn')).toBeVisible();
});

test('the QR code reads back as the link and can be saved', async ({ page }) => {
  await page.fill('#to', 'qr@example.org');
  await page.fill('#subject', 'Grüße');
  await page.click('#btnQr');
  await expect(page.locator('#qr')).toBeVisible();
  expect(await decodeQr(page)).toBe('mailto:qr@example.org?subject=Gr%C3%BC%C3%9Fe');
  const dl = page.waitForEvent('download');
  await page.click('#btnQrSave');
  expect((await dl).suggestedFilename()).toBe('mailto-qr.png');
});

test('reading a mailto link fills the fields (plus stays a plus)', async ({ page }) => {
  await onDialog(page, d => d.accept('mailto:x+y@example.org?CC=c@example.org&bcc=b1@example.org,b2@example.org&subject=A+B%20C&body=Z1%0D%0AZ2'), { once: true });
  await openMenu(page);
  await page.click('#btnParse');
  await expect(page.locator('#to')).toHaveValue('x+y@example.org');
  await expect(page.locator('#cc')).toHaveValue('c@example.org');
  await expect(page.locator('#bcc')).toHaveValue('b1@example.org, b2@example.org');
  await expect(page.locator('#subject')).toHaveValue('A+B C');
  await expect(page.locator('#body')).toHaveValue('Z1\nZ2');
});

test('clearing offers undo', async ({ page }) => {
  await page.fill('#to', 'a@example.org');
  await openMenu(page);
  await page.click('#btnClear');
  await expect(page.locator('#to')).toHaveValue('');
  await page.locator('#toast button', { hasText: 'Rückgängig' }).click();
  await expect(page.locator('#to')).toHaveValue('a@example.org');
});

test('templates: save, load, delete with undo', async ({ page }) => {
  await page.fill('#to', 'team@example.org');
  await page.fill('#subject', 'Wochenbericht');
  await onDialog(page, d => d.accept('Bericht'), { once: true });
  await openMenu(page);
  await page.locator('#tplPage > summary').click();
  await page.click('#btnTplSave');
  await expect(page.locator('#tplList .name')).toHaveText(['Bericht']);
  await expect(page.locator('#tplList .meta')).toHaveText(['team@example.org · Wochenbericht']);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('mailto-generator.templates.v1')).length)).toBe(1);
  // change the form, then load the template back
  await page.evaluate(() => { const i = document.querySelector('#subject'); i.value = 'Anders'; i.dispatchEvent(new Event('input')); });
  await page.locator('#tplList .open').click();
  await expect(page.locator('#subject')).toHaveValue('Wochenbericht');
  await openMenu(page);
  await page.locator('#tplPage > summary').click();
  await page.getByRole('button', { name: 'Löschen: Bericht' }).click();
  await expect(page.locator('#tplList li.muted')).toHaveText('Noch keine Vorlagen.');
  await page.locator('#toast button', { hasText: 'Rückgängig' }).click();
  await expect(page.locator('#tplList .name')).toHaveText(['Bericht']);
});

test('text shared from another app: a mailto link or an article', async ({ page }) => {
  await page.goto(URL_ + '?text=' + encodeURIComponent('Bitte an mailto:info@example.org?subject=Hallo schreiben'));
  await expect(page.locator('#to')).toHaveValue('info@example.org');
  await expect(page.locator('#subject')).toHaveValue('Hallo');
  expect(new URL(page.url()).search).toBe('');
  await page.goto(URL_ + '?title=' + encodeURIComponent('Ein Artikel') + '&url=' + encodeURIComponent('https://example.org/a'));
  await expect(page.locator('#to')).toHaveValue('');
  await expect(page.locator('#subject')).toHaveValue('Ein Artikel');
  await expect(page.locator('#body')).toHaveValue('https://example.org/a');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script follow the language', async ({ page }) => {
    await page.goto(URL_);
    await page.fill('#to', 'bad@');
    await expect(page.locator('#addrErr')).toHaveText('Not a valid address: bad@');
    await switchLang(page, 'de');
    await expect(page.locator('#addrErr')).toHaveText('Keine gültige Adresse: bad@');
    await switchLang(page, 'en');
    await page.click('#format [data-format="html"]');
    await page.fill('#to', '');
    await page.fill('#subject', 'S');
    await expect(page.locator('#out')).toHaveValue('<a href="mailto:?subject=S">Write an email</a>');
  });
});
