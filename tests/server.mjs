// Minimal static file server for the tests (behaves like GitHub Pages for our needs):
// serves only what is published (isPublished in scripts/lib.mjs) – plus template/, which is tested
// like an app but not published –, "folder" -> 301 "folder/", "folder/" -> folder/index.html.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPublished } from '../scripts/lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.argv[2]) || 4173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT)) throw new Error('outside root');
    let s = await stat(file);
    if (s.isDirectory()) {
      if (!path.endsWith('/')) { res.writeHead(301, { Location: path + '/' }); return res.end(); }
      file = join(file, 'index.html');
      s = await stat(file);
    }
    const rel = file.slice(ROOT.length).split('\\').join('/').replace(/^\//, '');
    if (!isPublished(rel) && !rel.startsWith('template/')) throw new Error('not published');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}).listen(PORT, () => console.log(`Serving ${ROOT} on http://localhost:${PORT}`));
