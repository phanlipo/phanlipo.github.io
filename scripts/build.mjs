#!/usr/bin/env node
// Generates everything that must stay in sync across pages. Runs in the git pre-commit hook
// and in the GitHub Action on every push.
//
//   1. Tool list on the start page (index.html) and in README.md      <!-- tools:start/end -->
//   2. Shared footer line in every page (scripts/partials/footer.html) <!-- footer:start/end -->
//   3. <head> block in every page: noindex, Content Security Policy,   <!-- head:start/end -->
//      favicon, manifest, theme colour
//   4. Data backup section in every app (scripts/partials/data.html)   <!-- data:start/end -->
//   5. Per app (every listed tool + template): manifest.webmanifest and sw.js (offline cache).
//      The cache version is a hash of all cached files, so every change ships automatically;
//      it is also shown in the app's footer ("Version …").
//
// Usage:
//   node scripts/build.mjs                  update files
//   node scripts/build.mjs --check          only check; exit code 1 if something is outdated
//   node scripts/build.mjs --print-changed  update and print changed files (for the git hook)
//
// Page metadata (in <head>):
//   <title>, <meta name="description">                  required for the tool list
//   tool:tags ("a, b"), tool:order (number), tool:hidden ("true" = not listed, no PWA)
//   tool:features ("a, b")                               what sets the app apart, from FEATURES below
//   tool:icon, tool:color                                icons (see build-icons.mjs), theme colour
//   tool:short-name                                      name under the home-screen icon (≤ 12 chars)
//   tool:storage                                         localStorage key prefix(es) of the app, comma-separated
//   tool:share-target                                    accepted file types for "share to this app" (Android),
//                                                        e.g. "audio/*, .opus" – see AGENTS.md

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, decode, meta, allPages } from './lib.mjs';

const SKIP = new Set(['assets', 'scripts', 'template', 'node_modules', 'tests']);
const SITE = 'https://phanlipo.github.io/';
const SW_FORMAT = 2; // bump when the generated sw.js logic changes
const VENDOR = JSON.parse(readFileSync(join(ROOT, 'scripts/vendor.json'), 'utf8'));

// Features for the second filter row on the start page, in display order. Only what sets apps apart:
// things every app has (offline, installable, data stays on the device) are stated once on the start page.
const FEATURES = ['Kamera', 'Datei öffnen', 'Teilen an App', 'Kopieren', 'Verlauf', 'Schütteln', 'Download nötig'];

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
    features: (meta(html, 'tool:features') || '').split(',').map(t => t.trim()).filter(Boolean),
    order: Number(meta(html, 'tool:order')) || 100,
    hidden: meta(html, 'tool:hidden') === 'true',
    color: meta(html, 'tool:color') || '#334155',
    shortName: meta(html, 'tool:short-name') || title,
    storage: meta(html, 'tool:storage'),
    shareAccept: (meta(html, 'tool:share-target') || '').split(',').map(s => s.trim()).filter(Boolean),
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
  for (const t of tools) for (const f of t.features)
    if (!FEATURES.includes(f)) throw new Error(`${t.file}: unknown tool:features value "${f}" – allowed: ${FEATURES.join(', ')}`);
  // Filter rows: every value once. Categories: the first tag of a tool is its area (Alltag, Arbeit, Freizeit …);
  // areas come first, then the other tags, each alphabetically. Features in FEATURES order.
  // Hidden until the page script runs (no JS = no filter).
  const areas = new Set(tools.map(t => t.tags[0]).filter(Boolean));
  const byName = (a, b) => a.localeCompare(b, 'de');
  const tags = [...areas].sort(byName)
    .concat([...new Set(tools.flatMap(t => t.tags))].filter(x => !areas.has(x)).sort(byName));
  const features = FEATURES.filter(f => tools.some(t => t.features.includes(f)));
  const chip = (label, value, pressed) =>
    `<button type="button" class="chip" data-tag="${escHtml(value)}" aria-pressed="${pressed}">${escHtml(label)}</button>`;
  const row = (id, label, chips) => `    <div class="filter-row" role="group" aria-labelledby="${id}">
      <span class="filter-label" id="${id}">${label}</span>
      <div class="chips">
        ${chips.join('\n        ')}
      </div>
    </div>
`;
  const filter = tags.length || features.length ? `  <div class="filter" hidden>
${row('f-cat', 'Kategorie', [chip('Alle', '', true), ...tags.map(x => chip(x, x, false))])}${features.length ? row('f-feat', 'Funktion', features.map(x => chip(x, x, false))) : ''}  </div>
  <p class="filter-status sr-only" aria-live="polite"></p>
` : '';
  const cards = tools.map(t => `    <article class="card tool" data-tags="${escHtml(JSON.stringify([...t.tags, ...t.features]))}">
      <h2>${t.icon ? `<img src="${t.folder}/icon.svg" alt="" width="32" height="32">` : ''}${escHtml(t.title)}</h2>
      <p>${escHtml(t.description)}</p>
      <div class="tags">${t.tags.map(x => `<span class="tag">${escHtml(x)}</span>`).join('')}${t.features.map(x => `<span class="tag feat">${escHtml(x)}</span>`).join('')}</div>
      <a class="btn primary" href="${t.folder}/">Öffnen</a>
    </article>`).join('\n');
  return `\n${filter}  <div class="grid">\n${cards}\n  </div>\n  `;
}

