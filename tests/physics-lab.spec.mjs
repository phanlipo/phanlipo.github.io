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

// ---- refraction: reference ----
const snellRef = (n1, n2, a) => { const s = n1 * Math.sin(a * Math.PI / 180) / n2; return s > 1 ? null : Math.asin(s) * 180 / Math.PI; };

test.describe('refraction', () => {
  test('into water: bends towards the normal', async ({ page }) => {
    await open(page, 'refr');
    await page.click('#rMode button[data-v="ray"]');
    await page.click('#rMed button[data-v="water"]');
    await page.click('#rDir button[data-v="in"]');
    await page.locator('#rA').fill('40');
    await expect(pres(page, 'rRes', 'Brechungswinkel')).toHaveText(`${de(snellRef(1, 1.33, 40), 1)}°`); // 28,9°
    await expect(pres(page, 'rRes', 'Grenzwinkel')).toHaveText('keiner');
    // Fresnel at normal incidence: ((n-1)/(n+1))² = 2 %
    await page.locator('#rA').fill('0');
    await expect(pres(page, 'rRes', 'Gespiegelter Anteil')).toHaveText(`${Math.round(((0.33 / 2.33) ** 2) * 100)} %`);
    await expect(page.locator('#rWhy')).toContainText('ohne Knick');
    await expect(pres(page, 'rRes', 'Lichtgeschwindigkeit')).toHaveText(`${(Math.round(299792 / 1.33 / 1000) * 1000).toLocaleString('de-DE')} km/s`);
  });

  test('out of diamond: total internal reflection beyond the critical angle', async ({ page }) => {
    await open(page, 'refr');
    await page.click('#rMode button[data-v="ray"]');
    await page.click('#rMed button[data-v="diamond"]');
    await page.click('#rDir button[data-v="out"]');
    const crit = Math.asin(1 / 2.42) * 180 / Math.PI; // 24,4°
    await expect(pres(page, 'rRes', 'Grenzwinkel')).toHaveText(`${de(crit, 1)}°`);
    await page.locator('#rA').fill('20');
    await expect(pres(page, 'rRes', 'Brechungswinkel')).toHaveText(`${de(snellRef(2.42, 1, 20), 1)}°`);
    await page.locator('#rA').fill('25');
    await expect(pres(page, 'rRes', 'Brechungswinkel')).toHaveText('Totalreflexion');
    await expect(pres(page, 'rRes', 'Gespiegelter Anteil')).toHaveText('100 %');
    await expect(page.locator('#rWhy')).toContainText('Diamant');
  });

  test('stick: the tip seems lifted, about depth/n from above', async ({ page }) => {
    await open(page, 'refr');
    await page.click('#rMode button[data-v="stick"]');
    await page.click('#rMed button[data-v="water"]');
    await expect(page.locator('#rAField')).toBeHidden();
    await page.locator('#rT').fill('10'); await page.locator('#rE').fill('90');
    const d0 = 18 * Math.cos(10 * Math.PI / 180);
    await expect(pres(page, 'rRes', 'Spitze wirklich')).toHaveText(`${de(d0, 1)} cm tief`);
    // looking straight down: apparent depth ≈ d0 / n (the tip is 3 cm off-axis, so only roughly)
    await expect.poll(async () => Math.abs(num(await pres(page, 'rRes', 'scheint').textContent()) - d0 / 1.33)).toBeLessThan(0.4);
    const seen = num(await pres(page, 'rRes', 'scheint').textContent());
    // a flatter view lifts it more
    await page.locator('#rE').fill('20');
    await expect.poll(async () => num(await pres(page, 'rRes', 'scheint').textContent())).toBeLessThan(seen - 2);
    await expect(page.locator('#rWhy')).toContainText('flacher');
  });

  test('swiping across the drawing aims the ray', async ({ page }) => {
    await open(page, 'refr');
    await page.click('#rMode button[data-v="ray"]');
    await page.click('#rDir button[data-v="in"]');
    const svg = page.locator('#rSvg');
    await svg.scrollIntoViewIfNeeded();
    const b = await svg.boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    // a point 60 px left of and 60 px above the hit point: 45°
    await page.mouse.move(cx - 20, cy - 60);
    await page.mouse.down();
    await page.mouse.move(cx - 40, cy - 60, { steps: 3 });
    await page.mouse.move(cx - 60, cy - 60, { steps: 3 });
    await page.mouse.up();
    await expect(page.locator('#rA')).toHaveValue('45');
  });

  test('formulas with the values', async ({ page }) => {
    await open(page, 'refr');
    await page.click('#rMode button[data-v="ray"]');
    await page.click('#rMed button[data-v="glass"]');
    await page.click('#rDir button[data-v="out"]');
    await page.locator('#rA').fill('30');
    await page.click('#p-refr summary:has-text("Formeln")');
    const tex = (await page.locator('#rMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('\\sin\\beta=\\frac{1{,}50\\cdot\\sin 30^\\circ}{1{,}00}=0{,}750');
    expect(tex).toContain('\\alpha_G\\approx ' + de(Math.asin(1 / 1.5) * 180 / Math.PI, 1).replace(',', '{,}'));
    await expect(page.locator('#rMath .fallback')).toHaveCount(0);
    await page.click('#p-refr summary:has-text("Warum")');
    await expect(page.locator('#rExplain .katex')).toHaveCount(2);
  });
});

// ---- atomic physics: reference ----
const balmer = n => 1e9 / (1.0967758e7 * (1 / 4 - 1 / (n * n))); // nm (vacuum)

test.describe('radioactive decay', () => {
  test('about half is left after one half-life, within the random spread', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 18, 12, 0) }); // also fixes the random seed
    await page.goto('/physics-lab/');
    await open(page, 'decay');
    await page.click('#dN button[data-v="2500"]');
    await page.click('#dEx button[data-v="radon"]');
    await expect(pres(page, 'dRes', 'Noch vorhanden')).toHaveText('2.500');
    await expect(page.locator('#dWhy')).toContainText('50 %');
    await page.click('#dPlay');
    await page.clock.runFor(3000); // one half-life lasts 3 s
    await page.click('#dPlay');
    const k = num(await pres(page, 'dRes', /^Halbwertszeiten$/).textContent());
    const left = num((await pres(page, 'dRes', 'Noch vorhanden').textContent()).replace('.', ''));
    const exp = 2500 * 2 ** -k, sd = Math.sqrt(2500 * 2 ** -k * (1 - 2 ** -k));
    expect(k).toBeGreaterThan(0.95);
    expect(Math.abs(left - exp)).toBeLessThan(5 * sd); // 5 σ: practically never outside
    // k is shown rounded to 0,01: the expected count may differ by a few atoms from one calculated with it
    expect(Math.abs(num((await pres(page, 'dRes', 'Erwartet').textContent()).replace('.', '')) - exp)).toBeLessThan(5);
    await expect(pres(page, 'dRes', /^Halbwertszeit$/)).toHaveText('55,6 s');
    await expect(page.locator('#dWhy')).toContainText(`±${Math.round(sd)} Atome`);
    // the time runs in the unit of the substance
    await page.click('#dEx button[data-v="carbon"]');
    await expect(pres(page, 'dRes', 'Vergangene Zeit')).toHaveText(/^[\d.]+ Jahre$/);
    expect(Math.abs(num((await pres(page, 'dRes', 'Vergangene Zeit').textContent()).replace('.', '')) - k * 5730)).toBeLessThan(5730 * 0.006);
  });

  test('a run ends after 8 half-lives; a new random run starts at full count', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 18, 12, 0) });
    await page.goto('/physics-lab/');
    await open(page, 'decay');
    await page.click('#dN button[data-v="100"]');
    await page.click('#dPlay');
    await page.clock.runFor(26000);
    await expect(page.locator('#dPlay')).toHaveText('Start');
    await page.click('#dNew');
    await expect(pres(page, 'dRes', 'Noch vorhanden')).toHaveText('100');
    await page.click('#p-decay summary:has-text("Formeln")');
    await expect(page.locator('#dMath .katex')).toHaveCount(3);
    await expect(page.locator('#dMath .fallback')).toHaveCount(0);
  });
});

