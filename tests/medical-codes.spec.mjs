// Kodiersysteme: BfArM downloads (ClaML ZIP, EDV-TXT) read in the browser – with hand-written test files in the
// layout of the real ones (tests/medical-codes-data.mjs), no BfArM content.
import { test, expect, openMenu, switchLang, clipboardText, mockLaunchQueue, axe } from './helpers.mjs';
import { icdZip, opsZip, alphaZip, metaZip, nestedZip, zip, ICD_XML } from './medical-codes-data.mjs';

const ZIP = 'application/zip';
const load = (page, files) => page.setInputFiles('#fileInput', files.map(([name, buffer]) => ({ name, mimeType: ZIP, buffer })));
const rows = page => page.locator('#results > li');
// Typing waits a moment before searching; Enter searches at once
const find = async (page, q) => { await page.fill('#q', q); await page.press('#q', 'Enter'); };

test.beforeEach(async ({ page }) => { await page.goto('/medical-codes/'); });

test('first start shows only the setup with the BfArM link', async ({ page }) => {
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#browse')).toBeHidden();
  await expect(page.locator('#setup a[href^="https://www.bfarm.de/DE/Kodiersysteme/Services/Downloads/"]')).toHaveAttribute('rel', /noopener/);
});

test('ICD-10-GM ClaML ZIP: chapters, browse, detail with notes, references and parents', async ({ page }) => {
  await load(page, [['icd10gm2026syst-claml.zip', icdZip()]]);
  await expect(page.locator('#browse')).toBeVisible();
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#count')).toHaveText('14 Einträge');
  // Without a search: the chapters, in book order
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText('I' + 'Bestimmte infektiöse und parasitäre Krankheiten');
  await expect(rows(page).nth(0)).toContainText('Kapitel');
  await rows(page).nth(0).locator('.open').click();
  await expect(page.locator('#detail')).toBeVisible();
  await expect(page.locator('#dKind')).toHaveText('ICD-10-GM 2026 · Kapitel');
  await page.locator('#dBody .open', { hasText: 'Infektiöse Darmkrankheiten' }).click();
  await page.locator('#dBody .open', { hasText: 'Cholera' }).first().click();
  await page.locator('#dBody .open', { hasText: 'A00.9' }).click();
  await expect(page.locator('#dTitle')).toHaveText('A00.9Cholera, nicht näher bezeichnet');
  await expect(page.locator('#crumbs li')).toHaveText(['I Bestimmte infektiöse und parasitäre Krankheiten', 'A00-A09 Infektiöse Darmkrankheiten', 'A00 Cholera']);
  // Exclusion with a reference that opens the code; note with paragraphs and list items as lines
  const excl = page.locator('.rub', { has: page.locator('h3', { hasText: 'Exklusive' }) });
  await expect(excl.locator('p')).toHaveText('Paratyphus A (A01.1)');
  const note = page.locator('.rub', { has: page.locator('h3', { hasText: 'Hinweis' }) });
  expect(await note.locator('p').innerText()).toBe('Erster Absatz & mehr.\nPunkt eins\nPunkt zwei');
  await excl.locator('button.ref').click();
  await expect(page.locator('#dTitle')).toHaveText('A01.1Paratyphus A');
  // Back (button and browser back) walks the opened codes back to the list
  await page.goBack();
  await expect(page.locator('#dTitle')).toHaveText('A00.9Cholera, nicht näher bezeichnet');
  await page.click('#btnBack');
  await expect(page.locator('#dTitle')).toHaveText('A00Cholera');
  await page.click('#btnBack');
  await expect(page.locator('#dTitle')).toHaveText('A00-A09Infektiöse Darmkrankheiten');
  await page.click('#btnBack');
  await expect(page.locator('#dTitle')).toHaveText('IBestimmte infektiöse und parasitäre Krankheiten');
  await page.click('#btnBack');
  await expect(page.locator('#browse')).toBeVisible();
  // Recently viewed, newest first
  await expect(page.locator('#recent .code')).toHaveText(['A01.1', 'A00.9', 'A00', 'A00-A09', 'I']);
});

