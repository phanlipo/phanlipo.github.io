// Physik verstehen: results are checked against an independent calculation of the imaging equation
// 1/f = 1/g + 1/b (sign convention "real is positive", see physics-lab/README.md).
import { test, expect, switchLang, axe } from './helpers.mjs';

// ---- reference (independent from optics.js) ----
const fMirror = k => (k === 0 ? Infinity : 100 / k / 2); // k = 1/r in 1/m, r in cm, f = r/2
const fLens = d => (d === 0 ? Infinity : 100 / d);
const imageOf = (f, g) => {
  const b = Number.isFinite(f) ? 1 / (1 / f - 1 / g) : -g;
  return { b, m: -b / g };
};
const de = (x, d) => x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

const panel = kind => `#p-${kind}`;
const result = (page, kind, label) => page.locator(`${panel(kind)} .calc-result`, { has: page.locator('.k', { hasText: label }) }).locator('.v');
const main = (page, kind) => page.locator(`${panel(kind)} .calc-result.main .v`);
async function open(page, kind) {
  if (await page.locator('#overview').isVisible()) await page.click(`#overview [data-open="${kind}"]`);
  else await page.click(`#tab-${kind}`);
  await expect(page.locator(panel(kind))).toBeVisible();
}
async function setup(page, kind, v, g) {
  await open(page, kind);
  await page.locator(`${panel(kind)} [data-part="v"]`).fill(String(v));
  await page.locator(`${panel(kind)} [data-part="g"]`).fill(String(g));
}

test.beforeEach(async ({ page }) => { await page.goto('/physics-lab/'); });

