/* Quantenputt – courses and physics without DOM, window.PuttEngine. The page (app.js) and the tests use the
   same code. Architecture: quantum-putt/README.md

   Units: grid spacing 1, ħ = 1, mass m = ½ → H = −∇² + V. A plane wave e^{i k·r} has energy k² and moves with
   the group velocity 2k (cells per time unit). The course is W × H = 128 × 256 cells, x to the right, y down;
   the hole is near the top, the ball starts near the bottom.

   Course: { id, par, start: [x, y], hole: [x, y, r], shapes: [...] }. Shapes (added to the potential V):
     { wall: [x0, y0, x1, y1] }            wall block (the ball bounces off, the wave too: step V_WALL)
     { wall: [x0, y0, x1, y1], w }         wall along a line segment of width w
     { post: [cx, cy, r] }                 round post (wall)
     { bar: [x0, y0, x1, y1], h }          flat block of finite height h (tunnelling)
     { hill: [cx, cy, s, h] }              smooth Gaussian hill of height h (h < 0: a hollow)
     { disc: [cx, cy, r, h] }              round flat area of height h with soft edge (h < 0: a lens)
     { slope: [y0, y1, h] }                ramp: 0 below y1, rising to h at y0 (y0 < y1), flat above
   Every course has a wall of BORDER cells around it (the FFT is periodic; the border keeps the wave inside).

   createSim(field) → sim: the wave packet, split-operator method:
     launch(x, y, angleDeg, strength, sigma)  Gaussian packet; angle 0 = straight up, clockwise; strength 0–1
     step(n)       n time steps of DT: kinetic part in momentum space (FFT), potential part in position space
     density()     |ψ|² per cell (Float32Array W·H, not normalised), norm(), probIn(x, y, r) (0–1)
     sample(u, v, w)  position measurement: picks a point with probability |ψ|² (u, v, w uniform in [0, 1))
   createBall(field) → classical ball with the same start: x' = 2p, p' = −∇V, reflects off walls. */
