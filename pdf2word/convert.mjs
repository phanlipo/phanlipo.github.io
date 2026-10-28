// PDF → Word: reads the text and images of a PDF with pdf.js (position, size, font) and rebuilds
// paragraphs from the geometry, then writes a .docx with the docx library. Pages without text
// (scans) go through text recognition (Tesseract). Everything runs in the browser; the file
// never leaves the device.
//
// Steps: extract() text items and images per page (OCR for scanned pages) → lines (same
// baseline) → paragraphs (line pitch, indentation, full lines) → layout() with indents, tabs,
// alignment, images in reading order → toDocx().

import * as pdfjs from '../assets/vendor/pdfjs/pdf.min.mjs';

// Full literal paths: scripts/build.mjs finds the libraries for the offline cache by them
const url = path => new URL(path, import.meta.url).href;
// Workers start from files in the app folder, so the service worker serves them offline
pdfjs.GlobalWorkerOptions.workerSrc = url('./pdf-worker.mjs');

/* ---------- 1. Read the PDF ---------- */

// Opens a PDF. Throws an Error with .code = 'password' | 'invalid' for the page to explain.
export async function open(data, password) {
  const task = pdfjs.getDocument({
    data, password,
    isEvalSupported: false,          // strict CSP: no eval / new Function
    disableFontFace: true,           // only metrics and names are needed, never draw glyphs
    fontExtraProperties: true,
    standardFontDataUrl: url('../assets/vendor/pdfjs/standard_fonts/'),
    wasmUrl: url('../assets/vendor/pdfjs/wasm/'),          // decoders for JBIG2 / JPEG 2000 scans
    iccUrl: url('../assets/vendor/pdfjs/iccs/'),           // CMYK images
    useSystemFonts: false,
    stopAtErrors: false,
  });
  try {
    return await task.promise;
  } catch (e) {
    const err = new Error(e?.message || String(e));
    err.code = e?.name === 'PasswordException' ? (e.code === 2 ? 'password-wrong' : 'password') : 'invalid';
    throw err;
  }
}

// Frees the worker memory of a document from open()
export function close(pdf) {
  pdf?.loadingTask?.destroy?.();
}

// Text items and images of every page. Items: { s, x, y, w, size, font, bold, italic } in PDF
// points, origin bottom left of the page. Images: { x, y, w, h (points), data, type }.
// options.ocr: { lang: 'deu' | 'eng' } – recognise the text of pages that have none (scans)
// options.onProgress(text, fraction)
export async function extract(pdf, options = {}) {
  const { ocr, onProgress } = options;
  const pages = [];
  const n = pdf.numPages;
  for (let i = 1; i <= n; i++) {
    onProgress?.('Seite ' + i + ' von ' + n + ' …', (i - 1) / n);
    const page = await pdf.getPage(i);
    const [x0, y0, x1, y1] = page.view;
    const width = x1 - x0, height = y1 - y0;
    const text = await page.getTextContent();
    // The operator list makes pdf.js send the font objects (real name, bold/italic flags)
    // and the images; it also tells where the images are drawn
    const ops = await page.getOperatorList().catch(() => null);
    const fonts = {};
    const fontOf = id => {
      if (fonts[id]) return fonts[id];
      let f = null;
      try { if (page.commonObjs.has(id)) f = page.commonObjs.get(id); } catch { /* not loaded */ }
      const raw = (f?.name || text.styles[id]?.fontFamily || '').replace(/^[A-Z]{6}\+/, '');
      return (fonts[id] = {
        name: fontFamily(raw),
        bold: !!f?.bold || /bold|black|heavy|semibold|demi/i.test(raw),
        italic: !!f?.italic || /italic|oblique/i.test(raw),
      });
    };
    let items = [];
    for (const it of text.items) {
      if (!it.str || !it.transform) continue;
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d) || Math.hypot(a, b);
      if (!(size > 0.5)) continue;
      const font = fontOf(it.fontName);
      items.push({ s: it.str, x: e - x0, y: f - y0, w: it.width, size, font: font.name, bold: font.bold, italic: font.italic });
    }

    // A page without text is a scan (or a picture): recognise its text
    const hasText = items.reduce((k, it) => k + it.s.trim().length, 0) >= 3;
    let ocrDone = false, ocrError = null;
    if (!hasText && ocr) {
      try {
        items = await recognise(page, ocr.lang, (t, f) => onProgress?.('Seite ' + i + ' von ' + n + ': ' + t, (i - 1 + f) / n));
        ocrDone = true;
      } catch (e) {
        ocrError = e;
      }
    }

    // Images – a picture covering (almost) the whole page is the background of a scan or of a
    // searchable PDF: skipped when the page has text (from the PDF or recognised)
    const images = [];
    if (ops) {
      for (const im of placedImages(ops, x0, y0)) {
        if (im.w < 4 || im.h < 4) continue;                          // rules, dots
        const cover = (im.w * im.h) / (width * height);
        if (cover > 0.8 && (hasText || (ocrDone && items.length))) continue;
        const pic = await imageData(page, im).catch(() => null);
        if (pic) images.push({ x: im.x, y: im.y, w: im.w, h: im.h, ...pic });
        if (images.length >= 50) break;
      }
    }
    pages.push({ width, height, items, images, ocr: ocrDone, ocrError });
    page.cleanup();
  }
  onProgress?.('Fertig gelesen', 1);
  return pages;
}