test.describe('curved mirror', () => {
  test('spoon, inside: real, upside down and much smaller', async ({ page }) => {
    await open(page, 'mirror');
    await page.click('#p-mirror .chip:has-text("Löffel innen")');
    await expect(page.locator('#p-mirror .chip:has-text("Löffel innen")')).toHaveAttribute('aria-pressed', 'true');
    const f = fMirror(30), { b, m } = imageOf(f, 30);
    expect(m).toBeLessThan(0);
    await expect(main(page, 'mirror')).toHaveText('reell · umgekehrt · verkleinert');
    await expect(result(page, 'mirror', 'Krümmungsradius')).toContainText(de(2 * f, 1)); // 3,3
    await expect(result(page, 'mirror', 'Brennweite')).toContainText(de(f, 1));          // 1,7
    await expect(result(page, 'mirror', 'Bildweite')).toContainText(de(b, 1));           // 1,8
    await expect(result(page, 'mirror', 'Abbildungsmaßstab')).toHaveText(de(m, 3));      // -0,059
    await expect(page.locator('#p-mirror [data-part="vOut"]')).toHaveText('hohl · r = 3,3 cm');
    await expect(page.locator('#p-mirror [data-part="why"]')).toContainText('Löffel');
    // the image is tiny: the inset draws it larger and upside down
    await expect(page.locator('#p-mirror svg text', { hasText: /^Bild ×\d+$/ })).toHaveCount(1);
  });

  test('every case of the imaging rules', async ({ page }) => {
    const cases = [
      // [curvature 1/m, g cm, image words]
      [10, 30, 'reell · umgekehrt · verkleinert'],  // f = 5, g > 2f
      [10, 10, 'reell · umgekehrt · gleich groß'],  // g = 2f
      [10, 7, 'reell · umgekehrt · vergrößert'],    // f < g < 2f
      [2.5, 10, 'virtuell · aufrecht · vergrößert'], // g < f: make-up mirror
      [-30, 30, 'virtuell · aufrecht · verkleinert'], // convex: back of the spoon
      [-2, 5, 'virtuell · aufrecht · verkleinert'],
      [0, 20, 'virtuell · aufrecht · gleich groß'],  // flat mirror
    ];
    for (const [k, g, words] of cases) {
      await setup(page, 'mirror', k, g);
      await expect(main(page, 'mirror'), `k=${k}, g=${g}`).toHaveText(words);
      const { b, m } = imageOf(fMirror(k), g);
      await expect(result(page, 'mirror', 'Bildweite')).toContainText(de(b, 1));
      await expect(result(page, 'mirror', 'Abbildungsmaßstab')).toHaveText(de(m, Math.abs(m) >= 0.1 ? 2 : 3));
      // a virtual image is drawn dashed, a real one solid
      await expect(page.locator('#p-mirror svg g.img').first()).toHaveClass(words.startsWith('virtuell') ? /virtual/ : /^img$/);
    }
    await expect(page.locator('#p-mirror [data-part="vOut"]')).toHaveText('eben');
    await expect(result(page, 'mirror', 'Brennweite')).toHaveText('unendlich');
  });

  test('object in the focal point: no image', async ({ page }) => {
    await setup(page, 'mirror', 10, 5);
    await expect(main(page, 'mirror')).toHaveText('kein Bild (im Unendlichen)');
    await expect(result(page, 'mirror', 'Bildweite')).toHaveText('unendlich');
    await expect(page.locator('#p-mirror svg g.img')).toHaveCount(0);
    await expect(page.locator('#p-mirror .calc-result')).toHaveCount(4);
  });

  test('formulas with the values are typeset', async ({ page }) => {
    await setup(page, 'mirror', 2.5, 10); // f = 20, b = -20, m = 2
    await page.click('#p-mirror summary:has-text("Formeln")');
    const math = page.locator('#p-mirror [data-part="math"]');
    await expect(math.locator('.katex')).toHaveCount(4);
    await expect(math.locator('.fallback')).toHaveCount(0);
    const text = await math.locator('annotation').allTextContents();
    expect(text[0]).toContain('=20{,}0');
    expect(text[2]).toContain('\\frac{20{,}0\\cdot 10{,}0}{10{,}0-20{,}0}');
    expect(text[2]).toContain('=-20{,}0');
    expect(text[3]).toContain('=2{,}00');
    await page.click('#p-mirror summary:has-text("Löffel")');
    await expect(page.locator('#spoonMath .katex')).toHaveCount(3);
  });

  test('dragging the figure changes the object distance', async ({ page }) => {
    await setup(page, 'mirror', 10, 30);
    const svg = page.locator('#p-mirror [data-part="svg"]');
    await svg.scrollIntoViewIfNeeded(); // filling the sliders scrolled the page down to them
    const box = await svg.boundingBox();
    // view from -52 to 28 cm: x = -20 cm lies at 32/80 of the width
    const y = box.y + box.height * 0.3;
    await page.mouse.move(box.x + box.width * (22 / 80), y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * (27 / 80), y, { steps: 5 });
    await page.mouse.move(box.x + box.width * (32 / 80), y, { steps: 5 });
    await page.mouse.up();
    await expect(page.locator('#p-mirror [data-part="g"]')).toHaveValue('20');
    await expect(page.locator('#p-mirror [data-part="gOut"]')).toHaveText('20,0 cm');
  });

  test('the drawn rays meet in the image point', async ({ page }) => {
    // geometry of optics.js against the calculated image: outgoing rays (or their extensions) pass through it
    const misses = await page.evaluate(() => {
      const out = [];
      for (const [kind, v, g] of [['mirror', 10, 30], ['mirror', 2.5, 10], ['mirror', -30, 30], ['mirror', 0, 20], ['lens', 10, 15], ['lens', 10, 6], ['lens', -4, 40]]) {
        const st = window.Optics.setup(kind, v, g, 8);
        for (const r of st.rays) {
          const [[x1, y1], [x2, y2]] = r.back || r.out;
          const y = y1 + (y2 - y1) * (st.imageX - x1) / (x2 - x1);
          if (Math.abs(y - st.imageH) > 1e-6) out.push(`${kind} ${v}/${g} ${r.id}: ${y} ≠ ${st.imageH}`);
        }
        if (st.rays.length < (v === 0 ? 2 : 3)) out.push(`${kind} ${v}/${g}: only ${st.rays.length} rays`);
      }
      return out;
    });
    expect(misses).toEqual([]);
  });
});

// ---- light through slits: reference (Fraunhofer, independent from waves.js) ----
const slitI = (n, lamNm, d, a, sin) => {
  const lam = lamNm / 1000, delta = 2 * Math.PI * d * sin / lam, beta = Math.PI * a * sin / lam;
  const env = beta === 0 ? 1 : (Math.sin(beta) / beta) ** 2;
  const s2 = Math.sin(delta / 2);
  const grat = n === 1 || Math.abs(s2) < 1e-12 ? 1 : (Math.sin(n * delta / 2) / (n * s2)) ** 2;
  return env * grat;
};
const xOf = sin => 100 * Math.tan(Math.asin(sin)); // cm on a screen 1 m away
async function slits(page, { n, l, d, a, p }) {
  await open(page, 'waves');
  for (const [id, v] of [['wN', n], ['wL', l], ['wD', d], ['wA', a], ['wP', p]]) if (v != null) await page.locator(`#${id}`).fill(String(v));
}
const wres = (page, label) => page.locator('#wRes .calc-result', { has: page.locator('.k', { hasText: label }) }).locator('.v');

