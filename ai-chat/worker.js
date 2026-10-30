// Chat worker: runs a Gemma language model (transformers.js, WebGPU) off the main thread.
// Messages in:  { type: 'generate', id, model: { id, revision, arch, sessions, dtypes: { f16, f32 }, bytes, sampling }, messages: [{ role, content }], maxTokens, maxContext }
//               { type: 'stop' }    ends the running answer early (the text so far is kept)
// Messages out: { type: 'progress', id, loaded, total }   model download
//               { type: 'stage', id, stage: 'download', index, count } | { type: 'stage', id, stage: 'prepare' }
//               { type: 'status', id, status: 'loading' | 'generating', dtype }
//               { type: 'token', id, text }               streamed piece of the answer
//               { type: 'done', id, text, tokens, promptTokens, dropped, seconds, dtype, stopped }
//               { type: 'error', id, message, stage }    message 'NO_WEBGPU' / 'NEEDS_F16' = device cannot run the model,
//                                                         'NO_SPACE' = not enough storage for the download
import {
  AutoTokenizer, AutoModelForCausalLM, Gemma4Processor, Gemma4ForCausalLM,
  TextStreamer, InterruptableStoppingCriteria, env,
} from '../assets/vendor/transformers/transformers.min.js';

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

let loaded = { key: null, tokenizer: null, model: null, dtype: null };
const CACHE = 'transformers-cache';
const HUB = 'https://huggingface.co/';
const SUFFIX = { q2f16: '_q2f16', q4f16: '_q4f16', q4: '_q4', fp16: '_fp16' };
const stopper = new InterruptableStoppingCriteria();

// Only WebGPU: the processor build of the ONNX runtime cannot run these quantised models
// (GatherBlockQuantized exists only for WebGPU), and it would be far too slow on phones anyway.
// The f16 variants are smaller and faster but need 16-bit floats in shaders ("shader-f16").
async function pickDtype(dtypes) {
  let adapter = null;
  try { adapter = self.navigator.gpu && await self.navigator.gpu.requestAdapter(); } catch { adapter = null; }
  if (!adapter) throw new Error('NO_WEBGPU');
  const dtype = adapter.features.has('shader-f16') && dtypes.f16 ? dtypes.f16 : dtypes.f32;
  if (!dtype) throw new Error('NEEDS_F16');
  return dtype;
}

async function load(id, m) {
  const dtype = await pickDtype(m.dtypes);
  const key = `${m.id}@${m.revision}|${dtype}`;
  if (loaded.key === key) return loaded;
  // Free the previous model first – two at once may not fit into a phone's memory
  if (loaded.model) { try { await loaded.model.dispose(); } catch { /* ignore */ } }
  loaded = { key: null, tokenizer: null, model: null, dtype: null };

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
  await prefetch(id, m, dtype);
  self.postMessage({ type: 'stage', id, stage: 'prepare' });
  self.postMessage({ type: 'status', id, status: 'loading', dtype });
  const opts = { revision: m.revision, progress_callback };
  let tokenizer, model;
  if (m.arch === 'gemma4') {
    // Gemma 4 keeps its chat template in the processor files. Gemma4ForCausalLM loads only the
    // text part (embed_tokens + decoder) – no image or audio encoder, so a smaller download.
    const processor = await Gemma4Processor.from_pretrained(m.id, opts);
    tokenizer = processor.tokenizer;
    tokenizer.chat_template = processor.chat_template;
    model = await Gemma4ForCausalLM.from_pretrained(m.id, { ...opts, device: 'webgpu', dtype });
  } else {
    tokenizer = await AutoTokenizer.from_pretrained(m.id, opts);
    model = await AutoModelForCausalLM.from_pretrained(m.id, { ...opts, device: 'webgpu', dtype });
  }
  loaded = { key, tokenizer, model, dtype };
  return loaded;
}

