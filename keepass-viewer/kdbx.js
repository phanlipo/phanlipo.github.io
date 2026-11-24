/* KDBX reader (KeePass 2.x databases, format 3.1 and 4.x) – read only, no DOM besides DOMParser.
   See README.md in this folder for the format and the design decisions.

   Crypto: everything that WebCrypto offers is done by WebCrypto (SHA-256/512, HMAC-SHA-256, AES-256-CBC,
   also the AES-KDF via a CBC trick). Argon2 comes from the caller (argon2-worker.js with hash-wasm).
   Only the stream ciphers ChaCha20 (RFC 8439) and Salsa20 are written here – they have no WebCrypto
   equivalent; tests check them against the RFC/eSTREAM vectors and real KeePassXC files.

   KDBX.open(bytes, { password, keyFile, argon2 }) → { name, version, cipher, kdf, root, recycleBinId }
     bytes    Uint8Array of the .kdbx file
     password string or null
     keyFile  Uint8Array or null (XML v1/v2, 32 bytes raw, 64 hex chars, otherwise SHA-256 of the file)
     argon2   async ({ type: 'd'|'id', password, salt, iterations, memoryKiB, parallelism, version }) → Uint8Array(32)
   Errors are thrown as Error with .code (translated by the page):
     not-kdbx, kdbx1, version, cipher, kdf, compression, corrupt, wrong-key, xml */
