// Finanzrechner: results are checked against closed formulas computed here, independent of finance.js.
import { test, expect, switchLang, openMenu, clipboardText } from './helpers.mjs';

const de = (x, d = 2) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const en = (x, d = 2) => x.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const set = (page, key, value) => page.fill(`[data-key="${key}"]`, String(value));
const stat = (page, host, label) => page.locator(`#${host} .calc-result`).filter({ has: page.locator('.k').getByText(label, { exact: true }) }).locator('.v');
// Opens a calculator: from the overview by its tile, otherwise by its tab
const view = async (page, v) => {
  if (await page.locator('#overview').isVisible()) await page.click(`#overview [data-open="${v}"]`);
  else await page.click(`#tab-${v}`);
  await expect(page.locator(`#${v}`)).toBeVisible();
};
const seg = (page, key, v) => page.click(`[data-key="${key}"] [data-v="${v}"]`);

// Annuity factors: value after n periods of 1 per period, at the end (or start) of each period
const fvAnnuity = (q, n, begin) => (Math.pow(1 + q, n) - 1) / q * (begin ? 1 + q : 1);

test.use({ locale: 'de-DE' });
test.beforeEach(async ({ page }) => { await page.goto('/finance-calculator/'); });

test.describe('savings plan', () => {
  test.beforeEach(async ({ page }) => { await view(page, 'save'); });

  test('final capital, paid in, returns and purchasing power', async ({ page }) => {
    await set(page, 's.start', '10.000');      // German thousands separator
    await set(page, 's.rate', '250');
    await set(page, 's.ret', '6,5');
    await set(page, 's.years', '25');
    await set(page, 's.cost', '0.5');          // decimal point works as well
    await set(page, 's.infl', '2');
    const q = Math.pow(1.06, 1 / 12) - 1, n = 300;
    const cap = 10000 * Math.pow(1 + q, n) + 250 * fvAnnuity(q, n, true);
    await expect(stat(page, 'sRes', 'Endkapital')).toHaveText(de(cap));
    await expect(stat(page, 'sRes', 'Eingezahlt')).toHaveText(de(10000 + 250 * 300));
    await expect(stat(page, 'sRes', 'Erträge')).toHaveText(de(cap - 85000));
    await expect(stat(page, 'sRes', 'Kaufkraft heute')).toHaveText(de(cap / Math.pow(1.02, 25)));
    await expect(page.locator('#sChart svg rect')).toHaveCount(50);  // two stacked bars per year
    // Contributions at the end of the month earn one month less
    await seg(page, 's.timing', 'end');
    await expect(stat(page, 'sRes', 'Endkapital')).toHaveText(de(10000 * Math.pow(1 + q, n) + 250 * fvAnnuity(q, n, false)));
  });

  test('yearly increase raises the contribution every 12 months', async ({ page }) => {
    await set(page, 's.start', '0');
    await set(page, 's.rate', '100');
    await set(page, 's.ret', '0');
    await set(page, 's.cost', '0');
    await set(page, 's.infl', '0');
    await set(page, 's.years', '3');
    await set(page, 's.dyn', '10');
    // Without interest: 12 × (100 + 110 + 121)
    await expect(stat(page, 'sRes', 'Endkapital')).toHaveText(de(12 * 331));
    await expect(page.locator('#sMsg')).toContainText('121,00');
  });

  test('contribution needed for a target and time until a target', async ({ page }) => {
    await set(page, 's.start', '0');
    await set(page, 's.ret', '5');
    await set(page, 's.cost', '0');
    await set(page, 's.infl', '0');
    await seg(page, 's.timing', 'end');
    await seg(page, 's.mode', 'rate');
    await set(page, 's.target', '100000');
    await set(page, 's.years', '10');
    const q = Math.pow(1.05, 1 / 12) - 1;
    await expect(stat(page, 'sRes', 'Nötige Sparrate pro Monat')).toHaveText(de(100000 / fvAnnuity(q, 120, false)));
    await expect(stat(page, 'sRes', 'Endkapital')).toHaveText(de(100000));
    await seg(page, 's.mode', 'years');
    await set(page, 's.rate', '500');
    // first month in which 500 per month reach 100 000
    const months = Math.ceil(Math.log(1 + 100000 * q / 500) / Math.log(1 + q));
    await expect(stat(page, 'sRes', 'Dauer')).toHaveText(`${Math.floor(months / 12)} Jahre ${months % 12} Monate`);
    await set(page, 's.rate', '0');
    await expect(page.locator('#sMsg .notice.err')).toContainText('100 Jahren nicht erreicht');
  });

  test('year table is copied as German CSV', async ({ page }) => {
    await set(page, 's.years', '2');
    await page.click('#sTableBox summary');
    await expect(page.locator('#sTable tbody tr')).toHaveCount(2);
    await page.click('[data-copy="s"]');
    await expect.poll(() => clipboardText(page)).toMatch(/^Jahr;Einzahlung;Ertrag;Kapital\n1;1200;[\d,]+;[\d,]+\n2;1200;/);
  });
});

