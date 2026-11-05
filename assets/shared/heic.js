/* HEIC/HEIF photos (iPhone, many Android phones) for apps that read images.
   Safari opens HEIC itself; Chrome, Edge and Firefox do not. Then the libheif decoder runs in a worker
   (heic-worker.js in the app folder, loaded on the first HEIC image, about 1.5 MB, cached for offline).
   Include with <script src="../assets/shared/heic.js"></script> and copy heic-worker.js into the app.

   Heic.isHeic(bytes)       true for the first bytes (≥ 32) of a HEIC/HEIF file (not AVIF)
   Heic.isHeicFile(blob)    the same for a file or blob (reads only its start)
   Heic.decode(blob)        ImageBitmap of the primary image, orientation applied; throws if it fails
   Heic.load(blob)          ImageBitmap for a HEIC file, otherwise null – for "if HEIC, else as before"
   Heic.info()              { native: true | false | null (not tried yet), worker: started } – for Tools.diag.info */
(() => {
  const log = (...a) => window.Tools && Tools.diag && Tools.diag.log(...a);

  // ISO base media file with an ftyp box: brands name the content. HEIF stills and sequences;
  // AVIF uses the same container (and often lists mif1) but is opened by the browser itself.
  function isHeic(bytes) {
    if (!bytes || bytes.length < 12) return false;
    const s = String.fromCharCode(...bytes.slice(0, 64));
    if (s.slice(4, 8) !== 'ftyp') return false;
    const size = (bytes[0] << 24 | bytes[1] << 16 | bytes[2] << 8 | bytes[3]) >>> 0;
    const box = s.slice(8, Math.min(size, 64));
    const brands = [];
    for (let i = 0; i + 4 <= box.length; i += 4) if (i !== 4) brands.push(box.slice(i, i + 4));   // skip minor version
    if (brands.some(b => b === 'avif' || b === 'avis')) return false;
    return brands.some(b => /^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(b));
  }
  async function isHeicFile(blob) {
    try { return isHeic(new Uint8Array(await blob.slice(0, 64).arrayBuffer())); } catch (_) { return false; }
  }

  let worker = null, seq = 0, native = null;
  const waiting = new Map();
  function viaWorker(buf) {
    if (!worker) {
      log('heic worker start');
      worker = new Worker('heic-worker.js');
      worker.onmessage = ({ data }) => {
        const w = waiting.get(data.id);
        if (w) { waiting.delete(data.id); data.error ? w.rej(new Error(data.error)) : w.res(data); }
      };
      worker.onerror = e => {
        log('heic worker error', e.message || 'load failed');
        for (const w of waiting.values()) w.rej(new Error(e.message || 'HEIC decoder failed to load'));
        waiting.clear(); worker = null;
      };
    }
    const id = ++seq;
    return new Promise((res, rej) => { waiting.set(id, { res, rej }); worker.postMessage({ id, buf }, [buf]); });
  }

  async function decode(blob) {
    // Safari decodes HEIC itself – tried once, then remembered
    if (native !== false) {
      try { const b = await createImageBitmap(blob); native = true; return b; }
      catch (_) { native = false; }
    }
    const t0 = performance.now();
    const r = await viaWorker(await blob.arrayBuffer());
    const b = await createImageBitmap(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height));
    log('heic decoded', { w: r.width, h: r.height, ms: Math.round(performance.now() - t0) });
    return b;
  }
  async function load(blob) {
    return (await isHeicFile(blob)) ? decode(blob) : null;
  }

  const info = () => ({ native, worker: !!worker });

  window.Heic = { isHeic, isHeicFile, decode, load, info };
})();