test('dagger codes, meta data and codes built from a modifier', async ({ page }) => {
  await load(page, [['icd.zip', icdZip()]]);
  await find(page, 'a010');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toHaveText('A01.0†Typhus abdominalis');
  await rows(page).first().locator('.open').click();
  await expect(page.locator('#dKind')).toHaveText('ICD-10-GM 2026 · Kode · Ätiologie (Kreuz-Kode)');
  await page.click('#btnBack');
  await find(page, 'cholera');
  await rows(page).first().locator('.open').click();
  await expect(page.locator('#dTitle')).toHaveText('A00Cholera');
  await page.locator('#dBody details summary').click();
  await expect(page.locator('#dBody .meta-table tr').nth(1)).toHaveText('Para295P');
  await page.click('#btnBack');
  // M00 has a 5th-digit modifier: M00.0 gets M00.00 and M00.01
  await find(page, 'M00.0');
  await expect(rows(page).locator('.code')).toHaveText(['M00.0', 'M00.00', 'M00.01']);
  await rows(page).nth(2).locator('.open').click();
  await expect(page.locator('#dTitle')).toHaveText('M00.01Arthritis und Polyarthritis durch Staphylokokken: Schulterregion');
  await expect(page.locator('#dKind')).toContainText('aus Zusatzliste zusammengesetzt');
  await expect(page.locator('.rub', { hasText: 'Inklusive' }).locator('p')).toHaveText('Klavikula, Skapula');
});

test('search: code prefixes, words in any order, umlauts and inclusions', async ({ page }) => {
  await load(page, [['icd.zip', icdZip()]]);
  const codes = () => rows(page).locator('.code');
  await find(page, 'a0');
  await expect(codes()).toHaveText(['A00-A09', 'A00', 'A00.0', 'A00.9', 'A01', 'A01.0†', 'A01.1']);
  await expect(page.locator('#count')).toHaveText('7 Treffer');
  await find(page, 'bezeichnet cholera');
  await expect(codes()).toHaveText(['A00.9']);
  await find(page, 'Infektioese');
  await expect(codes()).toHaveText(['A00-A09', 'M00-M03', 'I']);
  // Found through the inclusion, after the title matches
  await find(page, 'klassische');
  await expect(codes()).toHaveText(['A00.0']);
  await find(page, 'gibtsnicht');
  await expect(page.locator('#count')).toHaveText('Keine Treffer.');
  await expect(rows(page)).toHaveCount(0);
});

test('OPS in ISO-8859-1, stored ZIP: 6th digit from the modifier, excluded where the file says so', async ({ page }) => {
  await load(page, [['ops2027syst-claml.zip', opsZip()]]);
  await find(page, '5-780');
  await expect(rows(page).locator('.code')).toHaveText(['5-780', '5-780.0', '5-780.00', '5-780.01', '5-780.1']);
  await expect(rows(page).nth(4)).toContainText('Knochenbohrung, Größe egal');
  await find(page, '578001');
  await expect(rows(page)).toHaveText(['5-780.01Exploration von Knochengewebe: Humerus proximal']);
});

