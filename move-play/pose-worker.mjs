// Body pose for MovePlay (MediaPipe Tasks Vision, Pose Landmarker lite).
// Messages from the page:
//   { type: 'load' }                       load engine + model once → { type: 'loaded', delegate } or { type: 'error', code, message }
//   { type: 'frame', bitmap }              → { type: 'result', poses: [Float32Array x,y,z,visibility × 33 (x, y: 0…1 of the picture)], ms }
// While loading: { type: 'progress', loaded, total } (bytes). Notes for the diagnostics: { type: 'log', msg, data }.

// Network guard – installed before the library is imported. MediaPipe 1.x sends usage statistics to Google
// (odml.pa.googleapis.com) without an option to turn it off. This worker may only fetch its own files and
// the model file; everything else fails like a network error (the library then stops trying).
const MODEL = { url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task', size: 5777746 };
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
  return Promise.reject(new TypeError('blocked by MovePlay (offline-only worker)'));
};
if (self.XMLHttpRequest) {
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, u, ...rest) {
    if (!allowed(u)) { block(u); throw new TypeError('blocked by MovePlay'); }
    return open.call(this, method, u, ...rest);
  };
}
if (self.navigator && 'sendBeacon' in self.navigator) self.navigator.sendBeacon = u => { block(u); return false; };
if (self.WebSocket) self.WebSocket = class { constructor(u) { block(u); throw new TypeError('blocked by MovePlay'); } };

// The engine prints its status lines ("INFO: Created TensorFlow Lite XNNPACK delegate …") as errors – keep them quiet
const consoleError = console.error.bind(console);
console.error = (...a) => (/^(INFO|I\d{4}|W\d{4}) ?/.test(String(a[0])) ? console.debug(...a) : consoleError(...a));

function post(msg, transfer) { self.postMessage(msg, transfer || []); }

const CACHE = 'move-play-models';
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

let landmarker = null, delegate = 'CPU';
async function load() {
  const t0 = performance.now();
  const [vision, buf] = await Promise.all([import('../assets/vendor/mediapipe/vision_bundle.mjs'), model()]);
  self.ModuleFactory = (await import('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.js')).default;
  const fileset = {
    wasmLoaderPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.js', self.location.href).href,
    wasmBinaryPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.wasm', self.location.href).href,
  };
  landmarker = await vision.PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: buf, delegate },
    runningMode: 'VIDEO', numPoses: 1,
    minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
  });
  post({ type: 'log', msg: 'model ready', data: { ms: Math.round(performance.now() - t0), delegate } });
}

let lastTs = 0;
function frame({ bitmap }) {
  const t0 = performance.now();
  // VIDEO mode needs strictly increasing timestamps
  const ts = lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
  const poses = [];
  try {
    const r = landmarker.detectForVideo(bitmap, ts);
    for (const lm of r.landmarks || []) {
      const f = new Float32Array(33 * 4);
      lm.forEach((p, i) => { f[4 * i] = p.x; f[4 * i + 1] = p.y; f[4 * i + 2] = p.z; f[4 * i + 3] = p.visibility ?? 1; });
      poses.push(f);
    }
    r.close?.();
  } finally { bitmap.close(); }
  post({ type: 'result', poses, ms: Math.round(performance.now() - t0) }, poses.map(p => p.buffer));
}

let loading = null;
self.onmessage = async ({ data }) => {
  if (data.type === 'frame') {
    if (!landmarker) { data.bitmap.close(); post({ type: 'result', poses: [], ms: 0 }); return; }
    try { frame(data); }
    catch (e) { post({ type: 'result', poses: [], error: String(e?.message || e) }); }
  } else if (data.type === 'load') {
    try {
      loading ??= load();
      await loading;
      post({ type: 'loaded', delegate });
    } catch (e) {
      loading = null;
      post({ type: 'error', code: e?.code || (e instanceof TypeError ? 'download' : 'engine'), message: String(e?.message || e) });
    }
  }
};
