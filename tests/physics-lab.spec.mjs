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

// ---- oscillations: reference (independent from mechanics.js) ----
// exact period of a pendulum as a series: T = T0 · Σ [(2n)! / (2^2n · n!²)]² · k^2n with k = sin(φ0/2)
const pendulumT = (l, g, deg) => {
  const k2 = Math.sin(deg * Math.PI / 360) ** 2;
  let sum = 0, c = 1;
  for (let n = 0; n < 60; n++) { if (n) c *= (2 * n - 1) / (2 * n); sum += c * c * k2 ** n; }
  return 2 * Math.PI * Math.sqrt(l / g) * sum;
};
const secs = x => `${de(x, 2)} s`;
const pres = (page, id, label) => page.locator(`#${id} .calc-result`, { has: page.locator('.k', { hasText: label }) }).locator('.v');

test.describe('pendulum', () => {
  test('simple pendulum: the period does not depend on the mass', async ({ page }) => {
    await open(page, 'pendulum');
    await page.locator('#pL').fill('1');
    await page.locator('#pA').fill('20');
    await expect(pres(page, 'pRes', 'beide')).toHaveText(secs(pendulumT(1, 9.81, 20)));           // 2,02 s
    await expect(pres(page, 'pRes', 'kleine Winkel')).toHaveText(secs(2 * Math.PI * Math.sqrt(1 / 9.81))); // 2,01 s
    for (const m of ['100', '1000']) {
      await page.locator('#pM2').fill(m);
      await expect(pres(page, 'pRes', 'beide')).toHaveText(secs(pendulumT(1, 9.81, 20)));
    }
    await expect(page.locator('#pWhy')).toContainText('Das rechte Pendel ist 10-mal so schwer wie das linke');
    await page.locator('#pM1').fill('500'); await page.locator('#pM2').fill('250');
    await expect(page.locator('#pWhy')).toContainText('Das linke Pendel ist 2-mal so schwer wie das rechte');
    await page.locator('#pA').fill('80');
    await expect(pres(page, 'pRes', 'beide')).toHaveText(secs(pendulumT(1, 9.81, 80)));
    await page.click('#pGrav button:has-text("Mond")');
    await expect(pres(page, 'pRes', 'kleine Winkel')).toHaveText(secs(2 * Math.PI * Math.sqrt(1 / 1.62)));
  });

  test('mass on a spring: heavier is slower, gravity does not matter', async ({ page }) => {
    await open(page, 'pendulum');
    await page.click('#pKind button:has-text("Federpendel")');
    await expect(page.locator('#pLField')).toBeHidden();
    await page.locator('#pK').fill('10'); await page.locator('#pM1').fill('100'); await page.locator('#pM2').fill('400');
    const T = m => 2 * Math.PI * Math.sqrt(m / 10);
    await expect(pres(page, 'pRes', 'links')).toHaveText(secs(T(0.1)));
    await expect(pres(page, 'pRes', 'rechts')).toHaveText(secs(T(0.4)));
    await expect(pres(page, 'pRes', 'Verhältnis')).toHaveText('2,00');
    await page.click('#pGrav button:has-text("Mond")');
    await expect(pres(page, 'pRes', 'rechts')).toHaveText(secs(T(0.4)));
    await expect(page.locator('#pWhy')).toContainText('Auf dem Mond schwingt das Federpendel genauso schnell');
  });

  test('the animation measures the period like a stopwatch', async ({ page }) => {
    await page.clock.install();
    await page.goto('/physics-lab/');
    await open(page, 'pendulum');
    await page.locator('#pL').fill('0.5'); await page.locator('#pA').fill('40');
    await expect(page.locator('#pMeasured')).toHaveText('Gestoppt wird nach der ersten ganzen Schwingung.');
    await page.click('#pPlay');
    await expect(page.locator('#pPlay')).toHaveText('Anhalten');
    const T = pendulumT(0.5, 9.81, 40);
    await page.clock.runFor(Math.ceil(T * 1.9 * 1000));
    await expect(page.locator('#pMeasured')).toHaveText(`Gestoppt: links ${secs(T)} · rechts ${secs(T)}`);
    // leaving the experiment stops the motion
    await page.click('[data-overview]');
    await open(page, 'pendulum');
    await expect(page.locator('#pPlay')).toHaveText('Loslassen');
  });

  test('formulas show the cancelled mass', async ({ page }) => {
    await open(page, 'pendulum');
    await page.locator('#pL').fill('1');
    await page.click('#p-pendulum summary:has-text("Formeln")');
    const tex = (await page.locator('#pMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('\\cancel{m}\\cdot a=-\\cancel{m}\\cdot g\\cdot\\sin\\varphi\\;\\Rightarrow');
    expect(tex).toContain('=2\\pi\\sqrt{\\frac{1{,}00\\,\\text{m}}{9{,}81\\,\\text{m/s}^2}}\\approx 2{,}01\\,\\text{s}');
    await expect(page.locator('#pMath .fallback')).toHaveCount(0);
    await page.click('#p-pendulum summary:has-text("Warum")');
    await expect(page.locator('#pExplain .katex')).toHaveCount(4);
  });
});

test.describe('coupled pendulums', () => {
  test('beat period and the energy that moves over', async ({ page }) => {
    await page.clock.install();
    await page.goto('/physics-lab/');
    await open(page, 'coupled');
    await page.locator('#cL').fill('1'); await page.locator('#cQ').fill('10');
    const w1 = Math.sqrt(9.81), w2 = Math.sqrt(9.81 * 1.2), beat = 2 * Math.PI / (w2 - w1);
    await expect(pres(page, 'cRes', 'drüben')).toHaveText(secs(beat / 2));                  // 10,51 s
    await expect(pres(page, 'cRes', 'gleichsinnig')).toHaveText(secs(2 * Math.PI / w1));
    await expect(pres(page, 'cRes', 'gegensinnig')).toHaveText(secs(2 * Math.PI / w2));
    await expect(pres(page, 'cRes', 'Schwebung')).toHaveText(secs(beat));
    await expect(page.locator('#cE1Lbl')).toHaveText('Energie links: 100 %');
    await page.click('#cPlay');
    await page.clock.runFor(Math.round(beat / 2 * 1000));
    await page.click('#cPlay'); // pause
    await expect(page.locator('#cE1Lbl')).toHaveText(/Energie links: [01] %/);
    await expect(page.locator('#cE2Lbl')).toHaveText(/Energie rechts: (99|100) %/);
  });

  test('normal modes keep their energy', async ({ page }) => {
    await page.clock.install();
    await page.goto('/physics-lab/');
    await open(page, 'coupled');
    await page.click('#cStart button:has-text("Gleichsinnig")');
    await expect(pres(page, 'cRes', 'drüben')).toHaveText('nie');
    await page.click('#cPlay');
    await page.clock.runFor(7000);
    await expect(page.locator('#cE1Lbl')).toHaveText('Energie links: 50 %');
    await expect(page.locator('#cWhy')).toContainText('Feder wird nie gedehnt');
  });
});

// ---- projectile: reference (independent from mechanics.js: midpoint method, step 0.2 ms) ----
const BALL = { shot: [7.26, 0.12, 0.45], football: [0.43, 0.22, 0.25], tennis: [0.058, 0.067, 0.55], pingpong: [0.0027, 0.04, 0.45] };
function flight(ball, v, deg, air) {
  const [m, d, cw] = BALL[ball], c = air ? 1.2 * cw * Math.PI * d * d / 4 / 2 / m : 0, h = 0.0002, a = deg * Math.PI / 180;
  let x = 0, y = 0, u = v * Math.cos(a), w = v * Math.sin(a);
  const acc = (u, w) => { const s = Math.hypot(u, w); return [-c * s * u, -9.81 - c * s * w]; };
  for (;;) {
    const [au, aw] = acc(u, w), um = u + au * h / 2, wm = w + aw * h / 2, [bu, bw] = acc(um, wm);
    const nx = x + um * h, ny = y + wm * h;
    if (ny < 0) return x + (nx - x) * y / (y - ny);
    x = nx; y = ny; u += bu * h; w += bw * h;
  }
}
const bestAngle = (ball, v) => { let b = [0, 0]; for (let d = 20; d <= 50; d += 0.1) { const r = flight(ball, v, d, true); if (r > b[1]) b = [d, r]; } return b; };
const num = txt => Number(txt.replace(/[^\d,.-]/g, '').replace(',', '.'));

test.describe('projectile', () => {
  test('without air: 45° is best, 30° and 60° fly equally far', async ({ page }) => {
    await open(page, 'throw');
    if (await page.locator('#tAir').isChecked()) await page.locator('#tAir').uncheck();
    await page.locator('#tV').fill('20');
    for (const a of ['30', '60']) {
      await page.locator('#tA').fill(a);
      await expect(pres(page, 'tRes', 'Weite')).toHaveText(`${de(400 * Math.sin(Math.PI / 3) / 9.81, 1)} m`); // 35,3 m
    }
    await expect(pres(page, 'tRes', 'Bester Winkel')).toHaveText(`45,0° (${de(400 / 9.81, 1)} m)`);
    await expect(page.locator('#tWhy')).toContainText('45° ist am besten');
  });

  test('with air the best angle is lower – the more, the lighter the ball', async ({ page }) => {
    await open(page, 'throw');
    if (!await page.locator('#tAir').isChecked()) await page.locator('#tAir').check();
    await page.locator('#tV').fill('30'); await page.locator('#tA').fill('60');
    await page.click('#tBall button:has-text("Tennisball")');
    await expect.poll(async () => Math.abs(num(await pres(page, 'tRes', /^Weite$/).textContent()) - flight('tennis', 30, 60, true))).toBeLessThan(0.06);
    const best = {};
    for (const ball of ['shot', 'tennis', 'pingpong']) {
      await page.click(`#tBall button[data-v="${ball}"]`);
      const [ref, refRange] = bestAngle(ball, 30);
      // the values are drawn in the next frame: wait for the range of this ball
      await expect.poll(async () => Math.abs(num((await pres(page, 'tRes', 'Bester Winkel').textContent()).split('(')[1]) - refRange), ball).toBeLessThan(0.06);
      const shown = num((await pres(page, 'tRes', 'Bester Winkel').textContent()).split('°')[0]);
      expect(Math.abs(shown - ref), ball).toBeLessThanOrEqual(0.3);
      best[ball] = shown;
    }
    expect(best.pingpong).toBeLessThan(best.tennis);
    expect(best.tennis).toBeLessThan(best.shot);
    expect(best.shot).toBeLessThanOrEqual(45);
    await expect(page.locator('#tWhy')).toContainText('flacher geht weiter');
  });

  test('the ball flies in real time and lands', async ({ page }) => {
    await page.clock.install();
    await page.goto('/physics-lab/');
    await open(page, 'throw');
    await page.locator('#tV').fill('10'); await page.locator('#tA').fill('45');
    if (await page.locator('#tAir').isChecked()) await page.locator('#tAir').uncheck();
    await page.click('#tPlay');
    await expect(page.locator('#tPlay')).toHaveText('Anhalten');
    await page.clock.runFor(Math.ceil(2 * 10 * Math.SQRT1_2 / 9.81 * 1000) + 300); // flight time 1,44 s
    await expect(page.locator('#tPlay')).toHaveText('Werfen');
  });

  test('formulas with the values', async ({ page }) => {
    await open(page, 'throw');
    if (!await page.locator('#tAir').isChecked()) await page.locator('#tAir').check();
    await page.click('#tBall button[data-v="tennis"]');
    await page.locator('#tV').fill('20'); await page.locator('#tA').fill('45');
    await page.click('#p-throw summary:has-text("Formeln")');
    const tex = (await page.locator('#tMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('\\sin(90^\\circ)');
    expect(tex).toContain('\\approx 40{,}8\\,\\text{m}');
    const ratio = 1.2 * 0.55 * Math.PI * 0.067 ** 2 / 4 * 400 / 2 / (0.058 * 9.81);
    expect(tex).toContain(de(ratio, 2).replace(',', '{,}'));
    await expect(page.locator('#tMath .fallback')).toHaveCount(0);
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
  for (const kind of ['mirror', 'lens', 'waves', 'pendulum', 'coupled', 'throw']) {
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
