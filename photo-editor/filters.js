/* Photo filters of the Foto-Editor – pure pixel maths, no DOM. Used by filter-worker.js and (fallback,
   tests) by the page itself. All functions take and return RGBA pixel arrays (Uint8ClampedArray, w×h×4).

   PhotoFilters.apply(rgba, w, h, filter, opts) → new Uint8ClampedArray (opaque; transparency becomes white)
     'comic':    flat colours in a few brightness steps (cel shading) plus black ink lines
                 opts.levels 2–8 (steps), opts.lines 0–100 (how many lines; 0 = none)
     'coloring': black outlines on white for colouring in – no shading, small specks removed
                 opts.detail 0–100 (more lines), opts.thickness 1–5 (line width)
     'sketch':   pencil drawing (opts.shading 0–100)     'watercolor': soft washes on paper (opts.softness 0–100)
     'oil':      oil painting, Kuwahara (opts.brush 1–10) 'popart': four loud colours (opts.palette 1–4)
     'halftone': coloured dots like old comic print (opts.dotSize 3–20)
     'pixel':    big pixels, few colours (opts.pixelSize 2–30)
     'bw':       black & white with contrast (opts.contrast 0–100)
     'vintage':  sepia, faded, dark corners (opts.tone 0–100)
     'original': copy

   Edges: colour Canny – the photo is smoothed (Gaussian as three box blurs, O(n) whatever the radius), the
   Sobel gradient of the channel that changes most gives strength and direction, non-maximum suppression
   thins every edge to one line, hysteresis keeps weak edge pixels only where they continue a strong edge.
   Using all three channels finds edges between colours of the same brightness (red on green). Strength is
   measured as the contrast of the step (0–255), so thresholds do not depend on the image size. Radii, line
   widths and the smallest kept blob grow with the image (unit = longer side / 1000), so the full-size picture
   and the small preview look alike. */
