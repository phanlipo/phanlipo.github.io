// Reihengeschäft: the expected results are worked out by hand from § 3 Abs. 6a/7/8, § 6, § 6a, § 25b UStG and
// UStAE 25b.1 – independent of chain.js. Cases mirror typical textbook examples (DE-AT-IT triangle, intermediary with
// VAT ID of the country of departure, import with shift of place, export with a resident customer …).
import { test, expect, openMenu, switchLang, clipboardText } from './helpers.mjs';

const P = (...list) => list.map(x => Array.isArray(x) ? { country: x[0], vat: x[1] } : { country: x });
const evaluate = (page, cs) => page.evaluate(c => window.Chain.evaluate(c), cs);
const brief = r => ({
  kind: r.kind, moved: r.moved,
  supplies: r.supplies.map(s => `${s.place}:${s.treatment}${s.shifted ? '*' : ''}${s.taxDebtor != null ? '@' + s.taxDebtor : ''}`),
  abroad: r.registrations.flatMap((l, p) => l.filter(x => !x.home).map(x => `U${p + 1}:${x.country}${x.has ? '(has)' : ''}`)),
  triangle: r.triangle ? r.triangle.applies : null,
  warnings: r.warnings.map(w => w.code),
});

test.beforeEach(async ({ page }) => { await page.goto('/chain-transaction/'); });

