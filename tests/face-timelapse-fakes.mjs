// Fakes for Gesichter-Zeitraffer (face-timelapse.spec.mjs, webmcp.spec.mjs): test photos drawn in the browser,
// a JPEG with an EXIF date, and a detection worker that finds "eyes" as pure red dots in the picture.
export const URL_ = '/face-timelapse/';
export const LS = 'face-timelapse.settings.v1';

// Fake worker: every pure red blob is an eye; blobs sorted from left to right make faces in pairs
// (first + second = face 1 …), faces with eyes less than 3 % of the width apart are missed. Modes: 'ok', 'fail' (download fails), 'slow' (each answer after 300 ms).
const FAKE_WORKER = `
const MODE = %MODE%;
function eyes(bitmap) {
  const W = bitmap.width, H = bitmap.height, c = new OffscreenCanvas(W, H), g = c.getContext('2d');
  g.drawImage(bitmap, 0, 0);
  const d = g.getImageData(0, 0, W, H).data, seen = new Uint8Array(W * H), blobs = [];
  const red = i => d[4 * i] > 200 && d[4 * i + 1] < 60 && d[4 * i + 2] < 60;
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || !red(i)) continue;
    let sx = 0, sy = 0, n = 0; const stack = [i]; seen[i] = 1;
    while (stack.length) {
      const k = stack.pop(), x = k % W, y = (k - x) / W; sx += x; sy += y; n++;
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (!seen[j] && red(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n > 3) blobs.push([(sx / n + 0.5) / W, (sy / n + 0.5) / H]);
  }
  return blobs.sort((a, b) => a[0] - b[0]);
}
self.onmessage = ({ data }) => {
  if (data.type === 'load') {
    if (MODE === 'fail') return setTimeout(() => self.postMessage({ type: 'error', code: 'download', message: 'offline' }), 50);
    self.postMessage({ type: 'progress', loaded: 50, total: 100 });
    setTimeout(() => self.postMessage({ type: 'loaded' }), 50);
  } else if (data.type === 'detect') {
    const b = eyes(data.bitmap), faces = [];
    data.bitmap.close();
    for (let i = 0; i + 1 < b.length; i += 2) {
      // Like the real detector: faces with eyes closer than 3 % of the picture width are missed
      if (b[i + 1][0] - b[i][0] < 0.03) continue;
      const f = new Float32Array(478 * 2);
      f[2 * 468] = b[i][0]; f[2 * 468 + 1] = b[i][1]; f[2 * 473] = b[i + 1][0]; f[2 * 473 + 1] = b[i + 1][1];
      faces.push(f);
    }
    setTimeout(() => self.postMessage({ type: 'faces', id: data.id, faces, ms: 3 }, faces.map(f => f.buffer)), MODE === 'slow' ? 300 : 5);
  }
};`;
export async function fakeWorker(page, mode = 'ok') {
  const hits = { n: 0 };
  await page.context().route(/face-timelapse\/face-worker\.mjs/, r => {
    hits.n++;
    return r.fulfill({ contentType: 'text/javascript', body: FAKE_WORKER.replace('%MODE%', JSON.stringify(mode)) });
  });
  return hits;
}

/** Test photo w×h in colour bg with red eye dots (radius r) at the given pixel positions → PNG/JPEG Buffer */
export async function photo(page, { w = 400, h = 300, bg = '#808080', eyes = [], type = 'image/png', r = 7 } = {}) {
  const b64 = await page.evaluate(({ w, h, bg, eyes, type, r }) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff0000';
    for (const [x, y] of eyes) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    return c.toDataURL(type, 0.95).split(',')[1];
  }, { w, h, bg, eyes, type, r });
  return Buffer.from(b64, 'base64');
}

/** Puts an EXIF block with DateTimeOriginal ("YYYY:MM:DD HH:MM:SS") right after the start of a JPEG */
export function withExifDate(jpeg, when) {
  const tiff = Buffer.alloc(64);
  tiff.write('MM', 0, 'latin1'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
  // IFD0: one entry – pointer to the Exif IFD at 26
  tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x8769, 10); tiff.writeUInt16BE(4, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt32BE(26, 18); tiff.writeUInt32BE(0, 22);
  // Exif IFD: DateTimeOriginal (ASCII, 20 bytes at 44)
  tiff.writeUInt16BE(1, 26); tiff.writeUInt16BE(0x9003, 28); tiff.writeUInt16BE(2, 30); tiff.writeUInt32BE(20, 32); tiff.writeUInt32BE(44, 36); tiff.writeUInt32BE(0, 40);
  tiff.write(when + '\0', 44, 'latin1');
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const head = Buffer.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 255]);
  return Buffer.concat([jpeg.subarray(0, 2), head, body, jpeg.subarray(2)]);
}

/** Colour at fractions of a canvas' width/height */
export const pixel = (page, id, fx, fy) => page.evaluate(([id, fx, fy]) => {
  const src = document.getElementById(id), c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  return [...x.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data.slice(0, 3)];
}, [id, fx, fy]);
export const near = (a, b, tol = 30) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
