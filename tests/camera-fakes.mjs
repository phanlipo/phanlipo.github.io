// Fakes for Kamera-Effekte (camera-effects.spec.mjs, webmcp.spec.mjs): camera picture, detection worker, pixel reader.

export const URL_ = '/camera-effects/';
export const LS = 'camera-effects.settings.v1';
// Fake camera: 320×240 in four colours – top left red, top right green, bottom left blue, bottom right white.
// Records the constraints of every getUserMedia call and the tracks it hands out.
export async function fakeCamera(page, { deny } = {}) {
  await page.addInitScript(deny => {
    window.__gum = []; window.__tracks = [];
    navigator.mediaDevices.getUserMedia = async c => {
      window.__gum.push(c);
      if (deny) throw new DOMException('denied', deny);
      const cv = document.createElement('canvas'); cv.width = 320; cv.height = 240;
      const x = cv.getContext('2d');
      const paint = () => {
        x.fillStyle = '#ff0000'; x.fillRect(0, 0, 160, 120); x.fillStyle = '#00ff00'; x.fillRect(160, 0, 160, 120);
        x.fillStyle = '#0000ff'; x.fillRect(0, 120, 160, 120); x.fillStyle = '#ffffff'; x.fillRect(160, 120, 160, 120);
      };
      paint(); setInterval(paint, 40);
      const s = cv.captureStream(25);
      window.__tracks.push(...s.getTracks());
      return s;
    };
  }, deny);
}

// Colour of the output picture at fractions of its width/height (the canvas keeps its drawing buffer)
export const pixel = (page, fx, fy, id = 'out') => page.evaluate(([fx, fy, id]) => {
  const src = document.getElementById(id), c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d'); x.drawImage(src, 0, 0);
  return [...x.getImageData(Math.floor(fx * c.width), Math.floor(fy * c.height), 1, 1).data.slice(0, 3)];
}, [fx, fy, id]);

// Fake detection worker: two people, mask = left half of the picture is a person, one face (FACE below).
// Modes: 'ok', 'fail' (download fails), 'open' (the face opens its mouth)
// Face in camera pixels of the 320×240 fake picture: eyes (40, 80) and (120, 80) → 80 px apart, nose tip (80, 100),
// mouth (80, 120), forehead top (80, 20), chin (80, 190), cheeks (−10, 100) and (170, 100) → 180 px wide.
export const FACE = { eyeA: [40, 80], eyeB: [120, 80], nose: [80, 100], mouth: [80, 120], top: [80, 20], width: 180 };
const FAKE_WORKER = `
const MODE = %MODE%;
function face() {
  const f = new Float32Array(478 * 2), set = (i, x, y) => { f[2 * i] = x / 320; f[2 * i + 1] = y / 240; };
  for (let i = 0; i < 478; i++) set(i, 80, 100);
  set(468, 40, 80); set(473, 120, 80); set(33, 25, 80); set(133, 55, 80); set(362, 105, 80); set(263, 135, 80);
  set(1, 80, 100); set(2, 80, 108); set(0, 80, 114); set(13, 80, 119); set(14, 80, MODE === 'open' ? 140 : 121);
  set(61, 55, 120); set(291, 105, 120); set(10, 80, 20); set(152, 80, 190); set(234, -10, 100); set(454, 170, 100);
  return f;
}
self.onmessage = ({ data }) => {
  if (data.type === 'load') {
    if (MODE === 'fail') return setTimeout(() => self.postMessage({ type: 'error', task: data.task, code: 'download', message: 'offline' }), 50);
    self.postMessage({ type: 'progress', task: data.task, loaded: 50, total: 100 });
    setTimeout(() => self.postMessage({ type: 'loaded', task: data.task }), 50);
  } else if (data.type === 'frame') {
    const W = 16, H = 12, mask = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) mask[y * W + x] = 255;
    data.bitmap.close();
    const persons = data.detect ? [{ x: 0.1, y: 0.2, w: 0.3, h: 0.6, score: 0.91 }, { x: 0.6, y: 0.1, w: 0.2, h: 0.5, score: 0.72 }] : [];
    const faces = data.face ? [face()] : [];
    setTimeout(() => self.postMessage(data.segment ? { type: 'result', persons, mask, maskW: W, maskH: H, faces, ms: 5 } : { type: 'result', persons, mask: null, faces, ms: 5 }, data.segment ? [mask.buffer] : []), 20);
  }
};`;
export async function fakeWorker(page, mode = 'ok') {
  const hits = { n: 0 };
  await page.context().route(/camera-effects\/vision-worker\.mjs/, r => {
    hits.n++;
    return r.fulfill({ contentType: 'text/javascript', body: FAKE_WORKER.replace('%MODE%', JSON.stringify(mode)) });
  });
  return hits;
}

