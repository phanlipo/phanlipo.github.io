/* Photo filters of the Foto-Editor – pure pixel maths, no DOM. Used by filter-worker.js and (fallback,
   tests) by the page itself. All functions take and return RGBA pixel arrays (Uint8ClampedArray, w×h×4).

   PhotoFilters.apply(rgba, w, h, filter, opts) → new Uint8ClampedArray (opaque; transparency becomes white)
     'comic':    flat colours in a few brightness steps (cel shading) plus black ink lines
                 opts.levels 2–8 (steps), opts.lines 0–100 (how many lines; 0 = none)
     'coloring': black outlines on white for colouring in – no shading, small specks removed
                 opts.detail 0–100 (more lines), opts.thickness 1–5 (line width)
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

  /** Transparent parts become white paper (PNG logos, screenshots) */
  function flatten(rgba) {
    const out = new Uint8ClampedArray(rgba.length);
    for (let p = 0; p < rgba.length; p += 4) {
      const a = rgba[p + 3] / 255, white = 255 * (1 - a);
      out[p] = rgba[p] * a + white; out[p + 1] = rgba[p + 1] * a + white; out[p + 2] = rgba[p + 2] * a + white; out[p + 3] = 255;
    }
    return out;
  }

  const FILTERS = ['original', 'comic', 'coloring'];
  function apply(rgba, w, h, filter, opts = {}) {
    const flat = flatten(rgba);
    if (filter === 'comic') return comic(flat, w, h, opts);
    if (filter === 'coloring') return coloring(flat, w, h, opts);
    return flat;
  }

  root.PhotoFilters = { FILTERS, apply, blur, canny, removeSpecks, dilate };
})(typeof self !== 'undefined' ? self : globalThis);
