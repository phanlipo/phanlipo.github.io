// NFC-Tags: reading and writing with a stand-in for Web NFC (tests/nfc-fake.mjs)
import { test, expect, openMenu, closeMenu, onDialog, switchLang } from './helpers.mjs';
import { fakeNfc, wscCredential } from './nfc-fake.mjs';

const nfc = (page, fn, arg) => page.evaluate(fn, arg);
const hold = (page, serial, records) => nfc(page, ([s, r]) => window.__nfc.read(s, r), [serial, records]);
const written = page => nfc(page, () => window.__nfc.written);
const pendingOps = page => nfc(page, () => window.__nfc.pending);

test.describe('without Web NFC', () => {
  test('explains why, locks scanning and writing, but the form and size estimate work', async ({ page }) => {
    await page.goto('/nfc-tags/');
    await expect(page.locator('#unsupported')).toBeVisible();
    await expect(page.locator('#btnScan')).toBeDisabled();
    await expect(page.locator('#status')).toHaveText('Hier nicht möglich: Dieser Browser kann kein NFC.');
    await page.locator('#mode [data-mode="write"]').click();
    await expect(page.locator('#btnWrite')).toBeDisabled();
    await page.locator('#kind [data-kind="url"]').click();
    await page.fill('#urlIn', 'example.com');
    // URL record: header, type length, payload length, type "U" = 4 bytes; payload = prefix code (https://) + "example.com/" (12) = 13
    // → 17 bytes; NDEF TLV type + length + terminator = 3 → 20
    await expect(page.locator('#size')).toHaveText('Etwa 20 Bytes – passt auf einen NTAG213 (144 Bytes).');
  });
});

