/* NFC-Tags: NDEF records without DOM – decoding what Web NFC (NDEFReader) reads and building what it writes.
   Used by index.html as window.NfcNdef (tests: tests/nfc-tags.spec.mjs with tests/nfc-fake.mjs).

   NfcNdef.decode(record)       NDEFRecord (or a plain object of the same shape) → plain JSON object { kind, … }:
                                text, url, contact, wifi, mime, binary, poster (with records), empty, other
   NfcNdef.build(draft)         form content → { records } for NDEFReader.write() or { error: code }
   NfcNdef.fromDecoded(rec)     decoded record → draft fields for the write form (null: cannot be written again)
   NfcNdef.estimate(records)    approximate size of the NDEF message on the tag in bytes (incl. TLV wrapper)
   NfcNdef.fits(bytes)          smallest common tag that holds it ('NTAG213' …) or null
   NfcNdef.wscParse(bytes)      Wi-Fi credential (application/vnd.wfa.wsc) → { ssid, auth, key } or null
   NfcNdef.wscBuild(wifi)       { ssid, auth: 'wpa2'|'open', key } → Uint8Array */
(function (root) {
  'use strict';

  const MAX_HEX = 512; // bytes kept as hex for unknown payloads (display and history)
  const TAGS = [['NTAG213', 144], ['NTAG215', 504], ['NTAG216', 888]];
  // URI identifier codes (NFC Forum URI RTD) – the tag stores the prefix as one byte
  const URI_PREFIX = ['', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:'];
  const WIFI_MIME = 'application/vnd.wfa.wsc';

  const bytesOf = d => {
    if (d == null) return new Uint8Array(0);
    if (d instanceof Uint8Array) return d;
    if (d instanceof ArrayBuffer) return new Uint8Array(d);
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer, d.byteOffset, d.byteLength);
    if (typeof d === 'string') return new TextEncoder().encode(d);
    if (Array.isArray(d)) return Uint8Array.from(d);
    return new Uint8Array(0);
  };
  const hex = b => Array.from(b.subarray(0, MAX_HEX), x => x.toString(16).padStart(2, '0')).join(' ');
  function utf8(b, label = 'utf-8') {
    try { return new TextDecoder(label, { fatal: true }).decode(b); } catch (_) { return null; }
  }
  // Text that is safe to show as text: valid UTF-8 without control characters (except tab/newline)
  function printable(b) {
    const s = utf8(b);
    return s != null && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s) ? s : null;
  }

  /* ---------- Wi-Fi Simple Configuration (WSC) TLVs: 2-byte type, 2-byte length ---------- */
  const T = { credential: 0x100e, netIndex: 0x1026, ssid: 0x1045, auth: 0x1003, enc: 0x100f, key: 0x1027, mac: 0x1020, version: 0x104a };
  function tlvs(b) {
    const out = [];
    for (let i = 0; i + 4 <= b.length;) {
      const type = (b[i] << 8) | b[i + 1], len = (b[i + 2] << 8) | b[i + 3];
      if (i + 4 + len > b.length) break;
      out.push({ type, value: b.subarray(i + 4, i + 4 + len) });
      i += 4 + len;
    }
    return out;
  }
  function wscParse(data) {
    const cred = tlvs(bytesOf(data)).find(x => x.type === T.credential);
    if (!cred) return null;
    const f = tlvs(cred.value), get = t => (f.find(x => x.type === t) || {}).value;
    const ssid = get(T.ssid), key = get(T.key), auth = get(T.auth);
    if (!ssid) return null;
    const a = auth && auth.length === 2 ? (auth[0] << 8) | auth[1] : 0;
    return {
      ssid: utf8(ssid) ?? hex(ssid),
      auth: a & 0x0022 ? 'wpa2' : a & 0x000c ? 'wpa' : a & 0x0001 ? 'open' : a ? 'other' : 'open',
      key: key && key.length ? (utf8(key) ?? hex(key)) : '',
    };
  }
  function tlv(type, value) {
    const v = bytesOf(value), out = new Uint8Array(4 + v.length);
    out.set([type >> 8, type & 255, v.length >> 8, v.length & 255]); out.set(v, 4);
    return out;
  }
  const concat = parts => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts) { out.set(p, i); i += p.length; } return out; };
  function wscBuild({ ssid, auth, key }) {
    const open = auth === 'open';
    const cred = concat([
      tlv(T.netIndex, [1]),
      tlv(T.ssid, ssid),
      tlv(T.auth, open ? [0x00, 0x01] : [0x00, 0x20]), // Open / WPA2-Personal
      tlv(T.enc, open ? [0x00, 0x01] : [0x00, 0x08]),  // None / AES
      tlv(T.key, open ? '' : key),
      tlv(T.mac, [0xff, 0xff, 0xff, 0xff, 0xff, 0xff]),
    ]);
    return concat([tlv(T.version, [0x10]), tlv(T.credential, cred)]);
  }

  /* ---------- vCard (only the fields the write form has; reading shows the whole text) ---------- */
  const vEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const vUnesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
  function vcardFields(text) {
    const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/), f = {};
    for (const l of lines) {
      const m = l.match(/^(?:item\d+\.)?([A-Za-z-]+)(?:;[^:]*)?:(.*)$/);
      if (!m) continue;
      const k = m[1].toUpperCase(), v = vUnesc(m[2].trim());
      if (k === 'FN' && !f.name) f.name = v;
      else if (k === 'N' && !f.n) f.n = v.split(';').slice(0, 2).reverse().filter(Boolean).join(' ');
      else if (k === 'TEL' && !f.tel) f.tel = v.replace(/^tel:/i, '');
      else if (k === 'EMAIL' && !f.email) f.email = v;
      else if (k === 'ORG' && !f.org) f.org = v.split(';')[0];
      else if (k === 'URL' && !f.url) f.url = v;
    }
    if (!f.name && f.n) f.name = f.n;
    delete f.n;
    return f;
  }
  function vcardBuild({ name, tel, email }) {
    const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    const parts = name.trim().split(/\s+/), last = parts.length > 1 ? parts.pop() : parts[0], first = parts.length && parts[0] !== last ? parts.join(' ') : '';
    lines.push('N:' + vEsc(last) + ';' + vEsc(first) + ';;;', 'FN:' + vEsc(name.trim()));
    if (tel.trim()) lines.push('TEL;TYPE=CELL:' + vEsc(tel.trim()));
    if (email.trim()) lines.push('EMAIL:' + vEsc(email.trim()));
    lines.push('END:VCARD');
    return lines.join('\r\n') + '\r\n';
  }

  /* ---------- Decoding ---------- */
  function urlKind(u) {
    const s = u.toLowerCase();
    if (s.startsWith('tel:')) return 'tel';
    if (s.startsWith('mailto:')) return 'mail';
    if (s.startsWith('sms:') || s.startsWith('smsto:')) return 'sms';
    if (s.startsWith('geo:')) return 'geo';
    if (/^https?:\/\//.test(s)) return 'web';
    return 'other';
  }
  function decode(rec) {
    const type = String(rec.recordType || '');
    const b = bytesOf(rec.data);
    const base = rec.id ? { id: String(rec.id) } : {};
    if (type === 'empty') return Object.assign({ kind: 'empty' }, base);
    if (type === 'text') {
      const text = utf8(b, rec.encoding || 'utf-8');
      if (text != null) return Object.assign({ kind: 'text', text, lang: String(rec.lang || '') }, base);
    }
    if (type === 'url' || type === 'absolute-url') {
      const url = utf8(b);
      if (url != null) return Object.assign({ kind: 'url', url, urlKind: urlKind(url) }, base);
    }
    if (type === 'smart-poster') {
      let inner = [];
      try { inner = typeof rec.toRecords === 'function' ? (rec.toRecords() || []) : (rec.records || []); } catch (_) {}
      return Object.assign({ kind: 'poster', records: Array.from(inner, decode) }, base);
    }
    if (type === 'mime') {
      const mediaType = String(rec.mediaType || '');
      const mt = mediaType.split(';')[0].trim().toLowerCase();
      if (mt === WIFI_MIME) {
        const w = wscParse(b);
        if (w) return Object.assign({ kind: 'wifi' }, w, base);
      }
      const text = printable(b);
      if (text != null && (mt === 'text/vcard' || mt === 'text/x-vcard'))
        return Object.assign({ kind: 'contact', text, fields: vcardFields(text) }, base);
      if (text != null && (mt.startsWith('text/') || /[/+]json$|[/+]xml$/.test(mt)))
        return Object.assign({ kind: 'mime', mediaType, text }, base);
      return Object.assign({ kind: 'binary', mediaType, size: b.length, hex: hex(b), truncated: b.length > MAX_HEX }, base);
    }
    // unknown, external (example.com:type), local (:type) or text/url that is not valid UTF-8
    const o = { kind: 'other', recordType: type || 'unknown', size: b.length };
    const text = printable(b);
    if (text != null && text.length) o.text = text;
    else { o.hex = hex(b); o.truncated = b.length > MAX_HEX; }
    return Object.assign(o, base);
  }

  /* ---------- Building ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const TEL_RE = /^\+?[0-9 ()/.-]{3,30}$/;
  function webUrl(s) {
    let v = String(s || '').trim();
    if (!v) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
    try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.href : null; } catch (_) { return null; }
  }
  const telUri = s => 'tel:' + String(s).replace(/[^0-9+]/g, '');
  function build(d) {
    const s = k => String(d[k] || '');
    switch (d.kind) {
      case 'text': {
        if (!s('text').trim()) return { error: 'emptyText' };
        return { records: [{ recordType: 'text', lang: s('lang') || 'de', encoding: 'utf-8', data: s('text') }] };
      }
      case 'url': {
        if (!s('url').trim()) return { error: 'emptyUrl' };
        const url = webUrl(s('url'));
        return url ? { records: [{ recordType: 'url', data: url }] } : { error: 'badUrl' };
      }
      case 'tel': {
        if (!TEL_RE.test(s('tel').trim()) || !/\d{3}/.test(s('tel').replace(/\D/g, ''))) return { error: 'badTel' };
        return { records: [{ recordType: 'url', data: telUri(s('tel')) }] };
      }
      case 'mail': {
        const to = s('email').trim();
        if (!EMAIL_RE.test(to)) return { error: 'badEmail' };
        const q = s('subject').trim() ? '?subject=' + encodeURIComponent(s('subject').trim()) : '';
        return { records: [{ recordType: 'url', data: 'mailto:' + to + q }] };
      }
      case 'contact': {
        if (!s('name').trim()) return { error: 'emptyName' };
        if (s('ctel').trim() && !TEL_RE.test(s('ctel').trim())) return { error: 'badTel' };
        if (s('cemail').trim() && !EMAIL_RE.test(s('cemail').trim())) return { error: 'badEmail' };
        const card = vcardBuild({ name: s('name'), tel: s('ctel'), email: s('cemail') });
        return { records: [{ recordType: 'mime', mediaType: 'text/vcard', data: new TextEncoder().encode(card) }] };
      }
      case 'wifi': {
        const ssid = s('ssid');
        if (!ssid.trim()) return { error: 'emptySsid' };
        if (new TextEncoder().encode(ssid).length > 32) return { error: 'longSsid' };
        const open = d.wauth === 'open', key = s('wkey');
        if (!open && (key.length < 8 || key.length > 63)) return { error: 'badKey' };
        return { records: [{ recordType: 'mime', mediaType: WIFI_MIME, data: wscBuild({ ssid, auth: open ? 'open' : 'wpa2', key }) }] };
      }
      default: return { error: 'kind' };
    }
  }
  // Decoded record → fields of the write form (copying a tag); null when the form cannot write it
  function fromDecoded(r) {
    if (!r) return null;
    if (r.kind === 'text') return { kind: 'text', text: r.text };
    if (r.kind === 'url') {
      if (r.urlKind === 'web') return { kind: 'url', url: r.url };
      if (r.urlKind === 'tel') return { kind: 'tel', tel: decodeURIComponent(r.url.slice(4)) };
      if (r.urlKind === 'mail') {
        const [to, q = ''] = r.url.slice(7).split('?');
        const subj = new URLSearchParams(q).get('subject') || '';
        return { kind: 'mail', email: decodeURIComponent(to), subject: subj };
      }
      return null;
    }
    if (r.kind === 'contact') return { kind: 'contact', name: r.fields.name || '', ctel: r.fields.tel || '', cemail: r.fields.email || '' };
    if (r.kind === 'wifi') return { kind: 'wifi', ssid: r.ssid, wauth: r.auth === 'open' ? 'open' : 'wpa2', wkey: r.key };
    if (r.kind === 'poster') { for (const x of r.records) { const f = fromDecoded(x); if (f) return f; } }
    return null;
  }

  /* ---------- Size on the tag (NDEF short records, no id) ---------- */
  function recordSize(r) {
    let type, payload;
    const b = bytesOf(r.data);
    if (r.recordType === 'empty') return 3;
    if (r.recordType === 'text') { type = 1; payload = 1 + String(r.lang || 'de').length + b.length; }
    else if (r.recordType === 'url') {
      const s = typeof r.data === 'string' ? r.data : utf8(b) || '';
      const p = URI_PREFIX.reduce((best, x) => x.length > best.length && s.startsWith(x) ? x : best, '');
      type = 1; payload = 1 + new TextEncoder().encode(s.slice(p.length)).length;
    } else if (r.recordType === 'mime') { type = String(r.mediaType || '').length; payload = b.length; }
    else { type = String(r.recordType || '').length; payload = b.length; }
    return 2 + (payload > 255 ? 4 : 1) + type + payload;
  }
  function estimate(records) {
    const n = records.reduce((s, r) => s + recordSize(r), 0);
    return n + (n > 254 ? 4 : 2) + 1; // TLV type + length (1 or 3 bytes) + terminator TLV
  }
  function fits(bytes) { const t = TAGS.find(([, cap]) => bytes <= cap); return t ? { tag: t[0], capacity: t[1] } : null; }

  root.NfcNdef = { decode, build, fromDecoded, estimate, fits, wscParse, wscBuild, vcardFields, TAGS, WIFI_MIME };
})(typeof window !== 'undefined' ? window : globalThis);
