#!/usr/bin/env node
// Generates everything that must stay in sync across pages. Runs in the git pre-commit hook
// and in the GitHub Action on every push.
//
//   1. Tool list on the start page (index.html) and in README.md      <!-- tools:start/end -->
//   2. Shared footer line in every page (scripts/partials/footer.html) <!-- footer:start/end -->
//   3. <head> block in every page: noindex, Content Security Policy,   <!-- head:start/end -->
//      favicon, manifest, theme colour
//   4. Data backup section in every app (scripts/partials/data.html)   <!-- data:start/end -->
//      and help sections on AI agents (scripts/partials/help-agent.html) <!-- agent:start/end -->
//      and on sharing/opening files (scripts/partials/help-files.html)   <!-- files:start/end -->
//      and on vibration (scripts/partials/help-vibrate.html)             <!-- vibrate:start/end -->,
//      for every app whose own scripts vibrate (Tools.vibrate / navigator.vibrate); the markers are
//      added by this script before the agent section or "Fehlersuche"
//   5. Per app (every listed tool + template): manifest.webmanifest and sw.js (offline cache).
//      The cache version is a hash of all cached files, so every change ships automatically
//      (of assets/icons.svg only the icons the app uses – a new icon does not update every app);
//      it is also shown in the app's footer ("Version …").
//   6. NOTICE.md: third-party notices from scripts/vendor.json and the LICENSE files (whole file)
//   7. sbom.cdx.json: Software Bill of Materials (CycloneDX) of the shipped libraries (scripts/sbom.mjs)
//
// Usage:
//   node scripts/build.mjs                  update files
//   node scripts/build.mjs --check          only check; exit code 1 if something is outdated
//   node scripts/build.mjs --print-changed  update and print changed files (for the git hook)
//
// Page metadata (in <head>):
//   <title>, <meta name="description">                  required for the tool list
//   tool:tags ("a, b"), tool:hidden ("true" = not listed, no PWA)
//   tool:features ("a, b")                               what sets the app apart, from FEATURES below
//                                                        ("Vollbild": manifest display "fullscreen", see AGENTS.md)
//   tool:icon, tool:color                                icons (see build-icons.mjs), theme colour
//   tool:short-name                                      name under the home-screen icon (≤ 12 chars)
//   tool:storage                                         localStorage key prefix(es) of the app, comma-separated
//   tool:share-target                                    accepted file types for "share to this app" (Android, one or several files),
//                                                        e.g. "audio/*, .opus" – see AGENTS.md. The file extensions in it
//                                                        also become file_handlers ("Open with", Windows/desktop); the help gets
//                                                        the section "Dateien an die App geben" (scripts/partials/help-files.html,
//                                                        <!-- files:start/end -->, uses tool:short-name / -short-name-en)
//   tool:share-text ("true")                             receive shared links/text (Android) as ?title=&text=&url=
//   tool:shortcuts                                       app shortcuts on the icon (long press), up to 4:
//                                                        "action: icon: Deutsch | English; …" – manifest "shortcuts" with
//                                                        url ./?shortcut=<action> and icon shortcut-<action>.png
//                                                        (build-icons.mjs); the page reads it with Tools.shortcut()
//   tool:webmcp ("a, b")                                 WebMCP tools the page registers (names without app prefix);
//                                                        needs the feature "KI-Agent", checked by tests/webmcp.spec.mjs
//   tool:webmcp-help, tool:webmcp-help-en                what an AI agent can do in this app (plain text, one or two sentences);
//                                                        required with tool:webmcp – becomes the help section "KI-Agenten"
//                                                        (scripts/partials/help-agent.html) <!-- agent:start/end -->
//   tool:youtube ("true")                                embeds the YouTube player (frame-src www.youtube-nocookie.com, and
//                                                        www.youtube.com for the opt-in "play with YouTube account");
//                                                        only for apps whose purpose is playing YouTube, see AGENTS.md
//   tool:title-en, tool:description-en, tool:short-name-en   English texts (start page, manifest, page title);
//                                                        title and description required for every listed tool

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, decode, meta, allPages, parseShortcuts, vendorProblems, isPublished, usedIcons, spriteIcons, spriteSubset, iconsIn, ICON_SPRITE } from './lib.mjs';
import { renderSbom, SBOM_FILE } from './sbom.mjs';

const SKIP = new Set(['assets', 'scripts', 'template', 'node_modules', 'tests']);
const SITE = 'https://phanlipo.github.io/';
const SW_FORMAT = 2; // bump when the generated sw.js logic changes
const VENDOR = JSON.parse(readFileSync(join(ROOT, 'scripts/vendor.json'), 'utf8'));

