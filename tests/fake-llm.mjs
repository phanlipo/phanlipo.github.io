// Stand-ins for the KI-Chat tests: a graphics card (WebGPU adapter), device memory and the model worker.
// The real model is far too big for `npm test` – see tests/manual/chat-e2e.mjs.
//
//   await fakeLlm(page, { gpu: 'f16' | 'f32' | 'none', maxBuffer, memory (GB, navigator.deviceMemory) })
//   then in the page: window.__llm.reply = { tokens: [...], delay, error: { stage, message }, stages: [...], hang }
//                     window.__llm.posted   all messages the page sent to the worker

export async function fakeLlm(page, { gpu = 'f16', maxBuffer = 4 * 1024 ** 3, worker = true, memory = 8 } = {}) {
  await page.addInitScript(({ gpu, maxBuffer, worker, memory }) => {
    if (memory !== undefined) Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => memory });
    const adapter = gpu === 'none' ? null : {
      features: new Set(gpu === 'f16' ? ['shader-f16'] : []),
      limits: { maxBufferSize: maxBuffer, maxStorageBufferBindingSize: maxBuffer },
    };
    Object.defineProperty(Navigator.prototype, 'gpu', { configurable: true, get: () => ({ requestAdapter: async () => adapter }) });
    const llm = window.__llm = { posted: [], reply: { tokens: ['Hallo', ' Welt', '.'], delay: 20 } };
    if (!worker) return;
    const RealWorker = window.Worker;
    window.Worker = class {
      constructor(url, opts) {
        if (!String(url).endsWith('worker.js')) return new RealWorker(url, opts);
        this.stop = false;
      }
      postMessage(m) {
        llm.posted.push(JSON.parse(JSON.stringify(m)));
        if (m.type === 'stop') { this.stop = true; return; }
        if (m.type !== 'generate') return;
        this.stop = false;
        const send = data => setTimeout(() => this.onmessage && this.onmessage({ data: { id: m.id, ...data } }), 0);
        const r = llm.reply, d = r.delay ?? 20;
        (async () => {
          const wait = ms => new Promise(res => setTimeout(res, ms));
          send({ type: 'progress', loaded: 0, total: 3e8 }); await wait(d);
          send({ type: 'progress', loaded: 1.5e8, total: 3e8 }); await wait(d);
          if (r.stages) for (const st of r.stages) { send({ type: 'stage', ...st }); await wait(d); }
          if (r.hang) return;   // e.g. the tab "crashes" while loading
          if (r.error && r.error.stage === 'load') { send({ type: 'error', ...r.error }); return; }
          send({ type: 'status', status: 'loading', dtype: 'q4f16' }); await wait(d);
          send({ type: 'status', status: 'generating', dtype: 'q4f16' }); await wait(d);
          if (r.error) { send({ type: 'error', ...r.error }); return; }
          let text = '', n = 0;
          for (const tok of r.tokens) {
            if (this.stop) break;
            text += tok; n++;
            send({ type: 'token', text: tok });
            await wait(d);
          }
          send({ type: 'done', text: text.trim(), tokens: n, promptTokens: 42, dropped: 0, seconds: 2, dtype: 'q4f16', stopped: this.stop });
        })();
      }
      terminate() {}
    };
  }, { gpu, maxBuffer, worker, memory });
}

/** Marks a model as downloaded: its large files (per session: .onnx + .onnx_data) in the transformers.js cache */
export async function markDownloaded(page, { id, revision, sessions, dtype }, { only } = {}) {
  await page.evaluate(async ([id, revision, sessions, dtype, only]) => {
    const c = await caches.open('transformers-cache');
    const files = sessions.flatMap(s => [`${s}_${dtype}.onnx`, `${s}_${dtype}.onnx_data`]).slice(0, only || undefined);
    for (const f of files) await c.put(`https://huggingface.co/${id}/resolve/${revision}/onnx/${f}`, new Response('x'));
  }, [id, revision, sessions, dtype, only || 0]);
}
