// Text-to-speech worker for the ONNX voices: Supertonic 3 and Piper (onnxruntime-web, off the main thread).
// Classic worker: the Piper phonemizer is an Emscripten build loaded with importScripts.
//
// Messages in:  { type: 'speak', id, engine: 'supertonic' | 'piper', text, lang, voice, speed, steps, device }
//               { type: 'load', id, engine, voice, device }        download/prepare only
// Messages out: { type: 'progress', id, loaded, total }            model download (bytes, all files so far)
//               { type: 'status', id, status: 'loading' | 'speaking', device }
//               { type: 'audio', id, samples: Float32Array, sampleRate, seconds, device }
//               { type: 'loaded', id, device, seconds }
//               { type: 'error', id, stage: 'load' | 'speak', message }
//               { type: 'log', msg, data }                         diagnostics (no text content)
'use strict';

importScripts('../assets/vendor/onnxruntime-web/ort.webgpu.min.js');
/* global ort, createPiperPhonemize */

// The ONNX runtime comes from this site (same files as transformers.js uses) – never from a CDN
ort.env.wasm.wasmPaths = {
  mjs: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs', self.location.href).href,
  wasm: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm', self.location.href).href,
};
ort.env.wasm.proxy = false;
// Threads need cross-origin isolation (not available on GitHub Pages) – otherwise one thread
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

// Models: Hugging Face, pinned to a revision so a change upstream cannot break the app.
// Kept in the browser's Cache Storage – after the first download they work offline.
const CACHE = 'text-to-speech-models';
const SUPERTONIC = 'https://huggingface.co/Supertone/supertonic-3/resolve/3cadd1ee6394adea1bd021217a0e650ede09a323/';
const PIPER = 'https://huggingface.co/rhasspy/piper-voices/resolve/e7229f7d33a10e145e109b886d661984201ac3c4/';

const log = (msg, data) => self.postMessage({ type: 'log', msg, data });

/* ---------- Download with progress, cached ---------- */
const progress = { id: 0, files: new Map() };
function reportProgress() {
  let loaded = 0, total = 0;
  for (const f of progress.files.values()) { loaded += f.loaded; total += f.total; }
  self.postMessage({ type: 'progress', id: progress.id, loaded, total });
}

async function getFile(url) {
  let cache = null;
  try { cache = await caches.open(CACHE); } catch (_) {}
  if (cache) {
    const hit = await cache.match(url);
    if (hit) return new Uint8Array(await hit.arrayBuffer());
  }
  const res = await fetch(url, { credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('Content-Length')) || 0;
  const entry = { loaded: 0, total };
  progress.files.set(url, entry);
  const parts = [];
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      entry.loaded += value.length;
      if (entry.total < entry.loaded) entry.total = entry.loaded;
      reportProgress();
    }
  } else {
    parts.push(new Uint8Array(await res.arrayBuffer()));
  }
  const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  entry.loaded = entry.total = buf.length;
  reportProgress();
  if (cache) {
    try { await cache.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream', 'Content-Length': String(buf.length) } })); }
    catch (e) { log('cache put failed', { file: url.split('/').pop(), error: String(e && e.message || e) }); }
  }
  return buf;
}
const getJson = async url => JSON.parse(new TextDecoder().decode(await getFile(url)));

