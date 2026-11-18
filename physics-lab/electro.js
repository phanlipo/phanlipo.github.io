/* Physik verstehen – electricity and magnetism without DOM: window.Electro (see README.md).
   Lorentz force on a charge moving across a magnetic field (2D, field perpendicular to the screen):
     F = |q|·v·B, circle with r = m·v / (|q|·B), period T = 2π·m / (|q|·B) – independent of v.
   Circuits with a battery (no internal resistance) and ohmic bulbs: one bulb, two in series, two in parallel. */
(function (root) {
  'use strict';

  const E = 1.602176634e-19;
  const PARTICLES = {
    electron: { m: 9.1093837e-31, q: -E },
    proton: { m: 1.67262192e-27, q: E },
    alpha: { m: 6.6446573e-27, q: 2 * E },
  };
  // v in m/s, B in T
  function circle(p, v, B) {
    const P = PARTICLES[p], aq = Math.abs(P.q);
    return { r: P.m * v / (aq * B), T: 2 * Math.PI * P.m / (aq * B), F: aq * v * B, m: P.m, q: P.q };
  }

  /* kind 'one' | 'series' | 'parallel'; U in V, r1, r2 in Ω. Returns total resistance, current from the battery
     and per bulb voltage, current, power (bulb 2 only for two bulbs). */
  function circuit(kind, U, r1, r2) {
    if (kind === 'one') { const I = U / r1; return { R: r1, I, bulbs: [{ U, I, P: U * I }] }; }
    if (kind === 'series') {
      const R = r1 + r2, I = U / R;
      return { R, I, bulbs: [{ U: I * r1, I, P: I * I * r1 }, { U: I * r2, I, P: I * I * r2 }] };
    }
    const R = 1 / (1 / r1 + 1 / r2), I1 = U / r1, I2 = U / r2;
    return { R, I: I1 + I2, bulbs: [{ U, I: I1, P: U * I1 }, { U, I: I2, P: U * I2 }] };
  }

  root.Electro = { E, PARTICLES, circle, circuit };
})(typeof window !== 'undefined' ? window : globalThis);