function renderTable() {
  const rows = tools.map(t =>
    `| [${escMd(t.title)}](${SITE}${t.folder}/) | \`${t.folder}/\` | ${escMd(t.description)} |`);
  return '\n| Seite | Ordner | Beschreibung |\n|---|---|---|\n' + rows.join('\n') + '\n';
}

// Content Security Policy: only own files; inline <script> blocks are allowed by their SHA-256 hash.
// Inline style attributes stay allowed (used widely, low risk). WebAssembly only where a page needs it.
function csp(p) {
  const html = read(p.file);
  const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  const wasm = isApp(p) && vendorsOf(p).some(v => VENDOR[v]?.wasm) ? " 'wasm-unsafe-eval'" : '';
  return [
    "default-src 'self'",
    `script-src 'self'${wasm}${hashes.length ? ' ' + hashes.join(' ') : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "connect-src 'self'",
    "font-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

function renderHead(p) {
  const lines = [
    // Not listed by search engines. Crawling stays allowed in robots.txt so they can see this tag.
    '<meta name="robots" content="noindex, nofollow">',
    `<meta http-equiv="Content-Security-Policy" content="${csp(p)}">`,
  ];
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
    ...(p.shareAccept.length ? {
      // Installed app appears in the system share sheet (Android). sw.js receives the POST.
      share_target: {
        action: './share-target',
        method: 'POST',
        enctype: 'multipart/form-data',
        params: { files: [{ name: 'file', accept: p.shareAccept }] },
      },
    } : {}),
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

// Vendor packages an app uses: referenced from its page or any script in its folder (e.g. a worker)
function vendorsOf(p) {
  const texts = [read(p.file), ...filesIn(p.folder).filter(f => /\.m?js$/.test(f) && !f.endsWith('/sw.js')).map(read)];
  const names = new Set();
  for (const t of texts) for (const m of t.matchAll(/\.\.\/assets\/vendor\/([^/"'`]+)\//g)) names.add(m[1]);
  return [...names].sort();
}

// Everything the app needs offline, as repo-relative paths
function precacheList(p) {
  // Every file of the app folder (page, manifest, icons, helper scripts) except the service worker itself
  // (the manifest is listed explicitly: on the very first build it does not exist on disk yet)
  const own = new Set(filesIn(p.folder).filter(f => f !== p.file && !f.endsWith('/sw.js')));
  own.add(`${p.folder}/manifest.webmanifest`);
  const files = [p.file, ...[...own].sort()];
  files.push('assets/base.css', 'assets/common.js');
  // Whole vendor package if the app uses any file of it (fonts, .wasm are loaded indirectly) –
  // except large ones marked "precache": false, which are cached on first use (see runtimeVendors)
  for (const v of vendorsOf(p)) if (VENDOR[v]?.precache !== false) files.push(...filesIn(`assets/vendor/${v}`).sort());
  return files;
}