test('Alpha-ID-SE next to ICD-10-GM: links both ways, invalid entries last', async ({ page }) => {
  await load(page, [['alphaidse2026.zip', alphaZip()], ['icd.zip', icdZip()]]);
  await expect(page.locator('#dsChips button')).toHaveText(['Alpha-ID-SE 2026', 'ICD-10-GM 2026']);
  // The last opened file is chosen
  await expect(page.locator('#dsChips button[aria-pressed="true"]')).toHaveText('ICD-10-GM 2026');
  await page.locator('#dsChips button', { hasText: 'Alpha-ID-SE' }).click();
  await expect(page.locator('#listEmpty')).toBeVisible();
  await expect(page.locator('#count')).toHaveText('4 Einträge');
  await find(page, 'cholera');
  await expect(rows(page).locator('.name')).toHaveText(['Cholera durch Vibrio cholerae O:1, Biovar cholerae', 'Asiatische Cholera']);
  await find(page, 'a0');
  await expect(rows(page).locator('.name')).toHaveText(['Cholera durch Vibrio cholerae O:1, Biovar cholerae', 'Asiatische Cholera', 'Typhusmeningitis']);
  await expect(rows(page).nth(2)).toHaveClass(/inactive/);
  await expect(rows(page).nth(2).locator('.meta')).toHaveText('I11111 · A01.0 · G01* · nicht mehr gültig');
  await rows(page).nth(2).locator('.open').click();
  await expect(page.locator('#dKind')).toHaveText('Alpha-ID-SE 2026 · nicht mehr gültig');
  await expect(page.locator('#dBody tr').nth(1)).toHaveText('PrimärkodeA01.0 Typhus abdominalis');
  // Star code not in the loaded file: plain text
  await expect(page.locator('#dBody tr').nth(2)).toHaveText('Stern-KodeG01*');
  await page.locator('#dBody button.ref', { hasText: 'A01.0' }).click();
  await expect(page.locator('#dTitle')).toHaveText('A01.0†Typhus abdominalis');
  await expect(page.locator('#dsChips button[aria-pressed="true"]')).toHaveText('ICD-10-GM 2026');
  // … and the code lists its alphabet entries
  const alpha = page.locator('.rub', { has: page.locator('h3', { hasText: 'Einträge im Alphabet – Alpha-ID-SE 2026' }) });
  await expect(alpha.locator('.name')).toHaveText(['Typhusmeningitis']);
  // ORPHAcode
  await page.click('#btnBack');
  await expect(page.locator('#dTitle')).toHaveText('Typhusmeningitis');
  await page.click('#btnBack');
  await expect(page.locator('#browse')).toBeVisible();
  await find(page, 'fabry');
  await rows(page).first().locator('.open').click();
  await expect(page.locator('#dBody tr', { hasText: 'ORPHAcode' })).toHaveText('ORPHAcode324');
});

test('nested ZIP of older years; wrong files get a clear message', async ({ page }) => {
  await load(page, [['icd10gm2024.zip', nestedZip()]]);
  await expect(page.locator('#count')).toHaveText('14 Einträge');
  await openMenu(page);
  await page.locator('#filesPage summary').click();
  await page.click('#btnAdd');
  await load(page, [['icd10gm2026syst-meta.zip', metaZip()]]);
  await expect(page.locator('#err')).toContainText('Metadaten TXT');
  await load(page, [['leer.zip', zip([{ name: 'liesmich.pdf', data: '%PDF-1.4' }])]]);
  await expect(page.locator('#err')).toContainText('nichts, was die App lesen kann');
  await page.setInputFiles('#fileInput', { name: 'kaputt.zip', mimeType: ZIP, buffer: Buffer.from('PK\u0003\u0004 abgeschnitten') });
  await expect(page.locator('#err')).toContainText('beschädigt');
  // The loaded file is still there
  await expect(page.locator('#count')).toHaveText('14 Einträge');
  // A plain XML file works too, and the same file twice is recognised
  await page.setInputFiles('#fileInput', { name: 'icd.xml', mimeType: 'application/xml', buffer: Buffer.from(ICD_XML) });
  await expect(page.locator('#err')).toBeHidden();
  await expect(page.locator('#dsChips button')).toHaveCount(2);
  await page.setInputFiles('#fileInput', { name: 'icd.xml', mimeType: 'application/xml', buffer: Buffer.from(ICD_XML) });
  await expect(page.locator('.toast')).toContainText('Schon geladen');
  await expect(page.locator('#dsChips button')).toHaveCount(2);
});

