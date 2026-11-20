/* Physik verstehen – lift of a wing without DOM: window.Wing (see README.md).
   Profile: Joukowski airfoil z = ζ + 1/ζ of a circle through ζ = 1 (sharp trailing edge at z = 2), centre μ = (−dx, dy):
   dx makes it thicker, dy curves it (camber). Flow: exact potential flow around the circle, mapped to the airfoil,
   circulation Γ from the Kutta condition (the air leaves the sharp trailing edge smoothly):
     W(ζ) = V·((ζ−μ)·e^{−iα} + a²·e^{iα}/(ζ−μ)) + iΓ/(2π)·ln(ζ−μ),  Γ = 4π·V·a·sin(α+β),  lift L' = ρ·V·Γ.
   Potential flow knows no stall. Above the stall angle (rule of thumb from thickness) the lift falls towards the
   flat-plate value of a separated flow, C_L ≈ C_N·cos α with C_N ≈ 2·sin α, i.e. C_L ≈ sin 2α.
   Take-off: L = ½·ρ·v²·A·C_L = m·g, finite wing C_L = a·(α − α0) with a = 2π·AR/(AR+2) per radian. */
(function (root) {
  'use strict';

  const RHO = 1.225, G = 9.81, D2R = Math.PI / 180;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const div = (a, b) => { const d = b[0] * b[0] + b[1] * b[1]; return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]; };
  const expi = t => [Math.cos(t), Math.sin(t)];
  const abs = a => Math.hypot(a[0], a[1]);
  function csqrt(a) {
    const r = abs(a), re = Math.sqrt((r + a[0]) / 2), im = Math.sqrt(Math.max(0, (r - a[0]) / 2));
    return [re, a[1] < 0 ? -im : im];
  }

  // y of a polyline (x falling or rising) at x, by linear interpolation
  function yAt(chain, x) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const [x1, y1] = chain[i], [x2, y2] = chain[i + 1];
      if ((x - x1) * (x - x2) <= 0 && x1 !== x2) return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
    }
    return null;
  }

  /* Profile from the circle parameters: surface points, leading edge, chord and (measured in the chord frame)
     thickness and camber as shares of the chord. */
  function profile(dx, dy) {
    const mu = [-dx, dy], a = Math.hypot(1 + dx, dy), beta = Math.atan2(dy, 1 + dx), N = 360, pts = [];
    for (let i = 0; i <= N; i++) {
      const z = add(add(mu, mul([a, 0], expi(-beta + 2 * Math.PI * i / N))), [0, 0]);
      pts.push(add(z, div([1, 0], z)));
    }
    let iLE = 0;
    for (let i = 1; i < N; i++) if (pts[i][0] < pts[iLE][0]) iLE = i;
    const le = pts[iLE], te = [2, 0], chord = Math.hypot(te[0] - le[0], te[1] - le[1]);
    const gam = Math.atan2(le[1] - te[1], te[0] - le[0]); // chord falls towards the trailing edge by this angle
    // chord frame: leading edge at 0, trailing edge at 1
    const ce = [(te[0] - le[0]) / chord, (te[1] - le[1]) / chord];
    const toC = p => { const q = sub(p, le); return [(q[0] * ce[0] + q[1] * ce[1]) / chord, (q[1] * ce[0] - q[0] * ce[1]) / chord]; };
    const up = pts.slice(0, iLE + 1).map(toC), lo = pts.slice(iLE).map(toC);
    let thick = 0, camber = 0;
    for (let k = 1; k < 100; k++) {
      const x = k / 100, yu = yAt(up, x), yl = yAt(lo, x);
      if (yu == null || yl == null) continue;
      thick = Math.max(thick, yu - yl); camber = Math.max(camber, (yu + yl) / 2);
    }
    return { dx, dy, mu, a, beta, pts, iLE, le, te, chord, gam, thick, camber };
  }

  // Profile with the given thickness and camber (shares of the chord, 0 … 0.2 and 0 … 0.1), found by iteration
  const shapeCache = new Map();
  function shape(t, f) {
    const key = t.toFixed(4) + ',' + f.toFixed(4);
    if (shapeCache.has(key)) return shapeCache.get(key);
    let dx = t * 0.77, dy = f * 2, p = profile(dx, dy);
    for (let i = 0; i < 40; i++) {
      const et = t - p.thick, ef = f - p.camber;
      if (Math.abs(et) < 1e-5 && Math.abs(ef) < 1e-5) break;
      dx = Math.max(0, dx + et * 0.77); dy = Math.max(0, dy + ef * 2);
      p = profile(dx, dy);
    }
    if (shapeCache.size > 200) shapeCache.clear();
    shapeCache.set(key, p);
    return p;
  }

  /* stall angle in degrees, measured from the angle without lift. Rule of thumb fitted to measured profiles (NACA 0012
     ≈ 16°, 4412 ≈ 14° geometric, thin plates ≈ 7°): a round, thick nose and camber keep the flow on longer. */
  const stallAngle = p => Math.min(18, 7 + 80 * p.thick + 50 * p.camber);
  // flat-plate value after the stall
  const post = aDeg => Math.sin(2 * aDeg * D2R);

  /* Lift at the angle of attack alpha (degrees between the oncoming air and the chord). */
  function lift(p, alpha) {
    const ax = alpha * D2R - p.gam, a0 = (p.gam - p.beta) / D2R; // flow angle in the circle frame, angle without lift
    const clPot = 8 * Math.PI * p.a * Math.sin(ax + p.beta) / p.chord;
    const as = stallAngle(p), eff = alpha - a0;
    let cl = clPot, stalled = false, excess = 0;
    if (Math.abs(eff) > as) {
      stalled = true; excess = Math.abs(eff) - as;
      const sg = Math.sign(eff), aS = a0 + sg * as;
      const clS = 8 * Math.PI * p.a * Math.sin(aS * D2R - p.gam + p.beta) / p.chord;
      cl = post(alpha) + (clS - post(aS)) * Math.exp(-excess / 2);
    }
    return { alpha, cl, clPot, a0, stall: as, stallPos: a0 + as, stallNeg: a0 - as, stalled, excess, ax, gamma: cl * p.chord / 2 };
  }

  /* Flow field (V = 1) in the drawing frame: the air comes from the left, the chord is centred at 0 and has length 1,
     tilted by alpha. vel(x, y) is the velocity (multiples of V) or null inside the wing. */
  function field(p, L) {
    const ax = L.ax, rot = expi(ax), rotB = expi(-ax), mid = [(p.le[0] + p.te[0]) / 2, (p.le[1] + p.te[1]) / 2];
    const c = p.chord, G2 = L.gamma / (2 * Math.PI), a2 = p.a * p.a;
    const toZ = d => add(mid, mul([d[0] * c, d[1] * c], rot));
    const toD = z => { const q = mul(sub(z, mid), rotB); return [q[0] / c, q[1] / c]; };
    function zeta(z) {
      const s = csqrt(sub(mul(z, z), [4, 0])), z1 = mul(add(z, s), [0.5, 0]), z2 = mul(sub(z, s), [0.5, 0]);
      return abs(sub(z1, p.mu)) >= abs(sub(z2, p.mu)) ? z1 : z2;
    }
    function vel(x, y) {
      const z = toZ([x, y]), zt = zeta(z), r = sub(zt, p.mu);
      if (abs(r) < p.a * 1.0005) return null;
      const dW = add(sub(expi(-ax), div(mul([a2, 0], expi(ax)), mul(r, r))), div([0, G2], r));
      const dz = sub([1, 0], div([1, 0], mul(zt, zt)));
      const w = div(dW, dz), v = [w[0], -w[1]], d = mul(v, rotB);
      return d;
    }
    // surface of the wing in the drawing frame, upper side first (trailing edge → leading edge → trailing edge)
    const outline = p.pts.map(toD);
    return { vel, outline, toD, iLE: p.iLE };
  }

  /* Streamlines starting at x0 for every y in ys; dt in chord lengths of free flow, every point is one time step
     (equal times: points with the same index were released together). */
  function streamlines(F, ys, x0 = -1.4, x1 = 1.5, dt = 0.01, maxSteps = 900) {
    const out = [];
    for (const y0 of ys) {
      const line = [[x0, y0]];
      let x = x0, y = y0;
      for (let k = 0; k < maxSteps && x < x1; k++) {
        const k1 = F.vel(x, y); if (!k1) break;
        const k2 = F.vel(x + k1[0] * dt / 2, y + k1[1] * dt / 2); if (!k2) break;
        const k3 = F.vel(x + k2[0] * dt / 2, y + k2[1] * dt / 2); if (!k3) break;
        const k4 = F.vel(x + k3[0] * dt, y + k3[1] * dt); if (!k4) break;
        x += dt * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6; y += dt * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6;
        line.push([x, y]);
      }
      out.push(line);
    }
    return out;
  }

  /* Pressure on the surface: C_p = 1 − (v/V)², a little outside the surface (normal from the circle), without the
     points next to the sharp trailing edge. Returns [{ p (on the surface), n (outward), cp, upper }]. */
  function pressure(p, L, F, n = 36) {
    const out = [], a = p.a, ax = L.ax, G2 = L.gamma / (2 * Math.PI);
    for (let i = 1; i < n; i++) {
      const th = -p.beta + 2 * Math.PI * i / n, e = expi(th);
      if (Math.abs(Math.sin((th + p.beta) / 2)) < 0.12) continue;
      const zt = add(p.mu, mul([a, 0], e)), z = add(zt, div([1, 0], zt)), r = sub(zt, p.mu);
      const dW = add(sub(expi(-ax), div(mul([a * a, 0], expi(ax)), mul(r, r))), div([0, G2], r));
      const dz = sub([1, 0], div([1, 0], mul(zt, zt)));
      const v = abs(div(dW, dz));
      const zo = add(add(p.mu, mul([a * 1.02, 0], e)), div([1, 0], add(p.mu, mul([a * 1.02, 0], e))));
      const s = F.toD(z), so = F.toD(zo), nl = Math.hypot(so[0] - s[0], so[1] - s[1]) || 1;
      out.push({ p: s, n: [(so[0] - s[0]) / nl, (so[1] - s[1]) / nl], cp: 1 - v * v, upper: i <= n * (p.iLE / (p.pts.length - 1)) });
    }
    return out;
  }

  // C_L over alpha for the curve
  function curve(p, lo = -10, hi = 25, step = 0.5) {
    const out = [];
    for (let a = lo; a <= hi + 1e-9; a += step) { const L = lift(p, a); out.push([a, L.cl, L.clPot]); }
    return out;
  }

  /* Take-off: m in kg, A in m², AR aspect ratio, clMax with flaps if any, a0 angle without lift in degrees. */
  const PLANES = {
    paper: { m: 0.005, A: 0.02, AR: 2, clMax: 0.8, a0: 0 },
    glider: { m: 500, A: 18, AR: 16, clMax: 1.4, a0: -2 },
    small: { m: 1100, A: 16.2, AR: 7.4, clMax: 1.6, a0: -2 },
    airliner: { m: 70000, A: 122.6, AR: 10.4, clMax: 2.6, a0: -2 },
  };
  const slope = AR => 2 * Math.PI * AR / (AR + 2); // per radian
  function takeoff(kind, vKmh) {
    const P = PLANES[kind], v = vKmh / 3.6, W = P.m * G, q = RHO * v * v / 2, cl = W / (q * P.A), a = slope(P.AR);
    const vMin = Math.sqrt(2 * W / (RHO * P.A * P.clMax));
    return { ...P, v, W, q, cl, slope: a, alpha: P.a0 + cl / a / D2R, alphaMax: P.a0 + P.clMax / a / D2R, vMin, flies: cl <= P.clMax, load: P.m / P.A };
  }

  root.Wing = { RHO, G, shape, profile, lift, field, streamlines, pressure, curve, stallAngle, PLANES, slope, takeoff };
})(typeof window !== 'undefined' ? window : globalThis);