/* ---------- Images ---------- */

// Where the page draws images: follows the transformation matrix through the operator list.
// The image fills the unit square of its matrix. Returns page-relative bounding boxes in points.
export function placedImages(ops, x0 = 0, y0 = 0) {
  const { OPS, Util } = pdfjs;
  const found = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
    else if (fn === OPS.transform) ctm = Util.transform(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = args?.[0];
      if (m && m.length === 6) ctm = Util.transform(ctm, Array.from(m));
    } else if (fn === OPS.paintFormXObjectEnd) { if (stack.length) ctm = stack.pop(); }
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const [a, b, c, d, e, f] = ctm;
      const xs = [e, a + e, c + e, a + c + e], ys = [f, b + f, d + f, b + d + f];
      const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
      found.push({
        ref: args[0],
        inline: fn === OPS.paintInlineImageXObject,
        ctm, x: minX - x0, y: minY - y0, w: maxX - minX, h: maxY - minY, minX, maxY,
      });
    }
  }
  return found;
}

// Decoded picture of a placed image as JPEG (photos) or PNG (small or transparent images),
// turned and flipped like on the page, at most 2000 px on the long side.
async function imageData(page, im) {
  const img = im.inline ? im.ref : await new Promise(resolve => {
    const objs = String(im.ref).startsWith('g_') ? page.commonObjs : page.objs;
    const timer = setTimeout(() => resolve(null), 10000);
    try { objs.get(im.ref, data => { clearTimeout(timer); resolve(data); }); } catch { clearTimeout(timer); resolve(null); }
  });
  if (!img || !img.width || !img.height) return null;
  const W = img.width, H = img.height;
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sctx = src.getContext('2d');
  let alpha = false;
  if (img.bitmap) sctx.drawImage(img.bitmap, 0, 0);
  else if (img.data) {
    const out = sctx.createImageData(W, H);
    alpha = toRGBA(img, out.data);
    sctx.putImageData(out, 0, 0);
  } else return null;

  // Output canvas in page orientation; k = pixels per point (native resolution, capped)
  const k = Math.min(Math.sqrt((W * H) / (im.w * im.h)), 2000 / Math.max(im.w, im.h));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(im.w * k)); out.height = Math.max(1, Math.round(im.h * k));
  const ctx = out.getContext('2d');
  const png = alpha || W * H <= 300 * 300 || img.kind === pdfjs.ImageKind.GRAYSCALE_1BPP;
  if (!png) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out.width, out.height); }
  // Image pixel (px, py) → page: u = px/W, v = 1 - py/H, P = ctm·(u, v) → canvas (P.x - minX, maxY - P.y)·k
  const [a, b, c, d, e, f] = im.ctm;
  ctx.setTransform(k * a / W, -k * b / W, -k * c / H, k * d / H, k * (c + e - im.minX), k * (im.maxY - d - f));
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0);
  src.width = src.height = 0;
  const blob = await new Promise(r => out.toBlob(r, png ? 'image/png' : 'image/jpeg', 0.88));
  out.width = out.height = 0;
  if (!blob) return null;
  return { data: new Uint8Array(await blob.arrayBuffer()), type: png ? 'png' : 'jpg', px: [Math.round(im.w * k), Math.round(im.h * k)] };
}

