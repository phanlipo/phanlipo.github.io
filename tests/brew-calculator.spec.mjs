// Brau-Rechner: results are checked against an independent re-implementation of the formulas.
import { test, expect, openDetails, switchLang } from './helpers.mjs';

// ---- reference formulas (independent from the page code) ----
const rhoW = T => (999.83952 + 16.945176 * T - 7.9870401e-3 * T ** 2 - 46.170461e-6 * T ** 3
  + 105.56302e-9 * T ** 4 - 280.54253e-12 * T ** 5) / (1 + 16.879850e-3 * T);
const co2 = (T, p) => 10 * p * Math.exp(-10.73797 + 2617.25 / (T + 273.15));
const sgFromP = P => 1 + P / (258.6 - (P / 258.2) * 227.1);
// ASBC polynomial (fitted to Plato's tables)
const pFromSg = G => -616.868 + 1111.14 * G - 630.272 * G ** 2 + 135.997 * G ** 3;
// hydrometer: a warmer sample is less dense by the ratio of the water densities
const corrected = (P, T, Tc) => pFromSg(sgFromP(P) * rhoW(Tc) / rhoW(T));
// Refractometer in fermented beer: Sean Terrill's cubic formula (2011), Brix values ÷ WCF
const terrill = (Bi, Bf) => 1 - 0.0044993 * Bi + 0.0117741 * Bf + 0.000275806 * Bi ** 2 - 0.00127169 * Bf ** 2
  - 0.00000727999 * Bi ** 3 + 0.0000632929 * Bf ** 3;
// Balling: real extract, alcohol by weight; by volume with the densities of water and ethanol at 20 °C
const balling = (P, Es, SG) => {
  const Ew = 0.1808 * P + 0.8192 * Es, abw = (P - Ew) / (2.0665 - 0.010665 * P);
  return { Ew, abw, abv: abw * SG * 0.998207 / 0.78924, ads: (P - Es) / P * 100, rdf: (P - Ew) / P * 100 };
};
const tinsethU = (SG, t) => 1.65 * 0.000125 ** (SG - 1) * (1 - Math.exp(-0.04 * t)) / 4.15;
const de = (x, d) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

// The calculators sit behind an overview (assets/shared/toolbox.js): open the one a field belongs to first
const PANEL = { v: 'topf', s: 'stammwuerze', z: 'zucker', c: 'umrechnen', a: 'alkohol', y: 'ausbeute', m: 'mischen', h: 'hopfen', w: 'wasser', d: 'druck' };
async function show(page, id) {
  if (await page.locator(`#${id}`).isVisible()) return;
  // the tab bar only shows the tabs of the open group – otherwise back to the overview
  if (await page.locator(`#tab-${id}`).isVisible()) await page.click(`#tab-${id}`);
  else {
    if (!(await page.locator('#overview').isVisible())) await page.click('#tabbar [data-overview]');
    await page.click(`#overview [data-open="${id}"]`);
  }
  await expect(page.locator(`#${id}`)).toBeVisible();
}
const set = async (page, key, value) => { await show(page, PANEL[key[0]]); await page.fill(`[data-key="${key}"]`, String(value)); };
const main = (page, id) => page.locator(`#${id} .calc-result.main .v`);
const result = (page, id, label) => page.locator(`#${id} .calc-result`, { has: page.locator('.k', { hasText: label }) }).locator('.v');

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
    await show(page, 'topf');
    await page.click('[data-key="v.mode"] [data-v="gap"]');
    await set(page, 'v.d', 36);
    await set(page, 'v.H', 34);
    await set(page, 'v.a', 9);
    await expect(main(page, 'vRes')).toContainText('25,45');
  });

  test('fill height for a target volume', async ({ page }) => {
    await show(page, 'topf');
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
    await expect(page.locator('#vMsg .notice.err')).toBeVisible();
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
    await show(page, 'stammwuerze');
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
    await show(page, 'zucker');
    await page.locator('#zChips .chip', { hasText: 'Weizen' }).click();
    await expect(page.locator('[data-key="z.C"]')).toHaveValue('7,0');
  });

  test('no sugar needed when CO₂ is already high enough', async ({ page }) => {
    await set(page, 'z.T', 2);   // cold beer still holds ≈ 2,97 g/L
    await set(page, 'z.C', 2.5);
    await expect(page.locator('#zMsg .notice.ok')).toContainText('kein Zucker nötig');
  });
});

test('formulas render with KaTeX when opened', async ({ page }) => {
  await show(page, 'zucker');
  await openDetails(page.locator('#zucker'), 'Formeln');
  await expect(page.locator('#zMath .katex').first()).toBeVisible();
  await expect(page.locator('.katex-error')).toHaveCount(0);
  await expect(page.locator('.f.fallback')).toHaveCount(0);
});