test.describe('light through slits', () => {
  test('double slit: fringe spacing, width and brightness at the marker', async ({ page }) => {
    await slits(page, { n: 2, l: 650, d: 10, a: 2, p: 30 });
    await expect(page.locator('#wPresets button', { hasText: 'Doppelspalt' })).toHaveAttribute('aria-pressed', 'true');
    await expect(wres(page, 'Abstand')).toContainText(de(xOf(0.065), 1));             // 6,5 cm
    await expect(wres(page, 'Breite')).toContainText(de(2 * xOf(0.065 / 2), 1));      // 6,5 cm
    await expect(wres(page, 'Nebenmaxima')).toHaveText('0');
    // marker at 30 % of the half width shown (3.5 orders)
    const X = xOf(3.5 * 0.065), x = 0.3 * X, sin = Math.sin(Math.atan(x / 100));
    await expect(page.locator('#wPOut')).toHaveText(`x = ${de(x, 1)} cm`);
    await expect(wres(page, 'Helligkeit')).toHaveText(`${Math.round(slitI(2, 650, 10, 2, sin) * 100)} %`);
    await expect(wres(page, 'Gangunterschied')).toHaveText(`${de(10 * sin / 0.65, 2)} λ`);
    await expect(page.locator('#wGraph text', { hasText: /^−?[0-3]$/ })).toHaveCount(7); // orders −3 … 3
  });

  test('the phasors explain bright and dark', async ({ page }) => {
    const X = xOf(3.5 * 0.065);
    // on the first order: Δs = λ, all phasors aligned
    const p1 = Math.round(xOf(0.065) / X * 100);
    await slits(page, { n: 4, l: 650, d: 10, a: 2, p: p1 });
    await expect(page.locator('#wWhy')).toContainText('k = 1');
    await expect(page.locator('#wPhasor line.chain')).toHaveCount(4);
    await expect(page.locator('#wPhasor line.sum')).toHaveCount(1);
    // first dark spot next to the centre: Δs = λ/N → the 4 phasors close into a square
    // (the slider moves in steps of 1 % of the half width: the nearest step is 7 %, Δs = 0.252 λ)
    const zero = xOf(0.065 / 4) / X;
    await page.locator('#wP').fill(String(Math.round(zero * 100)));
    // |sin(4·δ/2) / (4·sin(δ/2))| < 1 % there: the explanation calls it dark
    await expect(page.locator('#wWhy')).toContainText('geschlossenen Vieleck');
    await expect(page.locator('#wPhasorCap')).toContainText(/Δφ = (8\d|9\d)°/);
    // halfway between dark and bright the phasors only partly cancel
    await page.locator('#wP').fill('20');
    await expect(page.locator('#wWhy')).toContainText('teilweise');
    // with 20 slits the central fringe is 5 times narrower than with 4
    await page.locator('#wN').fill('20');
    await expect(wres(page, 'Breite')).toContainText(de(2 * xOf(0.065 / 20), 1));
    await expect(wres(page, 'Nebenmaxima')).toHaveText('18');
  });

  test('missing order where the single slit is dark (d = 2a)', async ({ page }) => {
    const X = xOf(3.5 * 0.065), p2 = xOf(2 * 0.065) / X * 100;
    await slits(page, { n: 2, l: 650, d: 10, a: 5 });
    await page.locator('#wP').fill(String(Math.round(p2))); // Δs = 1.994 λ: on the 2nd order
    await expect(wres(page, 'Helligkeit')).toHaveText('0 %');
    await expect(page.locator('#wWhy')).toContainText('k = 2 fehlt');
  });

  test('the slit width is limited to the spacing', async ({ page }) => {
    await slits(page, { n: 2, l: 650, d: 10, a: 8 });
    await page.locator('#wD').fill('4');
    await expect(page.locator('#wAOut')).toHaveText('4,0 µm');
  });

  test('formulas, explanation and screen image', async ({ page }) => {
    await slits(page, { n: 2, l: 500, d: 10, a: 2, p: 0 });
    await page.click('#p-waves summary:has-text("Formeln")');
    const tex = (await page.locator('#wMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('\\sin\\alpha_1=\\frac{0{,}500\\,\\mu\\text{m}}{10{,}0\\,\\mu\\text{m}}=0{,}0500');
    expect(tex).toContain('x_1=L\\cdot\\tan\\alpha_1' + '\\approx ' + de(xOf(0.05), 1).replace(',', '{,}'));
    await expect(page.locator('#wMath .fallback')).toHaveCount(0);
    await page.click('#p-waves summary:has-text("Warum")');
    await expect(page.locator('#wExplain .katex')).toHaveCount(2);
    // the screen is bright in the middle (green light) and dark at the first minimum
    const px = await page.evaluate(() => {
      const c = document.getElementById('wBand'), g = c.getContext('2d'), w = c.width;
      return [g.getImageData(Math.floor(w / 2), 5, 1, 1).data[1], g.getImageData(Math.round(w / 2 + w / 2 * (100 * Math.tan(Math.asin(0.025)) / (100 * Math.tan(Math.asin(0.175))))), 20, 1, 1).data[1]];
    });
    expect(px[0]).toBeGreaterThan(200);
    expect(px[1]).toBeLessThan(40);
  });

  test('dragging across the screen moves the marker', async ({ page }) => {
    await slits(page, { n: 2, l: 650, d: 10, a: 2, p: 0 });
    const sc = page.locator('#wScene');
    await sc.scrollIntoViewIfNeeded();
    const box = await sc.boundingBox(), y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width / 2, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, y, { steps: 4 });
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 4 });
    await page.mouse.up();
    await expect(page.locator('#wP')).toHaveValue('50');
  });
});

