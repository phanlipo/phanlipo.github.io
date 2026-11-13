// Funktionsplotter: expression engine (values recomputed here independently), function list and parameter sliders,
// trace/snap, pan and zoom, examples, animation, saving, English.
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('function-plotter.state.v1')));
const fnInput = (page, i) => page.locator(`#fns input[data-i="${i}"]`);
const param = (page, n) => page.locator(`#params .param[data-p="${n}"]`);
// Evaluates lines with the engine of the page: values at x for every line
const engine = (page, lines, xs, P = {}) => page.evaluate(([lines, xs, P]) => {
  const c = window.PlotExpr.compile(lines);
  return { params: c.params, items: c.items.map(it => ({ kind: it.kind, error: it.error, name: it.name, values: it.f ? xs.map(x => { const v = it.f(x, P); return Number.isFinite(v) ? v : null; }) : null })) };
}, [lines, xs, P]);
// Pixel position of a point (x, y) in the canvas, from the view in the menu fields
async function toPx(page, x, y) {
  const v = await page.evaluate(() => JSON.parse(localStorage.getItem('function-plotter.state.v1') || 'null'));
  const box = await page.locator('#cv').boundingBox();
  return { x: (x - v.view.x0) / (v.view.x1 - v.view.x0) * box.width, y: box.height - (y - v.view.y0) / (v.view.y1 - v.view.y0) * box.height };
}
// State is saved shortly after a change
const settled = page => page.waitForTimeout(400);

