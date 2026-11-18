// Quantenmagnetismus: lattice geometry (neighbours recomputed from positions and periodic images), Metropolis
// against exact enumeration and Onsager, ground states and frustration, the quantum ring against the free-fermion
// solution, Hellmann–Feynman and a dense diagonalisation done here; page: settings, painting spins, temperature
// scan, swinging field, quantum view, examples, English. WebMCP in webmcp.spec.mjs.
import { test, expect, switchLang } from './helpers.mjs';

const LS = 'quantum-magnetism.settings.v1';
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
const de = (v, d) => v.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

// Quantum Ising ring −J Σ σᶻσᶻ − Γ Σ σˣ at h = 0: ground state energy from the free-fermion solution (Pfeuty 1970),
// even-parity sector with antiperiodic momenta k = (2n+1)π/N
const tfimE0 = (N, J, g) => {
  let e = 0;
  for (let n = 0; n < N; n++) e -= Math.sqrt(J * J + g * g - 2 * J * g * Math.cos(Math.PI * (2 * n + 1) / N));
  return e;
};
// Eigenvalues of a symmetric matrix (Jacobi), independent of the page
function eigenvalues(A) {
  const n = A.length, a = A.map(r => r.slice());
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-24) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (!a[p][q]) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const x = a[k][p], y = a[k][q]; a[k][p] = c * x - s * y; a[k][q] = s * x + c * y; }
      for (let k = 0; k < n; k++) { const x = a[p][k], y = a[q][k]; a[p][k] = c * x - s * y; a[q][k] = s * x + c * y; }
    }
  }
  return a.map((r, i) => r[i]).sort((x, y) => x - y);
}
// Dense Hamiltonian of the ring with a longitudinal field, bit i = 1 ↔ spin up
function denseH(N, J, g, h) {
  const dim = 2 ** N, H = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (let s = 0; s < dim; s++) {
    const z = i => ((s >> (i % N)) & 1) ? 1 : -1;
    for (let i = 0; i < N; i++) { H[s][s] += -J * z(i) * z(i + 1) - h * z(i); H[s][s ^ (1 << i)] += -g; }
  }
  return H;
}