test.describe('loan', () => {
  test('payment from the initial repayment, remaining debt after the fixed-rate period', async ({ page }) => {
    await view(page, 'loan');
    await set(page, 'l.amount', '300000');
    await set(page, 'l.rate', '3,5');
    await set(page, 'l.tilgung', '2');
    await set(page, 'l.fixed', '10');
    const i = 0.035 / 12, R = 300000 * 0.055 / 12;   // 1375
    const bal = k => 300000 * Math.pow(1 + i, k) - R * (Math.pow(1 + i, k) - 1) / i;
    await expect(stat(page, 'lRes', 'Monatsrate')).toHaveText(de(R));
    await expect(stat(page, 'lRes', 'Restschuld nach 10 Jahren')).toHaveText(de(bal(120)));
    await expect(stat(page, 'lRes', 'Zinsen in 10 Jahren')).toHaveText(de(120 * R - (300000 - bal(120))));
    const n = Math.ceil(-Math.log(1 - 300000 * i / R) / Math.log(1 + i));
    await expect(stat(page, 'lRes', 'Laufzeit')).toHaveText(`${Math.floor(n / 12)} Jahre${n % 12 ? ` ${n % 12} Monate` : ''}`);
    const total = (n - 1) * R + bal(n - 1) * (1 + i);
    await expect(stat(page, 'lRes', 'Zinsen gesamt')).toHaveText(de(total - 300000));
    await expect(stat(page, 'lRes', 'Effektivzins (ohne Gebühren)')).toHaveText(de((Math.pow(1 + i, 12) - 1) * 100, 3) + ' %');
    await page.click('#lTableBox summary');
    await expect(page.locator('#lTable tbody tr').nth(9).locator('td').last()).toHaveText(de(bal(120)));
  });

  test('payment from the term; extra payments shorten it', async ({ page }) => {
    await view(page, 'loan');
    await seg(page, 'l.mode', 'years');
    await set(page, 'l.amount', '200000');
    await set(page, 'l.rate', '4');
    await set(page, 'l.years', '20');
    await set(page, 'l.fixed', '');
    const i = 0.04 / 12, R = 200000 * i / (1 - Math.pow(1 + i, -240));
    await expect(stat(page, 'lRes', 'Monatsrate')).toHaveText(de(R));
    await expect(stat(page, 'lRes', 'Laufzeit')).toHaveText('20 Jahre');
    await set(page, 'l.extra', '5000');
    await expect(stat(page, 'lRes', 'Laufzeit')).not.toHaveText('20 Jahre');
    await page.click('#lTableBox summary');
    await expect(page.locator('#lTable thead th')).toContainText(['Jahr', 'Zinsen', 'Tilgung', 'Sondertilgung', 'Restschuld']);
  });

  test('a payment below the interest is an error', async ({ page }) => {
    await view(page, 'loan');
    await seg(page, 'l.mode', 'payment');
    await set(page, 'l.amount', '300000');
    await set(page, 'l.rate', '4');
    await set(page, 'l.payment', '900');   // interest alone is 1000 per month
    await expect(page.locator('#lMsg .notice.err')).toContainText('deckt nicht einmal die Zinsen');
    await expect(page.locator('#lRes .calc-result')).toHaveCount(0);
  });
});