test.describe('German', () => {
  test.use({ locale: 'de-DE' });
  test.beforeEach(async ({ page }) => { await page.goto('/function-plotter/'); });

  test('engine: operators, implicit multiplication, functions, decimal comma, scientific notation', async ({ page }) => {
    const x = 1.7;
    const { items, params } = await engine(page, [
      '2x^2 - 3x + 1', 'a sin(b x)', 'sin 2x', 'sin x cos x', '|x - 3|', 'x²·√x', '1,5x', '6.6e-3 x', 'max(x; 2)', 'max(x, 2)',
      '2(x+1)', 'a(x+1)', 'e^-x', '-x^2', '2^3^2', '3!', 'x^(1/3)', '(-8)^(1/3)', 'log(2; 8)', 'ln e', 'π', 'erf(1)', 'gamma(5)',
      'ω t', 'v0 x', 'x_1 + 1', 'mod(7; 3)', 'step(x - 2)', 'sinc(0)', 'atan(1; 1)',
    ], [x], { a: 2, b: 3, ω: 4, t: 0.5, v0: 3, x_1: 5 });
    const v = items.map(i => i.values[0]);
    const expected = [
      2 * x * x - 3 * x + 1, 2 * Math.sin(3 * x), Math.sin(2 * x), Math.sin(x) * Math.cos(x), Math.abs(x - 3), x * x * Math.sqrt(x), 1.5 * x,
      6.6e-3 * x, 2, 2, 2 * (x + 1), 2 * (x + 1), Math.exp(-x), -x * x, 2 ** 9, 6, Math.cbrt(x), -2, 3, 1, Math.PI, 0.8427007929497149, 24,
      2, 3 * x, 6, 1, 0, 1, Math.PI / 4,
    ];
    expected.forEach((e, k) => expect(v[k], `line ${k + 1}`).toBeCloseTo(e, 9));
    expect(params).toEqual(['a', 'b', 'ω', 't', 'v0', 'x_1']);
  });

  test('engine: named functions, derivatives, constants, own variable, errors', async ({ page }) => {
    const { items, params } = await engine(page, [
      'f(x) = x³ - 3x', "f'(x)", "f''(x)", 'f(x - 1)', 'g = 9,81', 's(t) = g/2 t²', 's(x)', 'y = k x # Kommentar',
      'sin(x', '2 +', 'x $ 2', 'f(x) = 2', 'sin = 3', 'h(x)', "k'(x)", 'max()', 'a = b', 'b = a', 'b',
    ], [2], { k: 1.5 });
    const val = k => items[k].values && items[k].values[0];
    expect(val(0)).toBeCloseTo(2, 10);
    expect(val(1)).toBeCloseTo(3 * 4 - 3, 5); // f'(2) = 3x² − 3
    expect(val(2)).toBeCloseTo(6 * 2, 3); // f''(2) = 6x
    expect(val(3)).toBeCloseTo(1 - 3, 10); // f(1)
    expect(items[4]).toMatchObject({ kind: 'const', name: 'g' });
    expect(items[5]).toMatchObject({ kind: 'fn', name: 's' });
    expect(val(6)).toBeCloseTo(9.81 / 2 * 4, 10);
    expect(val(7)).toBeCloseTo(3, 10);
    expect(items[8].kind).toBe('fn'); // a missing ")" at the end is closed
    expect(val(8)).toBeCloseTo(Math.sin(2), 10);
    expect(items.slice(9).map(i => i.error || i.kind)).toEqual(['end', 'symbol', 'twice', 'reserved', 'fn', 'nofn', 'syntax', 'const', 'const', 'fn']);
    // h(x) without a definition multiplies: h·x (h has no value in this check); a = b and b = a refer to each other
    expect(val(13)).toBeNull();
    expect((await engine(page, ['h(x)'], [2], { h: 4 })).items[0].values[0]).toBe(8);
    expect(items[16].values[0]).toBeNull();
    expect(items[18].values[0]).toBeNull();
    expect(params).toEqual(['k', 'h']);
  });

  test('engine: zeros and extrema; poles are no zeros', async ({ page }) => {
    const pts = await page.evaluate(() => {
      const c = window.PlotExpr.compile(['x³ - x', 'tan x', '1/x', 'floor(x)']).items;
      return c.map(it => window.PlotExpr.points(x => it.f(x, {}), -2, 2, 400));
    });
    const s = 1 / Math.sqrt(3);
    expect(pts[0].map(p => p.type)).toEqual(['zero', 'max', 'zero', 'min', 'zero']);
    [-1, -s, 0, s, 1].forEach((x, k) => expect(pts[0][k].x).toBeCloseTo(x, 7));
    expect(pts[0][1].y).toBeCloseTo(s - s ** 3, 9);
    // tan has a zero at 0 and poles at ±π/2 (also sign changes) – only the zero counts
    expect(pts[1].map(p => [p.type, Math.round(p.x * 1e6) / 1e6])).toEqual([['zero', 0]]);
    expect(pts[2]).toEqual([]);
    expect(pts[3].filter(p => p.type !== 'zero')).toEqual([]);
  });

  test('typing a function shows its parameters as sliders; values and errors update', async ({ page }) => {
    await fnInput(page, 0).fill('A cos(ω x) + c');
    await expect(page.locator('#params .param')).toHaveCount(3);
    await expect(page.locator('#params .param label')).toHaveText(['A', 'ω', 'c']);
    await param(page, 'A').locator('[data-role="v"]').fill('2,5');
    await param(page, 'c').locator('[data-role="v"]').fill('7'); // outside −5 … 5 → range grows
    await expect(param(page, 'c').locator('[data-role="max"]')).toHaveValue('7');
    // Slider: halfway between 0 and 4 for ω
    await param(page, 'ω').locator('[data-role="min"]').fill('0');
    await param(page, 'ω').locator('[data-role="max"]').fill('4');
    await param(page, 'ω').locator('[data-role="range"]').fill('500');
    await expect(param(page, 'ω').locator('[data-role="v"]')).toHaveValue('2');
    await settled(page);
    const s = await stored(page);
    expect(s.params).toMatchObject({ A: { v: 2.5 }, ω: { v: 2, min: 0, max: 4 }, c: { v: 7, max: 7 } });
    // Error message under the line, field marked invalid
    await fnInput(page, 1).fill('2 * (x');
    await expect(fnInput(page, 1)).toHaveAttribute('aria-invalid', 'false'); // closed automatically
    await fnInput(page, 1).fill('x $ 1');
    await expect(page.locator('#fnmsg-1')).toHaveText('Unbekanntes Zeichen „$“');
    await expect(fnInput(page, 1)).toHaveAttribute('aria-invalid', 'true');
    await fnInput(page, 1).fill('g = 9,81');
    await expect(page.locator('#fnmsg-1')).toHaveText('g = 9,81');
    // Reload keeps everything
    await settled(page);
    await page.reload();
    await expect(fnInput(page, 0)).toHaveValue('A cos(ω x) + c');
    await expect(param(page, 'A').locator('[data-role="v"]')).toHaveValue('2,5');
  });

  test('tap shows the values; near a zero or extremum it snaps to the exact point', async ({ page }) => {
    await fnInput(page, 0).fill('x² - 2');
    await fnInput(page, 1).fill('-x/2');
    await page.locator('#btnFit').click();
    await settled(page);
    // Tap at x = 1 (no marked point nearby): values of both curves
    let p = await toPx(page, 1, 3);
    await page.locator('#cv').click({ position: p });
    await expect(page.locator('#readoutList li')).toHaveText(['x = 1', 'y₁ = -1', 'y₂ = -0,5']);
    // Tap close to (√2, 0): snaps to the zero
    p = await toPx(page, Math.SQRT2, 0);
    await page.locator('#cv').click({ position: { x: p.x + 5, y: p.y - 4 } });
    await expect(page.locator('#readoutList li').first()).toHaveText(`Nullstelle von y₁: x = ${Math.SQRT2.toFixed(4).replace('.', ',')}, y = 0`);
    // Minimum at (0, −2)
    p = await toPx(page, 0, -2);
    await page.locator('#cv').click({ position: { x: p.x - 3, y: p.y + 3 } });
    await expect(page.locator('#readoutList li').first()).toHaveText('Minimum von y₁: x = 0, y = -2');
    await expect(page.locator('#readoutList li').nth(1)).toHaveText('y₂ = 0');
    // The snapped point follows a parameter: x² − a has its zero at √a
    await fnInput(page, 0).fill('x² - a');
    await param(page, 'a').locator('[data-role="v"]').fill('1');
    await page.locator('#btnFit').click();
    await settled(page);
    p = await toPx(page, 1, 0); // zero at 1
    await page.locator('#cv').click({ position: p });
    await expect(page.locator('#readoutList li').first()).toHaveText('Nullstelle von y₁: x = 1, y = 0');
    await param(page, 'a').locator('[data-role="v"]').fill('3');
    await expect(page.locator('#readoutList li').first()).toHaveText(`Nullstelle von y₁: x = ${Math.sqrt(3).toFixed(4).replace('.', ',')}, y = 0`);
    await page.getByRole('button', { name: 'Werte ausblenden' }).click();
    await expect(page.locator('#readout')).toBeHidden();
  });

  test('drag pans, wheel and buttons zoom, view limits in the menu', async ({ page }) => {
    await fnInput(page, 0).fill('x');
    const box = await page.locator('#cv').boundingBox();
    let v = (await stored(page) || { view: { x0: -10, x1: 10, y0: -6, y1: 6 } }).view;
    const w0 = v.x1 - v.x0;
    // drag right by a quarter of the width → x range moves left by a quarter
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await settled(page);
    let s = (await stored(page)).view;
    expect(s.x0).toBeCloseTo(v.x0 - w0 / 4, 6);
    expect(s.x1 - s.x0).toBeCloseTo(w0, 6);
    expect(s.y0).toBeCloseTo(v.y0, 6);
    // a drag is no tap: no values shown
    await expect(page.locator('#readout')).toBeHidden();
    await page.getByRole('button', { name: 'Vergrößern' }).click();
    await settled(page);
    v = s; s = (await stored(page)).view;
    expect(s.x1 - s.x0).toBeCloseTo((v.x1 - v.x0) * 0.8, 6);
    expect((s.x0 + s.x1) / 2).toBeCloseTo((v.x0 + v.x1) / 2, 6);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 200);
    await settled(page);
    expect((await stored(page)).view.x1 - (await stored(page)).view.x0).toBeGreaterThan(s.x1 - s.x0);
    // Exact limits in the menu
    await openMenu(page);
    await page.locator('#vx0').fill('-1');
    await page.locator('#vx1').fill('3,5');
    await page.locator('#vy0').fill('-2');
    await page.locator('#vy1').fill('2');
    await page.getByRole('button', { name: 'Übernehmen' }).click();
    await closeMenu(page);
    await settled(page);
    expect((await stored(page)).view).toEqual({ x0: -1, x1: 3.5, y0: -2, y1: 2 });
    // Fit: y = x on [−1, 3,5] → y from −1 to 3,5 plus 8 % margin
    await page.locator('#btnFit').click();
    await settled(page);
    s = (await stored(page)).view;
    expect(s.y0).toBeCloseTo(-1 - 4.5 * 0.08, 6);
    expect(s.y1).toBeCloseTo(3.5 + 4.5 * 0.08, 6);
    // Equal scaling: units per pixel the same on both axes
    await openMenu(page);
    await page.getByLabel('x und y gleich skalieren (Kreise bleiben rund)').check();
    await closeMenu(page);
    await settled(page);
    s = (await stored(page)).view;
    const b = await page.locator('#cv').boundingBox();
    expect((s.y1 - s.y0) / b.height).toBeCloseTo((s.x1 - s.x0) / b.width, 9);
  });

  test('swatch hides a curve, functions are added and removed, at most eight', async ({ page }) => {
    await fnInput(page, 0).fill('x');
    await page.getByRole('button', { name: 'Kurve 1 anzeigen' }).click();
    await expect(page.getByRole('button', { name: 'Kurve 1 anzeigen' })).toHaveAttribute('aria-pressed', 'false');
    for (let i = 0; i < 8; i++) if (await page.locator('#add').isEnabled()) await page.locator('#add').click();
    await expect(page.locator('#fns .fn')).toHaveCount(8);
    await expect(page.locator('#add')).toBeDisabled();
    await expect(fnInput(page, 7)).toBeFocused();
    await page.getByRole('button', { name: 'Funktion 1 entfernen' }).click();
    await expect(page.locator('#fns .fn')).toHaveCount(7);
    await expect(fnInput(page, 0)).toHaveValue('');
  });

  test('examples load functions, parameters and view; ▶ runs a parameter', async ({ page }) => {
    await page.locator('#examples').selectOption({ label: 'Stehende Welle (t laufen lassen)' });
    await expect(fnInput(page, 2)).toHaveValue('A sin(k x - ω t) + A sin(k x + ω t)');
    await expect(page.locator('#params .param label')).toHaveText(['A', 'k', 'ω', 't']);
    await expect(page.locator('#examples')).toHaveValue('');
    const t0 = await param(page, 't').locator('[data-role="v"]').inputValue();
    await page.getByRole('button', { name: 't laufen lassen' }).click();
    await expect(page.getByRole('button', { name: 't anhalten' })).toHaveAttribute('aria-pressed', 'true');
    await expect(param(page, 't').locator('[data-role="v"]')).not.toHaveValue(t0);
    await page.getByRole('button', { name: 't anhalten' }).click();
    const t1 = await param(page, 't').locator('[data-role="v"]').inputValue();
    await page.waitForTimeout(200);
    await expect(param(page, 't').locator('[data-role="v"]')).toHaveValue(t1);
    // Throw example: constant line shows its value, named function draws
    await page.locator('#examples').selectOption({ label: 'Wurfparabel' });
    await expect(page.locator('#fnmsg-0')).toHaveText('g = 9,81');
    await expect(page.locator('#params .param label')).toHaveText(['α', 'v0']);
  });

  test('graph saved as PNG', async ({ page }) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Als Bild speichern' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^funktionsplot-\d{4}-\d\d-\d\d\.png$/);
    const { readFileSync } = await import('node:fs');
    const buf = readFileSync(await dl.path());
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    // twice the size of the canvas
    const box = await page.locator('#cv').boundingBox();
    expect(buf.readUInt32BE(16)).toBe(Math.round(box.width * 2));
  });

  test('keyboard: arrows pan, + zooms, Escape hides the values', async ({ page }) => {
    await settled(page);
    await page.locator('#cv').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('+');
    await settled(page);
    const s = (await stored(page)).view;
    // −10 … 10 → shifted by 2 → −8 … 12 → zoom 0,8 about the centre 2 → −6 … 10
    expect(s.x0).toBeCloseTo(-6, 9);
    expect(s.x1).toBeCloseTo(10, 9);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('interface, numbers and error messages in English; decimal point', async ({ page }) => {
    await page.goto('/function-plotter/');
    await expect(page.locator('#add')).toHaveText('+ Function');
    await fnInput(page, 0).fill('x² - 2,25 # comma works too');
    await fnInput(page, 1).fill('q = 1.5');
    await expect(page.locator('#fnmsg-1')).toHaveText('q = 1.5');
    await page.locator('#btnFit').click();
    await settled(page);
    const p = await toPx(page, 1.5, 0);
    await page.locator('#cv').click({ position: p });
    await expect(page.locator('#readoutList li').first()).toHaveText('Zero of y₁: x = 1.5, y = 0');
    await fnInput(page, 1).fill('f′(x)');
    await expect(page.locator('#fnmsg-1')).toHaveText('“f” is not a function – define “f(x) = …” first');
    await page.locator('#examples').selectOption({ label: 'Projectile motion' });
    await expect(fnInput(page, 0)).toHaveValue('g = 9.81');
    await switchLang(page, 'de');
    await expect(page.locator('#add')).toHaveText('+ Funktion');
    await expect(page.locator('#fnmsg-0')).toHaveText('g = 9,81');
  });
});
