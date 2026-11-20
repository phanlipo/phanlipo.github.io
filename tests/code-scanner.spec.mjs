// Code-Scanner: content analysis (parse.js), reading pictures of all kinds of codes (made with bwip-js),
// the three views (broken down, original, QR code), camera, history and language.
import { test, expect, axe, openMenu, onDialog, switchLang, clipboardText, mockLaunchQueue, expectNoHorizontalScroll } from './helpers.mjs';
import bwipjs from 'bwip-js';

const GS = '\x1d';
const URL_ = '/code-scanner/';
const LS_HIST = 'code-scanner.history.v1';

/** PNG of a code as a file for <input type=file> */
async function codeFile(bcid, text, extra = {}) {
  const buffer = await bwipjs.toBuffer({ bcid, text, scale: 4, padding: 12, backgroundcolor: 'FFFFFF', ...extra });
  return { name: 'code.png', mimeType: 'image/png', buffer };
}
const analyze = (page, text, meta = {}) => page.evaluate(([t, m]) => window.CodeParse.analyze(t, m), [text, meta]);
/** Reads the code image the app created (img#id) back with the decoder: [format, contentType, text] */
const readBack = (page, id, textMode = 'Plain') => page.evaluate(async ([id, textMode]) => {
  const img = document.getElementById(id); await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const [r] = await window.ZXingWASM.readBarcodes(g.getImageData(0, 0, c.width, c.height), { textMode, tryHarder: true });
  return r ? [r.format, r.contentType, r.text] : null;
}, [id, textMode]);
const field = (r, k) => r.fields.find(f => f.k === k || f.id === k);
async function parseText(page, text) {
  await page.locator('#srcSeg [data-src="text"]').click();
  await page.fill('#manual', text);
  await page.click('#btnParse');
}
/** Visible result fields as { label: value } */
const shownFields = page => page.locator('#fields').evaluate(box => Object.fromEntries([...box.querySelectorAll('.frow')].map(r =>
  [r.querySelector('dt').firstChild.textContent, r.querySelector('.val').textContent])));

test.beforeEach(async ({ page }) => { await page.goto(URL_); });

