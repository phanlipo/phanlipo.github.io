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

  return { $, load, save, remove, toast, esc, copyText, fmt, parseNum };
})();