// Large vendor packages: cached on first use in a cache named after their version, kept across app updates
function runtimeVendors(p) {
  return Object.fromEntries(vendorsOf(p).filter(v => VENDOR[v]?.precache === false)
    .map(v => [posix.relative(p.folder, `assets/vendor/${v}`) + '/', `vendor:${v}@${VENDOR[v].version}`]));
}

// The footer shows the version, so the footer block is left out of the page's hash (no circularity);
// the shared footer text itself is hashed instead.
const withoutFooter = html => replaceBlock(html, 'footer', '') ?? html;

function serviceWorker(p) {
  const files = precacheList(p);
  const hash = createHash('sha256').update(`format${SW_FORMAT}`).update(footer);
  for (const f of files) hash.update(f).update(f === p.file ? withoutFooter(read(f)) : readBytes(f));
  const version = hash.digest('hex').slice(0, 12);
  // Paths relative to the sw.js location (= app folder); "./" is the app start page
  const urls = ['./', ...files.map(f => posix.relative(p.folder, f))];
  return { version, code: `// Generated by scripts/build.mjs – do not edit.
// Offline cache for this app. VERSION is a hash of all cached files: every change
// creates a new version, the browser installs it in the background and removes the old one.
const APP = ${JSON.stringify(p.folder)};
const VERSION = '${version}';
const CACHE = \`pwa:\${APP}:\${VERSION}\`;
const FILES = ${JSON.stringify(urls, null, 2)};
// Large libraries: folder -> cache name (contains the library version, survives app updates)
const RUNTIME = ${JSON.stringify(runtimeVendors(p), null, 2)};
const RUNTIME_URLS = Object.entries(RUNTIME).map(([dir, cache]) => [new URL(dir, self.location).href, cache]);

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
    const keep = new Set(Object.values(RUNTIME));
    const runtimeLibs = Object.values(RUNTIME).map(c => c.slice(0, c.lastIndexOf('@') + 1));
    for (const key of await caches.keys()) {
      if (key.startsWith(\`pwa:\${APP}:\`) && key !== CACHE) await caches.delete(key);
      // Older versions of the large libraries this app uses
      if (runtimeLibs.some(prefix => key.startsWith(prefix)) && !keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Cache first: instant start and offline use. Anything not cached goes to the network.
${p.shareAccept.length ? `// Share target: a file shared to the installed app arrives as POST ./share-target.
// It is parked in a cache and the page is opened with ?shared=1 (Tools.takeSharedFile() picks it up).
const SHARE_URL = new URL('./share-target', self.location).href;
const SHARE_CACHE = \`share:\${APP}\`;
self.addEventListener('fetch', event => {
  if (event.request.method !== 'POST' || event.request.url.split('?')[0] !== SHARE_URL) return;
  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const file = form.getAll('file').find(f => f && typeof f !== 'string');
      if (file) {
        const cache = await caches.open(SHARE_CACHE);
        await cache.put('shared-file', new Response(file, { headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || 'geteilt'),
        } }));
      }
    } catch (_) {}
    return Response.redirect(new URL('./?shared=1', self.location).href, 303);
  })());
});

` : ''}self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const runtime = RUNTIME_URLS.find(([prefix]) => event.request.url.startsWith(prefix));
  if (runtime) {
    event.respondWith(caches.open(runtime[1]).then(async cache => {
      const hit = await cache.match(event.request, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok) await cache.put(event.request, res.clone());
      return res;
    }));
    return;
  }
  event.respondWith(
    caches.open(CACHE)
      .then(cache => cache.match(event.request, { ignoreSearch: true }))
      .then(hit => hit || fetch(event.request))
  );
});
` };
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
for (const p of apps) {
  const { version, code } = serviceWorker(p);
  put(`${p.folder}/sw.js`, code);
  setBlock(p.file, 'footer', `\n  ${footer}\n  <p class="footer-version">Version ${version}</p>\n  `, false);
}

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
