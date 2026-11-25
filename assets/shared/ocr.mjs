/* Text recognition (OCR) for PDF pages with Tesseract – shared by the PDF apps (pdf2word, pdf-viewer).
   Everything runs on the device; the recognition (about 4 MB) and the language data (1–3 MB) come from this
   site on first use and are then cached by the app's service worker (vendor packages with "precache": false).

   Use from an ES module:  import { recognisePage, ocrLang } from '../assets/shared/ocr.mjs';
   Each app needs its own ocr-worker.js in its folder (a copy of pdf2word/ocr-worker.js: it imports Tesseract's worker):
   a worker from outside the app folder would bypass the service worker – nothing would be cached for offline use.

   recognisePage(page, { lang, onProgress, maxPx })
     page: pdf.js page; lang: 'deu' | 'eng'
     onProgress(step, fraction 0…1): { k: 'ocrLoad' } loading, { k: 'render' } drawing the page, { k: 'ocr', p: percent }
     → { data (Tesseract result with blocks → paragraphs → lines → words, pixel boxes, origin top left),
         scale (pixels per PDF point), viewport (pdf.js viewport of the picture: rotation of the page included) }
     Throws when the recognition cannot be loaded (offline before first use) – callers say so and carry on.
   ocrLang(appLang)  'eng' for English, otherwise 'deu'
   terminate()       ends the Tesseract worker (frees its memory) */

const url = path => new URL(path, location.href).href;   // paths relative to the page (apps live in /<app>/)

let tesseract = null;     // { lang, worker }
let progressTarget = null;
let loading = null;

export const ocrLang = appLang => (appLang === 'en' ? 'eng' : 'deu');

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Tesseract) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error('OCR library could not be loaded')); };
    document.head.append(s);
  });
}

async function worker(lang, onProgress) {
  if (tesseract?.lang === lang) return tesseract.worker;
  if (loading) { await loading.catch(() => {}); if (tesseract?.lang === lang) return tesseract.worker; }
  loading = (async () => {
    if (tesseract) { await tesseract.worker.terminate().catch(() => {}); tesseract = null; }
    onProgress?.({ k: 'ocrLoad' }, 0);
    await loadScript(url('../assets/vendor/tesseract/tesseract.min.js'));
    const langPath = lang === 'eng' ? url('../assets/vendor/tesseract-eng/') : url('../assets/vendor/tesseract-deu/');
    const w = await window.Tesseract.createWorker(lang === 'eng' ? 'eng' : 'deu', 1 /* LSTM only */, {
      workerPath: url('./ocr-worker.js'),
      corePath: url('../assets/vendor/tesseract-core/'),
      langPath,
      gzip: true,
      cacheMethod: 'none',        // offline copy comes from the service worker, not IndexedDB
      workerBlobURL: false,       // CSP: workers only from own files
      logger: m => {
        if (m.status === 'recognizing text') progressTarget?.({ k: 'ocr', p: Math.round(m.progress * 100) }, 0.15 + 0.85 * m.progress);
        else if (!progressTarget) onProgress?.({ k: 'ocrLoad' }, 0);
      },
    });
    tesseract = { lang, worker: w };
  })();
  try { await loading; } finally { loading = null; }
  return tesseract.worker;
}

// Renders a page at 300 dpi (at most maxPx, default 4000 px on the long side) and recognises its words
export async function recognisePage(page, { lang = 'deu', onProgress, maxPx = 4000 } = {}) {
  const w = await worker(lang, onProgress);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(300 / 72, maxPx / Math.max(vp1.width, vp1.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  onProgress?.({ k: 'render' }, 0.1);
  await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
  progressTarget = onProgress;
  let data;
  try {
    data = (await w.recognize(canvas, {}, { blocks: true, text: false })).data;
  } finally {
    progressTarget = null;
    canvas.width = canvas.height = 0;
  }
  return { data, scale, viewport };
}

export async function terminate() {
  const t = tesseract; tesseract = null;
  if (t) await t.worker.terminate().catch(() => {});
}
