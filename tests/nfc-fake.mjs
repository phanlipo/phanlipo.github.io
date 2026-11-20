// Stand-in for Web NFC (NDEFReader), which desktop browsers do not have. Installed before the page loads;
// the test then "holds tags" to the phone:
//   window.__nfc.read(serial, records)   fires "reading" on every running scan; records like
//       { recordType, data: string | number[], mediaType, lang, encoding, id, records (smart poster) }
//   window.__nfc.tap()                  a tag arrives for a pending write/makeReadOnly → it succeeds
//   window.__nfc.fail(name)              the pending write/makeReadOnly rejects with this DOMException name
//   window.__nfc.scanError = 'NotAllowedError'   the next scan() rejects
//   window.__nfc.written                 messages written so far: [{ records: [{ recordType, mediaType, lang, data }] }]
//       data as a string (strings) or number[] (bytes); { locked: true } for makeReadOnly
//   window.__nfc.scans / .pending        running scans / pending operations (counts)
export async function fakeNfc(page) {
  await page.addInitScript(() => {
    const scans = new Set(), pending = [];
    const view = d => {
      const b = typeof d === 'string' ? new TextEncoder().encode(d) : Uint8Array.from(d || []);
      return new DataView(b.buffer);
    };
    const record = r => ({
      recordType: r.recordType, mediaType: r.mediaType || undefined, id: r.id || undefined,
      encoding: r.recordType === 'text' ? (r.encoding || 'utf-8') : undefined, lang: r.recordType === 'text' ? (r.lang || 'de') : undefined,
      data: r.recordType === 'empty' ? undefined : view(r.data),
      toRecords: () => (r.records || []).map(record),
    });
    const plain = d => typeof d === 'string' ? d : d instanceof ArrayBuffer ? Array.from(new Uint8Array(d))
      : ArrayBuffer.isView(d) ? Array.from(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)) : d;
    const waitFor = (signal, what) => new Promise((resolve, reject) => {
      if (signal && signal.aborted) return reject(new DOMException('aborted', 'AbortError'));
      const p = { what, resolve, reject };
      pending.push(p);
      if (signal) signal.addEventListener('abort', () => {
        const i = pending.indexOf(p); if (i >= 0) pending.splice(i, 1);
        reject(new DOMException('aborted', 'AbortError'));
      });
    });
    class NDEFReader extends EventTarget {
      scan({ signal } = {}) {
        if (window.__nfc.scanError) { const n = window.__nfc.scanError; window.__nfc.scanError = null; return Promise.reject(new DOMException('no', n)); }
        if (signal && signal.aborted) return Promise.reject(new DOMException('aborted', 'AbortError'));
        scans.add(this);
        if (signal) signal.addEventListener('abort', () => scans.delete(this));
        return Promise.resolve();
      }
      write(message, { signal } = {}) {
        return waitFor(signal, { records: message.records.map(r => ({ recordType: r.recordType, mediaType: r.mediaType, lang: r.lang, data: plain(r.data) })) });
      }
      makeReadOnly({ signal } = {}) { return waitFor(signal, { locked: true }); }
    }
    window.NDEFReader = NDEFReader;
    window.__nfc = {
      written: [], scanError: null,
      get scans() { return scans.size; }, get pending() { return pending.length; },
      read(serialNumber, records) {
        for (const r of scans) {
          const e = new Event('reading');
          e.serialNumber = serialNumber; e.message = { records: records.map(record) };
          r.dispatchEvent(e);
        }
      },
      readError() { for (const r of scans) r.dispatchEvent(new Event('readingerror')); },
      tap() { const p = pending.shift(); if (!p) return false; window.__nfc.written.push(p.what); p.resolve(); return true; },
      fail(name) { const p = pending.shift(); if (!p) return false; p.reject(new DOMException('failed', name)); return true; },
    };
  });
}

// Wi-Fi Simple Configuration credential, built here independently of the app (WSC spec: 2-byte type, 2-byte length)
export function wscCredential({ ssid, key, auth = 0x0020 }) {
  const tlv = (type, bytes) => [type >> 8, type & 255, bytes.length >> 8, bytes.length & 255, ...bytes];
  const enc = s => [...new TextEncoder().encode(s)];
  const cred = [...tlv(0x1026, [1]), ...tlv(0x1045, enc(ssid)), ...tlv(0x1003, [auth >> 8, auth & 255]),
    ...tlv(0x100f, auth === 1 ? [0, 1] : [0, 8]), ...tlv(0x1027, enc(key)), ...tlv(0x1020, [255, 255, 255, 255, 255, 255])];
  return [...tlv(0x104a, [0x10]), ...tlv(0x100e, cred)];
}