// Features for the second filter row on the start page, in display order. Only what sets apps apart:
// things every app has (offline, installable, data stays on the device) are stated once on the start page.
const FEATURES = ['Kamera', 'Mikrofon', 'Bewegungssensor', 'Standort', 'NFC', 'Datei öffnen', 'Teilen an App', 'Vollbild', 'Benachrichtigung', 'Kopieren', 'Verlauf', 'Schütteln', 'KI-Agent', 'Download nötig'];
// English names of all tags and features (start page filter). A new tag needs an entry here.
const TAGS_EN = {
  Alltag: 'Everyday', Arbeit: 'Work', Freizeit: 'Leisure',
  Apotheke: 'Pharmacy', Barcode: 'Barcode', Bierbrauen: 'Homebrewing', Dokumente: 'Documents', KI: 'AI',
  Kinder: 'Kids', Lernen: 'Learning', Medizin: 'Medicine', Messen: 'Measuring', Musik: 'Music', Physik: 'Physics', Rechner: 'Calculators', Spiele: 'Games', Sport: 'Sports', Sprache: 'Speech',
  Werkzeug: 'Tools', Zufall: 'Random', Finanzen: 'Finance',
  Kamera: 'Camera', Mikrofon: 'Microphone', Bewegungssensor: 'Motion sensor', Standort: 'Location', NFC: 'NFC',
  'Datei öffnen': 'Open file', 'Teilen an App': 'Share to app', Vollbild: 'Full screen', Benachrichtigung: 'Notifications', Kopieren: 'Copy', Verlauf: 'History',
  Schütteln: 'Shake', 'KI-Agent': 'AI agent', 'Download nötig': 'Download needed',
};

const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escMd = s => s.replace(/[\\|]/g, '\\$&');

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
    hidden: meta(html, 'tool:hidden') === 'true',
    color: meta(html, 'tool:color') || '#334155',
    shortName: meta(html, 'tool:short-name') || title,
    titleEn: meta(html, 'tool:title-en'),
    descriptionEn: meta(html, 'tool:description-en'),
    shortNameEn: meta(html, 'tool:short-name-en') || meta(html, 'tool:title-en'),
    storage: meta(html, 'tool:storage'),
    shareAccept: (meta(html, 'tool:share-target') || '').split(',').map(s => s.trim()).filter(Boolean),
    shareText: meta(html, 'tool:share-text') === 'true',
    webmcp: (meta(html, 'tool:webmcp') || '').split(',').map(s => s.trim()).filter(Boolean),
    agentHelp: meta(html, 'tool:webmcp-help'),
    agentHelpEn: meta(html, 'tool:webmcp-help-en'),
    connect: (meta(html, 'tool:connect') || '').split(/\s+/).filter(Boolean),
    cast: meta(html, 'tool:cast') === 'true',
    youtube: meta(html, 'tool:youtube') === 'true',
    shortcuts: parseShortcuts(html, file),
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
  // Alphabetical (the start page re-sorts by the English titles when shown in English)
  .sort((a, b) => a.title.localeCompare(b.title, 'de'));
for (const t of tools) {
  if (t.webmcp.length !== 0 && !t.features.includes('KI-Agent'))
    throw new Error(`${t.file}: tool:webmcp is set – add "KI-Agent" to tool:features`);
  if (t.features.includes('KI-Agent') && !t.webmcp.length)
    throw new Error(`${t.file}: feature "KI-Agent" needs <meta name="tool:webmcp"> with the tool names`);
  // Extra connect-src sources (only for apps whose purpose is talking to servers the user names, e.g. api-check)
  for (const c of t.connect)
    if (!/^(https:|https:\/\/[a-z0-9.*-]+(:\d+)?|http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\*|:\d+)?)$/.test(c))
      throw new Error(`${t.file}: tool:connect "${c}" not allowed (https: / https://host / http://localhost:* only)`);
  if (!t.titleEn || !t.descriptionEn)
    throw new Error(`${t.file}: <meta name="tool:title-en"> and <meta name="tool:description-en"> are required (English start page and manifest)`);
  // Start page cards show only the name – what the app does belongs in the description
  for (const name of [t.title, t.titleEn])
    if (/ [–—-] |[:?|]/.test(name) || name.length > 24)
      throw new Error(`${t.file}: title "${name}" too long – only the app's name (max. 24 characters, no addition after "–"/":"), details go in the description`);
}
// Installable apps: every listed tool plus the template (so copies work right away)
const apps = [...tools, ...pages.filter(p => p.folder === 'template')];
const isApp = p => apps.includes(p);
for (const p of apps) {
  for (const s of p.shortcuts)
    if (!existsSync(join(ROOT, p.folder, `shortcut-${s.action}.png`)))
      throw new Error(`${p.file}: shortcut-${s.action}.png missing – run: node scripts/build-icons.mjs ${p.folder}`);
  if (p.shareAccept.length && !read(p.file).includes('<!-- files:start -->'))
    throw new Error(`${p.file}: tool:share-target needs <!-- files:start --><!-- files:end --> in the help (before "Fehlersuche")`);
  if (!p.webmcp.length) continue;
  if (!p.agentHelp || !p.agentHelpEn)
    throw new Error(`${p.file}: tool:webmcp needs <meta name="tool:webmcp-help"> and <meta name="tool:webmcp-help-en"> (what an AI agent can do here)`);
  if (!read(p.file).includes('<!-- agent:start -->'))
    throw new Error(`${p.file}: tool:webmcp needs <!-- agent:start --><!-- agent:end --> in the help (before "Fehlersuche")`);
}

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