// pdf.js image data (1-bit gray, RGB or RGBA rows) → RGBA; returns whether it has transparency
function toRGBA(img, dst) {
  const { width: W, height: H, data, kind } = img;
  const K = pdfjs.ImageKind;
  let alpha = false;
  if (kind === K.GRAYSCALE_1BPP) {
    const rowBytes = (W + 7) >> 3;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = data[y * rowBytes + (x >> 3)] & (128 >> (x & 7)) ? 255 : 0;   // bit set = white
      const o = (y * W + x) * 4;
      dst[o] = dst[o + 1] = dst[o + 2] = v; dst[o + 3] = 255;
    }
  } else if (kind === K.RGB_24BPP) {
    for (let i = 0, j = 0; j < W * H * 4; i += 3, j += 4) {
      dst[j] = data[i]; dst[j + 1] = data[i + 1]; dst[j + 2] = data[i + 2]; dst[j + 3] = 255;
    }
  } else {
    dst.set(data.subarray(0, W * H * 4));
    for (let j = 3; j < dst.length; j += 4) if (dst[j] < 255) { alpha = true; break; }
  }
  return alpha;
}

/* ---------- Text recognition (OCR) ---------- */

let tesseract = null;   // { lang, worker }

// Renders a page at 300 dpi (at most 4000 px) and recognises its words with Tesseract.
// Returns text items like extract(); throws when the recognition cannot be loaded.
async function recognise(page, lang, onProgress) {
  const worker = await ocrWorker(lang, onProgress);
  const vp1 = page.getViewport({ scale: 1 });
  const scale = Math.min(300 / 72, 4000 / Math.max(vp1.width, vp1.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  onProgress?.('Seite wird für die Texterkennung gerendert …', 0.1);
  await page.render({ canvasContext: ctx, viewport, background: 'white' }).promise;
  progressTarget = onProgress;
  let result;
  try {
    result = (await worker.recognize(canvas, {}, { blocks: true, text: false })).data;
  } finally {
    progressTarget = null;
    canvas.width = canvas.height = 0;
  }
  return ocrItems(result, scale, vp1.height);
}

let progressTarget = null;
async function ocrWorker(lang, onProgress) {
  if (tesseract?.lang === lang) return tesseract.worker;
  if (tesseract) { await tesseract.worker.terminate().catch(() => {}); tesseract = null; }
  onProgress?.('Texterkennung wird geladen …', 0);
  await loadScript(url('../assets/vendor/tesseract/tesseract.min.js'));
  const langPath = lang === 'eng' ? url('../assets/vendor/tesseract-eng/') : url('../assets/vendor/tesseract-deu/');
  const worker = await window.Tesseract.createWorker(lang === 'eng' ? 'eng' : 'deu', 1 /* LSTM only */, {
    workerPath: url('./ocr-worker.js'),
    corePath: url('../assets/vendor/tesseract-core/'),
    langPath,
    gzip: true,
    cacheMethod: 'none',        // offline copy comes from the service worker, not IndexedDB
    workerBlobURL: false,       // CSP: workers only from own files
    logger: m => {
      if (m.status === 'recognizing text') progressTarget?.('Texterkennung ' + Math.round(m.progress * 100) + ' %', 0.15 + 0.85 * m.progress);
      else if (!progressTarget) onProgress?.('Texterkennung wird geladen …', 0);
    },
  });
  tesseract = { lang, worker };
  return worker;
}

// Tesseract words → text items. Pixel boxes (top left origin) → points (bottom left origin).
// Font size: the tallest letters of a line (capitals, b, d, h …) reach about 0.72 em above the
// baseline; sizes are then snapped to the page's typical size so lines group into paragraphs.
export function ocrItems(data, scale, pageHeight) {
  const items = [];
  for (const block of data?.blocks || []) for (const para of block.paragraphs || []) for (const line of para.lines || []) {
    const words = (line.words || []).filter(w => w.text && w.text.trim());
    if (!words.length) continue;
    const lb = line.bbox, base = line.baseline;
    const baseAt = x => base && base.x1 !== base.x0 ? base.y0 + (base.y1 - base.y0) * (x - base.x0) / (base.x1 - base.x0) : lb.y1;
    const ascent = baseAt((lb.x0 + lb.x1) / 2) - lb.y0;
    const size = Math.max(4, (ascent > 0 ? ascent / 0.72 : (lb.y1 - lb.y0)) / scale);
    for (const w of words) {
      const by = baseAt((w.bbox.x0 + w.bbox.x1) / 2);
      items.push({ s: w.text.trim(), x: w.bbox.x0 / scale, y: pageHeight - by / scale, w: (w.bbox.x1 - w.bbox.x0) / scale,
        size, font: 'Arial', bold: false, italic: false });
    }
  }
  // Snap sizes: within ±20 % of the median → median, then whole points
  const m = median(items.map(it => it.size));
  for (const it of items) it.size = Math.round(Math.abs(it.size - m) <= 0.2 * m ? m : it.size);
  return items;
}

// "ABCDEF+Arial-BoldMT" → "Arial", "TimesNewRomanPSMT" → "Times New Roman"
export function fontFamily(raw) {
  const known = { helvetica: 'Arial', arial: 'Arial', arialmt: 'Arial', times: 'Times New Roman', 'times-roman': 'Times New Roman',
    timesnewroman: 'Times New Roman', courier: 'Courier New', couriernew: 'Courier New', symbol: 'Symbol',
    'sans-serif': 'Arial', serif: 'Times New Roman', monospace: 'Courier New' };
  let n = String(raw || '').split(/[-,]/)[0].replace(/(PSMT|PS|MT)$/, '').trim();
  if (!n) return 'Arial';
  if (known[n.toLowerCase()]) return known[n.toLowerCase()];
  n = n.replace(/(Bold|Italic|Oblique|Regular|Medium|Light)+$/i, '') || n;
  return known[n.toLowerCase()] || n.replace(/([a-z])([A-Z])/g, '$1 $2');
}

/* ---------- 2. Lines ---------- */

const PAGE_NUMBER = /^(seite|page|s\.)?\s*[-–]?\s*\d{1,4}\s*[-–]?\s*((\/|von|of)\s*\d{1,4})?$/i;
const LIST_START = /^([-–•▪●◦○■□*·]|\(?\d{1,2}[.)]|\(?[a-z][.)]|§\s*\d)\s/;

// Groups the items of one page into lines; within a line, large gaps become columns (tabs).
export function linesOf(page) {
  // Whitespace-only items are dropped: pdf.js inserts them for gaps, and spaces follow from the
  // positions anyway – a wide one would hide a column gap
  const items = page.items.filter(it => it.s.trim()).sort((p, q) => q.y - p.y || p.x - q.x);
  const lines = [];
  for (const it of items) {
    const line = lines.find(l => Math.abs(l.y - it.y) <= 0.4 * Math.min(l.size, it.size));
    if (line) { line.items.push(it); line.size = Math.max(line.size, it.size); }
    else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  for (const l of lines) {
    l.items.sort((p, q) => p.x - q.x);
    const cols = [];
    let col = null, prev = null;
    for (const it of l.items) {
      const gap = prev ? it.x - (prev.x + prev.w) : 0;
      if (!col || gap > Math.max(1.5 * it.size, 18)) {
        col = { x: it.x, right: it.x + it.w, runs: [] };
        cols.push(col);
      } else if (gap > 0.15 * it.size && !/\s$/.test(prev.s) && !/^\s/.test(it.s)) {
        addRun(col.runs, ' ', prev);
      }
      addRun(col.runs, it.s, it);
      col.right = Math.max(col.right, it.x + it.w);
      prev = it;
    }
    for (const c of cols) trimRuns(c.runs);
    l.cols = cols.filter(c => c.runs.length);
    l.x = l.cols[0]?.x ?? 0;
    l.right = l.cols.at(-1)?.right ?? 0;
    l.text = l.cols.map(c => c.runs.map(r => r.text).join('')).join('\t');
    // Main size/style of the line: the one with the most characters
    const count = {};
    for (const it of l.items) { const k = it.size.toFixed(1); count[k] = (count[k] || 0) + it.s.length; }
    l.size = +Object.entries(count).sort((p, q) => q[1] - p[1])[0][0];
    l.bold = l.items.every(it => it.bold || !it.s.trim());
  }
  return lines.filter(l => l.text.trim()).sort((p, q) => q.y - p.y);
}

function addRun(runs, text, it) {
  const last = runs.at(-1);
  const size = Math.round(it.size * 2) / 2;
  if (last && last.bold === it.bold && last.italic === it.italic && last.size === size && last.font === it.font) last.text += text;
  else runs.push({ text, bold: it.bold, italic: it.italic, size, font: it.font });
}

function trimRuns(runs) {
  if (runs.length) runs[0].text = runs[0].text.replace(/^\s+/, '');
  if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
  for (const r of runs) r.text = r.text.replace(/\s{2,}/g, ' ');
  for (let i = runs.length - 1; i >= 0; i--) if (!runs[i].text) runs.splice(i, 1);
}

/* ---------- 3. Paragraphs ---------- */

const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };

// Builds the document model from extract() output.
// options.pageBreaks: start every PDF page on a new page (default true)
export function layout(pages, options = {}) {
  const keepPages = options.pageBreaks !== false;
  const all = pages.map(p => ({ ...p, lines: linesOf(p) }));

  // Page numbers: a lone number in the top or bottom 8 % of the page
  let numbered = 0, numberAlign = 'center', numberY = null;
  for (const p of all) {
    p.lines = p.lines.filter(l => {
      const edge = l.y < p.height * 0.08 || l.y > p.height * 0.92;
      if (!edge || l.cols.length !== 1 || !PAGE_NUMBER.test(l.text.trim())) return true;
      numbered++;
      if (l.y < p.height / 2) numberY = Math.min(numberY ?? Infinity, l.y);
      const mid = (l.x + l.right) / 2;
      numberAlign = mid > p.width * 0.65 ? 'right' : mid < p.width * 0.35 ? 'left' : 'center';
      return false;
    });
  }

  const lines = all.flatMap(p => p.lines);
  const chars = lines.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
  const first = all[0] || { width: 595, height: 842 };
  const cm = 28.35;

  // Text area: everything text and images cover, at least 1 cm from the edges (2 cm margins when
  // there is nothing to measure). Full-page pictures are not counted.
  const boxes = [...lines.map(l => [l.x, l.right]),
    ...all.flatMap(p => (p.images || []).filter(im => im.w < 0.9 * p.width).map(im => [im.x, im.x + im.w]))];
  const left = boxes.length ? Math.max(cm, Math.min(...boxes.map(b => b[0]))) : 2 * cm;
  const right = boxes.length ? Math.min(first.width - cm / 2 - 3, Math.max(...boxes.map(b => b[1]))) : first.width - 2 * cm;
  const width = Math.max(right - left, 100);
  const sizeCount = {};
  for (const l of lines) sizeCount[l.size] = (sizeCount[l.size] || 0) + l.text.length;
  const bodySize = +(Object.entries(sizeCount).sort((p, q) => q[1] - p[1])[0]?.[0] ?? 11);
  const fontCount = {};
  for (const l of lines) for (const c of l.cols) for (const r of c.runs) fontCount[r.font] = (fontCount[r.font] || 0) + r.text.length;
  const bodyFont = Object.entries(fontCount).sort((p, q) => q[1] - p[1])[0]?.[0] || 'Arial';

  // Typical line pitch (baseline distance) as a multiple of the font size
  const ratios = [];
  for (const p of all) for (let i = 1; i < p.lines.length; i++) {
    const a = p.lines[i - 1], b = p.lines[i], dy = a.y - b.y;
    if (Math.abs(a.size - b.size) < 0.5 && dy > 0.8 * b.size && dy < 2 * b.size) ratios.push(dy / b.size);
  }
  const pitch = median(ratios) || 1.2;

  // A line is "full" when it reaches the right edge – or when the first word of the next line
  // would not have fitted behind it (ragged right text breaks early before long words)
  const full = (l, next) => {
    if (l.right >= right - Math.max(2 * l.size, 0.04 * width)) return true;
    if (!next) return false;
    const charW = (next.right - next.x) / Math.max(next.text.length, 1);
    const word = next.text.split(/\s/)[0].length;
    return l.right + (word + 1) * charW > right - 0.25 * l.size;
  };
  const paragraphs = [];
  let para = null;
  all.forEach((p, pageIndex) => {
    p.lines.forEach((l, i) => {
      const prev = i > 0 ? p.lines[i - 1] : null;
      const dy = prev ? prev.y - l.y : null;
      const cont = para && para.lines.length && continues(para, l, dy, i === 0 && !keepPages);
      if (cont) { joinLine(para, l); return; }
      para = { lines: [l], page: pageIndex, gap: dy, cols: l.cols.length > 1 };
      paragraphs.push(para);
    });
  });

  function continues(para, l, dy, acrossPage) {
    const last = para.lines.at(-1), firstLine = para.lines[0];
    if (para.cols || l.cols.length > 1) return false;
    if (Math.abs(last.size - l.size) > 0.5 || last.bold !== l.bold) return false;
    if (!acrossPage && (dy == null || dy <= 0 || dy > pitch * l.size * 1.3)) return false;
    if (!full(last, l) || LIST_START.test(l.text)) return false;
    if (para.lines.length === 1) return Math.abs(l.x - firstLine.x) < 3 * l.size;
    return Math.abs(l.x - para.lines[1].x) < 0.6 * l.size;
  }

  // Adds a line to a paragraph; a word split at the line end ("Arbeits-" + "vertrag") is joined again
  function joinLine(para, l) {
    const prevLine = para.lines.at(-1);
    para.lines.push(l);
    l.joinHyphen = /[a-zäöüß]-$/.test(prevLine.text) && /^[a-zäöüß]/.test(l.text) && !/^(und|oder|bzw|sowie)\b/.test(l.text);
  }

  // Paragraph formatting from the geometry
  const out = paragraphs.map(pa => {
    const f = pa.lines[0];
    const runs = [];
    pa.lines.forEach((l, i) => {
      l.cols.forEach((c, ci) => {
        if (ci > 0) runs.push({ ...c.runs[0], text: '\t' });
        for (const r of c.runs) runs.push({ ...r });
      });
      const next = pa.lines[i + 1];
      if (next) {
        const last = runs.at(-1);
        if (next.joinHyphen) last.text = last.text.slice(0, -1);
        else last.text += ' ';
      }
    });
    const merged = [];
    for (const r of runs) {
      const m = merged.at(-1);
      if (m && m.bold === r.bold && m.italic === r.italic && m.size === r.size && m.font === r.font) m.text += r.text;
      else merged.push(r);
    }
    const contX = pa.lines.length > 1 ? pa.lines[1].x : f.x;
    let align = 'left';
    let indent = Math.max(0, contX - left), firstLine = f.x - contX;
    if (pa.lines.length === 1 && !pa.cols) {
      const mid = (f.x + f.right) / 2, center = left + width / 2;
      if (f.x - left > 0.1 * width && Math.abs(mid - center) < 0.03 * width) { align = 'center'; indent = 0; firstLine = 0; }
      else if (f.x - left > 0.5 * width && f.right > right - 0.02 * width) { align = 'right'; indent = 0; firstLine = 0; }
    } else if (pa.lines.length > 2 && pa.lines.slice(0, -1).every(l => Math.abs(l.right - right) < 0.6 * l.size)) {
      align = 'justify';
    }
    const ownPitch = pa.lines.length > 1 ? median(pa.lines.slice(1).map((l, i) => pa.lines[i].y - l.y)) : pitch * f.size;
    return {
      runs: merged,
      tabs: pa.cols ? f.cols.slice(1).map(c => c.x - left) : [],
      indent, firstLine, align,
      before: pa.gap != null && pa.gap > 0 ? Math.max(0, pa.gap - pitch * f.size) : 0,
      line: Math.min(Math.max(ownPitch, f.size), 3 * f.size),
      page: pa.page, top: f.y + f.size,
      oneLine: pa.lines.length === 1,
      heading: f.bold && f.size >= bodySize * 1.15 && pa.lines.length <= 3,
    };
  });

  // Margins: the outermost text of all pages. Word puts the first baseline about one line
  // below the top margin and needs the descent below the last baseline.
  const withText = all.filter(p => p.lines.length);
  const topGap = withText.length ? Math.min(...withText.map(p => p.height - p.lines[0].y - 0.85 * pitch * p.lines[0].size)) : 2 * cm;
  // Bottom: lowest text of the pages that are followed by another one – the last page usually
  // ends early and says nothing about the margin (a one-page document gets the top margin)
  const fullPages = withText.filter(p => p !== all.at(-1));
  const bottom = fullPages.length ? Math.min(...fullPages.map(p => Math.min(...p.lines.map(l => l.y - 0.3 * l.size))))
    : Math.max(2 * cm, topGap) + 4;
  const pageRight = Math.max(cm / 2, first.width - right - 3);
  const textHeight = first.height - Math.max(cm / 2, topGap) - Math.max(cm / 2, bottom - 4);

  // Images as paragraphs of their own, scaled down to the text area if needed
  const pictures = all.flatMap((p, pageIndex) => (p.images || []).map(im => {
    const fit = Math.min(1, (first.width - left - pageRight) / im.w, (textHeight - 2) / im.h);
    const w = im.w * fit, h = im.h * fit;
    const mid = im.x + im.w / 2, center = left + width / 2;
    const centered = im.x - left > 0.1 * width && Math.abs(mid - center) < 0.05 * width;
    return {
      image: { data: im.data, type: im.type, w, h },
      runs: [], tabs: [], firstLine: 0, before: 6, line: 0,
      indent: centered ? 0 : Math.max(0, Math.min(im.x - left, first.width - left - pageRight - w)),
      align: centered ? 'center' : 'left',
      page: pageIndex, top: im.y + im.h,
    };
  }));

  // Reading order: page by page, top to bottom (stable: paragraphs keep their order)
  const blocks = [...out, ...pictures].sort((p, q) => p.page - q.page || q.top - p.top);
  blocks.forEach((b, i) => { b.pageBreak = keepPages && b.page > 0 && (i === 0 || blocks[i - 1].page !== b.page); });

  return {
    pages: all.length,
    emptyPages: all.filter(p => !p.lines.length && !(p.images || []).length).length,
    ocrPages: all.filter(p => p.ocr).length,
    ocrFailed: all.filter(p => p.ocrError).length,
    ocrError: all.find(p => p.ocrError)?.ocrError || null,
    images: pictures.length,
    chars,
    bodySize, bodyFont, pitch,
    page: {
      width: first.width, height: first.height,
      // 3 pt slack on the right: Word measures text slightly differently and would otherwise wrap
      // lines that end exactly at the margin
      left, right: pageRight,
      top: Math.max(cm / 2, topGap), bottom: Math.max(cm / 2, bottom - 4),
      footer: numberY != null ? Math.max(8, numberY - 0.3 * bodySize) : null,
    },
    pageNumbers: numbered >= Math.max(1, all.length / 2) ? numberAlign : null,
    paragraphs: blocks,
  };
}

/* ---------- 4. Word file ---------- */

const loaded = {};
function loadScript(src) {
  return loaded[src] ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { delete loaded[src]; reject(new Error('Bibliothek nicht ladbar: ' + src)); };
    document.head.append(s);
  });
}

