/* Small map for the treasure hunt (no library): OpenStreetMap tiles on a canvas, markers, drag to pan,
   +/- to zoom, tap to pick a point (editor). Exposes window.HuntMap.
   Tiles are loaded only when the user switched the map on (setting) – each request tells
   tile.openstreetmap.org which area is shown. Loaded tiles are kept in the cache "treasure-hunt:tiles", so an area
   seen once also works offline. Without tiles (off, offline, not cached) a grid with distance rings is drawn
   instead ("radar"), so navigation works anyway. */
window.HuntMap = (function () {
  'use strict';

  const TILE = 256, MIN_Z = 3, MAX_Z = 19;
  const CACHE = 'treasure-hunt:tiles';
  const tileUrl = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
  const tiles = new Map(); // "z/x/y" -> { img, failed }
  let enabled = false, onLog = () => {};

  function project(lat, lon, z) {
    const n = TILE * 2 ** z, s = Math.sin(lat * Math.PI / 180);
    return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
  }
  function unproject(x, y, z) {
    const n = TILE * 2 ** z, k = Math.PI - 2 * Math.PI * y / n;
    return { lat: 180 / Math.PI * Math.atan(Math.sinh(k)), lon: x / n * 360 - 180 };
  }
  const metersPerPixel = (lat, z) => 156543.03392 * Math.cos(lat * Math.PI / 180) / 2 ** z;

  async function loadTile(z, x, y) {
    const url = tileUrl(z, x, y);
    let cache = null, res = null;
    try { cache = await caches.open(CACHE); res = await cache.match(url); } catch (_) {}
    if (!res) {
      if (!enabled || navigator.onLine === false) throw new Error('offline');
      res = await fetch(url, { credentials: 'omit', mode: 'cors' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      if (cache) try { await cache.put(url, res.clone()); } catch (_) {}
    }
    return createImageBitmap(await res.blob());
  }
  function tile(z, x, y, redraw) {
    if (!enabled) return null;
    const key = `${z}/${x}/${y}`;
    let t = tiles.get(key);
    if (t && (t.img || !t.failed || Date.now() - t.failed < 15000)) return t.img;
    t = { img: null, failed: 0 };
    tiles.set(key, t);
    if (tiles.size > 400) tiles.delete(tiles.keys().next().value);
    loadTile(z, x, y).then(img => { t.img = img; redraw(); }, e => {
      t.failed = Date.now();
      if (enabled && e.message !== 'offline') onLog('tile failed', { error: e.message });
    });
    return null;
  }

  class Map2 {
    constructor(canvas, opts) {
      this.cv = canvas; this.opts = opts || {};
      this.z = 17; this.center = { lat: 0, lon: 0 }; this.markers = []; this.follow = true;
      this.ctx = canvas.getContext('2d');
      this._down = null;
      canvas.addEventListener('pointerdown', e => {
        this._down = { x: e.clientX, y: e.clientY, c: project(this.center.lat, this.center.lon, this.z), moved: false };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      });
      canvas.addEventListener('pointermove', e => {
        const d = this._down;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!d.moved && Math.hypot(dx, dy) < 8) return;
        d.moved = true; this.follow = false;
        this.center = unproject(d.c.x - dx, d.c.y - dy, this.z);
        this.draw();
      });
      const up = e => {
        const d = this._down;
        this._down = null;
        if (!d || d.moved || !this.opts.onTap) return;
        const r = canvas.getBoundingClientRect();
        const c = project(this.center.lat, this.center.lon, this.z);
        const p = unproject(c.x + e.clientX - r.left - r.width / 2, c.y + e.clientY - r.top - r.height / 2, this.z);
        this.opts.onTap({ lat: +p.lat.toFixed(6), lon: +p.lon.toFixed(6) });
      };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', () => { this._down = null; });
      canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
      if ('ResizeObserver' in window) new ResizeObserver(() => this.draw()).observe(canvas);
    }
    zoom(dz) { this.z = Math.max(MIN_Z, Math.min(MAX_Z, this.z + dz)); this.draw(); }
    setView(p, z) { if (p) this.center = { lat: p.lat, lon: p.lon }; if (z) this.z = z; this.draw(); }
    // Shows all points (at most zoom maxZ); a single point is centred
    fit(points, maxZ) {
      points = points.filter(p => p && Number.isFinite(p.lat) && Number.isFinite(p.lon));
      if (!points.length) return this.draw();
      const w = Math.max(100, this.cv.clientWidth - 70), h = Math.max(100, this.cv.clientHeight - 70);
      let z = maxZ || 18;
      for (; z > MIN_Z; z--) {
        const ps = points.map(p => project(p.lat, p.lon, z));
        const xs = ps.map(p => p.x), ys = ps.map(p => p.y);
        if (Math.max(...xs) - Math.min(...xs) <= w && Math.max(...ys) - Math.min(...ys) <= h) break;
      }
      const ps = points.map(p => project(p.lat, p.lon, z));
      const cx = (Math.max(...ps.map(p => p.x)) + Math.min(...ps.map(p => p.x))) / 2;
      const cy = (Math.max(...ps.map(p => p.y)) + Math.min(...ps.map(p => p.y))) / 2;
      this.z = z; this.center = unproject(cx, cy, z);
      this.draw();
    }
    draw() {
      const cv = this.cv, dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (!w || !h) return;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const ctx = this.ctx, css = getComputedStyle(cv);
      const col = n => css.getPropertyValue(n).trim() || '#888';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = col('--surface-2'); ctx.fillRect(0, 0, w, h);
      const c = project(this.center.lat, this.center.lon, this.z);
      const ox = c.x - w / 2, oy = c.y - h / 2;
      let drawn = 0;
      const n = 2 ** this.z;
      for (let tx = Math.floor(ox / TILE); tx <= Math.floor((ox + w) / TILE); tx++) {
        for (let ty = Math.floor(oy / TILE); ty <= Math.floor((oy + h) / TILE); ty++) {
          if (ty < 0 || ty >= n) continue;
          const img = tile(this.z, ((tx % n) + n) % n, ty, () => this.draw());
          if (img) { ctx.drawImage(img, tx * TILE - ox, ty * TILE - oy, TILE, TILE); drawn++; }
        }
      }
      // Radar: rings every "step" metres around the first marker (you), so distances can be read without tiles
      const mpp = metersPerPixel(this.center.lat, this.z);
      const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
      const step = steps.find(s => s / mpp >= 60) || steps[steps.length - 1];
      const me = this.markers.find(m => m.kind === 'me') || null;
      const mid = me ? { x: project(me.lat, me.lon, this.z).x - ox, y: project(me.lat, me.lon, this.z).y - oy } : { x: w / 2, y: h / 2 };
      if (!drawn) {
        ctx.strokeStyle = col('--border'); ctx.lineWidth = 1;
        for (let r = step / mpp, i = 1; i <= 12; r += step / mpp, i++) { ctx.beginPath(); ctx.arc(mid.x, mid.y, r, 0, 2 * Math.PI); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(mid.x, 0); ctx.lineTo(mid.x, h); ctx.moveTo(0, mid.y); ctx.lineTo(w, mid.y); ctx.stroke();
        ctx.fillStyle = col('--muted'); ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('N', mid.x, 16);
      }
      // Scale bar
      ctx.fillStyle = col('--text'); ctx.strokeStyle = col('--text'); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(10, h - 12); ctx.lineTo(10 + step / mpp, h - 12); ctx.stroke();
      ctx.font = '600 12px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(step >= 1000 ? step / 1000 + ' km' : step + ' m', 12, h - 18);
      // Markers: you (dot with accuracy circle), target, other stations
      for (const m of this.markers) {
        const p = project(m.lat, m.lon, this.z), x = p.x - ox, y = p.y - oy;
        if (m.kind === 'me') {
          if (m.acc) { ctx.fillStyle = 'rgba(37,99,235,.15)'; ctx.beginPath(); ctx.arc(x, y, Math.min(400, m.acc / mpp), 0, 2 * Math.PI); ctx.fill(); }
          ctx.fillStyle = '#2563eb'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(x, y, 9, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
          continue;
        }
        if (m.radius) { ctx.strokeStyle = 'rgba(180,83,9,.6)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]); ctx.beginPath(); ctx.arc(x, y, m.radius / mpp, 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]); }
        const big = m.kind === 'target';
        ctx.font = `${big ? 34 : 22}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.globalAlpha = m.kind === 'dim' ? 0.55 : 1;
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, big ? 24 : 16, 0, 2 * Math.PI); ctx.fill();
        ctx.strokeStyle = big ? '#b45309' : '#64748b'; ctx.lineWidth = big ? 4 : 2; ctx.stroke();
        ctx.fillStyle = '#000'; ctx.fillText(m.emoji || '📍', x, y + 1);
        ctx.globalAlpha = 1; ctx.textBaseline = 'alphabetic';
      }
    }
  }

  return {
    Map: Map2, CACHE, project, unproject, metersPerPixel,
    setEnabled(v) { enabled = !!v; if (enabled) for (const [k, t] of tiles) if (!t.img) tiles.delete(k); },
    setLogger(fn) { onLog = fn; },
    async clearCache() { tiles.clear(); try { return await caches.delete(CACHE); } catch (_) { return false; } },
    async cachedCount() { try { return (await (await caches.open(CACHE)).keys()).length; } catch (_) { return 0; } },
  };
})();