test.describe('parsing', () => {
  test('Wi-Fi with escaped characters, hidden network', async ({ page }) => {
    const r = await analyze(page, 'WIFI:S:My\\;Net;T:WPA;P:pa\\:ss\\\\;H:true;;');
    expect(r.type).toBe('wifi');
    expect(field(r, 'ssid').v).toBe('My;Net');
    expect(field(r, 'password')).toMatchObject({ v: 'pa:ss\\', secret: true });
    expect(field(r, 'hiddenNet').v).toBe('yes');
    // agents never see the password
    expect(JSON.stringify(r.agent)).not.toContain('pa:ss');
  });

  test('vCard 3.0 and 2.1 quoted-printable, MeCard', async ({ page }) => {
    let r = await analyze(page, 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Muster;Max;;Dr.;\r\nFN:Dr. Max Muster\r\nTEL;TYPE=CELL:+49 170 1234\r\n'
      + 'item1.EMAIL;TYPE=INTERNET,WORK:max@example.com\r\nADR;TYPE=WORK:;;Hauptstr. 1;Berlin;;10115;Deutschland\r\nORG:Firma;Abteilung\r\nEND:VCARD');
    expect(r.type).toBe('vcard');
    expect(r.fields.map(f => [f.k, f.v])).toEqual([['name', 'Dr. Max Muster'], ['tel', '+49 170 1234'], ['email', 'max@example.com'],
      ['address', 'Hauptstr. 1\n10115 Berlin\nDeutschland'], ['org', 'Firma, Abteilung']]);
    expect(field(r, 'tel').note).toBe('cell');
    expect(r.file).toMatchObject({ k: 'vcard', name: 'Dr Max Muster.vcf', type: 'text/vcard' });
    r = await analyze(page, 'BEGIN:VCARD\nVERSION:2.1\nN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen\nEND:VCARD');
    expect(field(r, 'name').v).toBe('Jürgen Müller');
    r = await analyze(page, 'MECARD:N:Doe,John;TEL:+1 555 123;EMAIL:j@d.com;URL:example.com;;');
    expect(r.type).toBe('mecard');
    expect(r.vcard).toEqual({ n: 'John Doe', tel: '+1 555 123', email: 'j@d.com', url: 'example.com' });
  });

  test('calendar event, geo, phone, SMS, e-mail', async ({ page }) => {
    let r = await analyze(page, 'BEGIN:VEVENT\nSUMMARY:Party\nDTSTART:20261231T200000\nDTEND:20270101T020000Z\nLOCATION:Zuhause\nEND:VEVENT');
    expect(r.type).toBe('event');
    expect(field(r, 'start')).toMatchObject({ kind: 'datetime', v: '2026-12-31T20:00:00' });
    expect(field(r, 'end')).toMatchObject({ kind: 'datetime', v: '2027-01-01T02:00:00Z' });
    expect(r.file.text).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n[\s\S]*BEGIN:VEVENT[\s\S]*END:VCALENDAR\r\n$/);
    r = await analyze(page, 'geo:52.5163,13.3777?q=Brandenburger%20Tor');
    expect(r.type).toBe('geo');
    expect(r.links.map(l => l.href)).toEqual(['geo:52.5163,13.3777', 'https://www.openstreetmap.org/?mlat=52.5163&mlon=13.3777#map=17/52.5163/13.3777']);
    expect(field(r, 'query').v).toBe('Brandenburger Tor');
    r = await analyze(page, 'tel:+49%20170%201234');
    expect(r).toMatchObject({ type: 'tel', links: [{ k: 'call', href: 'tel:+491701234' }] });
    r = await analyze(page, 'SMSTO:+49170:Hallo du');
    expect(r).toMatchObject({ type: 'sms', links: [{ href: 'sms:+49170?body=Hallo%20du' }] });
    r = await analyze(page, 'MATMSG:TO:a@b.de;SUB:Hi;BODY:Text;;');
    expect(r).toMatchObject({ type: 'email', links: [{ href: 'mailto:a@b.de?subject=Hi&body=Text' }] });
  });

  test('links: warnings, parameters, GS1 Digital Link, no javascript', async ({ page }) => {
    let r = await analyze(page, 'http://xn--80ak6aa92e.com/a%20b?x=1&y=%C3%A4');
    expect(r.type).toBe('url');
    expect(r.warn).toEqual(['http', 'punycode']);
    expect(r.fields.filter(f => f.k === 'param').map(f => [f.name, f.v])).toEqual([['x', '1'], ['y', 'ä']]);
    expect(field(r, 'path').v).toBe('/a b');
    r = await analyze(page, 'https://user:pw@192.168.1.1/');
    expect(r.warn).toEqual(['ip', 'userinfo']);
    r = await analyze(page, 'https://id.gs1.org/01/09506000134352/10/ABC?17=281231');
    expect(r.type).toBe('gs1link');
    expect(field(r, '01')).toMatchObject({ v: '09506000134352', check: true });
    expect(field(r, '17')).toMatchObject({ kind: 'date', v: '2028-12-31' });
    r = await analyze(page, 'javascript:alert(1)');
    expect(r).toMatchObject({ type: 'uri', warn: ['scheme'], links: [] });
  });

  test('payments: EPC (GiroCode) and Swiss QR bill with IBAN check', async ({ page }) => {
    let r = await analyze(page, 'BCD\n002\n1\nSCT\nBFSWDE33BER\nWikimedia Foerdergesellschaft\nDE33100205000001194700\nEUR123.45\n\n\nSpende fuer Wikipedia');
    expect(r.type).toBe('epc');
    expect(field(r, 'iban')).toMatchObject({ v: 'DE33 1002 0500 0001 1947 00', check: true });
    expect(field(r, 'amount')).toMatchObject({ v: 123.45, cur: 'EUR', kind: 'money' });
    expect(field(r, 'remittance').v).toBe('Spende fuer Wikipedia');
    // one digit changed → mod 97 fails
    r = await analyze(page, 'BCD\n002\n1\nSCT\n\nX\nDE33100205000001194701\nEUR1\n\n\n');
    expect(field(r, 'iban').check).toBe(false);
    expect(r.warn).toEqual(['check']);
    r = await analyze(page, 'SPC\n0200\n1\nCH4431999123000889012\nS\nMax Muster & Söhne\nMusterstrasse\n123\n8000\nSeldwyla\nCH\n\n\n\n\n\n\n\n1949.75\nCHF\nS\nSimon Muster\nMusterstrasse\n1\n8000\nSeldwyla\nCH\nQRR\n210000000003139471430009017\nAuftrag vom 15.06.2020\nEPD');
    expect(r.type).toBe('swissqr');
    expect(field(r, 'iban').check).toBe(true);
    expect(field(r, 'payee').v).toBe('Max Muster & Söhne\nMusterstrasse 123\n8000 Seldwyla\nCH');
    expect(field(r, 'amount')).toMatchObject({ v: 1949.75, cur: 'CHF' });
    expect(field(r, 'reference')).toMatchObject({ v: '210000000003139471430009017', note: 'QRR' });
  });

  test('GS1 element strings in brackets and raw with <GS>, IFA pack code', async ({ page }) => {
    let r = await analyze(page, '(01)04150123456782(17)281231(10)CH4711(21)ABC', { contentType: 'GS1' });
    expect(r.type).toBe('gs1');
    expect(r.fields.map(f => f.id || f.k)).toEqual(['01', '17', '10', '21', 'pzn']);
    expect(field(r, 'pzn')).toMatchObject({ v: '12345678', check: true });
    expect(field(r, '17').name.de).toBe('Verfalldatum');
    // 3103 = net weight in kg with 3 decimals: 001250 → 1.250 kg; 17 is fixed length, 10 ends at GS
    r = await analyze(page, `0104012345678901310300125017200131` + `10AB${GS}21X`, {});
    expect(r.fields.map(f => [f.id, f.v])).toEqual([['01', '04012345678901'], ['3103', 1.25], ['17', '2020-01-31'], ['10', 'AB'], ['21', 'X']]);
    expect(field(r, '3103')).toMatchObject({ unit: 'kg', kind: 'number' });
    expect(r.warn).toContain('expired');
    expect(await page.evaluate(t => window.CodeParse.gs1Hri(t), `010401234567890110AB${GS}21X`)).toBe('(01)04012345678901(10)AB(21)X');
    r = await analyze(page, `[)>\x1e06${GS}9N111234567842${GS}1TCH4711${GS}D281231${GS}SABC\x1e\x04`, { contentType: 'ISO15434' });
    expect(r.type).toBe('ifa');
    expect(r.fields.map(f => f.id || f.k)).toEqual(['9N', 'pzn', '1T', 'D', 'S']);
    expect(field(r, '9N').check).toBe(true);
  });

  test('product numbers: EAN, ISBN, ISSN, UPC-E, in-store, PZN', async ({ page }) => {
    let r = await analyze(page, '4006381333931', { format: 'EAN13' });
    expect(r.type).toBe('product');
    expect(field(r, 'gtin').check).toBe(true);
    expect(field(r, 'gs1Country')).toMatchObject({ v: 'DE', kind: 'region' });
    // ISBN-10 of 978-3-16-148410: 3·10+1·9+6·8+1·7+4·6+8·5+4·4+1·3+0·2 = 177, (11 − 177 mod 11) mod 11 = 10 → X
    r = await analyze(page, '9783161484100', { format: 'EAN13' });
    expect([field(r, 'isbn').v, field(r, 'isbn10').v]).toEqual(['9783161484100', '316148410X']);
    // ISSN 1234-567: 1·8+2·7+3·6+4·5+5·4+6·3+7·2 = 112, 11 − 112 mod 11 = 9
    r = await analyze(page, '9771234567003', { format: 'EAN13' });
    expect(field(r, 'issn').v).toBe('1234-5679');
    // UPC-E 0 123456 5 → UPC-A 0 12345 00006 5 (last digit 6 → manufacturer 12345, product 00006)
    r = await analyze(page, '01234565', { format: 'UPCE' });
    expect(field(r, 'gtin')).toMatchObject({ v: '012345000065', check: true });
    r = await analyze(page, '2012345000001', { format: 'EAN13' });
    expect(field(r, 'prefixUse').v).toBe('instore');
    r = await analyze(page, '4006381333932', { format: 'EAN13' });
    expect(r.warn).toEqual(['check']);
    r = await analyze(page, '12345678', { format: 'PZN' });
    expect(r).toMatchObject({ type: 'pzn', fields: [{ k: 'pzn', v: '12345678', check: true }] });
    // digits without a format only count as a product number with a valid check digit
    expect((await analyze(page, '4006381333931')).type).toBe('product');
    expect((await analyze(page, '4006381333932')).type).toBe('text');
  });

  test('boarding pass, otpauth, crypto, JSON, text', async ({ page }) => {
    let r = await analyze(page, 'M1DOE/JOHN            EABC123 FRAJFKLH 0400 326Y012A0025 100');
    expect(r.type).toBe('boarding');
    expect(Object.fromEntries(r.fields.map(f => [f.k, f.v]))).toMatchObject({ passenger: 'DOE / JOHN', pnr: 'ABC123', depart: 'FRA', arrive: 'JFK', flight: 'LH 400', cabin: 'Y', seat: '12A', sequence: '25' });
    // day 326 of the year nearest to today
    expect(field(r, 'flightDate').v).toMatch(/^\d{4}-11-2[12]$/);
    r = await analyze(page, 'otpauth://totp/ACME:jane@x.org?secret=JBSWY3DPEHPK3PXP&issuer=ACME&digits=8');
    expect(r.type).toBe('otp');
    expect(field(r, 'secret').secret).toBe(true);
    expect(field(r, 'digits').v).toBe('8');
    expect(r.warn).toEqual(['secretCode']);
    expect(JSON.stringify(r.agent)).not.toContain('JBSWY3DPEHPK3PXP');
    r = await analyze(page, 'bitcoin:bc1qxyz?amount=0.01&label=Shop');
    expect(r.fields.map(f => f.v)).toEqual(['Bitcoin', 'bc1qxyz', '0.01', 'Shop']);
    r = await analyze(page, '{"a":1,"b":"x"}');
    expect(r.type).toBe('json');
    expect(field(r, 'json').v).toBe('{\n  "a": 1,\n  "b": "x"\n}');
    r = await analyze(page, 'Hallo Welt\nZeile 2');
    expect(r.fields).toEqual([{ k: 'chars', v: '18' }, { k: 'words', v: '4' }, { k: 'lines', v: '2' }]);
  });
});

