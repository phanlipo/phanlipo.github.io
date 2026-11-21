// Stand-ins for the Übersetzer app (translator/): the browser's Translator API and LanguageDetector, and
// the Opus-MT worker. Used by translator.spec.mjs and webmcp.spec.mjs.

/**
 * Stand-in Translator API (Chrome's built-in translation). translate(x) answers "[<to>] x".
 * avail: availability per pair ('de-en': 'available' | 'downloadable' | 'unavailable'), '*' for all others
 * (default 'unavailable'). A 'downloadable' pair needs user activation in create(), reports download
 * progress and is 'available' afterwards – like Chrome.
 * detect: answer of LanguageDetector.detect() ([{ detectedLanguage, confidence }]); false = no LanguageDetector.
 * translator: false = only the LanguageDetector, no Translator API (Chrome on Android).
 * Recorded in window.__tr: created pairs, translated pieces, number of detections.
 */
export async function fakeTranslatorApi(page, { avail = {}, detect = [{ detectedLanguage: 'fr', confidence: 0.92 }], translator = true } = {}) {
  await page.addInitScript(({ avail, detect, translator }) => {
    const st = window.__tr = { avail: { ...avail }, created: [], pieces: [], detections: 0, detect, progress: [] };
    const get = (s, t) => st.avail[`${s}-${t}`] ?? st.avail['*'] ?? 'unavailable';
    class FakeTranslator {
      constructor(s, t) { this.sourceLanguage = s; this.targetLanguage = t; }
      static async availability({ sourceLanguage, targetLanguage }) { return get(sourceLanguage, targetLanguage); }
      static async create({ sourceLanguage: s, targetLanguage: t, monitor }) {
        const a = get(s, t);
        if (a === 'unavailable') throw new DOMException('Unable to create translator for the given source and target language.', 'NotSupportedError');
        if (a !== 'available') {
          if (!navigator.userActivation.isActive) throw new DOMException('Requires user activation when the model needs to be downloaded.', 'NotAllowedError');
          const m = new EventTarget();
          if (monitor) monitor(m);
          for (const loaded of [0, 0.5, 1]) {
            const e = new Event('downloadprogress'); e.loaded = loaded;
            m.dispatchEvent(e); st.progress.push(loaded);
            await new Promise(r => setTimeout(r, 10));
          }
          st.avail[`${s}-${t}`] = 'available';
        }
        st.created.push(`${s}-${t}`);
        return new FakeTranslator(s, t);
      }
      async translate(x) { st.pieces.push(x); return `[${this.targetLanguage}] ${x}`; }
      destroy() {}
    }
    if (translator) window.Translator = FakeTranslator; else delete window.Translator;
    if (detect === false) delete window.LanguageDetector;
    else window.LanguageDetector = {
      availability: async () => 'available',
      create: async () => ({ detect: async () => { st.detections++; return st.detect; } }),
    };
  }, { avail, detect, translator });
}

/** A browser without built-in translation (Safari, Firefox, Chrome on Android) */
export async function noTranslatorApi(page) {
  await page.addInitScript(() => { delete window.Translator; delete window.LanguageDetector; });
}

/**
 * Stand-in for translator/worker.js (Opus-MT). Each model of the route wraps a piece as "<to>(piece)", so a
 * route through English reads "fr(en(Hallo))". The first use of a model "downloads" it: reports progress
 * and puts its two ONNX files into the cache of transformers.js, as the real worker does.
 * fail: 'load' or 'translate' → answers with an error of that stage instead.
 */
export async function fakeOpusWorker(page, { fail = null } = {}) {
  // On the context: the service worker caches the app's files too
  await page.context().route('**/translator/worker.js', r => r.fulfill({ contentType: 'text/javascript', body: `
    const FAIL = ${JSON.stringify(fail)};
    self.onmessage = async ({ data }) => {
      const { id, models, pieces } = data;
      if (FAIL) { self.postMessage({ type: 'error', id, stage: FAIL, message: 'fake ' + FAIL + ' error' }); return; }
      const c = await caches.open('transformers-cache');
      for (let s = 0; s < models.length; s++) {
        self.postMessage({ type: 'status', id, status: 'loading', step: s + 1, steps: models.length });
        for (const f of ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx', 'tokenizer.json']) {
          const url = 'https://huggingface.co/' + models[s] + '/resolve/main/' + f;
          if (!await c.match(url)) {
            self.postMessage({ type: 'progress', id, loaded: 1048576, total: 2097152 });
            await c.put(url, new Response('x'));
          }
        }
      }
      self.__runs = (self.__runs || 0) + 1;
      let out = pieces;
      for (const m of models) out = out.map(p => m.split('-').pop() + '(' + p + ')');
      self.postMessage({ type: 'status', id, status: 'translating', step: 1, steps: 1, done: 0, total: pieces.length });
      setTimeout(() => self.postMessage({ type: 'result', id, pieces: out, seconds: 0.1 }), 10);
    };` }));
}

/** Puts the files of Opus-MT models into the cache of transformers.js, as if downloaded earlier */
export async function markOpusDownloaded(page, models) {
  await page.evaluate(async models => {
    const c = await caches.open('transformers-cache');
    for (const m of models) for (const f of ['onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx', 'tokenizer.json'])
      await c.put(`https://huggingface.co/${m}/resolve/main/${f}`, new Response('x'));
  }, models);
}