async function hasWebGPU() {
  try { return !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { return false; }
}

async function createSessions(buffers, device) {
  const tryWith = async providers => {
    const out = [];
    for (const b of buffers) out.push(await ort.InferenceSession.create(b, { executionProviders: providers, graphOptimizationLevel: 'all' }));
    return out;
  };
  if (device === 'webgpu' || (device === 'auto' && await hasWebGPU())) {
    try { return { sessions: await tryWith(['webgpu']), device: 'webgpu' }; }
    catch (e) { log('webgpu failed, using wasm', { error: String(e && e.message || e) }); }
  }
  return { sessions: await tryWith(['wasm']), device: 'wasm' };
}

/* ---------- Supertonic 3 ----------
   Text → characters (Unicode indexer) → duration predictor → text encoder → flow matching (N steps)
   → vocoder. Follows the reference implementation (supertone-inc/supertonic, web/helper.js, MIT). */
const ST_LANGS = ['en', 'ko', 'ja', 'ar', 'bg', 'cs', 'da', 'de', 'el', 'es', 'et', 'fi', 'fr', 'hi', 'hr', 'hu', 'id', 'it', 'lt', 'lv', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sv', 'tr', 'uk', 'vi', 'na'];
let st = null;            // { device, cfg, indexer, dp, te, ve, voc }
const stStyles = new Map();

async function loadSupertonic(device) {
  if (st && (device === 'auto' || st.device === device)) return st;
  const cfg = await getJson(SUPERTONIC + 'onnx/tts.json');
  const indexer = await getJson(SUPERTONIC + 'onnx/unicode_indexer.json');
  const buffers = [];
  for (const n of ['duration_predictor', 'text_encoder', 'vector_estimator', 'vocoder']) buffers.push(await getFile(SUPERTONIC + `onnx/${n}.onnx`));
  const { sessions, device: used } = await createSessions(buffers, device);
  const [dp, te, ve, voc] = sessions;
  st = { device: used, cfg, indexer, dp, te, ve, voc };
  return st;
}

async function stStyle(voice) {
  if (stStyles.has(voice)) return stStyles.get(voice);
  const j = await getJson(SUPERTONIC + `voice_styles/${voice}.json`);
  const style = {
    ttl: new ort.Tensor('float32', Float32Array.from(j.style_ttl.data.flat(Infinity)), j.style_ttl.dims),
    dp: new ort.Tensor('float32', Float32Array.from(j.style_dp.data.flat(Infinity)), j.style_dp.dims),
  };
  stStyles.set(voice, style);
  return style;
}

function stPreprocess(text, lang) {
  text = text.normalize('NFKD');
  text = text.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}]+/gu, '');
  const repl = { '–': '-', '‑': '-', '—': '-', '_': ' ', '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'",
    '[': ' ', ']': ' ', '|': ' ', '/': ' ', '#': ' ', '→': ' ', '←': ' ' };
  for (const [k, v] of Object.entries(repl)) text = text.replaceAll(k, v);
  text = text.replace(/[♥☆♡©\\]/g, '');
  for (const [k, v] of Object.entries({ '@': ' at ', 'e.g.,': 'for example, ', 'i.e.,': 'that is, ' })) text = text.replaceAll(k, v);
  text = text.replace(/ ([,.!?;:'])/g, '$1');
  while (text.includes('""')) text = text.replace('""', '"');
  while (text.includes("''")) text = text.replace("''", "'");
  text = text.replace(/\s+/g, ' ').trim();
  if (!/[.!?;:,'")\]}…。」』】〉》›»]$/.test(text)) text += '.';
  if (!ST_LANGS.includes(lang)) lang = 'na';
  return `<${lang}>${text}</${lang}>`;
}

function gaussian() {
  const u1 = Math.max(0.0001, Math.random()), u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

async function speakSupertonic({ text, lang, voice, speed, steps }) {
  const { cfg, indexer, dp, te, ve, voc } = st;
  const style = await stStyle(voice);
  const s = stPreprocess(text, lang);
  const ids = new BigInt64Array(s.length);
  for (let j = 0; j < s.length; j++) {
    const cp = s.codePointAt(j);
    ids[j] = BigInt(cp < indexer.length ? indexer[cp] : -1);
  }
  const L = ids.length;
  const textIds = new ort.Tensor('int64', ids, [1, L]);
  const textMask = new ort.Tensor('float32', new Float32Array(L).fill(1), [1, 1, L]);
  const { duration } = await dp.run({ text_ids: textIds, style_dp: style.dp, text_mask: textMask });
  // The reference app uses speed 1.05 as its default – that is "1×" here
  const dur = duration.data[0] / (speed * 1.05);
  const { text_emb } = await te.run({ text_ids: textIds, style_ttl: style.ttl, text_mask: textMask });
  const sr = cfg.ae.sample_rate;
  const chunk = cfg.ae.base_chunk_size * cfg.ttl.chunk_compress_factor;
  const dim = cfg.ttl.latent_dim * cfg.ttl.chunk_compress_factor;
  const wavLen = Math.floor(dur * sr);
  const latLen = Math.max(1, Math.floor((wavLen + chunk - 1) / chunk));
  let xt = new Float32Array(dim * latLen);
  for (let i = 0; i < xt.length; i++) xt[i] = gaussian();
  const latentMask = new ort.Tensor('float32', new Float32Array(latLen).fill(1), [1, 1, latLen]);
  const total = new ort.Tensor('float32', new Float32Array([steps]), [1]);
  for (let step = 0; step < steps; step++) {
    const out = await ve.run({
      noisy_latent: new ort.Tensor('float32', xt, [1, dim, latLen]), text_emb, style_ttl: style.ttl,
      latent_mask: latentMask, text_mask: textMask, current_step: new ort.Tensor('float32', new Float32Array([step]), [1]), total_step: total,
    });
    xt = new Float32Array(out.denoised_latent.data);
  }
  const { wav_tts } = await voc.run({ latent: new ort.Tensor('float32', xt, [1, dim, latLen]) });
  const samples = new Float32Array(wav_tts.data.subarray(0, Math.min(wav_tts.data.length, wavLen || wav_tts.data.length)));
  return { samples, sampleRate: sr };
}

/* ---------- Piper ----------
   Text → phoneme IDs (piper-phonemize with eSpeak NG, WebAssembly) → VITS model → audio. */
let piper = null;         // { voice, session, config }
let phon = null;          // { data, module: WebAssembly.Module }

async function loadPhonemizer() {
  if (phon) return phon;
  importScripts('../assets/vendor/piper-wasm/piper_phonemize.js');
  // Fetched once (the app's service worker caches these files on first use); reused for every sentence
  const [data, wasm] = await Promise.all([
    fetch(new URL('../assets/vendor/piper-wasm/piper_phonemize.data', self.location.href)).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }),
    fetch(new URL('../assets/vendor/piper-wasm/piper_phonemize.wasm', self.location.href)).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.arrayBuffer(); }),
  ]);
  phon = { data, module: await WebAssembly.compile(wasm) };
  return phon;
}

// The phonemizer is a command-line program: a fresh instance per call, it prints one JSON line
async function phonemeIds(text, espeakVoice) {
  const { data, module } = await loadPhonemizer();
  let out = null;
  const errors = [];
  const m = await createPiperPhonemize({
    print: line => { out = line; },
    printErr: line => { errors.push(line); },
    getPreloadedPackage: () => data,
    instantiateWasm: (imports, done) => { WebAssembly.instantiate(module, imports).then(i => done(i)); return {}; },
    locateFile: f => new URL('../assets/vendor/piper-wasm/' + f, self.location.href).href,
  });
  try {
    m.callMain(['-l', espeakVoice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  } catch (e) {
    if (!(e && e.name === 'ExitStatus' && e.status === 0)) throw e;
  }
  if (!out) throw new Error('phonemizer: ' + (errors.join(' ') || 'no output'));
  return JSON.parse(out);
}

// Phonemes → IDs with the voice's own table (older voices have a smaller one than the phonemizer's
// built-in table). Like Piper: per sentence ^ … $, a pad _ after every phoneme; unknown phonemes are skipped.
function idsFor(phonemes, map) {
  const ids = [];
  const add = p => { for (const v of map[p]) ids.push(v); };
  let open = false;
  for (const p of phonemes) {
    if (!open) { add('^'); add('_'); open = true; }
    if (map[p]) { add(p); add('_'); }
    if (p === '.' || p === '?' || p === '!') { add('$'); open = false; }
  }
  if (open) add('$');
  return ids;
}

async function loadPiper(voice) {
  if (piper && piper.voice === voice) return piper;
  const config = await getJson(PIPER + voice + '.onnx.json');
  const model = await getFile(PIPER + voice + '.onnx');
  // VITS runs fast enough on the processor; WebGPU lacks some of its operators
  const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  piper = { voice, session, config, device: 'wasm' };
  return piper;
}

async function speakPiper({ text, speed, speaker }) {
  const { session, config } = piper;
  const ph = await phonemeIds(text, config.espeak.voice);
  const map = config.phoneme_id_map;
  const ids = map && map['^'] && map['_'] && map['$'] ? idsFor(ph.phonemes, map) : ph.phoneme_ids;
  const inf = config.inference;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, BigInt), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale, inf.length_scale / speed, inf.noise_w]), [3]),
  };
  if ((config.num_speakers || 1) > 1) {
    const sid = config.speaker_id_map && speaker in config.speaker_id_map ? config.speaker_id_map[speaker] : 0;
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([BigInt(sid)]), [1]);
  }
  const { output } = await session.run(feeds);
  return { samples: new Float32Array(output.data), sampleRate: config.audio.sample_rate };
}