test.describe('with Web NFC', () => {
  test.beforeEach(async ({ page }) => { await fakeNfc(page); await page.goto('/nfc-tags/'); });

  test('reads a tag with text and link, keeps it in the history across a reload', async ({ page }) => {
    await expect(page.locator('#unsupported')).toBeHidden();
    await page.click('#btnScan');
    await expect(page.locator('#status')).toHaveText('Bereit – halte einen Tag an die Rückseite des Handys.');
    await expect(page.locator('#btnScan')).toHaveText('Scannen stoppen');
    await hold(page, '04:a2:3b:c1', [
      { recordType: 'text', data: 'Hallo Welt', lang: 'de' },
      { recordType: 'url', data: 'https://example.com/info?a=1' },
    ]);
    const card = page.locator('#resultCard');
    await expect(card).toBeVisible();
    await expect(page.locator('#tagMeta')).toContainText('Seriennummer 04:a2:3b:c1 · 2 Einträge');
    const recs = page.locator('#records > .rec');
    await expect(recs).toHaveCount(2);
    await expect(recs.nth(0).locator('h3')).toHaveText('Text');
    await expect(recs.nth(0).locator('.val')).toHaveText('Hallo Welt');
    await expect(recs.nth(1).locator('h3')).toHaveText('Link');
    const openLink = recs.nth(1).getByRole('link', { name: 'Öffnen' });
    await expect(openLink).toHaveAttribute('href', 'https://example.com/info?a=1');
    await expect(openLink).toHaveAttribute('rel', 'noopener noreferrer');

    const hist = await nfc(page, () => JSON.parse(localStorage.getItem('nfc-tags.history.v1')));
    expect(hist).toHaveLength(1);
    expect(hist[0]).toMatchObject({ serial: '04:a2:3b:c1', records: [
      { kind: 'text', text: 'Hallo Welt', lang: 'de' }, { kind: 'url', url: 'https://example.com/info?a=1', urlKind: 'web' }] });

    await page.reload();
    await expect(page.locator('#resultCard')).toBeHidden();
    await openMenu(page);
    await page.locator('#histPage summary').click();
    const row = page.locator('#histList li').first();
    await expect(row.locator('.name')).toHaveText('Text: Hallo Welt');
    await row.locator('.open').click();
    await expect(page.locator('#records .rec')).toHaveCount(2);
  });

  test('stops scanning, decodes phone, contact, smart poster, empty and unknown records', async ({ page }) => {
    await page.click('#btnScan');
    await expect(page.locator('#btnScan')).toHaveText('Scannen stoppen');
    await hold(page, '', [
      { recordType: 'url', data: 'tel:+4930123456' },
      { recordType: 'mime', mediaType: 'text/vcard', data: 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Muster;Erika;;;\r\nFN:Erika Muster\r\nTEL;TYPE=CELL:+49 171 2345678\r\nEMAIL:erika@example.org\r\nEND:VCARD\r\n' },
      { recordType: 'smart-poster', records: [{ recordType: 'url', data: 'https://example.net/' }, { recordType: 'text', data: 'Titel' }] },
      { recordType: 'empty' },
      { recordType: 'example.com:game', data: [0, 1, 2, 255] },
    ]);
    const recs = page.locator('#records > .rec');
    await expect(recs).toHaveCount(5);
    await expect(recs.nth(0).locator('h3')).toHaveText('Telefonnummer');
    await expect(recs.nth(0).locator('.val')).toHaveText('+4930123456');
    await expect(recs.nth(0).getByRole('link', { name: 'Anrufen' })).toHaveAttribute('href', 'tel:+4930123456');
    await expect(recs.nth(1).locator('dd')).toHaveText(['Erika Muster', '+49 171 2345678', 'erika@example.org']);
    await expect(recs.nth(2).locator('.rec')).toHaveCount(2);
    await expect(recs.nth(3).locator('h3')).toHaveText('Leerer Eintrag');
    await expect(recs.nth(4).locator('h3')).toHaveText('Eintrag (example.com:game)');
    await expect(recs.nth(4).locator('.val')).toHaveText('00 01 02 ff');
    await expect(page.locator('#tagMeta')).not.toContainText('Seriennummer');

    await page.click('#btnScan');
    await expect(page.locator('#btnScan')).toHaveText('Scannen starten');
    expect(await nfc(page, () => window.__nfc.scans)).toBe(0);
  });

  test('Wi-Fi tag: password only on request, copy to the form and write the same credential', async ({ page }) => {
    await page.click('#btnScan');
    await expect(page.locator('#btnScan')).toHaveText('Scannen stoppen');
    const cred = wscCredential({ ssid: 'Gäste', key: 'sehr-geheim-123' });
    await hold(page, '1', [{ recordType: 'mime', mediaType: 'application/vnd.wfa.wsc', data: cred }]);
    const rec = page.locator('#records > .rec');
    await expect(rec.locator('h3')).toHaveText('WLAN');
    await expect(rec.locator('dd')).toHaveText(['Gäste', 'WPA2/WPA3']);
    await expect(rec).not.toContainText('sehr-geheim-123');
    await rec.getByRole('button', { name: 'Passwort zeigen' }).click();
    await expect(rec.locator('.val')).toHaveText('sehr-geheim-123');

    await rec.getByRole('button', { name: 'Zum Schreiben übernehmen' }).click();
    await expect(page.locator('#writeView')).toBeVisible();
    await expect(page.locator('#kind [data-kind="wifi"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ssidIn')).toHaveValue('Gäste');
    await expect(page.locator('#wkeyIn')).toHaveValue('sehr-geheim-123');
    // Switching to writing stopped the scan
    expect(await nfc(page, () => window.__nfc.scans)).toBe(0);
    // The password is never part of the stored draft
    expect(await nfc(page, () => localStorage.getItem('nfc-tags.draft.v1'))).not.toContain('geheim');

    await page.click('#btnWrite');
    await expect(page.locator('#waitBox')).toBeVisible();
    await expect(page.locator('#waitText')).toHaveText('Halte jetzt den Tag an die Rückseite des Handys, um ihn zu beschreiben.');
    expect(await nfc(page, () => window.__nfc.tap())).toBe(true);
    await expect(page.locator('.toast')).toContainText('Tag beschrieben');
    await expect(page.locator('#waitBox')).toBeHidden();
    expect(await written(page)).toEqual([{ records: [{ recordType: 'mime', mediaType: 'application/vnd.wfa.wsc', data: cred }] }]);
  });

  test('writes text, link, phone, email and contact; checks the fields first', async ({ page }) => {
    await page.locator('#mode [data-mode="write"]').click();
    await page.click('#btnWrite');
    await expect(page.locator('#writeErr')).toHaveText('Gib einen Text ein.');
    expect(await pendingOps(page)).toBe(0);

    await page.fill('#textIn', 'Grüße');
    // Text record: 4 header bytes + payload (status byte + "de" + "Grüße" = 7 UTF-8 bytes: ü and ß take 2) = 14; + 3 TLV = 17
    await expect(page.locator('#size')).toHaveText('Etwa 17 Bytes – passt auf einen NTAG213 (144 Bytes).');
    await page.click('#btnWrite');
    await nfc(page, () => window.__nfc.tap());
    await expect(page.locator('#waitBox')).toBeHidden();

    await page.locator('#kind [data-kind="url"]').click();
    await page.fill('#urlIn', 'kein link');
    await page.click('#btnWrite');
    await expect(page.locator('#writeErr')).toHaveText('Das ist keine gültige Web-Adresse (z. B. https://example.com).');
    await page.fill('#urlIn', 'example.com/a b');
    await page.click('#btnWrite');
    await nfc(page, () => window.__nfc.tap());
    await expect(page.locator('#waitBox')).toBeHidden();

    await page.locator('#kind [data-kind="tel"]').click();
    await page.fill('#telIn', '+49 (30) 123-456');
    await page.click('#btnWrite');
    await nfc(page, () => window.__nfc.tap());
    await expect(page.locator('#waitBox')).toBeHidden();

    await page.locator('#kind [data-kind="mail"]').click();
    await page.fill('#mailIn', 'a@example.org');
    await page.fill('#subjIn', 'Hallo & so');
    await page.click('#btnWrite');
    await nfc(page, () => window.__nfc.tap());
    await expect(page.locator('#waitBox')).toBeHidden();

    await page.locator('#kind [data-kind="contact"]').click();
    await page.fill('#nameIn', 'Erika Muster');
    await page.fill('#ctelIn', '+49 171 2345678');
    await page.click('#btnWrite');
    await nfc(page, () => window.__nfc.tap());
    await expect(page.locator('#waitBox')).toBeHidden();

    const w = await written(page);
    const vcard = 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Muster;Erika;;;\r\nFN:Erika Muster\r\nTEL;TYPE=CELL:+49 171 2345678\r\nEND:VCARD\r\n';
    expect(w).toEqual([
      { records: [{ recordType: 'text', lang: 'de', data: 'Grüße' }] },
      { records: [{ recordType: 'url', data: 'https://example.com/a%20b' }] },
      { records: [{ recordType: 'url', data: 'tel:+4930123456' }] },
      { records: [{ recordType: 'url', data: 'mailto:a@example.org?subject=Hallo%20%26%20so' }] },
      { records: [{ recordType: 'mime', mediaType: 'text/vcard', data: [...new TextEncoder().encode(vcard)] }] },
    ]);
  });

  test('draft survives a reload; Wi-Fi password and too short keys are not accepted', async ({ page }) => {
    await page.locator('#mode [data-mode="write"]').click();
    await page.locator('#kind [data-kind="wifi"]').click();
    await page.fill('#ssidIn', 'Heim');
    await page.fill('#wkeyIn', 'kurz');
    await page.click('#btnWrite');
    await expect(page.locator('#writeErr')).toHaveText('Das Passwort braucht 8 bis 63 Zeichen.');
    await page.locator('#wauth [data-wauth="open"]').click();
    await expect(page.locator('#wkeyField')).toBeHidden();
    await expect(page.locator('#size')).toContainText('passt auf einen NTAG213');
    await page.reload();
    await expect(page.locator('#writeView')).toBeVisible();
    await expect(page.locator('#kind [data-kind="wifi"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#ssidIn')).toHaveValue('Heim');
    await expect(page.locator('#wauth [data-wauth="open"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#wauth [data-wauth="wpa2"]').click();
    await expect(page.locator('#wkeyIn')).toHaveValue('');
  });

  test('a failed write explains itself; cancelling stops waiting', async ({ page }) => {
    await page.locator('#mode [data-mode="write"]').click();
    await page.fill('#textIn', 'x');
    await page.click('#btnWrite');
    await expect(page.locator('#waitBox')).toBeVisible();
    await nfc(page, () => window.__nfc.fail('NetworkError'));
    await expect(page.locator('#writeErr')).toHaveText('Der Tag wurde zu früh weggenommen oder lässt sich nicht beschreiben. Halte ihn ruhig an das Handy und versuche es noch einmal.');
    await expect(page.locator('#waitBox')).toBeHidden();
    await page.click('#btnWrite');
    await expect(page.locator('#writeErr')).toBeHidden();
    await page.click('#btnCancel');
    await expect(page.locator('#waitBox')).toBeHidden();
    expect(await pendingOps(page)).toBe(0);
    expect(await written(page)).toEqual([]);
  });

  test('erase and lock ask first and wait for a tag', async ({ page }) => {
    await onDialog(page, d => d.dismiss(), { once: true });
    await openMenu(page);
    await page.click('#btnLock');
    await expect(page.locator('#waitBox')).toBeHidden();
    expect(await pendingOps(page)).toBe(0);

    await onDialog(page, d => d.accept(), { once: true });
    await openMenu(page);
    await page.click('#btnLock');
    await expect(page.locator('#waitText')).toHaveText('Halte jetzt den Tag an das Handy, um ihn zu sperren.');
    await nfc(page, () => window.__nfc.tap());
    await expect(page.locator('.toast')).toContainText('Tag schreibgeschützt');

    await onDialog(page, d => d.accept(), { once: true });
    await openMenu(page);
    await page.click('#btnErase');
    await expect(page.locator('#waitText')).toHaveText('Halte jetzt den Tag an das Handy, um ihn zu leeren.');
    await nfc(page, () => window.__nfc.tap());
    await expect(page.locator('.toast')).toContainText('Tag geleert');
    expect(await written(page)).toEqual([{ locked: true }, { records: [{ recordType: 'empty' }] }]);
  });

  test('a refused permission is explained; history can be switched off and deleted', async ({ page }) => {
    await nfc(page, () => { window.__nfc.scanError = 'NotAllowedError'; });
    await page.click('#btnScan');
    await expect(page.locator('#status')).toHaveText(/NFC wurde nicht erlaubt/);
    await expect(page.locator('#btnScan')).toHaveText('Scannen starten');

    await page.click('#btnScan');
    await expect(page.locator('#btnScan')).toHaveText('Scannen stoppen');
    await hold(page, 'a', [{ recordType: 'text', data: 'eins' }]);
    await hold(page, 'b', [{ recordType: 'text', data: 'zwei' }]);
    await openMenu(page);
    await page.locator('#histPage summary').click();
    await expect(page.locator('#histList .name')).toHaveText(['Text: zwei', 'Text: eins']);
    await page.locator('#histList li').first().getByRole('button', { name: 'Eintrag löschen' }).click();
    await expect(page.locator('#histList .name')).toHaveText(['Text: eins']);
    await page.locator('.toast').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.locator('#histList .name')).toHaveText(['Text: zwei', 'Text: eins']);
    await onDialog(page, d => d.accept(), { once: true });
    await page.click('#btnClearHist');
    await expect(page.locator('#histList')).toHaveText('Noch keine Tags gelesen.');
    await closeMenu(page);
    await openMenu(page);
    await page.uncheck('#optHistory');
    await closeMenu(page);
    await hold(page, 'c', [{ recordType: 'text', data: 'drei' }]);
    await expect(page.locator('#records .val')).toHaveText('drei');
    expect(await nfc(page, () => localStorage.getItem('nfc-tags.history.v1'))).toBeNull();
  });

  test('English: texts written by the script follow the language', async ({ page }) => {
    await page.click('#btnScan');
    await hold(page, 'x', [{ recordType: 'url', data: 'mailto:a@example.org' }]);
    await switchLang(page, 'en');
    await expect(page.locator('#btnScan')).toHaveText('Stop scanning');
    await expect(page.locator('#records h3')).toHaveText('Email');
    await expect(page.locator('#records').getByRole('link', { name: 'Write email' })).toBeVisible();
    await expect(page.locator('#tagMeta')).toContainText('Serial number x · 1 record');
  });
});
