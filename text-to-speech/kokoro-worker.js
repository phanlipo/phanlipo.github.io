// Text-to-speech worker for Kokoro-82M (transformers.js + eSpeak NG phonemizer, off the main thread).
// Same messages as onnx-worker.js: { type: 'speak' | 'load', id, text, lang, voice, speed, device }.
//
// Text handling and voice style lookup follow kokoro-js 1.2.1 (https://github.com/hexgrad/kokoro,
// Apache-2.0, Copyright Xenova / hexgrad) – ported here because its package imports bare module names.
import { StyleTextToSpeech2Model, AutoTokenizer, Tensor, env } from '../assets/vendor/transformers/transformers.min.js';
import { phonemize } from '../assets/vendor/phonemizer/phonemizer.js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const REVISION = '1939ad2a8e416c0acfeecc08a694d14ef25f2231';
const CACHE = 'text-to-speech-models';

env.allowLocalModels = false;
env.useBrowserCache = true;
env.cacheKey = CACHE;          // same cache as the other voices of this app (and not Whisper's)
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};
env.backends.onnx.wasm.proxy = false;

const log = (msg, data) => self.postMessage({ type: 'log', msg, data });

/* ---------- Text → phonemes (English) ---------- */
function splitNum(e) {
  if (e.includes('.')) return e;
  if (e.includes(':')) { const [a, t] = e.split(':').map(Number); return t === 0 ? `${a} o'clock` : t < 10 ? `${a} oh ${t}` : `${a} ${t}`; }
  const a = parseInt(e.slice(0, 4), 10);
  if (a < 1100 || a % 1000 < 10) return e;
  const t = e.slice(0, 2), r = parseInt(e.slice(2, 4), 10), n = e.endsWith('s') ? 's' : '';
  if (a % 1000 >= 100 && a % 1000 <= 999) { if (r === 0) return `${t} hundred${n}`; if (r < 10) return `${t} oh ${r}${n}`; }
  return `${t} ${r}${n}`;
}
function flipMoney(e) {
  const a = e[0] === '$' ? 'dollar' : 'pound';
  if (isNaN(Number(e.slice(1)))) return `${e.slice(1)} ${a}s`;
  if (!e.includes('.')) return `${e.slice(1)} ${a}${e.slice(1) === '1' ? '' : 's'}`;
  const [t, r] = e.slice(1).split('.'), n = parseInt(r.padEnd(2, '0'), 10);
  return `${t} ${a}${t === '1' ? '' : 's'} and ${n} ${e[0] === '$' ? (n === 1 ? 'cent' : 'cents') : (n === 1 ? 'penny' : 'pence')}`;
}
const pointNum = e => { const [a, t] = e.split('.'); return `${a} point ${t.split('').join(' ')}`; };
function normalize(e) {
  return e.replace(/[‘’]/g, "'").replace(/«/g, '“').replace(/»/g, '”').replace(/[“”]/g, '"').replace(/\(/g, '«').replace(/\)/g, '»')
    .replace(/[^\S \n]/g, ' ').replace(/  +/, ' ').replace(/(?<=\n) +(?=\n)/g, '')
    .replace(/\bD[Rr]\.(?= [A-Z])/g, 'Doctor').replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, 'Mister').replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, 'Miss')
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, 'Mrs').replace(/\betc\.(?! [A-Z])/gi, 'etc').replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, splitNum).replace(/(?<=\d),(?=\d)/g, '')
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, flipMoney)
    .replace(/\d*\.\d+/g, pointNum).replace(/(?<=\d)-(?=\d)/g, ' to ').replace(/(?<=\d)S/g, ' S')
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S").replace(/(?<=X')S\b/g, 's')
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, m => m.replace(/\./g, '-')).replace(/(?<=[A-Z])\.(?=[A-Z])/gi, '-').trim();
}
const PUNCT = /(\s*[;:,.!?¡¿—…"«»“”(){}[\]]+\s*)+/g;
async function toPhonemes(text, british) {
  text = normalize(text);
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(PUNCT)) {
    if (last < m.index) parts.push({ match: false, text: text.slice(last, m.index) });
    if (m[0].length) parts.push({ match: true, text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ match: false, text: text.slice(last) });
  const lang = british ? 'en' : 'en-us';
  const joined = (await Promise.all(parts.map(async p => p.match ? p.text : (await phonemize(p.text, lang)).join(' ')))).join('');
  let ph = joined.replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ').replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ').replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k')
    .replace(/ɬ/g, 'l').replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ').replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z');
  if (!british) ph = ph.replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
  return ph.trim();
}