test.describe('spectral lines', () => {
  test('hydrogen: Balmer lines from the energy levels', async ({ page }) => {
    await open(page, 'spectrum');
    await page.click('#sEl button[data-v="hydrogen"]');
    for (const [n, colour] of [[3, 'rot'], [4, 'türkis'], [5, 'violett'], [6, 'violett']]) {
      await page.click(`#sJump button[data-v="${n}"]`);
      await expect(pres(page, 'sRes', 'Wellenlänge')).toHaveText(`${de(balmer(n), 1)} nm`);
      await expect(pres(page, 'sRes', 'Farbe')).toHaveText(colour);
      await expect(pres(page, 'sRes', 'Energie')).toHaveText(`${de(13.6057 * (1 / 4 - 1 / (n * n)), 2)} eV`);
    }
    await expect(page.locator('#sLevels .jump')).toHaveCount(1);
    await page.click('#p-spectrum summary:has-text("Formeln")');
    await expect(page.locator('#sMath .katex')).toHaveCount(4);
  });

  test('other elements show their own lines', async ({ page }) => {
    await open(page, 'spectrum');
    await page.click('#sEl button[data-v="sodium"]');
    await expect(page.locator('#sLevelsBox')).toBeHidden();
    await expect(pres(page, 'sRes', 'Sichtbare Linien')).toHaveText('589,0 · 589,6');
    await expect(page.locator('#sWhy')).toContainText('gelb');
    await page.click('#sEl button[data-v="helium"]');
    await expect(page.locator('#sWhy')).toContainText('1868');
    await expect(page.locator('#sBand')).toHaveAttribute('aria-label', /587,6/);
  });
});

// ---- magnetism, circuit, gas: reference ----
const QE = 1.602176634e-19, ME = 9.1093837e-31, MP = 1.67262192e-27;

test.describe('particle in a magnetic field', () => {
  test('radius and period of the circle; the period does not depend on the speed', async ({ page }) => {
    await open(page, 'lorentz');
    await page.click('#mgP button[data-v="electron"]');
    await page.locator('#mgV').fill('5'); await page.locator('#mgB').fill('5');
    await expect(page.locator('#mgVOut')).toHaveText('5,0 · 10⁶ m/s');
    const r = ME * 5e6 / (QE * 5e-3), T = 2 * Math.PI * ME / (QE * 5e-3);
    await expect(pres(page, 'mgRes', 'Radius')).toHaveText(`${de(r * 1000, 2)} mm`);   // 5,69 mm
    await expect(pres(page, 'mgRes', 'Umlauf')).toHaveText(`${de(T * 1e9, 1)} ns`);    // 7,1 ns
    await page.locator('#mgV').fill('10');
    await expect(pres(page, 'mgRes', 'Radius')).toHaveText(`${de(2 * r * 100, 1)} cm`);
    await expect(pres(page, 'mgRes', 'Umlauf')).toHaveText(`${de(T * 1e9, 1)} ns`);
    // a proton at the same speed: a much larger circle
    await page.click('#mgP button[data-v="proton"]');
    await expect(pres(page, 'mgRes', 'Radius')).toHaveText(`${de(MP * 1e7 / (QE * 5e-3), 2)} m`);
    await expect(page.locator('#mgWhy')).toContainText('viel schwerer');
  });

  test('electron and proton circle in opposite directions', async ({ page }) => {
    await open(page, 'lorentz');
    await page.click('#mgDir button[data-v="in"]');
    await page.click('#mgP button[data-v="proton"]');
    await expect(page.locator('#mgSvg')).toHaveAttribute('aria-label', /gegen den Uhrzeigersinn/);
    await page.click('#mgP button[data-v="electron"]');
    await expect(page.locator('#mgSvg')).toHaveAttribute('aria-label', /, im Uhrzeigersinn/);
    await page.click('#mgDir button[data-v="out"]');
    await expect(page.locator('#mgSvg')).toHaveAttribute('aria-label', /gegen den Uhrzeigersinn/);
    await page.click('#p-lorentz summary:has-text("Formeln")');
    await expect(page.locator('#mgMath .katex')).toHaveCount(3);
    await expect(page.locator('#mgMath .fallback')).toHaveCount(0);
  });
});

