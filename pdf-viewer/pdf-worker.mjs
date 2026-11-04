// pdf.js worker, started from the app folder: a worker script outside the app's scope
// (/pdf-viewer/) would bypass the service worker and fail offline.
import '../assets/vendor/pdfjs/pdf.worker.min.mjs';
