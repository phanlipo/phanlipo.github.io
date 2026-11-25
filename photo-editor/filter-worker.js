// Filter worker of the Foto-Editor: runs PhotoFilters (filters.js) off the main thread, so sliders stay smooth.
// In: {id, w, h, pixels (ArrayBuffer RGBA), filter, opts} – out: {id, pixels} or {id, error (code)}.
importScripts('filters.js');
self.onmessage = e => {
  const { id, w, h, pixels, filter, opts } = e.data || {};
  try {
    const out = self.PhotoFilters.apply(new Uint8ClampedArray(pixels), w, h, filter, opts);
    self.postMessage({ id, pixels: out.buffer }, [out.buffer]);
  } catch (err) {
    self.postMessage({ id, error: 'filter-failed', detail: String(err && err.message || err) });
  }
};