test.describe('views', () => {
  test('text input: broken down, tap copies, password hidden until shown', async ({ page }) => {
    await expect(page.locator('#empty')).toBeVisible();
    await parseText(page, 'WIFI:S:Heimnetz;T:WPA;P:geheim123;;');
    await expect(page.locator('#typeHead')).toHaveText('WLAN');
    expect(await shownFields(page)).toEqual({ 'Netzwerkname (SSID)': 'Heimnetz', Verschlüsselung: 'WPA/WPA2', Passwort: '••••••••' });
    await page.locator('.frow', { hasText: 'Netzwerkname' }).locator('.val').click();
    expect(await clipboardText(page)).toBe('Heimnetz');
    await page.getByRole('button', { name: 'Passwort kopieren' }).click();
    expect(await clipboardText(page)).toBe('geheim123');
    await expect(page.locator('.toast')).toContainText('Passwort kopiert');
    await page.locator('.frow', { hasText: 'Passwort' }).getByRole('button', { name: 'Zeigen' }).click();
    await expect(page.locator('.frow', { hasText: 'Passwort' }).locator('.val')).toHaveText('geheim123');
  });

  test('link: opens only on tap in a new tab, with warning', async ({ page }) => {
    await parseText(page, 'http://example.com/start?ref=qr');
    const open = page.locator('#actions a', { hasText: 'Link öffnen' });
    await expect(open).toHaveAttribute('href', 'http://example.com/start?ref=qr');
    await expect(open).toHaveAttribute('target', '_blank');
    await expect(open).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.locator('#warns')).toContainText('Unverschlüsselter Link');
    expect(await shownFields(page)).toMatchObject({ Domain: 'example.com', Pfad: '/start', ref: 'qr' });
  });

  test('original view marks control characters and copies them unchanged; QR view creates a GS1 QR code', async ({ page }) => {
    const raw = `010415012345678221ABC${GS}10CH4711${GS}17281231`;
    await page.locator('#srcSeg [data-src="text"]').click();
    await page.locator('#manual').evaluate((el, v) => { el.value = v; }, raw);
    await page.click('#btnParse');
    await expect(page.locator('#typeHead')).toHaveText('GS1-Daten');
    expect(await shownFields(page)).toMatchObject({ 'GTIN (01)': '04150123456782', 'Seriennummer (21)': 'ABC', 'Charge (10)': 'CH4711', 'Verfalldatum (17)': '31.12.2028', PZN: '12345678' });
    await page.locator('#viewSeg [data-view="raw"]').click();
    await expect(page.locator('#rawText')).toHaveText('010415012345678221ABC<GS>10CH4711<GS>17281231');
    await expect(page.locator('#rawText .ctl')).toHaveCount(2);
    await page.click('#btnCopyRaw');
    expect(await clipboardText(page)).toBe(raw);
    await page.locator('details.sub', { hasText: 'Bytes' }).locator('summary').click();
    await expect(page.locator('#hex')).toContainText('000000  30 31 30 34');
    // typed text has no format of its own → no "original" image
    await expect(page.locator('#origFig')).toBeHidden();
    await page.locator('#viewSeg [data-view="qr"]').click();
    await expect(page.locator('#qrImg')).toHaveJSProperty('complete', true);
    await expect(page.locator('#qrNote')).toContainText('GS1-QR-Code');
    // the QR code we made reads back as GS1 with the same data
    expect(await readBack(page, 'qrImg')).toEqual(['QRCode', 'GS1', `0104150123456782` + `21ABC${GS}10CH4711${GS}17281231`]);
    const dl = page.waitForEvent('download');
    await page.click('#btnSaveQr');
    expect((await dl).suggestedFilename()).toMatch(/^code-.*-qr\.png$/);
    // the chosen view is remembered
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('code-scanner.settings.v1')).view)).toBe('qr');
  });

  test('contact can be saved as .vcf, event as .ics', async ({ page }) => {
    await parseText(page, 'MECARD:N:Doe,John;TEL:+15551234;EMAIL:john@example.com;;');
    let dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Kontakt speichern' }).click();
    let file = await dl;
    expect(file.suggestedFilename()).toBe('John Doe.vcf');
    const vcf = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
    expect(vcf).toContain('FN:John Doe');
    expect(vcf).toContain('TEL;TYPE=WORK,VOICE:+15551234');
    await parseText(page, 'BEGIN:VEVENT\nSUMMARY:Treffen\nDTSTART:20261201T090000\nEND:VEVENT');
    expect(await shownFields(page)).toMatchObject({ Titel: 'Treffen', Beginn: '01.12.2026, 09:00' });
    dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'In Kalender übernehmen' }).click();
    file = await dl;
    expect(file.suggestedFilename()).toBe('Treffen.ics');
  });
});

