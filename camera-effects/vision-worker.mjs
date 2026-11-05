// Person detection and person/background mask for Kamera-Effekte (MediaPipe Tasks Vision, runs on the CPU).
// Messages from the page:
//   { type: 'load', task: 'detect' | 'segment' }   load engine + model once → { type: 'loaded', task } or { type: 'error', task, code }
//   { type: 'frame', bitmap, detect, segment }     → { type: 'result', persons: [{ x, y, w, h, score }] (0…1), mask, maskW, maskH, ms }
// While loading: { type: 'progress', task, loaded, total } (bytes). Notes for the diagnostics: { type: 'log', msg, data }.

// Network guard – installed before the library is imported. MediaPipe 1.x sends usage statistics to Google
// (odml.pa.googleapis.com) without an option to turn it off. This worker may only fetch its own files and
// the two model files; everything else fails like a network error (the library then stops trying).
const MODELS = {
  detect: { url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite', size: 4602795 },
  segment: { url: 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite', size: 249537 },
};
const ALLOWED = new Set(Object.values(MODELS).map(m => m.url));
const ownFetch = self.fetch.bind(self);
const allowed = u => { const url = new URL(u, self.location.href); return url.origin === self.location.origin || ALLOWED.has(url.href); };
const blocked = new Set();
function block(u) {
  const host = new URL(u, self.location.href).host;
  if (!blocked.has(host)) { blocked.add(host); post({ type: 'log', msg: 'blocked request', data: { host } }); }
}
self.fetch = (input, init) => {
  const u = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (allowed(u)) return ownFetch(input, init);
  block(u);
  return Promise.reject(new TypeError('blocked by Kamera-Effekte (offline-only worker)'));
};
if (self.XMLHttpRequest) {
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, u, ...rest) {
    if (!allowed(u)) { block(u); throw new TypeError('blocked by Kamera-Effekte'); }
    return open.call(this, method, u, ...rest);
  };
}
if (self.navigator && 'sendBeacon' in self.navigator) self.navigator.sendBeacon = u => { block(u); return false; };
if (self.WebSocket) self.WebSocket = class { constructor(u) { block(u); throw new TypeError('blocked by Kamera-Effekte'); } };

// The engine prints its status lines ("INFO: Created TensorFlow Lite XNNPACK delegate …") as errors – keep them quiet
const consoleError = console.error.bind(console);
console.error = (...a) => (/^(INFO|I\d{4}|W\d{4}) ?/.test(String(a[0])) ? console.debug(...a) : consoleError(...a));

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

const CACHE = 'camera-effects-models';
// Model file from the cache, otherwise downloaded once (with progress) and kept for offline use
async function model(task) {
  const { url, size } = MODELS[task];
  const cache = await caches.open(CACHE);
  const hit = await cache.match(url);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await self.fetch(url, { credentials: 'omit' });
  if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { code: 'download' });
  const total = Number(res.headers.get('content-length')) || size;
  const reader = res.body.getReader(), parts = [];
  let loaded = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    if (loaded - last > 200000) { last = loaded; post({ type: 'progress', task, loaded, total }); }
  }
  const buf = new Uint8Array(loaded);
  let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  await cache.put(url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }));
  return buf;
}

let vision = null, fileset = null;
const tasks = {}, loading = {};
async function engine() {
  if (!vision) {
    vision = await import('../assets/vendor/mediapipe/vision_bundle.mjs');
    fileset = {
      wasmLoaderPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.js', self.location.href).href,
      wasmBinaryPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.wasm', self.location.href).href,
    };
  }
  return vision;
}
async function load(task) {
  if (tasks[task]) return tasks[task];
  const t0 = performance.now();
  const [v, buf] = await Promise.all([engine(), model(task)]);
  const base = { modelAssetBuffer: buf, delegate: 'CPU' };
  tasks[task] = task === 'detect'
    ? await v.ObjectDetector.createFromOptions(fileset, { baseOptions: base, runningMode: 'VIDEO', scoreThreshold: 0.45, maxResults: 10, categoryAllowlist: ['person'] })
    : await v.ImageSegmenter.createFromOptions(fileset, { baseOptions: base, runningMode: 'VIDEO', outputConfidenceMasks: true, outputCategoryMask: false });
  post({ type: 'log', msg: 'model ready', data: { task, ms: Math.round(performance.now() - t0) } });
  return tasks[task];
}

let lastTs = 0;
function frame({ bitmap, detect, segment }) {
  const t0 = performance.now();
  // VIDEO mode needs strictly increasing timestamps
  const ts = lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
  const W = bitmap.width, H = bitmap.height;
  const out = { type: 'result', persons: [], mask: null, maskW: 0, maskH: 0 };
  const transfer = [];
  try {
    if (detect && tasks.detect) {
      const r = tasks.detect.detectForVideo(bitmap, ts);
      out.persons = r.detections.map(d => ({
        x: d.boundingBox.originX / W, y: d.boundingBox.originY / H,
        w: d.boundingBox.width / W, h: d.boundingBox.height / H,
        score: d.categories[0]?.score ?? 0,
      }));
    }
    if (segment && tasks.segment) {
      const r = tasks.segment.segmentForVideo(bitmap, ts);
      const masks = r.confidenceMasks || [];
      // selfie_segmenter: one mask (person probability); two-class models: the last one is the person
      const m = masks[masks.length - 1];
      if (m) {
        const f = m.getAsFloat32Array(), u = new Uint8Array(f.length);
        for (let i = 0; i < f.length; i++) u[i] = f[i] * 255;
        out.mask = u; out.maskW = m.width; out.maskH = m.height; transfer.push(u.buffer);
      }
      r.close?.();
    }
  } finally { bitmap.close(); }
  out.ms = Math.round(performance.now() - t0);
  post(out, transfer);
}

self.onmessage = async ({ data }) => {
  if (data.type === 'frame') {
    try { frame(data); }
    catch (e) { post({ type: 'result', persons: [], mask: null, error: String(e?.message || e) }); }
  } else if (data.type === 'load') {
    try {
      loading[data.task] ??= load(data.task);
      await loading[data.task];
      post({ type: 'loaded', task: data.task });
    } catch (e) {
      delete loading[data.task];
      post({ type: 'error', task: data.task, code: e?.code || (e instanceof TypeError ? 'download' : 'engine'), message: String(e?.message || e) });
    }
  }
};
