/* Argon2 for kdbx.js, off the main thread (a strong KDF can take seconds and much memory).
   Message in:  { id, type: 'd'|'id', password, salt, iterations, memoryKiB, parallelism }
   Message out: { id, hash: Uint8Array(32) } or { id, error: code }
   The worker only computes the hash – it never sees the database or anything decrypted.
   hash-wasm (see scripts/vendor.json) compiles its WebAssembly from inlined code. */
'use strict';
importScripts('../assets/vendor/hash-wasm/argon2.umd.min.js');
self.onmessage = async e => {
  const { id, type, password, salt, iterations, memoryKiB, parallelism } = e.data || {};
  try {
    const fn = type === 'id' ? self.hashwasm.argon2id : self.hashwasm.argon2d;
    const hash = await fn({ password, salt, iterations, memorySize: memoryKiB, parallelism, hashLength: 32, outputType: 'binary' });
    self.postMessage({ id, hash }, [hash.buffer]);
  } catch (err) {
    self.postMessage({ id, error: /memory|allocation|RangeError/i.test(String(err && (err.message || err))) ? 'memory' : 'argon2' });
  }
};