const tw = pt => Math.round(pt * 20);   // points → twentieths of a point (DXA)

export async function toDocx(model, title) {
  await loadScript(url('../assets/vendor/docx/index.iife.js'));
  const D = window.docx;
  const ALIGN = { left: D.AlignmentType.LEFT, center: D.AlignmentType.CENTER, right: D.AlignmentType.RIGHT, justify: D.AlignmentType.JUSTIFIED };
  const pg = model.page;
  const px = pt => Math.max(1, Math.round(pt * 96 / 72));   // docx sizes images in pixels at 96 dpi
  const children = model.paragraphs.map(p => p.image ? new D.Paragraph({
    children: [new D.ImageRun({ type: p.image.type, data: p.image.data, transformation: { width: px(p.image.w), height: px(p.image.h) } })],
    alignment: p.align === 'center' ? ALIGN.center : undefined,
    indent: { left: tw(p.indent) },
    spacing: { before: tw(p.before), after: tw(6) },
    pageBreakBefore: p.pageBreak || undefined,
  }) : new D.Paragraph({
    children: p.runs.map(r => new D.TextRun({
      // Tabs as real Word tab elements, not as a raw character inside the text
      children: r.text.split('\t').flatMap((part, i) => i ? [new D.Tab(), part] : [part]).filter(c => c !== ''),
      bold: r.bold, italics: r.italic, size: Math.round(r.size * 2),
      font: r.font === model.bodyFont ? undefined : r.font,
    })),
    alignment: p.align === 'left' ? undefined : ALIGN[p.align],
    indent: {
      left: tw(p.indent),
      // A one-line paragraph may run up to 1 cm into the right margin (not closer than 0.5 cm to the
      // edge) instead of wrapping – PDFs often set such lines slightly condensed, which Word cannot reproduce
      ...(p.oneLine && p.align === 'left' && pg.right > 14 ? { right: -tw(Math.min(pg.right - 14, 28.35)) } : {}),
      ...(p.firstLine > 1 ? { firstLine: tw(p.firstLine) } : p.firstLine < -1 ? { hanging: tw(-p.firstLine) } : {}),
    },
    tabStops: p.tabs.map(x => ({ type: D.TabStopType.LEFT, position: tw(x) })),
    spacing: { before: tw(Math.min(p.before, 72)), after: 0, line: tw(p.line), lineRule: D.LineRuleType.AT_LEAST },
    pageBreakBefore: p.pageBreak || undefined,
    keepNext: p.heading || undefined,
    outlineLevel: p.heading ? 0 : undefined,
  }));
  const footers = model.pageNumbers ? {
    default: new D.Footer({ children: [new D.Paragraph({
      alignment: ALIGN[model.pageNumbers],
      children: [new D.TextRun({ children: [D.PageNumber.CURRENT], size: Math.round(model.bodySize * 2) })],
    })] }),
  } : undefined;
  const doc = new D.Document({
    title: title || undefined,
    creator: 'PDF zu Word',
    styles: { default: { document: { run: { font: model.bodyFont, size: Math.round(model.bodySize * 2) } } } },
    sections: [{
      properties: {
        page: {
          size: { width: tw(pg.width), height: tw(pg.height) },
          margin: { left: tw(pg.left), right: tw(pg.right), top: tw(pg.top), bottom: tw(pg.bottom), footer: tw(Math.min(pg.footer ?? pg.bottom / 2, pg.bottom / 2)) },
        },
      },
      footers,
      children: children.length ? children : [new D.Paragraph({})],
    }],
  });
  return D.Packer.toBlob(doc);
}
