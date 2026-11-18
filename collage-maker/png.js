/* PNG writer for images larger than any canvas (see README.md in this folder).

   The picture arrives in strips of rows (RGBA from getImageData), is filtered (PNG filter "Up"),
   compressed by the browser (CompressionStream 'deflate' = zlib, as PNG needs it) and collected as IDAT
   chunks of about 1 MB. Only the compressed file is held in memory, never the whole picture.

   CollagePng.supported()          CompressionStream available
   const w = CollagePng.writer(width, height)
   await w.rows(rgba, rowCount)    next rows, RGBA of exactly `width` pixels each (alpha is dropped)
   const blob = await w.finish()   image/png, 8-bit RGB
   w.abort()                       stop and drop everything */
(function (root) {
  'use strict';

  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    CRC[n] = c >>> 0;
  }
  function crc32(parts) {
    let c = 0xFFFFFFFF;
    for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC[(c ^ p[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  const u32 = (v, out = new Uint8Array(4), o = 0) => { out[o] = v >>> 24; out[o + 1] = v >>> 16 & 255; out[o + 2] = v >>> 8 & 255; out[o + 3] = v & 255; return out; };
  // [length, type] + data + [crc] – returned as parts for a Blob, so the data is not copied
  function chunk(type, data) {
    const head = new Uint8Array(8);
    u32(data.length, head, 0);
    for (let i = 0; i < 4; i++) head[4 + i] = type.charCodeAt(i);
    return [head, data, u32(crc32([head.subarray(4), data]))];
  }

  const supported = () => typeof CompressionStream === 'function';

  function writer(width, height) {
    if (!(width > 0 && height > 0 && width <= 0x7FFFFFFF && height <= 0x7FFFFFFF)) throw new Error('bad size');
    const ihdr = new Uint8Array(13);
    u32(width, ihdr, 0); u32(height, ihdr, 4);
    ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8 bit, RGB, deflate, filter set 0, no interlace
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunk('IHDR', ihdr)];
    const cs = new CompressionStream('deflate');
    const out = cs.writable.getWriter();
    let pending = [], pendingLen = 0, aborted = false;
    const flush = () => {
      if (!pendingLen) return;
      const data = new Uint8Array(pendingLen);
      let o = 0;
      for (const p of pending) { data.set(p, o); o += p.length; }
      parts.push(...chunk('IDAT', data));
      pending = []; pendingLen = 0;
    };
    // Reads the compressed bytes while rows are written – otherwise the stream would stall
    const reading = (async () => {
      const reader = cs.readable.getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        pending.push(value); pendingLen += value.length;
        if (pendingLen >= 1 << 20) flush();
      }
      flush();
    })();
    reading.catch(() => {});
    const stride = width * 3;
    let prev = new Uint8Array(stride), y = 0;   // row above (zeros before the first row)

    async function rows(rgba, count) {
      if (aborted) throw new Error('aborted');
      if (y + count > height) throw new Error('too many rows');
      const buf = new Uint8Array(count * (stride + 1));
      let o = 0, s = 0;
      for (let r = 0; r < count; r++) {
        buf[o++] = 2;   // filter "Up": difference to the pixel above
        const row = o;
        for (let x = 0; x < width; x++, s += 4) {
          buf[o++] = rgba[s]; buf[o++] = rgba[s + 1]; buf[o++] = rgba[s + 2];
        }
        const cur = buf.slice(row, row + stride);
        for (let i = 0; i < stride; i++) buf[row + i] = (cur[i] - prev[i]) & 255;
        prev = cur;
      }
      y += count;
      await out.ready;
      out.write(buf).catch(() => {});
    }
    async function finish() {
      if (y !== height) throw new Error('missing rows');
      await out.close();
      await reading;
      parts.push(...chunk('IEND', new Uint8Array(0)));
      return new Blob(parts, { type: 'image/png' });
    }
    function abort() { aborted = true; try { out.abort(); } catch (_) { /* already closed */ } pending = []; parts.length = 0; }
    return { rows, finish, abort };
  }

  root.CollagePng = { supported, writer, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
