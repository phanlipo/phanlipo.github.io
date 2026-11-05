// HEIC/HEIF decoder (libheif + libde265 as WebAssembly) – runs inside a worker of the app.
// Each app has a one-line heic-worker.js in its own folder: importScripts('../assets/shared/heic-decode.js').
// So the worker is served by the app's service worker: the library is cached on first use, then offline.
// Paths below are relative to that worker in the app folder. The page side is assets/shared/heic.js.
// In:  { id, buf: ArrayBuffer }   Out: { id, width, height, data: ArrayBuffer (RGBA) } or { id, error }
importScripts('../assets/vendor/libheif/libheif.js');

let ready = null;
function lib() {
  ready ??= new Promise((resolve, reject) => {
    // The factory fills in and returns this object; onRuntimeInitialized may run before it returns
    const m = {
      locateFile: () => '../assets/vendor/libheif/libheif.wasm',
      onRuntimeInitialized: () => resolve(m),
      onAbort: e => reject(new Error('libheif: ' + e)),
    };
    libheif(m);
  });
  return ready;
}

self.onmessage = async ({ data: { id, buf } }) => {
  try {
    const m = await lib();
    const decoder = new m.HeifDecoder();
    const images = decoder.decode(new Uint8Array(buf));
    if (!images.length) throw new Error('no image in HEIF file');
    // The first top-level image is the primary one (further ones: burst or depth images)
    const img = images[0];
    const width = img.get_width(), height = img.get_height();
    const out = { data: new Uint8ClampedArray(width * height * 4), width, height };
    const res = await new Promise(r => img.display(out, r));
    images.forEach(i => i.free && i.free());
    if (decoder.decoder) m.heif_context_free(decoder.decoder);
    if (!res) throw new Error('HEIF decoding failed');
    self.postMessage({ id, width, height, data: out.data.buffer }, [out.data.buffer]);
  } catch (e) {
    self.postMessage({ id, error: String(e && e.message || e) });
  }
};
