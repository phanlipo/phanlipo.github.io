// PDF → Word: reads the text of a PDF with pdf.js (position, size, font) and rebuilds
// paragraphs from the geometry, then writes a .docx with the docx library.
// Everything runs in the browser; the file never leaves the device.
//
// Steps: extract() text items per page → lines (same baseline) → paragraphs (line pitch,
// indentation, full lines) → layout() with indents, tabs, alignment → toDocx().

import * as pdfjs from '../assets/vendor/pdfjs/pdf.min.mjs';

// Full literal paths: scripts/build.mjs finds the libraries for the offline cache by them
const url = path => new URL(path, import.meta.url).href;
pdfjs.GlobalWorkerOptions.workerSrc = url('../assets/vendor/pdfjs/pdf.worker.min.mjs');

/* ---------- 1. Read the PDF ---------- */

// Opens a PDF. Throws an Error with .code = 'password' | 'invalid' for the page to explain.
export async function open(data, password) {
  const task = pdfjs.getDocument({
    data, password,
    isEvalSupported: false,          // strict CSP: no eval / new Function
    disableFontFace: true,           // only metrics and names are needed, never draw glyphs
    fontExtraProperties: true,
    standardFontDataUrl: url('../assets/vendor/pdfjs/standard_fonts/'),
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

// Text items of every page: { s, x, y, w, size, font, bold, italic } in PDF points,
// origin bottom left of the page.
export async function extract(pdf, onPage) {
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const [x0, y0, x1, y1] = page.view;
    const text = await page.getTextContent();
    // The operator list makes pdf.js send the font objects (real name, bold/italic flags)
    await page.getOperatorList().catch(() => {});
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
    const items = [];
    for (const it of text.items) {
      if (!it.str || !it.transform) continue;
      const [a, b, c, d, e, f] = it.transform;
      const size = Math.hypot(c, d) || Math.hypot(a, b);
      if (!(size > 0.5)) continue;
      const font = fontOf(it.fontName);
      items.push({ s: it.str, x: e - x0, y: f - y0, w: it.width, size, font: font.name, bold: font.bold, italic: font.italic });
    }
    pages.push({ width: x1 - x0, height: y1 - y0, items });
    page.cleanup();
    onPage?.(n, pdf.numPages);
  }
  return pages;
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
  if (!lines.length) return { chars: 0, pages: all.length, emptyPages: all.length, paragraphs: [], page: { width: first.width, height: first.height } };

  // Text area and body size of the whole document
  const left = Math.min(...lines.map(l => l.x));
  const right = Math.max(...lines.map(l => l.right));
  const width = Math.max(right - left, 100);
  const sizeCount = {};
  for (const l of lines) sizeCount[l.size] = (sizeCount[l.size] || 0) + l.text.length;
  const bodySize = +Object.entries(sizeCount).sort((p, q) => q[1] - p[1])[0][0];
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
      para = { lines: [l], page: pageIndex, pageStart: i === 0 && pageIndex > 0 && keepPages, gap: dy, cols: l.cols.length > 1 };
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
      pageBreak: pa.pageStart,
      oneLine: pa.lines.length === 1,
      heading: f.bold && f.size >= bodySize * 1.15 && pa.lines.length <= 3,
    };
  });

  // Margins: the outermost text of all pages. Word puts the first baseline about one line
  // below the top margin and needs the descent below the last baseline.
  const withText = all.filter(p => p.lines.length);
  const topGap = Math.min(...withText.map(p => p.height - p.lines[0].y - 0.85 * pitch * p.lines[0].size));
  const bottom = Math.min(...withText.map(p => Math.min(...p.lines.map(l => l.y - 0.3 * l.size))));
  const cm = 28.35;
  return {
    pages: all.length,
    emptyPages: all.filter(p => !p.lines.length).length,
    chars,
    bodySize, bodyFont, pitch,
    page: {
      width: first.width, height: first.height,
      // 3 pt slack on the right: Word measures text slightly differently and would otherwise wrap
      // lines that end exactly at the margin
      left: Math.max(cm, left), right: Math.max(cm / 2, first.width - right - 3),
      top: Math.max(cm / 2, topGap), bottom: Math.max(cm / 2, bottom - 4),
      footer: numberY != null ? Math.max(8, numberY - 0.3 * bodySize) : null,
    },
    pageNumbers: numbered >= Math.max(1, all.length / 2) ? numberAlign : null,
    paragraphs: out,
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
  const children = model.paragraphs.map(p => new D.Paragraph({
    children: p.runs.map(r => new D.TextRun({
      // Tabs as real Word tab elements, not as a raw character inside the text
      children: r.text.split('\t').flatMap((part, i) => i ? [new D.Tab(), part] : [part]).filter(c => c !== ''),
      bold: r.bold, italics: r.italic, size: Math.round(r.size * 2),
      font: r.font === model.bodyFont ? undefined : r.font,
    })),
    alignment: p.align === 'left' ? undefined : ALIGN[p.align],
    indent: {
      left: tw(p.indent),
      // A one-line paragraph may run into the right margin (up to 0.5 cm from the edge) instead of
      // wrapping – PDFs often set such lines slightly condensed, which Word cannot reproduce
      ...(p.oneLine && p.align === 'left' && pg.right > 14 ? { right: -tw(pg.right - 14) } : {}),
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
