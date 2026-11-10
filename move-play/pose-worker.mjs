// Body pose for MovePlay (MediaPipe Tasks Vision, Pose Landmarker lite).
// Messages from the page:
//   { type: 'load', gpu, parts }           load engine + model once → { type: 'loaded', delegate } or { type: 'error', code, message }
//                                          gpu: try the graphics chip first (falls back to the CPU if it fails);
//                                          the first pictures are timed – if the GPU is slow (e.g. a simulated one),
//                                          the CPU is timed too and the faster one is kept
//   { type: 'options', parts }             1: one person in the whole picture; 2: one person in each half (two players)
//   { type: 'frame', bitmap }              → { type: 'result', poses: [Float32Array x,y,z,visibility × 33 (x, y: 0…1 of the picture)],
//                                               halves: [left half, right half of the picture] (parts 2, each a pose or null), ms, delegate }
// Two players: MediaPipe's own search for several people found only one of them in tests (or none). Each half of
// the picture gets its own detector instead (with its own tracking) – the players each stay on their side.
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

let landmarkers = [], delegate = 'CPU', parts = 1, vision = null, factory = null, buf = null;
const fileset = {
  wasmLoaderPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.js', self.location.href).href,
  wasmBinaryPath: new URL('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.wasm', self.location.href).href,
};
async function create(d) {
  const list = [];
  for (let i = 0; i < parts; i++) {
    // MediaPipe takes the engine from self.ModuleFactory and clears it after each task – hand it over again each time
    self.ModuleFactory = factory;
    list.push(await vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: buf, delegate: d },
      runningMode: 'VIDEO', numPoses: 1,
      minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
    }));
  }
  for (const lm of landmarkers) lm.close?.();
  landmarkers = list; delegate = d;
}
const ready = () => landmarkers.length > 0;
async function load(gpu) {
  const t0 = performance.now();
  [vision, buf] = await Promise.all([import('../assets/vendor/mediapipe/vision_bundle.mjs'), model()]);
  factory = (await import('../assets/vendor/mediapipe/wasm/vision_wasm_module_internal.js')).default;
  // Graphics chip first (usually several times faster on phones), the CPU if that does not work
  if (gpu && self.OffscreenCanvas) {
    try { await create('GPU'); }
    catch (e) { post({ type: 'log', msg: 'gpu failed', data: { e: String(e?.message || e).slice(0, 200) } }); }
  }
  if (!ready()) await create('CPU');
  else bench = { GPU: [], CPU: [] };
  post({ type: 'log', msg: 'model ready', data: { ms: Math.round(performance.now() - t0), delegate } });
}
// The GPU can also fail only when the first picture is processed (driver problems): then the CPU takes over
let switching = null;
function use(d) {
  switching = create(d).catch(err => post({ type: 'log', msg: d.toLowerCase() + ' failed', data: { e: String(err?.message || err).slice(0, 200) } }))
    .finally(() => { switching = null; });
}
function toCpu(e) {
  post({ type: 'log', msg: 'gpu failed', data: { e: String(e?.message || e).slice(0, 200), on: 'frame' } });
  bench = null; use('CPU');
}
// Timing: the first frames after starting (and after a switch) warm up, the next ones are measured
const WARM = 3, TIMED = 8, FAST = 40;   // ms per picture that is fast enough
let bench = null;   // { GPU: [ms…], CPU: [ms…] } while choosing
function timed(ms) {
  if (!bench) return;
  const list = bench[delegate];
  list.push(ms);
  // Clearly too slow already after the first pictures (e.g. a simulated GPU): no need to wait for more
  const slow = delegate === 'GPU' && list.length >= 2 && ms > 4 * FAST;
  if (list.length < WARM + TIMED && !slow) return;
  const avg = d => { const l = bench[d].length > WARM ? bench[d].slice(WARM) : bench[d].slice(1); return Math.round(l.reduce((a, b) => a + b, 0) / l.length); };
  if (delegate === 'GPU' && avg('GPU') <= FAST) { post({ type: 'log', msg: 'delegate chosen', data: { gpu: avg('GPU'), use: 'GPU' } }); bench = null; return; }
  if (delegate === 'GPU') { use('CPU'); return; }
  const g = avg('GPU'), c = avg('CPU');
  post({ type: 'log', msg: 'delegate chosen', data: { gpu: g, cpu: c, use: g < c ? 'GPU' : 'CPU' } });
  bench = null;
  if (g < c) use('GPU');
}

let lastTs = 0;
// One person in a picture (or part of it: x0, w = its left edge and width as part of the whole picture)
function detect(lm, img, ts, x0, w) {
  const r = lm.detectForVideo(img, ts);
  const p = r.landmarks && r.landmarks[0];
  let f = null;
  if (p) {
    f = new Float32Array(33 * 4);
    p.forEach((q, i) => { f[4 * i] = x0 + q.x * w; f[4 * i + 1] = q.y; f[4 * i + 2] = q.z; f[4 * i + 3] = q.visibility ?? 1; });
  }
  r.close?.();
  return f;
}
const OVERLAP = 0.05;   // each half reaches this far past the middle
async function frame({ bitmap }) {
  const t0 = performance.now();
  // VIDEO mode needs strictly increasing timestamps
  const ts = lastTs = Math.max(lastTs + 1, Math.round(performance.now()));
  let halves = null, poses = [];
  try {
    if (landmarkers.length === 1) { const f = detect(landmarkers[0], bitmap, ts, 0, 1); if (f) poses.push(f); }
    else {
      const W = bitmap.width, H = bitmap.height, cw = Math.round(W * (0.5 + OVERLAP));
      halves = [];
      for (const [i, sx] of [[0, 0], [1, W - cw]]) {
        const part = await createImageBitmap(bitmap, sx, 0, cw, H);
        try { halves.push(detect(landmarkers[i], part, ts, sx / W, cw / W)); } finally { part.close(); }
      }
      poses = halves.filter(Boolean);
    }
  } finally { bitmap.close(); }
  const ms = Math.round(performance.now() - t0);
  post({ type: 'result', poses, halves, ms, delegate }, poses.map(p => p.buffer));
  timed(ms);
}

let loading = null;
self.onmessage = async ({ data }) => {
  if (data.type === 'frame') {
    if (!ready() || switching) { data.bitmap.close(); post({ type: 'result', poses: [], ms: 0, delegate }); return; }
    try { await frame(data); }
    catch (e) {
      if (delegate === 'GPU') toCpu(e);
      post({ type: 'result', poses: [], error: String(e?.message || e), delegate });
    }
  } else if (data.type === 'options') {
    if (data.parts !== parts) { parts = data.parts; if (ready()) use(delegate); }
  } else if (data.type === 'load') {
    if (data.parts) parts = data.parts;
    try {
      loading ??= load(!!data.gpu);
      await loading;
      post({ type: 'loaded', delegate });
    } catch (e) {
      loading = null;
      post({ type: 'error', code: e?.code || (e instanceof TypeError ? 'download' : 'engine'), message: String(e?.message || e) });
    }
  }
};