test.describe('assessment logic', () => {
  test('intra-Community: who transports decides the moved supply', async ({ page }) => {
    // U1 transports: supply 1 moved and exempt; U2 (AT ID) makes a triangle with U3 (IT)
    expect(brief(await evaluate(page, { parties: P('DE', 'AT', 'IT'), transport: 0 }))).toEqual({
      kind: 'intra', moved: 0, supplies: ['DE:ic', 'IT:triangle@2'], abroad: [], triangle: true, warnings: [],
    });
    // Last customer collects: supply 2 moved (from DE), supply 1 resting in DE → U2 must register in DE
    expect(brief(await evaluate(page, { parties: P('DE', 'AT', 'IT'), transport: 2 }))).toEqual({
      kind: 'intra', moved: 1, supplies: ['DE:taxable@0', 'DE:ic'], abroad: ['U2:DE'], triangle: null, warnings: [],
    });
    // Intermediary with its own (AT) ID: presumption → supply to it is moved → triangle again
    expect(brief(await evaluate(page, { parties: P('DE', 'AT', 'IT'), transport: 1 })).moved).toBe(0);
    // Intermediary with the VAT ID of the country of departure (DE): its own supply is moved
    expect(brief(await evaluate(page, { parties: P('DE', ['AT', 'DE'], 'IT'), transport: 1 }))).toEqual({
      kind: 'intra', moved: 1, supplies: ['DE:taxable@0', 'DE:ic'], abroad: ['U2:DE(has)'], triangle: null, warnings: [],
    });
  });

  test('four companies: intermediary U3 with German ID, triangle only at the end unless T-646/24', async ({ page }) => {
    // DE-AT-DE-AT, U3 transports with its DE ID: supply 3 moved; U2 (AT) sells in DE → registration in DE
    expect(brief(await evaluate(page, { parties: P('DE', 'AT', 'DE', 'AT'), transport: 2 }))).toEqual({
      kind: 'intra', moved: 2, supplies: ['DE:taxable@0', 'DE:taxable@1', 'DE:ic'], abroad: ['U2:DE'], triangle: null, warnings: [],
    });
    // Same with U3 using an AT ID: supply 2 moved, U3 acquires and sells in AT; no triangle (U3 has the AT ID)
    let r = await evaluate(page, { parties: P('DE', 'AT', ['DE', 'AT'], 'AT'), transport: 2 });
    expect(brief(r)).toMatchObject({ moved: 1, supplies: ['DE:taxable@0', 'DE:ic', 'AT:taxable@2'], abroad: ['U2:DE', 'U3:AT(has)'], triangle: false });
    // With an FR ID (third state): U2 → U3 → U4 is a triangle at the end of the chain
    r = await evaluate(page, { parties: P('DE', 'AT', ['DE', 'FR'], 'AT'), transport: 2 });
    expect(brief(r)).toMatchObject({ moved: 1, supplies: ['DE:taxable@0', 'DE:ic', 'AT:triangle@3'], abroad: ['U2:DE', 'U3:FR(has)'], triangle: true, warnings: [] });
    // DE-AT-IT-IT, U2 transports: trio U1-U2-U3 at the start – not accepted by UStAE, accepted with T-646/24
    r = await evaluate(page, { parties: P('DE', 'AT', 'IT', 'IT'), transport: 1 });
    expect(r.triangle).toMatchObject({ a: 0, b: 1, c: 2, applies: false, atEnd: false });
    expect(r.triangle.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['position']);
    expect(brief(r)).toMatchObject({ supplies: ['DE:ic', 'IT:taxable@1', 'IT:taxable@2'], abroad: ['U2:IT'] });
    r = await evaluate(page, { parties: P('DE', 'AT', 'IT', 'IT'), transport: 1, eug: true });
    expect(brief(r)).toMatchObject({ supplies: ['DE:ic', 'IT:triangle@2', 'IT:taxable@2'], abroad: [], triangle: true });
  });

  test('failing exemptions and double acquisition', async ({ page }) => {
    // Customer of the moved supply without VAT ID: not exempt
    let r = await evaluate(page, { parties: P('DE', ['AT', ''], 'IT'), transport: 0 });
    expect(brief(r)).toMatchObject({ supplies: ['DE:ic-fail@0', 'IT:taxable@1'], triangle: false, warnings: ['icFail'] });
    expect(r.supplies[0].failReason).toBe('noVat');
    // Last customer uses a French ID for goods arriving in Italy: § 3d sentence 2
    r = await evaluate(page, { parties: P('DE', 'AT', ['IT', 'FR']), transport: 2 });
    expect(r.acquisition).toEqual({ party: 2, country: 'IT', double: 'FR', deemed: false });
    expect(r.warnings.map(w => w.code)).toEqual(['doubleAcq']);
    // Middle company established in the country of arrival: no triangle
    r = await evaluate(page, { parties: P('DE', ['IT', 'AT'], 'IT'), transport: 0 });
    expect(r.triangle.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['midNotEstablished']);
    // Last customer with another ID than the country of arrival: no triangle
    r = await evaluate(page, { parties: P('DE', 'AT', ['IT', 'FR']), transport: 0 });
    expect(r.triangle.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['lastVat']);
  });

  test('exports, imports, domestic, warehouse and non-EU cases', async ({ page }) => {
    // Export, intermediary U2 (FR) transports with its FR ID: supply to it moved, exempt (foreign customer)
    expect(brief(await evaluate(page, { parties: P('DE', 'FR', 'CH'), transport: 1 }))).toEqual({
      kind: 'export', moved: 0, supplies: ['DE:export', 'CH:outside'], abroad: [], triangle: null, warnings: [],
    });
    // German intermediary with German ID transports as supplier: its own supply is the export
    expect(brief(await evaluate(page, { parties: P('DE', 'DE', 'CH'), transport: 1 })).supplies).toEqual(['DE:taxable@0', 'DE:export']);
    // German intermediary without ID collects itself: export to a resident customer is not exempt
    let r = await evaluate(page, { parties: P('DE', ['DE', ''], 'CH'), transport: 1 });
    expect(brief(r)).toMatchObject({ moved: 0, supplies: ['DE:export-fail@0', 'CH:outside'], warnings: ['exportFail'] });
    // Import CH → FR, U2 transports and declares: supply 2 moved, place shifts to FR (§ 3 Abs. 8)
    r = await evaluate(page, { parties: P('CH', 'DE', 'AT', 'FR'), transport: 1 });
    expect(brief(r)).toEqual({
      kind: 'import', moved: 1, supplies: ['CH:outside', 'FR:taxable*@1', 'FR:taxable@2'], abroad: ['U2:FR', 'U3:FR'], triangle: null, warnings: [],
    });
    expect(r.import).toEqual({ importer: 1, country: 'FR', holder: 1, deductible: true, privateImporter: false });
    expect(r.registrations[1]).toEqual([{ country: 'FR', reasons: ['sale', 'import'], home: false, has: false, oss: false }]);
    // U2 transports, U3 declares: presumption stays (supply 1 moved, in CH); U3 cannot deduct the import VAT
    r = await evaluate(page, { parties: P('CH', 'DE', 'AT', 'FR'), transport: 1, importer: 2 });
    expect(brief(r)).toMatchObject({ moved: 0, supplies: ['CH:outside', 'FR:taxable@1', 'FR:taxable@2'], warnings: ['eustNoDeduct'] });
    expect(r.import).toEqual({ importer: 2, country: 'FR', holder: 1, deductible: false, privateImporter: false });
    // Domestic: everything in DE, the French intermediary needs a German registration
    expect(brief(await evaluate(page, { parties: P('DE', 'FR', 'DE'), transport: 1 }))).toMatchObject({
      kind: 'domestic', supplies: ['DE:taxable@0', 'DE:taxable@1'], abroad: ['U2:DE'],
    });
    // French U1 ships from its German warehouse: U1 needs a German registration for the exempt supply
    expect(brief(await evaluate(page, { parties: P('FR', 'AT', 'IT'), from: 'DE', transport: 0 }))).toMatchObject({
      supplies: ['DE:ic', 'IT:triangle@2'], abroad: ['U1:DE'], triangle: true,
    });
    // Only non-EU countries: nothing in the EU
    expect(brief(await evaluate(page, { parties: P('CH', 'US', 'CN'), transport: 0 }))).toEqual({
      kind: 'outside', moved: 0, supplies: ['CH:outside', 'CN:outside'], abroad: [], triangle: null, warnings: [],
    });
    expect((await evaluate(page, { parties: P('DE', 'AT'), transport: 0 })).error).toBe('parties');
    expect((await evaluate(page, { parties: P('DE', 'AT', 'IT'), transport: 3 })).error).toBe('transport');
  });

  test('what-if list covers every transporter and the intermediary choice', async ({ page }) => {
    const rows = await page.evaluate(() => window.Chain.alternatives({ parties: [{ country: 'DE' }, { country: 'AT' }, { country: 'IT' }], transport: 2 })
      .map(r => [r.transport, r.variant, r.moved, r.triangle, r.newRegistrations.map(x => `U${x.party + 1}:${x.country}`).join()]));
    expect(rows).toEqual([[0, 'plain', 0, true, ''], [1, 'plain', 0, true, ''], [1, 'asSupplier', 1, false, ''], [2, 'current', 1, false, 'U2:DE']]);
  });
});

