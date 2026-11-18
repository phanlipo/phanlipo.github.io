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
    expect(r.import).toEqual({ importer: 1, country: 'FR', holder: 1, deductible: true });
    expect(r.registrations[1]).toEqual([{ country: 'FR', reasons: ['sale', 'import'], home: false, has: false }]);
    // U2 transports, U3 declares: presumption stays (supply 1 moved, in CH); U3 cannot deduct the import VAT
    r = await evaluate(page, { parties: P('CH', 'DE', 'AT', 'FR'), transport: 1, importer: 2 });
    expect(brief(r)).toMatchObject({ moved: 0, supplies: ['CH:outside', 'FR:taxable@1', 'FR:taxable@2'], warnings: ['eustNoDeduct'] });
    expect(r.import).toEqual({ importer: 2, country: 'FR', holder: 1, deductible: false });
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
      .toEqual({ parties: [{ country: 'DE', vat: 'DE' }, { country: 'AT', vat: 'DE' }, { country: 'IT', vat: 'IT' }], from: '', to: '', transport: 2, importer: null, eug: false });
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
