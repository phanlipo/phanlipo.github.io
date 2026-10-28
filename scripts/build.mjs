#!/usr/bin/env node
// Generates everything that must stay in sync across pages. Runs in the git pre-commit hook
// and in the GitHub Action on every push.
//
//   1. Tool list on the start page (index.html) and in README.md      <!-- tools:start/end -->
//   2. Shared footer line in every page (scripts/partials/footer.html) <!-- footer:start/end -->
//   3. Head links (favicon, manifest, theme colour) in every page      <!-- head:start/end -->
//   4. Data backup section in every app (scripts/partials/data.html)   <!-- data:start/end -->
//   5. Per app (every listed tool + template): manifest.webmanifest and sw.js (offline cache).
//      The cache version is a hash of all cached files, so every change ships automatically.
//
// Usage:
//   node scripts/build.mjs                  update files
//   node scripts/build.mjs --check          only check; exit code 1 if something is outdated
//   node scripts/build.mjs --print-changed  update and print changed files (for the git hook)
//
// Page metadata (in <head>):
//   <title>, <meta name="description">                  required for the tool list
//   tool:tags ("a, b"), tool:order (number), tool:hidden ("true" = not listed, no PWA)
//   tool:icon, tool:color                                icons (see build-icons.mjs), theme colour
//   tool:short-name                                      name under the home-screen icon (≤ 12 chars)
//   tool:storage                                         localStorage key prefix(es) of the app, comma-separated

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, decode, meta, allPages } from './lib.mjs';

const SKIP = new Set(['assets', 'scripts', 'template', 'node_modules', 'tests']);
const SITE = 'https://phanlipo.github.io/';
const SW_FORMAT = 1; // bump when the generated sw.js logic changes

const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escMd = s => s.replace(/\|/g, '\\|');

/* ---------- Virtual file system: generated text is kept in memory until the end ---------- */
const pending = new Map();      // repo-relative path -> new content (string or Buffer)
const read = file => pending.has(file) ? pending.get(file) : (existsSync(join(ROOT, file)) ? readFileSync(join(ROOT, file), 'utf8') : null);
const readBytes = file => pending.has(file) ? Buffer.from(pending.get(file)) : readFileSync(join(ROOT, file));
const put = (file, content) => pending.set(file, content);

/* ---------- Pages ---------- */
function pageInfo({ folder, file }) {
  const html = read(file);
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decode(titleMatch[1].trim()) : null;
  return {
    folder, file, title,
    description: meta(html, 'description'),
    tags: (meta(html, 'tool:tags') || '').split(',').map(t => t.trim()).filter(Boolean),
    order: Number(meta(html, 'tool:order')) || 100,
    hidden: meta(html, 'tool:hidden') === 'true',
    color: meta(html, 'tool:color') || '#334155',
    shortName: meta(html, 'tool:short-name') || title,
    storage: meta(html, 'tool:storage'),
    icon: existsSync(join(ROOT, folder, 'icon.svg')),
  };
}

const pages = allPages().map(pageInfo);
const tools = pages
  .filter(p => p.folder && !SKIP.has(p.folder) && !p.hidden)
  .filter(p => {
    if (p.title && p.description) return true;
    console.warn(`! ${p.file}: <title> or <meta name="description"> missing – not listed`);
    return false;
  })
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'de'));
// Installable apps: every listed tool plus the template (so copies work right away)
const apps = [...tools, ...pages.filter(p => p.folder === 'template')];
const isApp = p => apps.includes(p);

/* ---------- Generated blocks ---------- */
function replaceBlock(text, name, content) {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < a) return null;
  return text.slice(0, a + start.length) + content + text.slice(b);
}
function setBlock(file, name, content, required) {
  const next = replaceBlock(read(file), name, content);
  if (next == null) {
    if (required) throw new Error(`${file}: markers <!-- ${name}:start --> … <!-- ${name}:end --> not found`);
    return;
  }
  put(file, next);
}

function renderCards() {
  if (!tools.length) return '\n  <p class="muted">Noch keine Seiten.</p>\n  ';
  const cards = tools.map(t => `    <article class="card tool">
      <h2>${t.icon ? `<img src="${t.folder}/icon.svg" alt="" width="32" height="32">` : ''}${escHtml(t.title)}</h2>
      <p>${escHtml(t.description)}</p>
      <div class="tags">${t.tags.map(x => `<span class="tag">${escHtml(x)}</span>`).join('')}</div>
      <a class="btn primary" href="${t.folder}/">Öffnen</a>
    </article>`).join('\n');
  return `\n  <div class="grid">\n${cards}\n  </div>\n  `;
}

function renderTable() {
  const rows = tools.map(t =>
    `| [${escMd(t.title)}](${SITE}${t.folder}/) | \`${t.folder}/\` | ${escMd(t.description)} |`);
  return '\n| Seite | Ordner | Beschreibung |\n|---|---|---|\n' + rows.join('\n') + '\n';
}