test.describe('page', () => {
  test('default case explains the triangle; changing the transporter updates everything and is saved', async ({ page }) => {
    await expect(page.locator('#result')).toContainText('Bewegte Lieferung ist Lieferung 1 von U1 an U2.');
    await expect(page.locator('#result')).toContainText('Die Vereinfachung für Dreiecksgeschäfte greift');
    await expect(page.locator('#why')).toContainText('§ 3 Abs. 6a Satz 2 UStG');
    await expect(page.locator('#why .checks li.no')).toHaveCount(0);
    await expect(page.locator('#duties')).toContainText('Kennzahl 41');
    await page.locator('#transport button', { hasText: 'U3' }).click();
    await expect(page.locator('#result')).toContainText('U2 muss sich in Deutschland umsatzsteuerlich registrieren.');
    await expect(page.locator('#result .supply.moved')).toContainText('Lieferung 2: U2 → U3');
    await expect(page.locator('#why')).toContainText('Ein Dreiecksgeschäft braucht nach der bewegten Lieferung');
    await expect(page.locator('#duties')).toContainText('Kennzahl 81');
    await page.selectOption('#pv1', 'DE');
    await page.reload();
    await expect(page.locator('#transport button[aria-pressed="true"]')).toHaveText('U3');
    await expect(page.locator('#pv1')).toHaveValue('DE');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('chain-transaction.case.v1'))))
      .toEqual({ parties: [{ country: 'DE', vat: 'DE' }, { country: 'AT', vat: 'DE' }, { country: 'IT', vat: 'IT' }], from: '', to: '', transport: 2, importer: null, eug: false, b2c: false });
  });

  test('country change moves a default VAT ID along; import shows the declarant choice', async ({ page }) => {
    await page.selectOption('#pc0', 'CN');
    await expect(page.locator('#pv0')).toHaveValue('');
    await expect(page.locator('#importerBox')).toBeVisible();
    await expect(page.locator('#result')).toContainText('Einfuhr');
    await page.locator('#transport button', { hasText: 'U2' }).click();
    await expect(page.locator('#result .supply.moved')).toContainText('Lieferung 2: U2 → U3');
    await expect(page.locator('#why')).toContainText('§ 3 Abs. 8 UStG');
    await page.locator('#importer button', { hasText: 'U3' }).click();
    await expect(page.locator('#result .supply.moved')).toContainText('Lieferung 1: U1 → U2');
    await expect(page.locator('#result .notice.warn')).toContainText('nicht als Vorsteuer abziehen');
  });

  test('four companies: triangle at the start only with the T-646/24 option', async ({ page }) => {
    await openMenu(page);
    await page.click('[data-example="four"]');
    await expect(page.locator('#count [data-n="4"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#why .checks li.no')).toContainText('25b.1 Abs. 2 UStAE');
    await expect(page.locator('#result')).toContainText('U2 muss sich in Italien umsatzsteuerlich registrieren.');
    await page.check('#optEug');
    await expect(page.locator('#why .checks li.no')).toHaveCount(0);
    await expect(page.locator('#result')).toContainText('Niemand muss sich außerhalb seines Sitzlands registrieren.');
    await page.locator('#count [data-n="3"]').click();
    await expect(page.locator('#parties fieldset')).toHaveCount(3);
  });

  test('a what-if row takes over the variant; reset can be undone', async ({ page }) => {
    await page.locator('#transport button', { hasText: 'U3' }).click();
    await page.locator('.alt', { hasText: 'U2 transportiert als Lieferer' }).click();
    await expect(page.locator('#pv1')).toHaveValue('DE');
    await expect(page.locator('#transport button[aria-pressed="true"]')).toHaveText('U2');
    await expect(page.locator('.alt[aria-current="true"]')).toContainText('aktuelle Eingabe');
    await openMenu(page);
    await page.click('#btnReset');
    await expect(page.locator('#pv1')).toHaveValue('AT');
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.locator('#pv1')).toHaveValue('DE');
  });

  test('copy puts result, reasoning and duties on the clipboard', async ({ page }) => {
    await page.click('#btnCopy');
    const text = await clipboardText(page);
    expect(text).toContain('Bewegte Lieferung ist Lieferung 1 von U1 an U2.');
    expect(text).toContain('6. Greift die Vereinfachung für Dreiecksgeschäfte?');
    expect(text).toContain('Kennzahl 41');
  });

  test('English', async ({ page }) => {
    await switchLang(page, 'en');
    await expect(page.locator('#result')).toContainText('The moved supply is supply 1 from U1 to U2.');
    await expect(page.locator('#why')).toContainText('Does the triangulation simplification apply?');
    await expect(page.locator('#pc0 option:checked')).toHaveText('Germany');
    await expect(page.locator('#duties')).toContainText('box 41');
  });
});

