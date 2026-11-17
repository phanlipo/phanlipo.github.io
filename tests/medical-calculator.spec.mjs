// Medizin-Rechner: results are checked against an independent re-implementation of the formulas
// fixed in medical-calculator/README.md.
import { test, expect, switchLang } from './helpers.mjs';

// ---- reference formulas (independent from the page code) ----
const bmi = (h, m) => m / (h / 100) ** 2;
const mosteller = (h, m) => Math.sqrt(h * m / 3600);
const duBois = (h, m) => 0.007184 * m ** 0.425 * h ** 0.725;
const egfr = (age, female, scr) => {
  const k = female ? 0.7 : 0.9, a = female ? -0.241 : -0.302;
  return 142 * Math.min(scr / k, 1) ** a * Math.max(scr / k, 1) ** -1.2 * 0.9938 ** age * (female ? 1.012 : 1);
};
const cockcroft = (age, female, scr, w) => (140 - age) * w / (72 * scr) * (female ? 0.85 : 1);
const de = (x, d) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

const set = (page, key, value) => page.fill(`[data-key="${key}"]`, String(value));
const main = (page, id) => page.locator(`#${id} .res.main .v`);
const result = (page, id, label) => page.locator(`#${id} .res`, { has: page.locator('.k', { hasText: label }) }).locator('.v');

test.beforeEach(async ({ page }) => {
  // fixed "today" for the pregnancy calculator: Tue 17 Nov 2026, 10:00 local time
  await page.clock.setFixedTime(new Date(2026, 10, 17, 10, 0));
  await page.goto('/medical-calculator/');
});

test.describe('1 · body measures', () => {
  test('BMI, WHO class and body surface area', async ({ page }) => {
    await set(page, 'b.h', 180);
    await set(page, 'b.m', '80,0');
    await expect(main(page, 'bRes')).toContainText(de(bmi(180, 80), 1)); // 24,7
    await expect(result(page, 'bRes', 'WHO')).toHaveText('Normalgewicht');
    await expect(result(page, 'bRes', 'Mosteller')).toContainText(de(mosteller(180, 80), 2)); // 2,00
    await expect(result(page, 'bRes', 'Du Bois')).toContainText(de(duBois(180, 80), 2));
    await expect(page.locator('#bRes .res')).toHaveCount(4);
  });

  test('the class follows the displayed, rounded value', async ({ page }) => {
    await set(page, 'b.h', 170);
    await set(page, 'b.m', '72.2'); // 24,98 → shown as 25,0
    expect(bmi(170, 72.2)).toBeLessThan(25);
    await expect(main(page, 'bRes')).toContainText('25,0');
    await expect(result(page, 'bRes', 'WHO')).toHaveText('Präadipositas');
    for (const [m, cls] of [[50, 'Untergewicht'], [90, 'Adipositas Grad I'], [110, 'Adipositas Grad II'], [130, 'Adipositas Grad III']]) {
      await set(page, 'b.m', m);
      await expect(result(page, 'bRes', 'WHO')).toHaveText(cls);
    }
  });

  test('waist-to-height ratio and hints', async ({ page }) => {
    await set(page, 'b.h', 160);
    await set(page, 'b.m', 70);
    await set(page, 'b.u', 88);
    await expect(result(page, 'bRes', 'Taille')).toContainText(de(88 / 160, 2)); // 0,55
    await expect(result(page, 'bRes', 'Taille')).toContainText('erhöht');
    await set(page, 'b.h', 130);
    await expect(page.locator('#bMsg .msg.warn')).toContainText('Perzentilen');
    await set(page, 'b.h', '');
    await expect(page.locator('#bMsg .msg.err')).toBeVisible();
    await expect(page.locator('#bRes .res')).toHaveCount(0);
  });
});