function renderHead(p) {
  const lines = [];
  if (p.icon) {
    lines.push('<link rel="icon" href="icon.svg" type="image/svg+xml">');
    lines.push('<link rel="apple-touch-icon" href="icon-180.png">');
  }
  if (isApp(p)) {
    lines.push('<link rel="manifest" href="manifest.webmanifest">');
    lines.push(`<meta name="apple-mobile-web-app-title" content="${escHtml(p.shortName)}">`);
  }
  lines.push(`<meta name="theme-color" content="${escHtml(p.color)}">`);
  return '\n' + lines.join('\n') + '\n';
}

/* ---------- PWA ---------- */
function manifest(p) {
  const icon = (src, sizes, extra) => existsSync(join(ROOT, p.folder, src)) ? [{ src, sizes, type: 'image/png', ...extra }] : [];
  return JSON.stringify({
    id: './',
    name: p.title,
    short_name: p.shortName,
    description: p.description || '',
    lang: 'de',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#f4f6f9',
    theme_color: p.color,
    icons: [
      ...(existsSync(join(ROOT, p.folder, 'icon.svg')) ? [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }] : []),
      ...icon('icon-192.png', '192x192'),
      ...icon('icon-512.png', '512x512'),
      ...icon('icon-maskable-512.png', '512x512', { purpose: 'maskable' }),
    ],
  }, null, 2) + '\n';
}

function filesIn(dir) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesIn(rel));
    else if (!['LICENSE', 'SOURCE.md'].includes(e.name)) out.push(rel);
  }
  return out;
}

// Everything the app needs offline, as repo-relative paths
function precacheList(p) {
  const html = read(p.file);
  const files = [p.file, `${p.folder}/manifest.webmanifest`, 'assets/base.css', 'assets/common.js'];
  for (const f of ['icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
    if (existsSync(join(ROOT, p.folder, f))) files.push(`${p.folder}/${f}`);
  }
  // Whole vendor package if the page uses any file of it (fonts, .wasm are loaded indirectly)
  const vendors = new Set([...html.matchAll(/\.\.\/assets\/vendor\/([^/"']+)\//g)].map(m => m[1]));
  for (const v of [...vendors].sort()) files.push(...filesIn(`assets/vendor/${v}`).sort());
  return files;
}

function serviceWorker(p) {
  const files = precacheList(p);
  const hash = createHash('sha256').update(`format${SW_FORMAT}`);
  for (const f of files) hash.update(f).update(readBytes(f));
  const version = hash.digest('hex').slice(0, 12);
  // Paths relative to the sw.js location (= app folder); "./" is the app start page
  const urls = ['./', ...files.map(f => posix.relative(p.folder, f))];
  return `// Generated by scripts/build.mjs – do not edit.
// Offline cache for this app. VERSION is a hash of all cached files: every change
// creates a new version, the browser installs it in the background and removes the old one.
const APP = ${JSON.stringify(p.folder)};
const VERSION = '${version}';
const CACHE = \`pwa:\${APP}:\${VERSION}\`;
const FILES = ${JSON.stringify(urls, null, 2)};

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // All apps share the domain's cache storage – only delete this app's old versions
    for (const key of await caches.keys()) {
      if (key.startsWith(\`pwa:\${APP}:\`) && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Cache first: instant start and offline use. Anything not cached goes to the network.
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.open(CACHE)
      .then(cache => cache.match(event.request, { ignoreSearch: true }))
      .then(hit => hit || fetch(event.request))
  );
});
`;
}

/* ---------- Run ---------- */
const footer = readFileSync(join(ROOT, 'scripts/partials/footer.html'), 'utf8').trim();
const dataBlock = readFileSync(join(ROOT, 'scripts/partials/data.html'), 'utf8').trim();
setBlock('index.html', 'tools', renderCards(), true);
setBlock('README.md', 'tools', renderTable(), true);
for (const p of pages) {
  setBlock(p.file, 'footer', `\n  ${footer}\n  `, false);
  if (!p.hidden) setBlock(p.file, 'head', renderHead(p), false);
  setBlock(p.file, 'data', isApp(p) && p.storage ? `\n${dataBlock}\n` : '\n', false);
}
for (const p of apps) {
  if (!p.storage) console.warn(`! ${p.file}: <meta name="tool:storage"> missing – no data backup section`);
}
// Manifests first: they are part of the cached files and therefore of the version hash
for (const p of apps) put(`${p.folder}/manifest.webmanifest`, manifest(p));
for (const p of apps) put(`${p.folder}/sw.js`, serviceWorker(p));

const changed = [];
for (const [file, content] of pending) {
  const path = join(ROOT, file);
  const before = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (before === content) continue;
  changed.push(file);
  if (!process.argv.includes('--check')) writeFileSync(path, content);
}

if (process.argv.includes('--check')) {
  if (changed.length) {
    console.error(`Outdated: ${changed.join(', ')}. Run: node scripts/build.mjs`);
    process.exit(1);
  }
  console.log(`Up to date (${tools.length} tools, ${apps.length} apps).`);
} else if (process.argv.includes('--print-changed')) {
  changed.forEach(f => console.log(f));
} else {
  console.log(`${tools.length} tools, ${apps.length} apps` +
    (changed.length ? ` – updated ${changed.join(', ')}` : ' – no changes'));
}
