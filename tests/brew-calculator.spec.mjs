// Brau-Rechner: results are checked against an independent re-implementation of the formulas.
import { test, expect, openDetails } from './helpers.mjs';

// ---- reference formulas (independent from the page code) ----
const rhoW = T => (999.83952 + 16.945176 * T - 7.9870401e-3 * T ** 2 - 46.170461e-6 * T ** 3
  + 105.56302e-9 * T ** 4 - 280.54253e-12 * T ** 5) / (1 + 16.879850e-3 * T);
const co2 = (T, p) => 10 * p * Math.exp(-10.73797 + 2617.25 / (T + 273.15));
const sgFromP = P => 1 + P / (258.6 - (P / 258.2) * 227.1);
// ASBC polynomial (fitted to Plato's tables)
const pFromSg = G => -616.868 + 1111.14 * G - 630.272 * G ** 2 + 135.997 * G ** 3;
// hydrometer: a warmer sample is less dense by the ratio of the water densities
const corrected = (P, T, Tc) => pFromSg(sgFromP(P) * rhoW(Tc) / rhoW(T));
const de = (x, d) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

const set = (page, key, value) => page.fill(`[data-key="${key}"]`, String(value));
const main = (page, id) => page.locator(`#${id} .res.main .v`);
const result = (page, id, label) => page.locator(`#${id} .res`, { has: page.locator('.k', { hasText: label }) }).locator('.v');

test.beforeEach(async ({ page }) => {
  await page.goto('/brew-calculator/');
});

test.describe('1 · pot volume', () => {
  test('volume from fill height (comma and point accepted)', async ({ page }) => {
    await set(page, 'v.d', '36,0');
    await set(page, 'v.h', '25');
    await expect(main(page, 'vRes')).toContainText(de(Math.PI * 18 ** 2 * 25 / 1000, 2)); // 25,45
    await set(page, 'v.d', '36.0');
    await expect(main(page, 'vRes')).toContainText('25,45');
  });

  test('volume from gap to the rim', async ({ page }) => {
    await page.click('[data-key="v.mode"] [data-v="gap"]');
    await set(page, 'v.d', 36);
    await set(page, 'v.H', 34);
    await set(page, 'v.a', 9);
    await expect(main(page, 'vRes')).toContainText('25,45');
  });

  test('fill height for a target volume', async ({ page }) => {
    await page.click('[data-key="v.mode"] [data-v="target"]');
    await set(page, 'v.d', 36);
    await set(page, 'v.V', 25);
    await expect(main(page, 'vRes')).toContainText(de(25000 / (Math.PI * 18 ** 2), 1)); // 24,6
  });

  test('hot wort is converted to 20 °C', async ({ page }) => {
    await set(page, 'v.d', 36);
    await set(page, 'v.h', 25);
    await set(page, 'v.T', 98);
    const V = Math.PI * 18 ** 2 * 25 / 1000, V20 = V * rhoW(98) / rhoW(20);
    await expect(result(page, 'vRes', 'Volumen bei 20')).toContainText(de(V20, 2));
    await expect(result(page, 'vRes', 'Ausdehnung')).toContainText(de((V / V20 - 1) * 100, 1)); // ~4,0 %
  });

  test('missing diameter shows an error', async ({ page }) => {
    await set(page, 'v.d', '');
    await expect(page.locator('#vMsg .msg.err')).toBeVisible();
  });
});

test.describe('2 · gravity correction', () => {
  for (const [P, T] of [[12, 10], [16, 45], [8, 60]]) {
    test(`${P} °P measured at ${T} °C matches the reference formula`, async ({ page }) => {
      await set(page, 's.x', P);
      await set(page, 's.T', T);
      await set(page, 's.Tc', 20);
      await expect(main(page, 'sRes')).toContainText(de(corrected(P, T, 20), 2));
    });
  }

  test('12 °P measured at 30 °C', async ({ page }) => {
    await set(page, 's.x', 12);
    await set(page, 's.T', 30);
    await set(page, 's.Tc', 20);
    await expect(main(page, 'sRes')).toContainText('12,64');
    await expect(result(page, 'sRes', 'Korrektur')).toContainText('+0,64');
  });

  test('same temperature means no correction', async ({ page }) => {
    await set(page, 's.x', 15);
    await set(page, 's.T', 20);
    await set(page, 's.Tc', 20);
    await expect(main(page, 'sRes')).toContainText('15,00');
  });

  test('input as specific gravity', async ({ page }) => {
    await page.click('[data-key="s.unit"] [data-v="SG"]');
    await set(page, 's.x', '1,0484');
    await set(page, 's.T', 30);
    await expect(main(page, 'sRes')).toContainText(de(pFromSg(1.0484 * rhoW(20) / rhoW(30)), 2)); // 12,64
  });
});