(function (root) {
  'use strict';

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  // Box sizes whose triple application approximates a Gaussian with this sigma (Kovesi / Ivan Kutskir)
  function boxes(sigma) {
    const n = 3, wIdeal = Math.sqrt(12 * sigma * sigma / n + 1);
    let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
    const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
    const out = [];
    for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
    return out;
  }
  // One box blur pass along rows / columns with clamped edges; src and dst must differ
  function boxH(src, dst, w, h, r) {
    const k = 1 / (2 * r + 1);
    for (let y = 0; y < h; y++) {
      const o = y * w, first = src[o];
      let s = r * first;
      for (let x = 0; x < r; x++) s += src[o + Math.min(x, w - 1)];
      for (let x = 0; x < w; x++) {
        s += src[o + Math.min(x + r, w - 1)];
        dst[o + x] = s * k;
        s -= x - r >= 0 ? src[o + x - r] : first;
      }
    }
  }
  function boxV(src, dst, w, h, r) {
    const k = 1 / (2 * r + 1);
    for (let x = 0; x < w; x++) {
      const first = src[x];
      let s = r * first;
      for (let y = 0; y < r; y++) s += src[Math.min(y, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        s += src[Math.min(y + r, h - 1) * w + x];
        dst[y * w + x] = s * k;
        s -= y - r >= 0 ? src[(y - r) * w + x] : first;
      }
    }
  }
  /** Gaussian blur of a Float32Array channel (new array) */
  function blur(ch, w, h, sigma) {
    const a = Float32Array.from(ch);
    if (!(sigma > 0.3)) return a;
    const b = new Float32Array(ch.length);
    for (const r of boxes(sigma)) {
      const ri = Math.round(r);
      if (ri < 1) continue;
      boxH(a, b, w, h, ri); boxV(b, a, w, h, ri);
    }
    return a;
  }

  /** The three colour channels as Float32Arrays */
  function channels(rgba, w, h) {
    const n = w * h, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) { R[i] = rgba[p]; G[i] = rgba[p + 1]; B[i] = rgba[p + 2]; }
    return [R, G, B];
  }

  /** Colour Canny on already smoothed channels → Uint8Array (1 = edge, one pixel wide).
      sigma: the smoothing used (turns the Sobel value back into step contrast); high/low: contrast 0–255 */
  function canny(chs, w, h, sigma, high, low, suppress = 0) {
    const n = w * h, dir = new Uint8Array(n);
    let mag = new Float32Array(n);
    // A step of contrast C blurred with sigma has slope C/(sigma·√(2π)); Sobel gives 8× the slope
    const norm = sigma * Math.sqrt(2 * Math.PI) / 8;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let best = 0, bx = 0, by = 0;
      for (const c of chs) {
        const a = c[i - w - 1], b = c[i - w], d = c[i - w + 1], e = c[i - 1], f = c[i + 1], g = c[i + w - 1], k = c[i + w], l = c[i + w + 1];
        const gx = (d + 2 * f + l) - (a + 2 * e + g), gy = (g + 2 * k + l) - (a + 2 * b + d);
        const m = gx * gx + gy * gy;
        if (m > best) { best = m; bx = gx; by = gy; }
      }
      mag[i] = Math.sqrt(best) * norm;
      // direction of the gradient in 4 sectors: 0 = horizontal, 1 = 45°, 2 = vertical, 3 = 135°
      const ang = Math.atan2(by, bx);
      dir[i] = Math.round(((ang < 0 ? ang + Math.PI : ang) / Math.PI) * 4) % 4;
    }
    // Surround suppression: in textured areas (wood, sand, grass) every pixel has strong edges around it –
    // subtracting the mean edge strength of the surroundings removes them, while a lone outline survives
    if (suppress > 0) {
      const around = blur(mag, w, h, sigma * 4);
      for (let i = 0; i < n; i++) mag[i] = Math.max(0, mag[i] - suppress * around[i]);
    }
    // Non-maximum suppression: 2 = strong, 1 = weak
    const st = new Uint8Array(n), off = [1, w + 1, w, w - 1];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x, m = mag[i];
      if (m < low) continue;
      const o = off[dir[i]];
      if (m < mag[i - o] || m <= mag[i + o]) continue;
      st[i] = m >= high ? 2 : 1;
    }
    // Hysteresis: grow from strong pixels through weak ones
    const out = new Uint8Array(n), stack = new Int32Array(n);
    let top = 0;
    for (let i = 0; i < n; i++) if (st[i] === 2) { out[i] = 1; stack[top++] = i; }
    while (top) {
      const i = stack[--top];
      for (const o of [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1]) {
        const j = i + o;
        if (j >= 0 && j < n && st[j] && !out[j]) { out[j] = 1; stack[top++] = j; }
      }
    }
    return out;
  }

  /** Removes 8-connected blobs of ink smaller than minArea pixels (in place) */
  function removeSpecks(m, w, h, minArea) {
    if (minArea < 2) return m;
    const seen = new Uint8Array(m.length), stack = new Int32Array(m.length), blob = [];
    for (let s = 0; s < m.length; s++) {
      if (!m[s] || seen[s]) continue;
      let top = 0; stack[top++] = s; seen[s] = 1; blob.length = 0;
      while (top) {
        const i = stack[--top]; blob.push(i);
        const x = i % w, y = (i - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (m[j] && !seen[j]) { seen[j] = 1; stack[top++] = j; }
          }
        }
      }
      if (blob.length < minArea) for (const i of blob) m[i] = 0;
    }
    return m;
  }

  /** Thickens ink with a round brush of radius r pixels (new array) */
  function dilate(m, w, h, r) {
    if (r < 1) return m;
    const out = new Uint8Array(m.length), r2 = (r + 0.5) * (r + 0.5), offs = [];
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r2) offs.push(dx, dy);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue;
      for (let k = 0; k < offs.length; k += 2) {
        const xx = x + offs[k], yy = y + offs[k + 1];
        if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
      }
    }
    return out;
  }

  // Unit of the image: radii, widths and areas are given for an image whose longer side is 1000 px
  const unitOf = (w, h) => Math.max(w, h) / 1000;
  // Brush radius for a line of this width in pixels (1 px wide = radius 0)
  const radiusFor = width => Math.max(0, Math.round((width - 1) / 2));

  /** Ink lines of a photo: smoothing, colour Canny, specks removed, thickened */
  function inkLines(flat, w, h, { sigma, high, minLen, width, suppress }) {
    // Brightness to the power 0.7 (closer to the eye): edges in dark parts (a black dog's face) count more
    const chs = channels(flat, w, h).map(c => { for (let i = 0; i < c.length; i++) c[i] = 255 * Math.pow(c[i] / 255, 0.7); return blur(c, w, h, sigma); });
    let m = canny(chs, w, h, sigma, high, high * 0.45, suppress);
    removeSpecks(m, w, h, minLen);
    m = dilate(m, w, h, radiusFor(width));
    return m;
  }

  /** Colouring page: black outlines on pure white */
  function coloring(rgba, w, h, opts) {
    const detail = clamp(Number(opts.detail ?? 40), 0, 100) / 100;
    const thick = clamp(Math.round(Number(opts.thickness ?? 2)), 1, 5);
    const u = unitOf(w, h);
    const m = inkLines(rgba, w, h, {
      sigma: Math.max(1, u * lerp(3.2, 1.4, detail)),   // less detail: smoother photo, fewer small edges
      high: lerp(48, 11, detail),                        // contrast a step needs to start a line
      minLen: Math.round(u * lerp(60, 12, detail)) + 3,  // shorter lines are dropped (grass, pores, noise)
      width: thick * 1.6 * u,
      suppress: lerp(0.8, 0.4, detail),
    });
    return inkToRgba(m, w, h);
  }

  /** Comic: smoothed colours, brightness in a few steps with the hue kept, stronger colours, black lines */
  function comic(rgba, w, h, opts) {
    const levels = clamp(Math.round(Number(opts.levels ?? 5)), 2, 8);
    const lines = clamp(Number(opts.lines ?? 50), 0, 100) / 100;
    const u = unitOf(w, h), n = w * h;
    const [r, g, b] = channels(rgba, w, h).map(c => blur(c, w, h, Math.max(1, u * 2.2)));
    // Step of each pixel, cleaned by two passes of a 3×3 majority vote (no frayed borders between steps)
    let idx = new Uint8Array(n);
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const l = 0.299 * r[i] + 0.587 * g[i] + 0.114 * b[i];
      lum[i] = l;
      idx[i] = Math.round(Math.pow(l / 255, 0.85) * (levels - 1));   // a little lift so shadows do not drown
    }
    for (let pass = 0; pass < 2; pass++) idx = majority(idx, w, h, levels);
    const out = new Uint8ClampedArray(n * 4), step = 255 / (levels - 1);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const l = lum[i], q = idx[i] * step;
      // saturation boost around the grey of the same brightness, then scaled to the brightness of the step
      let rr = l + (r[i] - l) * 1.35, gg = l + (g[i] - l) * 1.35, bb = l + (b[i] - l) * 1.35;
      if (l > 1) { const k = q / l; rr *= k; gg *= k; bb *= k; } else rr = gg = bb = q;
      // a colour too bright for its channel keeps its hue by moving towards white
      const over = Math.max(rr, gg, bb);
      if (over > 255) { const t = (over - 255) / over; rr = rr * (1 - t) + 255 * t; gg = gg * (1 - t) + 255 * t; bb = bb * (1 - t) + 255 * t; }
      out[p] = rr; out[p + 1] = gg; out[p + 2] = bb; out[p + 3] = 255;
    }
    if (lines > 0) {
      const m = inkLines(rgba, w, h, {
        sigma: Math.max(1, u * 1.8),
        high: lerp(70, 12, lines),
        minLen: Math.round(u * lerp(50, 14, lines)) + 3,
        width: 2.2 * u,
        suppress: 0.7,
      });
      for (let i = 0, p = 0; i < n; i++, p += 4) if (m[i]) { out[p] = 20; out[p + 1] = 20; out[p + 2] = 24; }
    }
    return out;
  }

  /** 3×3 majority vote over small integer labels (ties keep the centre) */
  function majority(idx, w, h, k) {
    const out = new Uint8Array(idx.length), cnt = new Uint8Array(k);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      cnt.fill(0);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) cnt[idx[yy * w + Math.min(w - 1, Math.max(0, x + dx))]]++;
      }
      const c = idx[y * w + x];
      let best = c;
      for (let v = 0; v < k; v++) if (cnt[v] > cnt[best]) best = v;
      out[y * w + x] = best;
    }
    return out;
  }

  // Ink mask → black on white; a soft 1 px fringe outside the lines keeps them from looking jagged
  function inkToRgba(m, w, h) {
    const n = w * h, f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = m[i];
    const a = blur(f, w, h, 0.7), out = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const v = m[i] ? 0 : 255 * (1 - Math.min(1, a[i] * 1.5));
      out[p] = out[p + 1] = out[p + 2] = v; out[p + 3] = 255;
    }
    return out;
  }

  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  /** Pencil sketch: grey photo "colour dodged" with its blurred negative – only edges stay dark, like
      pencil strokes; shading 0–100 lays the photo's own tones over it like hatching */
  function sketch(rgba, w, h, opts) {
    const shading = clamp(Number(opts.shading ?? 40), 0, 100) / 100;
    const u = unitOf(w, h), n = w * h, g = new Float32Array(n);
    // lifted a little: a flat black area (a dark screen) becomes paper, not a black blot
    for (let i = 0, p = 0; i < n; i++, p += 4) g[i] = 24 + lum(rgba[p], rgba[p + 1], rgba[p + 2]) * (231 / 255);
    const inv = new Float32Array(n);
    for (let i = 0; i < n; i++) inv[i] = 255 - g[i];
    const b = blur(inv, w, h, Math.max(1, u * 3));
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      let d = Math.min(255, g[i] * 255 / Math.max(1, 255 - b[i]));
      d = 255 * Math.pow(d / 255, 1.6);                         // stronger strokes
      d *= 1 - shading * 0.5 * (1 - g[i] / 255);                  // tone in the dark parts
      out[p] = d; out[p + 1] = d; out[p + 2] = d * 0.97; out[p + 3] = 255;   // a touch of warm paper
    }
    return out;
  }

  /** Kuwahara filter: every pixel takes the mean colour of the calmest of the four squares around it.
      Edges stay sharp, texture turns into brush-like patches. O(n) for any radius: the square means come
      from box blurs (mean of a square around its centre) read at shifted positions. */
  function kuwahara(rgba, w, h, r) {
    const n = w * h, [R, G, B] = channels(rgba, w, h), L = new Float32Array(n), L2 = new Float32Array(n);
    for (let i = 0; i < n; i++) { const l = lum(R[i], G[i], B[i]); L[i] = l; L2[i] = l * l; }
    const half = Math.max(1, Math.round(r / 2));
    const mean = ch => { const a = new Float32Array(n); boxH(ch, a, w, h, half); const b = new Float32Array(n); boxV(a, b, w, h, half); return b; };
    const mR = mean(R), mG = mean(G), mB = mean(B), mL = mean(L), mL2 = mean(L2);
    const out = new Uint8ClampedArray(n * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let best = -1, bv = Infinity;
      for (let q = 0; q < 4; q++) {
        const xx = clamp(x + (q & 1 ? half : -half), 0, w - 1), yy = clamp(y + (q & 2 ? half : -half), 0, h - 1);
        const j = yy * w + xx, v = mL2[j] - mL[j] * mL[j];
        if (v < bv) { bv = v; best = j; }
      }
      const p = (y * w + x) * 4;
      out[p] = mR[best]; out[p + 1] = mG[best]; out[p + 2] = mB[best]; out[p + 3] = 255;
    }
    return out;
  }

  /** Oil painting: Kuwahara with the brush size, a little more colour and a soft canvas texture */
  function oil(rgba, w, h, opts) {
    const brush = clamp(Math.round(Number(opts.brush ?? 4)), 1, 10);
    const u = unitOf(w, h);
    let out = kuwahara(rgba, w, h, Math.max(2, Math.round(brush * u * 1.6)));
    out = kuwahara(out, w, h, Math.max(2, Math.round(brush * u * 0.8)));   // second, smaller pass rounds the patches
    const tex = paper(w, h, Math.max(0.8, u * 0.8));
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const l = lum(out[p], out[p + 1], out[p + 2]), k = 1 + 0.08 * tex[i];
      out[p] = (l + (out[p] - l) * 1.25) * k; out[p + 1] = (l + (out[p + 1] - l) * 1.25) * k; out[p + 2] = (l + (out[p + 2] - l) * 1.25) * k;
    }
    return out;
  }

  /** Repeatable paper grain −1…1 (hash noise, blurred) – the same for the same size, so tests can rely on it */
  function paper(w, h, sigma) {
    const n = w * h, a = new Float32Array(n);
    let s = 0x9e3779b9;
    for (let i = 0; i < n; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; a[i] = ((s >>> 0) / 4294967296) * 2 - 1; }
    const b = blur(a, w, h, sigma);
    let max = 1e-6;
    for (let i = 0; i < n; i++) max = Math.max(max, Math.abs(b[i]));
    for (let i = 0; i < n; i++) b[i] /= max;
    return b;
  }

  /** Watercolour: soft Kuwahara patches, lighter and paler colours, pigment pooling at the edges, paper grain */
  function watercolor(rgba, w, h, opts) {
    const soft = clamp(Number(opts.softness ?? 50), 0, 100) / 100;
    const u = unitOf(w, h), n = w * h;
    const base = kuwahara(kuwahara(rgba, w, h, Math.max(2, Math.round(u * lerp(4, 10, soft)))), w, h, Math.max(2, Math.round(u * lerp(2, 5, soft))));
    const [R, G, B] = channels(base, w, h).map(c => blur(c, w, h, Math.max(0.8, u * lerp(0.8, 2.2, soft))));
    const L = new Float32Array(n);
    for (let i = 0; i < n; i++) L[i] = lum(R[i], G[i], B[i]);
    // edge strength of the patches: the pigment collects where a wash ends
    const Lb = blur(L, w, h, Math.max(1, u * 1.2));
    const edge = new Float32Array(n);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      edge[i] = Math.min(1, Math.hypot(Lb[i + 1] - Lb[i - 1], Lb[i + w] - Lb[i - w]) / 40);
    }
    const tex = paper(w, h, Math.max(1, u * 1.5)), out = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const dark = 1 - 0.35 * edge[i], grain = 1 + 0.07 * tex[i];
      for (let c = 0; c < 3; c++) {
        let v = [R, G, B][c][i];
        v = L[i] + (v - L[i]) * 1.2;            // pigment: a little more colour
        v = 255 - (255 - v) * 0.68;              // thinned with water: lighter, no deep blacks
        out[p + c] = v * dark * grain;
      }
      out[p + 3] = 255;
    }
    return out;
  }

  /** Pop art: the photo in four flat tones of a loud palette (thresholds from the photo's own brightness,
      so every photo gets all four colours) */
  const POP = [
    [[24, 20, 74], [232, 30, 120], [255, 214, 0], [130, 230, 240]],
    [[10, 10, 10], [220, 30, 40], [30, 90, 220], [255, 230, 40]],
    [[60, 20, 90], [255, 100, 40], [120, 220, 90], [255, 250, 220]],
    [[0, 70, 80], [250, 80, 160], [255, 170, 60], [250, 245, 140]],
  ];
  function popart(rgba, w, h, opts) {
    const pal = POP[clamp(Math.round(Number(opts.palette ?? 1)), 1, POP.length) - 1];
    const u = unitOf(w, h), n = w * h, L = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) L[i] = lum(rgba[p], rgba[p + 1], rgba[p + 2]);
    const Lb = blur(L, w, h, Math.max(1, u * 1.5));
    const hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) hist[Math.min(255, Math.max(0, Math.round(Lb[i])))]++;
    const cuts = [];
    for (let v = 0, acc = 0, k = 1; v < 256 && k < 4; v++) { acc += hist[v]; while (k < 4 && acc >= n * k / 4) { cuts.push(v); k++; } }
    let idx = new Uint8Array(n);
    for (let i = 0; i < n; i++) idx[i] = Lb[i] <= cuts[0] ? 0 : Lb[i] <= cuts[1] ? 1 : Lb[i] <= cuts[2] ? 2 : 3;
    for (let pass = 0; pass < 2; pass++) idx = majority(idx, w, h, 4);
    const out = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) { const c = pal[idx[i]]; out[p] = c[0]; out[p + 1] = c[1]; out[p + 2] = c[2]; out[p + 3] = 255; }
    return out;
  }

  /** Halftone (old comic print): dots on white paper in a staggered grid; each dot has the colour of its
      cell and is the larger the darker the cell is */
  function halftone(rgba, w, h, opts) {
    const size = clamp(Math.round(Number(opts.dotSize ?? 10)), 3, 20);
    const u = unitOf(w, h), c = Math.max(3, size * u), n = w * h;
    const rows = Math.ceil(h / c) + 1, cols = Math.ceil(w / c) + 2;
    const sum = new Float32Array(rows * cols * 4);
    const cellOf = (x, y) => { const row = Math.floor(y / c), shift = row & 1 ? c / 2 : 0; return [row, Math.floor((x + shift) / c), shift]; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [row, col] = cellOf(x + 0.5, y + 0.5), k = (row * cols + col) * 4, p = (y * w + x) * 4;
      sum[k] += rgba[p]; sum[k + 1] += rgba[p + 1]; sum[k + 2] += rgba[p + 2]; sum[k + 3]++;
    }
    const out = new Uint8ClampedArray(n * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [row, col, shift] = cellOf(x + 0.5, y + 0.5), k = (row * cols + col) * 4, cnt = sum[k + 3] || 1;
      let r = sum[k] / cnt, g = sum[k + 1] / cnt, b = sum[k + 2] / cnt;
      const l = lum(r, g, b);
      // ink colour: the cell's hue, darker and stronger, so light cells do not vanish
      const k2 = l > 1 ? Math.min(1, 150 / l) : 1;
      r = l * k2 + (r - l) * 1.4 * k2; g = l * k2 + (g - l) * 1.4 * k2; b = l * k2 + (b - l) * 1.4 * k2;
      const rad = c * 0.62 * Math.sqrt(1 - l / 255 * 0.92);
      const cx = (col + 0.5) * c - shift, cy = (row + 0.5) * c;
      const cover = clamp(rad - Math.hypot(x + 0.5 - cx, y + 0.5 - cy) + 0.5, 0, 1);
      const p = (y * w + x) * 4;
      out[p] = 255 + (r - 255) * cover; out[p + 1] = 255 + (g - 255) * cover; out[p + 2] = 250 + (b - 250) * cover; out[p + 3] = 255;
    }
    return out;
  }

  /** Pixel art: big square pixels in the mean colour, each channel in six steps (like old game consoles) */
  function pixel(rgba, w, h, opts) {
    const size = clamp(Math.round(Number(opts.pixelSize ?? 10)), 2, 30);
    const c = Math.max(2, Math.round(size * unitOf(w, h))), out = new Uint8ClampedArray(w * h * 4);
    for (let by = 0; by < h; by += c) for (let bx = 0; bx < w; bx += c) {
      const ex = Math.min(w, bx + c), ey = Math.min(h, by + c);
      let r = 0, g = 0, b = 0, k = 0;
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const p = (y * w + x) * 4; r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; k++; }
      const q = v => Math.round(v / k / 51) * 51;
      r = q(r); g = q(g); b = q(b);
      for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) { const p = (y * w + x) * 4; out[p] = r; out[p + 1] = g; out[p + 2] = b; out[p + 3] = 255; }
    }
    return out;
  }

  /** Black & white: brightness stretched from the 1st to the 99th percentile, then contrast 0–100 (S curve) */
  function bw(rgba, w, h, opts) {
    const contrast = clamp(Number(opts.contrast ?? 30), 0, 100) / 100;
    const n = w * h, L = new Float32Array(n), hist = new Uint32Array(256);
    for (let i = 0, p = 0; i < n; i++, p += 4) { L[i] = lum(rgba[p], rgba[p + 1], rgba[p + 2]); hist[Math.round(L[i])]++; }
    let lo = 0, hi = 255;
    for (let v = 0, acc = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.01) { lo = v; break; } }
    for (let v = 255, acc = 0; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.01) { hi = v; break; } }
    if (hi - lo < 10) { lo = 0; hi = 255; }
    const k = 1 + contrast * 4, out = new Uint8ClampedArray(n * 4);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const t = clamp((L[i] - lo) / (hi - lo), 0, 1);
      // logistic S curve through (0.5, 0.5), scaled so 0 and 1 stay 0 and 1
      const s = x => 1 / (1 + Math.exp(-k * 2 * (x - 0.5)));
      const v = k > 1 ? (s(t) - s(0)) / (s(1) - s(0)) : t;
      out[p] = out[p + 1] = out[p + 2] = v * 255; out[p + 3] = 255;
    }
    return out;
  }

  /** Vintage: sepia tones, faded blacks, dark corners (vignette) – strength 0–100 */
  function vintage(rgba, w, h, opts) {
    const s = clamp(Number(opts.tone ?? 70), 0, 100) / 100;
    const out = new Uint8ClampedArray(w * h * 4), cx = w / 2, cy = h / 2, rmax = Math.hypot(cx, cy);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4, r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      // classic sepia matrix, mixed with the original by the strength
      let sr = 0.393 * r + 0.769 * g + 0.189 * b, sg = 0.349 * r + 0.686 * g + 0.168 * b, sb = 0.272 * r + 0.534 * g + 0.131 * b;
      sr = r + (sr - r) * s; sg = g + (sg - g) * s; sb = b + (sb - b) * s;
      // faded: black becomes a dark brown-grey
      const fade = 28 * s;
      sr = fade + sr * (1 - fade / 255); sg = fade * 0.9 + sg * (1 - fade / 255); sb = fade * 0.75 + sb * (1 - fade / 255);
      const d = Math.hypot(x - cx, y - cy) / rmax, v = 1 - s * 0.55 * Math.pow(d, 2.2);
      out[p] = sr * v; out[p + 1] = sg * v; out[p + 2] = sb * v; out[p + 3] = 255;
    }
    return out;
  }

  /** Transparent parts become white paper (PNG logos, screenshots) */
  function flatten(rgba) {
    const out = new Uint8ClampedArray(rgba.length);
    for (let p = 0; p < rgba.length; p += 4) {
      const a = rgba[p + 3] / 255, white = 255 * (1 - a);
      out[p] = rgba[p] * a + white; out[p + 1] = rgba[p + 1] * a + white; out[p + 2] = rgba[p + 2] * a + white; out[p + 3] = 255;
    }
    return out;
  }

  /* Filters in the order of the app, with their sliders: [key, min, max, step, default, unit]
     ('%' = percent, 'palette' = palette number). Keys are unique over all filters (flat settings object). */
  const SLIDERS = {
    original: [],
    coloring: [['detail', 0, 100, 5, 40, '%'], ['thickness', 1, 5, 1, 2, '']],
    comic: [['levels', 2, 8, 1, 5, ''], ['lines', 0, 100, 5, 50, '%']],
    sketch: [['shading', 0, 100, 5, 40, '%']],
    watercolor: [['softness', 0, 100, 5, 50, '%']],
    oil: [['brush', 1, 10, 1, 4, '']],
    popart: [['palette', 1, 4, 1, 1, 'palette']],
    halftone: [['dotSize', 3, 20, 1, 10, '']],
    pixel: [['pixelSize', 2, 30, 1, 10, '']],
    bw: [['contrast', 0, 100, 5, 30, '%']],
    vintage: [['tone', 0, 100, 5, 70, '%']],
  };
  const FILTERS = Object.keys(SLIDERS);
  const RUN = { coloring, comic, sketch, watercolor, oil, popart, halftone, pixel, bw, vintage };
  function apply(rgba, w, h, filter, opts = {}) {
    const flat = flatten(rgba);
    return RUN[filter] ? RUN[filter](flat, w, h, opts) : flat;
  }

  root.PhotoFilters = { FILTERS, SLIDERS, apply, blur, canny, removeSpecks, dilate };
})(typeof self !== 'undefined' ? self : globalThis);