// Start page groups: the area (first tag) of an app, with big areas split by one topic
// (Freizeit → Spiele and the rest). The switch above the list (.seg) has one button per group.
const SUBGROUPS = { Freizeit: 'Spiele' };
// Topics with fewer apps get no filter chip (the search still finds them by the tag)
const MIN_TOPIC = 2;
const groupOf = t => SUBGROUPS[t.tags[0]] && t.tags.includes(SUBGROUPS[t.tags[0]]) ? SUBGROUPS[t.tags[0]] : t.tags[0];

function renderCards() {
  if (!tools.length) return '\n  <p class="muted">Noch keine Seiten.</p>\n  ';
  for (const t of tools) for (const f of t.features)
    if (!FEATURES.includes(f)) throw new Error(`${t.file}: unknown tool:features value "${f}" – allowed: ${FEATURES.join(', ')}`);
  for (const t of tools) for (const x of [...t.tags, ...t.features])
    if (!TAGS_EN[x]) throw new Error(`${t.file}: no English name for tag "${x}" – add it to TAGS_EN in scripts/build.mjs`);
  const byName = (a, b) => a.localeCompare(b, 'de');
  const count = x => tools.filter(t => t.tags.includes(x) || t.features.includes(x)).length;
  // Areas: the first tag of every app (Alltag, Arbeit, Freizeit) – the .seg switch
  const areas = [...new Set(tools.map(t => t.tags[0]).filter(Boolean))].sort(byName);
  // Filter panel: topics (other tags, not those with their own group) and features. Values every app has
  // (e.g. KI-Agent) set nothing apart.
  const topics = [...new Set(tools.flatMap(t => t.tags.slice(1)))].filter(x => !areas.includes(x) && !Object.values(SUBGROUPS).includes(x) && count(x) >= MIN_TOPIC).sort(byName);
  const features = FEATURES.filter(f => count(f) && count(f) < tools.length);
  const chip = x => `<button type="button" class="chip" data-tag="${escHtml(x)}" data-i18n="tag.${escHtml(x)}" aria-pressed="false">${escHtml(x)}</button>`;
  const row = (id, label, values) => values.length ? `      <div class="filter-row" role="group" aria-labelledby="${id}">
        <span class="filter-label" id="${id}" data-i18n="${id}">${label}</span>
        <div class="chips wrap">
          ${values.map(chip).join('\n          ')}
        </div>
      </div>
` : '';
  // Groups in area order; a sub-group follows its area
  const order = areas.flatMap(a => SUBGROUPS[a] ? [a, SUBGROUPS[a]] : [a]);
  const groups = order.map(g => [g, tools.filter(t => groupOf(t) === g)]).filter(([, list]) => list.length);
  const icon = name => `<svg class="ic" aria-hidden="true"><use href="assets/icons.svg#${name}"/></svg>`;
  // Search, group switch and filter: hidden until the page script runs (no JS = the plain grouped list).
  // The switch has one button per group; none pressed = all groups, tapping the pressed one again = all.
  // The bar sticks to the top while scrolling.
  const filter = `  <div class="filter-anchor"></div>
  <div class="filter" hidden>
    <div class="search-row">
      <div class="search">
        ${icon('search')}
        <input type="search" id="q" enterkeyhint="search" autocomplete="off" spellcheck="false" placeholder="Apps durchsuchen" aria-label="Apps durchsuchen" data-i18n-attr="placeholder:search; aria-label:search">
      </div>
      <button type="button" class="btn filter-btn" aria-expanded="false" aria-controls="filter-panel">${icon('filter')}<span data-i18n="filter">Filter</span><span class="filter-count" hidden></span></button>
    </div>
    <div class="seg area" role="group" aria-label="Bereich" data-i18n-attr="aria-label:f-area">
      ${groups.map(([g]) => `<button type="button" data-group="${escHtml(g)}" data-i18n="tag.${escHtml(g)}" aria-pressed="false">${escHtml(g)}</button>`).join('\n      ')}
    </div>
    <div class="filter-panel" id="filter-panel" hidden>
${row('f-topic', 'Thema', topics)}${row('f-feat', 'Funktion', features)}    </div>
  </div>
  <p class="filter-status sr-only" aria-live="polite"></p>
  <p class="filter-empty muted" data-i18n="search.none" hidden>Keine passende App gefunden.</p>
  <section class="shelf" id="shelf-fav" aria-labelledby="h-fav" hidden>
    <div class="shelf-head">
      <h2 id="h-fav">${icon('star')}<span data-i18n="fav.h">Favoriten</span></h2>
      <p class="shelf-hint" id="fav-hint" data-i18n="fav.hint">Zum Entfernen lange drücken</p>
    </div>
    <ul class="shelf-row"></ul>
  </section>
  <section class="shelf" id="shelf-recent" aria-labelledby="h-recent" hidden>
    <h2 id="h-recent">${icon('history')}<span data-i18n="recent.h">Zuletzt benutzt</span></h2>
    <ul class="shelf-row"></ul>
  </section>
`;
  const item = t => `      <li class="app" data-folder="${t.folder}" data-tags="${escHtml(JSON.stringify([...t.tags, ...t.features]))}">
        ${t.icon ? `<img src="${t.folder}/icon.svg" alt="" width="40" height="40">` : '<span class="noicon"></span>'}
        <div class="app-text"><a class="open" href="${t.folder}/"><span data-i18n="card.${t.folder}.title">${escHtml(t.title)}</span></a>
        <p data-i18n="card.${t.folder}.desc">${escHtml(t.description)}</p></div>
      </li>`;
  const list = groups.map(([g, ts]) => {
    return `  <section class="group" data-group="${escHtml(g)}" aria-labelledby="g-${escHtml(g)}">
    <h2 id="g-${escHtml(g)}"><span data-i18n="tag.${escHtml(g)}">${escHtml(g)}</span> <span class="count">${ts.length}</span></h2>
    <ul class="apps">
${ts.map(item).join('\n')}
    </ul>
  </section>`;
  }).join('\n');
  // English texts of the list and filters for the start page script (Tools.i18n)
  const en = { 'f-area': 'Area', 'f-topic': 'Topic', 'f-feat': 'Feature', filter: 'Filter',
    search: 'Search apps', 'search.none': 'No matching app found.' };
  for (const x of new Set([...tools.flatMap(t => [...t.tags, ...t.features]), ...order])) en['tag.' + x] = TAGS_EN[x];
  for (const t of tools) {
    en[`card.${t.folder}.title`] = t.titleEn; en[`card.${t.folder}.desc`] = t.descriptionEn;
    en[`short.${t.folder}`] = t.shortNameEn;
  }
  const de = Object.fromEntries(tools.map(t => [`short.${t.folder}`, t.shortName]));
  const json = JSON.stringify({ de, en }, null, 2).replace(/</g, '\\u003c').replace(/\n/g, '\n  ');
  return `\n${filter}${list}\n  <script type="application/json" id="i18n-cards">\n  ${json}\n  </script>\n  `;
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
  // Libraries that start their worker from in-memory code (blob: URL, e.g. the MP3 encoder) – only in pages using them
  const blobWorker = isApp(p) && vendorsOf(p).some(v => VENDOR[v]?.blobWorker) ? ' blob:' : '';
  // Google Cast sender SDK (only loaded when the user taps "stream to TV", see assets/shared/cast.js)
  const cast = p.cast ? ' https://www.gstatic.com' : '';
  // YouTube player as a cross-origin iframe (privacy-enhanced mode), created only after a tap (playlist-player).
  // No YouTube script runs in the page: it is controlled by postMessage.
  return [
    "default-src 'self'",
    `script-src 'self'${wasm}${cast}${hashes.length ? ' ' + hashes.join(' ') : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    `connect-src 'self'${p.connect?.length ? ' ' + p.connect.join(' ') : ''}`,
    "font-src 'self'",
    ...(p.youtube ? ['frame-src https://www.youtube-nocookie.com https://www.youtube.com'] : []),
    `worker-src 'self'${blobWorker}`,
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
  // Start page: manifest only for the home screen icon, no service worker (data-no-sw, see common.js)
  if (p.folder === '') lines.push('<link rel="manifest" href="manifest.webmanifest" data-no-sw>');
  if (isApp(p)) {
    lines.push('<link rel="manifest" href="manifest.webmanifest">');
    lines.push(`<meta name="apple-mobile-web-app-title" content="${escHtml(p.shortName)}">`);
  }
  lines.push(`<meta name="theme-color" content="${escHtml(p.color)}">`);
  return '\n' + lines.join('\n') + '\n';
}

/* ---------- PWA ---------- */
// File handling (Chrome/Edge on Windows, macOS, Linux, ChromeOS): the installed app is offered under
// "Open with" for these extensions. The browser registers the extensions; the MIME type is only the key.
const FILE_TYPES = {
  '.pdf': 'application/pdf',
  '.md': 'text/markdown', '.markdown': 'text/markdown', '.txt': 'text/plain',
  '.mid': 'audio/midi', '.midi': 'audio/midi',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.wav': 'audio/wav', '.flac': 'audio/flac',
  '.ogg': 'audio/ogg', '.oga': 'audio/ogg', '.opus': 'audio/ogg',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska', '.3gp': 'video/3gpp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.heic': 'image/heic', '.heif': 'image/heif', '.avif': 'image/avif', '.gif': 'image/gif', '.bmp': 'image/bmp',
  '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
  '.ics': 'text/calendar',
};
function fileHandlers(p) {
  const exts = p.shareAccept.filter(a => a.startsWith('.')).map(a => a.toLowerCase());
  if (!exts.length) return null;
  const accept = {};
  for (const ext of exts) {
    const type = FILE_TYPES[ext];
    if (!type) throw new Error(`${p.file}: tool:share-target – no MIME type for ${ext}, add it to FILE_TYPES in scripts/build.mjs`);
    (accept[type] ||= []).includes(ext) || accept[type].push(ext);
  }
  // ?opened=1: Tools.takeSharedFiles() then waits for window.launchQueue. One launch gets all selected files.
  return [{ action: './?opened=1', name: p.title, accept }];
}

function manifest(p) {
  if (p.shareAccept.length && p.shareText) throw new Error(`${p.file}: tool:share-target and tool:share-text together are not supported yet`);
  const icon = (src, sizes, extra) => existsSync(join(ROOT, p.folder, src)) ? [{ src, sizes, type: 'image/png', ...extra }] : [];
  return JSON.stringify({
    // The id is resolved against the ORIGIN, not against the manifest URL: "./" would give every app the id
    // https://phanlipo.github.io/ and Chrome/Edge on Windows would treat them all as one installed app (the
    // last manifest loaded overwrites name, icon and start page of the others). Same value as the default
    // (= start_url), so installs from before the id was set stay the same app.
    id: p.folder ? `/${p.folder}/` : '/',
    name: p.title,
    short_name: p.shortName,
    description: p.description || '',
    lang: 'de',
    // English name under the icon where the browser supports it (Chrome/Edge 148+): chosen by the
    // browser/system language, not by the language switch of the page
    ...(p.titleEn ? { name_localized: { en: p.titleEn } } : {}),
    ...(p.shortNameEn ? { short_name_localized: { en: p.shortNameEn } } : {}),
    ...(p.descriptionEn ? { description_localized: { en: p.descriptionEn } } : {}),
    start_url: './',
    scope: './',
    // Feature "Vollbild": the installed app starts without status and navigation bar (Android; swiping from
    // the edge shows them for a moment). iPhone treats it like standalone. See Tools.fullscreen in common.js.
    display: p.features.includes('Vollbild') ? 'fullscreen' : 'standalone',
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
    ...(fileHandlers(p) ? {
      file_handlers: fileHandlers(p),
      // Each opened file starts its own window, so work open in another one is never replaced
      launch_handler: { client_mode: 'navigate-new' },
    } : {}),
    ...(p.shareText ? {
      // Shared links/text (Android) open the start page as ./?title=…&text=…&url=… – Tools.takeSharedText().
      // The service worker serves the cached page for it (ignoreSearch), so this works offline too.
      share_target: {
        action: './',
        method: 'GET',
        params: { title: 'title', text: 'text', url: 'url' },
      },
    } : {}),
    ...(p.shortcuts.length ? {
      // Long press on the icon (Android, Windows/macOS/ChromeOS; not iPhone). Tools.shortcut() reads ?shortcut=,
      // the service worker serves the cached page for it (ignoreSearch), so this works offline too.
      shortcuts: p.shortcuts.map(s => ({
        name: s.name,
        short_name: s.name,
        name_localized: { en: s.nameEn },
        short_name_localized: { en: s.nameEn },
        url: `./?shortcut=${s.action}`,
        icons: [{ src: `shortcut-${s.action}.png`, sizes: '192x192', type: 'image/png' }],
      })),
    } : {}),
    icons: [
      ...(existsSync(join(ROOT, p.folder, 'icon.svg')) ? [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }] : []),
      ...icon('icon-192.png', '192x192'),
      ...icon('icon-512.png', '512x512'),
      ...icon('icon-maskable-512.png', '512x512', { purpose: 'maskable' }),
    ],
  }, null, 2) + '\n';
}

// Start page: a manifest only for its home screen shortcut (Android otherwise puts the icon on a white
// circle). display "browser" and no service worker: it opens as a normal tab and does not capture the
// apps below it, which are installed on their own.
function startManifest(p) {
  const m = JSON.parse(manifest(p));
  delete m.description_localized;
  return JSON.stringify({ ...m, description: '', display: 'browser', background_color: p.color }, null, 2) + '\n';
}

function filesIn(dir) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesIn(rel));
    else if (e.name !== 'LICENSE') out.push(rel);
  }
  return out;
}

// Scripts of the app itself: its page and every script in its folder (e.g. a worker)
const ownScripts = p => [p.file, ...filesIn(p.folder).filter(f => /\.m?js$/.test(f) && !f.endsWith('/sw.js'))];
// Shared scripts several apps use (assets/shared/<file>, e.g. the Piper voice engine): referenced literally
// as '../assets/shared/<file>' from the app's scripts – cached offline like the app's own files
function sharedOf(p) {
  const names = new Set();
  for (const f of ownScripts(p)) for (const m of read(f).matchAll(/\.\.\/assets\/shared\/([\w.-]+\.m?js)/g)) names.add(`assets/shared/${m[1]}`);
  for (const f of names) if (!existsSync(join(ROOT, f))) throw new Error(`${p.folder}: ${f} not found`);
  return [...names].sort();
}

// Vendor packages an app uses: referenced from its page, any script in its folder or a shared script it uses
function vendorsOf(p) {
  const texts = [...ownScripts(p), ...sharedOf(p)].map(read);
  const names = new Set();
  for (const t of texts) for (const m of t.matchAll(/\.\.\/assets\/vendor\/([^/"'`]+)\//g)) names.add(m[1]);
  return [...names].sort();
}