(function (root) {
  'use strict';

  const fail = code => { const e = new Error(code); e.code = code; throw e; };
  const subtle = () => (root.crypto && root.crypto.subtle) || fail('crypto');
  const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  const concat = (...parts) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  };
  const sha256 = async b => new Uint8Array(await subtle().digest('SHA-256', b));
  const sha512 = async b => new Uint8Array(await subtle().digest('SHA-512', b));
  const u64le = n => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n), true); return b; };
  const u32le = n => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  const equal = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; };

  const CIPHERS = {
    '31c1f2e6bf714350be5805216afc5aff': 'aes',
    'd6038a2b8b6f4cb5a524339a31dbb59a': 'chacha20',
    'ad68f29f576f4bb9a36ad47af965346c': 'twofish',
  };
  const KDFS = {
    'c9d9f39a628a4460bf740d08c18a4fea': 'aes',
    '7c02bb8279a74ac0927d114a00648238': 'aes', // AES-KDF in its KDBX 3.1 form (KeePass 2.35+)
    'ef636ddf8c29444b91f7a9a403e30a0c': 'argon2d',
    '9e298b1956db4773b23dfc3ec6f0a1e6': 'argon2id',
  };

  /* ---------- Reader over a byte array ---------- */
  class Reader {
    constructor(bytes) { this.b = bytes; this.v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.p = 0; }
    need(n) { if (this.p + n > this.b.length) fail('corrupt'); }
    u8() { this.need(1); return this.b[this.p++]; }
    u16() { this.need(2); const x = this.v.getUint16(this.p, true); this.p += 2; return x; }
    u32() { this.need(4); const x = this.v.getUint32(this.p, true); this.p += 4; return x; }
    i32() { this.need(4); const x = this.v.getInt32(this.p, true); this.p += 4; return x; }
    bytes(n) { if (n < 0) fail('corrupt'); this.need(n); const x = this.b.subarray(this.p, this.p + n); this.p += n; return x; }
  }
  const num = (b) => { // little-endian unsigned integer field (4 or 8 bytes) → Number
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    if (b.length === 4) return v.getUint32(0, true);
    if (b.length === 8) { const n = v.getBigUint64(0, true); return n > BigInt(Number.MAX_SAFE_INTEGER) ? fail('kdf') : Number(n); }
    return fail('corrupt');
  };

  /* KDBX 4 VariantDictionary (KDF parameters) → { key: Uint8Array | number | boolean | string } */
  function variantDict(bytes) {
    const r = new Reader(bytes);
    if ((r.u16() >> 8) !== 1) fail('kdf');
    const out = {};
    for (;;) {
      const type = r.u8();
      if (type === 0) return out;
      const key = new TextDecoder().decode(r.bytes(r.i32()));
      const val = r.bytes(r.i32());
      if (type === 0x04 || type === 0x05) out[key] = num(val);
      else if (type === 0x08) out[key] = val[0] !== 0;
      else if (type === 0x0C) out[key] = new DataView(val.buffer, val.byteOffset, 4).getInt32(0, true);
      else if (type === 0x0D) out[key] = Number(new DataView(val.buffer, val.byteOffset, 8).getBigInt64(0, true));
      else if (type === 0x18) out[key] = new TextDecoder().decode(val);
      else out[key] = val.slice();
    }
  }

  /* ---------- Header ---------- */
  function readHeader(bytes) {
    const r = new Reader(bytes);
    if (bytes.length < 12) fail('not-kdbx');
    const sig1 = r.u32(), sig2 = r.u32();
    if (sig1 !== 0x9AA2D903) fail('not-kdbx');
    if (sig2 === 0xB54BFB65) fail('kdbx1'); // KeePass 1.x (.kdb)
    if (sig2 !== 0xB54BFB67) fail('not-kdbx');
    const minor = r.u16(), major = r.u16();
    if (major !== 3 && major !== 4) fail('version');
    const h = { major, minor };
    for (;;) {
      const id = r.u8();
      const data = r.bytes(major >= 4 ? r.i32() : r.u16());
      if (id === 0) break;
      if (id === 2) h.cipher = CIPHERS[hex(data)] || 'unknown';
      else if (id === 3) h.compression = num(data);
      else if (id === 4) h.masterSeed = data;
      else if (id === 5) h.transformSeed = data;
      else if (id === 6) h.transformRounds = num(data);
      else if (id === 7) h.iv = data;
      else if (id === 8) h.streamKey = data;
      else if (id === 9) h.streamStart = data;
      else if (id === 10) h.streamId = num(data);
      else if (id === 11) h.kdfParams = variantDict(data);
    }
    h.end = r.p;
    if (h.cipher !== 'aes' && h.cipher !== 'chacha20') fail('cipher');
    if (h.compression !== 0 && h.compression !== 1) fail('compression');
    if (!h.masterSeed || h.masterSeed.length !== 32 || !h.iv) fail('corrupt');
    if (major >= 4) {
      const p = h.kdfParams || fail('kdf');
      const kdf = p.$UUID ? KDFS[hex(p.$UUID)] : null;
      if (!kdf) fail('kdf');
      h.kdf = kdf;
    } else {
      if (!h.transformSeed || h.transformRounds == null || !h.streamStart) fail('corrupt');
      h.kdf = 'aes';
      h.kdfParams = { S: h.transformSeed, R: h.transformRounds };
    }
    return h;
  }

  /* ---------- Key ---------- */
  async function keyFileHash(kf) {
    const text = (() => { try { return new TextDecoder('utf-8', { fatal: true }).decode(kf); } catch (_) { return null; } })();
    if (text && /<KeyFile/i.test(text) && typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(text.replace(/^﻿/, ''), 'application/xml');
      const version = (doc.querySelector('KeyFile > Meta > Version')?.textContent || '').trim();
      const dataEl = doc.querySelector('KeyFile > Key > Data');
      if (dataEl && !doc.querySelector('parsererror')) {
        const raw = dataEl.textContent.replace(/\s+/g, '');
        if (version.startsWith('2')) {
          if (!/^[0-9a-f]+$/i.test(raw) || raw.length % 2) fail('keyfile');
          const key = new Uint8Array(raw.match(/../g).map(x => parseInt(x, 16)));
          const expect = (dataEl.getAttribute('Hash') || '').toLowerCase();
          if (expect && hex((await sha256(key)).subarray(0, 4)) !== expect) fail('keyfile');
          return key;
        }
        try { return Uint8Array.from(atob(raw), c => c.charCodeAt(0)); } catch (_) { fail('keyfile'); }
      }
    }
    if (kf.length === 32) return kf.slice();
    if (kf.length === 64 && text && /^[0-9a-f]{64}$/i.test(text)) return new Uint8Array(text.match(/../g).map(x => parseInt(x, 16)));
    return sha256(kf);
  }
  async function compositeKey(password, keyFile) {
    const parts = [];
    if (password != null && password !== '') parts.push(await sha256(new TextEncoder().encode(password)));
    if (keyFile) parts.push(await keyFileHash(keyFile));
    if (!parts.length) fail('wrong-key');
    return sha256(concat(...parts));
  }

  /* AES-KDF: each 16-byte half of the key is encrypted `rounds` times with AES-256-ECB.
     WebCrypto has no ECB, but CBC with IV = x and zero plaintext gives c1 = E(x), c2 = E(c1), …:
     encrypting n zero blocks yields n chained rounds in one call. Chunks keep memory small. */
  async function aesKdf(key, seed, rounds) {
    const k = await subtle().importKey('raw', seed, 'AES-CBC', false, ['encrypt']);
    const CHUNK = 1 << 16; // blocks per call (1 MiB)
    const zeros = new Uint8Array(CHUNK * 16);
    const out = new Uint8Array(32);
    for (const half of [0, 16]) {
      let x = key.slice(half, half + 16), left = rounds;
      while (left > 0) {
        const n = Math.min(left, CHUNK);
        const c = new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: x }, k, zeros.subarray(0, n * 16)));
        x = c.slice((n - 1) * 16, n * 16);
        left -= n;
      }
      out.set(x, half);
    }
    return sha256(out);
  }

  async function transformKey(h, composite, argon2) {
    const p = h.kdfParams;
    if (h.kdf === 'aes') {
      if (!(p.S instanceof Uint8Array) || p.S.length !== 32 || typeof p.R !== 'number') fail('kdf');
      return aesKdf(composite, p.S, p.R);
    }
    if (!argon2) fail('kdf');
    const memoryKiB = Math.floor(p.M / 1024);
    if (!(p.S instanceof Uint8Array) || !(p.I >= 1) || !(memoryKiB >= 8) || !(p.P >= 1)) fail('kdf');
    if (p.K || p.A || (p.V && p.V !== 0x13)) fail('kdf'); // secret key / associated data / Argon2 1.0: not written by KeePass, not supported
    const out = await argon2({ type: h.kdf === 'argon2id' ? 'id' : 'd', password: composite, salt: p.S,
      iterations: p.I, memoryKiB, parallelism: p.P, version: p.V || 0x13 });
    if (!(out instanceof Uint8Array) || out.length !== 32) fail('kdf');
    return out;
  }

  /* ---------- Stream ciphers ---------- */
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  // ChaCha20 (RFC 8439): 32-byte key, 12-byte nonce, block counter starting at `counter`
  function chacha20(key, nonce, counter = 0) {
    const kv = new DataView(key.buffer, key.byteOffset, 32), nv = new DataView(nonce.buffer, nonce.byteOffset, 12);
    const s = new Uint32Array(16);
    s[0] = 0x61707865; s[1] = 0x3320646e; s[2] = 0x79622d32; s[3] = 0x6b206574;
    for (let i = 0; i < 8; i++) s[4 + i] = kv.getUint32(i * 4, true);
    s[12] = counter;
    for (let i = 0; i < 3; i++) s[13 + i] = nv.getUint32(i * 4, true);
    const x = new Uint32Array(16), block = new Uint8Array(64), bv = new DataView(block.buffer);
    const qr = (a, b, c, d) => {
      x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 16); x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 12);
      x[a] += x[b]; x[d] = rotl(x[d] ^ x[a], 8); x[c] += x[d]; x[b] = rotl(x[b] ^ x[c], 7);
    };
    return () => {
      x.set(s);
      for (let i = 0; i < 10; i++) {
        qr(0, 4, 8, 12); qr(1, 5, 9, 13); qr(2, 6, 10, 14); qr(3, 7, 11, 15);
        qr(0, 5, 10, 15); qr(1, 6, 11, 12); qr(2, 7, 8, 13); qr(3, 4, 9, 14);
      }
      for (let i = 0; i < 16; i++) bv.setUint32(i * 4, (x[i] + s[i]) >>> 0, true);
      s[12]++; if (s[12] === 0) s[13]++;
      return block;
    };
  }
  // Salsa20/20: 32-byte key, 8-byte nonce
  function salsa20(key, nonce) {
    const kv = new DataView(key.buffer, key.byteOffset, 32), nv = new DataView(nonce.buffer, nonce.byteOffset, 8);
    const s = new Uint32Array(16);
    s[0] = 0x61707865; s[5] = 0x3320646e; s[10] = 0x79622d32; s[15] = 0x6b206574;
    for (let i = 0; i < 4; i++) { s[1 + i] = kv.getUint32(i * 4, true); s[11 + i] = kv.getUint32(16 + i * 4, true); }
    s[6] = nv.getUint32(0, true); s[7] = nv.getUint32(4, true);
    const x = new Uint32Array(16), block = new Uint8Array(64), bv = new DataView(block.buffer);
    const qr = (a, b, c, d) => {
      x[b] ^= rotl(x[a] + x[d], 7); x[c] ^= rotl(x[b] + x[a], 9);
      x[d] ^= rotl(x[c] + x[b], 13); x[a] ^= rotl(x[d] + x[c], 18);
    };
    return () => {
      x.set(s);
      for (let i = 0; i < 10; i++) {
        qr(0, 4, 8, 12); qr(5, 9, 13, 1); qr(10, 14, 2, 6); qr(15, 3, 7, 11);
        qr(0, 1, 2, 3); qr(5, 6, 7, 4); qr(10, 11, 8, 9); qr(15, 12, 13, 14);
      }
      for (let i = 0; i < 16; i++) bv.setUint32(i * 4, (x[i] + s[i]) >>> 0, true);
      s[8]++; if (s[8] === 0) s[9]++;
      return block;
    };
  }
  // XOR stream over successive calls (KeePass inner stream: one keystream for all protected values in order)
  function xorStream(next) {
    let block = null, pos = 64;
    return data => {
      const out = new Uint8Array(data.length);
      for (let i = 0; i < data.length; i++) {
        if (pos === 64) { block = next(); pos = 0; }
        out[i] = data[i] ^ block[pos++];
      }
      return out;
    };
  }
  async function innerStream(id, key) {
    if (id === 2) return xorStream(salsa20(await sha256(key), new Uint8Array([0xE8, 0x30, 0x09, 0x4B, 0x97, 0x20, 0x5D, 0x2A])));
    if (id === 3) { const h = await sha512(key); return xorStream(chacha20(h.subarray(0, 32), h.subarray(32, 44))); }
    if (id === 0) return d => d;
    return fail('cipher'); // 1 = ArcFour (KeePass < 2.0 betas)
  }

  /* ---------- Payload ---------- */
  async function decryptPayload(h, key, data) {
    if (h.cipher === 'chacha20') {
      if (h.iv.length !== 12) fail('corrupt');
      return xorStream(chacha20(key, h.iv))(data);
    }
    if (h.iv.length !== 16 || data.length % 16) fail('corrupt');
    const k = await subtle().importKey('raw', key, 'AES-CBC', false, ['decrypt']);
    // Wrong key → padding error in almost all cases (KDBX 3 checks the start bytes afterwards anyway)
    try { return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: h.iv }, k, data)); } catch (_) { return fail('wrong-key'); }
  }
  async function gunzip(data) {
    if (typeof DecompressionStream === 'undefined') fail('compression');
    try {
      const s = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
      return new Uint8Array(await new Response(s).arrayBuffer());
    } catch (_) { return fail('corrupt'); }
  }

  async function payload3(h, bytes, transformed) {
    const key = await sha256(concat(h.masterSeed, transformed));
    const plain = await decryptPayload(h, key, bytes.subarray(h.end));
    if (plain.length < 32 || !equal(plain.subarray(0, 32), h.streamStart)) fail('wrong-key');
    // Hashed blocks: index, SHA-256, size, data – size 0 ends
    const r = new Reader(plain.subarray(32)); const parts = [];
    for (;;) {
      r.u32(); const hash = r.bytes(32); const size = r.i32();
      if (size === 0) break;
      const data = r.bytes(size);
      if (!equal(await sha256(data), hash)) fail('corrupt');
      parts.push(data);
    }
    let xml = concat(...parts);
    if (h.compression === 1) xml = await gunzip(xml);
    return { xml, stream: await innerStream(h.streamId, h.streamKey || fail('corrupt')) };
  }

  async function hmacKey(base, index) {
    return subtle().importKey('raw', await sha512(concat(u64le(index), base)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  const hmac = async (k, data) => new Uint8Array(await subtle().sign('HMAC', k, data));

  async function payload4(h, bytes, transformed) {
    const header = bytes.subarray(0, h.end);
    const r = new Reader(bytes.subarray(h.end));
    const storedHash = r.bytes(32), storedHmac = r.bytes(32);
    if (!equal(await sha256(header), storedHash)) fail('corrupt');
    const key = await sha256(concat(h.masterSeed, transformed));
    const base = await sha512(concat(h.masterSeed, transformed, new Uint8Array([1])));
    // Header HMAC with the block index 2^64-1: a mismatch here means wrong password/key file
    if (!equal(await hmac(await hmacKey(base, 0xFFFFFFFFFFFFFFFFn), header), storedHmac)) fail('wrong-key');
    const parts = [];
    for (let i = 0; ; i++) {
      const mac = r.bytes(32); const size = r.i32(); const data = r.bytes(size);
      if (!equal(await hmac(await hmacKey(base, i), concat(u64le(i), u32le(size), data)), mac)) fail('corrupt');
      if (size === 0) break;
      parts.push(data);
    }
    let plain = await decryptPayload(h, key, concat(...parts));
    if (h.compression === 1) plain = await gunzip(plain);
    // Inner header: stream id, stream key, binaries (attachments are not shown and skipped)
    const ir = new Reader(plain); let streamId = null, streamKey = null;
    for (;;) {
      const id = ir.u8(); const data = ir.bytes(ir.i32());
      if (id === 0) break;
      if (id === 1) streamId = num(data);
      else if (id === 2) streamKey = data;
    }
    if (streamId == null || !streamKey) fail('corrupt');
    return { xml: plain.subarray(ir.p), stream: await innerStream(streamId, streamKey) };
  }

  /* ---------- XML → groups and entries ---------- */
  const STD = ['Title', 'UserName', 'Password', 'URL', 'Notes'];
  function parseXml(xmlBytes, stream) {
    if (typeof DOMParser === 'undefined') fail('xml');
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(xmlBytes), 'application/xml');
    if (doc.querySelector('parsererror') || doc.documentElement.nodeName !== 'KeePassFile') fail('xml');
    // Protected values share one keystream in document order (also those in History and Meta)
    const walker = doc.createTreeWalker(doc.documentElement, 1 /* NodeFilter.SHOW_ELEMENT */);
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      if ((el.getAttribute('Protected') || '').toLowerCase() !== 'true') continue;
      let raw;
      try { raw = Uint8Array.from(atob(el.textContent.replace(/\s+/g, '')), c => c.charCodeAt(0)); } catch (_) { fail('xml'); }
      el.textContent = new TextDecoder().decode(stream(raw));
      el.setAttribute('data-protected', 'true');
    }
    const child = (el, name) => { for (const c of el.children) if (c.nodeName === name) return c; return null; };
    const text = (el, name) => child(el, name)?.textContent || '';
    const meta = doc.querySelector('KeePassFile > Meta');
    const recycleEnabled = meta ? text(meta, 'RecycleBinEnabled').toLowerCase() !== 'false' : false;
    const recycleBinId = recycleEnabled ? text(meta, 'RecycleBinUUID') : '';
    const readEntry = (el, path) => {
      const fields = []; const std = {};
      for (const s of el.children) {
        if (s.nodeName !== 'String') continue;
        const key = text(s, 'Key'), v = child(s, 'Value');
        const value = v ? v.textContent : '';
        const prot = !!v && v.getAttribute('data-protected') === 'true';
        if (STD.includes(key)) std[key] = { value, protected: prot };
        else fields.push({ key, value, protected: prot });
      }
      const times = child(el, 'Times');
      const expires = times && text(times, 'Expires').toLowerCase() === 'true' ? text(times, 'ExpiryTime') : '';
      return {
        id: text(el, 'UUID'), icon: Number(text(el, 'IconID')) || 0, path,
        title: std.Title?.value || '', username: std.UserName?.value || '',
        password: std.Password?.value || '', url: std.URL?.value || '', notes: std.Notes?.value || '',
        fields: fields.sort((a, b) => a.key.localeCompare(b.key)),
        tags: text(el, 'Tags').split(/[;,]/).map(s => s.trim()).filter(Boolean),
        expires, modified: times ? text(times, 'LastModificationTime') : '',
      };
    };
    const readGroup = (el, path) => {
      const name = text(el, 'Name');
      const g = { id: text(el, 'UUID'), name, icon: Number(text(el, 'IconID')) || 0, groups: [], entries: [] };
      const p = path ? [...path, name] : [];
      for (const c of el.children) {
        if (c.nodeName === 'Entry') g.entries.push(readEntry(c, p));
        else if (c.nodeName === 'Group') g.groups.push(readGroup(c, p));
      }
      return g;
    };
    const rootGroup = doc.querySelector('KeePassFile > Root > Group');
    if (!rootGroup) fail('xml');
    return { name: meta ? text(meta, 'DatabaseName') : '', root: readGroup(rootGroup, null), recycleBinId };
  }

  async function open(bytes, { password = null, keyFile = null, argon2 = null } = {}) {
    const h = readHeader(bytes);
    const composite = await compositeKey(password, keyFile);
    const transformed = await transformKey(h, composite, argon2);
    const { xml, stream } = h.major >= 4 ? await payload4(h, bytes, transformed) : await payload3(h, bytes, transformed);
    const db = parseXml(xml, stream);
    return { ...db, version: `${h.major}.${h.minor}`, cipher: h.cipher, kdf: h.kdf };
  }
  // Header facts without a key (for the diagnostics and the "needs a key file?" hint – nothing secret)
  function info(bytes) {
    const h = readHeader(bytes);
    return { version: `${h.major}.${h.minor}`, cipher: h.cipher, kdf: h.kdf,
      memoryKiB: h.kdfParams.M ? Math.floor(h.kdfParams.M / 1024) : null };
  }

  root.KDBX = { open, info, _test: { chacha20, salsa20, xorStream, aesKdf, keyFileHash } };
})(typeof self !== 'undefined' ? self : this);
