// Tesseract worker, started from the app folder: a worker script outside the app's scope
// (/pdf2word/) would bypass the service worker – the recognition files would neither be
// cached on first use nor be available offline.
importScripts('../assets/vendor/tesseract/worker.min.js');
