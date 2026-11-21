// Übersetzer – Opus-MT worker: translates with transformers.js off the main thread (fallback when the
// browser has no Translator API or it cannot do the pair).
// Messages in:  { type: 'translate', id, models: [repo, …] (route, e.g. de → en → fr), pieces: [string] }
// Messages out: { type: 'progress', id, loaded, total }          model download (bytes, all files of the route)
//               { type: 'status', id, status: 'loading' | 'translating', step, steps, done, total }
//               { type: 'result', id, pieces: [string], seconds }
//               { type: 'error', id, stage: 'load' | 'translate', message }
import { pipeline, env } from '../assets/vendor/transformers/transformers.min.js';

// Models come from the Hugging Face Hub and are kept by transformers.js in the browser's
// Cache Storage ("transformers-cache") – after the first download they work offline.
env.allowLocalModels = false;
env.useBrowserCache = true;
// The ONNX runtime is served from this site instead of a CDN
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};
env.backends.onnx.wasm.proxy = false;

// Loaded pipelines, most recent last; at most two (one route through English) stay in memory
const loaded = new Map();

async function getPipeline(model, id, files) {
  if (loaded.has(model)) { const p = loaded.get(model); loaded.delete(model); loaded.set(model, p); return p; }
  const progress_callback = info => {
    if (info.status !== 'progress' && info.status !== 'done') return;
    const key = model + '/' + info.file;
    const f = files.get(key) || { loaded: 0, total: 0 };
    if (info.total) f.total = info.total;
    f.loaded = info.status === 'done' ? f.total : (info.loaded || f.loaded);
    files.set(key, f);
    let l = 0, t = 0;
    for (const v of files.values()) { l += v.loaded; t += v.total; }
    self.postMessage({ type: 'progress', id, loaded: l, total: t });
  };
  const pipe = await pipeline('translation', model, { device: 'wasm', dtype: 'q8', progress_callback });
  loaded.set(model, pipe);
  while (loaded.size > 2) {
    const [old, p] = loaded.entries().next().value;
    loaded.delete(old);
    try { await p.dispose(); } catch (_) {}
  }
  return pipe;
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'translate') return;
  const { id, models } = data;
  let stage = 'load';
  try {
    const files = new Map();
    // Load all models of the route first, so a missing download fails before any work is done
    const pipes = [];
    for (let s = 0; s < models.length; s++) {
      self.postMessage({ type: 'status', id, status: 'loading', step: s + 1, steps: models.length });
      pipes.push(await getPipeline(models[s], id, files));
    }
    stage = 'translate';
    const started = performance.now();
    let pieces = data.pieces.slice();
    const total = pieces.length * pipes.length;
    for (let s = 0; s < pipes.length; s++) {
      const out = [];
      for (let i = 0; i < pieces.length; i++) {
        self.postMessage({ type: 'status', id, status: 'translating', step: s + 1, steps: pipes.length, done: s * pieces.length + i, total });
        const r = await pipes[s](pieces[i], { max_new_tokens: 512 });
        out.push(((Array.isArray(r) ? r[0] : r)?.translation_text || '').trim());
      }
      pieces = out;
    }
    self.postMessage({ type: 'result', id, pieces, seconds: (performance.now() - started) / 1000 });
  } catch (e) {
    self.postMessage({ type: 'error', id, stage, message: String(e && e.message || e) });
  }
};
