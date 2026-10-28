// Speech-to-text worker: runs Whisper (transformers.js) off the main thread.
// Messages in:  { type: 'transcribe', id, audio: Float32Array (16 kHz mono), model, language, allowGPU }
// Messages out: { type: 'progress', id, loaded, total }   model download
//               { type: 'status', id, status: 'loading' | 'transcribing', device }
//               { type: 'result', id, text, chunks, device, seconds }
//               { type: 'error', id, message, stage }
import { pipeline, env } from '../assets/vendor/transformers/transformers.min.js';

// Models come from the Hugging Face Hub and are kept by transformers.js in the
// browser's Cache Storage ("transformers-cache") – after the first download they work offline.
env.allowLocalModels = false;
env.useBrowserCache = true;
// The ONNX runtime is served from this site instead of a CDN
env.backends.onnx.wasm.wasmPaths = {
  mjs: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href,
  wasm: new URL('../assets/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href,
};
env.backends.onnx.wasm.proxy = false;

let loaded = { key: null, pipe: null, device: null };

async function hasWebGPU() {
  try { return !!(self.navigator.gpu && await self.navigator.gpu.requestAdapter()); } catch { return false; }
}

async function getPipeline(model, allowGPU, id) {
  // The WebGPU variant is larger (fp32 encoder + q4 decoder), so the page only allows it where worth it
  const preferGPU = allowGPU && await hasWebGPU();
  const key = `${model}|${preferGPU}`;
  if (loaded.key === key) return loaded;

  // Sum the download progress of all model files
  const files = new Map();
  const progress_callback = info => {
    if (info.status !== 'progress' && info.status !== 'done') return;
    const f = files.get(info.file) || { loaded: 0, total: 0 };
    if (info.total) f.total = info.total;
    f.loaded = info.status === 'done' ? f.total : (info.loaded || f.loaded);
    files.set(info.file, f);
    let l = 0, t = 0;
    for (const v of files.values()) { l += v.loaded; t += v.total; }
    self.postMessage({ type: 'progress', id, loaded: l, total: t });
  };

  const attempts = preferGPU
    ? [{ device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } }, { device: 'wasm', dtype: 'q8' }]
    : [{ device: 'wasm', dtype: 'q8' }];
  let lastError;
  for (const a of attempts) {
    try {
      self.postMessage({ type: 'status', id, status: 'loading', device: a.device });
      const pipe = await pipeline('automatic-speech-recognition', model, { device: a.device, dtype: a.dtype, progress_callback });
      loaded = { key, pipe, device: a.device };
      return loaded;
    } catch (e) { lastError = e; }
  }
  throw lastError;
}

self.onmessage = async ({ data }) => {
  if (data.type !== 'transcribe') return;
  const { id } = data;
  let stage = 'load';
  try {
    const { pipe, device } = await getPipeline(data.model, data.allowGPU !== false, id);
    stage = 'transcribe';
    self.postMessage({ type: 'status', id, status: 'transcribing', device });
    const started = performance.now();
    const out = await pipe(data.audio, {
      task: 'transcribe',
      language: data.language || null,     // null = detect automatically
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    self.postMessage({
      type: 'result', id, device,
      text: (out.text || '').trim(),
      chunks: (out.chunks || []).map(c => ({ from: c.timestamp?.[0] ?? null, to: c.timestamp?.[1] ?? null, text: c.text.trim() })),
      seconds: (performance.now() - started) / 1000,
    });
  } catch (e) {
    self.postMessage({ type: 'error', id, stage, message: String(e && e.message || e) });
  }
};