test.describe('2 · kidney function', () => {
  test('eGFR CKD-EPI 2021 and KDIGO stage, female and male', async ({ page }) => {
    await set(page, 'k.A', 50);
    await set(page, 'k.S', '0,8');
    await expect(page.locator('#kMsg .msg')).toContainText('Geschlecht'); // sex is required
    await page.click('[data-key="k.sex"] [data-v="f"]');
    const f = egfr(50, true, 0.8);
    await expect(main(page, 'kRes')).toContainText(de(f, 0));
    await expect(result(page, 'kRes', 'KDIGO')).toHaveText(f >= 89.5 ? 'G1 normal oder hoch' : 'G2 leicht vermindert');
    await page.click('[data-key="k.sex"] [data-v="m"]');
    await set(page, 'k.A', 75);
    await set(page, 'k.S', '1,9');
    const m = egfr(75, false, 1.9);
    expect(Math.round(m)).toBeGreaterThanOrEqual(30);
    expect(Math.round(m)).toBeLessThan(45);
    await expect(main(page, 'kRes')).toContainText(de(m, 0));
    await expect(result(page, 'kRes', 'KDIGO')).toHaveText('G3b mäßig bis stark vermindert');
    await expect(result(page, 'kRes', 'µmol/l')).toContainText(de(1.9 * 88.4, 0));
  });

  test('Cockcroft-Gault with weight; µmol/l input; switching the unit converts the value', async ({ page }) => {
    await set(page, 'k.A', 70);
    await page.click('[data-key="k.sex"] [data-v="f"]');
    await set(page, 'k.S', '1,2');
    await set(page, 'k.w', 60);
    await expect(result(page, 'kRes', 'Cockcroft')).toContainText(de(cockcroft(70, true, 1.2, 60), 0));
    await page.click('[data-key="k.unit"] [data-v="umol"]');
    await expect(page.locator('[data-key="k.S"]')).toHaveValue(de(1.2 * 88.4, 0)); // 106
    await expect(main(page, 'kRes')).toContainText(de(egfr(70, true, 106 / 88.4), 0));
    await set(page, 'k.S', 5);
    await expect(page.locator('#kMsg .msg.err')).toContainText('unplausibel');
    await set(page, 'k.A', 17);
    await set(page, 'k.S', 80);
    await expect(page.locator('#kMsg .msg.err')).toContainText('18–120');
  });
});

test.describe('3 · pregnancy', () => {
  test('due date, gestational age and trimester (28-day cycle)', async ({ page }) => {
    await set(page, 'p.L', '2026-08-01');
    // 1 Aug + 280 days = 8 May 2027; 1 Aug → 17 Nov = 108 days = 15+3
    await expect(main(page, 'pRes')).toContainText('8. Mai 2027');
    await expect(result(page, 'pRes', 'SSW')).toHaveText('15+3');
    await expect(result(page, 'pRes', 'Trimester')).toHaveText('2. Trimester');
    await expect(result(page, 'pRes', 'Bis zum Termin')).toHaveText('172 Tage');
    await expect(result(page, 'pRes', 'Empfängnis')).toContainText('15. August 2026');
  });

  test('longer cycle shifts the dates; future and implausible inputs', async ({ page }) => {
    await set(page, 'p.L', '2026-08-01');
    await set(page, 'p.z', 35);
    await expect(main(page, 'pRes')).toContainText('15. Mai 2027');
    await expect(result(page, 'pRes', 'SSW')).toHaveText('14+3');
    await set(page, 'p.z', 28);
    await set(page, 'p.L', '2026-11-18');
    await expect(page.locator('#pMsg .msg.err')).toContainText('Zukunft');
    await set(page, 'p.L', '2025-12-01');
    await expect(page.locator('#pMsg .msg.warn')).toContainText('44 Wochen');
    await set(page, 'p.z', 50);
    await expect(page.locator('#pMsg .msg.err')).toBeVisible();
  });
});

