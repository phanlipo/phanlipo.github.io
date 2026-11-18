// Animated GIF (GIF89a) encoder for Gesichter-Zeitraffer – no DOM, no library.
// window.GifEncoder(width, height) → { frame(rgba, delayCs), finish() → Uint8Array }
//   rgba: RGBA pixels (Uint8ClampedArray of width × height × 4, e.g. ImageData.data), delayCs: hundredths of a second.
// Every frame gets its own palette of up to 256 colours (median cut on a 15-bit histogram), the animation loops forever.
(function () {
'use strict';
const BITS = 5, LEVELS = 1 << BITS, BINS = LEVELS ** 3, SHIFT = 8 - BITS;

// Median cut: returns { palette (r,g,b × n), lut (bin → palette index) }
function quantize(px, maxColors = 256) {
  const count = new Uint32Array(BINS), sr = new Uint32Array(BINS), sg = new Uint32Array(BINS), sb = new Uint32Array(BINS);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const k = ((r >> SHIFT) << (2 * BITS)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);
    count[k]++; sr[k] += r; sg[k] += g; sb[k] += b;
  }
  let n = 0;
  for (let k = 0; k < BINS; k++) if (count[k]) n++;
  const bins = new Uint16Array(n);
  n = 0;
  for (let k = 0; k < BINS; k++) if (count[k]) bins[n++] = k;
  const ch = (k, c) => c === 0 ? k >> (2 * BITS) : c === 1 ? (k >> BITS) & (LEVELS - 1) : k & (LEVELS - 1);
  // A box is a range of `bins`; split the one with the highest score along its widest channel until there are enough
  const box = (start, end) => {
    let pixels = 0, best = 0, axis = 0;
    const lo = [LEVELS, LEVELS, LEVELS], hi = [0, 0, 0];
    for (let i = start; i < end; i++) {
      const k = bins[i]; pixels += count[k];
      for (let c = 0; c < 3; c++) { const v = ch(k, c); if (v < lo[c]) lo[c] = v; if (v > hi[c]) hi[c] = v; }
    }
    for (let c = 0; c < 3; c++) if (hi[c] - lo[c] > best) { best = hi[c] - lo[c]; axis = c; }
    // Wide boxes count more than full ones: keeps rare but very different colours (a red dot) apart
    return { start, end, pixels, range: best, axis, score: best ? Math.sqrt(pixels) * (best + 1) ** 2 : 0 };
  };
  const boxes = [box(0, n)];
  while (boxes.length < maxColors) {
    let bi = -1, top = 0;
    for (let i = 0; i < boxes.length; i++) if (boxes[i].score > top) { top = boxes[i].score; bi = i; }
    if (bi < 0) break;
    const b = boxes[bi], axis = b.axis;
    const part = Array.from(bins.subarray(b.start, b.end)).sort((x, y) => ch(x, axis) - ch(y, axis));
    bins.set(part, b.start);
    // Median by pixel count, but every half keeps at least one bin
    let acc = 0, cut = b.end - 1;
    for (let i = b.start; i < b.end - 1; i++) { acc += count[bins[i]]; if (acc * 2 >= b.pixels) { cut = i + 1; break; } }
    boxes.splice(bi, 1, box(b.start, cut), box(cut, b.end));
  }
  const palette = new Uint8Array(boxes.length * 3), lut = new Uint8Array(BINS);
  boxes.forEach((b, j) => {
    let c = 0, r = 0, g = 0, bl = 0;
    for (let i = b.start; i < b.end; i++) { const k = bins[i]; c += count[k]; r += sr[k]; g += sg[k]; bl += sb[k]; lut[k] = j; }
    palette[3 * j] = Math.round(r / c); palette[3 * j + 1] = Math.round(g / c); palette[3 * j + 2] = Math.round(bl / c);
  });
  return { palette, lut };
}

// LZW for GIF (variable code size, clear code when the table is full) → data sub-blocks
const table = new Int32Array(4096 * 256), stamp = new Uint32Array(4096 * 256);
let gen = 0;
function lzw(index, minCode) {
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  const bytes = new Uint8Array(index.length * 2 + 16);
  let n = 0, cur = 0, shift = 0;
  const emit = code => { cur |= code << shift; shift += size; while (shift >= 8) { bytes[n++] = cur & 255; cur >>>= 8; shift -= 8; } };
  gen++;
  emit(clear);
  let prefix = index[0];
  for (let i = 1; i < index.length; i++) {
    const k = index[i], key = (prefix << 8) | k;
    if (stamp[key] === gen) { prefix = table[key]; continue; }
    emit(prefix);
    if (next === 4096) { emit(clear); next = eoi + 1; size = minCode + 1; gen++; }
    else { if (next >= 1 << size) size++; table[key] = next++; stamp[key] = gen; }
    prefix = k;
  }
  emit(prefix); emit(eoi);
  if (shift > 0) bytes[n++] = cur & 255;
  // Code size byte, sub-blocks of at most 255 bytes, block terminator
  const out = new Uint8Array(1 + n + Math.ceil(n / 255) + 1);
  let o = 0;
  out[o++] = minCode;
  for (let i = 0; i < n; i += 255) { const len = Math.min(255, n - i); out[o++] = len; out.set(bytes.subarray(i, i + len), o); o += len; }
  out[o++] = 0;
  return out.subarray(0, o);
}

function GifEncoder(width, height) {
  const chunks = [];
  const u16 = v => [v & 255, (v >> 8) & 255];
  chunks.push(new Uint8Array([...'GIF89a'].map(c => c.charCodeAt(0)).concat(u16(width), u16(height), 0x70, 0, 0)));
  // Loop forever (NETSCAPE2.0 application extension)
  chunks.push(new Uint8Array([0x21, 0xff, 0x0b, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0]));
  return {
    frame(px, delayCs) {
      const { palette, lut } = quantize(px);
      const index = new Uint8Array(width * height);
      for (let i = 0, j = 0; j < index.length; i += 4, j++)
        index[j] = lut[((px[i] >> SHIFT) << (2 * BITS)) | ((px[i + 1] >> SHIFT) << BITS) | (px[i + 2] >> SHIFT)];
      const delay = Math.max(2, Math.round(delayCs));
      const out = [0x21, 0xf9, 4, 0x04, ...u16(delay), 0, 0, 0x2c, 0, 0, 0, 0, ...u16(width), ...u16(height), 0x87];
      for (let i = 0; i < 768; i++) out.push(palette[i] ?? 0);
      chunks.push(new Uint8Array(out), lzw(index, 8));
    },
    finish() {
      chunks.push(new Uint8Array([0x3b]));
      const total = chunks.reduce((s, c) => s + c.length, 0), all = new Uint8Array(total);
      let o = 0; for (const c of chunks) { all.set(c, o); o += c.length; }
      return all;
    },
  };
}
GifEncoder.quantize = quantize;
window.GifEncoder = GifEncoder;
})();