test.describe('circuit', () => {
  test('two equal bulbs in series get a quarter of the power, in parallel the full power', async ({ page }) => {
    await open(page, 'circuit');
    await page.locator('#ccU').fill('6'); await page.locator('#ccR1').fill('10');
    await page.click('#cKind button[data-v="one"]');
    await expect(pres(page, 'ccRes', 'Strom')).toHaveText('0,60 A');
    await expect(pres(page, 'ccRes', 'Lämpchen 1')).toHaveText('6,00 V · 0,60 A · 3,60 W');
    await page.click('#cKind button[data-v="series"]');
    await page.locator('#ccR2').fill('10');
    await expect(pres(page, 'ccRes', 'Strom')).toHaveText('0,30 A');
    await expect(pres(page, 'ccRes', 'Gesamtwiderstand')).toHaveText('20,0 Ω');
    await expect(pres(page, 'ccRes', 'Lämpchen 2')).toHaveText('3,00 V · 0,30 A · 0,90 W');
    await expect(pres(page, 'ccRes', 'Helligkeit')).toHaveText('25 % · 25 %');
    await page.click('#cKind button[data-v="parallel"]');
    await expect(pres(page, 'ccRes', 'Strom')).toHaveText('1,20 A');
    await expect(pres(page, 'ccRes', 'Gesamtwiderstand')).toHaveText('5,0 Ω');
    await expect(pres(page, 'ccRes', 'Helligkeit')).toHaveText('100 % · 100 %');
    await expect(page.locator('#ccSvg .flow')).toHaveCount(2);
  });

  test('in series the bulb with the larger resistance glows brighter', async ({ page }) => {
    await open(page, 'circuit');
    await page.click('#cKind button[data-v="series"]');
    await page.locator('#ccU').fill('12'); await page.locator('#ccR1').fill('10'); await page.locator('#ccR2').fill('30');
    const I = 12 / 40;
    await expect(pres(page, 'ccRes', 'Lämpchen 1')).toHaveText(`${de(I * 10, 2)} V · ${de(I, 2)} A · ${de(I * I * 10, 2)} W`);
    await expect(pres(page, 'ccRes', 'Lämpchen 2')).toHaveText(`${de(I * 30, 2)} V · ${de(I, 2)} A · ${de(I * I * 30, 2)} W`);
    await expect(page.locator('#ccWhy')).toContainText('mit dem größeren Widerstand heller');
    await page.click('#p-circuit summary:has-text("Formeln")');
    const tex = (await page.locator('#ccMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('R=R_1+R_2=10\\,\\Omega+30\\,\\Omega=40\\,\\Omega');
  });
});

test.describe('gas in a box', () => {
  test('the measured pressure follows the gas law', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 18, 12, 0) });
    await page.goto('/physics-lab/');
    await open(page, 'gas');
    await page.click('#gN button[data-v="200"]');
    await page.locator('#gT').fill('300'); await page.locator('#gV').fill('100');
    await expect(pres(page, 'gRes', 'Druck nach')).toHaveText('1,00‑fach');
    await expect(pres(page, 'gRes', 'Helium')).toHaveText(`${Math.round(Math.sqrt(8 * 1.380649e-23 * 300 / (Math.PI * 6.6464731e-27))).toLocaleString('de-DE')} m/s`);
    await page.click('#gPlay');
    await page.clock.runFor(4000);
    const fach = async () => parseFloat((await pres(page, 'gRes', 'Druck gemessen').textContent()).replace(',', '.')); // "1,02-fach"
    let pm = await fach();
    expect(Math.abs(pm - 1)).toBeLessThan(0.15);
    // twice the temperature, half the volume: four times the pressure
    await page.locator('#gT').fill('600'); await page.locator('#gV').fill('50');
    await expect(pres(page, 'gRes', 'Druck nach')).toHaveText('4,00‑fach');
    await page.clock.runFor(4000);
    pm = await fach();
    expect(Math.abs(pm - 4) / 4).toBeLessThan(0.15);
    await expect(page.locator('#gWhy')).toContainText('1,41-mal so schnell');
    await page.click('#gPlay');
    await page.click('#p-gas summary:has-text("Formeln")');
    await expect(page.locator('#gMath .katex')).toHaveCount(4);
    await expect(page.locator('#gMath .fallback')).toHaveCount(0);
  });
});

// ---- prism, raindrop, field lines, divider ----
const nGlassRef = l => 1.5046 + 4200 / (l * l), nWaterRef = l => 1.3240 + 3046 / (l * l);
// rainbow angle (Descartes): θ = 4β − 2α at its maximum, cos²α = (n² − 1)/3
const rainbowRef = n => { const a = Math.acos(Math.sqrt((n * n - 1) / 3)), b = Math.asin(Math.sin(a) / n); return (4 * b - 2 * a) * 180 / Math.PI; };
// minimum deviation of a 60° prism at symmetric passage: D = 2·asin(n·sin 30°) − 60°
const minDevRef = n => 2 * Math.asin(n * 0.5) * 180 / Math.PI - 60;

test.describe('prism and raindrop', () => {
  test('prism: violet is bent more than red', async ({ page }) => {
    await open(page, 'refr');
    await page.click('#rMode button[data-v="prism"]');
    await expect(page.locator('#rMed')).toBeHidden();
    // symmetric passage (minimum deviation) for red: angle of incidence = (D_min + 60°)/2
    const nr = nGlassRef(680), inc = Math.round((minDevRef(nr) + 60) / 2); // 49°
    await page.locator('#rX').fill(String(inc));
    const devR = num(await pres(page, 'rRes', 'Ablenkung Rot').textContent());
    expect(Math.abs(devR - minDevRef(nr))).toBeLessThan(0.1);
    const devV = num(await pres(page, 'rRes', 'Ablenkung Violett').textContent());
    expect(devV).toBeGreaterThan(devR + 1);
    await expect(pres(page, 'rRes', 'Brechzahl')).toHaveText(`${de(nr, 4)} / ${de(nGlassRef(410), 4)}`);
    await expect(page.locator('#rWhy')).toContainText('Violett');
    await expect(page.locator('#rRainBox')).toBeVisible();
    await expect(page.locator('#rExplainBox')).toBeHidden();
  });

  test('raindrop: the rainbow at about 42° (red) and 41° (violet)', async ({ page }) => {
    await open(page, 'refr');
    await page.click('#rMode button[data-v="drop"]');
    await expect(page.locator('#rChartBox')).toBeVisible();
    await expect(pres(page, 'rRes', 'Regenbogen')).toHaveText(`${de(rainbowRef(nWaterRef(680)), 1)}° / ${de(rainbowRef(nWaterRef(410)), 1)}°`);
    // at half height: θ = 4β − 2α
    await page.locator('#rX').fill('50');
    const th = (4 * Math.asin(0.5 / nWaterRef(680)) - 2 * Math.asin(0.5)) * 180 / Math.PI;
    await expect(pres(page, 'rRes', 'Rückkehrwinkel Rot')).toHaveText(`${de(th, 1)}°`);
    await page.click('#p-refr summary:has-text("Regenbogen")');
    await expect(page.locator('#rRain .katex')).toHaveCount(3);
  });
});