test.describe('time value (TVM)', () => {
  test('compute PMT, it follows changes; then N, PV, FV and I/Y', async ({ page }) => {
    await view(page, 'tvm');
    await set(page, 't.n', '360');
    await set(page, 't.iy', '6');
    await set(page, 't.pv', '200000');
    await set(page, 't.fv', '0');
    await expect(page.locator('#tMsg')).toContainText('Berechnen');
    const pmt = (n, iy) => { const i = iy / 1200; return -200000 * i / (1 - Math.pow(1 + i, -n)); };
    await page.click('[data-cpt="pmt"]');
    await expect(page.locator('#tMsg')).toContainText(`PMT = ${de(pmt(360, 6))}`);  // −1.199,10
    await expect(page.locator('[data-key="t.pmt"]')).toHaveValue('-1199,1');
    await set(page, 't.n', '240');
    await expect(page.locator('#tMsg')).toContainText(`PMT = ${de(pmt(240, 6))}`);
    // Solving back for N with the exact PMT gives 240 again
    await page.click('[data-cpt="n"]');
    await expect(page.locator('#tMsg')).toContainText('N = 240,00');
    await page.click('[data-cpt="pv"]');
    await expect(page.locator('#tMsg')).toContainText('PV = 200.000,00');
    await page.click('[data-cpt="iy"]');
    await expect(page.locator('#tMsg')).toContainText('I/Y = 6,0000');
    // AMORT: first year of the 240-month loan
    await set(page, 't.p1', '1');
    await set(page, 't.p2', '12');
    const i = 0.005, R = pmt(240, 6), bal = 200000 * Math.pow(1 + i, 12) + R * (Math.pow(1 + i, 12) - 1) / i;
    await expect(stat(page, 'tAmort', 'BAL – Restschuld')).toHaveText(de(bal));
    await expect(stat(page, 'tAmort', 'PRN – Tilgung')).toHaveText(de(bal - 200000));
    await expect(stat(page, 'tAmort', 'INT – Zinsen')).toHaveText(de(12 * R - (bal - 200000)));
  });

  test('examples, sign key and payments at the start of the period', async ({ page }) => {
    await view(page, 'tvm');
    await page.click('[data-ex="return"]');   // 10 000 become 20 000 in 10 years
    await expect(page.locator('#tMsg')).toContainText(`I/Y = ${de((Math.pow(2, 0.1) - 1) * 100, 4)}`);
    // The sign of PV turned around: no rate fits
    await page.click('[data-sign="t.pv"]');
    await expect(page.locator('[data-key="t.pv"]')).toHaveValue('10000');
    await expect(page.locator('#tMsg .notice.err')).toContainText('Vorzeichen');
    await page.click('[data-sign="t.pv"]');
    await expect(page.locator('#tMsg .notice.ok')).toBeVisible();
    // Savings goal: monthly payments at the start, yearly compounding (C/Y 1)
    await page.click('[data-ex="goal"]');
    const i = Math.pow(1.06, 1 / 12) - 1, n = 180;
    const pmt = -(200000 - 10000 * Math.pow(1 + i, n)) / fvAnnuity(i, n, true);
    await expect(page.locator('#tMsg')).toContainText(`PMT = ${de(pmt)}`);
  });
});

