// Test helpers for PDF zu Word and PDF bearbeiten: build small PDFs from scratch, read their pages back, read .docx files.
// Kept dependency-free so the expected values stay independent of the libraries under test.
import { inflateRawSync, deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

/**
 * Builds a PDF with Courier text (monospace: every character is exactly 0.6 em wide, so
 * line widths can be computed without font metrics).
 *   pages: [{ texts: [{ x, y, size, text, bold }], draw: 'PDF operators', rotate: 90,
 *             images: [{ x, y, w, h, width, height, rgb }] }]   rgb: Buffer, 3 bytes per pixel, rows top to bottom
 * Coordinates in points, origin bottom left, A4.
 *   options.encrypt: { user, owner } – password protection with the PDF standard security handler,
 *   revision 2 (RC4, 40 bit; PDF 1.7 spec, algorithms 1–4). user '' = opens without a password,
 *   only protected against changes (as many "secured" PDFs are).
 */
export function makePdf(pages, options = {}) {
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
    const xobjects = (p.images || []).map((im, i) => {
      const data = deflateSync(im.rgb);
      const ref = add(`<< /Type /XObject /Subtype /Image /Width ${im.width} /Height ${im.height} /ColorSpace /DeviceRGB ` +
        `/BitsPerComponent 8 /Filter /FlateDecode /Length ${data.length} >>\nstream\n${data.toString('latin1')}\nendstream`);
      ops.push(`q ${im.w} 0 0 ${im.h} ${im.x} ${im.y} cm /Im${i} Do Q`);
      return `/Im${i} ${ref} 0 R`;
    });
    const stream = Buffer.from(ops.join('\n'), 'latin1');
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream.toString('latin1')}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842]${p.rotate ? ` /Rotate ${p.rotate}` : ''} /Contents ${content} 0 R ` +
      `/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >>${xobjects.length ? ` /XObject << ${xobjects.join(' ')} >>` : ''} >> >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const enc = options.encrypt && encryption(options.encrypt);
  if (enc) {
    // every stream encrypted with its object key (the file has no strings outside streams)
    objs.forEach((body, i) => {
      objs[i] = body.replace(/stream\n([\s\S]*)\nendstream$/, (_, data) =>
        `stream\n${rc4(enc.objectKey(i + 1), Buffer.from(data, 'latin1')).toString('latin1')}\nendstream`);
    });
    objs.push(`<< /Filter /Standard /V 1 /R 2 /O <${enc.O.toString('hex')}> /U <${enc.U.toString('hex')}> /P ${enc.P} >>`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => { const o = Buffer.byteLength(out, 'latin1'); out += `${i + 1} 0 obj\n${body}\nendobj\n`; return o; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  const encTrailer = enc ? ` /Encrypt ${objs.length} 0 R /ID [<${enc.id.toString('hex')}> <${enc.id.toString('hex')}>]` : '';
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R${encTrailer} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const md5 = (...parts) => createHash('md5').update(Buffer.concat(parts)).digest();
function rc4(key, data) {
  const S = [...Array(256).keys()];
  for (let i = 0, j = 0; i < 256; i++) { j = (j + S[i] + key[i % key.length]) & 255; [S[i], S[j]] = [S[j], S[i]]; }
  const out = Buffer.alloc(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255; j = (j + S[i]) & 255; [S[i], S[j]] = [S[j], S[i]];
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}
const PAD = Buffer.from('28BF4E5E4E758A4164004E56FFFA01082E2E00B6D0683E802F0CA9FE6453697A', 'hex');
const padPw = pw => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);
function encryption({ user, owner }) {
  const P = -44;                                                            // print only, no changes
  const id = md5(Buffer.from('pdf-tools test file'));
  const O = rc4(md5(padPw(owner || user)).subarray(0, 5), padPw(user));      // algorithm 3
  const p = Buffer.alloc(4); p.writeInt32LE(P);
  const key = md5(padPw(user), O, p, id).subarray(0, 5);                    // algorithm 2
  const U = rc4(key, PAD);                                                  // algorithm 4
  const objectKey = n => md5(key, Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, 0, 0])).subarray(0, 10);   // algorithm 1
  return { P, id, O, U, objectKey };
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

/**
 * Pages of a PDF without object streams or compressed content (as written by makePdf and by
 * "PDF bearbeiten"), in document order: [{ rotate, texts: ['strings shown with Tj'] }].
 * Follows Catalog → Pages → Kids; /Rotate may be inherited from a Pages node.
 */
export function readPdfPages(buf) {
  const src = buf.toString('latin1');
  const objs = new Map();
  for (const m of src.matchAll(/(\d+) 0 obj\s*([\s\S]*?)endobj/g)) objs.set(Number(m[1]), m[2]);
  const dict = n => { const o = objs.get(n); if (o == null) throw new Error(`object ${n} missing`); return o.split(/\bstream\r?\n/)[0]; };
  const trailer = src.slice(src.lastIndexOf('trailer'));
  const root = Number(trailer.match(/\/Root (\d+) 0 R/)[1]);
  const pagesRef = Number(dict(root).match(/\/Pages (\d+) 0 R/)[1]);
  const out = [];
  const walk = (n, inherited) => {
    const d = dict(n);
    const rot = d.match(/\/Rotate (-?\d+)/);
    const rotate = rot ? Number(rot[1]) : inherited;
    if (/\/Type\s*\/Pages\b/.test(d)) {
      const kids = d.match(/\/Kids\s*\[([^\]]*)\]/)[1];
      for (const k of kids.matchAll(/(\d+) 0 R/g)) walk(Number(k[1]), rotate);
      return;
    }
    const c = d.match(/\/Contents\s*(\[[^\]]*\]|\d+ 0 R)/)[1];
    const texts = [];
    for (const r of c.matchAll(/(\d+) 0 R/g)) {
      const body = objs.get(Number(r[1]));
      const stream = body.slice(body.search(/\bstream\r?\n/)).replace(/^stream\r?\n/, '').replace(/\s*endstream[\s\S]*$/, '');
      for (const t of stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) texts.push(t[1].replace(/\\(.)/g, '$1'));
    }
    out.push({ rotate: ((rotate % 360) + 360) % 360, texts });
  };
  walk(pagesRef, 0);
  return out;
}