test.describe('engine', () => {
  test.beforeEach(async ({ page }) => { await page.goto('/quantum-magnetism/'); });

  test('lattices: neighbours are exactly the sites at distance 1 (periodic images), bond counts, sublattices', async ({ page }) => {
    const res = await page.evaluate(() => {
      const S3 = Math.sqrt(3) / 2, out = {};
      // Super-cell vectors of the periodic lattice in drawing coordinates
      const T = { square: L => [[L, 0], [0, L]], triangular: L => [[L, 0], [L / 2, S3 * L]], kagome: L => [[2 * L, 0], [L, 2 * S3 * L]] };
      for (const [type, L] of [['square', 6], ['triangular', 6], ['kagome', 4]]) {
        const lat = window.IsingLattice.build(type, L), [t1, t2] = T[type](L);
        let wrong = 0, subBad = 0;
        for (let i = 0; i < lat.n; i++) {
          const geo = [];
          for (let j = 0; j < lat.n; j++) {
            let d = Infinity;
            for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++)
              d = Math.min(d, Math.hypot(lat.x[j] + a * t1[0] + b * t2[0] - lat.x[i], lat.y[j] + a * t1[1] + b * t2[1] - lat.y[i]));
            if (Math.abs(d - 1) < 1e-4) geo.push(j);
          }
          const nb = Array.from(lat.nb.slice(i * lat.z, (i + 1) * lat.z)).sort((x, y) => x - y);
          if (JSON.stringify(nb) !== JSON.stringify(geo.sort((x, y) => x - y))) wrong++;
          for (const j of nb) if (lat.sub[j] === lat.sub[i] && type !== 'kagome') subBad++;
        }
        out[type] = { n: lat.n, z: lat.z, bonds: lat.bonds.length / 2, wrong, subBad };
      }
      return out;
    });
    expect(res.square).toEqual({ n: 36, z: 4, bonds: 72, wrong: 0, subBad: 0 });
    expect(res.triangular).toEqual({ n: 36, z: 6, bonds: 108, wrong: 0, subBad: 0 });
    expect(res.kagome).toEqual({ n: 48, z: 4, bonds: 96, wrong: 0, subBad: 0 });
  });

  test('Metropolis samples the Boltzmann distribution: averages against exact enumeration of all 2^9 states', async ({ page }) => {
    // Triangular 3×3 ring (27 bonds), antiferro in a field, and ferro without field
    for (const [J, h, T] of [[-1, 0.5, 1.5], [1, 0, 3]]) {
      const { bonds, mc } = await page.evaluate(([J, h, T]) => {
        const lat = window.IsingLattice.build('triangular', 3), sim = window.IsingLattice.createSim(lat, 7);
        sim.set({ J, h, T }); sim.randomize(); sim.sweep(500);
        let e = 0, m2 = 0, k = 0;
        for (let i = 0; i < 60000; i++) { sim.sweep(1); const r = sim.measure(); e += r.e; m2 += r.m * r.m; k++; }
        return { bonds: Array.from(lat.bonds), mc: { e: e / k, m2: m2 / k } };
      }, [J, h, T]);
      let Z = 0, E = 0, M2 = 0;
      for (let s = 0; s < 512; s++) {
        const sp = i => (s >> i) & 1 ? 1 : -1;
        let bond = 0, m = 0;
        for (let k = 0; k < bonds.length; k += 2) bond += sp(bonds[k]) * sp(bonds[k + 1]);
        for (let i = 0; i < 9; i++) m += sp(i);
        const en = -J * bond - h * m, w = Math.exp(-en / T);
        Z += w; E += w * en / 9; M2 += w * (m / 9) ** 2;
      }
      expect(Math.abs(mc.e - E / Z), `energy J=${J} h=${h}`).toBeLessThan(0.02);
      expect(Math.abs(mc.m2 - M2 / Z), `m² J=${J} h=${h}`).toBeLessThan(0.02);
    }
  });

  test('square ferromagnet follows Onsager below Tc and is disordered above', async ({ page }) => {
    const r = await page.evaluate(() => {
      const lat = window.IsingLattice.build('square', 48), sim = window.IsingLattice.createSim(lat, 3), out = {};
      for (const T of [1.8, 3.5]) {
        sim.set({ J: 1, h: 0, T }); sim.order('up'); sim.sweep(300);
        let a = 0;
        for (let i = 0; i < 400; i++) { sim.sweep(1); a += Math.abs(sim.measure().m); }
        out[T] = a / 400;
      }
      return out;
    });
    // Onsager/Yang: m = (1 − sinh(2/T)^−4)^(1/8)
    expect(Math.abs(r[1.8] - (1 - Math.sinh(2 / 1.8) ** -4) ** 0.125)).toBeLessThan(0.02);
    expect(r[3.5]).toBeLessThan(0.15);
  });

  test('ground states: ordered energies, the frustrated antiferromagnets keep a third of all bonds unhappy', async ({ page }) => {
    const r = await page.evaluate(() => {
      const out = {};
      for (const [type, L] of [['square', 12], ['triangular', 12], ['kagome', 6]]) for (const J of [1, -1]) {
        const sim = window.IsingLattice.createSim(window.IsingLattice.build(type, L), 11);
        sim.set({ J, h: 0, T: 2 }); sim.randomize();
        for (const T of [2, 1.5, 1, 0.7, 0.5, 0.3, 0.2, 0.1, 0.05]) { sim.set({ T }); sim.sweep(300); }
        sim.set({ T: 0 }); sim.sweep(50);
        const m = sim.measure();
        out[type + J] = { e: Math.round(m.e * 1e6) / 1e6, f: Math.round(m.frustrated * 1e6) / 1e6 };
      }
      return out;
    });
    // Bonds per site: square 2, triangular 3, kagome 2; ferro: all satisfied
    expect(r.square1).toEqual({ e: -2, f: 0 });
    expect(r.triangular1).toEqual({ e: -3, f: 0 });
    expect(r.kagome1).toEqual({ e: -2, f: 0 });
    expect(r['square-1']).toEqual({ e: -2, f: 0 });
    // One unhappy bond in every triangle (each bond belongs to exactly one up-triangle or down-triangle per site pair)
    expect(r['triangular-1']).toEqual({ e: -1, f: 0.333333 });
    expect(r['kagome-1']).toEqual({ e: -0.666667, f: 0.333333 });
  });

  test('quantum ring: ground state energy equals the free-fermion solution, Hellmann–Feynman for ⟨σˣ⟩', async ({ page }) => {
    const cases = [];
    for (const N of [3, 4, 6, 8, 10]) for (const g of [0, 0.3, 1, 1.7, 3]) cases.push([N, g]);
    const res = await page.evaluate(cases => cases.map(([N, g]) => {
      const r = window.QuantumChain.ground({ N, J: 1, gamma: g, h: 0 });
      const o = window.QuantumChain.observe(r.psi, N);
      return { E0: r.E0, sx: o.sx.reduce((a, b) => a + b, 0) / N, zz0: o.zz[0] };
    }), cases);
    res.forEach((r, k) => {
      const [N, g] = cases[k];
      expect(r.E0, `E0 N=${N} Γ=${g}`).toBeCloseTo(tfimE0(N, 1, g), 9);
      // ⟨σˣ⟩ = −(1/N) dE0/dΓ, derivative of the exact formula numerically
      const d = 1e-5, sx = -(tfimE0(N, 1, g + d) - tfimE0(N, 1, Math.max(0, g - d))) / ((g + d) - Math.max(0, g - d)) / N;
      expect(r.sx, `σx N=${N} Γ=${g}`).toBeCloseTo(sx, 5);
      expect(r.zz0).toBeCloseTo(1, 12);
    });
  });

  test('quantum ring: levels with a longitudinal field and antiferro against a dense diagonalisation', async ({ page }) => {
    for (const [N, J, g, h] of [[5, 1, 0.7, 0.3], [6, -1, 1.2, 0], [5, -1, 0.4, 0], [4, 1, 0, 0.5]]) {
      const lev = await page.evaluate(p => window.QuantumChain.levels(p, 4), { N, J, gamma: g, h });
      const ev = eigenvalues(denseH(N, J, g, h));
      const distinct = [];
      for (const x of ev) if (!distinct.length || x - distinct[distinct.length - 1] > 1e-6) distinct.push(x);
      expect(lev[0], `ground N=${N} J=${J} Γ=${g} h=${h}`).toBeCloseTo(ev[0], 8);
      // Every level found is a true eigenvalue, the gap is the true one where the lowest level is not degenerate
      for (const x of lev) expect(Math.min(...ev.map(y => Math.abs(y - x))), `level ${x}`).toBeLessThan(1e-7);
      if (distinct[1] - distinct[0] > 1e-3 && ev[1] - ev[0] > 1e-3) expect(lev[1]).toBeCloseTo(distinct[1], 7);
    }
  });

  test('quantum ring: cat state at Γ = 0, entanglement one bit; odd antiferro ring is frustrated', async ({ page }) => {
    const r = await page.evaluate(() => {
      const Q = window.QuantumChain;
      const cat = Q.observe(Q.ground({ N: 6, J: 1, gamma: 0, h: 0 }).psi, 6);
      const odd = Q.ground({ N: 5, J: -1, gamma: 0, h: 0 });
      const polar = Q.observe(Q.ground({ N: 6, J: 1, gamma: 0.2, h: 0.5 }).psi, 6);
      return { top: cat.top.slice(0, 3), S: cat.entropy, oddE: odd.E0, polarZ: polar.sz[0], polarS: polar.entropy };
    });
    expect(r.top[0]).toEqual({ s: 0, p: expect.closeTo(0.5, 10) });
    expect(r.top[1]).toEqual({ s: 63, p: expect.closeTo(0.5, 10) });
    expect(r.top[2].p).toBeLessThan(1e-12);
    expect(r.S).toBeCloseTo(1, 9);
    // 5 bonds, all but one antiparallel: −(4 − 1)
    expect(r.oddE).toBeCloseTo(-3, 10);
    // A field picks "all up": spins point up, almost no entanglement
    expect(r.polarZ).toBeGreaterThan(0.99);
    expect(r.polarS).toBeLessThan(0.01);
  });
});