test.describe('cash flows', () => {
  test('NPV, IRR, NFV and payback; rows can be added, signed and deleted (with undo)', async ({ page }) => {
    await view(page, 'cf');
    await set(page, 'c.cf0', '-10000');
    await set(page, 'c.rate', '8');
    const flows = [-10000, 3000, 3000, 4000, 4000];
    const npv = r => flows.reduce((s, c, k) => s + c / Math.pow(1 + r, k), 0);
    await expect(stat(page, 'cRes', 'Kapitalwert (NPV)')).toHaveText(de(npv(0.08)));
    await expect(stat(page, 'cRes', 'Endwert (NFV)')).toHaveText(de(npv(0.08) * Math.pow(1.08, 4)));
    await expect(stat(page, 'cRes', 'Amortisation')).toHaveText('3,00 Perioden');
    // IRR: NPV is zero there
    const irr = parseFloat((await stat(page, 'cRes', 'Interner Zinsfuß (IRR)').textContent()).replace(',', '.')) / 100;
    expect(Math.abs(npv(irr))).toBeLessThan(0.5);
    // Add a row with a negative flow, then delete it again and undo
    await page.click('#cfAdd');
    await page.locator('#cfRows input[data-f="cf"]').nth(2).fill('500');
    await page.click('[data-row-sign="2"]');
    await expect(page.locator('#cfRows input[data-f="cf"]').nth(2)).toHaveValue('-500');
    await expect(stat(page, 'cRes', 'Perioden')).toHaveText('5');
    await page.click('[data-row-del="2"]');
    await expect(stat(page, 'cRes', 'Perioden')).toHaveText('4');
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(stat(page, 'cRes', 'Perioden')).toHaveText('5');
    await expect(page.locator('#cfRows input[data-f="cf"]').nth(2)).toHaveValue('-500');
  });

  test('without inflows there is no IRR', async ({ page }) => {
    await view(page, 'cf');
    await page.locator('#cfRows input[data-f="cf"]').nth(0).fill('-1');
    await page.locator('#cfRows input[data-f="cf"]').nth(1).fill('-1');
    await expect(page.locator('#cMsg')).toContainText('Kein interner Zinsfuß');
  });
});

test.describe('more', () => {
  test('rate conversion, change, profit, break-even', async ({ page }) => {
    await view(page, 'iconv');
    await set(page, 'i.val', '6');
    await set(page, 'i.c', '12');
    const eff = (Math.pow(1.005, 12) - 1) * 100;
    await expect(stat(page, 'iRes', 'Effektivzins')).toHaveText(de(eff, 4) + ' %');
    await expect(stat(page, 'iRes', 'Verdopplung nach')).toHaveText(de(Math.log(2) / Math.log(1 + eff / 100), 1) + ' Jahre');
    await seg(page, 'i.dir', 'eff');
    await expect(stat(page, 'iRes', 'Nominalzins')).toHaveText(de((Math.pow(1.06, 1 / 12) - 1) * 1200, 4) + ' %');
    await view(page, 'change');
    await set(page, 'd.old', '80');
    await set(page, 'd.new', '120');
    await set(page, 'd.years', '3');
    await expect(stat(page, 'dRes', 'Veränderung')).toHaveText('50,00 %');
    await expect(stat(page, 'dRes', 'Rendite pro Jahr (CAGR)')).toHaveText(de((Math.pow(1.5, 1 / 3) - 1) * 100, 3) + ' %');
    await view(page, 'profit');
    await set(page, 'p.cost', '60');
    await set(page, 'p.price', '80');
    await expect(stat(page, 'pRes', 'Marge')).toHaveText('25,00 %');
    await expect(stat(page, 'pRes', 'Aufschlag')).toHaveText(de(100 / 3) + ' %');
    await view(page, 'breakeven');
    await set(page, 'b.fixed', '12000');
    await set(page, 'b.var', '20');
    await set(page, 'b.price', '50');
    await set(page, 'b.target', '3000');
    await expect(stat(page, 'bRes', 'Break-even-Menge')).toHaveText('500,00');
    await expect(stat(page, 'bRes', 'Umsatz dabei')).toHaveText('25.000,00');
    await set(page, 'b.price', '20');
    await expect(page.locator('#bMsg .notice.err')).toBeVisible();
  });

  test('depreciation methods and day count', async ({ page }) => {
    await view(page, 'depr');
    await set(page, 'a.cost', '10000');
    await set(page, 'a.salvage', '0');
    await set(page, 'a.life', '4');
    await seg(page, 'a.method', 'syd');   // 4/10, 3/10, 2/10, 1/10
    await expect(page.locator('#aTable tbody td:nth-child(2)')).toHaveText(['4.000,00', '3.000,00', '2.000,00', '1.000,00']);
    await seg(page, 'a.method', 'db');
    await set(page, 'a.rate', '40');
    // 4000, 2400 (40 % of 6000 beats 6000 / 3); then straight-line on 3600 over 2 years (1800 > 40 % = 1440)
    await expect(page.locator('#aTable tbody td:nth-child(2)')).toHaveText(['4.000,00', '2.400,00', '1.800,00', '1.800,00']);
    await expect(page.locator('#aMsg')).toContainText('Ab Jahr 3 linear');
    await view(page, 'days');
    await set(page, 'dt.a', '2024-01-31');
    await set(page, 'dt.b', '2024-03-01');
    await expect(stat(page, 'dtRes', 'Tatsächliche Tage')).toHaveText('30');   // leap year
    await expect(stat(page, 'dtRes', 'Tage 30/360')).toHaveText('31');
  });
});