test.describe('3 · priming sugar', () => {
  async function fill(page, sugar) {
    await set(page, 'z.V', 20);
    await set(page, 'z.T', 20);
    await set(page, 'z.C', 5);
    await set(page, 'z.bottle', '0,5');
    await page.selectOption('[data-key="z.sugar"]', sugar);
  }
  const grams = k => (5 - co2(20, 1.013)) * 20 / k;

  test('household sugar', async ({ page }) => {
    await fill(page, 'sucrose');
    const m = grams(4 * 44.0095 / 342.2965); // ≈ 130 g
    await expect(main(page, 'zRes')).toContainText(de(m, 0));
    await expect(result(page, 'zRes', 'je Flasche')).toContainText(de(m / 20 * 0.5, 2));
    await expect(result(page, 'zRes', 'Rest-CO')).toContainText(de(co2(20, 1.013), 2));
  });

  test('dextrose monohydrate needs more', async ({ page }) => {
    await fill(page, 'dextrose');
    await expect(main(page, 'zRes')).toContainText(de(grams(2 * 44.0095 / 198.171), 0));
  });

  test('style chip sets the target CO₂', async ({ page }) => {
    await page.locator('#zChips .chip', { hasText: 'Weizen' }).click();
    await expect(page.locator('[data-key="z.C"]')).toHaveValue('7,0');
  });

  test('no sugar needed when CO₂ is already high enough', async ({ page }) => {
    await set(page, 'z.T', 2);   // cold beer still holds ≈ 2,97 g/L
    await set(page, 'z.C', 2.5);
    await expect(page.locator('#zMsg .msg.ok')).toContainText('kein Zucker nötig');
  });
});

test('formulas render with KaTeX when opened', async ({ page }) => {
  await openDetails(page.locator('#zucker'), 'Formeln');
  await expect(page.locator('#zMath .katex').first()).toBeVisible();
  await expect(page.locator('.katex-error')).toHaveCount(0);
  await expect(page.locator('.f.fallback')).toHaveCount(0);
});

test('formulas explain the calculation with symbols only, values stay in the results', async ({ page }) => {
  await set(page, 'z.T', 13);
  await set(page, 'z.V', 23);
  await set(page, 's.T', 27);
  await openDetails(page.locator('#zucker'), 'Formeln');
  await openDetails(page.locator('#stammwuerze'), 'Formeln');
  const z = page.locator('#zMath'), s = page.locator('#sMath');
  await expect(z.locator('.katex').first()).toBeVisible();
  await expect(result(page, 'zRes', 'Rest-CO')).toContainText(de(co2(13, 1.013), 2));
  // no entered values or intermediate results inside the formulas
  for (const v of ['13,0', '23,0', de(co2(13, 1.013), 2)]) await expect(z).not.toContainText(v);
  await expect(s).not.toContainText('27,0');
  await expect(s).not.toContainText(de(rhoW(27), 2));
  // formulas use symbols; numeric constants are named and listed in the legend
  const formulas = await page.locator('#sMath .f, #zMath .f').allTextContents();
  for (const magic of ['10,73797', '1,00130346', '616,868', '999,83952', '258,6']) {
    expect(formulas.join(' ')).not.toContain(magic);
  }
  await expect(s.locator('.legend', { hasText: 'ASBC' })).toContainText('−616,868');
});

test('inputs survive a reload', async ({ page }) => {
  await set(page, 'v.d', 42);
  await page.click('[data-key="s.unit"] [data-v="SG"]');
  await page.reload();
  await expect(page.locator('[data-key="v.d"]')).toHaveValue('42');
  await expect(page.locator('[data-key="s.unit"] [data-v="SG"]')).toHaveAttribute('aria-pressed', 'true');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('labels, results with decimal point and formulas in English', async ({ page }) => {
    await expect(page.locator('#topf h2')).toHaveText('1 · Volume in a cylindrical pot');
    await set(page, 'v.d', '36');
    await set(page, 'v.h', '25');
    await expect(main(page, 'vRes')).toContainText((Math.PI * 18 ** 2 * 25 / 1000).toFixed(2)); // 25.45
    await expect(result(page, 'vRes', 'Litres per cm')).toBeVisible();
    await set(page, 'z.V', 20);
    await set(page, 'z.T', 20);
    await set(page, 'z.C', 5);
    await expect(result(page, 'zRes', 'Residual CO')).toContainText(co2(20, 1.013).toFixed(2));
    await expect(page.locator('#zChips .chip').first()).toContainText('Stout / Porter · 4.0 g/L');
    await openDetails(page.locator('#stammwuerze'), 'Formulas');
    await expect(page.locator('#sMath .legend', { hasText: 'ASBC' })).toContainText('−616.868');
    await page.getByRole('button', { name: 'Deutsch' }).click();
    await expect(main(page, 'vRes')).toContainText('25,45');
  });
});