test.describe('4 · lab values', () => {
  test('glucose both ways, switching the direction converts the value', async ({ page }) => {
    await set(page, 'l.x', 100);
    await expect(main(page, 'lRes')).toContainText(de(100 / 18.016, 2)); // 5,55
    await page.click('[data-key="l.dir"] [data-v="si"]');
    await expect(page.locator('[data-key="l.x"]')).toHaveValue('5,55');
    await expect(page.locator('#lUnit')).toHaveText('mmol/l');
    await expect(main(page, 'lRes')).toContainText(de(5.55 * 18.016, 0)); // 100
  });

  test('HbA1c, cholesterol, triglycerides and creatinine', async ({ page }) => {
    await page.selectOption('[data-key="l.a"]', 'hba1c');
    await expect(page.locator('[data-key="l.dir"] [data-v="conv"]')).toHaveText('%');
    await set(page, 'l.x', '7,0');
    await expect(main(page, 'lRes')).toContainText(de((7 - 2.15) * 10.929, 0)); // 53
    await set(page, 'l.x', 40);
    await expect(page.locator('#lMsg .msg.err')).toBeVisible();
    await page.selectOption('[data-key="l.a"]', 'cholesterol');
    await set(page, 'l.x', 200);
    await expect(main(page, 'lRes')).toContainText(de(200 / 38.665, 2)); // 5,17
    await page.selectOption('[data-key="l.a"]', 'triglycerides');
    await expect(main(page, 'lRes')).toContainText(de(200 / 88.57, 2)); // 2,26
    await page.selectOption('[data-key="l.a"]', 'creatinine');
    await set(page, 'l.x', '1,1');
    await expect(main(page, 'lRes')).toContainText(de(1.1 * 88.4, 0)); // 97
    await expect(page.locator('#lUnit')).toHaveText('mg/dl');
  });
});

test('entered values are never stored, only the two settings', async ({ page }) => {
  await set(page, 'b.h', 180);
  await set(page, 'b.m', 80);
  await set(page, 'k.A', 50);
  await page.click('[data-key="k.sex"] [data-v="f"]');
  await page.click('[data-key="k.unit"] [data-v="umol"]');
  await set(page, 'p.L', '2026-08-01');
  await page.selectOption('[data-key="l.a"]', 'hba1c');
  await set(page, 'l.x', 7);
  const stored = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)])));
  expect(Object.keys(stored).filter(k => k.startsWith('medical-calculator.'))).toEqual(['medical-calculator.settings.v1']);
  expect(JSON.parse(stored['medical-calculator.settings.v1'])).toEqual({ creatinineUnit: 'umol', lab: 'hba1c' });
  await page.reload();
  for (const k of ['b.h', 'b.m', 'k.A', 'k.S', 'p.L', 'l.x']) await expect(page.locator(`[data-key="${k}"]`)).toHaveValue('');
  await expect(page.locator('[data-key="k.sex"] [aria-pressed="true"]')).toHaveCount(0);
  await expect(page.locator('[data-key="k.unit"] [data-v="umol"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-key="l.a"]')).toHaveValue('hba1c');
  // the diagnostics name filled fields, never values
  await set(page, 'b.m', 81.5);
  const diag = await page.evaluate(() => Tools.diag.text());
  expect(diag).toContain('b.m');
  expect(diag).not.toMatch(/81[,.]5/);
});

test('switching the language re-renders results and formulas', async ({ page }) => {
  await set(page, 'b.h', 180);
  await set(page, 'b.m', 80);
  await set(page, 'p.L', '2026-08-01');
  await switchLang(page, 'en');
  await expect(main(page, 'bRes')).toContainText('24.7');
  await expect(result(page, 'bRes', 'WHO')).toHaveText('Normal weight');
  await expect(result(page, 'pRes', 'Trimester')).toHaveText('2nd trimester');
  await expect(main(page, 'pRes')).toContainText(/8 May 2027|May 8, 2027/);
  await expect(page.locator('#bMath')).toContainText('BSA');
});