(function (root) {
  'use strict';
  const W = 128, H = 256, N = W * H, BORDER = 4, DT = 0.5;
  // Walls are a high but finite step (well above the largest energy K_MAX² ≈ 1.7): erasing the wave there would
  // swallow it at every bounce with this time step, a higher step would leak through (phase V·DT too large).
  const V_WALL = 4;
  const K_MIN = 0.3, K_MAX = 1.3;                    // strength 0 … 1 → wave number (energy k²)
  const SIGMAS = { small: 4, medium: 7, large: 10 }; // width of the packet (std. dev. of |ψ|², cells)

  /* ---------- Courses (own designs) ---------- */
  const COURSES = [
    { id: 'open', par: 2, start: [64, 226], hole: [64, 50, 14], shapes: [] },
    { id: 'lens', par: 2, start: [64, 228], hole: [64, 36, 12], shapes: [{ disc: [64, 150, 26, -0.9] }] },
    { id: 'ramp', par: 2, start: [64, 226], hole: [64, 50, 14], shapes: [{ slope: [80, 190, 1.1] }] },
    { id: 'hill', par: 2, start: [64, 226], hole: [64, 50, 14], shapes: [{ hill: [64, 140, 16, 2.4] }] },
    { id: 'funnel', par: 2, start: [64, 226], hole: [64, 70, 14],
      shapes: [{ wall: [8, 90, 57, 128], w: 5 }, { wall: [120, 90, 71, 128], w: 5 }, { wall: [0, 125, 57, 131] }, { wall: [71, 125, 128, 131] }] },
    { id: 'slits', par: 3, start: [64, 230], hole: [64, 64, 14],
      shapes: [{ wall: [0, 148, 48, 154] }, { wall: [60, 148, 68, 154] }, { wall: [80, 148, 128, 154] }] },
    { id: 'corner', par: 3, start: [96, 226], hole: [34, 50, 14], shapes: [{ wall: [0, 118, 76, 126] }] },
    { id: 'crystal', par: 3, start: [64, 226], hole: [64, 40, 14], shapes: crystal() },
    { id: 'tunnel', par: 4, start: [64, 226], hole: [64, 60, 14], shapes: [{ bar: [0, 110, 128, 112], h: 1.85 }] },
    { id: 'zigzag', par: 4, start: [30, 230], hole: [100, 44, 14], shapes: [{ wall: [0, 170, 80, 176] }, { wall: [48, 100, 128, 106] }] },
  ];
  function crystal() {
    const s = [];
    for (let row = 0; row < 3; row++) for (let col = 0; col < 8; col++) s.push({ post: [8 + col * 16 + (row % 2) * 8, 112 + row * 14, 3] });
    return s;
  }

  /* ---------- Potential ---------- */
  function segDist(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
    return Math.hypot(px - x0 - t * dx, py - y0 - t * dy);
  }
  /** Course → { course, V (Float32Array), wall (Uint8Array, 1 = wall), vmax } */
  function buildField(course) {
    const V = new Float32Array(N), wall = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, cx = x + 0.5, cy = y + 0.5;
      if (x < BORDER || y < BORDER || x >= W - BORDER || y >= H - BORDER) { wall[i] = 1; continue; }
      let v = 0;
      for (const s of course.shapes) {
        if (s.wall) {
          const [x0, y0, x1, y1] = s.wall;
          if (s.w ? segDist(cx, cy, x0, y0, x1, y1) <= s.w / 2 : cx >= x0 && cx < x1 && cy >= y0 && cy < y1) wall[i] = 1;
        } else if (s.post) {
          if (Math.hypot(cx - s.post[0], cy - s.post[1]) <= s.post[2]) wall[i] = 1;
        } else if (s.bar) {
          const [x0, y0, x1, y1] = s.bar;
          if (cx >= x0 && cx < x1 && cy >= y0 && cy < y1) v += s.h;
        } else if (s.hill) {
          const [hx, hy, sg, h] = s.hill;
          v += h * Math.exp(-((cx - hx) ** 2 + (cy - hy) ** 2) / (2 * sg * sg));
        } else if (s.disc) {
          const [dx, dy, r, h] = s.disc;
          v += h / (1 + Math.exp((Math.hypot(cx - dx, cy - dy) - r) / 1.5));
        } else if (s.slope) {
          const [y0, y1, h] = s.slope;
          v += h * Math.max(0, Math.min(1, (y1 - cy) / (y1 - y0)));
        }
      }
      V[i] = v;
    }
    let vmin = 0, vmax = 0;
    for (let i = 0; i < N; i++) if (!wall[i]) { if (V[i] > vmax) vmax = V[i]; if (V[i] < vmin) vmin = V[i]; }
    return { course, V, wall, vmin, vmax };
  }

  /* ---------- FFT (radix 2, in place) ---------- */
  function fftPlan(n) {
    const bits = Math.log2(n), rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1); rev[i] = r; }
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    return { n, rev, cos, sin };
  }
  // sign −1: forward e^{−i…}, +1: inverse (without 1/n)
  function fft(p, re, im, sign) {
    const { n, rev, cos, sin } = p;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let s = 0; s < n; s += size) {
        for (let k = 0, t = 0; k < half; k++, t += step) {
          const a = s + k, b = a + half, wr = cos[t], wi = sign * sin[t];
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
  }

  function kOf(strength) { return K_MIN + (K_MAX - K_MIN) * Math.max(0, Math.min(1, strength)); }
  // angle 0 = up (−y), clockwise → direction vector on the grid
  function dirOf(angleDeg) { const a = angleDeg * Math.PI / 180; return [Math.sin(a), -Math.cos(a)]; }

  function createSim(field) {
    const re = new Float64Array(N), im = new Float64Array(N);
    const pr = fftPlan(W), pc = fftPlan(H);
    const rowRe = new Float64Array(W), rowIm = new Float64Array(W), colRe = new Float64Array(H), colIm = new Float64Array(H);
    // Kinetic propagator e^{−i k² DT} (with the 1/N of the inverse FFT) and potential propagator e^{−i V DT}
    const kc = new Float64Array(N), ks = new Float64Array(N), vc = new Float64Array(N), vs = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const kx = 2 * Math.PI * (x < W / 2 ? x : x - W) / W, ky = 2 * Math.PI * (y < H / 2 ? y : y - H) / H;
      const ph = -(kx * kx + ky * ky) * DT, i = y * W + x;
      kc[i] = Math.cos(ph) / N; ks[i] = Math.sin(ph) / N;
    }
    for (let i = 0; i < N; i++) {
      const v = field.wall[i] ? V_WALL : field.V[i];
      vc[i] = Math.cos(-v * DT); vs[i] = Math.sin(-v * DT);
    }
    const dens = new Float32Array(N);
    const sim = { re, im, t: 0, active: false };

    function fft2(sign) {
      for (let y = 0; y < H; y++) {
        const o = y * W;
        for (let x = 0; x < W; x++) { rowRe[x] = re[o + x]; rowIm[x] = im[o + x]; }
        fft(pr, rowRe, rowIm, sign);
        for (let x = 0; x < W; x++) { re[o + x] = rowRe[x]; im[o + x] = rowIm[x]; }
      }
      for (let x = 0; x < W; x++) {
        for (let y = 0, i = x; y < H; y++, i += W) { colRe[y] = re[i]; colIm[y] = im[i]; }
        fft(pc, colRe, colIm, sign);
        for (let y = 0, i = x; y < H; y++, i += W) { re[i] = colRe[y]; im[i] = colIm[y]; }
      }
    }
    sim.clear = () => { re.fill(0); im.fill(0); sim.t = 0; sim.active = false; };
    sim.launch = (x0, y0, angle, strength, sigma) => {
      sim.clear();
      const k = kOf(strength), [dx, dy] = dirOf(angle), kx = k * dx, ky = k * dy;
      let sum = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (field.wall[i]) continue;
        const ex = x + 0.5 - x0, ey = y + 0.5 - y0, r2 = ex * ex + ey * ey;
        if (r2 > 36 * sigma * sigma) continue;
        const a = Math.exp(-r2 / (4 * sigma * sigma)), ph = kx * ex + ky * ey;
        re[i] = a * Math.cos(ph); im[i] = a * Math.sin(ph); sum += a * a;
      }
      const s = 1 / Math.sqrt(sum || 1);
      for (let i = 0; i < N; i++) { re[i] *= s; im[i] *= s; }
      sim.active = true;
    };
    sim.step = (n = 1) => {
      for (let s = 0; s < n; s++) {
        fft2(-1);
        for (let i = 0; i < N; i++) { const a = re[i], b = im[i]; re[i] = a * kc[i] - b * ks[i]; im[i] = a * ks[i] + b * kc[i]; }
        fft2(1);
        for (let i = 0; i < N; i++) { const a = re[i], b = im[i]; re[i] = a * vc[i] - b * vs[i]; im[i] = a * vs[i] + b * vc[i]; }
        sim.t += DT;
      }
    };
    sim.density = () => { for (let i = 0; i < N; i++) dens[i] = re[i] * re[i] + im[i] * im[i]; return dens; };
    sim.norm = () => { let s = 0; for (let i = 0; i < N; i++) s += re[i] * re[i] + im[i] * im[i]; return s; };
    sim.probIn = (hx, hy, r) => {
      let s = 0, all = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (field.wall[i]) continue;
        const d = re[i] * re[i] + im[i] * im[i];
        all += d;
        if ((x + 0.5 - hx) ** 2 + (y + 0.5 - hy) ** 2 <= r * r) s += d;
      }
      return all > 0 ? s / all : 0;
    };
    /** Position measurement: picks a cell with probability |ψ|² (walls left out, the wave only reaches into them
        a little), returns { x, y } = the cell plus the offsets v, w inside it */
    sim.sample = (u, v, w) => {
      let all = 0;
      for (let i = 0; i < N; i++) if (!field.wall[i]) all += re[i] * re[i] + im[i] * im[i];
      let target = u * all, i = 0, last = -1;
      for (; i < N; i++) {
        if (field.wall[i]) continue;
        last = i; target -= re[i] * re[i] + im[i] * im[i];
        if (target < 0) break;
      }
      if (i >= N) i = last;   // rounding at the very end of the sum
      return { x: (i % W) + v, y: Math.floor(i / W) + w };
    };
    return sim;
  }

  /* ---------- Classical ball (for comparison and the classical mode) ---------- */
  function createBall(field) {
    const { V, wall } = field;
    const at = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y); return xi < 0 || yi < 0 || xi >= W || yi >= H ? 1 : wall[yi * W + xi]; };
    const pot = (x, y) => { const xi = Math.max(0, Math.min(W - 1, Math.floor(x))), yi = Math.max(0, Math.min(H - 1, Math.floor(y))); return V[yi * W + xi]; };
    const ball = { x: 0, y: 0, px: 0, py: 0, active: false };
    ball.launch = (x, y, angle, strength) => {
      const k = kOf(strength), [dx, dy] = dirOf(angle);
      Object.assign(ball, { x, y, px: k * dx, py: k * dy, active: true });
    };
    ball.step = (n = 1) => {
      const sub = 8, h = DT / sub;
      for (let s = 0; s < n * sub; s++) {
        ball.px -= h * (pot(ball.x + 1, ball.y) - pot(ball.x - 1, ball.y)) / 2;
        ball.py -= h * (pot(ball.x, ball.y + 1) - pot(ball.x, ball.y - 1)) / 2;
        const nx = ball.x + 2 * ball.px * h, ny = ball.y + 2 * ball.py * h;
        if (!at(nx, ny)) { ball.x = nx; ball.y = ny; continue; }
        // Bounce: flip the component that runs into the wall
        if (at(nx, ball.y)) ball.px = -ball.px;
        if (at(ball.x, ny)) ball.py = -ball.py;
        if (!at(nx, ball.y) && !at(ball.x, ny)) { ball.px = -ball.px; ball.py = -ball.py; }
      }
    };
    return ball;
  }

  root.PuttEngine = { W, H, BORDER, DT, V_WALL, K_MIN, K_MAX, SIGMAS, COURSES, buildField, createSim, createBall, kOf, dirOf, fftPlan, fft };
})(typeof self !== 'undefined' ? self : globalThis);
