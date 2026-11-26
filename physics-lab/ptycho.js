/* Physik verstehen – how ptychography gets a picture out of diffraction patterns, without DOM: window.Ptycho
   (see README.md). Everything in pixels of a 64 × 64 object; complex numbers as two Float64Arrays (re, im).
   - Object O = amplitude · e^(i·phase): a few dark discs (seen in an ordinary picture) and a phase pattern that does
     not absorb anything (invisible in an ordinary picture, like a living cell or a thin crystal).
   - Probe P: round spot of radius R (soft edge) in a W × W window (W = 32, twice the spot: the detector samples finely
     enough). The spot is moved over the object in a square grid with step s.
   - Measurement at each position: only the intensity |FFT(P · O_window)|² – the phase of the wave is lost.
   - Reconstruction: ePIE (Maiden & Rodenburg 2009) with known probe. For each position: guess → FFT → keep the
     phase, replace the amplitude by the measured one → inverse FFT → correct the object where the probe was.
     Overlapping spots have to agree with each other – that is what pins down the lost phase.
   - Error: compared with the true object after removing the one phase offset no measurement can see (|c|-optimal). */
(function (root) {
  'use strict';

  const N = 64, W = 32, R = 8;

  // In-place radix-2 FFT of one row/column (n = power of two); inv = inverse without the 1/n
  function fft1(re, im, inv) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const p = i + k, q = p + len / 2;
          const xr = re[q] * cr - im[q] * ci, xi = re[q] * ci + im[q] * cr;
          re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  // 2D FFT of an n × n field (unitary: scaled by 1/n both ways, so |FFT| keeps the total intensity)
  function fft2(re, im, n, inv) {
    const r = new Float64Array(n), i = new Float64Array(n), s = 1 / Math.sqrt(n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) { r[x] = re[y * n + x]; i[x] = im[y * n + x]; }
      fft1(r, i, inv);
      for (let x = 0; x < n; x++) { re[y * n + x] = r[x] * s; im[y * n + x] = i[x] * s; }
    }
    for (let x = 0; x < n; x++) {
      for (let y = 0; y < n; y++) { r[y] = re[y * n + x]; i[y] = im[y * n + x]; }
      fft1(r, i, inv);
      for (let y = 0; y < n; y++) { re[y * n + x] = r[y] * s; im[y * n + x] = i[y] * s; }
    }
  }

  // The test object: amplitude (dark discs) and phase (a ring and a bar), each 0 … 1 / 0 … max
  function object() {
    const amp = new Float64Array(N * N), ph = new Float64Array(N * N);
    const discs = [[20, 22, 7, 0.35], [44, 40, 5, 0.5], [30, 48, 4, 0.6]];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let a = 1;
      for (const [cx, cy, r, v] of discs) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < r + 1) a = Math.min(a, v + (1 - v) * Math.min(1, Math.max(0, d - r + 0.5)));
      }
      // phase: a ring around (42, 20) and a slanted bar – nothing absorbs there
      const ring = Math.exp(-((Math.hypot(x - 42, y - 20) - 9) ** 2) / 6);
      const u = (x - 20) * 0.8 + (y - 44) * 0.6, v = -(x - 20) * 0.6 + (y - 44) * 0.8;
      const bar = Math.abs(v) < 3 && Math.abs(u) < 14 ? 1 : 0;
      amp[y * N + x] = a;
      ph[y * N + x] = 1.6 * Math.max(ring, bar);
    }
    return { amp, ph };
  }

  // Round spot with a soft edge in the W × W window (real, centred)
  function probe() {
    const p = new Float64Array(W * W), c = (W - 1) / 2;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - c, y - c);
      p[y * W + x] = Math.min(1, Math.max(0, R + 0.5 - d));
    }
    return p;
  }

  // Scan positions (top-left corner of the window): square grid with step s that covers the object
  function positions(step) {
    const last = N - W, xs = [];
    for (let v = 0; v < last; v += step) xs.push(v);
    xs.push(last);
    const out = [];
    for (const y of xs) for (const x of xs) out.push([x, y]);
    return { list: out, perRow: xs.length };
  }
  // Overlap of two neighbouring round spots of diameter D at distance s (area share, 0 … 1)
  function overlap(step) {
    const D = 2 * R, d = Math.min(step, D), r = R;
    if (d >= D) return 0;
    const lens = 2 * r * r * Math.acos(d / (2 * r)) - d / 2 * Math.sqrt(4 * r * r - d * d);
    return lens / (Math.PI * r * r);
  }

  // The measured patterns: for every position the intensity |FFT(P · O)|² (W × W, zero frequency in the corner)
  function measure(obj, P, pos) {
    const re = new Float64Array(W * W), im = new Float64Array(W * W);
    return pos.map(([px, py]) => {
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const k = (py + y) * N + px + x, a = obj.amp[k] * P[y * W + x];
        re[y * W + x] = a * Math.cos(obj.ph[k]); im[y * W + x] = a * Math.sin(obj.ph[k]);
      }
      fft2(re, im, W, false);
      const I = new Float64Array(W * W);
      for (let i = 0; i < W * W; i++) I[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);   // keep the amplitude √I
      return I;
    });
  }

  /** A new reconstruction for scan step `step` (px). Start guess: empty (amplitude 1, phase 0). */
  function create(step) {
    const obj = object(), P = probe(), pos = positions(step), meas = measure(obj, P, pos.list);
    let pmax = 0; for (const v of P) pmax = Math.max(pmax, v * v);
    const st = { step, obj, P, pmax, pos: pos.list, perRow: pos.perRow, meas, iter: 0,
      re: new Float64Array(N * N).fill(1), im: new Float64Array(N * N), seen: new Float64Array(N * N),
      bufR: new Float64Array(W * W), bufI: new Float64Array(W * W), order: pos.list.map((_, i) => i), seed: 1 };
    for (const [px, py] of pos.list) for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) st.seen[(py + y) * N + px + x] += P[y * W + x];
    return st;
  }

  // Fixed random order of the positions in each pass (mulberry32) – the same every time
  function shuffle(st) {
    let s = st.seed++ * 2654435761 >>> 0;
    const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const o = st.order;
    for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  }

  /** One pass over all positions (ePIE, object update only, α = 1). Returns the Fourier error of the pass. */
  function iterate(st) {
    const { P, re, im, bufR: br, bufI: bi } = st;
    let errNum = 0, errDen = 0;
    shuffle(st);
    for (const j of st.order) {
      const [px, py] = st.pos[j], A = st.meas[j];
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const k = (py + y) * N + px + x, p = P[y * W + x];
        br[y * W + x] = p * re[k]; bi[y * W + x] = p * im[k];
      }
      const er = br.slice(), ei = bi.slice();                     // exit wave ψ = P · O
      fft2(br, bi, W, false);
      for (let i = 0; i < W * W; i++) {
        const m = Math.hypot(br[i], bi[i]), f = m > 1e-12 ? A[i] / m : 0;
        errNum += (m - A[i]) ** 2; errDen += A[i] * A[i];
        if (m > 1e-12) { br[i] *= f; bi[i] *= f; } else { br[i] = A[i]; bi[i] = 0; }
      }
      fft2(br, bi, W, true);                                       // corrected exit wave ψ'
      for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x, p = P[i]; if (!p) continue;
        const k = (py + y) * N + px + x, g = p / st.pmax;          // O += conj(P)/max|P|² · (ψ' − ψ)
        re[k] += g * (br[i] - er[i]); im[k] += g * (bi[i] - ei[i]);
      }
    }
    st.iter++;
    return Math.sqrt(errNum / errDen);
  }

  /** Difference to the true object where the probe has been, after the best global phase factor: 0 … 1 */
  function error(st) {
    const { obj, re, im, seen } = st;
    let cr = 0, ci = 0, n2 = 0, t2 = 0;
    for (let k = 0; k < N * N; k++) {
      if (seen[k] < 0.5) continue;
      const tr = obj.amp[k] * Math.cos(obj.ph[k]), ti = obj.amp[k] * Math.sin(obj.ph[k]);
      cr += tr * re[k] + ti * im[k]; ci += ti * re[k] - tr * im[k];   // Σ t · conj(o)
      n2 += re[k] * re[k] + im[k] * im[k]; t2 += tr * tr + ti * ti;
    }
    const cm = Math.hypot(cr, ci);
    return Math.sqrt(Math.max(0, t2 + n2 - 2 * cm) / t2);          // min over c=e^{iθ} of ‖t − c·o‖ / ‖t‖
  }

  /** Reconstructed amplitude and phase (phase offset removed like in error()), as arrays */
  function result(st) {
    const { obj, re, im, seen } = st;
    let cr = 0, ci = 0;
    for (let k = 0; k < N * N; k++) if (seen[k] >= 0.5) {
      const tr = obj.amp[k] * Math.cos(obj.ph[k]), ti = obj.amp[k] * Math.sin(obj.ph[k]);
      cr += tr * re[k] + ti * im[k]; ci += ti * re[k] - tr * im[k];
    }
    const th = Math.atan2(ci, cr), c = Math.cos(th), s = Math.sin(th);
    const amp = new Float64Array(N * N), ph = new Float64Array(N * N);
    for (let k = 0; k < N * N; k++) {
      const r = re[k] * c - im[k] * s, i = re[k] * s + im[k] * c;
      amp[k] = Math.hypot(r, i); ph[k] = Math.atan2(i, r);
    }
    return { amp, ph, seen };
  }

  /** The diffraction pattern at one position, log-scaled 0 … 1 and with zero frequency in the middle */
  function pattern(st, j) {
    const A = st.meas[j], out = new Float64Array(W * W);
    let mx = 0; for (const v of A) mx = Math.max(mx, v * v);
    const lo = Math.log10(mx) - 5;
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      const v = A[((y + W / 2) % W) * W + (x + W / 2) % W] ** 2;
      out[y * W + x] = Math.max(0, (Math.log10(v + 1e-30) - lo) / 5);
    }
    return out;
  }

  root.Ptycho = { N, W, R, fft2, object, probe, positions, overlap, measure, create, iterate, error, result, pattern };
})(typeof window !== 'undefined' ? window : globalThis);
