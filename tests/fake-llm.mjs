// Stand-ins for the KI-Chat tests: a graphics card (WebGPU adapter) and the model worker.
// The real model is far too big for `npm test` – see tests/manual/chat-e2e.mjs.
//
//   await fakeLlm(page, { gpu: 'f16' | 'f32' | 'none', maxBuffer })
//   then in the page: window.__llm.reply = { tokens: [...], delay, error: { stage, message } }
//                     window.__llm.posted   all messages the page sent to the worker

export async function fakeLlm(page, { gpu = 'f16', maxBuffer = 4 * 1024 ** 3, worker = true } = {}) {
  await page.addInitScript(({ gpu, maxBuffer, worker }) => {
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
  }, { gpu, maxBuffer, worker });
}

/** Marks a model as downloaded: a file of its pinned revision in the transformers.js cache */
export async function markDownloaded(page, id, revision) {
  await page.evaluate(async ([id, revision]) => {
    const c = await caches.open('transformers-cache');
    await c.put(`https://huggingface.co/${id}/resolve/${revision}/onnx/model_q4f16.onnx`, new Response('x'));
  }, [id, revision]);
}
