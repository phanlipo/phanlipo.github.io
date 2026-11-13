/* Videoanalyse – calculations without DOM (window.VideoMath).
   toWorld(p, cal)            video pixel {x, y} → metres {x, y}: origin, y upwards, optional rotation of the x axis
                              along the scale line; cal = { a, b, len, origin, rotate } (a, b: scale end points in pixels)
   series(points, cal, fps, slow) → rows [{ frame, t, x, y, vx, vy, v }] sorted by frame; t from the first point,
                              velocities by central differences (one-sided at the ends)
   polyFit(xs, ys, degree)    least squares → { coef: [c0, c1, …], err: [σ0, σ1, …], r2, rms }
   sineFit(ts, ys)            y = A sin(ω t + φ) + c → { A, omega, phi, c, err: { A, omega, c }, r2, rms }
                              (ω by a search over the residual of the linear sub-problem, then refined)
   track(prev, next, w, h, at, guess, r, R) → { x, y, score } best position of the patch around `at` in `prev`
                              within radius R around `guess` in `next` (grey values, normalised cross-correlation),
                              with sub-pixel refinement. prev/next: Float32Array of grey values, w×h. */
(function (root) {
  'use strict';

  function toWorld(p, cal) {
    const s = scale(cal);
    const o = cal.origin || { x: 0, y: 0 };
    let x = (p.x - o.x) / s, y = -(p.y - o.y) / s;
    if (cal.rotate && cal.a && cal.b) {
      const th = Math.atan2(-(cal.b.y - cal.a.y), cal.b.x - cal.a.x), c = Math.cos(th), sn = Math.sin(th);
      [x, y] = [x * c + y * sn, -x * sn + y * c];
    }
    return { x, y };
  }
  // pixels per metre (1 without a scale: then the units are pixels)
  function scale(cal) {
    if (!cal || !cal.a || !cal.b || !(cal.len > 0)) return 1;
    const d = Math.hypot(cal.b.x - cal.a.x, cal.b.y - cal.a.y);
    return d > 0 ? d / cal.len : 1;
  }

  function series(points, cal, fps, slow) {
    const list = Object.keys(points).map(Number).sort((a, b) => a - b);
    if (!list.length) return [];
    const f0 = list[0], k = 1 / (fps * (slow || 1));
    const rows = list.map(f => Object.assign({ frame: f, t: (f - f0) * k }, toWorld(points[f], cal)));
    rows.forEach((r, i) => {
      const a = rows[Math.max(0, i - 1)], b = rows[Math.min(rows.length - 1, i + 1)];
      const dt = b.t - a.t;
      r.vx = dt > 0 ? (b.x - a.x) / dt : NaN;
      r.vy = dt > 0 ? (b.y - a.y) / dt : NaN;
      r.v = Math.hypot(r.vx, r.vy);
    });
    return rows;
  }

  // Solves A·x = b (Gauss with partial pivoting); returns x and the inverse of A
  function solve(A, b) {
    const n = A.length, M = A.map((row, i) => [...row, b[i], ...A.map((_, j) => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-300) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k < M[r].length; k++) M[r][k] -= f * M[c][k];
      }
    }
    return { x: M.map((row, i) => row[n] / row[i]), inv: M.map((row, i) => row.slice(n + 1).map(v => v / row[i])) };
  }
  // Linear least squares with basis functions; standard errors from the covariance matrix
  function linFit(xs, ys, basis) {
    const n = xs.length, p = basis.length;
    if (n < p) return null;
    const AtA = basis.map(() => new Array(p).fill(0)), Atb = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      const row = basis.map(f => f(xs[i]));
      for (let a = 0; a < p; a++) { Atb[a] += row[a] * ys[i]; for (let b = 0; b < p; b++) AtA[a][b] += row[a] * row[b]; }
    }
    const s = solve(AtA, Atb);
    if (!s) return null;
    let ssr = 0, mean = 0;
    ys.forEach(y => { mean += y / n; });
    let sst = 0;
    for (let i = 0; i < n; i++) {
      const fit = basis.reduce((acc, f, k) => acc + s.x[k] * f(xs[i]), 0);
      ssr += (ys[i] - fit) ** 2; sst += (ys[i] - mean) ** 2;
    }
    const dof = n - p, s2 = dof > 0 ? ssr / dof : NaN;
    return { coef: s.x, err: s.inv.map((row, i) => Math.sqrt(Math.max(0, s2 * row[i]))), r2: sst > 0 ? 1 - ssr / sst : 1, rms: Math.sqrt(ssr / n), ssr, dof };
  }
  function polyFit(xs, ys, degree) {
    // centre and scale x for a well-conditioned system, then transform back
    const n = xs.length;
    const xm = xs.reduce((a, b) => a + b, 0) / n;
    const sc = Math.max(...xs.map(x => Math.abs(x - xm))) || 1;
    const u = xs.map(x => (x - xm) / sc);
    const basis = Array.from({ length: degree + 1 }, (_, k) => x => Math.pow(x, k));
    const f = linFit(u, ys, basis);
    if (!f) return null;
    // y = Σ d_k ((x − xm)/sc)^k = Σ c_j x^j: c = T·d, covariance Cov(c) = T Cov(d) Tᵀ
    const p = degree + 1, T = Array.from({ length: p }, () => new Array(p).fill(0));
    const binom = (a, b) => { let r = 1; for (let i = 1; i <= b; i++) r = r * (a - b + i) / i; return r; };
    for (let k = 0; k < p; k++) for (let j = 0; j <= k; j++) T[j][k] = binom(k, j) * Math.pow(-xm, k - j) / Math.pow(sc, k);
    const coef = T.map(row => row.reduce((a, v, k) => a + v * f.coef[k], 0));
    // Cov(d) from the fit: σ² (UᵀU)⁻¹ – rebuild it from the errors is not enough (correlations), so recompute
    const s2 = f.dof > 0 ? f.ssr / f.dof : NaN;
    const AtA = basis.map(() => new Array(p).fill(0));
    for (const x of u) { const row = basis.map(g => g(x)); for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) AtA[a][b] += row[a] * row[b]; }
    const inv = solve(AtA, new Array(p).fill(0)).inv;
    const err = T.map(rj => {
      let v = 0;
      for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) v += rj[a] * inv[a][b] * rj[b];
      return Math.sqrt(Math.max(0, s2 * v));
    });
    return { coef, err, r2: f.r2, rms: f.rms };
  }

  function sineFit(ts, ys) {
    const n = ts.length;
    if (n < 5) return null;
    const sub = w => linFit(ts, ys, [t => Math.sin(w * t), t => Math.cos(w * t), () => 1]);
    const ssr = w => { const f = sub(w); return f ? f.ssr : Infinity; };
    // Search ω between one period over the whole time and the Nyquist limit
    const T = ts[n - 1] - ts[0];
    if (!(T > 0)) return null;
    const dtMin = Math.min(...ts.slice(1).map((t, i) => t - ts[i]).filter(d => d > 0));
    const wLo = Math.PI / T, wHi = Math.PI / dtMin;
    let best = wLo, bv = Infinity;
    const steps = 400;
    for (let i = 0; i <= steps; i++) {
      const w = wLo * Math.pow(wHi / wLo, i / steps), v = ssr(w);
      if (v < bv) { bv = v; best = w; }
    }
    // golden-section refinement around the best grid point
    const r = Math.pow(wHi / wLo, 1 / steps);
    let lo = best / r, hi = best * r;
    const g = (Math.sqrt(5) - 1) / 2;
    let c1 = hi - g * (hi - lo), c2 = lo + g * (hi - lo), f1 = ssr(c1), f2 = ssr(c2);
    for (let k = 0; k < 80; k++) {
      if (f1 < f2) { hi = c2; c2 = c1; f2 = f1; c1 = hi - g * (hi - lo); f1 = ssr(c1); }
      else { lo = c1; c1 = c2; f1 = f2; c2 = lo + g * (hi - lo); f2 = ssr(c2); }
    }
    const w = (lo + hi) / 2, f = sub(w);
    if (!f) return null;
    const [a, b, c] = f.coef;
    const A = Math.hypot(a, b), phi = Math.atan2(b, a);
    // σ_ω from the curvature of the residual sum: Var(ω) ≈ 2σ² / SSR''(ω)
    const s2 = f.ssr / Math.max(1, n - 4), h = w * 1e-4;
    const curv = (ssr(w + h) - 2 * f.ssr + ssr(w - h)) / (h * h);
    const errW = curv > 0 ? Math.sqrt(2 * s2 / curv) : NaN;
    // amplitude error: A from a and b (σ of a and b are about equal)
    const errA = Math.sqrt((a * a * f.err[0] ** 2 + b * b * f.err[1] ** 2) / (A * A || 1));
    return { A, omega: w, phi, c, err: { A: errA, omega: errW, c: f.err[2] }, r2: f.r2, rms: f.rms };
  }

  // Normalised cross-correlation of a (2r+1)² patch, searched within radius R; sub-pixel by parabolas
  function track(prev, next, w, h, at, guess, r, R) {
    const ax = Math.round(at.x), ay = Math.round(at.y);
    if (ax - r < 0 || ay - r < 0 || ax + r >= w || ay + r >= h) return null;
    const size = (2 * r + 1) ** 2, tpl = new Float32Array(size);
    let k = 0, tm = 0;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const v = prev[(ay + y) * w + ax + x]; tpl[k++] = v; tm += v; }
    tm /= size;
    let tv = 0;
    for (let i = 0; i < size; i++) { tpl[i] -= tm; tv += tpl[i] * tpl[i]; }
    if (tv < 1e-6) return null; // flat patch: nothing to follow
    const gx = Math.round(guess.x), gy = Math.round(guess.y);
    const W = 2 * R + 1, scores = new Float32Array(W * W).fill(-2);
    let best = -2, bx = 0, by = 0;
    for (let dy = -R; dy <= R; dy++) {
      const cy = gy + dy;
      if (cy - r < 0 || cy + r >= h) continue;
      for (let dx = -R; dx <= R; dx++) {
        const cx = gx + dx;
        if (cx - r < 0 || cx + r >= w) continue;
        let s = 0, sm = 0, sv = 0;
        k = 0;
        for (let y = -r; y <= r; y++) {
          const row = (cy + y) * w + cx;
          for (let x = -r; x <= r; x++) { const v = next[row + x]; sm += v; sv += v * v; s += tpl[k++] * v; }
        }
        const varN = sv - sm * sm / size;
        const ncc = varN > 1e-6 ? s / Math.sqrt(tv * varN) : -1;
        scores[(dy + R) * W + dx + R] = ncc;
        if (ncc > best) { best = ncc; bx = dx; by = dy; }
      }
    }
    if (best <= -2) return null;
    const at2 = (dx, dy) => (Math.abs(dx) <= R && Math.abs(dy) <= R ? scores[(dy + R) * W + dx + R] : -2);
    const sub = (m, c, p) => { const den = m - 2 * c + p; return den < 0 && m > -2 && p > -2 ? 0.5 * (m - p) / den : 0; };
    const ox = sub(at2(bx - 1, by), best, at2(bx + 1, by)), oy = sub(at2(bx, by - 1), best, at2(bx, by + 1));
    return { x: gx + bx + ox + (at.x - ax), y: gy + by + oy + (at.y - ay), score: best };
  }

  root.VideoMath = { toWorld, scale, series, polyFit, sineFit, track };
})(typeof window !== 'undefined' ? window : globalThis);
