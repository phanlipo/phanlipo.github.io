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

// Fake detection worker: two people, mask = left half of the picture is a person
const FAKE_WORKER = `
const MODE = %MODE%;
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
    setTimeout(() => self.postMessage(data.segment ? { type: 'result', persons, mask, maskW: W, maskH: H, ms: 5 } : { type: 'result', persons, mask: null, ms: 5 }, data.segment ? [mask.buffer] : []), 20);
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