/* ---------- Model ---------- */
let kokoro = null;        // { device, model, tokenizer }
const voices = new Map();

async function hasWebGPU() {
  try { return !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { return false; }
}

async function getVoice(name, onProgress) {
  if (voices.has(name)) return voices.get(name);
  const url = `https://huggingface.co/${MODEL}/resolve/${REVISION}/voices/${name}.bin`;
  let cache = null, buf = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) buf = await hit.arrayBuffer(); } catch (_) {}
  if (!buf) {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = await res.arrayBuffer();
    onProgress(url, buf.byteLength, buf.byteLength);
    if (cache) try { await cache.put(url, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } })); } catch (_) {}
  }
  const v = new Float32Array(buf);
  voices.set(name, v);
  return v;
}

async function load(data, id) {
  const files = new Map();
  const onProgress = (file, loaded, total) => {
    files.set(file, { loaded, total: total || loaded });
    let l = 0, t = 0;
    for (const f of files.values()) { l += f.loaded; t += f.total; }
    self.postMessage({ type: 'progress', id, loaded: l, total: t });
  };
  // "Automatic" uses the processor: the small 8-bit model is fast enough and a quarter of the download
  const want = data.device === 'webgpu' && await hasWebGPU() ? 'webgpu' : 'wasm';
  if (!kokoro || kokoro.device !== want) {
    const progress_callback = i => { if ((i.status === 'progress' || i.status === 'done') && i.file) onProgress(i.file, i.loaded ?? i.total ?? 0, i.total ?? 0); };
    // Processor: 8-bit model (~90 MB); graphics card: full precision (~330 MB)
    const opts = { revision: REVISION, progress_callback, device: want, dtype: want === 'webgpu' ? 'fp32' : 'q8' };
    const [model, tokenizer] = await Promise.all([
      StyleTextToSpeech2Model.from_pretrained(MODEL, opts),
      AutoTokenizer.from_pretrained(MODEL, { revision: REVISION, progress_callback }),
    ]);
    kokoro = { device: want, model, tokenizer };
  }
  await getVoice(data.voice, onProgress);
  return kokoro.device;
}

async function speak({ text, voice, speed }) {
  const ph = await toPhonemes(text, voice[0] === 'b');
  const { input_ids } = kokoro.tokenizer(ph, { truncation: true });
  const n = input_ids.dims.at(-1);
  const offset = 256 * Math.min(Math.max(n - 2, 0), 509);
  const style = (await getVoice(voice)).slice(offset, offset + 256);
  const { waveform } = await kokoro.model({
    input_ids, style: new Tensor('float32', style, [1, 256]), speed: new Tensor('float32', [speed], [1]),
  });
  return { samples: new Float32Array(waveform.data), sampleRate: 24000 };
}

/* ---------- Messages (one at a time, in order) ---------- */
let queue = Promise.resolve();
self.onmessage = ({ data }) => { queue = queue.then(() => handle(data)); };

async function handle(data) {
  const { id } = data;
  let stage = 'load';
  try {
    const started = performance.now();
    self.postMessage({ type: 'status', id, status: 'loading' });
    const device = await load(data, id);
    if (data.type === 'load') { self.postMessage({ type: 'loaded', id, device, seconds: (performance.now() - started) / 1000 }); return; }
    if (data.type !== 'speak') return;
    stage = 'speak';
    self.postMessage({ type: 'status', id, status: 'speaking', device });
    const t0 = performance.now();
    const out = await speak({ text: data.text, voice: data.voice, speed: Math.min(2, Math.max(0.5, Number(data.speed) || 1)) });
    self.postMessage({ type: 'audio', id, device, samples: out.samples, sampleRate: out.sampleRate, seconds: (performance.now() - t0) / 1000 }, [out.samples.buffer]);
  } catch (e) {
    log('kokoro error', { stage, error: String(e && e.message || e) });
    self.postMessage({ type: 'error', id, stage, message: String(e && e.message || e) });
  }
}
