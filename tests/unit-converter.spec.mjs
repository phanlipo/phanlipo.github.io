// Einheitenrechner: results against values computed here from the definitions (independent of units.js).
import { test, expect, switchLang, clipboardText, openMenu } from './helpers.mjs';

const de = (x, sig = 10) => Number(x.toPrecision(sig)).toLocaleString('de-DE', { maximumFractionDigits: 12 });
// Opens a quantity: its tab when it is in the bar (same group), otherwise via the overview
const open = async (page, id) => {
  if (await page.locator(`#tab-${id}`).isVisible()) await page.click(`#tab-${id}`);
  else {
    if (!(await page.locator('#overview').isVisible())) await page.click('#tabbar [data-overview]');
    await page.click(`#overview [data-open="${id}"]`);
  }
  await expect(page.locator(`#p-${id}`)).toBeVisible();
};
const p = (page, id) => page.locator(`#p-${id}`);
async function conv(page, id, value, from, to) {
  await open(page, id);
  await p(page, id).locator('[data-in="from"]').selectOption(from);
  await p(page, id).locator('[data-in="to"]').selectOption(to);
  await p(page, id).locator('[data-in="v"]').fill(String(value));
}
const main = (page, id) => p(page, id).locator('.calc-result.main .v');

test.use({ locale: 'de-DE' });
test.beforeEach(async ({ page }) => { await page.goto('/unit-converter/'); });

test('overview: groups of tiles, search by quantity, unit name or symbol', async ({ page }) => {
  await expect(page.locator('#groups h2')).toHaveText(['SI-Basisgrößen', 'Raum & Mechanik', 'Elektrizität & Magnetismus', 'Licht, Strahlung & Chemie', 'Alltag']);
  await expect(page.locator('#groups .tiles > button')).toHaveCount(36);
  await page.fill('#q', 'psi');
  await expect(page.locator('#groups .tiles > button:visible')).toHaveText(['Druck']);
  await page.fill('#q', 'Zoll');
  await expect(page.locator('#groups [data-open="length"]')).toBeVisible();
  await expect(page.locator('#groups [data-open="mass"]')).toBeHidden();
  await expect(page.locator('#groups h2:visible')).not.toContainText(['Alltag']);
  await page.fill('#q', 'xyz123');
  await expect(page.locator('#noHit')).toBeVisible();
  await page.fill('#q', '');
  await expect(page.locator('#groups .tiles > button:visible')).toHaveCount(36);
});