test.describe('accessibility with a result', () => {
  for (const scheme of ['light', 'dark']) {
    test(`all three views pass axe and fit 375 px (${scheme})`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 800 });
      await page.emulateMedia({ colorScheme: scheme });
      await parseText(page, 'WIFI:S:Heimnetz-mit-einem-sehr-langen-Namen-ohne-Leerzeichen;T:WPA;P:geheim;;');
      for (const v of ['struct', 'raw', 'qr']) {
        await page.locator(`#viewSeg [data-view="${v}"]`).click();
        await page.evaluate(() => document.querySelectorAll('#result details').forEach(d => { d.open = true; }));
        if (v === 'qr') await expect(page.locator('#qrFig')).toBeVisible();
        const { violations } = await axe(page).include('main').analyze();
        expect(violations.map(x => `${v}: ${x.id} → ${x.nodes.slice(0, 3).map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
        await expectNoHorizontalScroll(page);
      }
    });
  }
});

test.describe('reading pictures', () => {
  const CASES = [
    ['qrcode', 'https://example.org/qr', 'QRCode', 'Link'],
    ['datamatrix', 'Hallo DataMatrix', 'DataMatrix', 'Text'],
    ['azteccode', 'Aztec 123', 'Aztec', 'Text'],
    ['pdf417', 'M1DOE/JOHN            EABC123 FRAJFKLH 0400 326Y012A0025 100', 'PDF417', 'Bordkarte'],
    ['ean13', '4006381333931', 'EAN13', 'Produktnummer'],
    ['code128', 'Paket-4711', 'Code128', 'Text'],
    ['code39', 'CODE39 TEST', 'Code39', 'Text'],
  ];
  for (const [bcid, text, format, type] of CASES) {
    test(`${format} from a photo, created again in its own format`, async ({ page }) => {
      await page.locator('#srcSeg [data-src="image"]').click();
      await page.setInputFiles('#file', await codeFile(bcid, text, /^(ean|code)/.test(bcid) ? { height: 12 } : {}));
      await expect(page.locator('#status')).toContainText('gelesen');
      await expect(page.locator('#typeHead')).toHaveText(type);
      await page.locator('#viewSeg [data-view="raw"]').click();
      await expect(page.locator('#rawText')).toHaveText(text);
      await expect(page.locator('#origImg')).toHaveJSProperty('complete', true);
      await expect(page.locator('#origFig')).toBeVisible();
      // the new image holds the same content in the same format
      const back = await readBack(page, 'origImg');
      expect([back[0], back[2]]).toEqual([format, text]);
    });
  }

  test('GS1 DataMatrix keeps its application identifiers', async ({ page }) => {
    await page.locator('#srcSeg [data-src="image"]').click();
    await page.setInputFiles('#file', await codeFile('gs1datamatrix', '(01)04150123456782(17)281231(10)CH4711(21)SN1'));
    await expect(page.locator('#typeHead')).toHaveText('GS1-Daten');
    await expect(page.locator('#badges')).toContainText('DataMatrix');
    await expect(page.locator('#badges')).toContainText('GS1');
    expect(await shownFields(page)).toMatchObject({ 'Verfalldatum (17)': '31.12.2028', PZN: '12345678' });
    await page.locator('#viewSeg [data-view="raw"]').click();
    await expect(page.locator('#rawText')).toHaveText('010415012345678217281231' + '10CH4711<GS>21SN1');
    await expect(page.locator('#origImg')).toHaveJSProperty('complete', true);
    expect(await readBack(page, 'origImg', 'HRI')).toEqual(['DataMatrix', 'GS1', '(01)04150123456782(17)281231(10)CH4711(21)SN1']);
  });

  test('Micro QR cannot be created again – the QR code helps', async ({ page }) => {
    await page.locator('#srcSeg [data-src="image"]').click();
    await page.setInputFiles('#file', await codeFile('microqrcode', 'MICRO1'));
    await expect(page.locator('#badges')).toContainText('Micro-QR-Code');
    await page.locator('#viewSeg [data-view="raw"]').click();
    await expect(page.locator('#origNote')).toContainText('Micro-QR-Code lässt sich hier nicht neu erzeugen');
    await page.locator('#viewSeg [data-view="qr"]').click();
    await expect(page.locator('#qrFig')).toBeVisible();
  });

  test('several codes in one picture: choice list', async ({ page }) => {
    const a = await bwipjs.toBuffer({ bcid: 'qrcode', text: 'ERSTER', scale: 4, padding: 10, backgroundcolor: 'FFFFFF' });
    const b = await bwipjs.toBuffer({ bcid: 'qrcode', text: 'ZWEITER', scale: 4, padding: 10, backgroundcolor: 'FFFFFF' });
    const buffer = Buffer.from(await page.evaluate(async ([a, b]) => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + s; });
      const [x, y] = await Promise.all([load(a), load(b)]);
      const c = document.createElement('canvas'); c.width = x.width + y.width + 60; c.height = Math.max(x.height, y.height) + 40;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(x, 20, 20); g.drawImage(y, x.width + 40, 20);
      return [...new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())];
    }, [a.toString('base64'), b.toString('base64')]));
    await page.locator('#srcSeg [data-src="image"]').click();
    await page.setInputFiles('#file', { name: 'two.png', mimeType: 'image/png', buffer });
    await expect(page.locator('#multiInfo')).toHaveText('2 Codes im Bild – tippe einen an.');
    const names = await page.locator('#multiList .name').allTextContents();
    expect(names.sort()).toEqual(['Text: ERSTER', 'Text: ZWEITER']);
    await page.locator('#multiList .open', { hasText: names[1] }).click();
    await page.locator('#viewSeg [data-view="raw"]').click();
    await expect(page.locator('#rawText')).toHaveText(names[1].slice(6));
    expect((await page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS_HIST)).length).toBe(2);
  });

  test('no code in the picture', async ({ page }) => {
    const buffer = await bwipjs.toBuffer({ bcid: 'qrcode', text: 'x', scale: 1, padding: 300, backgroundcolor: 'FFFFFF', includetext: false }).then(() =>
      page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 200; c.height = 200;
        const g = c.getContext('2d'); g.fillStyle = '#88a'; g.fillRect(0, 0, 200, 200);
        return [...new Uint8Array(await (await new Promise(r => c.toBlob(r, 'image/png'))).arrayBuffer())];
      }));
    await page.locator('#srcSeg [data-src="image"]').click();
    await page.setInputFiles('#file', { name: 'plain.png', mimeType: 'image/png', buffer: Buffer.from(buffer) });
    await expect(page.locator('#status')).toContainText('Kein Code im Bild gefunden');
    await expect(page.locator('#empty')).toBeVisible();
  });

  test('photo opened with the installed app is read right away', async ({ page }) => {
    await mockLaunchQueue(page, [await codeFile('qrcode', 'tel:+4930123456')]);
    await page.goto(URL_ + '?opened=1');
    await expect(page.locator('#typeHead')).toHaveText('Telefonnummer');
    await expect(page.locator('#actions a', { hasText: 'Anrufen' })).toHaveAttribute('href', 'tel:+4930123456');
  });
});

test.describe('camera', () => {
  test('reads a code from the camera picture and stops the camera', async ({ page }) => {
    const png = (await bwipjs.toBuffer({ bcid: 'qrcode', text: 'WIFI:S:Kamera;T:nopass;;', scale: 6, padding: 20, backgroundcolor: 'FFFFFF' })).toString('base64');
    await page.addInitScript(png => {
      window.__tracks = [];
      navigator.mediaDevices.getUserMedia = async () => {
        const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
        const c = document.createElement('canvas'); c.width = 640; c.height = 480;
        const g = c.getContext('2d');
        const paint = () => { g.fillStyle = '#777'; g.fillRect(0, 0, 640, 480); g.drawImage(img, (640 - img.width) / 2, (480 - img.height) / 2); };
        paint(); setInterval(paint, 40);
        const s = c.captureStream(25); window.__tracks.push(...s.getTracks()); return s;
      };
    }, png);
    await page.goto(URL_);
    await page.click('#btnCam');
    await expect(page.locator('#typeHead')).toHaveText('WLAN');
    expect(await shownFields(page)).toEqual({ 'Netzwerkname (SSID)': 'Kamera', Verschlüsselung: 'Keine (offenes Netz)' });
    await expect(page.locator('#btnCam')).toHaveText('Nochmal scannen');
    expect(await page.evaluate(() => window.__tracks.every(t => t.readyState === 'ended'))).toBe(true);
    await expect(page.locator('#badges')).toContainText('QR-Code');
  });

  test('denied camera shows a message', async ({ page }) => {
    await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('no', 'NotAllowedError'); }; });
    await page.goto(URL_);
    await page.click('#btnCam');
    await expect(page.locator('#status')).toContainText('Zugriff verweigert');
    await expect(page.locator('#btnCam')).toHaveText('Scannen starten');
  });
});

test.describe('history', () => {
  test('is stored, survives a reload, single delete with undo, clear asks first', async ({ page }) => {
    await parseText(page, 'Erster Text');
    await parseText(page, 'https://example.com/zwei');
    await parseText(page, 'Erster Text');   // read again: moves to the top instead of a duplicate
    await page.reload();
    await openMenu(page);
    await page.locator('#histPage summary').click();
    const rows = page.locator('#histList li');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('.name')).toHaveText('Text: Erster Text');
    await expect(rows.nth(1).locator('.name')).toHaveText('Link: https://example.com/zwei');
    await rows.nth(1).getByRole('button', { name: 'Eintrag löschen' }).click();
    await expect(rows).toHaveCount(1);
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1).locator('.name')).toHaveText('Link: https://example.com/zwei');
    // open an entry: shows it without adding it again
    await rows.nth(1).locator('.open').click();
    await expect(page.locator('#typeHead')).toHaveText('Link');
    await openMenu(page);
    await page.locator('#histPage summary').click();
    await onDialog(page, d => d.dismiss(), { once: true });
    await page.click('#btnClearHist');
    await expect(rows).toHaveCount(2);
    await onDialog(page, d => d.accept(), { once: true });
    await page.click('#btnClearHist');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText('Noch keine Codes gelesen.');
    expect(await page.evaluate(k => localStorage.getItem(k), LS_HIST)).toBeNull();
  });

  test('can be switched off', async ({ page }) => {
    await openMenu(page);
    await page.uncheck('#optHistory');
    await page.keyboard.press('Escape');
    await parseText(page, 'nicht speichern');
    expect(await page.evaluate(k => localStorage.getItem(k), LS_HIST)).toBeNull();
    await page.reload();
    await expect(page.locator('#optHistory')).not.toBeChecked();
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script follow the language', async ({ page }) => {
    await parseText(page, 'BCD\n002\n1\nSCT\n\nWikimedia\nDE33100205000001194700\nEUR1234.5\n\n\n');
    await expect(page.locator('#typeHead')).toHaveText('Bank transfer (EPC QR)');
    expect(await shownFields(page)).toMatchObject({ Payee: 'Wikimedia', IBAN: 'DE33 1002 0500 0001 1947 00', Amount: '€1,234.50' });
    await expect(page.locator('.frow', { hasText: 'IBAN' }).locator('.badge')).toHaveText('check digit ok');
    await switchLang(page, 'de');
    await expect(page.locator('#typeHead')).toHaveText('Überweisung (GiroCode)');
    expect(await shownFields(page)).toMatchObject({ Empfänger: 'Wikimedia', Betrag: '1.234,50\u00a0€' });
  });
});
