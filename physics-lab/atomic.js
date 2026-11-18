/* Physik verstehen – atomic physics without DOM: window.Atomic (see README.md).
   Decay: every atom gets its own random lifetime from an exponential distribution, t = -T½·log2(U).
   No atom ages – the chance to decay in the next half-life is always 1/2 (no memory).
   Spectra: hydrogen after Bohr, E_n = -13.6 eV / n², 1/λ = R·(1/m² - 1/n²); other elements as measured lines. */
(function (root) {
  'use strict';

  // small seeded random generator (mulberry32): the same seed gives the same run
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // lifetimes in half-lives (1 = one half-life), plus the sorted list for counting
  function lifetimes(n, seed) {
    const r = rng(seed), life = new Float64Array(n);
    for (let i = 0; i < n; i++) life[i] = -Math.log2(1 - r()); // 1 - r() is never 0
    const sorted = Float64Array.from(life).sort();
    return { life, sorted };
  }
  // atoms left at time t (in half-lives): lifetimes > t
  function remaining(sorted, t) {
    let lo = 0, hi = sorted.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= t) lo = m + 1; else hi = m; }
    return sorted.length - lo;
  }
  const expected = (n0, t) => n0 * Math.pow(2, -t);
  // standard deviation of the number left (binomial with p = 2^-t)
  const spread = (n0, t) => { const p = Math.pow(2, -t); return Math.sqrt(n0 * p * (1 - p)); };

  // ---------- spectra ----------
  const RYD = 1.0967758e7; // Rydberg constant for hydrogen in 1/m (with the reduced mass)
  const EV = 13.6057;
  const level = n => -EV / (n * n);
  const hLambda = (lower, upper) => 1e9 / (RYD * (1 / (lower * lower) - 1 / (upper * upper))); // nm
  const photonEV = nm => 1239.84 / nm;
  // strong visible emission lines in nm (rounded measured values)
  const LINES = {
    hydrogen: [3, 4, 5, 6].map(n => Math.round(hLambda(2, n) * 10) / 10),
    helium: [447.1, 471.3, 492.2, 501.6, 587.6, 667.8, 706.5],
    sodium: [589.0, 589.6],
    neon: [585.2, 588.2, 594.5, 597.6, 603.0, 607.4, 609.6, 614.3, 616.4, 621.7, 626.6, 633.4, 638.3, 640.2, 650.7, 659.9, 692.9, 703.2],
    mercury: [404.7, 435.8, 546.1, 577.0, 579.1],
  };

  root.Atomic = { rng, lifetimes, remaining, expected, spread, RYD, EV, level, hLambda, photonEV, LINES };
})(typeof window !== 'undefined' ? window : globalThis);