/* ---------- Messages (one at a time, in order) ---------- */
let queue = Promise.resolve();
self.onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };

async function load(data) {
  progress.id = data.id;
  progress.files = new Map();
  if (data.engine === 'supertonic') { await loadSupertonic(data.device || 'auto'); await stStyle(data.voice); return st.device; }
  if (data.engine === 'piper') { await loadPiper(data.voice.split('#')[0]); await loadPhonemizer(); return piper.device; }
  throw new Error('unknown engine ' + data.engine);
}

async function handle(data) {
  const { id } = data;
  let stage = 'load';
  try {
    const started = performance.now();
    self.postMessage({ type: 'status', id, status: 'loading' });
    const device = await load(data);
    if (data.type === 'load') { self.postMessage({ type: 'loaded', id, device, seconds: (performance.now() - started) / 1000 }); return; }
    if (data.type !== 'speak') return;
    stage = 'speak';
    self.postMessage({ type: 'status', id, status: 'speaking', device });
    const t0 = performance.now();
    const speed = Math.min(2, Math.max(0.5, Number(data.speed) || 1));
    const out = data.engine === 'supertonic'
      ? await speakSupertonic({ text: data.text, lang: data.lang, voice: data.voice, speed, steps: Math.min(32, Math.max(1, data.steps | 0 || 8)) })
      : await speakPiper({ text: data.text, speed, speaker: data.voice.split('#')[1] });
    self.postMessage({ type: 'audio', id, device, samples: out.samples, sampleRate: out.sampleRate, seconds: (performance.now() - t0) / 1000 }, [out.samples.buffer]);
  } catch (e) {
    self.postMessage({ type: 'error', id, stage, message: String(e && e.message || e) });
  }
}
