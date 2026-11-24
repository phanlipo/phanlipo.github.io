/* Reads a BfArM download (ZIP, ClaML-XML, EDV-TXT) away from the page, so it stays responsive with large files.
   Message in:  { id, file }   Messages out: { id, progress: { step } } … then { id, result: [dataset …] } or
   { id, error: code } – the page translates the codes. Logic in codes.js. */
importScripts('codes.js');
self.onmessage = async e => {
  const { id, file } = e.data;
  try {
    const result = await self.MedCodes.readFile(file, p => self.postMessage({ id, progress: { step: p.step } }));
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.code || 'unknown', detail: String(err && err.message || err).slice(0, 200) });
  }
};