test('formulas explain the calculation with symbols only, values stay in the results', async ({ page }) => {
  await set(page, 'z.T', 13);
  await set(page, 'z.V', 23);
  await set(page, 's.T', 27);
  const z = page.locator('#zMath'), s = page.locator('#sMath');
  await show(page, 'zucker');
  await openDetails(page.locator('#zucker'), 'Formeln');
  await expect(z.locator('.katex').first()).toBeVisible();
  await show(page, 'stammwuerze');
  await openDetails(page.locator('#stammwuerze'), 'Formeln');
  await expect(s.locator('.katex').first()).toBeVisible();
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
  await show(page, 'stammwuerze');
  await page.click('[data-key="s.unit"] [data-v="SG"]');
  await page.reload();
  await expect(page.locator('#stammwuerze')).toBeVisible();  // the open calculator is remembered
  await expect(page.locator('[data-key="v.d"]')).toHaveValue('42');
  await expect(page.locator('[data-key="s.unit"] [data-v="SG"]')).toHaveAttribute('aria-pressed', 'true');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('labels, results with decimal point and formulas in English', async ({ page }) => {
    await expect(page.locator('#topf h2')).toHaveText('Volume in a cylindrical pot');
    await set(page, 'v.d', '36');
    await set(page, 'v.h', '25');
    await expect(main(page, 'vRes')).toContainText((Math.PI * 18 ** 2 * 25 / 1000).toFixed(2)); // 25.45
    await expect(result(page, 'vRes', 'Litres per cm')).toBeVisible();
    await set(page, 'z.V', 20);
    await set(page, 'z.T', 20);
    await set(page, 'z.C', 5);
    await expect(result(page, 'zRes', 'Residual CO')).toContainText(co2(20, 1.013).toFixed(2));
    await expect(page.locator('#zChips .chip').first()).toContainText('Stout / Porter · 4.0 g/L');
    await show(page, 'stammwuerze');
    await openDetails(page.locator('#stammwuerze'), 'Formulas');
    await expect(page.locator('#sMath .legend', { hasText: 'ASBC' })).toContainText('−616.868');
    await switchLang(page, 'de');
    await expect(main(page, 'vRes')).toContainText('25,45');
  });
});

test('overview: tiles open a calculator, tabs switch, the back key returns', async ({ page }) => {
  await expect(page.locator('#overview .tiles > button')).toHaveCount(10);
  await expect(page.locator('#overview h2')).toHaveText(['Brautag', 'Messen', 'Abfüllen']);
  await expect(page.locator('#tabbar')).toBeHidden();
  await page.click('#overview [data-open="stammwuerze"]');
  await expect(page.locator('#stammwuerze')).toBeVisible();
  await expect(page.locator('#topf')).toBeHidden();
  await expect(page.locator('#tab-stammwuerze')).toHaveAttribute('aria-selected', 'true');
  // only the tabs of the group "Messen" are in the bar
  await expect(page.locator('#tabbar [role=tab]:visible')).toHaveCount(3);
  await expect(page.locator('#tab-zucker')).toBeHidden();
  await page.click('#tab-alkohol');
  await expect(page.locator('#alkohol')).toBeVisible();
  await expect(page.locator('#tabbar [aria-selected="true"]')).toHaveCount(1);
  await expect(page.locator('#tabbar')).toBeInViewport();
  await page.goBack();
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#alkohol')).toBeHidden();
});

// Values marked "other calculator" come from an independent online brewing calculator with the same inputs;
// small differences come from other constants (noted at each test).
test.describe('4 · Plato, Brix and SG', () => {
  test('°Plato to SG and Brix', async ({ page }) => {
    await set(page, 'c.x', 12);
    await expect(main(page, 'cRes')).toContainText(de(12 * 1.04, 2)); // Brix
    await expect(result(page, 'cRes', 'Spezifisches')).toContainText(de(sgFromP(12), 4)); // 1,0484
  });

  test('Brix with own correction factor, unit switch converts the value', async ({ page }) => {
    await show(page, 'umrechnen');
    await set(page, 'c.wcf', '1,02');
    await page.click('[data-key="c.unit"] [data-v="B"]');
    await expect(page.locator('[data-key="c.x"]')).toHaveValue(de(12 * 1.02, 2));
    await set(page, 'c.x', '13,26');
    await expect(main(page, 'cRes')).toContainText(de(13.26 / 1.02, 2)); // 13,00 °P
    await expect(page.locator('#cUnit')).toHaveText('°Brix');
  });
});

