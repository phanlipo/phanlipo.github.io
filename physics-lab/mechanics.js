/* Physik verstehen – oscillations without DOM: window.Mechanics (see README.md).
   SI units inside (m, kg, s, rad); the page converts to cm, g and degrees.
   Pendulum on a string: φ'' = -(g/l)·sin φ (exact, integrated with RK4 – large angles included)
   Mass on a spring:     x'' = -(k/m)·x
   Coupled pendulums (small angles, coupling spring between the bobs, κ = q·g/l):
     φ1'' = -(g/l)·φ1 - κ·(φ1 - φ2),  φ2'' = -(g/l)·φ2 - κ·(φ2 - φ1)
     normal modes ω1 = √(g/l) (in phase), ω2 = √(g/l + 2κ) (opposite) – solved exactly.                       */
(function (root) {
  'use strict';

  const TAU = 2 * Math.PI;
  const DT = 1 / 1000; // integration step in s

  // arithmetic-geometric mean (for the exact period of the pendulum)
  function agm(a, b) {
    for (let i = 0; i < 30 && Math.abs(a - b) > 1e-15 * a; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
    return a;
  }
  const periodSmall = (l, g) => TAU * Math.sqrt(l / g);
  // exact period for amplitude φ0: T = T0 / AGM(1, cos(φ0/2))
  const periodExact = (l, g, phi0) => periodSmall(l, g) / agm(1, Math.cos(phi0 / 2));
  const periodSpring = (m, k) => TAU * Math.sqrt(m / k);

  // one RK4 step for y'' = f(y)
  function rk4(y, v, f, h) {
    const a1 = f(y), k1y = v, k1v = a1;
    const a2 = f(y + h / 2 * k1y), k2y = v + h / 2 * k1v, k2v = a2;
    const a3 = f(y + h / 2 * k2y), k3y = v + h / 2 * k2v, k3v = a3;
    const a4 = f(y + h * k3y), k4y = v + h * k3v, k4v = a4;
    return [y + h / 6 * (k1y + 2 * k2y + 2 * k3y + k4y), v + h / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)];
  }

  /* An oscillator that is moved on in fixed steps (the same result for any frame rate).
     kind 'string': y = angle (rad), params { l, g }; kind 'spring': y = displacement (m), params { k, m }.
     It counts upward zero crossings to measure the period like a stopwatch would. */
  function oscillator(kind, params, y0) {
    const f = kind === 'string' ? y => -(params.g / params.l) * Math.sin(y) : y => -(params.k / params.m) * y;
    const o = { t: 0, y: y0, v: 0, crossings: [], period: null };
    let acc = 0;
    o.advance = dt => {
      acc += dt;
      while (acc >= DT - 1e-12) {
        acc -= DT;
        const [y, v] = rk4(o.y, o.v, f, DT);
        // crossing from below to above zero: interpolate the moment
        if (o.y < 0 && y >= 0) {
          const tc = o.t + DT * (-o.y) / (y - o.y);
          o.crossings.push(tc);
          if (o.crossings.length >= 2) o.period = tc - o.crossings[o.crossings.length - 2];
        }
        o.y = y; o.v = v; o.t += DT;
      }
      return o;
    };
    return o;
  }

  // coupled pendulums: exact solution for the three starts
  function coupled(l, g, q) {
    const w0 = Math.sqrt(g / l), kappa = q * g / l, w1 = w0, w2 = Math.sqrt(g / l + 2 * kappa);
    return {
      w1, w2, kappa,
      T1: TAU / w1, T2: TAU / w2,
      beat: TAU / (w2 - w1), // time for energy to go over and back
      // start: 'one' (left pushed, right at rest), 'same' (both alike), 'opposite'
      at(start, A, t) {
        const c1 = Math.cos(w1 * t), c2 = Math.cos(w2 * t), s1 = Math.sin(w1 * t), s2 = Math.sin(w2 * t);
        let p1, p2, v1, v2;
        if (start === 'same') { p1 = p2 = A * c1; v1 = v2 = -A * w1 * s1; }
        else if (start === 'opposite') { p1 = A * c2; p2 = -p1; v1 = -A * w2 * s2; v2 = -v1; }
        else {
          p1 = A / 2 * (c1 + c2); p2 = A / 2 * (c1 - c2);
          v1 = -A / 2 * (w1 * s1 + w2 * s2); v2 = -A / 2 * (w1 * s1 - w2 * s2);
        }
        // energy of each pendulum on its own (kinetic + height, per unit mass and length²); the small share
        // stored in the spring is left out, so a pendulum at rest shows exactly 0
        const e1 = (v1 * v1 + w0 * w0 * p1 * p1) / 2, e2 = (v2 * v2 + w0 * w0 * p2 * p2) / 2;
        return { p1, p2, v1, v2, e1, e2 };
      },
    };
  }

  /* Throw from the ground with air drag F = ½·ρ·c_w·A·v² against the direction of flight (RK4, step 2 ms).
     ball { m (kg), d (m), cw }, air: false = vacuum. Returns the path [[t, x, y], …] up to the landing
     (interpolated to y = 0), the range, the flight time and the highest point. */
  const RHO = 1.2;
  const dragFactor = ball => RHO * ball.cw * Math.PI * ball.d * ball.d / 8 / ball.m; // k/m in 1/m
  function projectile(ball, v, deg, g, air, keep = true) {
    const h = 0.002, c = air ? dragFactor(ball) : 0, a = deg * Math.PI / 180;
    // state x, y, vx, vy; the derivative of (vx, vy) is (-c·|v|·vx, -g - c·|v|·vy)
    const ax = (u, w) => -c * Math.hypot(u, w) * u, ay = (u, w) => -g - c * Math.hypot(u, w) * w;
    let x = 0, y = 0, u = v * Math.cos(a), w = v * Math.sin(a), t = 0, hMax = 0;
    const pts = [[0, 0, 0]];
    for (let i = 0; i < 200000; i++) {
      const k1u = ax(u, w), k1w = ay(u, w);
      const u2 = u + h / 2 * k1u, w2 = w + h / 2 * k1w, k2u = ax(u2, w2), k2w = ay(u2, w2);
      const u3 = u + h / 2 * k2u, w3 = w + h / 2 * k2w, k3u = ax(u3, w3), k3w = ay(u3, w3);
      const u4 = u + h * k3u, w4 = w + h * k3w, k4u = ax(u4, w4), k4w = ay(u4, w4);
      const nx = x + h / 6 * (u + 2 * u2 + 2 * u3 + u4), ny = y + h / 6 * (w + 2 * w2 + 2 * w3 + w4);
      const nu = u + h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u), nw = w + h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
      if (ny < 0 && i > 0) {
        const q = y / (y - ny), end = [t + h * q, x + (nx - x) * q, 0];
        if (keep) pts.push(end);
        return { pts, range: end[1], time: end[0], hMax };
      }
      x = nx; y = ny; u = nu; w = nw; t += h; if (y > hMax) hMax = y;
      if (keep && i % 5 === 4) pts.push([t, x, y]);
    }
    return { pts, range: x, time: t, hMax };
  }
  // range for every whole angle 1 … 89° and the best angle (refined to 0.1°)
  function rangeCurve(ball, v, g, air) {
    const curve = [];
    for (let d = 1; d <= 89; d++) curve.push([d, projectile(ball, v, d, g, air, false).range]);
    let best = curve.reduce((b, p) => (p[1] > b[1] ? p : b));
    for (let d = best[0] - 1; d <= best[0] + 1 + 1e-9; d += 0.1) {
      const r = projectile(ball, v, d, g, air, false).range;
      if (r > best[1]) best = [Math.round(d * 10) / 10, r];
    }
    return { curve, best: best[0], bestRange: best[1] };
  }

  root.Mechanics = { TAU, DT, agm, periodSmall, periodExact, periodSpring, oscillator, coupled, RHO, dragFactor, projectile, rangeCurve };
})(typeof window !== 'undefined' ? window : globalThis);