test('the tab bar shows the quantities of the open group; back returns to the overview', async ({ page }) => {
  await open(page, 'temperature');
  await expect(page.locator('#tabbar [role="tab"]:visible')).toHaveCount(8);   // 7 base quantities + SI prefixes
  await expect(page.locator('#tab-pressure')).toBeHidden();
  await page.click('#tab-mass');
  await expect(page.locator('#p-mass')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#overview')).toBeVisible();
  await open(page, 'pressure');
  await expect(page.locator('#tab-pressure')).toBeVisible();
  await expect(page.locator('#tab-temperature')).toBeHidden();
});

test('length: SI and other units, factor and the table of all units', async ({ page }) => {
  await conv(page, 'length', 1, 'mi', 'km');
  await expect(main(page, 'length')).toHaveText('1,609344 km');
  await expect(p(page, 'length').locator('.calc-result:not(.main) .v')).toHaveText('1 mi = 1,609344 km');
  const row = name => p(page, 'length').locator('[data-all] tr', { hasText: name }).locator('td.num');
  await expect(row('Fuß (foot)')).toHaveText('5.280');
  await expect(row('Zoll (inch)')).toHaveText('63.360');
  await expect(row('Seemeile')).toHaveText(de(1609.344 / 1852));
  // very small numbers as a power of ten: 1 nm in light-years
  await conv(page, 'length', 1, 'nm', 'ly');
  const ly = 1e-9 / (299792458 * 365.25 * 86400);
  await expect(main(page, 'length')).toHaveText(`${(ly / 1e-25).toPrecision(7).replace('.', ',')} × 10⁻²⁵ Lj`);
});

test('temperature with offsets; below absolute zero is an error', async ({ page }) => {
  await conv(page, 'temperature', 100, 'degC', 'degF');
  await expect(main(page, 'temperature')).toHaveText('212 °F');
  await conv(page, 'temperature', -40, 'degF', 'degC');
  await expect(main(page, 'temperature')).toHaveText('-40 °C');
  await conv(page, 'temperature', 0, 'K', 'degC');
  await expect(main(page, 'temperature')).toHaveText('-273,15 °C');
  await conv(page, 'temperature', 80, 'degRe', 'degC');
  await expect(main(page, 'temperature')).toHaveText('100 °C');
  // no factor for temperatures (not proportional)
  await expect(p(page, 'temperature').locator('.calc-result')).toHaveCount(1);
  await conv(page, 'temperature', -300, 'degC', 'K');
  await expect(p(page, 'temperature').locator('.notice.err')).toContainText('absoluten Nullpunkt');
});

test('mass, pressure, power, energy, data size', async ({ page }) => {
  await conv(page, 'mass', 1, 'lb', 'g');
  await expect(main(page, 'mass')).toHaveText('453,59237 g');
  await conv(page, 'pressure', 1, 'bar', 'psi');
  await expect(main(page, 'pressure')).toHaveText(de(1e5 / (0.45359237 * 9.80665 / 0.0254 ** 2)) + ' psi');
  await conv(page, 'pressure', 1, 'atm', 'mbar');
  await expect(main(page, 'pressure')).toHaveText('1.013,25 mbar');
  await conv(page, 'power', 100, 'PS', 'kW');
  await expect(main(page, 'power')).toHaveText('73,549875 kW');
  await conv(page, 'energy', 1, 'kWh', 'kcal');
  await expect(main(page, 'energy')).toHaveText(de(3.6e6 / 4184) + ' kcal');
  await conv(page, 'data', 1, 'GB', 'GiB');
  await expect(main(page, 'data')).toHaveText(de(1e9 / 2 ** 30) + ' GiB');
});

test('fuel consumption is inverse; 0 cannot be converted', async ({ page }) => {
  await conv(page, 'fuel', 7, 'l100km', 'mpgUS');
  // l/100 km × mpg = 100 · (litres per US gallon) / (km per mile)
  await expect(main(page, 'fuel')).toHaveText(de(100 * 3.785411784 / 1.609344 / 7) + ' mpg (US)');
  await conv(page, 'fuel', 5, 'l100km', 'kml');
  await expect(main(page, 'fuel')).toHaveText('20 km/l');
  await conv(page, 'fuel', 0, 'l100km', 'kml');
  await expect(p(page, 'fuel').locator('.notice.err')).toBeVisible();
});

test('SI prefixes for any unit', async ({ page }) => {
  await open(page, 'prefix');
  await p(page, 'prefix').locator('[data-in="from"]').selectOption('µ');
  await p(page, 'prefix').locator('[data-in="to"]').selectOption('n');
  await p(page, 'prefix').locator('[data-in="v"]').fill('2,5');
  await expect(main(page, 'prefix')).toHaveText('2.500 n…');
  await p(page, 'prefix').locator('[data-in="from"]').selectOption('Q');
  await p(page, 'prefix').locator('[data-in="to"]').selectOption('q');
  await p(page, 'prefix').locator('[data-in="v"]').fill('1');
  await expect(main(page, 'prefix')).toHaveText('1 × 10⁶⁰ q…');
  await expect(p(page, 'prefix').locator('[data-all] tbody tr')).toHaveCount(24);
});

test('number systems: whole numbers of any length between bases 2 to 36', async ({ page }) => {
  await page.fill('#q', 'hex');
  await expect(page.locator('#groups .tiles > button:visible')).toHaveText(['Zahlensysteme']);
  await page.fill('#q', '');
  await open(page, 'numeral');
  const n = p(page, 'numeral');
  // start value: 255 decimal = FF
  await expect(main(page, 'numeral')).toHaveText('FF');
  const row = name => n.locator('[data-all] tr', { has: page.locator('td:first-child', { hasText: new RegExp('^' + name) }) }).locator('td.num');
  await expect(row('Binär')).toHaveText('1111 1111');
  await expect(row('Oktal')).toHaveText('377');
  await conv(page, 'numeral', '0x1F_ff', '16', '2');
  await expect(main(page, 'numeral')).toHaveText('1 1111 1111 1111');  // 0x1FFF = 8191 = 2¹³ − 1
  await expect(row('Dezimal')).toHaveText('8.191');
  await expect(n.locator('.calc-result:not(.main) .v')).toHaveText('13 Bit');
  // beyond 2⁵³: 2⁶⁴ exactly, thousands separators of the language in the input
  await conv(page, 'numeral', '18.446.744.073.709.551.616', '10', '16');
  await expect(main(page, 'numeral')).toHaveText('1 0000 0000 0000 0000');
  // other bases: 35 = Z in base 36; 100 in base 3 = 9
  await conv(page, 'numeral', 'z', '36', '10');
  await expect(main(page, 'numeral')).toHaveText('35');
  await conv(page, 'numeral', '100', '3', '10');
  await expect(main(page, 'numeral')).toHaveText('9');
  // negative numbers keep their sign; copy has no gaps
  await conv(page, 'numeral', '-255', '10', '2');
  await expect(main(page, 'numeral')).toHaveText('-1111 1111');
  await n.locator('[data-copy]').click();
  await expect.poll(() => clipboardText(page)).toBe('-11111111');
  await n.locator('[data-sign]').click();
  await expect(main(page, 'numeral')).toHaveText('1111 1111');
  // invalid digit and fractions are errors
  await conv(page, 'numeral', '102', '10', '2');
  await n.locator('[data-in="from"]').selectOption('2');
  await expect(n.locator('.notice.err')).toContainText('„2“ ist keine Ziffer zur Basis 2');
  await expect(n.locator('.calc-result')).toHaveCount(0);
  await conv(page, 'numeral', '3,5', '10', '2');
  await expect(n.locator('.notice.err')).toContainText('Nur ganze Zahlen');
  // survives a reload
  await conv(page, 'numeral', 'ff', '16', '8');
  await page.reload();
  await expect(main(page, 'numeral')).toHaveText('377');
  await expect(n.locator('[data-in="v"]')).toHaveValue('ff');
});

test('swap, sign key and copy; values survive a reload; reset can be undone', async ({ page }) => {
  await conv(page, 'speed', 100, 'kmh', 'mph');
  await expect(main(page, 'speed')).toHaveText(de(100 / 3.6 / 0.44704) + ' mph');
  await p(page, 'speed').locator('[data-swap]').click();
  await expect(p(page, 'speed').locator('[data-in="from"]')).toHaveValue('mph');
  await expect(main(page, 'speed')).toHaveText('160,9344 km/h');
  await p(page, 'speed').locator('[data-sign]').click();
  await expect(p(page, 'speed').locator('[data-in="v"]')).toHaveValue('-100');
  await p(page, 'speed').locator('[data-copy]').click();
  await expect.poll(() => clipboardText(page)).toBe('-160,9344');
  await page.reload();
  await expect(p(page, 'speed')).toBeVisible();
  await expect(p(page, 'speed').locator('[data-in="v"]')).toHaveValue('-100');
  await expect(main(page, 'speed')).toHaveText('-160,9344 km/h');
  await openMenu(page);
  await page.click('#btnReset');
  await expect(p(page, 'speed').locator('[data-in="v"]')).toHaveValue('1');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(p(page, 'speed').locator('[data-in="v"]')).toHaveValue('-100');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('decimal point, names and thousands commas in English', async ({ page }) => {
    await conv(page, 'length', '1,000', 'ft', 'm');
    await expect(main(page, 'length')).toHaveText('304.8 m');
    await expect(p(page, 'length').locator('[data-in="from"] option:checked')).toHaveText('foot (ft)');
    await switchLang(page, 'de');
    await expect(p(page, 'length').locator('h2')).toHaveText('Länge');
    await expect(main(page, 'length')).toHaveText('304,8 m');
  });
  test('number systems in English: thousands commas in decimal input, names', async ({ page }) => {
    await conv(page, 'numeral', '65,535', '10', '16');
    await expect(main(page, 'numeral')).toHaveText('FFFF');
    await expect(p(page, 'numeral').locator('[data-in="from"] option:checked')).toHaveText('Decimal (base 10)');
    await switchLang(page, 'de');
    await expect(p(page, 'numeral').locator('[data-in="v"]')).toHaveValue('65535');
    await expect(main(page, 'numeral')).toHaveText('FFFF');
  });
});
