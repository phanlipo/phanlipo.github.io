// Face detection for Gesichter-Zeitraffer (MediaPipe Tasks Vision, face landmarker, runs on the CPU).
// Messages from the page:
//   { type: 'load' }                    load engine + model once → { type: 'loaded' } or { type: 'error', code: 'download' | 'engine' }
//   { type: 'detect', id, bitmap }      → { type: 'faces', id, faces: [Float32Array x0,y0,x1,y1 … (478 points, 0…1)], ms }
//                                          or { type: 'faces', id, faces: [], error }
// While loading: { type: 'progress', loaded, total } (bytes). Notes for the diagnostics: { type: 'log', msg, data }.

// Network guard – installed before the library is imported. MediaPipe 1.x sends usage statistics to Google
// (odml.pa.googleapis.com) without an option to turn it off. This worker may only fetch its own files and
// the model file; everything else fails like a network error (the library then stops trying).
const MODEL = { url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task', size: 3758596 };
const ownFetch = self.fetch.bind(self);
const allowed = u => { const url = new URL(u, self.location.href); return url.origin === self.location.origin || url.href === MODEL.url; };
const blocked = new Set();
function block(u) {
  const host = new URL(u, self.location.href).host;
  if (!blocked.has(host)) { blocked.add(host); post({ type: 'log', msg: 'blocked request', data: { host } }); }
}
self.fetch = (input, init) => {
  const u = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
  if (allowed(u)) return ownFetch(input, init);
  block(u);
  return Promise.reject(new TypeError('blocked by Gesichter-Zeitraffer (offline-only worker)'));
};
if (self.XMLHttpRequest) {
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, u, ...rest) {
    if (!allowed(u)) { block(u); throw new TypeError('blocked by Gesichter-Zeitraffer'); }
    return open.call(this, method, u, ...rest);
  };
}
if (self.navigator && 'sendBeacon' in self.navigator) self.navigator.sendBeacon = u => { block(u); return false; };
if (self.WebSocket) self.WebSocket = class { constructor(u) { block(u); throw new TypeError('blocked by Gesichter-Zeitraffer'); } };

// The engine prints its status lines ("INFO: Created TensorFlow Lite XNNPACK delegate …") as errors – keep them quiet
const consoleError = console.error.bind(console);
console.error = (...a) => (/^(INFO|I\d{4}|W\d{4}) ?/.test(String(a[0])) ? console.debug(...a) : consoleError(...a));

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

const CACHE = 'face-timelapse-models';
// Model file from the cache, otherwise downloaded once (with progress) and kept for offline use
async function model() {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(MODEL.url);
  if (hit) return new Uint8Array(await hit.arrayBuffer());
  const res = await self.fetch(MODEL.url, { credentials: 'omit' });
  if (!res.ok) throw Object.assign(new Error('HTTP ' + res.status), { code: 'download' });
  const total = Number(res.headers.get('content-length')) || MODEL.size;
  const reader = res.body.getReader(), parts = [];
  let loaded = 0, last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    if (loaded - last > 200000) { last = loaded; post({ type: 'progress', loaded, total }); }
  }
  const buf = new Uint8Array(loaded);
  let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
  await cache.put(MODEL.url, new Response(buf, { headers: { 'content-type': 'application/octet-stream' } }));
  return buf;
}

let landmarker = null;
async function load() {
  const t0 = performance.now();
  const [vision, factory, buf] = await Promise.all([
    import('../assets/vendor/mediapipe/vision_bundle.mjs'),
    import('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.js').then(m => m.default),
    model().catch(e => { throw Object.assign(e, { code: e.code || 'download' }); }),
  ]);
  const fileset = {
    wasmLoaderPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.js', self.location.href).href,
    wasmBinaryPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.wasm', self.location.href).href,
  };
  // MediaPipe takes the engine from self.ModuleFactory (see camera-effects/vision-worker.mjs)
  self.ModuleFactory = factory;
  landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: buf, delegate: 'CPU' },
    runningMode: 'IMAGE', numFaces: 6, minFaceDetectionConfidence: 0.4, minFacePresenceConfidence: 0.4,
  });
  post({ type: 'log', msg: 'model ready', data: { ms: Math.round(performance.now() - t0) } });
}

function detect({ id, bitmap }) {
  const t0 = performance.now();
  const faces = [], transfer = [];
  try {
    const r = landmarker.detect(bitmap);
    for (const lm of r.faceLandmarks || []) {
      const f = new Float32Array(lm.length * 2);
      lm.forEach((p, i) => { f[2 * i] = p.x; f[2 * i + 1] = p.y; });
      faces.push(f); transfer.push(f.buffer);
    }
  } finally { bitmap.close(); }
  post({ type: 'faces', id, faces, ms: Math.round(performance.now() - t0) }, transfer);
}

let loading = null;
self.onmessage = async ({ data }) => {
  if (data.type === 'detect') {
    try { detect(data); }
    catch (e) { post({ type: 'faces', id: data.id, faces: [], error: String(e?.message || e) }); }
  } else if (data.type === 'load') {
    try {
      loading ??= load();
      await loading;
      post({ type: 'loaded' });
    } catch (e) {
      loading = null;
      post({ type: 'error', code: e?.code || (e instanceof TypeError ? 'download' : 'engine'), message: String(e?.message || e) });
    }
  }
};
