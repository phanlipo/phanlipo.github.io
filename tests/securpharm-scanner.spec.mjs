// Scan-Copy-SecurPharm: parsing of GS1 / IFA codes and image decoding with both decoders.
import { test, expect } from './helpers.mjs';
import bwipjs from 'bwip-js';

const GS = '\x1d', RS = '\x1e', EOT = '\x04';
const EXPECTED = {
  PZN: '12345678',
  'GTIN / NTIN': '04150123456782',
  'Charge (Lot)': 'CH4711',
  Verfalldatum: '31.12.2028',
  Seriennummer: 'ABC123XYZ9',
};

/** Result fields as { label: value } */
async function fields(page) {
  return page.locator('#fields').evaluate(box => {
    const out = {}, kids = [...box.children];
    for (let i = 0; i < kids.length; i += 3) out[kids[i].textContent] = kids[i + 1].textContent;
    return out;
  });
}

async function parse(page, raw) {
  await page.locator('#manual').evaluate((el, v) => { el.value = v; }, raw);
  await page.click('#btnParse');
}

/** PNG of a GS1 DataMatrix as a file for <input type=file> */
async function dataMatrixFile(text) {
  const buffer = await bwipjs.toBuffer({ bcid: 'gs1datamatrix', text, scale: 6, padding: 10, backgroundcolor: 'FFFFFF' });
  return { name: 'code.png', mimeType: 'image/png', buffer };
}

test.beforeEach(async ({ page }) => {
  await page.goto('/securpharm-scanner/');
});

test.describe('parsing', () => {
  test('GS1 with real GS separators', async ({ page }) => {
    await parse(page, `0104150123456782${'21'}ABC123XYZ9${GS}10CH4711${GS}17281231`);
    await expect(page.locator('#status')).toContainText('Erfolgreich gelesen (GS1');
    expect(await fields(page)).toMatchObject(EXPECTED);
    await expect(page.locator('#fmtBadge')).toHaveText('GS1');
  });

  test('GS1 with <GS> text placeholders and in bracket notation', async ({ page }) => {
    await parse(page, '010415012345678221ABC123XYZ9<GS>10CH4711<GS>17281231');
    expect(await fields(page)).toMatchObject(EXPECTED);
    await parse(page, '(01)04150123456782(21)ABC123XYZ9(10)CH4711(17)281231');
    expect(await fields(page)).toMatchObject(EXPECTED);
  });

  test('IFA format with PPN', async ({ page }) => {
    await parse(page, `[)>${RS}06${GS}9N111234567842${GS}1TCH4711${GS}D281231${GS}SABC123XYZ9${RS}${EOT}`);
    await expect(page.locator('#fmtBadge')).toHaveText('IFA (PPN)');
    expect(await fields(page)).toMatchObject({
      PZN: '12345678', PPN: '111234567842', 'Charge (Lot)': 'CH4711', Verfalldatum: '31.12.2028', Seriennummer: 'ABC123XYZ9',
    });
    await expect(page.locator('#fields .badge', { hasText: 'Prüfziffer ok' })).toHaveCount(2);
  });

  test('expired pack is flagged', async ({ page }) => {
    await parse(page, `010415012345678221EXP1${GS}10CH1${GS}17200131`);
    await expect(page.locator('#status')).toHaveClass(/err/);
    await expect(page.locator('#status')).toContainText('Verfalldatum überschritten');
    await expect(page.locator('#fields .badge', { hasText: 'abgelaufen' })).toBeVisible();
  });

  test('wrong GTIN check digit is flagged', async ({ page }) => {
    await parse(page, `010415012345678121X1${GS}10CH1${GS}17281231`);
    await expect(page.locator('#fields .badge', { hasText: 'Prüfziffer falsch' })).toBeVisible();
  });

  test('unknown format shows an error', async ({ page }) => {
    await parse(page, 'hello world');
    await expect(page.locator('#status')).toHaveClass(/err/);
  });

  test('history is stored and survives a reload', async ({ page }) => {
    await parse(page, `0104150123456782${'21'}HIST1${GS}10CH4711${GS}17281231`);
    await expect(page.locator('#histCount')).toHaveText('1');
    await page.reload();
    await expect(page.locator('#histCount')).toHaveText('1');
    await expect(page.locator('#histBody')).toContainText('HIST1');
  });
});

test.describe('image decoding', () => {
  const code = '(01)04150123456782(21)ABC123XYZ9(10)CH4711(17)281231';

  test('zxing-wasm (main decoder)', async ({ page }) => {
    await page.click('[data-tab=image]');
    await page.setInputFiles('#file', await dataMatrixFile(code));
    await expect(page.locator('#status')).toContainText('Erfolgreich gelesen (GS1, Quelle: Bild)', { timeout: 15000 });
    expect(await fields(page)).toMatchObject(EXPECTED);
  });

  test.describe('without zxing-wasm', () => {
    test.use({ allowedProblems: /zxing-wasm|Failed to load resource/ });

    test('@zxing/library (fallback decoder)', async ({ page }) => {
      await page.route(/zxing-wasm/, r => r.abort());
      await page.reload();
      expect(await page.evaluate(() => [!!window.ZXingWASM, !!window.ZXing])).toEqual([false, true]);
      await page.click('[data-tab=image]');
      await page.setInputFiles('#file', await dataMatrixFile(code));
      await expect(page.locator('#status')).toContainText('Erfolgreich gelesen (GS1, Quelle: Bild)', { timeout: 15000 });
      expect(await fields(page)).toMatchObject(EXPECTED);
    });
  });

  test('image without a code reports it', async ({ page }) => {
    const blank = await bwipjs.toBuffer({ bcid: 'code128', text: 'NOT-A-DATAMATRIX', scale: 2 });
    await page.click('[data-tab=image]');
    await page.setInputFiles('#file', { name: 'x.png', mimeType: 'image/png', buffer: blank });
    await expect(page.locator('#status')).toContainText('Kein DataMatrix-Code', { timeout: 20000 });
  });
});