test('print / PDF: report with the case table, inputs and buttons left out', async ({ page }) => {
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await page.locator('#transport button', { hasText: 'U2' }).click();
  await page.click('#btnPrint');
  expect(await page.evaluate(() => window.__printed)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#report')).toBeVisible();
  await expect(page.locator('#reportCase')).toContainText('U2 · Zwischenhändler');
  await expect(page.locator('#reportCase')).toContainText('Deutschland → Italien (innergemeinschaftlich)');
  await expect(page.locator('#reportCase')).toContainText('U2 transportiert');
  await expect(page.locator('#reportDate')).toContainText('Erstellt am');
  for (const sel of ['#h-parties', '#h-goods', '#btnCopy', '#btnPrint', 'header', 'details.help'])
    await expect(page.locator(sel).first()).toBeHidden();
  await expect(page.locator('#why')).toBeVisible();
  await expect(page.locator('#duties')).toBeVisible();
  // A real PDF comes out of it (Chromium print engine)
  const pdf = await page.pdf({ format: 'A4' });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#report')).toBeHidden();
});

test.describe('private last customer (B2C)', () => {
  test('distance sale, collection, resting supply to the consumer, no triangle', async ({ page }) => {
    // FR → IT, the German intermediary uses its French ID and ships: its own supply to the consumer is moved
    // → intra-Community distance sale, taxed in Italy, reportable via OSS (§ 3c Abs. 1, § 18j UStG)
    let r = await evaluate(page, { parties: P('FR', ['DE', 'FR'], 'IT'), transport: 1, b2c: true });
    expect(brief(r)).toEqual({ kind: 'intra', moved: 1, supplies: ['FR:taxable@0', 'IT:distance@1'], abroad: ['U2:IT'], triangle: null, warnings: [] });
    expect(r.registrations[1].find(x => x.country === 'IT')).toMatchObject({ reasons: ['distanceSale'], oss: true });
    expect(r.registrations[2]).toEqual([]);
    // The consumer collects: no exemption, no distance sale – taxed in France
    r = await evaluate(page, { parties: P('FR', 'DE', 'IT'), transport: 2, b2c: true });
    expect(brief(r)).toMatchObject({ moved: 1, supplies: ['FR:taxable@0', 'FR:taxable@1'], abroad: ['U2:FR'], warnings: [] });
    expect(r.supplies[1].privatePickup).toBe(true);
    // U1 ships to the intermediary: supply to the consumer rests in Italy → registration there, no OSS; no triangle
    r = await evaluate(page, { parties: P('FR', 'DE', 'IT'), transport: 0, b2c: true });
    expect(brief(r)).toMatchObject({ moved: 0, supplies: ['FR:ic', 'IT:taxable@1'], abroad: ['U2:IT'], triangle: false });
    expect(r.triangle.checks.filter(c => !c.ok).map(c => c.id)).toEqual(['lastBusiness']);
    // A VAT ID for the consumer is ignored
    expect((await evaluate(page, { parties: P('FR', 'DE', ['IT', 'IT']), transport: 0, b2c: true })).case.parties[2].vat).toBe('');
  });

  test('import cleared by the consumer: import VAT is its final cost, no warning', async ({ page }) => {
    const r = await evaluate(page, { parties: P('CN', 'DE', 'FR'), transport: 2, b2c: true });
    expect(brief(r)).toEqual({ kind: 'import', moved: 1, supplies: ['CN:outside', 'CN:outside'], abroad: [], triangle: null, warnings: [] });
    expect(r.import).toEqual({ importer: 2, country: 'FR', holder: 2, deductible: false, privateImporter: true });
  });

  test('page: checkbox switches to P3, explains the distance sale and the OSS', async ({ page }) => {
    await openMenu(page);
    await page.click('[data-example="distance"]');
    await expect(page.locator('#optB2c')).toBeChecked();
    await expect(page.locator('#pv2')).toBeDisabled();
    await expect(page.locator('#parties legend').nth(2)).toHaveText('P3 · Privatperson');
    await expect(page.locator('#result .supply.moved')).toContainText('Lieferung 2: U2 → P3');
    await expect(page.locator('#result .supply.moved')).toContainText('innergemeinschaftlicher Fernverkauf: 22 % Umsatzsteuer Italien');
    await expect(page.locator('#result')).toContainText('U2 versteuert in Italien, kann das aber über den One-Stop-Shop (OSS)');
    await expect(page.locator('#why')).toContainText('§ 3c Abs. 1 UStG');
    await expect(page.locator('#duties')).toContainText('Als Privatperson keine umsatzsteuerlichen Pflichten');
    await expect(page.locator('#duties')).toContainText('über den OSS im eigenen Land, keine Registrierung in Italien nötig');
    await expect(page.locator('.alt', { hasText: 'Fernverkauf (OSS)' })).toHaveCount(1);
    await page.uncheck('#optB2c');
    await expect(page.locator('#pv2')).toBeEnabled();
    await expect(page.locator('#pv2')).toHaveValue('IT');
    await expect(page.locator('#parties legend').nth(2)).toHaveText('U3 · letzter Abnehmer');
  });
});

test('ZM and Intrastat in the duties; notes on other countries', async ({ page }) => {
  // DE → IT, last customer collects: U2 (AT) sells exempt from DE, U3 declares the arrival in Italy
  await page.locator('#transport button', { hasText: 'U3' }).click();
  const u2 = page.locator('.duty').nth(1), u3 = page.locator('.duty').nth(2);
  await expect(u2).toContainText('Zusammenfassende Meldung in Deutschland: USt-IdNr. von U3 (IT)');
  await expect(u2).toContainText('bis zum 25. Tag nach Ablauf jedes Monats');
  await expect(u2).toContainText('Intrastat-Versendung in Deutschland: Bestimmungsland Italien');
  await expect(u2).toContainText('ab 1 Mio. € Versendungen');
  await expect(u3).toContainText('Intrastat-Eingang in Italien: Versendungsland Deutschland. Die Meldeschwellen legt jedes Land selbst fest.');
  // Both supplies take place in Germany: no notes on other countries
  await expect(page.locator('#why')).not.toContainText('8. Was in anderen Ländern');
  // Triangle: middle company needs no Intrastat in Italy, the last customer declares the arrival
  await page.locator('#transport button', { hasText: 'U1' }).click();
  await expect(page.locator('.duty').nth(1)).toContainText('Keine Intrastat-Meldung in Italien');
  await expect(page.locator('.duty').nth(2)).toContainText('Intrastat-Eingang in Italien durch U3');
  await expect(page.locator('#why')).toContainText('Die Auslegung in Italien sollte geprüft werden.');
  // DE-AT-IT without triangle (U3 uses a French ID): U2 sells in Italy → local reverse charge note
  await page.selectOption('#pv2', 'FR');
  await expect(page.locator('#why')).toContainText('Italien: Liefert ein dort nicht ansässiges Unternehmen an einen in Italien registrierten Unternehmer');
  // Purely German: no country notes
  await page.selectOption('#pc1', 'DE');
  await page.selectOption('#pc2', 'DE');
  await expect(page.locator('#why')).not.toContainText('8. Was in anderen Ländern');
});

test('the page shows the data state (rates, last comparison, form year)', async ({ page }) => {
  const D = await page.evaluate(() => window.Chain.DATA);
  const long = iso => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { dateStyle: 'long' });
  await expect(page.locator('#dataState')).toContainText(`Steuersätze vom ${long(D.ratesAsOf)}`);
  await expect(page.locator('#dataState')).toContainText(`zuletzt abgeglichen am ${long(D.ratesChecked)}`);
  await expect(page.locator('#dataState')).toContainText(`nach dem Vordruck ${D.formYear}`);
  // A new year without a checked form says so
  await page.clock.setFixedTime(new Date(D.formYear + 1, 1, 1, 12));
  await page.reload();
  await expect(page.locator('#dataState')).toContainText(`Für ${D.formYear + 1} noch nicht geprüft.`);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#dataState')).toBeVisible();
});