// Vendor references that would break offline use (rules: see vendorProblems in lib.mjs)
const appVendorProblems = p => vendorProblems(
  [...ownScripts(p), ...sharedOf(p)].map(f => ({ file: f, text: read(f) })),
  p.folder, Object.keys(VENDOR));

// Everything the app needs offline, as repo-relative paths
function precacheList(p) {
  // Every file of the app folder (page, manifest, icons, helper scripts) except the service worker itself
  // (the manifest is listed explicitly: on the very first build it does not exist on disk yet)
  // Only files that are published (no .md notes – they would 404 and break the installation)
  const own = new Set(filesIn(p.folder).filter(f => f !== p.file && !f.endsWith('/sw.js') && (p.folder === 'template' || isPublished(f))));
  own.add(`${p.folder}/manifest.webmanifest`);
  const files = [p.file, ...[...own].sort()];
  files.push('assets/base.css', 'assets/common.js', ICON_SPRITE, ...sharedOf(p));
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
  // The sprite counts only with the icons this app uses (see spriteSubset in lib.mjs). Icons come from the
  // full page (footer included) and every other cached text file outside assets/vendor/.
  const icons = new Set();
  for (const f of files) if (f !== ICON_SPRITE && !f.startsWith('assets/vendor/') && /\.(html|m?js|json)$/.test(f))
    for (const n of iconsIn(read(f) ?? '')) icons.add(n);
  for (const f of files) hash.update(f).update(f === p.file ? withoutFooter(read(f))
    : f === ICON_SPRITE ? spriteSubset(read(f), icons) : readBytes(f));
  const version = hash.digest('hex').slice(0, 12);
  // Paths relative to the sw.js location (= app folder); "./" is the app start page
  const urls = ['./', ...files.map(f => posix.relative(p.folder, f))];
  return { version, code: `// Generated by scripts/build.mjs – do not edit.
// Offline cache for this app. VERSION is a hash of all cached files (of the icon sprite only the icons
// this app uses): every change creates a new version, the browser installs it in the background and removes the old one.
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
${p.shareAccept.length ? `// Share target: files shared to the installed app arrive as POST ./share-target (one or several).
// They are parked in a cache ("shared-file", "shared-file-1", …) and the page is opened with ?shared=1
// (Tools.takeSharedFiles() / Tools.takeSharedFile() pick them up).
const SHARE_URL = new URL('./share-target', self.location).href;
const SHARE_CACHE = \`share:\${APP}\`;
const SHARE_MAX = 100;
self.addEventListener('fetch', event => {
  if (event.request.method !== 'POST' || event.request.url.split('?')[0] !== SHARE_URL) return;
  event.respondWith((async () => {
    try {
      const form = await event.request.formData();
      const files = form.getAll('file').filter(f => f && typeof f !== 'string').slice(0, SHARE_MAX);
      if (files.length) {
        // Leftovers of an earlier share that was never picked up must not mix in
        await caches.delete(SHARE_CACHE);
        const cache = await caches.open(SHARE_CACHE);
        for (let i = 0; i < files.length; i++) {
          await cache.put(i ? \`shared-file-\${i}\` : 'shared-file', new Response(files[i], { headers: {
            'Content-Type': files[i].type || 'application/octet-stream',
            'X-File-Name': encodeURIComponent(files[i].name || 'geteilt'),
          } }));
        }
      }
    } catch (_) {}
    return Response.redirect(new URL('./?shared=1', self.location).href, 303);
  })());
});

` : ''}${p.features.includes('Benachrichtigung') ? `// Notifications (feature "Benachrichtigung"): a tap on one brings the open app to the front or opens it
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const start = new URL('./', self.location).href;
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = wins.find(c => c.url.startsWith(start));
    if (win) return win.focus();
    return self.clients.openWindow(start);
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
// The start page needs no link to itself. Language and appearance are in the menu ("Settings", common.js).
const footerFor = p => p.folder ? footer : footer.split('\n').filter(l => !l.includes('footer-home')).join('\n');
const dataBlock = readFileSync(join(ROOT, 'scripts/partials/data.html'), 'utf8').trim();
const agentBlock = readFileSync(join(ROOT, 'scripts/partials/help-agent.html'), 'utf8').trim();
const filesBlock = readFileSync(join(ROOT, 'scripts/partials/help-files.html'), 'utf8').trim();
const renderFiles = p => `\n  ${filesBlock.replace('{name}', () => escHtml(p.shortName)).replace('{nameEn}', () => escHtml(p.shortNameEn)).replaceAll('\n', '\n  ')}\n  `;
const vibrateBlock = readFileSync(join(ROOT, 'scripts/partials/help-vibrate.html'), 'utf8').trim();
const renderVibrate = () => `\n  ${vibrateBlock.replaceAll('\n', '\n  ')}\n  `;
// Apps that vibrate get the help section on vibration (Android drops short vibrations when "Haptic feedback"
// is off – see AGENTS.md). Their own scripts count, not shared ones.
const vibrates = p => ownScripts(p).some(f => /\b(Tools|navigator)\.vibrate\(/.test(read(f)));
function vibrateMarkers(p) {
  const html = read(p.file);
  if (html.includes('<!-- vibrate:start -->')) return;
  const at = html.includes('  <!-- agent:start -->') ? html.indexOf('  <!-- agent:start -->') : html.indexOf('  <h3 data-i18n="diag.h">');
  if (at < 0) throw new Error(`${p.file}: vibrates – needs <!-- vibrate:start --><!-- vibrate:end --> in the help (before "Fehlersuche")`);
  put(p.file, html.slice(0, at) + '  <!-- vibrate:start --><!-- vibrate:end -->\n' + html.slice(at));
}
const renderAgent = p => `\n  ${agentBlock.replace('{de}', () => escHtml(p.agentHelp)).replace('{en}', () => escHtml(p.agentHelpEn)).replaceAll('\n', '\n  ')}\n  `;
setBlock('index.html', 'tools', renderCards(), true);
setBlock('README.md', 'tools', renderTable(), true);
for (const p of pages) {
  setBlock(p.file, 'footer', `\n  ${footerFor(p).replaceAll('\n', '\n  ')}\n  `, false);
  if (!p.hidden) setBlock(p.file, 'head', renderHead(p), false);
  setBlock(p.file, 'data', isApp(p) && p.storage ? `\n${dataBlock}\n` : '\n', false);
  setBlock(p.file, 'files', isApp(p) && p.shareAccept.length ? renderFiles(p) : '', false);
  setBlock(p.file, 'agent', isApp(p) && p.webmcp.length ? renderAgent(p) : '', false);
  const vib = isApp(p) && vibrates(p);
  if (vib) vibrateMarkers(p);
  setBlock(p.file, 'vibrate', vib ? renderVibrate() : '', false);
}
for (const p of apps) {
  if (!p.storage) console.warn(`! ${p.file}: <meta name="tool:storage"> missing – no data backup section`);
}
const problems = apps.flatMap(appVendorProblems);
if (problems.length) {
  console.error(problems.map(x => `✗ ${x}`).join('\n'));
  process.exit(1);
}
// Manifests first: they are part of the cached files and therefore of the version hash
for (const p of apps) put(`${p.folder}/manifest.webmanifest`, manifest(p));
const start = pages.find(p => p.folder === '');
if (start) put('manifest.webmanifest', startManifest(start));
for (const p of apps) {
  const { version, code } = serviceWorker(p);
  put(`${p.folder}/sw.js`, code);
  setBlock(p.file, 'footer', `\n  ${footerFor(p).replaceAll('\n', '\n  ')}\n  <p class="footer-version">Version ${version}</p>\n  `, false);
}

// Third-party notices: every bundled library with version, licence and copyright (from its LICENSE)
function renderNotice() {
  const rows = [], extra = [];
  for (const [name, v] of Object.entries(VENDOR)) {
    const dir = `assets/vendor/${name}`;
    const lic = existsSync(join(ROOT, dir, 'LICENSE')) ? readFileSync(join(ROOT, dir, 'LICENSE'), 'utf8') : '';
    const owners = lic.split('\n').map(l => l.trim())
      .filter(l => /^Copyright\s+(\(c\)|©|\d{4}|[A-Z])/.test(l) && !/[[{]yyyy[\]}]/i.test(l) && l.length < 200);
    const pkg = v.homepage ? `[${escMd(name)}](${v.homepage})` : escMd(name);
    rows.push(`| ${pkg} (\`${v.package}\`) | ${v.version} | [${v.license}](${dir}/LICENSE) | ${escMd(owners.join('; ') || 'siehe Lizenztext')} | ${escMd(v.purpose || '')} |`);
    const more = readdirSync(join(ROOT, dir), { recursive: true }).map(f => String(f).replace(/\\/g, '/'))
      .filter(f => f !== 'LICENSE' && /(^|\/)(LICEN[CS]E|NOTICE|COPYING)[^/]*$/i.test(f) && statSync(join(ROOT, dir, f)).isFile()).sort();
    if (more.length) extra.push(`- **${name}:** ${more.map(f => `[${f}](${dir}/${f})`).join(', ')}`);
  }
  return `# Hinweise zu Fremdsoftware (Third-Party Notices)

Automatisch erzeugt von \`scripts/build.mjs\` aus \`scripts/vendor.json\` und den Lizenzdateien – nicht von Hand ändern.

Die Web-Tools selbst stehen unter der [MIT-Lizenz](LICENSE). Sie enthalten die folgenden Open-Source-Bibliotheken
(aus den npm-Paketen übernommen; Herkunft und Prüfsummen im SBOM [\`sbom.cdx.json\`](sbom.cdx.json)). Der vollständige Lizenztext liegt
neben jeder Bibliothek in \`assets/vendor/<name>/LICENSE\` und wird mit ihr ausgeliefert.

| Bibliothek | Version | Lizenz | Copyright | Verwendet für |
|---|---|---|---|---|
${rows.join('\n')}
${extra.length ? `\n## Weitere Lizenzdateien\n\nTeile einzelner Pakete stehen unter eigenen Lizenzen:\n\n${extra.join('\n')}\n` : ''}`;
}
put('NOTICE.md', renderNotice());
// SBOM: which app ships which library (same detection as the offline cache)
put(SBOM_FILE, renderSbom(VENDOR, tools.map(p => ({ folder: p.folder, title: p.title, vendors: vendorsOf(p) }))
  .sort((a, b) => a.folder.localeCompare(b.folder))));

// UI icon sprite: exactly the icons the pages use (written by scripts/build-icons.mjs --sprite, needs network)
{
  const used = usedIcons();
  const have = existsSync(join(ROOT, ICON_SPRITE)) ? spriteIcons(readFileSync(join(ROOT, ICON_SPRITE), 'utf8')) : new Set();
  const missing = [...used.keys()].filter(n => !have.has(n));
  const unused = [...have].filter(n => !used.has(n));
  if (missing.length || unused.length) {
    console.error(`${ICON_SPRITE} is outdated – run: node scripts/build-icons.mjs --sprite` +
      (missing.length ? `\n  missing: ${missing.map(n => `${n} (${[...used.get(n)].join(', ')})`).join('; ')}` : '') +
      (unused.length ? `\n  unused: ${unused.join(', ')}` : ''));
    process.exit(1);
  }
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
