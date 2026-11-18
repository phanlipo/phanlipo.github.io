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
    if (kind === 'series' || kind === 'divider') {
      const R = r1 + r2, I = U / R;
      return { R, I, bulbs: [{ U: I * r1, I, P: I * I * r1 }, { U: I * r2, I, P: I * I * r2 }] };
    }
    const R = 1 / (1 / r1 + 1 / r2), I1 = U / r1, I2 = U / r2;
    return { R, I: I1 + I2, bulbs: [{ U, I: I1, P: U * I1 }, { U, I: I2, P: U * I2 }] };
  }

  /* Magnetic field lines of bar magnets, modelled by two poles each (pole strength ±1, field ∝ 1/r² like a point
     charge). cfg 'one' | 'attract' (N faces S) | 'repel' (N faces N). Lines start around every north pole. */
  const MAGNETS = {
    one: [[-1.4, 1.4, 1]],                        // [left end, right end, +1 = north on the right]
    attract: [[-3.6, -1, 1], [1, 3.6, 1]],
    repel: [[-3.6, -1, 1], [1, 3.6, -1]],
  };
  function poles(cfg) {
    const out = [];
    for (const [x0, x1, s] of MAGNETS[cfg]) { out.push({ x: s > 0 ? x1 - 0.15 : x0 + 0.15, y: 0, q: 1 }, { x: s > 0 ? x0 + 0.15 : x1 - 0.15, y: 0, q: -1 }); }
    return out;
  }
  function field(P, x, y) {
    let bx = 0, by = 0;
    for (const p of P) { const dx = x - p.x, dy = y - p.y, r2 = dx * dx + dy * dy, r3 = r2 * Math.sqrt(r2) || 1e-9; bx += p.q * dx / r3; by += p.q * dy / r3; }
    return [bx, by];
  }
  function fieldLines(cfg, box = [-5.5, 5.5, -3.6, 3.6], per = 14) {
    const P = poles(cfg), lines = [], h = 0.04;
    for (const N of P.filter(p => p.q > 0)) for (let k = 0; k < per; k++) {
      const a = 2 * Math.PI * (k + 0.5) / per;
      let x = N.x + 0.2 * Math.cos(a), y = N.y + 0.2 * Math.sin(a);
      const pts = [[x, y]];
      for (let i = 0; i < 1500; i++) {
        const dir = (px, py) => { const [bx, by] = field(P, px, py), l = Math.hypot(bx, by) || 1; return [bx / l, by / l]; };
        const [ax, ay] = dir(x, y), [mx, my] = dir(x + h / 2 * ax, y + h / 2 * ay);
        x += h * mx; y += h * my; pts.push([x, y]);
        if (x < box[0] || x > box[1] || y < box[2] || y > box[3]) break;
        if (P.some(p => p.q < 0 && Math.hypot(x - p.x, y - p.y) < 0.18)) break;
      }
      lines.push(pts);
    }
    return lines;
  }

  root.Electro = { E, PARTICLES, circle, circuit, MAGNETS, poles, field, fieldLines };
})(typeof window !== 'undefined' ? window : globalThis);
