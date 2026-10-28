// Test helpers for PDF zu Word: build small PDFs from scratch and read .docx files.
// Kept dependency-free so the expected values stay independent of the libraries under test.
import { inflateRawSync } from 'node:zlib';

/**
 * Builds a PDF with Courier text (monospace: every character is exactly 0.6 em wide, so
 * line widths can be computed without font metrics).
 *   pages: [{ texts: [{ x, y, size, text, bold }], draw: 'PDF operators' }]
 * Coordinates in points, origin bottom left, A4.
 */
export function makePdf(pages) {
  const objs = [];
  const add = body => { objs.push(body); return objs.length; };
  const catalog = add(null), pagesObj = add(null);
  const regular = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const bold = add('<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const p of pages) {
    const ops = (p.texts || []).map(t =>
      `BT /${t.bold ? 'F2' : 'F1'} ${t.size} Tf ${t.x} ${t.y} Td (${t.text.replace(/[\\()]/g, '\\$&')}) Tj ET`);
    if (p.draw) ops.push(p.draw);
    const stream = Buffer.from(ops.join('\n'), 'latin1');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream.toString('latin1')}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] /Contents ${content} 0 R ` +
      `/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => { const o = Buffer.byteLength(out, 'latin1'); out += `${i + 1} 0 obj\n${body}\nendobj\n`; return o; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Greedy word wrap at `width` characters (how a word processor breaks ragged-right text) */
export function wrap(text, width) {
  const lines = [];
  let line = '';
  for (const w of text.split(' ')) {
    if (line && line.length + 1 + w.length > width) { lines.push(line); line = w; }
    else line = line ? line + ' ' + w : w;
  }
  if (line) lines.push(line);
  return lines;
}

/** Files of a ZIP archive (e.g. .docx) as Map(name -> Buffer) */
export function unzip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + size);
    files.set(name, method === 8 ? inflateRawSync(data) : Buffer.from(data));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const decodeXml = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Paragraphs of word/document.xml: { text (tabs as \t), xml, bold (all text bold) } */
export function docxParagraphs(xml) {
  const body = xml.slice(xml.indexOf('<w:body>'));
  return [...body.matchAll(/<w:p>([\s\S]*?)<\/w:p>/g)].map(m => {
    const runs = [...m[1].matchAll(/<w:r>([\s\S]*?)<\/w:r>/g)].map(r => r[1]);
    const text = runs.map(r => [...r.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>/g)]
      .map(t => t[0] === '<w:tab/>' ? '\t' : decodeXml(t[1])).join('')).join('');
    const textRuns = runs.filter(r => /<w:t[\s>]/.test(r));
    return { text, xml: m[1], bold: textRuns.length > 0 && textRuns.every(r => /<w:b\/>|<w:b w:val="true"\/>/.test(r)) };
  });
}