// Downloads the big model files one after the other and streams each straight into the cache of
// transformers.js, which then finds them there. transformers.js itself would keep every file whole in
// memory while downloading (and copy it once more for the cache) – with Gemma 4 several GB at once,
// which makes Chrome on phones kill the tab. Files already in the cache are skipped, so an interrupted
// download continues with the next missing file. The cache key is the URL transformers.js uses.
async function prefetch(id, m, dtype) {
  if (typeof caches === 'undefined') return;
  const cache = await caches.open(CACHE);
  const base = `${HUB}${m.id}/resolve/${m.revision}/`;
  const files = m.sessions.flatMap(s => [`onnx/${s}${SUFFIX[dtype]}.onnx`, `onnx/${s}${SUFFIX[dtype]}.onnx_data`]);
  const missing = [];
  for (const f of files) if (!(await cache.match(base + f))) missing.push(f);
  if (!missing.length) return;
  // Enough room? (estimate: the whole model; files of a few hundred KB do not matter)
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (quota && quota - usage < m.bytes * 1.05) throw new Error('NO_SPACE');
  } catch (e) { if (e.message === 'NO_SPACE') throw e; }
  let done = 0;
  for (const [i, f] of missing.entries()) {
    self.postMessage({ type: 'stage', id, stage: 'download', index: i + 1, count: missing.length });
    const res = await fetch(base + f);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${f}`);
    let got = 0, last = 0;
    const count = new TransformStream({
      transform(chunk, ctl) {
        got += chunk.byteLength;
        const now = performance.now();
        if (now - last > 250) { last = now; self.postMessage({ type: 'progress', id, loaded: done + got, total: Math.max(m.bytes, done + got) }); }
        ctl.enqueue(chunk);
      },
    });
    const headers = new Headers(res.headers);
    await cache.put(base + f, new Response(res.body.pipeThrough(count), { status: 200, headers }));
    done += got;
  }
}

// Chat template → token ids. Drops the oldest turns (never the system text or the last question)
// until the prompt plus the answer fit into the context the page allows.
function encode(tokenizer, messages, maxContext, maxTokens) {
  const sys = messages[0] && messages[0].role === 'system' ? [messages[0]] : [];
  let turns = messages.slice(sys.length), dropped = 0;
  for (;;) {
    const inputs = tokenizer.apply_chat_template([...sys, ...turns], { add_generation_prompt: true, return_dict: true, enable_thinking: false });
    const n = inputs.input_ids.dims.at(-1);
    if (n + maxTokens <= maxContext || turns.length <= 1) return { inputs, n, dropped };
    // Remove a whole user/assistant pair so the roles keep alternating
    const cut = turns.length > 2 ? 2 : 1;
    turns = turns.slice(cut);
    dropped += cut;
  }
}

self.onmessage = async ({ data }) => {
  if (data.type === 'stop') { stopper.interrupt(); return; }
  if (data.type !== 'generate') return;
  const { id } = data;
  let stage = 'load';
  try {
    const { tokenizer, model, dtype } = await load(id, data.model);
    stage = 'generate';
    const { inputs, n, dropped } = encode(tokenizer, data.messages, data.maxContext, data.maxTokens);
    self.postMessage({ type: 'status', id, status: 'generating', dtype });
    stopper.reset();
    let text = '', tokens = 0;
    const streamer = new TextStreamer(tokenizer, {
      skip_prompt: true,
      skip_special_tokens: true,
      callback_function: piece => { text += piece; self.postMessage({ type: 'token', id, text: piece }); },
      token_callback_function: () => { tokens++; },
    });
    const started = performance.now();
    await model.generate({
      ...inputs,
      max_new_tokens: data.maxTokens,
      do_sample: true,
      ...data.model.sampling,
      streamer,
      stopping_criteria: stopper,
    });
    self.postMessage({
      type: 'done', id, dtype, text: text.trim(), tokens, promptTokens: n, dropped,
      seconds: (performance.now() - started) / 1000, stopped: stopper.interrupted,
    });
  } catch (e) {
    self.postMessage({ type: 'error', id, stage, message: String(e && e.message || e) });
  }
};