test.describe('5 · alcohol', () => {
  test('hydrometer: 12 °P → 2,5 °P', async ({ page }) => {
    await set(page, 'a.og', 12);
    await set(page, 'a.fg', '2,5');
    const r = balling(12, 2.5, sgFromP(2.5));
    await expect(main(page, 'aRes')).toContainText(de(r.abv, 2)); // ≈ 5,13 (other calculator 4,99 with ABV = ABW / 0,795)
    await expect(result(page, 'aRes', 'Scheinbarer Vergärungsgrad')).toContainText('79,2'); // other calculator 79,17
    await expect(result(page, 'aRes', 'Wirklicher Vergärungsgrad')).toContainText(de(r.rdf, 1));
    await expect(result(page, 'aRes', 'Wirklicher Restextrakt')).toContainText(de(r.Ew, 2)); // other calculator 4,31 (factor 0,81)
    expect(r.abv).toBeGreaterThan(4.9);
    expect(r.abv).toBeLessThan(5.3);
  });

  test('refractometer: Brix before and after fermentation (Terrill)', async ({ page }) => {
    await show(page, 'alkohol');
    await page.click('[data-key="a.ou"] [data-v="B"]');
    await page.click('[data-key="a.fu"] [data-v="B"]');
    await expect(page.locator('[data-key="a.wcf"]')).toBeVisible();
    await set(page, 'a.og', '12,5');
    await set(page, 'a.fg', '6,2');
    const P = 12.5 / 1.04, SG = terrill(P, 6.2 / 1.04), Es = pFromSg(SG), r = balling(P, Es, SG);
    await expect(main(page, 'aRes')).toContainText(de(r.abv, 2));
    await expect(result(page, 'aRes', 'Scheinbarer Restextrakt')).toContainText(de(SG, 4));
    await expect(page.locator('#aMsg')).toContainText('Terrill');
  });

  test('final gravity above the original gravity is an error', async ({ page }) => {
    await set(page, 'a.og', 10);
    await set(page, 'a.fg', 11);
    await expect(page.locator('#aMsg .notice.err')).toBeVisible();
  });
});

test.describe('6 · brewhouse efficiency', () => {
  test('efficiency from grain, hot wort at 100 °C', async ({ page }) => {
    await set(page, 'y.P', 12);
    await set(page, 'y.V', 20);
    await set(page, 'y.T', 100);
    await set(page, 'y.m', 4);
    const mE = 20 * rhoW(100) / rhoW(20) * sgFromP(12) * rhoW(20) / 1000 * 0.12;
    await expect(main(page, 'yRes')).toContainText(de(mE / 4 * 100, 1)); // 60,3 (other calculator 60,27 with factor 0,96)
  });

  test('grain needed for an efficiency, volume measured at 20 °C', async ({ page }) => {
    await show(page, 'ausbeute');
    await page.click('[data-key="y.mode"] [data-v="grain"]');
    await set(page, 'y.T', 20);
    await set(page, 'y.sha', 70);
    await expect(main(page, 'yRes')).toContainText(de(20 * sgFromP(12) * rhoW(20) / 1000 * 0.12 / 0.7, 2));
  });
});

test.describe('7 · mixing cross', () => {
  test('dilute 15 °P to 12 °P with water (extract balance)', async ({ page }) => {
    await set(page, 'm.V', 20);
    await set(page, 'm.x1', 15);
    await set(page, 'm.x2', 0);
    await set(page, 'm.xz', 12);
    await expect(main(page, 'mRes')).toContainText(de(20 * sgFromP(15) * 3 / 12, 2)); // 5,31 L
  });

  test('temperature', async ({ page }) => {
    await show(page, 'mischen');
    await page.click('[data-key="m.mode"] [data-v="T"]');
    await expect(page.locator('#mU1')).toHaveText('°C');
    await set(page, 'm.V', 20);
    await set(page, 'm.x1', 15);
    await set(page, 'm.x2', 0);
    await set(page, 'm.xz', 12);
    await expect(main(page, 'mRes')).toContainText('5,00'); // other calculator 5 L
    await set(page, 'm.xz', 20);
    await expect(page.locator('#mMsg .notice.err')).toBeVisible();
  });
});

test.describe('8 · hops', () => {
  test('amount for a target IBU with own utilisation', async ({ page }) => {
    await show(page, 'hopfen');
    await page.click('[data-key="h.umode"] [data-v="manual"]');
    await expect(page.locator('[data-key="h.t"]')).toBeHidden();
    await set(page, 'h.alpha', 10);
    await set(page, 'h.ibu', 45);
    await set(page, 'h.U', 30);
    await set(page, 'h.V', 20);
    await expect(main(page, 'hRes')).toContainText('30,0'); // other calculator 30 g
    await expect(result(page, 'hRes', 'je Liter')).toContainText('1,50');
  });

  test('IBU of an amount after Tinseth', async ({ page }) => {
    await show(page, 'hopfen');
    await page.click('[data-key="h.mode"] [data-v="ibu"]');
    await set(page, 'h.alpha', 12);
    await set(page, 'h.m', 25);
    await set(page, 'h.V', 20);
    await set(page, 'h.t', 60);
    await set(page, 'h.P', 12);
    const U = tinsethU(sgFromP(12), 60);
    await expect(main(page, 'hRes')).toContainText(de(U * 0.12 * 25 * 1000 / 20, 1));
    await expect(result(page, 'hRes', 'Ausnutzung')).toContainText(de(U * 100, 1)); // ≈ 22 %
  });

  test('substitute hops', async ({ page }) => {
    await show(page, 'hopfen');
    await page.click('[data-key="h.mode"] [data-v="swap"]');
    await set(page, 'h.a1', 10);
    await set(page, 'h.m1', 30);
    await set(page, 'h.a2', 8);
    await expect(main(page, 'hRes')).toContainText('37,5');
  });
});

