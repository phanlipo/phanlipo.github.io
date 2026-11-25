/* Opening PDFs with pdf.js – shared by the PDF apps (pdf-viewer, pdf-edit, pdf2word).

   Use from an ES module or, in a page script, with import('../assets/shared/pdf-open.mjs').
   Each app needs its own pdf-worker.mjs in its folder (a copy of pdf-viewer/pdf-worker.mjs): a worker from
   outside the app folder would bypass the service worker – the app would not work offline.

   pdfjs()                      the pdf.js module, worker set up (loaded once)
   docParams(extra)             getDocument() options every app uses (no eval for the strict CSP, fonts, decoders)
   looksLikePdf(bytes)          "%PDF" within the first KB (some files have a few bytes before it)
   isPdfFile(blob)              the same for a file (reads only its start)
   openPdf(bytes, opts)         → { doc, password } (password: what opened it, undefined without one)
       opts.password            try this first
       opts.ask(wrong)          called for a password, resolves to the text or null (= skip); default: askPassword(opts.name)
       opts.name                file name for the password dialog
       opts.params              extra getDocument() options
     Throws an Error with .code: 'password' (skipped), 'invalid' (not readable), 'lib' (pdf.js could not be loaded).
     bytes stay untouched (pdf.js gets a copy each try).
   closePdf(doc)                frees the document and its worker memory
   askPassword(name, wrong, { skip })   the shared password dialog (dialog.dialog, ids pwDlg/pwInput/pwOk/pwCancel/pwErr);
                                resolves to the text or null. skip: true labels the cancel button "Skip" (adding several files).
   The password stays in memory only – never stored or logged (callers log only counts). */

const url = path => new URL(path, location.href).href;   // apps live in /<app>/

let jsP = null;
export function pdfjs() {
  return jsP || (jsP = import('../vendor/pdfjs/pdf.min.mjs').then(m => {
    m.GlobalWorkerOptions.workerSrc = url('pdf-worker.mjs');
    return m;
  }).catch(e => { jsP = null; throw e; }));
}
// For the offline cache (scripts/build.mjs finds vendor packages by these literal paths) and the decoders:
const VENDOR = {
  fonts: '../assets/vendor/pdfjs/standard_fonts/',
  wasm: '../assets/vendor/pdfjs/wasm/',
  icc: '../assets/vendor/pdfjs/iccs/',
};

export function docParams(extra = {}) {
  return {
    isEvalSupported: false,                  // strict CSP: no eval / new Function
    standardFontDataUrl: url(VENDOR.fonts),
    wasmUrl: url(VENDOR.wasm),               // JBIG2 / JPEG 2000 scans
    iccUrl: url(VENDOR.icc),                 // CMYK images
    ...extra,
  };
}

export function looksLikePdf(b) {
  const n = Math.min(b.length - 4, 1024);
  for (let i = 0; i <= n; i++) if (b[i] === 37 && b[i + 1] === 80 && b[i + 2] === 68 && b[i + 3] === 70) return true;
  return false;
}
export async function isPdfFile(blob) {
  try { return looksLikePdf(new Uint8Array(await blob.slice(0, 1028).arrayBuffer())); } catch (_) { return false; }
}

const fail = (code, cause) => Object.assign(new Error(code), { code, cause });

export async function openPdf(bytes, { password, ask, name = '', params } = {}) {
  let lib;
  try { lib = await pdfjs(); } catch (e) { throw fail('lib', e); }
  const askFor = ask || (wrong => askPassword(name, wrong));
  let pw = password, tries = 0;
  for (;;) {
    const task = lib.getDocument(docParams({ data: bytes.slice(), ...(pw != null ? { password: pw } : {}), ...params }));
    try {
      return { doc: await task.promise, password: pw };
    } catch (e) {
      if (e?.name !== 'PasswordException') throw fail('invalid', e);
      const wrong = pw != null;
      log(wrong ? 'wrong password' : 'password needed', { tries });
      const next = await askFor(wrong);
      if (next == null) { log('password skipped', { tries }); throw fail('password', e); }
      pw = next; tries++;
    }
  }
}

// pdf.js 6: a document is closed through its loading task
export function closePdf(d) {
  try { Promise.resolve((d?.loadingTask || d)?.destroy?.()).catch(() => {}); } catch (_) {}
}

/* ---------- Password dialog ---------- */
const TEXTS = {
  de: { title: '„{name}“ ist passwortgeschützt', label: 'Passwort', wrong: 'Falsches Passwort – bitte noch einmal versuchen.',
    empty: 'Bitte das Passwort eingeben.', cancel: 'Abbrechen', skip: 'Überspringen', open: 'Öffnen' },
  en: { title: '“{name}” is password-protected', label: 'Password', wrong: 'Wrong password – please try again.',
    empty: 'Please enter the password.', cancel: 'Cancel', skip: 'Skip', open: 'Open' },
};
const tx = (k, v = {}) => ((TEXTS[window.Tools?.lang?.()] || TEXTS.de)[k] || '').replace(/\{(\w+)\}/g, (_, n) => v[n] ?? '');
const log = (...a) => window.Tools?.diag?.log(...a);

function dialog() {
  let d = document.getElementById('pwDlg');
  if (d) return d;
  d = document.createElement('dialog');
  d.id = 'pwDlg'; d.className = 'dialog'; d.dataset.keep = '';
  d.setAttribute('aria-labelledby', 'pwTitle');
  const icon = n => window.Tools?.icon ? Tools.icon(n) : '';
  d.innerHTML = '<div class="dialog-body"><h2 id="pwTitle" class="dialog-title"></h2>'
    + '<label class="form-field"><span id="pwLabel"></span><input type="password" id="pwInput" autocomplete="off" spellcheck="false" maxlength="200"></label>'
    + '<p class="form-error" id="pwErr" role="alert"></p></div>'
    + `<div class="dialog-actions"><button type="button" class="btn" id="pwCancel">${icon('x')}<span></span></button>`
    + `<button type="button" class="btn primary" id="pwOk">${icon('lock-open')}<span></span></button></div>`;
  document.body.append(d);
  return d;
}

export function askPassword(name, wrong, { skip = false } = {}) {
  const d = dialog(), $ = id => d.querySelector('#' + id), input = $('pwInput');
  $('pwTitle').textContent = tx('title', { name });
  $('pwLabel').textContent = tx('label');
  $('pwErr').textContent = wrong ? tx('wrong') : '';
  $('pwCancel').querySelector('span').textContent = tx(skip ? 'skip' : 'cancel');
  $('pwOk').querySelector('span').textContent = tx('open');
  input.value = '';
  return new Promise(resolve => {
    let done = false;
    const finish = v => {
      if (done) return; done = true;
      $('pwOk').removeEventListener('click', ok); $('pwCancel').removeEventListener('click', cancel);
      input.removeEventListener('keydown', key); d.removeEventListener('cancel', esc);
      if (d.open) d.close();
      input.value = '';
      resolve(v);
    };
    const ok = () => { if (!input.value) { $('pwErr').textContent = tx('empty'); input.focus(); return; } finish(input.value); };
    const cancel = () => finish(null);
    const key = e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } };
    const esc = e => { e.preventDefault(); finish(null); };
    $('pwOk').addEventListener('click', ok); $('pwCancel').addEventListener('click', cancel);
    input.addEventListener('keydown', key); d.addEventListener('cancel', esc);
    d.showModal(); input.focus();
  });
}
