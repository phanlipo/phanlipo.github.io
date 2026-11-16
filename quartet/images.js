/* Quartett – own pictures for the cards: window.QuartetImages.
   The person brings the pictures (ZIP file or JSON list of links), the page only keeps them on this
   device (Tools.keep, Cache Storage "file:quartet") – nothing is shipped with the app, nothing sent anywhere.

   Matching a picture to a card of a deck (in this order):
     card number ("A1", any case) · card name ("Tyrannosaurus Rex", any case) ·
     file name stem ("tyrannosaurus_rex": lower case, ♀→f, ♂→m, everything but
     a-z 0-9 _ - becomes "_").

   ZIP: entries "<deck id>/…/<stem>.<ext>" go to that deck, others to the deck picked on the page.
        Only stored (0) and deflate (8) entries, no encryption, no ZIP64; inflated with
        DecompressionStream('deflate-raw') – no library needed.
   JSON: { "<deck id>": { "<card number | name | stem>": "https://…" | { "url": "https://…", "credit": "…" } } }
        or, for the deck picked on the page, the inner object alone.

   Kept: "img/<deck id>/<card number>" (picture, at most 480 px) and "images.json"
         { "<deck id>": { "<card number>": { "credit": "…", "from": "zip" | "url" } } }. */
(function () {
  'use strict';
  const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)$/i;
  const MAX_ZIP = 300 * 1024 * 1024, MAX_IMG = 20 * 1024 * 1024, MAX_JSON = 2 * 1024 * 1024, SIDE = 480;
  const INDEX = 'images.json';

  /* ---------- Matching ---------- */
  /** File name stem of a card name (lower case, ♀→f, ♂→m, other characters → "_") */
  const stem = name => String(name).toLowerCase().replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/[^a-zA-Z0-9_-]/g, '_');
  /** Lookup table of a deck: number, name and stem → card number */
  function matcher(deck) {
    const map = new Map();
    for (const c of deck.cards) map.set(c.id.toLowerCase(), c.id);
    for (const c of deck.cards) { const n = c.n.toLowerCase(); if (!map.has(n)) map.set(n, c.id); }
    for (const c of deck.cards) { const s = stem(c.n); if (!map.has(s)) map.set(s, c.id); }
    return key => map.get(String(key).trim().toLowerCase()) || map.get(stem(String(key).trim())) || null;
  }
  const baseName = path => path.split('/').pop().replace(/\.[^.]+$/, '');

  /* ---------- ZIP ---------- */
  /** Entries of a ZIP file: [{ name, method, size, csize, offset }] – reads only the central directory */
  function zipEntries(buf) {
    const dv = new DataView(buf), n = buf.byteLength;
    let eocd = -1;
    for (let i = n - 22; i >= Math.max(0, n - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('noZip');
    const count = dv.getUint16(eocd + 10, true), start = dv.getUint32(eocd + 16, true);
    if (start === 0xffffffff || count === 0xffff) throw new Error('zip64');
    const out = [], dec = new TextDecoder();
    let p = start;
    for (let k = 0; k < count; k++) {
      if (p + 46 > n || dv.getUint32(p, true) !== 0x02014b50) throw new Error('badZip');
      const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true), size = dv.getUint32(p + 24, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const offset = dv.getUint32(p + 42, true);
      const name = dec.decode(new Uint8Array(buf, p + 46, nl));
      if (!name.endsWith('/')) out.push({ name, method, size, csize, offset, encrypted: !!(flags & 1) });
      p += 46 + nl + xl + cl;
    }
    return out;
  }
  /** Bytes of one entry (stored or deflate) */
  async function zipRead(buf, e) {
    const dv = new DataView(buf);
    if (dv.getUint32(e.offset, true) !== 0x04034b50) throw new Error('badZip');
    const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
    const raw = new Uint8Array(buf, start, e.csize);
    if (e.method === 0) return raw.slice();
    if (e.method !== 8) throw new Error('zipMethod');
    if (typeof DecompressionStream !== 'function') throw new Error('noInflate');
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };

  /** Pictures of a ZIP for the decks: [{ deck, id, name, read() }] plus files that fit no card */
  function zipPlan(entries, decks, fallbackDeck) {
    const byId = new Map(decks.map(d => [d.id.toLowerCase(), d])), matchers = new Map();
    const plan = [], unmatched = [];
    for (const e of entries) {
      if (!IMG_EXT.test(e.name) || /(^|\/)(__MACOSX|\.)/.test(e.name)) continue;
      const parts = e.name.split('/');
      const deck = parts.slice(0, -1).map(x => byId.get(x.toLowerCase())).find(Boolean) || fallbackDeck;
      if (!deck) { unmatched.push(e.name); continue; }
      if (!matchers.has(deck.id)) matchers.set(deck.id, matcher(deck));
      const id = matchers.get(deck.id)(baseName(e.name));
      if (!id) { unmatched.push(e.name); continue; }
      plan.push({ deck: deck.id, id, entry: e });
    }
    return { plan, unmatched };
  }

  /* ---------- JSON list of links ---------- */
  /** Plan of a link list: [{ deck, id, url, credit }], keys that fit no card, invalid values */
  function linkPlan(data, decks, fallbackDeck) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('badJson');
    const byId = new Map(decks.map(d => [d.id.toLowerCase(), d]));
    const keys = Object.keys(data);
    // Either { deck: { card: link } } or – for the picked deck – { card: link }
    const nested = keys.length && keys.every(k => byId.has(k.toLowerCase()) && data[k] && typeof data[k] === 'object' && !Array.isArray(data[k]));
    const groups = nested ? keys.map(k => [byId.get(k.toLowerCase()), data[k]]) : [[fallbackDeck, data]];
    const plan = [], unmatched = [], invalid = [];
    for (const [deck, links] of groups) {
      if (!deck) throw new Error('noDeck');
      const match = matcher(deck);
      for (const [key, val] of Object.entries(links)) {
        const id = match(key);
        if (!id) { unmatched.push(key); continue; }
        const url = typeof val === 'string' ? val : val && typeof val === 'object' ? val.url : null;
        const credit = val && typeof val === 'object' && typeof val.credit === 'string' ? val.credit.trim().slice(0, 200) : '';
        if (!isHttps(url)) { invalid.push(key); continue; }
        plan.push({ deck: deck.id, id, url, credit });
      }
    }
    return { plan, unmatched, invalid };
  }
  function isHttps(u) {
    if (typeof u !== 'string' || u.length > 2000) return false;
    try { return new URL(u).protocol === 'https:'; } catch (_) { return false; }
  }

  /* ---------- Pictures: shrink, keep, show ---------- */
  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('badImage')); };
      img.src = url;
    });
  }
  const toBlob = (canvas, type, q) => new Promise(res => canvas.toBlob(res, type, q));
  /** At most SIDE px on the long side, WebP (JPEG where WebP cannot be written, e.g. older Safari) */
  async function shrink(blob) {
    if (blob.size > MAX_IMG) throw new Error('tooBig');
    const img = await loadImage(blob);
    const k = Math.min(1, SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    let out = await toBlob(c, 'image/webp', 0.82);
    if (!out || out.type !== 'image/webp') out = await toBlob(c, 'image/jpeg', 0.85);
    if (!out) throw new Error('badImage');
    return out;
  }

  let index = null;                 // { deck: { id: { credit, from } } }
  const urls = new Map();           // "deck/id" → object URL (made on first use)
  const key = (deck, id) => `img/${deck}/${id}`;
  async function load() { if (!index) index = await Tools.keep.json(INDEX, {}) || {}; return index; }
  const saveIndex = () => Tools.keep.putJson(INDEX, index);
  const has = (deck, id) => !!(index && index[deck] && index[deck][id]);
  const credit = (deck, id) => (has(deck, id) && index[deck][id].credit) || '';
  const counts = () => Object.fromEntries(Object.entries(index || {}).map(([d, m]) => [d, Object.keys(m).length]).filter(([, n]) => n));
  /** Object URL of a kept picture, or null */
  async function url(deck, id) {
    if (!has(deck, id)) return null;
    const k = deck + '/' + id;
    if (urls.has(k)) return urls.get(k);
    const f = await Tools.keep.get(key(deck, id));
    if (!f) return null;
    const u = URL.createObjectURL(f);
    urls.set(k, u);
    return u;
  }
  async function store(deck, id, blob, info) {
    const small = await shrink(blob);
    if (!(await Tools.keep.put(key(deck, id), small))) throw new Error('noStore');
    (index[deck] || (index[deck] = {}))[id] = info;
    const k = deck + '/' + id;
    if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
  }
  /** Removes the pictures of one deck (or all with no deck) */
  async function removeDeck(deck) {
    await load();
    for (const d of deck ? [deck] : Object.keys(index)) {
      for (const id of Object.keys(index[d] || {})) {
        await Tools.keep.remove(key(d, id));
        const k = d + '/' + id;
        if (urls.has(k)) { URL.revokeObjectURL(urls.get(k)); urls.delete(k); }
      }
      delete index[d];
    }
    await saveIndex();
  }

  /** Imports a ZIP file; progress(done, total). Result: { saved, failed, unmatched, decks } */
  async function importZip(file, decks, fallbackDeck, progress) {
    if (file.size > MAX_ZIP) throw new Error('zipTooBig');
    await load();
    const buf = await file.arrayBuffer();
    const { plan, unmatched } = zipPlan(zipEntries(buf), decks, fallbackDeck);
    let saved = 0, failed = 0;
    for (const [i, p] of plan.entries()) {
      progress && progress(i, plan.length);
      try {
        if (p.entry.encrypted) throw new Error('encrypted');
        const ext = p.entry.name.split('.').pop().toLowerCase();
        await store(p.deck, p.id, new Blob([await zipRead(buf, p.entry)], { type: MIME[ext] || '' }), { credit: '', from: 'zip' });
        saved++;
      } catch (e) { failed++; window.Tools && Tools.diag.log('zip picture failed', e && e.message); }
    }
    await saveIndex();
    progress && progress(plan.length, plan.length);
    return { saved, failed, unmatched: unmatched.length, decks: [...new Set(plan.map(p => p.deck))] };
  }
  /** Imports a JSON list of links (text, already read); downloads every picture without cookies */
  async function importLinks(data, decks, fallbackDeck, progress) {
    await load();
    const { plan, unmatched, invalid } = linkPlan(data, decks, fallbackDeck);
    let saved = 0, failed = 0;
    const hosts = new Set();
    for (const [i, p] of plan.entries()) {
      progress && progress(i, plan.length);
      try {
        const res = await fetch(p.url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!res.ok) throw new Error('http ' + res.status);
        await store(p.deck, p.id, await res.blob(), { credit: p.credit, from: 'url' });
        saved++;
      } catch (e) { failed++; try { hosts.add(new URL(p.url).host); } catch (_) {} window.Tools && Tools.diag.log('link picture failed', e && e.message); }
    }
    await saveIndex();
    progress && progress(plan.length, plan.length);
    return { saved, failed, unmatched: unmatched.length + invalid.length, decks: [...new Set(plan.map(p => p.deck))], failedHosts: [...hosts].slice(0, 3) };
  }
  /** Reads a JSON list from pasted text: JSON itself or an https link to a JSON file */
  async function readLinkList(text) {
    const s = String(text || '').trim();
    if (!s) throw new Error('empty');
    if (isHttps(s)) {
      const res = await fetch(s, { credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!res.ok) throw new Error('http');
      const t = await res.text();
      if (t.length > MAX_JSON) throw new Error('jsonTooBig');
      return JSON.parse(t);
    }
    if (s.length > MAX_JSON) throw new Error('jsonTooBig');
    try { return JSON.parse(s); } catch (_) { throw new Error('badJson'); }
  }

  window.QuartetImages = { stem, matcher, zipEntries, zipRead, zipPlan, linkPlan, isHttps, shrink,
    load, has, credit, counts, url, removeDeck, importZip, importLinks, readLinkList };
})();