test.describe('magnetic field lines', () => {
  test('one magnet, attracting and repelling pairs', async ({ page }) => {
    await open(page, 'lorentz');
    await page.click('#mgMode button[data-v="field"]');
    await expect(page.locator('#mgPart')).toBeHidden();
    await expect(page.locator('#mgField .fline')).toHaveCount(14);
    await page.click('#mgCfg button[data-v="attract"]');
    await expect(page.locator('#mgField .fline')).toHaveCount(28);
    await expect(page.locator('#mgFWhy')).toContainText('ziehen sich an');
    await page.click('#mgCfg button[data-v="repel"]');
    await expect(page.locator('#mgFWhy')).toContainText('stoßen sich ab');
    await expect(page.locator('#mgField .mlbl', { hasText: 'N' })).toHaveCount(2);
    // the field model: between N and S the field points from N to S, between two N it vanishes in the middle
    const r = await page.evaluate(() => {
      const E = window.Electro;
      return { att: E.field(E.poles('attract'), 0, 0), rep: E.field(E.poles('repel'), 0, 0) };
    });
    expect(r.att[0]).toBeGreaterThan(0);
    expect(Math.hypot(...r.rep)).toBeLessThan(1e-9);
    await page.click('#mgMode button[data-v="particle"]');
    await expect(page.locator('#mgPart')).toBeVisible();
  });

  test('the Earth: tilted dipole, field lines from south to north, geodynamo explained', async ({ page }) => {
    await open(page, 'lorentz');
    await page.click('#mgMode button[data-v="field"]');
    await page.click('#mgCfg button[data-v="earth"]');
    // 14 lines from the southern hemisphere; the 6 that leave the picture also come back in near the North Pole
    await expect(page.locator('#mgField .fline')).toHaveCount(20);
    await expect(page.locator('#mgField .core')).toHaveCount(1);
    await expect(page.locator('#mgFWhy')).toContainText('Südpol (lila) nahe dem geografischen Nordpol');
    const r = await page.evaluate(() => {
      const E = window.Electro, R = E.EARTH.R, tilt = E.EARTH.tilt;
      // along the magnetic equator (perpendicular to the tilted axis) the field points towards the north;
      // at the magnetic poles it is twice as strong and points out of (south) or into (north) the Earth
      const eq = E.earthField(R * Math.cos(tilt), -R * Math.sin(tilt));
      const north = E.earthField(R * Math.sin(tilt), R * Math.cos(tilt)), south = E.earthField(-R * Math.sin(tilt), -R * Math.cos(tilt));
      const lines = E.earthLines();
      const R2 = R * R, onSurface = p => Math.abs(p[0] * p[0] + p[1] * p[1] - R2) < 1e-9;
      return { eq, north, south, tilt, starts: lines.filter(l => onSurface(l[0])).map(l => l[0][1]),
        backEnds: lines.filter(l => !onSurface(l[0])).map(l => l[l.length - 1][1]), ends: lines.map(l => Math.hypot(...l[l.length - 1])) };
    });
    expect(r.tilt * 180 / Math.PI).toBeCloseTo(10, 6);
    // equator: B = −m/r³ with m = −(sin τ, cos τ), so B ∥ (sin τ, cos τ), |B| = 1/R³
    expect(r.eq[1]).toBeGreaterThan(0);
    expect(Math.atan2(r.eq[0], r.eq[1])).toBeCloseTo(r.tilt, 6);
    expect(Math.hypot(...r.north) / Math.hypot(...r.eq)).toBeCloseTo(2, 6);
    expect(r.north[1]).toBeLessThan(0);           // enters the Earth near the geographic North Pole
    expect(r.south[1]).toBeLessThan(0);           // leaves it near the South Pole (pointing away, downwards)
    expect(r.starts.length).toBe(14);
    expect(r.starts.every(y => y < 0)).toBe(true); // lines start in the southern hemisphere …
    expect(r.backEnds.length).toBe(6);
    expect(r.backEnds.every(y => y > 0)).toBe(true); // … or come in from outside and end in the northern one
    // lines that stay inside the picture end again on the Earth's surface (northern hemisphere)
    expect(r.ends.filter(d => d < 1.7).length).toBeGreaterThanOrEqual(6);
    await page.click('#mgEBox summary');
    await expect(page.locator('#mgEExplain p')).toHaveCount(5);
    await expect(page.locator('#mgEExplain')).toContainText('Curie-Temperatur');
    await expect(page.locator('#mgEExplain')).toContainText('Geodynamo');
  });
});

test.describe('gas meter labels on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } });
  test('the labels above the pressure bars stay on one line', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 10, 18, 12, 0) });
    await page.goto('/physics-lab/');
    await open(page, 'gas');
    await page.locator('#gT').fill('150');
    await page.click('#gPlay');
    await page.clock.runFor(3000);
    await expect(page.locator('#gPLbl')).toContainText('Gemessen');
    // one line: the label is not taller than its line height, and "‑fach" never breaks from the number
    for (const id of ['gPLbl', 'gPthLbl']) {
      const r = await page.locator('#' + id).evaluate(el => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) || 20 }));
      expect(r.h, id).toBeLessThanOrEqual(r.lh + 1);
    }
    await expect(page.locator('#gPthLbl')).toHaveText('Gasgesetz: 0,50‑fach');
  });
});

