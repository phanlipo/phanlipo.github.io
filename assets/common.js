/* Shared helpers for all tools. Exposes a single global: window.Tools */
window.Tools = (function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ---------- localStorage (never throws: private mode, blocked storage, quota) ---------- */
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (_) { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  /* ---------- UI ---------- */
  function toast(msg, ms) {
    let t = $('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status');
      document.body.append(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), ms || 1500);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); return true; } catch (_) {
      // Fallback for http:// or browsers without async clipboard
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }

  /* ---------- Languages: German (default) and English ----------
     German stays in the HTML. A page that is translated registers its English texts:
       Tools.i18n({ de: { dynamic texts }, en: { static + dynamic texts } })
     Static texts: data-i18n="key" (text), data-i18n-html="key" (markup from the dictionary),
     data-i18n-attr="aria-label:key; placeholder:key2". Their German comes from the HTML itself.
     Blocks per language (e.g. the help): <div data-lang="en" lang="en" hidden>…</div>.
     Title and home-screen name: <meta name="tool:title-en"> / <meta name="tool:short-name-en">.
     The choice is shared by all apps of the domain: localStorage "tools.lang.v1" – deliberately
     outside every app prefix, so it is not part of an app's backup and survives "Alle Daten löschen".
     Pages that are not translated yet stay German and do not show the language switch. */
  const LANGS = ['de', 'en'];
  const LANG_KEY = 'tools.lang.v1';
  const LOCALES = { de: 'de-DE', en: 'en-GB' };
  const dict = { de: {}, en: {} };
  let translated = false;
  let lang = 'de';

  // Shared texts: footer, language switch, data backup section, service worker hint
  Object.assign(dict.de, {
    'sw.updated': 'Update geladen – aktiv ab dem nächsten Öffnen',
    'data.saved': 'Sicherung gespeichert', 'data.loaded': 'Sicherung geladen', 'data.cleared': 'Daten gelöscht',
    'data.none': 'Noch keine gespeicherten Daten.', 'data.one': 'gespeicherter Eintrag', 'data.many': 'gespeicherte Einträge',
    'data.lt1kb': 'unter 1 KB', 'data.kb': 'ca. {n} KB', 'data.file': 'sicherung',
    'data.shareTitle': 'Sicherung: {title}', 'data.shareFail': 'Teilen nicht möglich – bitte „Sicherung speichern“ verwenden.',
    'data.tooBig': 'Die Datei ist zu groß.', 'data.noJson': 'Die Datei ist keine gültige JSON-Sicherung.',
    'data.unknownDate': 'unbekanntem Datum',
    'data.confirmLoad': 'Sicherung vom {when} mit {count} Einträgen laden?\nDie aktuellen Daten dieser App werden dabei ersetzt.',
    'data.confirmClear': 'Alle gespeicherten Daten dieser App (Einstellungen, Verlauf, Vorlagen …) löschen?\nTipp: vorher eine Sicherung speichern.',
    'data.errFormat': 'Keine gültige Sicherungsdatei.',
    'data.errNewer': 'Die Sicherung stammt aus einer neueren Version – bitte die Seite aktualisieren.',
    'data.errApp': 'Die Sicherung gehört zu „{app}“, nicht zu dieser App.',
    'data.errEmpty': 'Die Sicherung enthält keine Daten.',
    'data.errForeign': 'Die Sicherung enthält unbekannte Einträge und wurde nicht geladen.',
    'data.errWrite': 'Speichern nicht möglich (Speicher voll oder gesperrt).',
  });
  Object.assign(dict.en, {
    'sw.updated': 'Update loaded – active the next time you open the app',
    'lang.label': 'Language',
    'help.summary': 'Instructions & notes',
    'footer.home': 'All tools on phanlipo.github.io', 'footer.ai': 'AI-generated · no warranty', 'footer.licenses': 'Open source licences',
    'data.summary': 'Back up & transfer data',
    'data.intro': 'Settings and history of this app are stored in this browser only. A backup file keeps them safe or moves them to another device or into the installed app.',
    'data.export': 'Save backup', 'data.share': 'Share …', 'data.import': 'Load backup', 'data.clear': 'Delete all data',
    'data.saved': 'Backup saved', 'data.loaded': 'Backup loaded', 'data.cleared': 'Data deleted',
    'data.none': 'No saved data yet.', 'data.one': 'saved entry', 'data.many': 'saved entries',
    'data.lt1kb': 'less than 1 KB', 'data.kb': 'approx. {n} KB', 'data.file': 'backup',
    'data.shareTitle': 'Backup: {title}', 'data.shareFail': 'Sharing is not possible – please use “Save backup”.',
    'data.tooBig': 'The file is too large.', 'data.noJson': 'The file is not a valid JSON backup.',
    'data.unknownDate': 'an unknown date',
    'data.confirmLoad': 'Load the backup from {when} with {count} entries?\nThe current data of this app will be replaced.',
    'data.confirmClear': 'Delete all saved data of this app (settings, history, presets …)?\nTip: save a backup first.',
    'data.errFormat': 'Not a valid backup file.',
    'data.errNewer': 'The backup comes from a newer version – please update the page.',
    'data.errApp': 'The backup belongs to “{app}”, not to this app.',
    'data.errEmpty': 'The backup contains no data.',
    'data.errForeign': 'The backup contains unknown entries and was not loaded.',
    'data.errWrite': 'Saving is not possible (storage full or blocked).',
  });

  function t(key, vars) {
    let s = dict[lang][key];
    if (s == null) s = dict.de[key];
    if (s == null) s = key;
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  }
  const locale = () => LOCALES[lang];
  const metaContent = name => { const m = document.querySelector(`meta[name="${name}"]`); return m ? m.content : null; };

  // Order: ?lang= in the address → saved choice → browser languages → German
  function preferredLang() {
    const q = new URLSearchParams(location.search).get('lang');
    if (LANGS.includes(q)) return q;
    const saved = load(LANG_KEY, null);
    if (LANGS.includes(saved)) return saved;
    for (const l of navigator.languages || [navigator.language || '']) {
      const base = String(l).slice(0, 2).toLowerCase();
      if (LANGS.includes(base)) return base;
    }
    return 'de';
  }

  const attrPairs = el => el.dataset.i18nAttr.split(';').map(x => x.split(':').map(y => y.trim())).filter(x => x.length === 2 && x[0]);
  // Remembers the German original of static texts (taken from the HTML)
  function collectGerman(root) {
    root.querySelectorAll('[data-i18n]').forEach(el => { if (!(el.dataset.i18n in dict.de)) dict.de[el.dataset.i18n] = el.textContent; });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { if (!(el.dataset.i18nHtml in dict.de)) dict.de[el.dataset.i18nHtml] = el.innerHTML; });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      for (const [a, k] of attrPairs(el)) if (!(k in dict.de)) dict.de[k] = el.getAttribute(a) || '';
    });
    if (!('_title' in dict.de)) dict.de._title = document.title;
    const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (apple && !('_shortName' in dict.de)) dict.de._shortName = apple.content;
  }

  // Applies the current language to static texts below root (default: the whole page)
  function applyI18n(root) {
    root = root || document;
    collectGerman(root);
    root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => { for (const [a, k] of attrPairs(el)) el.setAttribute(a, t(k)); });
    root.querySelectorAll('[data-lang]').forEach(el => { el.hidden = el.dataset.lang !== lang; });
    if (root !== document) return;
    document.documentElement.lang = lang;
    document.title = (lang === 'en' && metaContent('tool:title-en')) || dict.de._title;
    const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (apple) apple.content = (lang === 'en' && metaContent('tool:short-name-en')) || dict.de._shortName;
    document.querySelectorAll('[data-set-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
  }

  function setLang(l, remember) {
    if (!LANGS.includes(l) || !translated) return;
    if (remember !== false) {
      save(LANG_KEY, l);
      // An explicit choice replaces ?lang= in the address
      const q = new URLSearchParams(location.search);
      if (q.has('lang')) { q.delete('lang'); const rest = q.toString(); history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash); }
    }
    if (l === lang) return;
    lang = l;
    applyI18n();
    document.dispatchEvent(new CustomEvent('tools:lang', { detail: lang }));
  }

  // Called by a translated page (before it renders anything dynamic)
  function i18n(pageDict) {
    for (const l of LANGS) Object.assign(dict[l], (pageDict && pageDict[l]) || {});
    translated = true;
    lang = preferredLang();
    applyI18n();
    document.querySelectorAll('.footer-lang').forEach(el => { el.hidden = false; });
  }
  // Static keys (German in the HTML or dictionary) without an English text – used by the tests
  function i18nMissing() {
    collectGerman(document);
    return Object.keys(dict.de).filter(k => !k.startsWith('_') && !(k in dict.en)).sort();
  }
  const onLang = fn => document.addEventListener('tools:lang', e => fn(e.detail));

  function setupLangSwitch() {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-set-lang]');
      if (b) setLang(b.dataset.setLang);
    });
    // Another tab or app of this domain changed the language
    window.addEventListener('storage', e => {
      if (e.key === LANG_KEY && translated) { const l = load(LANG_KEY, null); if (LANGS.includes(l)) setLang(l, false); }
    });
  }
  setupLangSwitch();

  /* ---------- Numbers (German or English format) ---------- */
  function fmt(x, digits) {
    const d = digits == null ? 2 : digits;
    return Number.isFinite(x)
      ? x.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d })
      : '–';
  }
  // Accepts "12,5", "12.5" and " 12 "; returns NaN for empty/invalid input
  function parseNum(s) {
    const t = String(s == null ? '' : s).trim().replace(/\s/g, '').replace(',', '.');
    return t === '' ? NaN : Number(t);
  }

  /* ---------- PWA: offline cache + automatic updates ----------
     Pages with <link rel="manifest"> register their generated sw.js (see scripts/build.mjs).
     A new version downloads in the background; the hint appears once it has taken over. */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !document.querySelector('link[rel="manifest"]')) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast(t('sw.updated'), 3500);
    });
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .catch(e => console.warn('Service Worker nicht registriert:', e));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerServiceWorker);
  else registerServiceWorker();

  /* ---------- Data backup: export / import / clear (standard for every app) ----------
     Each app declares the localStorage key prefixes it owns:
       <meta name="tool:storage" content="wuerfelMuenze.">        (several: comma-separated)
     The UI block (<details class="data">, generated from scripts/partials/data.html)
     is wired up automatically. Backup file format – see AGENTS.md "Daten sichern":
       { format: "phanlipo-tools-backup", formatVersion: 1, app, title, exportedAt,
         data: { "<key>": "<raw localStorage string>", … } }                          */
  const BACKUP_FORMAT = 'phanlipo-tools-backup';
  const BACKUP_VERSION = 1;
  const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  function storagePrefixes() {
    const m = document.querySelector('meta[name="tool:storage"]');
    return m ? m.content.split(',').map(s => s.trim()).filter(Boolean) : [];
  }
  // App id = folder name, e.g. "/dice-coin/" or "/dice-coin/index.html" -> "dice-coin"
  function appId() {
    return location.pathname.replace(/index\.html$/, '').split('/').filter(Boolean).pop() || 'start';
  }
  const ownsKey = k => storagePrefixes().some(p => k.startsWith(p));
  function ownKeys() {
    const keys = [];
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (ownsKey(k)) keys.push(k); } } catch (_) {}
    return keys.sort();
  }

  function exportData() {
    const data = {};
    for (const k of ownKeys()) data[k] = localStorage.getItem(k);
    return { format: BACKUP_FORMAT, formatVersion: BACKUP_VERSION, app: appId(), title: document.title,
      exportedAt: new Date().toISOString(), data };
  }
  function backupFile() {
    const day = new Date().toISOString().slice(0, 10);
    return new File([JSON.stringify(exportData(), null, 2) + '\n'], `${appId()}-${t('data.file')}-${day}.json`, { type: 'application/json' });
  }

  // Throws an Error with a message in the page language if the parsed backup does not fit this app
  function validateBackup(backup) {
    if (!backup || backup.format !== BACKUP_FORMAT) throw new Error(t('data.errFormat'));
    if (!Number.isInteger(backup.formatVersion) || backup.formatVersion > BACKUP_VERSION)
      throw new Error(t('data.errNewer'));
    if (backup.app !== appId())
      throw new Error(t('data.errApp', { app: backup.title || backup.app }));
    const data = backup.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(t('data.errEmpty'));
    const entries = Object.entries(data);
    const foreign = entries.filter(([k, v]) => !ownsKey(k) || typeof v !== 'string');
    if (foreign.length) throw new Error(t('data.errForeign'));
    return entries;
  }

  // Replaces this app's data with the backup (validated first). Returns the number of entries.
  function importData(backup) {
    const entries = validateBackup(backup);
    const before = ownKeys().map(k => [k, localStorage.getItem(k)]);
    try {
      clearData();
      for (const [k, v] of entries) localStorage.setItem(k, v);
    } catch (e) {
      // Roll back to the previous state (e.g. storage full)
      clearData();
      for (const [k, v] of before) { try { localStorage.setItem(k, v); } catch (_) {} }
      throw new Error(t('data.errWrite'));
    }
    return entries.length;
  }
  function clearData() {
    for (const k of ownKeys()) remove(k);
  }

  function downloadFile(file) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = file.name;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function setupDataUi() {
    const box = document.querySelector('details.data');
    if (!box) return;
    const btn = name => box.querySelector(`[data-data="${name}"]`);
    const info = btn('info');
    const showInfo = (text, kind) => { info.textContent = text; info.className = 'data-info' + (kind ? ' ' + kind : ''); };
    const summary = () => {
      const keys = ownKeys();
      const bytes = keys.reduce((n, k) => n + k.length + (localStorage.getItem(k) || '').length, 0) * 2;
      const size = bytes < 1024 ? t('data.lt1kb') : t('data.kb', { n: fmt(bytes / 1024, 0) });
      showInfo(keys.length ? `${keys.length} ${t(keys.length === 1 ? 'data.one' : 'data.many')} · ${size}` : t('data.none'));
    };
    box.addEventListener('toggle', () => { if (box.open) summary(); });

    btn('export').addEventListener('click', () => { downloadFile(backupFile()); toast(t('data.saved')); });

    const share = btn('share');
    try { share.hidden = !(navigator.canShare && navigator.canShare({ files: [backupFile()] })); } catch (_) { share.hidden = true; }
    share.addEventListener('click', async () => {
      try { await navigator.share({ files: [backupFile()], title: t('data.shareTitle', { title: document.title }) }); }
      catch (e) { if (e.name !== 'AbortError') showInfo(t('data.shareFail'), 'err'); }
    });

    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json'; input.hidden = true;
    box.append(input);
    btn('import').addEventListener('click', () => { input.value = ''; input.click(); });
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      let backup, count;
      try {
        if (file.size > MAX_IMPORT_BYTES) throw new Error(t('data.tooBig'));
        try { backup = JSON.parse(await file.text()); } catch (_) { throw new Error(t('data.noJson')); }
        count = validateBackup(backup).length;
      } catch (e) { showInfo(e.message, 'err'); return; }
      const d = new Date(backup.exportedAt), when = isNaN(d) ? t('data.unknownDate') : d.toLocaleString(locale());
      if (!confirm(t('data.confirmLoad', { when, count }))) return;
      try { importData(backup); } catch (e) { showInfo(e.message, 'err'); return; }
      toast(t('data.loaded'));
      setTimeout(() => location.reload(), 600);
    });

    btn('clear').addEventListener('click', () => {
      if (!confirm(t('data.confirmClear'))) return;
      clearData();
      toast(t('data.cleared'));
      setTimeout(() => location.reload(), 600);
    });
  }

  /* ---------- Share target (Android): file shared to the installed app ----------
     sw.js parks it in the cache "share:<app>" and opens the page with ?shared=1.
     Returns the File once (or null) and removes it from the cache and the URL. */
  async function takeSharedFile() {
    if (!/[?&]shared=1\b/.test(location.search) || !('caches' in window)) return null;
    history.replaceState(null, '', location.pathname + location.hash);
    try {
      const cache = await caches.open('share:' + appId());
      const res = await cache.match('shared-file');
      if (!res) return null;
      await cache.delete('shared-file');
      const name = decodeURIComponent(res.headers.get('X-File-Name') || 'geteilt');
      return new File([await res.blob()], name, { type: res.headers.get('Content-Type') || '' });
    } catch (_) { return null; }
  }

  // Link or text shared to the installed app (Android, <meta name="tool:share-text" content="true">):
  // the page opens as ./?title=…&text=…&url=…. Returns { title, text, url } (missing parts = '') or null,
  // and removes the parameters from the address bar so a reload does not repeat it.
  function takeSharedText() {
    const q = new URLSearchParams(location.search);
    if (!['title', 'text', 'url'].some(k => q.has(k))) return null;
    history.replaceState(null, '', location.pathname + location.hash);
    const r = { title: q.get('title') || '', text: q.get('text') || '', url: q.get('url') || '' };
    return r.title || r.text || r.url ? r : null;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupDataUi);
  else setupDataUi();

  /* ---------- WebMCP: app functions as tools for AI agents in the browser ----------
     Draft standard (W3C Web Machine Learning CG): document.modelContext.registerTool(tool, { signal }).
     Older drafts and polyfills use navigator.modelContext – both are supported. Without it: nothing happens.
     Tools.mcp.register({ name, title, description, inputSchema, execute, readOnly, label })
       name         short English snake_case name; the app id is put in front (dice_coin_roll_dice)
       description  English – what the tool does, what it returns
       inputSchema  JSON Schema (type object); the input is checked against it before execute runs
       execute      (input) => result (JSON-serialisable, English keys); throw an Error for problems
       readOnly     true if the tool only reads data (annotation readOnlyHint)
       label        key for Tools.t(): shown to the user as a toast when an agent runs the tool
     Never register destructive tools (delete data, load backups) or tools that use camera/microphone.
     Tools are only for this origin (no exposedTo). */
  const mcpTools = [];
  const modelContext = () => document.modelContext || navigator.modelContext || null;
  const mcpPrefix = () => appId().replace(/[^A-Za-z0-9]+/g, '_');
  Object.assign(dict.de, { 'mcp.used': 'KI-Agent: {action}' });
  Object.assign(dict.en, { 'mcp.used': 'AI agent: {action}' });

  // Small JSON Schema check (the subset the tools use): type, properties, required,
  // additionalProperties: false, enum, minimum, maximum, minLength, maxLength, items, maxItems
  function checkSchema(value, schema, path) {
    const where = path || 'input';
    const type = schema.type;
    const isInt = Number.isInteger(value);
    const ok = { object: value && typeof value === 'object' && !Array.isArray(value), array: Array.isArray(value),
      string: typeof value === 'string', number: typeof value === 'number' && Number.isFinite(value),
      integer: isInt, boolean: typeof value === 'boolean' };
    if (type && !ok[type]) throw new Error(`${where} must be of type ${type}`);
    if (schema.enum && !schema.enum.includes(value)) throw new Error(`${where} must be one of: ${schema.enum.join(', ')}`);
    if (typeof value === 'number') {
      if (schema.minimum != null && value < schema.minimum) throw new Error(`${where} must be >= ${schema.minimum}`);
      if (schema.maximum != null && value > schema.maximum) throw new Error(`${where} must be <= ${schema.maximum}`);
    }
    if (typeof value === 'string') {
      if (schema.minLength != null && value.length < schema.minLength) throw new Error(`${where} must have at least ${schema.minLength} characters`);
      if (schema.maxLength != null && value.length > schema.maxLength) throw new Error(`${where} must have at most ${schema.maxLength} characters`);
    }
    if (Array.isArray(value)) {
      if (schema.maxItems != null && value.length > schema.maxItems) throw new Error(`${where} must have at most ${schema.maxItems} items`);
      if (schema.items) value.forEach((v, i) => checkSchema(v, schema.items, `${where}[${i}]`));
    }
    if (type === 'object') {
      const props = schema.properties || {};
      for (const k of schema.required || []) if (!(k in value)) throw new Error(`${where}.${k} is required`);
      for (const [k, v] of Object.entries(value)) {
        if (props[k]) checkSchema(v, props[k], `${where}.${k}`);
        else if (schema.additionalProperties === false) throw new Error(`${where}.${k} is not allowed`);
      }
    }
  }

  function mcpRegister(def) {
    const name = `${mcpPrefix()}_${def.name}`;
    const schema = def.inputSchema || { type: 'object', properties: {}, additionalProperties: false };
    const tool = {
      name,
      title: def.title || def.name,
      description: def.description,
      inputSchema: schema,
      annotations: { readOnlyHint: !!def.readOnly },
      execute: async input => {
        const args = input == null ? {} : input;
        checkSchema(args, schema);
        const result = await def.execute(args);
        if (def.label) toast(t('mcp.used', { action: t(def.label) }), 2500);
        return result;
      },
    };
    mcpTools.push(tool);
    const mc = modelContext();
    if (!mc || typeof mc.registerTool !== 'function') return tool;
    const controller = new AbortController();
    tool.unregister = () => controller.abort();
    try {
      Promise.resolve(mc.registerTool(tool, { signal: controller.signal }))
        .catch(e => console.warn('WebMCP: Werkzeug nicht registriert:', name, e));
    } catch (e) { console.warn('WebMCP: Werkzeug nicht registriert:', name, e); }
    return tool;
  }

  return {
    $, load, save, remove, toast, esc, copyText, fmt, parseNum, takeSharedFile, takeSharedText,
    i18n, t, lang: () => lang, setLang, locale, onLang, applyI18n, i18nMissing, LANG_KEY,
    mcp: { register: mcpRegister, tools: () => mcpTools.slice(), available: () => !!modelContext(), checkSchema },
    data: { exportData, validateBackup, importData, clearData, keys: ownKeys, prefixes: storagePrefixes, appId },
  };
})();