test.describe('page', () => {
  // No automatic start, so the numbers stay still
  test.use({ reducedMotion: 'reduce' });
  test.beforeEach(async ({ page }) => { await page.goto('/quantum-magnetism/'); });

  test('starts by itself unless reduced motion is wanted', async ({ page, browser }) => {
    await expect(page.locator('#btnRun')).toHaveAttribute('aria-pressed', 'false');
    const ctx = await browser.newContext({ locale: 'de-DE', reducedMotion: 'no-preference' });
    const p2 = await ctx.newPage();
    await p2.goto(page.url());
    await expect(p2.locator('#btnRun')).toHaveAttribute('aria-pressed', 'true');
    await expect(p2.locator('#btnRun .tb-label')).toHaveText('Pause');
    await expect(p2.locator('#badge')).not.toContainText('Durchlauf 0');
    await ctx.close();
  });

  test('settings are saved and survive a reload', async ({ page }) => {
    await page.click('#lattice [data-v="triangular"]');
    await page.click('#coupling [data-v="-1"]');
    await page.click('#size [data-v="2"]');
    await page.locator('#rT').fill('0.8');
    await page.locator('#rH').fill('1.5');
    await page.click('#btnFrust');
    await page.reload();
    await expect(page.locator('#lattice [data-v="triangular"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#coupling [data-v="-1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#size [data-v="2"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#oT')).toHaveText('0,80');
    await expect(page.locator('#oH')).toHaveText('1,50');
    await expect(page.locator('#btnFrust')).toHaveAttribute('aria-pressed', 'true');
    expect(await stored(page)).toMatchObject({ mode: 'classic', lattice: 'triangular', J: -1, T: 0.8, h: 1.5, size: 2, frust: true });
    await expect(page.locator('#factsText')).toContainText('Restentropie 0,338');
  });

  test('ordered start, painting a spin by tapping, frustrated bonds of the triangular antiferromagnet', async ({ page }) => {
    await page.click('#size [data-v="0"]');
    await page.click('#btnCold');
    await expect(page.locator('#sM')).toHaveText('+1,00');
    await expect(page.locator('#sE')).toHaveText('-2,000');
    await expect(page.locator('#sF')).toHaveText('0 %');
    // One of 144 spins flipped: m = 142/144, energy (−288 + 8)/144
    const box = await page.locator('#cv').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('#sM')).toHaveText('+' + de(142 / 144, 2));
    await expect(page.locator('#sE')).toHaveText(de(-280 / 144, 3));
    // Triangular antiferro, two up and one down in every triangle: 288 happy, 144 unhappy bonds of 432
    await page.click('#lattice [data-v="triangular"]');
    await page.click('#coupling [data-v="-1"]');
    await page.click('#btnCold');
    await expect(page.locator('#sM')).toHaveText('+' + de(1 / 3, 2));
    await expect(page.locator('#sE')).toHaveText(de(-1, 3));
    await expect(page.locator('#sF')).toHaveText('33 %');
    await expect(page.locator('#sMs')).toHaveText('1,00');
  });

  test('start, pause, history chart', async ({ page }) => {
    await page.click('#btnRun');
    await expect(page.locator('#btnRun')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#badge')).toContainText(/Durchlauf [1-9]/);
    await page.click('#btnRun');
    await expect(page.locator('#btnRun')).toHaveAttribute('aria-pressed', 'false');
    const t1 = await page.locator('#badge').textContent();
    await page.waitForTimeout(300);
    expect(await page.locator('#badge').textContent()).toBe(t1);
    await expect(page.locator('#legend')).toContainText('Magnetisierung m');
  });

  test('temperature scan runs to the end and shows the exact Tc and Onsager curve', async ({ page }) => {
    await page.click('#size [data-v="0"]');
    await page.click('#chartMode [data-chart="scan"]');
    await expect(page.locator('#chartEmpty')).toBeVisible();
    await page.click('#btnScan');
    await expect(page.locator('#btnScan')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#badge')).toContainText('Scan');
    await expect(page.locator('#btnScan')).toHaveAttribute('aria-pressed', 'false', { timeout: 60000 });
    await expect(page.locator('.toast').filter({ hasText: 'Temperatur-Scan fertig' })).toBeVisible();
    await expect(page.locator('#chartEmpty')).toBeHidden();
    await expect(page.locator('#legend')).toContainText('kritische Temperatur 2,269');
    await expect(page.locator('#legend')).toContainText('exakt (Onsager)');
    await expect(page.locator('#oT')).toHaveText('0,20');
  });

  test('moving the temperature slider stops a running scan', async ({ page }) => {
    await page.click('#btnScan');
    await expect(page.locator('#btnScan')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#rT').fill('1');
    await expect(page.locator('#btnScan')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.toast').filter({ hasText: 'Scan abgebrochen' })).toBeVisible();
  });

  test('swinging field draws the hysteresis loop; stopping gives the slider back', async ({ page }) => {
    await page.click('#btnOsc');
    await expect(page.locator('#btnOsc')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chartMode [data-chart="loop"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#rH')).toBeDisabled();
    await expect(page.locator('#oH')).not.toHaveText('0,00');
    await expect(page.locator('#chartEmpty')).toBeHidden();
    await page.click('#btnOsc');
    await expect(page.locator('#rH')).toBeEnabled();
    await expect(page.locator('#btnOsc')).toHaveAttribute('aria-pressed', 'false');
  });

  test('quantum chain: exact energy, cat state, odd antiferro ring, spectrum computed; mode survives a reload', async ({ page }) => {
    await page.click('#mode [data-mode="quantum"]');
    await expect(page.locator('#quantum')).toBeVisible();
    await expect(page.locator('#classic')).toBeHidden();
    await expect(page.locator('#tb')).toBeHidden();
    await expect(page.locator('#qE')).toHaveText(de(tfimE0(8, 1, 0.5) / 8, 3));
    await expect(page.locator('#qFacts')).toContainText('E₀/N = ' + de(tfimE0(8, 1, 0.5) / 8, 3));
    await page.locator('#rG').fill('0');
    await expect(page.locator('#configs li')).toHaveCount(2);
    await expect(page.locator('#configs li .ket')).toHaveText(['↓↓↓↓↓↓↓↓', '↑↑↑↑↑↑↑↑']);
    await expect(page.locator('#configs li .pct')).toHaveText(['50,0 %', '50,0 %']);
    await expect(page.locator('#qS')).toHaveText('1,00');
    await page.locator('#rN').fill('5');
    await page.click('#qCoupling [data-v="-1"]');
    await expect(page.locator('#qFacts')).toContainText('ungerader Anzahl ist frustriert');
    await expect(page.locator('#qE')).toHaveText(de(-3 / 5, 3));
    await expect(page.locator('#configs li')).toHaveCount(6);
    await expect(page.locator('#qlegend')).not.toContainText('rechnet', { timeout: 20000 });
    await page.click('#qChartMode [data-chart="corr"]');
    await expect(page.locator('#qlegend')).toContainText('Korrelation');
    await page.reload();
    await expect(page.locator('#quantum')).toBeVisible();
    await expect(page.locator('#oN')).toHaveText('5');
    expect((await stored(page)).q).toEqual({ N: 5, J: -1, gamma: 0, h: 0, chart: 'corr' });
  });

  test('sweeping the transverse field moves Γ and stops on a slider move', async ({ page }) => {
    await page.click('#mode [data-mode="quantum"]');
    await page.click('#btnSweepG');
    await expect(page.locator('#btnSweepG')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#oG')).not.toHaveText('0,50');
    await page.locator('#rG').fill('2');
    await expect(page.locator('#btnSweepG')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#oG')).toHaveText('2,00');
  });

  test('examples load lattice settings or the quantum chain', async ({ page }) => {
    await page.selectOption('#examples', 'kagome');
    await expect(page.locator('#lattice [data-v="kagome"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#coupling [data-v="-1"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#btnFrust')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#btnRun')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#examples')).toHaveValue('');
    await page.selectOption('#examples', 'hyst');
    await expect(page.locator('#btnOsc')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chartMode [data-chart="loop"]')).toHaveAttribute('aria-pressed', 'true');
    await page.selectOption('#examples', 'qcp');
    await expect(page.locator('#quantum')).toBeVisible();
    await expect(page.locator('#oN')).toHaveText('10');
    await expect(page.locator('#oG')).toHaveText('1,00');
    await expect(page.locator('#qChartMode [data-chart="order"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('English: texts written by the script follow the language', async ({ page }) => {
    await switchLang(page, 'en');
    await expect(page.locator('#badge')).toContainText('Sweep 0');
    await expect(page.locator('#factsText')).toContainText('Known exactly: phase transition at T_c = 2.269');
    await expect(page.locator('#examples option[value="hyst"]')).toHaveText('Hysteresis loop');
    await expect(page.locator('#legend')).toContainText('Magnetisation m');
    await page.click('#mode [data-mode="quantum"]');
    await expect(page.locator('#qFacts')).toContainText('Quantum phase transition');
    await expect(page.locator('#cv')).toHaveAttribute('aria-label', /Ring of quantum spins/);
  });
});
