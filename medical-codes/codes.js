/* Kodiersysteme – reading the BfArM download files, without DOM (runs in parse-worker.js and in tests).
   See README.md for the formats and the data model.
     MedCodes.readFile(file, onProgress) → [dataset, …]   ZIP (also nested ZIPs), ClaML-XML or EDV-TXT
     MedCodes.parseClaML(text, name)    → dataset of kind 'claml'
     MedCodes.parseTxt(text, name)      → dataset of kind 'list' or null (not a "|"-separated list)
   Errors are thrown as Error with a code in .code ('zip', 'zip64', 'encrypted', 'deflate', 'none', 'semicolon'),
   the page translates them. */
(function (root) {
  'use strict';

  /* ---------- ZIP (central directory; stored and deflate via DecompressionStream) ---------- */
  const u16 = (v, o) => v.getUint16(o, true);
  const u32 = (v, o) => v.getUint32(o, true);
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
  const isZip = async blob => {
    const b = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    return b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  };
  async function zipEntries(blob) {
    const tail = Math.min(blob.size, 65557);
    const end = new DataView(await blob.slice(blob.size - tail).arrayBuffer());
    let eocd = -1;
    for (let i = end.byteLength - 22; i >= 0; i--) if (u32(end, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw fail('zip');
    const count = u16(end, eocd + 10), size = u32(end, eocd + 12), offset = u32(end, eocd + 16);
    if (offset === 0xffffffff || count === 0xffff) throw fail('zip64');
    const cd = new DataView(await blob.slice(offset, offset + size).arrayBuffer());
    const entries = [];
    for (let p = 0, i = 0; i < count && p + 46 <= cd.byteLength; i++) {
      if (u32(cd, p) !== 0x02014b50) throw fail('zip');
      const flags = u16(cd, p + 8), method = u16(cd, p + 10);
      const csize = u32(cd, p + 20), usize = u32(cd, p + 24);
      const nlen = u16(cd, p + 28), xlen = u16(cd, p + 30), clen = u16(cd, p + 32);
      const local = u32(cd, p + 42);
      const raw = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen);
      // Bit 11: UTF-8 names; otherwise CP437 – umlauts in BfArM names are rare, Latin-1 is close enough
      const name = new TextDecoder(flags & 0x800 ? 'utf-8' : 'iso-8859-1').decode(raw);
      if (csize === 0xffffffff || local === 0xffffffff) throw fail('zip64');
      entries.push({ name, method, csize, usize, local, encrypted: !!(flags & 1) });
      p += 46 + nlen + xlen + clen;
    }
    return entries;
  }
  async function zipData(blob, e) {
    if (e.encrypted) throw fail('encrypted');
    const h = new DataView(await blob.slice(e.local, e.local + 30).arrayBuffer());
    if (u32(h, 0) !== 0x04034b50) throw fail('zip');
    const start = e.local + 30 + u16(h, 26) + u16(h, 28);
    const part = blob.slice(start, start + e.csize);
    if (e.method === 0) return part;
    if (e.method !== 8) throw fail('zip', 'method ' + e.method);
    if (typeof DecompressionStream === 'undefined') throw fail('deflate');
    try { return await new Response(part.stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob(); }
    catch (err) { throw fail('zip', err.message); }
  }

  /* ---------- Text decoding ---------- */
  async function decodeText(blob, isXml) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let enc = '';
    if (isXml) {
      const head = new TextDecoder('iso-8859-1').decode(bytes.subarray(0, 200));
      const m = head.match(/encoding\s*=\s*["']([^"']+)/i);
      if (m) enc = m[1].toLowerCase();
    }
    if (enc && !/^utf-?8$/.test(enc)) {
      try { return new TextDecoder(enc).decode(bytes); } catch (_) { /* unknown label: try UTF-8 */ }
    }
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  /* ---------- ClaML (ICD-10-GM, OPS, ICD-10-WHO, ICD-O-3, ICF) ---------- */
  const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const unent = s => s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m));
  const attrs = s => {
    const a = {};
    s.replace(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (m, k, q, d1, d2) => { a[k] = unent(d1 ?? d2); return ''; });
    return a;
  };
  // Elements inside a Label that start a new line or a list item
  const BLOCK = new Set(['Para', 'ListItem', 'Row', 'Fragment', 'Caption', 'Display']);
  const BR = { br: true };
  const USAGE = { dagger: '†', aster: '*', optional: '!' };

  // Calls onTag(name, attrs, closing, selfClosing) and onText(text) – a small streaming scanner, much lighter
  // than DOMParser for the 30–90 MB files.
  function scan(xml, onTag, onText) {
    const n = xml.length;
    let i = 0;
    while (i < n) {
      const lt = xml.indexOf('<', i);
      if (lt < 0) { onText(xml.slice(i)); break; }
      if (lt > i) onText(xml.slice(i, lt));
      const c = xml[lt + 1];
      if (c === '!') {
        if (xml.startsWith('<!--', lt)) { const e = xml.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
        if (xml.startsWith('<![CDATA[', lt)) { const e = xml.indexOf(']]>', lt + 9); onText(xml.slice(lt + 9, e < 0 ? n : e), true); i = e < 0 ? n : e + 3; continue; }
        // DOCTYPE, possibly with an internal subset [ … ]
        const br = xml.indexOf('[', lt), gt = xml.indexOf('>', lt);
        if (br >= 0 && br < gt) { const e = xml.indexOf(']>', br); i = e < 0 ? n : e + 2; } else i = gt < 0 ? n : gt + 1;
        continue;
      }
      if (c === '?') { const e = xml.indexOf('?>', lt); i = e < 0 ? n : e + 2; continue; }
      const gt = xml.indexOf('>', lt);
      if (gt < 0) break;
      let body = xml.slice(lt + 1, gt);
      const closing = body[0] === '/';
      if (closing) body = body.slice(1);
      const self = body.endsWith('/');
      if (self) body = body.slice(0, -1);
      const sp = body.search(/\s/);
      const name = sp < 0 ? body : body.slice(0, sp);
      onTag(name, sp < 0 ? {} : attrs(body.slice(sp)), closing, self);
      i = gt + 1;
    }
  }

  function parseClaML(xml, fileName) {
    const ds = { kind: 'claml', name: fileName, title: '', version: '', date: '', items: [] };
    const classes = new Map();            // code → item
    const modifiers = new Map();          // modifier code → [modifier class codes in order]
    const modClasses = new Map();         // modifier + '\u0000' + code → { code, label, rubrics, meta }
    let cur = null, rubric = null, label = null, inTitle = false, titleText = '', refDepth = 0, refText = '';
    let modifier = null;

    const flushText = (s, cdata) => {
      if (!cdata) s = unent(s);
      if (!label) { if (inTitle) titleText += s; return; }
      if (refDepth) { refText += s; return; }
      const parts = label.parts, last = parts[parts.length - 1];
      if (typeof last === 'string') parts[parts.length - 1] = last + s; else parts.push(s);
    };
    scan(xml, (tag, a, closing, self) => {
      if (closing) {
        if (tag === 'Reference' && refDepth) {
          refDepth = 0;
          const t = refText.replace(/\s+/g, ' ').trim();
          const ra = (label && label._ref) || {};
          if (t && label) label.parts.push(ra.code && ra.code !== t ? { ref: t, code: ra.code } : { ref: t });
          refText = '';
        } else if (tag === 'Label' && label) { finishLabel(); }
        else if (tag === 'Rubric') rubric = null;
        else if (tag === 'Class' || tag === 'ModifierClass') cur = null;
        else if (tag === 'Modifier') modifier = null;
        else if (tag === 'Title') inTitle = false;
        else if (BLOCK.has(tag) && label) label.parts.push(BR);
        return;
      }
      switch (tag) {
        case 'Title':
          if (!cur) { ds.title = a.name || ''; ds.version = a.version || ''; ds.date = a.date || ''; inTitle = !self; }
          break;
        case 'Class':
          cur = { code: a.code, kind: a.kind || '', usage: USAGE[a.usage] || '', sup: '', sub: [], rubrics: [], meta: [], mods: [], excl: [] };
          if (!classes.has(a.code)) { classes.set(a.code, cur); ds.items.push(cur); }
          if (self) cur = null;
          break;
        case 'Modifier':
          modifier = a.code; if (!modifiers.has(a.code)) modifiers.set(a.code, []);
          if (self) modifier = null;
          break;
        case 'ModifierClass':
          cur = { code: a.code, modifier: a.modifier, rubrics: [], meta: [], sub: [], usage: USAGE[a.usage] || '' };
          modClasses.set(a.modifier + '\u0000' + a.code, cur);
          if (!modifiers.has(a.modifier)) modifiers.set(a.modifier, []);
          if (!modifiers.get(a.modifier).includes(a.code)) modifiers.get(a.modifier).push(a.code);
          if (self) cur = null;
          break;
        case 'SuperClass':
          if (cur && !cur.sup && !cur.modifier) cur.sup = a.code;
          break;
        case 'SubClass':
          if (cur) cur.sub.push(a.code);
          else if (modifier) { const l = modifiers.get(modifier); if (!l.includes(a.code)) l.push(a.code); }
          break;
        case 'ModifiedBy':
          if (cur && cur.mods) cur.mods.push({ code: a.code, all: a.all !== 'false', valid: [] });
          break;
        case 'ValidModifierClass':
          if (cur && cur.mods && cur.mods.length) cur.mods[cur.mods.length - 1].valid.push(a.code);
          break;
        case 'ExcludeModifier':
          if (cur && cur.excl) cur.excl.push(a.code);
          break;
        case 'Meta':
          if (cur && a.name) cur.meta.push([a.name, a.value || '']);
          break;
        case 'Rubric':
          if (cur) { rubric = { kind: a.kind || '', labels: [] }; cur.rubrics.push(rubric); }
          break;
        case 'Label':
          if (rubric && !self) { label = { lang: a['xml:lang'] || '', parts: [] }; rubric.labels.push(label); }
          break;
        case 'Reference':
          if (label && !self) { refDepth = 1; refText = ''; label._ref = a; }
          break;
        default:
          if (BLOCK.has(tag) && label && !self) label.parts.push(BR);
          else if (tag === 'Cell' && label && !self) label.parts.push(' ');
      }
    }, flushText);

    function finishLabel() {
      // Whitespace: collapse inside text, block elements become line breaks; references stay objects
      const out = [];
      const add = str => { if (typeof out[out.length - 1] === 'string') out[out.length - 1] += str; else out.push(str); };
      for (const p of label.parts) {
        if (typeof p === 'string') add(p.replace(/\s+/g, ' '));
        else if (p === BR) add('\n');
        else out.push(p);
      }
      for (let i = 0; i < out.length; i++) if (typeof out[i] === 'string') out[i] = out[i].replace(/ *\n[ \n]*/g, '\n');
      if (typeof out[0] === 'string') out[0] = out[0].replace(/^\s+/, '');
      const li = out.length - 1;
      if (typeof out[li] === 'string') out[li] = out[li].replace(/\s+$/, '');
      label.parts = out.filter(p => p !== '');
      delete label._ref;
      label = null;
    }

    /* Simplify: one text per rubric (first label, German preferred), title = preferred rubric */
    const simplify = c => {
      const rub = [];
      let title = '';
      for (const r of c.rubrics) {
        const l = r.labels.find(x => /^de/i.test(x.lang)) || r.labels[0];
        if (!l) continue;
        if (r.kind === 'preferred' && !title) { title = textOf(l.parts); continue; }
        rub.push({ kind: r.kind, parts: l.parts });
      }
      return { title, rub };
    };

    const out = [];
    const index = new Map();
    for (const c of ds.items) {
      const s = simplify(c);
      const it = { code: c.code, kind: c.kind, usage: c.usage, title: s.title, rub: s.rub, meta: c.meta, parent: c.sup || '', children: [] };
      index.set(c.code, it); out.push(it);
    }
    // Children in the order of SubClass, then any items that name this parent but were not listed
    for (const c of ds.items) {
      const it = index.get(c.code);
      for (const s of c.sub) if (index.has(s) && index.get(s).parent === c.code) it.children.push(s);
    }
    for (const it of out) {
      const p = it.parent && index.get(it.parent);
      if (p && !p.children.includes(it.code)) p.children.push(it.code);
    }

    /* Modifiers (OPS 6th digit, ICD 5th digit …): codes that exist only as class + modifier class.
       A ModifiedBy applies to the leaves below the class; a modifier code with "." is not appended to a code
       that already has one. Existing classes always win. */
    const LIMIT = 300000;
    let generated = 0;
    const modClass = (m, code) => modClasses.get(m + '\u0000' + code);
    const expand = (code, mods) => {
      const it = index.get(code);
      if (!mods.length || generated > LIMIT) return;
      const [m, ...rest] = mods;
      const codes = (m.all || !m.valid.length ? modifiers.get(m.code) || [] : m.valid);
      for (const mc of codes) {
        if (mc.includes('.') && code.includes('.')) continue;
        const md = modClass(m.code, mc);
        if (!md) continue;
        const nc = code + mc;
        if (index.has(nc)) continue;
        const ms = simplify(md);
        const n = { code: nc, kind: 'category', usage: it.usage, title: it.title + ': ' + ms.title, rub: ms.rub, meta: md.meta, parent: code, children: [], gen: true };
        index.set(nc, n); out.push(n); it.children.push(nc); generated++;
        expand(nc, rest);
      }
    };
    const raw = new Map(ds.items.map(c => [c.code, c]));
    const walk = (code, inherited) => {
      const c = raw.get(code), it = index.get(code);
      let mods = inherited.filter(m => !(c && c.excl.includes(m.code)));
      if (c) for (const m of c.mods) if (!mods.some(x => x.code === m.code)) mods = mods.concat(m);
      if (it.children.length) { for (const ch of it.children.slice()) walk(ch, mods); return; }
      expand(code, mods);
    };
    for (const it of out.slice()) if (!it.parent || !index.has(it.parent)) walk(it.code, []);

    ds.items = sortByTree(out, index);
    ds.title = ds.title ? (ds.version && !ds.title.includes(ds.version) ? ds.title + ' ' + ds.version : ds.title) : guessTitle(fileName);
    titleText = titleText.replace(/\s+/g, ' ').trim();
    ds.longTitle = titleText;
    return ds;
  }
  // Tree order (depth first), so lists show codes in the order of the book
  function sortByTree(items, index) {
    const res = [], seen = new Set();
    const visit = it => {
      if (seen.has(it.code)) return;
      seen.add(it.code); res.push(it);
      for (const c of it.children) { const ch = index.get(c); if (ch) visit(ch); }
    };
    for (const it of items) if (!it.parent || !index.has(it.parent)) visit(it);
    for (const it of items) visit(it);
    return res;
  }
  const textOf = parts => parts.map(p => typeof p === 'string' ? p : p.ref).join('').replace(/\s+/g, ' ').trim();

  /* ---------- EDV-TXT lists: Alpha-ID-SE, alphabets of ICD-10-GM / OPS / ICD-10-WHO ----------
     One entry per line, fields separated by "|", the text is the last field. Alpha-ID-SE:
     validity|Alpha-ID|ICD primary|star|additional|primary 2|ORPHAcode|text. Other lists: codes are recognised
     by their form. */
  const CODE_RE = [
    /^[A-Z]\d{2}(\.[0-9-]{1,2})?[†*!+]?$/,           // ICD-10
    /^\d-\d{2}[0-9a-z]?(\.[0-9a-z-]{1,2})?$/,          // OPS
    /^[0-9]{4}\/[0-9]$/,                              // ICD-O morphology
  ];
  const isCode = s => CODE_RE.some(r => r.test(s));
  function parseTxt(text, fileName) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return null;
    const sample = lines.slice(0, 50);
    const pipes = sample.filter(l => l.includes('|')).length, semis = sample.filter(l => l.includes(';')).length;
    if (pipes < sample.length * 0.8) { if (semis >= sample.length * 0.8) throw fail('semicolon'); return null; }
    const alpha = /alpha-?id/i.test(fileName) || sample.every(l => { const f = l.split('|'); return f.length === 8 && /^[01]$/.test(f[0]) && /^I\d+$/.test(f[1]); });
    const items = [];
    for (const l of lines) {
      const f = l.split('|').map(s => s.trim());
      const text = f[f.length - 1];
      if (!text) continue;
      const it = { text, codes: [] };
      if (alpha && f.length >= 8) {
        it.valid = f[0] !== '0';
        it.id = f[1];
        const roles = ['primary', 'star', 'add', 'primary2'];
        for (let i = 0; i < 4; i++) if (f[2 + i]) it.codes.push({ code: f[2 + i], role: roles[i] });
        if (f[6]) it.orpha = f[6];
      } else {
        for (let i = 0; i < f.length - 1; i++) if (f[i] && isCode(f[i])) it.codes.push({ code: f[i], role: it.codes.length ? 'more' : 'primary' });
        if (/^I?\d+$/.test(f[1] || '') && f.length > 2) it.id = f[1];
      }
      items.push(it);
    }
    if (!items.length) return null;
    // A header line (e.g. "Gültigkeit|Alpha-ID|…") has no codes
    if (items.length > 1 && !items[0].codes.length && items[1].codes.length && /alpha|kode|code|gültig/i.test(items[0].text + lines[0])) items.shift();
    return { kind: 'list', alpha, name: fileName, title: guessTitle(fileName, alpha), version: (fileName.match(/20\d\d/) || [''])[0], items };
  }

  function guessTitle(fileName, alpha) {
    const n = fileName.replace(/^.*\//, '').toLowerCase();
    const year = (n.match(/20\d\d/) || [''])[0];
    let t;
    if (alpha || /alpha-?id/.test(n)) t = 'Alpha-ID-SE';
    else if (/icd10gm|icd-10-gm/.test(n)) t = /alpha/.test(n) ? 'ICD-10-GM Alphabet' : 'ICD-10-GM';
    else if (/icd10who|x1w|x3w/.test(n)) t = /alpha|x3w/.test(n) ? 'ICD-10-WHO Alphabet' : 'ICD-10-WHO';
    else if (/^ops/.test(n)) t = /alpha/.test(n) ? 'OPS Alphabet' : 'OPS';
    else if (/icdo3|icd-o-3/.test(n)) t = 'ICD-O-3';
    else if (/icf/.test(n)) t = 'ICF';
    else return fileName.replace(/^.*\//, '');
    return year ? t + ' ' + year : t;
  }

  /* ---------- Whole files ---------- */
  async function readBlob(blob, name, out, depth, onProgress) {
    const lower = name.toLowerCase();
    if (depth < 3 && (lower.endsWith('.zip') || await isZip(blob))) {
      const entries = await zipEntries(blob);
      // Biggest first is not needed; the order of the archive keeps related files together
      for (const e of entries) {
        const n = e.name.toLowerCase();
        if (n.endsWith('/') || /(^|\/)(__macosx|\._)/.test(n)) continue;
        if (!/\.(xml|txt|zip)$/.test(n)) continue;
        onProgress && onProgress({ step: 'unzip', file: e.name.replace(/^.*\//, '') });
        await readBlob(await zipData(blob, e), e.name, out, depth + 1, onProgress);
      }
      return;
    }
    if (/\.xml$/.test(lower) || (!/\.txt$/.test(lower) && await startsWith(blob, /<\?xml|<ClaML/))) {
      if (!await startsWith(blob, /<ClaML[\s>]/, 4096)) return;
      onProgress && onProgress({ step: 'parse', file: name.replace(/^.*\//, '') });
      out.push(parseClaML(await decodeText(blob, true), name.replace(/^.*\//, '')));
      return;
    }
    if (/\.txt$/.test(lower) || blob.type === 'text/plain') {
      onProgress && onProgress({ step: 'parse', file: name.replace(/^.*\//, '') });
      try {
        const ds = parseTxt(await decodeText(blob, false), name.replace(/^.*\//, ''));
        if (ds) out.push(ds);
      } catch (e) { if (e.code === 'semicolon') out.semicolon = true; else throw e; }
    }
  }
  async function startsWith(blob, re, len = 512) {
    const s = new TextDecoder('iso-8859-1').decode(new Uint8Array(await blob.slice(0, len).arrayBuffer()));
    return re.test(s);
  }
  async function readFile(file, onProgress) {
    const out = [];
    await readBlob(file, file.name || '', out, 0, onProgress);
    if (!out.length) throw fail(out.semicolon ? 'semicolon' : 'none');
    return out;
  }

  root.MedCodes = { readFile, parseClaML, parseTxt, zipEntries, guessTitle, isCode, textOf };
})(typeof self !== 'undefined' ? self : this);