test.describe('9 · brewing water', () => {
  test('hardness, residual alkalinity and lactic acid', async ({ page }) => {
    await set(page, 'w.ca', 68);
    await set(page, 'w.mg', '31,3');
    await set(page, 'w.k', '6,17');
    await set(page, 'w.ra', 0);
    await set(page, 'w.V', 20);
    const caH = 68 / 40.078 / 0.17832, mgH = 31.3 / 24.305 / 0.17832, kh = 6.17 / (2 * 0.17832);
    const ra = kh - (caH + mgH / 2) / 3.5, la = ra * 2 * 0.17832 * 20 / (1.2 * 0.8 / 90.08 * 1000);
    await expect(main(page, 'wRes')).toContainText(de(ra, 2)); // 13,55 (other calculator 13,57)
    await expect(result(page, 'wRes', 'Milchsäure')).toContainText(de(la, 1)); // 9,1 mL (other calculator 9,05)
    await expect(result(page, 'wRes', 'Magnesiumhärte')).toContainText('7,22'); // other calculator 7,22
    expect(Math.abs(la - 9.05)).toBeLessThan(0.1);
  });

  test('carbonate hardness instead of acid capacity; low alkalinity needs no acid', async ({ page }) => {
    await show(page, 'wasser');
    await page.click('[data-key="w.ku"] [data-v="kh"]');
    await expect(page.locator('#wKU')).toHaveText('°dH');
    await set(page, 'w.ca', 100);
    await set(page, 'w.mg', 10);
    await set(page, 'w.k', 3);
    await expect(page.locator('#wMsg .notice.ok')).toBeVisible();
  });
});

test.describe('10 · CO₂ pressure', () => {
  test('pressure for a CO₂ content and back', async ({ page }) => {
    await set(page, 'd.C', 5);
    await set(page, 'd.T', 7);
    const p = 5 / co2(7, 1) - 1.013;
    await expect(main(page, 'dRes')).toContainText(de(p, 2)); // 1,01 bar (other calculator 1,01)
    await page.click('[data-key="d.mode"] [data-v="c"]');
    await set(page, 'd.p', 1);
    await expect(main(page, 'dRes')).toContainText(de(co2(7, 2.013), 2));
  });
});

test('priming with wort (Speise) includes the added volume', async ({ page }) => {
  await set(page, 'z.V', 20);
  await set(page, 'z.T', '19,5');
  await set(page, 'z.C', 5);
  await set(page, 'z.bottle', '0,5');
  await page.selectOption('[data-key="z.sugar"]', 'speise');
  await set(page, 'z.Ps', 12);
  await set(page, 'z.Es', '2,5');
  const kS = 10 * sgFromP(12) * (12 - (0.1808 * 12 + 0.8192 * 2.5)) * 0.9565 / 2.0665, rest = co2(19.5, 1.013);
  const x = (5 - rest) / (kS - 5);
  await expect(main(page, 'zRes')).toContainText(de(x * 20, 2));
  await expect(result(page, 'zRes', 'je Liter')).toContainText(de(x * 1000, 0)); // ≈ 101 mL (other calculator 89 mL without the added volume)
  expect(Math.abs((5 - rest) / kS * 1000 - 89.2)).toBeLessThan(3);
  await expect(result(page, 'zRes', 'je Flasche')).toContainText(de(500 * x / (1 + x), 0));
  await page.selectOption('[data-key="z.sugar"]', 'sucrose');
  await expect(page.locator('[data-key="z.Ps"]')).toBeHidden();
});

test('formulas of every calculator render without KaTeX errors', async ({ page }) => {
  for (const id of Object.values(PANEL)) {
    await show(page, id);
    await openDetails(page.locator(`#${id}`), 'Formeln');
    await expect(page.locator(`#${id} .mathgrid .katex`).first()).toBeVisible();
  }
  await expect(page.locator('.katex-error')).toHaveCount(0);
  await expect(page.locator('.f.fallback')).toHaveCount(0);
});
