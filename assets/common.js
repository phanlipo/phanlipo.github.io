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

  /* ---------- Numbers (German format) ---------- */
  function fmt(x, digits) {
    const d = digits == null ? 2 : digits;
    return Number.isFinite(x)
      ? x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d })
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
      if (hadController) toast('Update geladen – aktiv ab dem nächsten Öffnen', 3500);
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
    return new File([JSON.stringify(exportData(), null, 2) + '\n'], `${appId()}-sicherung-${day}.json`, { type: 'application/json' });
  }

  // Throws an Error with a German message if the parsed backup does not fit this app
  function validateBackup(backup) {
    if (!backup || backup.format !== BACKUP_FORMAT) throw new Error('Keine gültige Sicherungsdatei.');
    if (!Number.isInteger(backup.formatVersion) || backup.formatVersion > BACKUP_VERSION)
      throw new Error('Die Sicherung stammt aus einer neueren Version – bitte die Seite aktualisieren.');
    if (backup.app !== appId())
      throw new Error(`Die Sicherung gehört zu „${backup.title || backup.app}“, nicht zu dieser App.`);
    const data = backup.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Die Sicherung enthält keine Daten.');
    const entries = Object.entries(data);
    const foreign = entries.filter(([k, v]) => !ownsKey(k) || typeof v !== 'string');
    if (foreign.length) throw new Error('Die Sicherung enthält unbekannte Einträge und wurde nicht geladen.');
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
      throw new Error('Speichern nicht möglich (Speicher voll oder gesperrt).');
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
      const size = bytes < 1024 ? 'unter 1 KB' : `ca. ${fmt(bytes / 1024, 0)} KB`;
      showInfo(keys.length ? `${keys.length} ${keys.length === 1 ? 'gespeicherter Eintrag' : 'gespeicherte Einträge'} · ${size}` : 'Noch keine gespeicherten Daten.');
    };
    box.addEventListener('toggle', () => { if (box.open) summary(); });

    btn('export').addEventListener('click', () => { downloadFile(backupFile()); toast('Sicherung gespeichert'); });

    const share = btn('share');
    try { share.hidden = !(navigator.canShare && navigator.canShare({ files: [backupFile()] })); } catch (_) { share.hidden = true; }
    share.addEventListener('click', async () => {
      try { await navigator.share({ files: [backupFile()], title: `Sicherung: ${document.title}` }); }
      catch (e) { if (e.name !== 'AbortError') showInfo('Teilen nicht möglich – bitte „Sicherung speichern“ verwenden.', 'err'); }
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
        if (file.size > MAX_IMPORT_BYTES) throw new Error('Die Datei ist zu groß.');
        try { backup = JSON.parse(await file.text()); } catch (_) { throw new Error('Die Datei ist keine gültige JSON-Sicherung.'); }
        count = validateBackup(backup).length;
      } catch (e) { showInfo(e.message, 'err'); return; }
      const d = new Date(backup.exportedAt), when = isNaN(d) ? 'unbekanntem Datum' : d.toLocaleString('de-DE');
      if (!confirm(`Sicherung vom ${when} mit ${count} Einträgen laden?\nDie aktuellen Daten dieser App werden dabei ersetzt.`)) return;
      try { importData(backup); } catch (e) { showInfo(e.message, 'err'); return; }
      toast('Sicherung geladen');
      setTimeout(() => location.reload(), 600);
    });

    btn('clear').addEventListener('click', () => {
      if (!confirm('Alle gespeicherten Daten dieser App (Einstellungen, Verlauf, Vorlagen …) löschen?\nTipp: vorher eine Sicherung speichern.')) return;
      clearData();
      toast('Daten gelöscht');
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

  return {
    $, load, save, remove, toast, esc, copyText, fmt, parseNum, takeSharedFile, takeSharedText,
    data: { exportData, validateBackup, importData, clearData, keys: ownKeys, prefixes: storagePrefixes, appId },
  };
})();