test.describe('voltage divider', () => {
  test('the output follows the ratio of the resistors', async ({ page }) => {
    await open(page, 'circuit');
    await page.click('#cKind button[data-v="divider"]');
    await expect(page.locator('#ccR1Lbl')).toHaveText('Widerstand R₁');
    await page.locator('#ccU').fill('9'); await page.locator('#ccR1').fill('20'); await page.locator('#ccR2').fill('10');
    await expect(pres(page, 'ccRes', 'Spannung an R₂')).toHaveText(`${de(9 * 10 / 30, 2)} V`);
    await expect(pres(page, 'ccRes', 'Anteil')).toHaveText('33 %');
    await expect(page.locator('#ccSvg .res')).toHaveCount(2);
    await expect(page.locator('#ccWhy')).toContainText('Lautstärkeregler');
    await page.click('#p-circuit summary:has-text("Formeln")');
    const tex = (await page.locator('#ccMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('U_2=U\\cdot\\frac{R_2}{R_1+R_2}');
  });
});

test.describe('floating', () => {
  // reference: 10 kg iron (7870 kg/m³), sheet 1 mm → area V/s; open tray a² + 4aH = area; floats if M/(ρ a²) ≤ H
  const V = 10 / 7870, AREA = V / 0.001, g = 9.81;
  const side = H => (-4 * H + Math.sqrt(16 * H * H + 4 * AREA)) / 2;

  test('a lump of iron sinks in water but floats on mercury', async ({ page }) => {
    await open(page, 'float');
    await page.click('#flShape button[data-v="lump"]');
    await page.click('#flLiq button[data-v="fresh"]');
    await page.locator('#flL').fill('0');
    await expect(pres(page, 'flRes', 'Ergebnis')).toHaveText('sinkt');
    await expect(pres(page, 'flRes', 'Gewicht / Auftrieb')).toHaveText(`${de(10 * g, 0)} N / ${de(1000 * g * V, 0)} N`); // 98 N / 12 N
    await expect(pres(page, 'flRes', 'Größe')).toHaveText(`Würfel ${de(Math.cbrt(V) * 100, 1)} cm`);
    await expect(page.locator('#flHField')).toBeHidden();
    await page.click('#flLiq button[data-v="mercury"]');
    await expect(pres(page, 'flRes', 'Ergebnis')).toHaveText('schwimmt');
    await expect(pres(page, 'flRes', 'Eintauchtiefe')).toHaveText(`${de(10 / (13534 * Math.cbrt(V) ** 2) * 100, 1)} cm`); // 6,3 cm
  });

  test('the same iron as a tray floats and carries a load until the water reaches the rim', async ({ page }) => {
    await open(page, 'float');
    await page.click('#flShape button[data-v="hull"]');
    await page.click('#flLiq button[data-v="fresh"]');
    await page.locator('#flH').fill('10');
    await page.locator('#flL').fill('20');
    const a = side(0.1), d = 30 / (1000 * a * a), max = 1000 * a * a * 0.1 - 10;
    await expect(pres(page, 'flRes', 'Ergebnis')).toHaveText('schwimmt');
    await expect(pres(page, 'flRes', 'Eintauchtiefe')).toHaveText(`${de(d * 100, 1)} cm`);               // 3,4 cm
    await expect(pres(page, 'flRes', 'Verdrängte')).toHaveText(`${de(30, 2)} L = ${de(30, 2)} kg`);
    await expect(pres(page, 'flRes', 'Höchste Ladung')).toHaveText(`${de(max, 1)} kg`);                // 79,3 kg
    await expect(pres(page, 'flRes', 'Größe')).toHaveText(`${de(a * 100, 1)} × ${de(a * 100, 1)} cm, 10 cm hoch`);
    await expect(page.locator('#flWhy')).toContainText('Luft');
    await page.locator('#flL').fill(String(Math.ceil(max)));
    await expect(pres(page, 'flRes', 'Ergebnis')).toHaveText('sinkt');
    await expect(pres(page, 'flRes', 'Eintauchtiefe')).toHaveText('läuft voll');
    await page.locator('#flL').fill(String(Math.floor(max)));
    await expect(pres(page, 'flRes', 'Ergebnis')).toHaveText('schwimmt');
    // a flat plate without rim sinks
    await page.locator('#flH').fill('0');
    await expect(pres(page, 'flRes', 'Ergebnis')).toHaveText('sinkt');
    await expect(page.locator('#flWhy')).toContainText('ohne Rand');
    await page.reload();
    await expect(page.locator('#p-float')).toBeVisible();
    await expect(page.locator('#flH')).toHaveValue('0');
    await expect(page.locator('#flL')).toHaveValue(String(Math.floor(max)));
  });
});

test.describe('rainbow', () => {
  // reference: largest angle after one reflection, cos²α = (n² − 1)/3, θ = 4β − 2α; water after Cauchy
  const D = Math.PI / 180;
  const n = l => 1.3240 + 3046 / (l * l);
  const theta = (l, k = 1) => {
    const m = n(l), a = Math.acos(Math.sqrt((m * m - 1) / (k * (k + 2)))), b = Math.asin(Math.sin(a) / m);
    return (k === 1 ? 4 * b - 2 * a : Math.PI + 2 * a - 6 * b) / D;
  };
  // a circle of radius θ around a point h below the horizon: the part with cos ψ > tan h / tan θ is above it
  const visible = (th, h) => Math.acos(Math.tan(h * D) / Math.tan(th * D)) / Math.PI;

  test('the bow is a circle of 42° around the point opposite the sun; the ground hides the rest', async ({ page }) => {
    await open(page, 'bow');
    await page.uncheck('#bwPlane');
    await page.locator('#bwH').fill('20');
    const r = theta(680), v = theta(410);
    await expect(pres(page, 'bwRes', 'Radius')).toHaveText(`rot ${de(r, 1)}°, violett ${de(v, 1)}°`); // 42,4° / 40,8°
    await expect(pres(page, 'bwRes', 'Höchster Punkt')).toHaveText(`${de(r - 20, 1)}° über dem Horizont`);
    await expect(pres(page, 'bwRes', 'Sichtbar')).toHaveText(`${de(Math.round(visible(r, 20) * 100), 0)} %`); // 37 %
    await expect(page.locator('#bwWhy')).toContainText('Kegel');
    // every point of the drawn red circle is 42,4° from the opposite point
    const pts = await page.evaluate(() => window.Rainbow.circle(window.Rainbow.radius(680), 20, 24));
    for (const [az, el] of pts) {
      const P = [Math.cos(el * D) * Math.cos(az * D), Math.cos(el * D) * Math.sin(az * D), Math.sin(el * D)];
      const A = [Math.cos(20 * D), 0, -Math.sin(20 * D)];
      expect(Math.acos(P[0] * A[0] + P[1] * A[1] + P[2] * A[2]) / D).toBeCloseTo(r, 6);
    }
  });

  test('sunset gives a semicircle, a high sun none, an aircraft the full circle', async ({ page }) => {
    await open(page, 'bow');
    await page.uncheck('#bwPlane');
    await page.locator('#bwH').fill('0');
    await expect(pres(page, 'bwRes', 'Sichtbar')).toHaveText('50 %');
    await page.locator('#bwH').fill('45');
    await expect(pres(page, 'bwRes', 'Höchster Punkt')).toHaveText('unter dem Horizont – kein Bogen');
    await expect(pres(page, 'bwRes', 'Sichtbar')).toHaveText('0 %');
    await expect(page.locator('#bwWhy')).toContainText('Mittagszeit');
    await page.check('#bwPlane');
    await expect(pres(page, 'bwRes', 'Sichtbar')).toHaveText('100 %');
    await expect(page.locator('#bwWhy')).toContainText('vollen Kreis');
    await page.check('#bwSecond');
    await expect(pres(page, 'bwRes', 'Nebenbogen')).toHaveText(`rot ${de(theta(680, 2), 1)}°, violett ${de(theta(410, 2), 1)}°`); // 50,3° / 53,3°
    await page.reload();
    await expect(page.locator('#p-bow')).toBeVisible();
    await expect(page.locator('#bwPlane')).toBeChecked();
    await expect(page.locator('#bwH')).toHaveValue('45');
  });
});

test.describe('blue sky', () => {
  // reference: Rayleigh optical depth (Hansen & Travis 1974, λ in µm) and air mass (Kasten & Young 1989)
  const tau = nm => { const l = nm / 1000; return 0.008569 * l ** -4 * (1 + 0.0113 * l ** -2 + 0.00013 * l ** -4); };
  const airMass = h => 1 / (Math.sin(h * Math.PI / 180) + 0.50572 * (h + 6.07995) ** -1.6364);
  // colour of the canvas pixel at a share of width and height
  const pixel = (page, fx, fy) => page.evaluate(([x, y]) => {
    const c = document.getElementById('skCanvas');
    return [...c.getContext('2d').getImageData(Math.floor(c.width * x), Math.floor(c.height * y), 1, 1).data].slice(0, 3);
  }, [fx, fy]);

  test('noon: blue sky, little blue lost on the way down', async ({ page }) => {
    await open(page, 'sky');
    await page.click('#skMode button[data-v="air"]');
    await page.locator('#skH').fill('90');
    await expect(pres(page, 'skRes', 'Blau (450 nm)')).toHaveText(`${de((700 / 450) ** 4, 1)}-mal so stark wie Rot (700 nm)`); // 5,9
    await expect(pres(page, 'skRes', 'Weg des Sonnenlichts')).toHaveText(`${de(airMass(90), 1)}-mal so lang wie bei Sonne senkrecht`);
    await expect(pres(page, 'skRes', 'blauen Licht')).toHaveText(`${de(Math.exp(-tau(450) * airMass(90)) * 100, 0)} %`); // 80 %
    await expect(pres(page, 'skRes', 'roten Licht')).toHaveText(`${de(Math.exp(-tau(700) * airMass(90)) * 100, 0)} %`);  // 96 %
    await expect(pres(page, 'skRes', 'Himmel oben')).toContainText('blau');
    const [r, , b] = await pixel(page, 0.1, 0.05);
    expect(b).toBeGreaterThan(r + 60);
    await expect(page.locator('#skWhy')).toContainText('6-mal');
  });

  test('sunset: the blue is scattered out on the long way, the sun turns orange', async ({ page }) => {
    await open(page, 'sky');
    await page.click('#skMode button[data-v="air"]');
    await page.locator('#skH').fill('0');
    const m = airMass(0); // ≈ 37,9
    await expect(pres(page, 'skRes', 'Weg des Sonnenlichts')).toHaveText(`${de(m, 1)}-mal so lang wie bei Sonne senkrecht`);
    await expect(pres(page, 'skRes', 'blauen Licht')).toHaveText(`${de(Math.exp(-tau(450) * m) * 100, 3)} %`); // 0,023 %
    await expect(pres(page, 'skRes', 'roten Licht')).toHaveText(`${de(Math.exp(-tau(700) * m) * 100, 0)} %`);  // 25 %
    await expect(pres(page, 'skRes', /^Sonne$/)).toContainText(/orange|rot/);
    await expect(page.locator('#skWhy')).toContainText('Abendrot');
    // at the horizon next to the sun red outweighs blue
    const [r, , b] = await pixel(page, 0.5, 0.85);
    expect(r).toBeGreaterThan(b + 60);
    await page.click('#p-sky summary:has-text("Formeln")');
    const tex = (await page.locator('#skMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('\\tau_{450}=' + de(tau(450), 3).replace(',', '{,}'));
  });

  test('droplets scatter all colours alike, without air the sky is black', async ({ page }) => {
    await open(page, 'sky');
    await page.locator('#skH').fill('45');
    await page.click('#skMode button[data-v="drops"]');
    await expect(pres(page, 'skRes', 'Blau (450 nm)')).toHaveText('gleich stark wie Rot');
    await expect(page.locator('#skWhy')).toContainText('Wolken weiß');
    const [r, g, b] = await pixel(page, 0.1, 0.05);
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(40);
    await page.click('#skMode button[data-v="none"]');
    await expect(pres(page, 'skRes', 'Himmel oben')).toContainText('schwarz');
    expect(Math.max(...await pixel(page, 0.1, 0.05))).toBeLessThan(10);
    await page.reload();
    await expect(page.locator('#skMode button[data-v="none"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#skH')).toHaveValue('45');
  });
});

test.describe('wing and lift', () => {
  // first number in the text, with its sign (“-4,6°”, “1,05-fach”)
  const num = async loc => { const m = (await loc.textContent()).match(/([−-]?)(\d+(?:,\d+)?)/); return Number((m[1] ? '-' : '') + m[2].replace(',', '.')); };
  const D = Math.PI / 180;

  test('flat plate: C_L = 2π·sin α, and above the stall angle the flow separates', async ({ page }) => {
    await open(page, 'wing');
    await page.click('#wgPresets button:has-text("Flache Platte")');
    await page.locator('#wgA').fill('5');
    await expect(pres(page, 'wgRes', 'Auftriebsbeiwert')).toHaveText(de(2 * Math.PI * Math.sin(5 * D), 2)); // 0,55
    expect(await num(pres(page, 'wgRes', 'Kein Auftrieb'))).toBe(0);
    await expect(page.locator('#wgSvg .wake')).toHaveCount(0);
    await page.locator('#wgA').fill('12');
    await expect(page.locator('#wgSvg .wake')).toHaveCount(1);
    await expect(page.locator('#wgWhy')).toContainText('Zu steil');
    expect(await num(pres(page, 'wgRes', 'Auftriebsbeiwert'))).toBeLessThan(2 * Math.PI * Math.sin(12 * D));
  });

  test('thickness and camber: lift slope and angle without lift as in profile theory', async ({ page }) => {
    await open(page, 'wing');
    await page.click('#wgPresets button:has-text("Symmetrisch")');
    await page.locator('#wgA').fill('0');
    await expect(pres(page, 'wgRes', 'Auftriebsbeiwert')).toHaveText('0,00');
    await expect(page.locator('#wgWhy')).toContainText('keinen Auftrieb');
    await page.locator('#wgA').fill('5');
    // Joukowski profiles: lift slope 2π·(1 + 0,77·t/c) per radian
    expect(await num(pres(page, 'wgRes', 'Auftriebsbeiwert'))).toBeCloseTo(2 * Math.PI * (1 + 0.77 * 0.12) * Math.sin(5 * D), 1);
    // air on top is faster than the oncoming air
    expect(await num(pres(page, 'wgRes', 'Tempo der Luft oben'))).toBeGreaterThan(1);
    await page.click('#wgPresets button:has-text("Gewölbt")');
    // thin profile theory, circular-arc camber line: α₀ = −2·f/c (radians)
    expect(await num(pres(page, 'wgRes', 'Kein Auftrieb'))).toBeCloseTo(-2 * 0.04 / D, 0);
    await expect(page.locator('#wgWhy')).toContainText('Wölbung');
    await page.click('#p-wing #wgFlowBox summary:has-text("Formeln")');
    await expect(page.locator('#wgMath .katex').first()).toBeVisible();
    await expect(page.locator('#wgMath .fallback')).toHaveCount(0);
  });

  test('Start lets the air parcels flow', async ({ page }) => {
    await open(page, 'wing');
    const first = page.locator('#wgSvg .parcel').first();
    const x0 = await first.getAttribute('cx');
    await page.click('#wgPlay');
    await expect(page.locator('#wgPlay')).toContainText('Anhalten');
    await expect.poll(() => first.getAttribute('cx')).not.toBe(x0);
    await page.click('#wgPlay');
    await expect(page.locator('#wgPlay')).toContainText('Start');
  });

  test('take-off: needed angle of attack and minimum speed of a light aircraft', async ({ page }) => {
    await open(page, 'wing');
    await page.click('#wgMode button[data-v="takeoff"]');
    await page.click('#wgPlane button[data-v="small"]');
    await page.locator('#wgV').fill('200');
    const m = 1100, A = 16.2, rho = 1.225, g = 9.81, v = 200 / 3.6, AR = 7.4;
    const cl = 2 * m * g / (rho * v * v * A), a = 2 * Math.PI * AR / (AR + 2), alpha = -2 + cl / a / D;
    const vmin = Math.sqrt(2 * m * g / (rho * A * 1.6)) * 3.6;
    await expect(pres(page, 'wgTRes', 'Nötiger Anstellwinkel')).toHaveText(`${de(alpha, 1)}°`);      // 2,1°
    await expect(pres(page, 'wgTRes', 'Nötiger Auftriebsbeiwert')).toHaveText(`${de(cl, 2)} / 1,6`); // 0,35
    await expect(pres(page, 'wgTRes', 'Mindest')).toHaveText(`${de(vmin, 0)} km/h`);                 // 94
    await page.locator('#wgV').fill('80');
    await expect(pres(page, 'wgTRes', 'Nötiger Anstellwinkel')).toHaveText('zu langsam');
    await expect(page.locator('#wgTWhy')).toContainText('mindestens');
  });

  test('the wing settings survive a reload', async ({ page }) => {
    await open(page, 'wing');
    await page.locator('#wgA').fill('8.5');
    await page.locator('#wgF').fill('2.5');
    await page.reload();
    await expect(page.locator('#p-wing')).toBeVisible();
    await expect(page.locator('#wgA')).toHaveValue('8.5');
    await expect(page.locator('#wgF')).toHaveValue('2.5');
  });
});

test.describe('radar and stealth', () => {
  // reference: front view as in physics-lab/README.md; an echo is a ray that leaves within ±5° of the radar
  const TOL = 5 * Math.PI / 180;
  const num = async loc => Number((await loc.textContent()).replace(/[^\d,]/g, '').replace(',', '.'));

  test('from the side the upright fin reflects straight back, the stealth shape sends nothing back', async ({ page }) => {
    await open(page, 'radar');
    await page.click('#raShape button[data-v="plain"]');
    await page.locator('#raB').fill('0');
    await expect(page.locator('#raBOut')).toHaveText('genau von der Seite');
    // hit: from the engines (y = −1.8) up to the top of the fin (y = 4); back: fin 3 m, pylon 0.5 m, plus the spots
    // of fuselage (r = 1) and engine (r = 0.5) whose normal is within ±2.5° of the radar
    const glint = r => 2 * r * Math.sin(TOL / 2);
    const share = (3 + 0.5 + glint(1) + glint(0.5)) / (4 + 1.8) * 100; // 62,6 %
    await expect(pres(page, 'raRes', 'Echo zurück')).toContainText('%');
    expect(await num(pres(page, 'raRes', 'Echo zurück'))).toBeCloseTo(share, 0);
    expect(await num(pres(page, 'raRes', 'Tarnkappe hier'))).toBe(0);
    // the coating leaves a tenth per reflection
    await page.check('#raCoat');
    expect(await num(pres(page, 'raRes', 'Echo zurück'))).toBeCloseTo(share / 10, 0);
    await expect(page.locator('#raWhy')).toContainText('90 %');
    await page.uncheck('#raCoat');
    await page.click('#raShape button[data-v="stealth"]');
    await expect(pres(page, 'raRes', 'Echo zurück')).toHaveText('0,0 %');
    await expect(page.locator('#raWhy')).toContainText('schräg');
    await expect(page.locator('#raSvg .rback')).toHaveCount(0);
  });

  test('from above the corner between wing and fin works like a bicycle reflector', async ({ page }) => {
    await open(page, 'radar');
    await page.click('#raShape button[data-v="plain"]');
    await page.locator('#raB').fill('30');
    await expect(page.locator('#raBOut')).toHaveText('30° von oben');
    expect(await num(pres(page, 'raRes', 'über Ecken'))).toBeGreaterThan(await num(pres(page, 'raRes', 'einmal gespiegelt')));
    await expect(page.locator('#raWhy')).toContainText('Katzenauge');
    await expect(page.locator('#raSvg .rback').first()).toBeVisible();
    // a ray hitting the wing (y = −0.3) and then the fin (x = 0) runs back exactly the way it came
    const r = await page.evaluate(() => window.Radar.ray('plain', 30, -2));
    expect(r.bounces).toBe(2);
    expect(r.pts[1][1]).toBeCloseTo(-0.3, 9);
    expect(r.pts[2][0]).toBeCloseTo(0, 9);
    expect(r.dir[0]).toBeCloseTo(Math.cos(Math.PI / 6), 9);
    expect(r.dir[1]).toBeCloseTo(Math.sin(Math.PI / 6), 9);
    await page.click('#raShape button[data-v="stealth"]');
    await expect(pres(page, 'raRes', 'Echo zurück')).toHaveText('0,0 %');
  });

  test('range: a 10 000 times smaller echo is seen at a tenth of the distance', async ({ page }) => {
    await open(page, 'radar');
    await page.click('#raMode button[data-v="range"]');
    await expect(page.locator('#raShapeBox')).toBeHidden();
    const range = sigma => 150 * sigma ** 0.25;
    await page.click('#raObj button[data-v="jet"]');
    await page.locator('#raR').fill('100');
    await expect(pres(page, 'raRRes', 'Reichweite des Radars')).toHaveText(`${de(range(10), 0)} km`); // 267
    await expect(pres(page, 'raRRes', 'In 100 km')).toHaveText('erkannt');
    await page.click('#raObj button[data-v="stealth"]');
    await expect(pres(page, 'raRRes', 'Reichweite des Radars')).toHaveText(`${de(range(0.001), 0)} km`); // 27
    await expect(pres(page, 'raRRes', 'In 100 km')).toHaveText('nicht erkannt');
    await expect(pres(page, 'raRRes', 'gegenüber Kampfjet')).toHaveText('0,10-fach');
    await expect(pres(page, 'raRRes', 'Schwelle')).toHaveText('5,1 · 10⁻³-fach'); // 0,001 · (150/100)⁴
    await page.locator('#raR').fill('25');
    await expect(pres(page, 'raRRes', 'In 25 km')).toHaveText('erkannt');
    await page.click('#p-radar #raRangeBox summary:has-text("Formeln")');
    const tex = (await page.locator('#raRMath annotation').allTextContents()).join(' ');
    expect(tex).toContain('\\sqrt[4]{0{,}001}');
  });

  test('the radar settings survive a reload', async ({ page }) => {
    await open(page, 'radar');
    await page.click('#raShape button[data-v="stealth"]');
    await page.locator('#raB').fill('-25');
    await page.check('#raCoat');
    await page.reload();
    await expect(page.locator('#p-radar')).toBeVisible();
    await expect(page.locator('#raShape button[data-v="stealth"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#raB')).toHaveValue('-25');
    await expect(page.locator('#raBOut')).toHaveText('25° von unten');
    await expect(page.locator('#raCoat')).toBeChecked();
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

// one test per experiment: all of them in one test do not fit into the time limit on CI
for (const kind of ['mirror', 'lens', 'refr', 'waves', 'pendulum', 'coupled', 'throw', 'decay', 'spectrum', 'lorentz', 'circuit', 'gas', 'radar', 'wing', 'sky', 'bow', 'float']) {
  test(`${kind}: open with formulas, no accessibility violations`, async ({ page }) => {
    await open(page, kind);
    for (const s of await page.locator(`${panel(kind)} details.sub:visible > summary`).all()) await s.click();
    await expect(page.locator(`${panel(kind)} .katex`).first()).toBeVisible();
    expect((await axe(page).include(panel(kind)).analyze()).violations).toEqual([]);
  });
}

test('the extra views have no accessibility violations', async ({ page }) => {
  for (const [kind, sel] of [['refr', '#rMode button[data-v="prism"]'], ['refr', '#rMode button[data-v="drop"]'], ['lorentz', '#mgMode button[data-v="field"]'], ['circuit', '#cKind button[data-v="divider"]'], ['radar', '#raMode button[data-v="range"]'], ['wing', '#wgMode button[data-v="takeoff"]']]) {
    await open(page, kind);
    await page.click(sel);
    // open every closed section (the list shrinks with each click)
    const closed = page.locator(`${panel(kind)} details.sub:visible:not([open]) > summary`);
    while (await closed.count()) await closed.first().click();
    expect((await axe(page).include(panel(kind)).analyze()).violations, sel).toEqual([]);
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