test('files survive a reload; removing one offers undo', async ({ page }) => {
  await load(page, [['alphaidse2026.zip', alphaZip()], ['icd.zip', icdZip()]]);
  await find(page, 'A00.9');
  await rows(page).first().locator('.open').click();
  await page.reload();
  // The opened code comes back, with both files
  await expect(page.locator('#dTitle')).toHaveText('A00.9Cholera, nicht näher bezeichnet');
  await expect(page.locator('#dsChips button')).toHaveCount(2);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('medical-codes.settings.v1'))).recent).toBeTruthy();
  await openMenu(page);
  await page.locator('#filesPage summary').click();
  await expect(page.locator('#files .name')).toHaveText(['Alpha-ID-SE 2026', 'ICD-10-GM 2026']);
  await page.locator('#files .btn.icon').nth(1).click();
  await expect(page.locator('#files .name')).toHaveText(['Alpha-ID-SE 2026']);
  await page.locator('.toast-action').click();
  await expect(page.locator('#files .name')).toHaveText(['Alpha-ID-SE 2026', 'ICD-10-GM 2026']);
  await page.locator('#files .btn.icon').first().click();
  await expect(page.locator('#files .name')).toHaveText(['ICD-10-GM 2026']);
  await page.reload();
  await expect(page.locator('#dTitle')).toHaveText('A00.9Cholera, nicht näher bezeichnet');
  await page.click('#btnBack');
  await expect(page.locator('#browse')).toBeVisible();
  await expect(page.locator('#dsChips')).toBeHidden();
  await expect(page.locator('#count')).toHaveText('14 Einträge');
  // All files removed: the setup again
  await openMenu(page);
  await page.locator('#filesPage summary').click();
  await page.locator('#files .btn.icon').first().click();
  await page.reload();
  await expect(page.locator('#setup')).toBeVisible();
});

test('copy takes code and title; offline after the first visit', async ({ page, context }) => {
  await load(page, [['icd.zip', icdZip()]]);
  await find(page, 'A00.0');
  await rows(page).first().locator('.open').click();
  await page.click('#btnCopy');
  expect(await clipboardText(page)).toBe('A00.0 Cholera durch Vibrio cholerae O:1, Biovar cholerae');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#dTitle')).toHaveText('A00.0Cholera durch Vibrio cholerae O:1, Biovar cholerae');
  await page.click('#btnBack');
  await load(page, [['ops.zip', opsZip()]]);
  await expect(page.locator('#dsChips button')).toHaveCount(2);
});

test('opened with the installed app (launch queue)', async ({ page }) => {
  await mockLaunchQueue(page, [{ name: 'icd.zip', mimeType: ZIP, buffer: icdZip() }]);
  await page.goto('/medical-codes/?opened=1');
  await expect(page.locator('#count')).toHaveText('14 Einträge');
});

test('diagnostics hold no file names or search terms', async ({ page }) => {
  await load(page, [['geheim-icd.zip', icdZip()]]);
  await find(page, 'cholera');
  await expect(rows(page)).toHaveCount(3);
  const text = await page.evaluate(() => Tools.diag.text());
  expect(text).toContain('read ok');
  expect(text).not.toContain('geheim');
  expect(text).not.toMatch(/cholera/i);
});

test('accessible with loaded data, also in the detail view', async ({ page }) => {
  await load(page, [['alpha.zip', alphaZip()], ['icd.zip', icdZip()]]);
  await find(page, 'a0');
  expect((await axe(page).analyze()).violations).toEqual([]);
  await page.locator('#results .open', { hasText: 'A00.9' }).click();
  expect((await axe(page).analyze()).violations).toEqual([]);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script are English; switching back re-renders', async ({ page }) => {
    await load(page, [['icd.zip', icdZip()]]);
    await expect(page.locator('header .sub')).toHaveText('Search ICD-10-GM, OPS and Alpha-ID-SE from the BfArM');
    await expect(page.locator('#count')).toHaveText('14 entries');
    await find(page, 'A00.9');
    await rows(page).first().locator('.open').click();
    await expect(page.locator('.rub h3')).toHaveText(['Excludes', 'Note']);
    await switchLang(page, 'de');
    await expect(page.locator('.rub h3')).toHaveText(['Exklusive', 'Hinweis']);
  });
});