test.describe('lens', () => {
  test('projector, magnifier and glasses', async ({ page }) => {
    await open(page, 'lens');
    for (const [name, d, g, words] of [
      ['Projektor', 10, 15, 'reell · umgekehrt · vergrößert'],
      ['Kamera', 10, 45, 'reell · umgekehrt · verkleinert'],
      ['Lupe', 10, 6, 'virtuell · aufrecht · vergrößert'],
      ['Brille (kurzsichtig)', -4, 40, 'virtuell · aufrecht · verkleinert'],
    ]) {
      await page.click(`#p-lens .chip:has-text("${name}")`);
      const { b, m } = imageOf(fLens(d), g);
      await expect(main(page, 'lens'), name).toHaveText(words);
      await expect(result(page, 'lens', 'Brennweite')).toContainText(de(fLens(d), 1));
      await expect(result(page, 'lens', 'Bildweite')).toContainText(de(b, 1));
      await expect(result(page, 'lens', 'Abbildungsmaßstab')).toHaveText(de(m, Math.abs(m) >= 0.1 ? 2 : 3));
    }
    await expect(page.locator('#p-lens [data-part="vOut"]')).toHaveText('-4,0 dpt · f = -25,0 cm');
    await expect(page.locator('#p-lens [data-part="why"]')).toContainText('Kurzsichtige');
  });
});

test('open experiments with formulas have no accessibility violations', async ({ page }) => {
  for (const kind of ['mirror', 'lens', 'waves']) {
    await open(page, kind);
    for (const s of await page.locator(`${panel(kind)} details.sub > summary`).all()) await s.click();
    await expect(page.locator(`${panel(kind)} .katex`).first()).toBeVisible();
    expect((await axe(page).include(panel(kind)).analyze()).violations).toEqual([]);
  }
});

test('settings and the open experiment survive a reload', async ({ page }) => {
  await setup(page, 'lens', -6.5, 22.5);
  await page.reload();
  await expect(page.locator('#p-lens')).toBeVisible();
  await expect(page.locator('#p-lens [data-part="v"]')).toHaveValue('-6.5');
  await expect(page.locator('#p-lens [data-part="g"]')).toHaveValue('22.5');
  await page.click('[data-overview]');
  await expect(page.locator('#overview')).toBeVisible();
  await page.reload();
  await expect(page.locator('#overview')).toBeVisible();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('labels, results and formulas follow the language', async ({ page }) => {
    await open(page, 'mirror');
    await page.click('#p-mirror .chip:has-text("Spoon, back")');
    await expect(main(page, 'mirror')).toHaveText('virtual · upright · reduced');
    await expect(page.locator('#p-mirror [data-part="vOut"]')).toHaveText('convex · r = 3.3 cm');
    await expect(page.locator('#p-mirror [data-part="legend"]')).toContainText('Vertex ray');
    await page.click('#p-mirror summary:has-text("Formulas")');
    expect((await page.locator('#p-mirror [data-part="math"] annotation').first().textContent())).toContain('-3.3');
    await switchLang(page, 'de');
    await expect(main(page, 'mirror')).toHaveText('virtuell · aufrecht · verkleinert');
    expect((await page.locator('#p-mirror [data-part="math"] annotation').first().textContent())).toContain('-3{,}3');
  });
});