test('overview: tiles open a calculator, the back key returns, the open calculator survives a reload', async ({ page }) => {
  await expect(page.locator('#overview .tiles > button')).toHaveCount(10);
  await expect(page.locator('#tabbar')).toBeHidden();
  await view(page, 'tvm');
  await expect(page.locator('#overview')).toBeHidden();
  await expect(page.locator('#tab-tvm')).toHaveAttribute('aria-selected', 'true');
  await page.locator('#tab-tvm').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#cf')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#overview')).toBeVisible();
  await expect(page.locator('#cf')).toBeHidden();
  await view(page, 'depr');
  await page.reload();
  await expect(page.locator('#depr')).toBeVisible();
  await page.click('#tabbar [data-overview]');
  await expect(page.locator('#overview')).toBeVisible();
});

test('inputs survive a reload; reset restores the open calculator and can be undone', async ({ page }) => {
  await view(page, 'loan');
  await set(page, 'l.amount', '123456');
  await page.reload();
  await expect(page.locator('#tab-loan')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#loan')).toBeVisible();
  await expect(page.locator('[data-key="l.amount"]')).toHaveValue('123456');
  await openMenu(page);
  await page.click('#btnReset');
  await expect(page.locator('[data-key="l.amount"]')).toHaveValue('300000');
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(page.locator('[data-key="l.amount"]')).toHaveValue('123456');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('decimal point, thousands commas and CSV with commas', async ({ page }) => {
    await view(page, 'save');
    await expect(page.locator('[data-key="s.cost"]')).toHaveValue('0.2');
    await set(page, 's.start', '10,000');
    await set(page, 's.rate', '0');
    await set(page, 's.ret', '0');
    await set(page, 's.cost', '0');
    await set(page, 's.infl', '0');
    await set(page, 's.years', '1');
    await expect(stat(page, 'sRes', 'Final capital')).toHaveText(en(10000));
    await page.click('#sTableBox summary');
    await page.click('[data-copy="s"]');
    await expect.poll(() => clipboardText(page)).toBe('Year,Paid in,Return,Capital\n1,0,0,10000\n');
  });

  test('switching the language converts decimal separators in the fields', async ({ page }) => {
    await view(page, 'save');
    await set(page, 's.ret', '7.5');
    await switchLang(page, 'de');
    await expect(page.locator('[data-key="s.ret"]')).toHaveValue('7,5');
    await expect(page.locator('#tab-save')).toHaveText('Sparplan');
    await switchLang(page, 'en');
    await expect(page.locator('[data-key="s.ret"]')).toHaveValue('7.5');
  });
});
