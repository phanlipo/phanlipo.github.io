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
  /* Toast: a short note at the bottom. toast(text, ms) or toast(text, { ms, action: { label, icon, run } }) –
     with an action (e.g. Tools.undo) the note carries a button and stays 6 s. */
  function toast(msg, opts) {
    const o = typeof opts === 'object' && opts ? opts : { ms: opts };
    let t = $('toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status');
      document.body.append(t);
    }
    // An open modal dialog (e.g. the menu) lies above the page – show the toast inside it so it stays visible
    let host = document.body;
    try { host = [...document.querySelectorAll('dialog:modal')].pop() || document.body; } catch (_) {}
    if (t.parentNode !== host) host.append(t);
    t.textContent = msg;
    t.classList.toggle('has-action', !!o.action);
    if (o.action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-action';
      b.innerHTML = (o.action.icon ? icon(o.action.icon) : '') + '<span></span>';
      b.lastChild.textContent = o.action.label;
      b.addEventListener('click', () => { t.classList.remove('show'); clearTimeout(toast._t); o.action.run(); }, { once: true });
      t.append(' ', b);
    }
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), o.ms || (o.action ? 6000 : 1500));
  }
  // Removed something at once instead of asking first: say so and offer to take it back
  function undo(msg, run) { toast(msg, { action: { label: t('ask.undo'), icon: 'arrow-back-up', run } }); }

  /* Questions in the app's own look instead of the browser's confirm()/prompt() (UI-KONZEPT.md):
       if (!await Tools.confirm(t('delQ', { name }), { action: 'delete' })) return;
       const url = await Tools.prompt(t('linkUrl'), { value: 'https://', type: 'url' });  // null = cancelled
     action names the confirm button: ok (default), delete, reset, leave, replace, load, download – delete, reset
     and leave are red. ok/cancel give own words instead. A bottom sheet on phones, a small window on wide screens;
     Escape and the back button of the dialog cancel. Fires "tools:ask" on document (tests answer it, helpers.mjs). */
  const ASK = {
    ok: ['check', 'ask.ok'], delete: ['trash', 'ask.delete', 1], reset: ['restore', 'ask.reset', 1], leave: ['logout', 'ask.leave', 1],
    replace: ['replace', 'ask.replace'], load: ['folder-open', 'ask.load'], download: ['download', 'ask.download'],
  };
  function ask(type, message, o) {
    o = o || {};
    return new Promise(resolve => {
      const [ic, key, danger] = ASK[o.action] || ASK.ok;
      const d = document.createElement('dialog');
      d.className = 'dialog tools-ask';
      d.innerHTML = '<form method="dialog"><div class="dialog-body"><p class="ask-text"></p></div><div class="dialog-actions">' +
        '<button type="submit" class="btn" value="">' + icon('x') + '<span></span></button>' +
        '<button type="submit" class="btn primary" value="ok">' + icon(ic) + '<span></span></button></div></form>';
      const text = d.querySelector('.ask-text'), [no, yes] = d.querySelectorAll('button');
      if (o.title) {
        const h = document.createElement('h2'); h.className = 'dialog-title'; h.textContent = o.title; h.id = 'toolsAskH';
        d.querySelector('.dialog-body').prepend(h); d.setAttribute('aria-labelledby', 'toolsAskH');
      } else d.setAttribute('aria-label', message.split('\n')[0]);
      text.textContent = message; text.id = 'toolsAskText'; d.setAttribute('aria-describedby', 'toolsAskText');
      no.lastChild.textContent = o.cancel || t('ask.cancel');
      yes.lastChild.textContent = o.ok || t(key);
      if (danger && !o.ok) yes.classList.add('danger');
      let input = null;
      if (type === 'prompt') {
        input = document.createElement('input');
        input.type = o.type || 'text'; input.value = o.value == null ? '' : String(o.value);
        input.className = 'ask-input'; input.autocomplete = 'off'; input.setAttribute('aria-labelledby', 'toolsAskText');
        if (o.maxlength) input.maxLength = o.maxlength;
        // Enter confirms (the form's first button is Cancel, which implicit submission would take)
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); d.close('ok'); } });
        text.after(input);
      }
      (document.querySelector('dialog:modal') ? [...document.querySelectorAll('dialog:modal')].pop() : document.body).append(d);
      d.addEventListener('close', () => {
        const ok = d.returnValue === 'ok';
        d.remove();
        resolve(type === 'prompt' ? (ok ? input.value : null) : ok);
      }, { once: true });
      d.showModal();
      (input || (danger ? no : yes)).focus();
      if (input) input.select();
      document.dispatchEvent(new CustomEvent('tools:ask', { detail: { type, message, value: input ? input.value : '', dialog: d } }));
    });
  }
  const confirmAsk = (message, o) => ask('confirm', message, o);
  const promptAsk = (message, o) => ask('prompt', message, o);

  // Own dialogs (<dialog class="dialog">): buttons with data-close close them, a tap on the dim backdrop too
  document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('dialog.dialog [data-close]');
    if (c) { c.closest('dialog').close(); return; }
    if (e.target.matches && e.target.matches('dialog.dialog:not(.tools-ask):not([data-keep])[open]')) {
      const r = e.target.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) e.target.close();
    }
  });

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Icons: Tabler Outline from the shared sprite (assets/icons.svg, see UI-KONZEPT.md) ----------
     Tools.icon('download') → <svg class="ic" aria-hidden="true"><use href=".../assets/icons.svg#download"/></svg>
     Decorative: the button around it carries the text or aria-label. Write the name literally (as in
     Tools.icon('download')) – scripts/build-icons.mjs --sprite only puts literally written names into the sprite.
     Second argument: extra classes, e.g. 'filled'. In HTML: <svg class="ic" aria-hidden="true"><use href="../assets/icons.svg#download"/></svg> */
  const ICON_URL = (() => {
    try { return new URL('icons.svg', document.currentScript.src).href; } catch (_) { return '../assets/icons.svg'; }
  })();
  function icon(name, cls) {
    return `<svg class="ic${cls ? ' ' + esc(cls) : ''}" aria-hidden="true" focusable="false"><use href="${ICON_URL}#${esc(name)}"/></svg>`;
  }

  async function copyText(txt) {
    try { await navigator.clipboard.writeText(txt); return true; } catch (_) {
      // Fallback for http:// or browsers without async clipboard
      // Inside an open modal dialog (menu) the rest of the page is inert – the textarea must go into the dialog
      const ta = document.createElement('textarea');
      ta.value = txt; ta.readOnly = true; ta.style.position = 'fixed'; ta.style.opacity = '0';
      (document.querySelector('dialog[open]') || document.body).appendChild(ta); ta.focus(); ta.select();
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
    'sw.updated': 'Neue Version geladen – oben ↻ tippen zum Aktualisieren',
    'sw.reload': 'Neu laden – neue Version',
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
    'diag.copied': 'Diagnose kopiert', 'diag.fail': 'Kopieren nicht möglich',
    'ask.ok': 'OK', 'ask.cancel': 'Abbrechen', 'ask.delete': 'Löschen', 'ask.reset': 'Zurücksetzen', 'ask.leave': 'Verlassen',
    'ask.replace': 'Ersetzen', 'ask.load': 'Laden', 'ask.download': 'Herunterladen', 'ask.undo': 'Rückgängig',
    'lang.label': 'Sprache', 'settings.h': 'Einstellungen', 'settings.general': 'Allgemein',
    'theme.label': 'Darstellung', 'theme.light': 'Hell', 'theme.dark': 'Dunkel', 'theme.system': 'System',
  });
  Object.assign(dict.en, {
    'sw.updated': 'New version loaded – tap ↻ at the top to update',
    'sw.reload': 'Reload – new version',
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
    'diag.h': 'Troubleshooting',
    'diag.intro': 'Something does not work? First make the problem happen, then copy the diagnostics and pass them on. They contain the browser, app version, state and a log of the last steps – nothing you entered.',
    'diag.copy': 'Copy diagnostics', 'diag.copied': 'Diagnostics copied', 'diag.fail': 'Copying not possible',
    'ask.ok': 'OK', 'ask.cancel': 'Cancel', 'ask.delete': 'Delete', 'ask.reset': 'Reset', 'ask.leave': 'Leave',
    'ask.replace': 'Replace', 'ask.load': 'Load', 'ask.download': 'Download', 'ask.undo': 'Undo',
    'settings.h': 'Settings', 'settings.general': 'General',
    'theme.label': 'Appearance', 'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.system': 'System',
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
    document.querySelectorAll('.lang-switch').forEach(el => { el.hidden = false; });
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

  /* ---------- Appearance: light, dark or like the system ----------
     The choice is shared by all apps of the domain like the language: localStorage "tools.theme.v1"
     ("light" | "dark"; missing = like the system). Pages keep writing their dark colours as
     @media (prefers-color-scheme: dark){…} – with a fixed choice, common.js rewrites the condition of those rules
     in every style sheet of the page (CSSOM), so no page needs its own theme CSS. <html data-theme="…"> and
     <meta name="color-scheme"> follow (form controls, scroll bars). JS that needs the current look asks
     Tools.theme.dark() and listens with Tools.theme.onChange(fn) instead of matchMedia. */
  const THEMES = ['light', 'dark', 'system'];
  const THEME_KEY = 'tools.theme.v1';
  const MQ_SCHEME = /\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)/gi;
  const mqOriginal = new WeakMap();
  const systemDark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; } };
  const themeChoice = () => { const v = load(THEME_KEY, null); return v === 'light' || v === 'dark' ? v : 'system'; };
  const themeDark = () => { const c = themeChoice(); return c === 'system' ? systemDark() : c === 'dark'; };
  let themeApplied = null;

  function themeRules(rules, forced) {
    for (const r of rules) {
      if (r.media && r.cssRules) {
        let orig = mqOriginal.get(r);
        if (orig == null) { orig = r.media.mediaText; mqOriginal.set(r, orig); }
        if (MQ_SCHEME.test(orig)) {
          MQ_SCHEME.lastIndex = 0;
          // Always true resp. always false (a negative width never matches; older browsers: invalid = false)
          const text = forced === 'system' ? orig : orig.replace(MQ_SCHEME, (m, v) => (v.toLowerCase() === forced ? '(min-width: 0px)' : '(max-width: -1px)'));
          if (r.media.mediaText !== text) r.media.mediaText = text;
        }
        MQ_SCHEME.lastIndex = 0;
      }
      if (r.cssRules) themeRules(r.cssRules, forced);
    }
  }
  function applyTheme() {
    const choice = themeChoice();
    for (const s of document.styleSheets) {
      let rules = null;
      try { rules = s.cssRules; } catch (_) { /* style sheet of another origin */ }
      if (rules) themeRules(rules, choice);
    }
    const root = document.documentElement;
    if (choice === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = choice;
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) meta.content = choice === 'system' ? 'light dark' : choice;
    document.querySelectorAll('[data-set-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setTheme === choice)));
    const dark = themeDark();
    if (themeApplied !== null && themeApplied !== dark) document.dispatchEvent(new CustomEvent('tools:theme', { detail: dark ? 'dark' : 'light' }));
    themeApplied = dark;
  }
  function setTheme(v) {
    if (!THEMES.includes(v)) return;
    if (v === 'system') remove(THEME_KEY); else save(THEME_KEY, v);
    diagLog('theme: ' + v);
    applyTheme();
  }
  const onTheme = fn => document.addEventListener('tools:theme', e => fn(e.detail));
  function setupTheme() {
    applyTheme();
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-set-theme]');
      if (b) setTheme(b.dataset.setTheme);
    });
    // Another tab or app of this domain changed the choice
    window.addEventListener('storage', e => { if (e.key === THEME_KEY || e.key === null) applyTheme(); });
    try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()); } catch (_) { /* old browsers */ }
    // Style sheets parsed or loaded later (<style> after this script, late <link>)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyTheme);
    window.addEventListener('load', applyTheme);
  }
  setupTheme();

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

  /* ---------- Small helpers many apps need (one implementation instead of a copy per app) ----------
       Tools.randomInt(n)          uniform whole number 0 … n-1 (crypto.getRandomValues, no modulo bias)
       Tools.random()              uniform number in [0, 1) (crypto.getRandomValues)
       Tools.uid(prefix = '')      unique id: prefix + time in base 36 (sorts by creation) + 6 random characters
       Tools.clamp(v, lo, hi)      v limited to lo … hi
       Tools.reducedMotion()       the user asked for less motion (prefers-reduced-motion) – skip or shorten animations
       Tools.canShareFile(name, type)  the device can share such a file with other apps (Web Share with files)
       Tools.download(file, name)  saves a File/Blob under name (default file.name) via a temporary link
       Tools.canvasBlob(canvas, type = 'image/png', quality)  picture of a canvas as a Blob (null if empty) – use it
                                   instead of canvas.toBlob() / OffscreenCanvas.convertToBlob(): Chrome encodes those
                                   only in idle time of the page, which on a busy page (or in tests) comes seconds
                                   late or never. This encodes at once; the Blob's type is the one the browser really
                                   wrote (e.g. PNG where it cannot do WebP), like toBlob().
       Tools.undoKeys({ undo, redo })  computer keys for the app's undo/redo: Ctrl/⌘+Z → undo, Ctrl/⌘+Shift+Z and
                                   Ctrl+Y → redo. undo/redo are the app's buttons (clicked only while shown and
                                   enabled, they get aria-keyshortcuts) or functions. Not in text fields (they keep
                                   their own undo) and not while a dialog or the menu is open. */
  function randomInt(n) {
    const a = new Uint32Array(1), lim = Math.floor(0x100000000 / n) * n;
    do crypto.getRandomValues(a); while (a[0] >= lim);
    return a[0] % n;
  }
  function random() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 0x100000000; }
  const uid = (prefix = '') => prefix + Date.now().toString(36) + Array.from({ length: 6 }, () => randomInt(36).toString(36)).join('');
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const reducedMotion = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  const shareCache = new Map();
  function canShareFile(name, type) {
    const key = name + '|' + type;
    if (!shareCache.has(key)) {
      let ok = false;
      try { ok = !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], name, { type })] })); } catch (_) {}
      shareCache.set(key, ok);
    }
    return shareCache.get(key);
  }

  /* ---------- Sound (Web Audio): one context per page ----------
     Browsers only play sound after a tap; iPhones also suspend the context when the app was in the background.
       Tools.audio.context()  → the page's AudioContext (created on first use), null without Web Audio
       Tools.audio.unlock()   call in a tap/click handler: creates the context and resumes it → context or null
       Tools.audio.ready()    context exists and runs – only then sounds are audible
       Tools.audio.tone({ freq, to, ms, type, vol, at, attack })   short synthesised sound, silent when not ready:
         freq Hz (to: glide to this frequency), ms length, type 'sine'|'square'|'triangle'|'sawtooth', vol 0…1,
         at = start in seconds from now, attack = fade-in in seconds (0: starts at full volume) */
  let audioCtx = null;
  function audioContext() {
    if (audioCtx) return audioCtx;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) { diagLog('no AudioContext'); return null; }
    try { audioCtx = new C(); diagLog('audio context created', { state: audioCtx.state, rate: audioCtx.sampleRate }); }
    catch (e) { diagLog('audio context failed', e); audioCtx = null; }
    return audioCtx;
  }
  function audioUnlock() {
    const c = audioContext();
    if (c && c.state !== 'running') c.resume().then(() => diagLog('audio resumed', { state: c.state }), e => diagLog('audio resume failed', e));
    return c;
  }
  const audioReady = () => !!audioCtx && audioCtx.state === 'running';
  function tone({ freq = 440, to = freq, ms = 120, type = 'sine', vol = 0.25, at = 0, attack = 0 } = {}) {
    if (!audioReady()) return;
    try {
      const c = audioCtx, t0 = c.currentTime + at, d = ms / 1000, o = c.createOscillator(), g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t0 + d);
      if (attack > 0) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); }
      else g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + d + 0.02);
    } catch (e) { diagLog('tone failed', e); }
  }

  /* ---------- Keep the screen on (Screen Wake Lock API) ----------
     While at least one reason holds it, the screen stays on; the browser drops the lock whenever the page is hidden,
     so it is asked for again when the page becomes visible. Without the API nothing happens (iPhone before iOS 16.4 …).
       Tools.wakeLock.hold(reason = 'app')     e.g. 'game', 'playing', 'listening'
       Tools.wakeLock.release(reason = 'app')  the screen may turn off again once no reason is left
       Tools.wakeLock.active() → screen is being kept on now; .supported(); .reasons() → [reasons] */
  const wakeReasons = new Set();
  let wakeSentinel = null, wakePending = false;
  const wakeSupported = () => { try { return 'wakeLock' in navigator; } catch (_) { return false; } };
  async function wakeAcquire() {
    if (!wakeReasons.size || wakeSentinel || wakePending || !wakeSupported() || document.visibilityState !== 'visible') return;
    wakePending = true;
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!wakeReasons.size) { s.release().catch(() => {}); return; }
      wakeSentinel = s;
      s.addEventListener('release', () => { if (wakeSentinel === s) wakeSentinel = null; });
      diagLog('wake lock on', [...wakeReasons].join(', '));
    } catch (e) { diagLog('wake lock failed', e); } finally { wakePending = false; }
  }
  function wakeHold(reason = 'app') { wakeReasons.add(reason); return wakeAcquire(); }
  function wakeRelease(reason = 'app') {
    wakeReasons.delete(reason);
    if (wakeReasons.size || !wakeSentinel) return;
    const s = wakeSentinel; wakeSentinel = null;
    s.release().catch(() => {});
    diagLog('wake lock off');
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeAcquire(); });

  /* ---------- PWA: offline cache + automatic updates ----------
     Pages with <link rel="manifest"> register their generated sw.js (see scripts/build.mjs) – not the start
     page (data-no-sw): its manifest only gives the home screen icon, a service worker there would sit above every app.
     A new version downloads in the background and takes over at once (skipWaiting + clients.claim in sw.js).
     The page itself still runs the old version: a hint appears and a reload button (↻) next to the menu button,
     so an installed app does not have to be closed and opened again.
     An installed app that comes back from the background does not navigate, so it checks for updates itself
     (at most every 10 minutes). */
  let updateReady = false, updateBtn = null, fitTitle = () => {};
  function showUpdate() {
    updateReady = true;
    if (updateBtn) updateBtn.hidden = false;
    document.body.classList.add('update-ready');
    fitTitle();
  }
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !document.querySelector('link[rel="manifest"]:not([data-no-sw])')) return;
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || updateReady) return;
      diagLog('update: new version active, reload offered');
      showUpdate();
      toast(t('sw.updated'), 5000);
    });
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then(reg => {
        let lastCheck = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.hidden || updateReady || Date.now() - lastCheck < 10 * 60e3) return;
          lastCheck = Date.now();
          reg.update().catch(() => {});
        });
      })
      .catch(e => console.warn('Service Worker nicht registriert:', e));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerServiceWorker);
  else registerServiceWorker();

  /* ---------- Recently used (start page) ----------
     Every listed app notes its folder in "tools.recent.v1" (newest first, at most 12), read by the start page
     for its row "Zuletzt benutzt". Shared by all apps like language and appearance, only in this browser,
     not part of any app's backup. The favourites ("tools.favorites.v1") are set on the start page. */
  const RECENT_KEY = 'tools.recent.v1';
  function noteRecent() {
    const id = appId();
    if (id === 'start' || id === 'template' || !document.querySelector('details.help')
      || document.querySelector('meta[name="tool:hidden"][content="true"]')) return;
    const list = load(RECENT_KEY, []);
    save(RECENT_KEY, [id, ...(Array.isArray(list) ? list : []).filter(x => typeof x === 'string' && x !== id)].slice(0, 12));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', noteRecent);
  else noteRecent();

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
    // Files an app keeps on the device (Tools.keep, Cache Storage "file:<app>")
    keepClear();
  }

  // Encodes at once via toDataURL (an OffscreenCanvas is drawn onto a page canvas first); falls back to toBlob()
  // where that fails (e.g. a canvas too large for a data URL)
  async function canvasBlob(canvas, type = 'image/png', quality) {
    if (!canvas || !canvas.width || !canvas.height) return null;
    let src = canvas;
    if (!src.toDataURL) {
      src = document.createElement('canvas');
      src.width = canvas.width; src.height = canvas.height;
      src.getContext('2d').drawImage(canvas, 0, 0);
    }
    try {
      const url = src.toDataURL(type, quality), comma = url.indexOf(',');
      const mime = /^data:([^;,]+)/.exec(url);
      if (mime && comma > 0 && comma < url.length - 1) {
        const b64 = url.slice(comma + 1);
        let bytes;
        if (Uint8Array.fromBase64) bytes = Uint8Array.fromBase64(b64);
        else { const bin = atob(b64); bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
        return new Blob([bytes], { type: mime[1] });
      }
    } catch (e) { diagLog('canvasBlob: toDataURL failed, using toBlob', e); }
    if (src.toBlob) return new Promise(res => { try { src.toBlob(res, type, quality); } catch (_) { res(null); } });   // eslint-disable-line no-restricted-syntax
    return null;
  }

  // Keyboard undo/redo (computers, UI-KONZEPT.md 4c). Buttons are clicked only while shown and enabled, so the
  // keys follow the same state as the screen. Text fields keep their own undo; nothing while a dialog is open.
  const KEYS_UNDO = 'Control+Z Meta+Z', KEYS_REDO = 'Control+Shift+Z Meta+Shift+Z Control+Y';
  function undoKeys(opt = {}) {
    const run = x => {
      if (!x) return false;
      if (typeof x === 'function') { x(); return true; }
      if (x.disabled || x.hidden || !x.isConnected || !x.getClientRects().length) return false;
      x.click(); return true;
    };
    if (opt.undo && opt.undo.setAttribute) opt.undo.setAttribute('aria-keyshortcuts', KEYS_UNDO);
    if (opt.redo && opt.redo.setAttribute) opt.redo.setAttribute('aria-keyshortcuts', KEYS_REDO);
    document.addEventListener('keydown', e => {
      if (e.defaultPrevented || e.isComposing || e.altKey || !(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const which = k === 'z' ? (e.shiftKey ? 'redo' : 'undo') : k === 'y' && e.ctrlKey && !e.metaKey && !e.shiftKey ? 'redo' : null;
      if (!which) return;
      const t = e.target;
      if (t && t.closest && t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      if (document.querySelector('dialog[open]')) return;
      if (run(opt[which])) { e.preventDefault(); diagLog('keys: ' + which); }
    });
  }

  function downloadFile(file, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name || file.name || 'download';
    document.body.append(a); a.click();
    // Some browsers read the file only after click() returns – keep the link alive a while
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
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
      if (!await confirmAsk(t('data.confirmLoad', { when, count }), { action: 'load' })) return;
      try { importData(backup); } catch (e) { showInfo(e.message, 'err'); return; }
      toast(t('data.loaded'));
      setTimeout(() => location.reload(), 600);
    });

    btn('clear').addEventListener('click', async () => {
      if (!await confirmAsk(t('data.confirmClear'), { action: 'delete' })) return;
      clearData();
      toast(t('data.cleared'));
      setTimeout(() => location.reload(), 600);
    });
  }

  /* ---------- Files shared to or opened with the installed app ----------
     Share target (Android, Edge on Windows): sw.js parks the files in the cache "share:<app>" ("shared-file",
     "shared-file-1", …) and opens the page with ?shared=1.
     File handling (Chrome/Edge on Windows and other desktops, "Open with"): the manifest's file_handlers open
     the page with ?opened=1 and the browser hands the files over through window.launchQueue.
     takeSharedFiles() returns them once, in the order given (or []), and removes them from the cache and the
     URL. takeSharedFile() returns only the first one (or null) – for apps that take one file.
     fileHandle(file) returns the FileSystemFileHandle a file opened with the app came from (or null) – with it
     the app can write back into the same file (File System Access API, see markdown-editor). */
  const SHARE_MAX = 100;
  let launchFiles = null;
  const launchHandles = new WeakMap();
  const fileHandle = file => (file && launchHandles.get(file)) || null;
  const launched = /[?&]opened=1\b/.test(location.search);
  if (launched && 'launchQueue' in window) {
    launchFiles = new Promise(resolve => {
      // The browser calls the consumer once per launch; without files (or never) the page gets none
      setTimeout(() => resolve([]), 5000);
      try {
        window.launchQueue.setConsumer(async params => {
          const handles = (params && params.files || []).slice(0, SHARE_MAX);
          const files = [];
          for (const h of handles) {
            try { const f = await h.getFile(); launchHandles.set(f, h); files.push(f); } catch (e) { diagLog('launch file: ' + (e && e.name || e)); }
          }
          diagLog('opened with app: ' + files.length + ' file(s)');
          resolve(files);
        });
      } catch (e) { setTimeout(() => diagLog('launchQueue: ' + (e && e.message || e))); resolve([]); }
    });
  }
  async function takeSharedFiles() {
    if (launched) {
      history.replaceState(history.state, '', location.pathname + location.hash);
      if (!launchFiles) return [];
      const files = await launchFiles;
      launchFiles = null;
      return files;
    }
    if (!/[?&]shared=1\b/.test(location.search) || !('caches' in window)) return [];
    history.replaceState(null, '', location.pathname + location.hash);
    try {
      const cache = await caches.open('share:' + appId());
      const files = [];
      for (let i = 0; ; i++) {
        const key = i ? `shared-file-${i}` : 'shared-file';
        const res = await cache.match(key);
        if (!res) break;
        const name = decodeURIComponent(res.headers.get('X-File-Name') || 'geteilt');
        files.push(new File([await res.blob()], name, { type: res.headers.get('Content-Type') || '' }));
      }
      await caches.delete('share:' + appId());
      return files;
    } catch (_) { return []; }
  }
  async function takeSharedFile() {
    return (await takeSharedFiles())[0] || null;
  }

  /* Hand files over to another app of this site ("Open in PDF bearbeiten", "Convert to Word" …): parks them the way
     the share target does (cache "share:<app>", the same keys under that app's address) and opens that app with
     ?shared=1 – it takes them with takeSharedFile(s)() like a shared file. Everything stays on the device.
     handOff('pdf-edit', file | [files]) → false if it is not possible (no Cache Storage), otherwise the page leaves. */
  async function handOff(app, files) {
    files = [].concat(files || []).filter(Boolean).slice(0, SHARE_MAX);
    if (!/^[a-z0-9-]+$/.test(String(app)) || !files.length || !('caches' in window)) return false;
    try {
      const name = 'share:' + app;
      await caches.delete(name);                    // leftovers of an earlier hand-over must not mix in
      const cache = await caches.open(name);
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        await cache.put(new URL(`../${app}/${i ? `shared-file-${i}` : 'shared-file'}`, location.href).href, new Response(f, { headers: {
          'Content-Type': f.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(f.name || 'datei'),
        } }));
      }
      diagLog('hand off', { to: app, files: files.length });
      location.assign(new URL(`../${app}/?shared=1`, location.href).href);
      return true;
    } catch (e) { diagLog('hand off failed', e); return false; }
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

  /* ---------- App shortcuts and badge ----------
     Tools.shortcut()   action of the app shortcut the app was started with (long press on the installed app's icon,
                        <meta name="tool:shortcuts"> – manifest from scripts/build.mjs), or null. The page opens as
                        ./?shortcut=<action>; the first call removes the parameter (a reload does not repeat it), every
                        call in the same page load returns the same action. Toolbox apps (assets/shared/toolbox.js)
                        open the tool of that name by themselves; other apps call it once at start and do the action.
     Tools.badge(n)     number on the app icon (Badging API), 0 = none. Installed apps on Windows/macOS/ChromeOS and on
                        iPhone/iPad (home screen, iOS 16.4+, only with notification permission); Android shows a dot for
                        notifications instead. Without support nothing happens – never the only place for information.
                        Tools.badge.supported() tells whether the browser has the API. */
  let shortcutAction;
  function shortcut() {
    if (shortcutAction !== undefined) return shortcutAction;
    const q = new URLSearchParams(location.search);
    const a = q.get('shortcut');
    shortcutAction = a && /^[a-z0-9-]{1,32}$/.test(a) ? a : null;
    if (q.has('shortcut')) {
      q.delete('shortcut');
      const rest = q.toString();
      history.replaceState(history.state, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
      diagLog('shortcut: ' + (shortcutAction || 'invalid'));
    }
    return shortcutAction;
  }

  /* ---------- Vibration ----------
     Tools.vibrate(pattern)  like navigator.vibrate: milliseconds, or [vibrate, pause, vibrate, …]; 0 stops.
                             Every vibration lasts at least VIBRATE_MIN ms: shorter ones (5–25 ms) are not felt on many
                             Android phones – the motor does not spin up. Returns false without support (iPhone/Safari,
                             Firefox on the computer) or when the browser refuses (no tap on the page yet).
                             Tools.vibrate(p, { min: 0 }) plays it as given – only for testing what can be felt (sensors). */
  const VIBRATE_MIN = 30;
  let vibrateRefused = false;
  function vibrate(p, opt = {}) {
    if (!('vibrate' in navigator)) return false;
    const min = typeof opt.min === 'number' ? opt.min : VIBRATE_MIN;
    const list = (Array.isArray(p) ? p : [p]).map((v, i) => {
      v = Math.max(0, Math.round(Number(v) || 0));
      return i % 2 === 0 && v > 0 ? Math.max(v, min) : v;
    });
    let ok = false;
    try { ok = navigator.vibrate(Array.isArray(p) ? list : list[0]); } catch (e) { diagLog('vibrate failed', e); return false; }
    if (!ok && !vibrateRefused) { vibrateRefused = true; diagLog('vibrate: refused by the browser'); }
    return ok;
  }

  let badgeCount = null;
  const badgeSupported = () => 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
  function badge(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    if (n === badgeCount) return;
    badgeCount = n;
    if (!badgeSupported()) return;
    try {
      Promise.resolve(n ? navigator.setAppBadge(n) : navigator.clearAppBadge())
        .then(() => diagLog('badge: ' + n), e => diagLog('badge failed', e));
    } catch (e) { diagLog('badge failed', e); }
  }
  badge.supported = badgeSupported;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupDataUi);
  else setupDataUi();

  /* ---------- App menu (every app) and stage layout ----------
     Every app (page with <details class="help">) and the start page (<body data-app-menu>) get a menu button (☰) at the right of its header. It opens a
     modal <dialog> – a bottom sheet on phones, a side panel on wide screens – laid out as a tool list (UI-KONZEPT.md):
       1. every element with data-menu, in page order: actions (<div class="menu-list">), app sections (cards)
       2. one list of standard sections: data backup, help, "install as app" – each a sub page
       3. the footer (links)
     Sections: data-icon="settings" (Tabler name) puts a Tabler icon in front of the section's summary or first heading.
     Sub pages: <details class="card" data-menu data-menu-page data-icon="history"><summary>Title</summary>…</details>
     shows as a row with › and, tapped, fills the sheet (summary = back row with ‹). One level only; the back
     button/gesture returns to the list first. Tools.menu.open('id') opens the menu at that sub page (or scrolls
     to that element). Without JavaScript all sections simply stay at the end of the page.
     The back button/gesture closes the menu instead of leaving the app. Tools.menu.open() / .close().
     <body class="stage"> (stage layout): the header (title, optional <div class="stage-actions"> with the quick
     actions as <button class="head-btn">) and <main> fill exactly the screen, the page does not scroll. */
  Object.assign(dict.de, { 'menu.open': 'Menü', 'menu.title': 'Menü', 'menu.close': 'Menü schließen' });
  Object.assign(dict.en, { 'menu.open': 'Menu', 'menu.title': 'Menu', 'menu.close': 'Close menu' });
  const ICON_MENU = icon('menu-2'), ICON_CLOSE = icon('x'), ICON_RELOAD = icon('refresh');
  let menuEl = null, menuBtn = null, menuPushed = false, pagePushed = false, ignorePop = 0;

  const openPage = () => menuEl && menuEl.querySelector('details.menu-page[open]');
  function menuOpen(id) {
    if (!menuEl) return;
    if (!menuEl.open) {
      menuEl.showModal();
      menuBtn.setAttribute('aria-expanded', 'true');
      // An own history entry, so "back" closes the menu (with CloseWatcher the dialog closes itself, see 'close').
      // It keeps the current state, so pages with their own entries (e.g. sensors: tool view) see the same state.
      try { history.pushState(Object.assign({}, history.state, { toolsMenu: true }), ''); menuPushed = true; } catch (_) {}
      diagLog('menu opened');
    }
    const target = typeof id === 'string' && id ? document.getElementById(id) : null;
    if (target && menuEl.contains(target)) {
      const page = target.closest('details.menu-page');
      if (page) page.open = true;
      if (page !== target) target.scrollIntoView({ block: 'start' });
    }
  }
  function menuClose() { if (menuEl && menuEl.open) menuEl.close(); }

  // Icon in front of a section's summary/heading, chevrons for rows (› sub page, ⌄ folds open in place)
  function decorateSection(el, name) {
    if (!name || el.dataset.iconDone) return;
    el.dataset.iconDone = '1';
    const head = el.matches('details') ? el.querySelector(':scope>summary') : el.querySelector('h2,h3');
    if (!head) return;
    // The text goes into its own span (translations replace only that, not the icons)
    const label = document.createElement('span');
    label.className = 'menu-label';
    for (const a of ['data-i18n', 'data-i18n-html']) if (head.hasAttribute(a)) { label.setAttribute(a, head.getAttribute(a)); head.removeAttribute(a); }
    label.append(...head.childNodes);
    head.append(label);
    head.classList.add('menu-row');
    head.insertAdjacentHTML('afterbegin', `<span class="menu-ico">${icon(name)}</span>`);
    if (el.matches('details')) {
      head.insertAdjacentHTML('afterbegin', `<span class="menu-back">${icon('chevron-left')}</span>`);
      head.insertAdjacentHTML('beforeend', el.classList.contains('menu-page')
        ? `<span class="menu-chev">${icon('chevron-right')}</span>` : `<span class="menu-chev">${icon('chevron-down')}</span>`);
    }
  }

  /* ---------- "Install as app" (sub page at the end of the menu, every app) ----------
     Browsers show their own install hint only rarely (Chrome: engagement heuristics, after a dismissal not for
     months). So the menu offers installing at any time: with Chrome's prompt (beforeinstallprompt) where the browser
     offers it, otherwise the menu path of the browser (iPhone: Share → Add to Home Screen). Hidden in the installed
     app. Chrome's own banner is not suppressed (no preventDefault). */
  Object.assign(dict.de, {
    'appInstall.h': 'Als App installieren',
    'appInstall.text': 'Dann startet die App vom Startbildschirm wie eine normale App – auch offline.',
    'appInstall.btn': 'App installieren',
    'appInstall.ios': 'In Safari auf Teilen tippen → „Zum Home-Bildschirm“. Die installierte App hat eigenen Speicher – vorhandene Daten mit „Daten sichern & übertragen“ mitnehmen.',
    'appInstall.manual': 'Im Browser-Menü ⋮ „App installieren“ bzw. „Zum Startbildschirm hinzufügen“ wählen. Schon installiert? Dann die App vom Startbildschirm öffnen.',
    'appInstall.done': 'Installiert – die App jetzt vom Startbildschirm öffnen.',
  });
  Object.assign(dict.en, {
    'appInstall.h': 'Install as an app',
    'appInstall.text': 'The app then starts from your home screen like a normal app – offline too.',
    'appInstall.btn': 'Install app',
    'appInstall.ios': 'In Safari, tap Share → “Add to Home Screen”. The installed app has its own storage – take existing data along with “Back up & transfer data”.',
    'appInstall.manual': 'In the browser menu ⋮, choose “Install app” or “Add to Home screen”. Already installed? Then open the app from the home screen.',
    'appInstall.done': 'Installed – now open the app from the home screen.',
  });
  let installPrompt = null, installDone = false, installRender = () => {};
  window.addEventListener('beforeinstallprompt', e => { installPrompt = e; diagLog('install: prompt available'); installRender(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; installDone = true; diagLog('install: installed'); installRender(); });
  const isStandalone = () => navigator.standalone === true
    || ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'].some(m => matchMedia(`(display-mode: ${m})`).matches);
  const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

  function setupInstall() {
    if (!document.querySelector('link[rel="manifest"]')) return null;
    const el = document.createElement('details');
    el.className = 'card menu-install'; el.id = 'menuInstall';
    el.innerHTML = `<summary id="menuInstallTitle" data-i18n="appInstall.h">${esc(t('appInstall.h'))}</summary>`
      + `<p data-i18n="appInstall.text">${esc(t('appInstall.text'))}</p>`
      + `<button type="button" class="btn primary block" id="btnAppInstall" hidden>${icon('device-mobile-down')}<span data-i18n="appInstall.btn">${esc(t('appInstall.btn'))}</span></button>`
      + '<p class="muted" id="menuInstallInfo" role="status"></p>';
    const btn = el.querySelector('#btnAppInstall'), info = el.querySelector('#menuInstallInfo');
    installRender = () => {
      el.hidden = isStandalone();
      btn.hidden = !installPrompt || installDone;
      const key = installDone ? 'appInstall.done' : installPrompt ? '' : isIOS() ? 'appInstall.ios' : 'appInstall.manual';
      if (key) { info.dataset.i18n = key; info.textContent = t(key); }
      else { delete info.dataset.i18n; info.textContent = ''; }
    };
    btn.addEventListener('click', async () => {
      const e = installPrompt; if (!e) return;
      installPrompt = null;
      try {
        await e.prompt();
        const c = await e.userChoice;
        diagLog('install: choice', c && c.outcome);
        if (c && c.outcome === 'accepted') installDone = true;
      } catch (err) { diagLog('install: prompt failed:', err); }
      installRender();
    });
    try { matchMedia('(display-mode: standalone)').addEventListener('change', () => installRender()); } catch (_) {}
    installRender();
    return el;
  }

  /* Stage apps fill the screen with 100dvh. Chrome on Android sometimes keeps a too large dvh after a reload of
     the installed app (the area behind the navigation bar counts), so the bottom bar slides out of sight until
     the app is restarted. The real window height wins whenever it is smaller: --app-h (base.css). */
  function fitStage() {
    const b = document.body;
    if (!b || !b.classList.contains('stage')) return;
    const vv = window.visualViewport;
    const h = Math.round(Math.min(window.innerHeight, vv ? vv.height + vv.offsetTop : Infinity));
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;inset-block-start:0;height:100dvh;width:0;visibility:hidden;pointer-events:none';
    b.append(probe);
    const dvh = probe.getBoundingClientRect().height;
    probe.remove();
    if (h > 0 && dvh > h + 1) { b.style.setProperty('--app-h', h + 'px'); try { diagLog('stage: 100dvh ' + Math.round(dvh) + ' > window ' + h); } catch (_) {} }
    else b.style.removeProperty('--app-h');
  }
  function setupStageHeight() {
    fitStage();
    window.addEventListener('resize', fitStage);
    window.addEventListener('pageshow', fitStage);
    if (window.visualViewport) visualViewport.addEventListener('resize', fitStage);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupStageHeight);
  else setupStageHeight();

  /* ---------- Settings (every app) ----------
     Language and appearance are the same in every app: one block "General" with two .seg switches. It goes to the
     end of the app's own settings section (the [data-menu] element with data-icon="settings") – so every app has
     exactly one place "Settings" – or, without one, into its own sub page "Settings" at the top of the standard
     list. The language switch stays hidden on pages that are not translated (Tools.i18n shows it). */
  const THEME_ICONS = { light: icon('sun'), dark: icon('moon'), system: icon('sun-moon') };
  function settingsFields() {
    const f = document.createElement('div');
    f.className = 'menu-settings';
    const segBtn = (attr, v, label, extra) => `<button type="button" ${attr}="${v}" aria-pressed="false"${extra || ''}>${label}</button>`;
    f.innerHTML = `<fieldset class="seg-group lang-switch" id="menuLang"${translated ? '' : ' hidden'}><legend data-i18n="lang.label">${esc(t('lang.label'))}</legend><div class="seg">`
      + segBtn('data-set-lang', 'de', 'Deutsch', ' lang="de"') + segBtn('data-set-lang', 'en', 'English', ' lang="en"') + '</div></fieldset>'
      + `<fieldset class="seg-group" id="menuTheme"><legend data-i18n="theme.label">${esc(t('theme.label'))}</legend><div class="seg">`
      + THEMES.map(v => segBtn('data-set-theme', v, `${THEME_ICONS[v]}<span data-i18n="theme.${v}">${esc(t('theme.' + v))}</span>`)).join('')
      + '</div></fieldset>';
    f.querySelectorAll('[data-set-lang]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
    f.querySelectorAll('[data-set-theme]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.setTheme === themeChoice())));
    return f;
  }
  function setupSettings(appParts) {
    const own = appParts.find(el => el.dataset.icon === 'settings');
    if (own) {
      const h = document.createElement('h3');
      h.className = 'menu-settings-h'; h.dataset.i18n = 'settings.general'; h.textContent = t('settings.general');
      own.append(h, settingsFields());
      return null;
    }
    const el = document.createElement('details');
    el.className = 'card menu-settings-page'; el.id = 'menuSettings';
    el.innerHTML = `<summary data-i18n="settings.h">${esc(t('settings.h'))}</summary>`;
    el.append(settingsFields());
    return el;
  }

  function setupMenu() {
    // Apps (with help) and the start page (<body data-app-menu>: settings, install, footer)
    if (menuEl || !document.querySelector('details.help, body[data-app-menu]')) return;
    const header = document.querySelector('body > header');
    if (!header) return;
    const appParts = [...document.querySelectorAll('[data-menu]')];
    const data = document.querySelector('details.data'), help = document.querySelector('details.help');
    const installEl = setupInstall();
    const settingsEl = setupSettings(appParts);
    menuEl = document.createElement('dialog');
    menuEl.className = 'menu-sheet'; menuEl.id = 'appMenu';
    menuEl.setAttribute('aria-labelledby', 'appMenuTitle');
    menuEl.innerHTML = `<div class="menu-head"><h2 id="appMenuTitle" data-i18n="menu.title">${esc(t('menu.title'))}</h2>`
      + `<button type="button" class="head-btn menu-close" aria-label="${esc(t('menu.close'))}" title="${esc(t('menu.close'))}" data-i18n-attr="aria-label:menu.close; title:menu.close">${ICON_CLOSE}</button></div>`
      + '<div class="menu-body"></div>';
    const body = menuEl.querySelector('.menu-body');
    for (const el of appParts) if (el.matches('details[data-menu-page]')) el.classList.add('menu-page');
    const group = document.createElement('div');
    group.className = 'menu-group';
    for (const std of [{ el: settingsEl, icon: 'settings' }, { el: data, icon: 'database' }, { el: help, icon: 'help-circle' }, { el: installEl, icon: 'device-mobile-down' }]) {
      if (!std.el) continue;
      std.el.classList.add('menu-page');
      group.append(std.el);
      decorateSection(std.el, std.icon);
    }
    for (const el of appParts) decorateSection(el, el.dataset.icon);
    body.append(...appParts, group, ...[document.querySelector('body > footer')].filter(Boolean));
    document.body.append(menuEl);

    let actions = header.querySelector('.stage-actions');
    if (!actions) { actions = document.createElement('div'); actions.className = 'stage-actions'; header.append(actions); }
    menuBtn = document.createElement('button');
    menuBtn.type = 'button'; menuBtn.className = 'head-btn menu-btn';
    menuBtn.setAttribute('aria-haspopup', 'dialog'); menuBtn.setAttribute('aria-controls', 'appMenu'); menuBtn.setAttribute('aria-expanded', 'false');
    menuBtn.setAttribute('aria-label', t('menu.open')); menuBtn.title = t('menu.open');
    menuBtn.dataset.i18nAttr = 'aria-label:menu.open; title:menu.open';
    menuBtn.innerHTML = ICON_MENU;
    // Reload button: only shown once a new version is ready (see registerServiceWorker)
    updateBtn = document.createElement('button');
    updateBtn.type = 'button'; updateBtn.className = 'head-btn update-btn'; updateBtn.hidden = !updateReady;
    updateBtn.setAttribute('aria-label', t('sw.reload')); updateBtn.title = t('sw.reload');
    updateBtn.dataset.i18nAttr = 'aria-label:sw.reload; title:sw.reload';
    updateBtn.innerHTML = ICON_RELOAD;
    updateBtn.addEventListener('click', () => { diagLog('update: reload'); location.reload(); });
    actions.append(updateBtn, menuBtn);
    if (translated) { applyI18n(menuEl); applyI18n(actions); }

    menuBtn.addEventListener('click', () => menuOpen());
    menuEl.querySelector('.menu-close').addEventListener('click', menuClose);
    // A tap on the backdrop (outside the sheet) closes it
    menuEl.addEventListener('click', e => { if (e.target === menuEl) menuClose(); });
    // The sheet itself never scrolls (overflow hidden), only .menu-body. scrollIntoView() on an element inside
    // would still shift the sheet and push the head with ✕ out of view – undo that.
    menuEl.addEventListener('scroll', () => { if (menuEl.scrollTop || menuEl.scrollLeft) menuEl.scrollTo(0, 0); });
    // Sub pages: one at a time, each with its own history entry (back returns to the list)
    menuEl.addEventListener('toggle', e => {
      const d = e.target;
      if (!(d instanceof HTMLDetailsElement) || !d.classList.contains('menu-page')) return;
      if (d.open) {
        for (const o of menuEl.querySelectorAll('details.menu-page[open]')) if (o !== d) { o.dataset.silent = '1'; o.open = false; }
        body.scrollTop = 0; d.scrollTop = 0;
        menuEl.classList.add('page-open');
        if (!pagePushed) { try { history.pushState(Object.assign({}, history.state, { toolsMenuPage: true }), ''); pagePushed = true; } catch (_) {} }
        diagLog('menu page opened:', d.id || d.className);
      } else {
        if (d.dataset.silent) { delete d.dataset.silent; return; }
        if (!openPage()) menuEl.classList.remove('page-open');
        if (pagePushed) { pagePushed = false; ignorePop++; history.back(); }
      }
    }, true);
    // Esc / Android back (CloseWatcher) with a sub page open: back to the list instead of closing the menu
    menuEl.addEventListener('cancel', e => {
      const d = openPage();
      if (d) { e.preventDefault(); d.open = false; d.querySelector(':scope>summary')?.focus(); }
    });
    menuEl.addEventListener('close', () => {
      menuBtn.setAttribute('aria-expanded', 'false');
      for (const d of menuEl.querySelectorAll('details.menu-page[open]')) { d.dataset.silent = '1'; d.open = false; }
      menuEl.classList.remove('page-open');
      const n = (menuPushed ? 1 : 0) + (pagePushed ? 1 : 0);
      menuPushed = false; pagePushed = false;
      if (n) { ignorePop++; history.go(-n); }
    });
    window.addEventListener('popstate', () => {
      if (ignorePop) { ignorePop--; return; }
      const d = openPage();
      if (d && pagePushed) { pagePushed = false; d.dataset.silent = '1'; d.open = false; menuEl.classList.remove('page-open'); return; }
      if (menuEl.open) { menuPushed = false; menuEl.close(); }
    });
    document.body.classList.add('has-menu');
    // Long titles (other language, wide system font, more quick actions, the ↻ button) shrink a little instead of
    // being cut off – down to 14 px (UI-KONZEPT.md 4a). Re-checked whenever the actions or the title change.
    const h1 = header.querySelector('h1');
    if (h1) {
      const span = h1.querySelector(':scope > span') || h1;
      const fit = () => {
        span.style.fontSize = '';
        let size = parseFloat(getComputedStyle(span).fontSize);
        while (span.scrollWidth > span.clientWidth + 1 && size > 14) { size -= 1; span.style.fontSize = size + 'px'; }
      };
      fitTitle = fit;
      fit();
      try { new ResizeObserver(() => fit()).observe(actions); } catch (_) {}
      try { new MutationObserver(() => fit()).observe(span, { childList: true, characterData: true, subtree: true }); } catch (_) {}
      window.addEventListener('resize', fit);
    }
  }
  // common.js is loaded at the end of <body>: build the menu right away, before the first paint
  if (document.querySelector('body > footer')) setupMenu();
  else document.addEventListener('DOMContentLoaded', setupMenu);

  /* ---------- WebMCP: app functions as tools for AI agents in the browser ----------
     Draft standard (W3C Web Machine Learning CG): document.modelContext.registerTool(tool, { signal }).
     Older drafts and polyfills use navigator.modelContext – both are supported. Without it: nothing happens.
     Tools.mcp.register({ name, title, description, inputSchema, execute, readOnly, untrusted, label })
       name         short English snake_case name; the app id is put in front (dice_coin_roll_dice)
       description  English – what the tool does, what it returns
       inputSchema  JSON Schema (type object); the input is checked against it before execute runs
       execute      (input) => result (JSON-serialisable, English keys); throw an Error for problems
       readOnly     true if the tool only reads data (annotation readOnlyHint)
       untrusted    true if the result contains content from outside (PDF text, transcripts, scanned or
                    shared content) – annotation untrustedContentHint, agents treat it as data, not instructions
       label        shown to the user as a toast when an agent runs the tool: a key for Tools.t() on translated
                    pages, otherwise the German text itself
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
      annotations: Object.assign({ readOnlyHint: !!def.readOnly }, def.untrusted ? { untrustedContentHint: true } : {}),
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

  /* ---------- Keep files until the next start (see AGENTS.md "Daten sichern", Ausnahme Dateien) ----------
     Work that lives only in memory (opened files, scanned pages …) is lost when the page reloads – after an app
     update (↻) or when the phone ends the app in the background. Tools.keep stores files on the device in the
     Cache Storage "file:<app>": too big for localStorage and not part of the backup; "Alle Daten löschen" removes
     it (clearData). Names are short keys chosen by the app ("doc", "page-3", "state"). All calls catch errors.
       Tools.keep.supported()            Cache Storage available
       Tools.keep.put(name, blob)        File/Blob (name and type are kept) → true/false
       Tools.keep.putJson(name, value)   small JSON state next to the files → true/false
       Tools.keep.get(name)              → File or null
       Tools.keep.json(name, fallback)   → parsed value or fallback
       Tools.keep.remove(name) / clear() / names() → [names] */
  const KEEP_CACHE = () => 'file:' + appId();
  const keepSupported = () => { try { return 'caches' in window; } catch (_) { return false; } };
  async function keepPut(name, blob) {
    if (!keepSupported()) return false;
    try {
      const headers = { 'Content-Type': blob.type || 'application/octet-stream' };
      if (blob.name) headers['X-File-Name'] = encodeURIComponent(blob.name);
      await (await caches.open(KEEP_CACHE())).put(name, new Response(blob, { headers }));
      return true;
    } catch (e) { diagLog('keep failed', name, e); return false; }
  }
  const keepPutJson = (name, value) => keepPut(name, new Blob([JSON.stringify(value)], { type: 'application/json' }));
  async function keepGet(name) {
    if (!keepSupported()) return null;
    try {
      const res = await (await caches.open(KEEP_CACHE())).match(name);
      if (!res) return null;
      const type = res.headers.get('Content-Type') || '';
      return new File([await res.blob()], decodeURIComponent(res.headers.get('X-File-Name') || name), { type });
    } catch (e) { diagLog('keep read failed', name, e); return null; }
  }
  async function keepJson(name, fallback = null) {
    const f = await keepGet(name);
    if (!f) return fallback;
    try { return JSON.parse(await f.text()); } catch (_) { return fallback; }
  }
  async function keepRemove(name) {
    if (!keepSupported()) return;
    try { await (await caches.open(KEEP_CACHE())).delete(name); } catch (_) {}
  }
  async function keepClear() {
    if (!keepSupported()) return;
    try { await caches.delete(KEEP_CACHE()); } catch (_) {}
  }
  async function keepNames() {
    if (!keepSupported()) return [];
    try {
      if (!(await caches.has(KEEP_CACHE()))) return [];
      const base = new URL('.', location.href).href;
      return (await (await caches.open(KEEP_CACHE())).keys()).map(r => decodeURIComponent(r.url.startsWith(base) ? r.url.slice(base.length) : r.url));
    } catch (_) { return []; }
  }

  /* ---------- Full screen (feature "Vollbild", see AGENTS.md "Vollbild & ausblendende Leisten") ----------
     Hides the browser and the system bars (Android: status and navigation bar) – requestFullscreen with
     navigationUI 'hide'. Browsers allow it only right after a tap/key press. An installed app whose manifest
     has display "fullscreen" (build.mjs, feature "Vollbild") starts without system bars: then system() is true.
       Tools.fullscreen.supported()   the browser can do it (not on iPhone)
       Tools.fullscreen.active()      full screen now (by the page or by the installed app)
       Tools.fullscreen.system()      installed app in display mode "fullscreen" – nothing to switch
       Tools.fullscreen.enter(el?) / exit() / toggle(el?)   resolve to true when full screen afterwards
       Tools.fullscreen.onChange(fn)  fn(active) whenever it changes (also by the back gesture or Escape) */
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const fsMq = (() => { try { return matchMedia('(display-mode: fullscreen)'); } catch (_) { return null; } })();
  const fsSystem = () => !fsEl() && !!(fsMq && fsMq.matches);
  const fsActive = () => !!fsEl() || fsSystem();
  function fsSupported() {
    const d = document.documentElement;
    return !!(d.requestFullscreen || d.webkitRequestFullscreen) && document.fullscreenEnabled !== false;
  }
  async function fsEnter(el = document.documentElement) {
    if (fsActive()) return true;
    const fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!fn) { diagLog('fullscreen: no api'); return false; }
    try { await fn.call(el, { navigationUI: 'hide' }); diagLog('fullscreen on'); return true; }
    catch (e) { diagLog('fullscreen failed', e); return false; }
  }
  async function fsExit() {
    if (!fsEl()) return fsActive();
    try { await (document.exitFullscreen || document.webkitExitFullscreen).call(document); diagLog('fullscreen off'); }
    catch (e) { diagLog('fullscreen exit failed', e); }
    return fsActive();
  }
  const fsToggle = el => fsEl() ? fsExit() : fsEnter(el);
  function fsOnChange(fn) {
    const run = () => { try { fn(fsActive()); } catch (e) { diagLog('fullscreen change handler', e); } };
    document.addEventListener('fullscreenchange', run);
    document.addEventListener('webkitfullscreenchange', run);
    try { fsMq && fsMq.addEventListener('change', run); } catch (_) {}
  }

  /* ---------- Diagnostics: "Diagnose kopieren" (block at the end of the help, see template/) ----------
     Tools.diag.log(...parts)  one line in the log: steps, results, errors – never user content (texts, passwords,
                               file contents). Strings as they are, Errors as "Name: message", the rest as JSON.
     Tools.diag.info(fn)       page-specific state for the report: fn() returns (or resolves to) { key: value }.
     A button with data-diag="copy" copies the report: app, version, browser, installed or not, language, online,
     service worker, own storage (number of keys and size – no content), the page's info and the log.
     JS errors, unhandled rejections and console warnings/errors are logged automatically. */
  const diagLines = [];
  const diagInfos = [];
  function diagStr(x) {
    if (typeof x === 'string') return x;
    if (x instanceof Error || (x && typeof x === 'object' && 'name' in x && 'message' in x)) return `${x.name}: ${x.message}`;
    try { return JSON.stringify(x); } catch (_) { return String(x); }
  }
  function diagLog(...parts) {
    diagLines.push(new Date().toISOString().slice(11, 23) + ' ' + parts.map(diagStr).join(' '));
    if (diagLines.length > 300) diagLines.shift();
  }
  async function diagText() {
    const out = [];
    const add = (k, v) => out.push(`${k}: ${diagStr(v)}`);
    const version = document.querySelector('.footer-version');
    add('app', appId());
    add('version', version ? version.textContent.trim().replace(/^Version\s+/, '') : '');
    add('time', new Date().toString());
    add('userAgent', navigator.userAgent);
    add('standalone', matchMedia('(display-mode: standalone)').matches || navigator.standalone === true);
    add('fullscreen', fsEl() ? 'page' : fsSystem() ? 'app' : false);
    add('badge', badgeSupported() ? (badgeCount == null ? 'not set' : badgeCount) : 'no api');
    add('language', lang);
    add('theme', themeChoice() + (themeDark() ? ' (dark)' : ' (light)'));
    add('online', navigator.onLine);
    const sw = navigator.serviceWorker;
    add('serviceWorker.controller', !!(sw && sw.controller));
    try {
      const reg = sw && await sw.getRegistration();
      add('registration', reg ? { scope: reg.scope, active: !!reg.active, waiting: !!reg.waiting } : null);
    } catch (e) { add('registration', e); }
    const keys = ownKeys();
    let bytes = 0;
    try { bytes = keys.reduce((n, k) => n + k.length + (localStorage.getItem(k) || '').length, 0) * 2; } catch (_) {}
    add('storage', { keys: keys.length, bytes });
    add('kept files', (await keepNames()).length);
    if (audioCtx) add('audio', { state: audioCtx.state, rate: audioCtx.sampleRate });
    if (wakeReasons.size) add('wake lock', { held: !!wakeSentinel, reasons: [...wakeReasons], supported: wakeSupported() });
    for (const fn of diagInfos) {
      try { for (const [k, v] of Object.entries((await fn()) || {})) add(k, v); } catch (e) { add('info failed', e); }
    }
    return out.join('\n') + '\n\nlog:\n' + (diagLines.join('\n') || '(empty)');
  }
  window.addEventListener('error', e => diagLog('JS error:', e.error || e.message || 'unknown', e.filename ? `${e.filename}:${e.lineno}` : ''));
  window.addEventListener('unhandledrejection', e => diagLog('unhandled rejection:', e.reason));
  for (const level of ['warn', 'error']) {
    const orig = console[level];
    console[level] = function (...args) { diagLog(`console.${level}:`, ...args); return orig.apply(this, args); };
  }
  function setupDiagUi() {
    document.querySelectorAll('[data-diag="copy"]').forEach(b => b.addEventListener('click', async () => {
      // The report is built asynchronously. Safari (and others) only allow copying right in the tap, so the
      // clipboard write starts at once with a promise for the text; copyText() is the fallback.
      const text = diagText();
      let ok = false;
      const cb = navigator.clipboard;
      if (cb && cb.write && window.ClipboardItem) {
        try {
          await cb.write([new ClipboardItem({ 'text/plain': text.then(s => new Blob([s], { type: 'text/plain' })) })]);
          ok = true;
        } catch (e) { diagLog('diag: clipboard.write failed:', e); }
      }
      if (!ok) ok = await copyText(await text);
      if (!ok) diagLog('diag: copy failed');
      toast(t(ok ? 'diag.copied' : 'diag.fail'));
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupDiagUi);
  else setupDiagUi();

  return {
    $, load, save, remove, toast, undo, confirm: confirmAsk, prompt: promptAsk, esc, icon, copyText, fmt, parseNum, takeSharedFile, takeSharedFiles, takeSharedText, handOff, fileHandle, shortcut, badge, vibrate,
    randomInt, random, uid, clamp, reducedMotion, canShareFile, download: downloadFile, canvasBlob, undoKeys,
    audio: { context: audioContext, unlock: audioUnlock, ready: audioReady, tone },
    wakeLock: { hold: wakeHold, release: wakeRelease, active: () => !!wakeSentinel, supported: wakeSupported, reasons: () => [...wakeReasons] },
    i18n, t, lang: () => lang, setLang, locale, onLang, applyI18n, i18nMissing, LANG_KEY,
    theme: { get: themeChoice, set: setTheme, dark: themeDark, onChange: onTheme, KEY: THEME_KEY },
    mcp: { register: mcpRegister, tools: () => mcpTools.slice(), available: () => !!modelContext(), checkSchema },
    menu: { open: menuOpen, close: menuClose, element: () => menuEl },
    keep: { supported: keepSupported, put: keepPut, putJson: keepPutJson, get: keepGet, json: keepJson, remove: keepRemove, clear: keepClear, names: keepNames },
    fullscreen: { supported: fsSupported, active: fsActive, system: fsSystem, enter: fsEnter, exit: fsExit, toggle: fsToggle, onChange: fsOnChange },
    data: { exportData, validateBackup, importData, clearData, keys: ownKeys, prefixes: storagePrefixes, appId },
    diag: { log: diagLog, info: fn => { diagInfos.push(fn); }, text: diagText },
  };
})();
