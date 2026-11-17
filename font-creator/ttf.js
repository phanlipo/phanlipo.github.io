/* Schrift-Baukasten: turns drawn strokes into outlines and writes a TrueType font (.ttf).
   No DOM, no library – see README.md for the file layout.

   FontTTF.strokeContours(stroke)  stroke = { w, pts: [[x, y], …] } in font units (y up)
                                   → contours [[{ x, y, on }, …], …]: one circle per point, one
                                   rectangle per segment, all clockwise. TrueType fills with the
                                   non-zero rule, so overlapping parts simply add up to the stroke.
   FontTTF.simplify(pts, eps)      Ramer–Douglas–Peucker: fewer points, same shape
   FontTTF.build(font)             font = { family, glyphs: [{ code, contours, advance }], spaceWidth,
                                   ascender, descender, lineGap, xHeight, capHeight } → ArrayBuffer */
(function (root) {
  'use strict';

  /* ---------- Geometry ---------- */
  const COS8 = Math.cos(Math.PI / 8);

  // Circle from 8 off-curve points: TrueType puts an implied on-curve point in the middle of two
  // off-curve points, which lies exactly on the circle when the control points sit at r / cos(22.5°).
  // Rotated by 22.5° the implied points land on the axes, so the points' bounding box is the circle's.
  function circle(cx, cy, r) {
    const R = r / COS8, out = [];
    for (let k = 0; k < 8; k++) {
      const a = Math.PI / 8 - k * Math.PI / 4; // decreasing angle = clockwise with y up
      out.push({ x: Math.round(cx + R * Math.cos(a)), y: Math.round(cy + R * Math.sin(a)), on: false });
    }
    return out;
  }

  function strokeContours({ w, pts }) {
    const r = Math.max(1, w / 2), out = [];
    if (!pts.length) return out;
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i];
      // Round joins: only at the ends and where the line really turns (a straight run needs none)
      if (i > 0 && i < pts.length - 1) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i + 1];
        const a1 = Math.atan2(y - ay, x - ax), a2 = Math.atan2(by - y, bx - x);
        let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
        if (d < 0.05) continue;
      }
      out.push(circle(x, y, r));
    }
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const nx = -dy / len * r, ny = dx / len * r;
      // A+n, B+n, B−n, A−n: clockwise with y up
      out.push([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]
        .map(([px, py]) => ({ x: Math.round(px), y: Math.round(py), on: true })));
    }
    return out;
  }

  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [s, e] = stack.pop();
      const [ax, ay] = pts[s], [bx, by] = pts[e], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
      let best = -1, dist = 0;
      for (let i = s + 1; i < e; i++) {
        const [px, py] = pts[i];
        const d = len ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / len : Math.hypot(px - ax, py - ay);
        if (d > dist) { dist = d; best = i; }
      }
      if (best > 0 && dist > eps) { keep[best] = 1; stack.push([s, best], [best, e]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  /* ---------- Binary writer ---------- */
  class Writer {
    constructor() { this.buf = new Uint8Array(256); this.view = new DataView(this.buf.buffer); this.pos = 0; }
    grow(n) {
      if (this.pos + n <= this.buf.length) return;
      let size = this.buf.length * 2; while (size < this.pos + n) size *= 2;
      const b = new Uint8Array(size); b.set(this.buf); this.buf = b; this.view = new DataView(b.buffer);
    }
    u8(v) { this.grow(1); this.view.setUint8(this.pos, v); this.pos += 1; return this; }
    u16(v) { this.grow(2); this.view.setUint16(this.pos, v & 0xffff); this.pos += 2; return this; }
    i16(v) { this.grow(2); this.view.setInt16(this.pos, v); this.pos += 2; return this; }
    u32(v) { this.grow(4); this.view.setUint32(this.pos, v >>> 0); this.pos += 4; return this; }
    bytes(a) { this.grow(a.length); this.buf.set(a, this.pos); this.pos += a.length; return this; }
    tag(s) { for (let i = 0; i < 4; i++) this.u8(s.charCodeAt(i) || 32); return this; }
    date(ms) { // LONGDATETIME: seconds since 1904-01-01
      const s = Math.floor(ms / 1000) + 2082844800;
      this.u32(Math.floor(s / 4294967296)); this.u32(s % 4294967296); return this;
    }
    pad4() { while (this.pos % 4) this.u8(0); return this; }
    done() { return this.buf.slice(0, this.pos); }
  }

  const checksum = bytes => {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 4) {
      let word = 0;
      for (let k = 0; k < 4; k++) word = word * 256 + (i + k < bytes.length ? v.getUint8(i + k) : 0);
      sum = (sum + word) >>> 0;
    }
    return sum;
  };
  const clamp16 = v => Math.max(-32768, Math.min(32767, Math.round(v)));
  const utf16be = s => { const w = new Writer(); for (let i = 0; i < s.length; i++) w.u16(s.charCodeAt(i)); return w.done(); };

  /* ---------- Font ---------- */
  function bbox(contours) {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    for (const c of contours) for (const p of c) {
      if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y; if (p.y > yMax) yMax = p.y;
    }
    return xMin === Infinity ? null : { xMin, yMin, xMax, yMax };
  }

  function glyphData(contours) {
    const box = bbox(contours);
    if (!box) return { bytes: new Uint8Array(0), box: null, points: 0 };
    const w = new Writer();
    w.i16(contours.length).i16(box.xMin).i16(box.yMin).i16(box.xMax).i16(box.yMax);
    let n = 0;
    for (const c of contours) { n += c.length; w.u16(n - 1); }
    w.u16(0); // no instructions
    const all = contours.flat();
    for (const p of all) w.u8(p.on ? 1 : 0); // every coordinate as a signed 16-bit delta
    let x = 0; for (const p of all) { w.i16(p.x - x); x = p.x; }
    let y = 0; for (const p of all) { w.i16(p.y - y); y = p.y; }
    w.pad4();
    return { bytes: w.done(), box, points: all.length };
  }

  function build(font) {
    const asc = font.ascender ?? 800, desc = font.descender ?? -200, gap = font.lineGap ?? 200;
    const family = (font.family || 'My Font').slice(0, 60);
    const ps = family.replace(/[^A-Za-z0-9-]/g, '').slice(0, 50) || 'MyFont';
    // Glyph 0 .notdef (a box), glyph 1 space, then the drawn ones sorted by code point
    const notdef = [[{ x: 50, y: 0, on: true }, { x: 50, y: 700, on: true }, { x: 450, y: 700, on: true }, { x: 450, y: 0, on: true }],
      [{ x: 100, y: 50, on: true }, { x: 400, y: 50, on: true }, { x: 400, y: 650, on: true }, { x: 100, y: 650, on: true }]];
    const drawn = font.glyphs.filter(g => g.code > 32 && g.code <= 0xffff && g.contours.length)
      .sort((a, b) => a.code - b.code);
    const glyphs = [{ code: null, contours: notdef, advance: 500 }, { code: 32, contours: [], advance: font.spaceWidth ?? 300 }, ...drawn];
    if (glyphs.length > 65535) throw new Error('too many glyphs');
    const data = glyphs.map(g => glyphData(g.contours));

    // glyf + loca (long offsets)
    const glyf = new Writer(), loca = new Writer();
    for (const d of data) { loca.u32(glyf.pos); glyf.bytes(d.bytes); }
    loca.u32(glyf.pos);

    const boxes = data.map(d => d.box).filter(Boolean);
    const g = boxes.reduce((a, b) => ({ xMin: Math.min(a.xMin, b.xMin), yMin: Math.min(a.yMin, b.yMin), xMax: Math.max(a.xMax, b.xMax), yMax: Math.max(a.yMax, b.yMax) }));
    const now = Date.now();

    const head = new Writer();
    head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5F0F3CF5).u16(0x000B).u16(1000)
      .date(now).date(now).i16(g.xMin).i16(g.yMin).i16(g.xMax).i16(g.yMax)
      .u16(0).u16(8).i16(2).i16(1).i16(0);

    let advMax = 0, minLsb = 32767, minRsb = 32767, maxExtent = 0;
    const hmtx = new Writer();
    glyphs.forEach((gl, i) => {
      const b = data[i].box, adv = Math.max(0, Math.round(gl.advance));
      hmtx.u16(adv).i16(b ? b.xMin : 0);
      advMax = Math.max(advMax, adv);
      if (b) { minLsb = Math.min(minLsb, b.xMin); minRsb = Math.min(minRsb, adv - b.xMax); maxExtent = Math.max(maxExtent, b.xMax); }
    });

    const hhea = new Writer();
    hhea.u32(0x00010000).i16(asc).i16(desc).i16(gap).u16(advMax).i16(minLsb).i16(minRsb).i16(maxExtent)
      .i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(glyphs.length);

    let maxPoints = 0, maxContours = 0;
    glyphs.forEach((gl, i) => { maxPoints = Math.max(maxPoints, data[i].points); maxContours = Math.max(maxContours, gl.contours.length); });
    const maxp = new Writer();
    maxp.u32(0x00010000).u16(glyphs.length).u16(maxPoints).u16(maxContours).u16(0).u16(0)
      .u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

    // cmap: format 4 (BMP), one segment per character, then the closing 0xFFFF segment
    const segs = glyphs.map((gl, i) => [gl.code, i]).filter(([c]) => c != null).sort((a, b) => a[0] - b[0]);
    segs.push([0xffff, 0]);
    const segCount = segs.length, log2 = Math.floor(Math.log2(segCount));
    const sub = new Writer();
    sub.u16(4).u16(16 + segCount * 8).u16(0).u16(segCount * 2).u16(2 * 2 ** log2).u16(log2).u16(segCount * 2 - 2 * 2 ** log2);
    for (const [c] of segs) sub.u16(c);
    sub.u16(0);
    for (const [c] of segs) sub.u16(c);
    for (const [c, gid] of segs) sub.u16(c === 0xffff ? 1 : (gid - c + 65536) % 65536);
    for (let i = 0; i < segCount; i++) sub.u16(0);
    const cmap = new Writer();
    cmap.u16(0).u16(1).u16(3).u16(1).u32(12).bytes(sub.done());

    // name: Windows/Unicode records, sorted by name ID
    const names = [[1, family], [2, 'Regular'], [3, `${ps}-Regular-${now.toString(36)}`], [4, family], [5, 'Version 1.000'], [6, ps + '-Regular']]
      .map(([id, s]) => [id, utf16be(s)]);
    const name = new Writer(), strings = new Writer();
    name.u16(0).u16(names.length).u16(6 + names.length * 12);
    for (const [id, b] of names) { name.u16(3).u16(1).u16(0x0409).u16(id).u16(b.length).u16(strings.pos); strings.bytes(b); }
    name.bytes(strings.done());

    const codes = segs.slice(0, -1).map(s => s[0]);
    const avg = Math.round(glyphs.slice(1).reduce((s, gl) => s + gl.advance, 0) / Math.max(1, glyphs.length - 1));
    const winAsc = Math.max(asc, g.yMax), winDesc = Math.max(-desc, -g.yMin);
    const os2 = new Writer();
    os2.u16(4).i16(avg).u16(400).u16(5).u16(0)
      .i16(650).i16(600).i16(0).i16(75).i16(650).i16(600).i16(0).i16(350).i16(50).i16(300)
      .i16(0).bytes(new Uint8Array(10))
      .u32(0b11).u32(0).u32(0).u32(0).tag('NONE')
      .u16(0x00C0) // REGULAR + USE_TYPO_METRICS
      .u16(Math.min(...codes)).u16(Math.max(...codes))
      .i16(asc).i16(desc).i16(gap).u16(clamp16(winAsc)).u16(clamp16(winDesc))
      .u32(1).u32(0).i16(font.xHeight ?? 500).i16(font.capHeight ?? 700).u16(0).u16(32).u16(0);

    const post = new Writer();
    post.u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);

    const tables = { cmap, glyf, head, hhea, hmtx, loca, maxp, name, 'OS/2': os2, post };
    const tags = Object.keys(tables).sort();
    const n = tags.length, sr = 16 * 2 ** Math.floor(Math.log2(n));
    const out = new Writer();
    out.u32(0x00010000).u16(n).u16(sr).u16(Math.floor(Math.log2(n))).u16(n * 16 - sr);
    let offset = 12 + n * 16;
    const blobs = tags.map(t => tables[t].done());
    tags.forEach((t, i) => {
      out.tag(t).u32(checksum(blobs[i])).u32(offset).u32(blobs[i].length);
      offset += Math.ceil(blobs[i].length / 4) * 4;
    });
    let headAt = 0;
    tags.forEach((t, i) => { if (t === 'head') headAt = out.pos; out.bytes(blobs[i]).pad4(); });
    const file = out.done();
    new DataView(file.buffer).setUint32(headAt + 8, (0xB1B0AFBA - checksum(file)) >>> 0);
    return file.buffer;
  }

  root.FontTTF = { strokeContours, simplify, build, bbox };
})(typeof window !== 'undefined' ? window : globalThis);
