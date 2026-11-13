/* Funktionsplotter – page: function list, parameter sliders, canvas with pan/zoom/trace, examples, WebMCP.
   The expression engine (no DOM) is in expr.js (window.PlotExpr). */
(function () {
'use strict';
const { $, load, save, t } = Tools;

Tools.i18n({
  de: {
    fnLabel: 'Funktion {n}', show: 'Kurve {n} anzeigen', remove: 'Funktion {n} entfernen', placeholder: 'z. B. a sin(b x)',
    play: '{p} laufen lassen', pause: '{p} anhalten', pMin: '{p} Minimum', pMax: '{p} Maximum', pVal: 'Wert von {p}',
    'err.syntax': 'Unvollständige oder fehlerhafte Formel', 'err.paren': 'Klammer fehlt oder ist zu viel', 'err.end': 'Formel endet zu früh',
    'err.symbol': 'Unbekanntes Zeichen „{a}“', 'err.args': 'Falsche Zahl von Argumenten für {a}', 'err.equals': 'Nur ein „=“ je Zeile',
    'err.reserved': '„{a}“ ist schon vergeben (Funktion, Konstante oder x)', 'err.lhs': 'Links vom „=“ steht ein Name, z. B. f(x) oder g',
    'err.twice': '„{a}“ ist schon in einer anderen Zeile definiert', 'err.nofn': '„{a}“ ist keine Funktion – erst „{a}(x) = …“ definieren',
    'err.call': 'Nach „{a}′“ fehlt die Klammer, z. B. {a}′(x)', 'err.cycle': 'Definition verweist auf sich selbst',
    constInfo: '= {v}', zero: 'Nullstelle', max: 'Maximum', min: 'Minimum', at: '{what} von {f}: x = {x}, y = {y}',
    undef: 'nicht definiert', saved: 'Bild gespeichert', exampleLoaded: 'Beispiel geladen: {n}', fitted: 'y-Achse angepasst',
    nothingToFit: 'Keine Kurve im sichtbaren Bereich', badView: 'Bitte gültige Grenzen eingeben (von < bis)', viewSet: 'Ansicht übernommen',
    'mcp.set': 'Funktionen gesetzt', 'mcp.param': 'Parameter geändert', 'mcp.eval': 'Werte berechnet',
    'ex.damped': 'Gedämpfte Schwingung', 'ex.wave': 'Stehende Welle (t laufen lassen)', 'ex.beat': 'Schwebung', 'ex.planck': 'Planck-Spektrum',
    'ex.taylor': 'Taylor-Reihe von sin', 'ex.fourier': 'Fourier-Reihe Rechteck', 'ex.gauss': 'Normalverteilung', 'ex.deriv': 'Funktion und Ableitungen',
    'ex.lj': 'Lennard-Jones-Potenzial', 'ex.throw': 'Wurfparabel',
  },
  en: {
    title: 'Function Plotter', sub: 'Plot functions, change parameters with sliders', fit: 'Fit y axis', png: 'Save as image',
    cvLabel: 'Graph of the functions. Drag to pan, two fingers or mouse wheel to zoom, tap to show values.',
    hideValues: 'Hide values', zoomIn: 'Zoom in', zoomOut: 'Zoom out', fnsH: 'Functions', add: '+ Function', examplesL: 'Load example',
    examples: 'Load example …', paramsH: 'Parameters', viewH: 'View', x0: 'x from', x1: 'x to', y0: 'y from', y1: 'y to',
    apply: 'Apply', reset: 'Default view', optPoints: 'Mark zeros and extrema', optEqual: 'Same scale for x and y (circles stay round)',
    period: 'Duration of one run with ▶ (seconds)',
    fnLabel: 'Function {n}', show: 'Show curve {n}', remove: 'Remove function {n}', placeholder: 'e.g. a sin(b x)',
    play: 'Run {p}', pause: 'Pause {p}', pMin: '{p} minimum', pMax: '{p} maximum', pVal: 'Value of {p}',
    'err.syntax': 'Incomplete or invalid formula', 'err.paren': 'Bracket missing or too many', 'err.end': 'Formula ends too early',
    'err.symbol': 'Unknown character “{a}”', 'err.args': 'Wrong number of arguments for {a}', 'err.equals': 'Only one “=” per line',
    'err.reserved': '“{a}” is already taken (function, constant or x)', 'err.lhs': 'Left of “=” goes a name, e.g. f(x) or g',
    'err.twice': '“{a}” is already defined in another line', 'err.nofn': '“{a}” is not a function – define “{a}(x) = …” first',
    'err.call': 'Bracket missing after “{a}′”, e.g. {a}′(x)', 'err.cycle': 'Definition refers to itself',
    constInfo: '= {v}', zero: 'Zero', max: 'Maximum', min: 'Minimum', at: '{what} of {f}: x = {x}, y = {y}',
    undef: 'undefined', saved: 'Image saved', exampleLoaded: 'Example loaded: {n}', fitted: 'y axis fitted',
    nothingToFit: 'No curve in the visible range', badView: 'Please enter valid limits (from < to)', viewSet: 'View applied',
    'mcp.set': 'functions set', 'mcp.param': 'parameter changed', 'mcp.eval': 'values computed',
    'ex.damped': 'Damped oscillation', 'ex.wave': 'Standing wave (run t)', 'ex.beat': 'Beats', 'ex.planck': 'Planck spectrum',
    'ex.taylor': 'Taylor series of sin', 'ex.fourier': 'Fourier series of a square wave', 'ex.gauss': 'Normal distribution', 'ex.deriv': 'Function and derivatives',
    'ex.lj': 'Lennard-Jones potential', 'ex.throw': 'Projectile motion',
  },
});

/* ---------- State ---------- */
const LS = 'function-plotter.state.v1';
const MAX_FNS = 8;
const DEF_VIEW = { x0: -10, x1: 10, y0: -6, y1: 6 };
const DEF = { fns: [{ src: 'a sin(b x)', on: true }, { src: '', on: true }], params: { a: { v: 2, min: 0, max: 5 }, b: { v: 1, min: 0, max: 5 } },
  view: DEF_VIEW, points: true, equal: false, period: 5 };
const stored = load(LS, null);
const S = Object.assign({}, DEF, stored && typeof stored === 'object' ? stored : {});
if (!Array.isArray(S.fns) || !S.fns.length) S.fns = DEF.fns.map(f => Object.assign({}, f));
S.fns = S.fns.slice(0, MAX_FNS).map(f => ({ src: String(f && f.src || ''), on: !(f && f.on === false) }));
if (!S.params || typeof S.params !== 'object') S.params = {};
const okView = v => v && [v.x0, v.x1, v.y0, v.y1].every(Number.isFinite) && v.x1 > v.x0 && v.y1 > v.y0;
S.view = okView(S.view) ? Object.assign({}, S.view) : Object.assign({}, DEF_VIEW);
if (!(S.period > 0)) S.period = DEF.period;
let saveTimer = 0;
const store = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => save(LS, S), 250); };
window.addEventListener('pagehide', () => { clearTimeout(saveTimer); save(LS, S); });

const V = S.view; // current view (changed in place)
let C = PlotExpr.compile(S.fns.map(f => f.src));
const anim = new Set();
let cursor = null; // { x, snap: { i, type } | null }
let lastPts = [];  // [{ i, type, x, y }] of the last drawing (for snapping)

const paramDef = name => name === 't' ? { v: 0, min: 0, max: 10 } : { v: 1, min: -5, max: 5 };
function paramValues() {
  const P = {};
  for (const n of C.params) {
    if (!S.params[n]) S.params[n] = paramDef(n);
    P[n] = S.params[n].v;
  }
  return P;
}

/* ---------- Numbers ---------- */
const isEn = () => Tools.lang() === 'en';
// Value with about 5 significant digits (axis independent)
function fmtVal(v) {
  if (!Number.isFinite(v)) return t('undef');
  if (v === 0) return '0'; // also −0
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e7 || a < 1e-4)) return expo(v, 4);
  return Tools.fmt(v, Math.max(0, Math.min(8, 4 - Math.floor(Math.log10(a || 1)))))
    .replace(/([.,]\d*?)0+$/, '$1').replace(/[.,]$/, '');
}
function expo(v, d) {
  const [m, e] = v.toExponential(d).split('e');
  const mant = m.replace(/\.?0+$/, '');
  return (isEn() ? mant : mant.replace('.', ',')) + '·10' + String(Number(e)).replace(/-/g, '⁻').replace(/\d/g, c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]);
}
// For input fields: no grouping, decimal comma in German
function inputVal(v) {
  const s = String(Number(v.toPrecision(10)));
  return isEn() ? s : s.replace('.', ',');
}
function niceStep(range, px, per) {
  const raw = range / Math.max(1, px / per), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}
function tickLabel(v, step) {
  if (Math.abs(v) < step * 1e-6) return '0';
  if (step >= 1e5 || step < 1e-4) return expo(v, Math.max(0, Math.min(6, Math.floor(Math.log10(Math.abs(v))) - Math.floor(Math.log10(step)))));
  const d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return Tools.fmt(v, d);
}

/* ---------- Function list ---------- */
const colorVar = i => `--f${i % 8 + 1}`;
const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
function itemLabel(i) {
  const it = C.items[i];
  if (it && it.name) return `${it.name}(${it.variable})`;
  return 'y' + String(i + 1).replace(/\d/g, c => '₀₁₂₃₄₅₆₇₈₉'[c]);
}
function renderFns() {
  const ol = $('fns');
  ol.textContent = '';
  S.fns.forEach((fn, i) => {
    const li = document.createElement('li');
    li.className = 'fn';
    li.style.setProperty('--c', `var(${colorVar(i)})`);
    const sw = document.createElement('button');
    sw.type = 'button'; sw.className = 'swatch'; sw.dataset.i = i;
    sw.setAttribute('aria-pressed', String(fn.on));
    sw.setAttribute('aria-label', t('show', { n: i + 1 }));
    sw.innerHTML = `<span aria-hidden="true">${i + 1}</span>`;
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = fn.src; inp.dataset.i = i;
    inp.setAttribute('aria-label', t('fnLabel', { n: i + 1 }));
    inp.placeholder = t('placeholder');
    Object.assign(inp, { autocomplete: 'off', spellcheck: false });
    inp.setAttribute('autocapitalize', 'off'); inp.setAttribute('autocorrect', 'off');
    const del = document.createElement('button');
    del.type = 'button'; del.className = 'icon-btn'; del.dataset.del = i; del.textContent = '×';
    del.setAttribute('aria-label', t('remove', { n: i + 1 }));
    const msg = document.createElement('p');
    msg.className = 'fn-err'; msg.id = 'fnmsg-' + i; msg.hidden = true;
    inp.setAttribute('aria-describedby', msg.id);
    li.append(sw, inp, del, msg);
    ol.append(li);
  });
  $('add').disabled = S.fns.length >= MAX_FNS;
  renderMessages();
}
function renderMessages() {
  const P = paramValues();
  C.items.forEach((it, i) => {
    const msg = $('fnmsg-' + i), inp = document.querySelector(`#fns input[data-i="${i}"]`);
    if (!msg || !inp) return;
    let text = '', err = false;
    if (it.kind === 'error') { text = t('err.' + it.error, { a: it.arg || '' }); err = true; }
    else if (it.kind === 'const') text = it.name + ' ' + t('constInfo', { v: fmtVal(it.f(0, P)) });
    msg.textContent = text; msg.hidden = !text;
    msg.className = err ? 'fn-err' : 'fn-info';
    inp.setAttribute('aria-invalid', String(err));
  });
}
function recompile() {
  C = PlotExpr.compile(S.fns.map(f => f.src));
  for (const n of [...anim]) if (!C.params.includes(n)) anim.delete(n);
  renderMessages(); renderParams(); draw(); store();
}
$('fns').addEventListener('input', e => {
  const i = Number(e.target.dataset.i);
  if (!S.fns[i]) return;
  S.fns[i].src = e.target.value;
  recompile();
});
$('fns').addEventListener('click', e => {
  const sw = e.target.closest('.swatch'), del = e.target.closest('[data-del]');
  if (sw) {
    const f = S.fns[Number(sw.dataset.i)];
    f.on = !f.on; sw.setAttribute('aria-pressed', String(f.on));
    draw(); store();
  } else if (del) {
    const i = Number(del.dataset.del);
    S.fns.splice(i, 1);
    if (!S.fns.length) S.fns.push({ src: '', on: true });
    cursor = null;
    C = PlotExpr.compile(S.fns.map(f => f.src));
    renderFns(); renderParams(); draw(); store();
    const next = document.querySelector(`#fns input[data-i="${Math.min(i, S.fns.length - 1)}"]`);
    if (next) next.focus();
  }
});
$('add').addEventListener('click', () => {
  if (S.fns.length >= MAX_FNS) return;
  S.fns.push({ src: '', on: true });
  C = PlotExpr.compile(S.fns.map(f => f.src));
  renderFns(); store();
  document.querySelector(`#fns input[data-i="${S.fns.length - 1}"]`).focus();
});

/* ---------- Parameter sliders ---------- */
const STEPS = 1000;
function decimalsFor(p) { return Math.max(0, Math.min(10, -Math.floor(Math.log10((p.max - p.min) / STEPS)))); }
function renderParams() {
  const box = $('params'), names = C.params;
  $('paramsBox').hidden = !names.length;
  const have = new Map([...box.children].map(el => [el.dataset.p, el]));
  for (const [n, el] of have) if (!names.includes(n)) el.remove();
  names.forEach((n, k) => {
    if (!S.params[n]) S.params[n] = paramDef(n);
    let el = have.get(n);
    if (!el) el = paramRow(n);
    if (box.children[k] !== el) box.insertBefore(el, box.children[k] || null);
    syncParam(n);
  });
}
let pid = 0;
function paramRow(n) {
  const id = 'p' + (++pid);
  const el = document.createElement('div');
  el.className = 'param'; el.dataset.p = n;
  el.innerHTML = `<div class="p-top"><label for="${id}-v"></label><span aria-hidden="true">=</span>
    <input type="text" id="${id}-v" inputmode="decimal" autocomplete="off" data-role="v">
    <button type="button" class="icon-btn" data-role="play" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13 -8z"/></svg></button></div>
    <div class="p-bot"><input type="text" inputmode="decimal" autocomplete="off" data-role="min">
    <input type="range" min="0" max="${STEPS}" step="1" data-role="range">
    <input type="text" inputmode="decimal" autocomplete="off" data-role="max"></div>`;
  el.querySelector('label').textContent = n;
  labelParam(el, n);
  return el;
}
function labelParam(el, n) {
  el.querySelector('[data-role="range"]').setAttribute('aria-label', n);
  el.querySelector('[data-role="min"]').setAttribute('aria-label', t('pMin', { p: n }));
  el.querySelector('[data-role="max"]').setAttribute('aria-label', t('pMax', { p: n }));
  const play = el.querySelector('[data-role="play"]');
  play.setAttribute('aria-label', t(anim.has(n) ? 'pause' : 'play', { p: n }));
  play.setAttribute('aria-pressed', String(anim.has(n)));
  play.innerHTML = anim.has(n)
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3v14h-3z"/><path d="M14 5h3v14h-3z"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13 -8z"/></svg>';
}
const paramEl = n => [...$('params').children].find(el => el.dataset.p === n);
function syncParam(n, skipRange) {
  const el = paramEl(n), p = S.params[n];
  if (!el) return;
  const set = (role, v) => { const i = el.querySelector(`[data-role="${role}"]`); if (document.activeElement !== i) i.value = v; };
  set('v', inputVal(p.v)); set('min', inputVal(p.min)); set('max', inputVal(p.max));
  if (!skipRange) el.querySelector('[data-role="range"]').value = String(Math.round((p.v - p.min) / (p.max - p.min) * STEPS));
}
function setParam(n, v) {
  const p = S.params[n];
  p.v = v;
  if (v < p.min) p.min = v;
  if (v > p.max) p.max = v;
}
$('params').addEventListener('input', e => {
  const el = e.target.closest('.param'), role = e.target.dataset.role;
  if (!el) return;
  const n = el.dataset.p, p = S.params[n];
  if (role === 'range') {
    const d = decimalsFor(p);
    p.v = Number((p.min + (p.max - p.min) * Number(e.target.value) / STEPS).toFixed(d));
    syncParam(n, true);
  } else {
    const v = Tools.parseNum(e.target.value);
    if (!Number.isFinite(v)) return;
    if (role === 'v') setParam(n, v);
    else if (role === 'min') { if (v >= p.max) return; p.min = v; if (p.v < v) p.v = v; }
    else if (role === 'max') { if (v <= p.min) return; p.max = v; if (p.v > v) p.v = v; }
    syncParam(n);
  }
  renderMessages(); draw(); store();
});
$('params').addEventListener('change', e => { const el = e.target.closest('.param'); if (el && e.target.type === 'text') { const a = document.activeElement; e.target.blur(); syncParam(el.dataset.p); if (a === e.target) e.target.focus(); } });
$('params').addEventListener('click', e => {
  const b = e.target.closest('[data-role="play"]');
  if (!b) return;
  const n = b.closest('.param').dataset.p;
  if (anim.has(n)) anim.delete(n); else anim.add(n);
  labelParam(paramEl(n), n);
  Tools.diag.log('animate', { playing: anim.size });
  if (anim.size) startAnim();
});
let animFrame = 0, animLast = 0;
function startAnim() {
  if (animFrame) return;
  animLast = performance.now();
  const step = now => {
    const dt = Math.min(0.1, (now - animLast) / 1000);
    animLast = now;
    for (const n of anim) {
      const p = S.params[n], span = p.max - p.min;
      let v = p.v + span * dt / S.period;
      if (v > p.max) v = p.min + (v - p.max) % span;
      p.v = v;
      syncParam(n);
    }
    draw();
    if (anim.size) animFrame = requestAnimationFrame(step);
    else { animFrame = 0; renderMessages(); store(); }
  };
  animFrame = requestAnimationFrame(step);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && anim.size) { anim.clear(); [...$('params').children].forEach(el => labelParam(el, el.dataset.p)); }
});

/* ---------- Drawing ---------- */
const cv = $('cv');
let W = 0, H = 0, dpr = 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  W = cv.clientWidth; H = cv.clientHeight;
  cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
  if (S.equal) applyEqual();
}
const X = x => (x - V.x0) / (V.x1 - V.x0) * W;
const Y = y => H - (y - V.y0) / (V.y1 - V.y0) * H;
const xAt = px => V.x0 + px / W * (V.x1 - V.x0);
const yAt = py => V.y1 - py / H * (V.y1 - V.y0);
function applyEqual() {
  if (!W || !H) return;
  const u = (V.x1 - V.x0) / W, yc = (V.y0 + V.y1) / 2, h = u * H;
  V.y0 = yc - h / 2; V.y1 = yc + h / 2;
}
function visibleItems() {
  return C.items.map((it, i) => ({ it, i })).filter(({ it, i }) => it.kind === 'fn' && S.fns[i] && S.fns[i].on && S.fns[i].src.trim());
}
let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; paint(cv.getContext('2d'), W, H, dpr); updateViewInputs(); });
}
function paint(c, w, h, scale) {
  if (!w || !h) return;
  c.setTransform(scale, 0, 0, scale, 0, 0);
  c.fillStyle = css('--surface'); c.fillRect(0, 0, w, h);
  const P = paramValues();
  const font = css('--font') || 'sans-serif';
  // Grid: minor and major lines, axes, labels
  const sx = niceStep(V.x1 - V.x0, w, 80), sy = niceStep(V.y1 - V.y0, h, 60);
  c.lineWidth = 1;
  for (const [step, color] of [[sx / 5, '--grid'], [sx, '--grid-major']]) {
    c.strokeStyle = css(color); c.beginPath();
    for (let k = Math.ceil(V.x0 / step); k * step <= V.x1; k++) { const x = Math.round(X(k * step)) + 0.5; c.moveTo(x, 0); c.lineTo(x, h); }
    c.stroke();
  }
  for (const [step, color] of [[sy / 5, '--grid'], [sy, '--grid-major']]) {
    c.strokeStyle = css(color); c.beginPath();
    for (let k = Math.ceil(V.y0 / step); k * step <= V.y1; k++) { const y = Math.round(Y(k * step)) + 0.5; c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();
  }
  c.strokeStyle = css('--axis'); c.lineWidth = 1.5; c.beginPath();
  const ax = clamp(Math.round(X(0)) + 0.5, 0.5, w - 0.5), ay = clamp(Math.round(Y(0)) + 0.5, 0.5, h - 0.5);
  if (V.x0 <= 0 && V.x1 >= 0) { c.moveTo(ax, 0); c.lineTo(ax, h); }
  if (V.y0 <= 0 && V.y1 >= 0) { c.moveTo(0, ay); c.lineTo(w, ay); }
  c.stroke();
  c.fillStyle = css('--muted'); c.font = `12px ${font}`;
  // x labels below the x axis (or at the bottom/top edge), y labels next to the y axis
  const lx = clamp(ay + 4, 4, h - 16);
  c.textAlign = 'center'; c.textBaseline = 'top';
  for (let k = Math.ceil(V.x0 / sx); k * sx <= V.x1; k++) {
    const v = k * sx, x = X(v);
    if (Math.abs(v) < sx * 1e-6 || x < 14 || x > w - 14) continue;
    c.fillText(tickLabel(v, sx), x, lx);
  }
  const yRight = ax > w - 60;
  c.textAlign = yRight ? 'right' : 'left'; c.textBaseline = 'middle';
  const ly = yRight ? clamp(ax - 5, 30, w - 4) : clamp(ax + 5, 4, w - 40);
  for (let k = Math.ceil(V.y0 / sy); k * sy <= V.y1; k++) {
    const v = k * sy, y = Y(v);
    if (Math.abs(v) < sy * 1e-6 || y < 10 || y > h - 10) continue;
    c.fillText(tickLabel(v, sy), ly, y);
  }
  // Curves
  const vis = visibleItems();
  const N = Math.max(200, Math.ceil(w * 2));
  c.lineWidth = 2.5; c.lineJoin = 'round'; c.lineCap = 'round';
  for (const { it, i } of vis) {
    c.strokeStyle = css(colorVar(i));
    c.beginPath();
    let prev = null;
    for (let k = 0; k <= N; k++) {
      const x = V.x0 + (V.x1 - V.x0) * k / N, y = it.f(x, P);
      if (!Number.isFinite(y)) { prev = null; continue; }
      const py = clamp(Y(y), -10 * h, 11 * h), px = X(x);
      if (prev && Math.abs(py - prev.py) > h) {
        // Steep part or a pole? A pole's midpoint is not between the two neighbours.
        const ym = it.f((x + prev.x) / 2, P), pm = Y(ym);
        if (!Number.isFinite(ym) || (pm - prev.py) * (py - pm) < 0) prev = null;
      }
      if (prev) c.lineTo(px, py); else c.moveTo(px, py);
      prev = { x, py };
    }
    c.stroke();
  }
  // Zeros and extrema
  lastPts = [];
  if (S.points) {
    for (const { it, i } of vis) {
      const pts = PlotExpr.points(x => it.f(x, P), V.x0, V.x1, Math.min(600, Math.max(100, Math.round(w))));
      if (pts.length > 40) continue; // fast oscillation: markers would only clutter
      for (const p of pts) {
        lastPts.push(Object.assign({ i }, p));
        const px = X(p.x), py = Y(p.y);
        c.beginPath(); c.arc(px, py, p.type === 'zero' ? 4.5 : 4, 0, 2 * Math.PI);
        if (p.type === 'zero') { c.fillStyle = css('--surface'); c.fill(); c.strokeStyle = css(colorVar(i)); c.lineWidth = 2; c.stroke(); }
        else { c.fillStyle = css(colorVar(i)); c.fill(); }
      }
    }
  }
  // Trace cursor
  if (cursor) {
    if (cursor.snap) {
      // follow the snapped point while parameters change
      const same = lastPts.filter(p => p.i === cursor.snap.i && p.type === cursor.snap.type);
      if (same.length) cursor.x = snapX(same.reduce((a, p) => Math.abs(p.x - cursor.x) < Math.abs(a.x - cursor.x) ? p : a).x);
      else cursor.snap = null;
    }
    const px = X(cursor.x);
    c.strokeStyle = css('--muted'); c.lineWidth = 1; c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(px, 0); c.lineTo(px, h); c.stroke(); c.setLineDash([]);
    for (const { it, i } of vis) {
      const y = it.f(cursor.x, P);
      if (!Number.isFinite(y)) continue;
      c.beginPath(); c.arc(px, Y(y), 5.5, 0, 2 * Math.PI);
      c.fillStyle = css(colorVar(i)); c.fill(); c.strokeStyle = css('--surface'); c.lineWidth = 2; c.stroke();
    }
    if (c.canvas === cv) renderReadout(vis, P);
  }
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
// A found point next to 0 is 0 up to the numerical noise of the search
const snapX = x => Math.abs(x) < (V.x1 - V.x0) * 1e-7 ? 0 : x;

function renderReadout(vis, P) {
  const ul = $('readoutList');
  ul.textContent = '';
  const add = (text, color) => {
    const li = document.createElement('li');
    if (color) { const dot = document.createElement('i'); dot.style.background = `var(${color})`; li.append(dot); }
    li.append(text);
    ul.append(li);
  };
  if (cursor.snap) {
    const f = vis.find(v => v.i === cursor.snap.i);
    const y = f ? f.it.f(cursor.x, P) : NaN;
    // numerical noise around 0 (golden-section search) is shown as 0
    const tiny = (v, span) => Math.abs(v) < span * 1e-7 ? 0 : v;
    add(t('at', { what: t(cursor.snap.type), f: itemLabel(cursor.snap.i), x: fmtVal(tiny(cursor.x, V.x1 - V.x0)),
      y: fmtVal(cursor.snap.type === 'zero' ? 0 : tiny(y, V.y1 - V.y0)) }), colorVar(cursor.snap.i));
  } else add('x = ' + fmtVal(cursor.x));
  for (const { it, i } of vis) {
    if (cursor.snap && cursor.snap.i === i) continue;
    add(`${itemLabel(i)} = ${fmtVal(it.f(cursor.x, P))}`, colorVar(i));
  }
  $('readout').hidden = false;
}
function clearCursor() { cursor = null; $('readout').hidden = true; draw(); }
$('readoutClose').addEventListener('click', clearCursor);

/* ---------- Pan, zoom, tap ---------- */
const ptrs = new Map();
let gesture = null;
function zoomAt(px, py, k) {
  const x = xAt(px), y = yAt(py);
  V.x0 = x - (x - V.x0) * k; V.x1 = x + (V.x1 - x) * k;
  V.y0 = y - (y - V.y0) * k; V.y1 = y + (V.y1 - y) * k;
  draw(); store();
}
const local = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, local(e));
  const pts = [...ptrs.values()], v0 = Object.assign({}, V);
  if (pts.length === 1) gesture = { kind: 'pan', start: pts[0], v0, moved: false };
  else if (pts.length === 2) {
    const [a, b] = pts;
    gesture = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0, moved: true };
  }
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId) || !gesture) return;
  ptrs.set(e.pointerId, local(e));
  const pts = [...ptrs.values()], v0 = gesture.v0, w0 = v0.x1 - v0.x0, h0 = v0.y1 - v0.y0;
  if (gesture.kind === 'pan' && pts.length === 1) {
    const dx = pts[0].x - gesture.start.x, dy = pts[0].y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) < 6) return;
    gesture.moved = true;
    V.x0 = v0.x0 - dx / W * w0; V.x1 = V.x0 + w0;
    V.y0 = v0.y0 + dy / H * h0; V.y1 = V.y0 + h0;
    draw();
  } else if (gesture.kind === 'pinch' && pts.length >= 2) {
    const [a, b] = pts, d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const k = gesture.d0 / d, gx = v0.x0 + gesture.c0.x / W * w0, gy = v0.y1 - gesture.c0.y / H * h0;
    V.x0 = gx - cx / W * w0 * k; V.x1 = V.x0 + w0 * k;
    V.y1 = gy + cy / H * h0 * k; V.y0 = V.y1 - h0 * k;
    draw();
  }
});
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  const p = ptrs.get(e.pointerId);
  ptrs.delete(e.pointerId);
  if (gesture && gesture.kind === 'pan' && !gesture.moved && e.type === 'pointerup') tap(p);
  if (gesture && gesture.moved) store();
  // after a pinch the remaining finger continues as a pan
  if (ptrs.size === 1) gesture = { kind: 'pan', start: [...ptrs.values()][0], v0: Object.assign({}, V), moved: true };
  else if (!ptrs.size) gesture = null;
}
cv.addEventListener('pointerup', endPointer);
cv.addEventListener('pointercancel', endPointer);
cv.addEventListener('wheel', e => {
  e.preventDefault();
  const p = local(e);
  zoomAt(p.x, p.y, Math.pow(1.0015, e.deltaY * (e.deltaMode === 1 ? 30 : 1)));
}, { passive: false });
function tap(p) {
  let best = null, bd = 16;
  for (const q of lastPts) {
    const d = Math.hypot(X(q.x) - p.x, Y(q.y) - p.y);
    if (d < bd) { bd = d; best = q; }
  }
  cursor = best ? { x: snapX(best.x), snap: { i: best.i, type: best.type } } : { x: xAt(p.x), snap: null };
  Tools.diag.log('trace', { snapped: !!best });
  draw();
}
cv.addEventListener('keydown', e => {
  const w = V.x1 - V.x0, h = V.y1 - V.y0;
  const pan = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.1], ArrowDown: [0, -0.1] }[e.key];
  if (pan) { e.preventDefault(); V.x0 += pan[0] * w; V.x1 += pan[0] * w; V.y0 += pan[1] * h; V.y1 += pan[1] * h; draw(); store(); }
  else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(W / 2, H / 2, 0.8); }
  else if (e.key === '-') { e.preventDefault(); zoomAt(W / 2, H / 2, 1.25); }
  else if (e.key === 'Escape' && cursor) clearCursor();
});
$('zoomIn').addEventListener('click', () => zoomAt(W / 2, H / 2, 0.8));
$('zoomOut').addEventListener('click', () => zoomAt(W / 2, H / 2, 1.25));

/* ---------- Fit, view settings ---------- */
function fitY(quiet) {
  const P = paramValues(), vals = [];
  for (const { it } of visibleItems()) {
    for (let k = 0; k <= 400; k++) { const y = it.f(V.x0 + (V.x1 - V.x0) * k / 400, P); if (Number.isFinite(y)) vals.push(y); }
  }
  if (!vals.length) { if (!quiet) Tools.toast(t('nothingToFit')); return false; }
  vals.sort((a, b) => a - b);
  // Near a pole the outermost values run away: then ignore the outermost 2 %
  const q = vals.length > 50 ? Math.floor(vals.length * 0.02) : 0;
  let lo = vals[0], hi = vals[vals.length - 1];
  if (hi - lo > 4 * (vals[vals.length - 1 - q] - vals[q])) { lo = vals[q]; hi = vals[vals.length - 1 - q]; }
  if (hi - lo < 1e-12 * Math.max(1, Math.abs(hi))) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08;
  V.y0 = lo - pad; V.y1 = hi + pad;
  if (S.equal) {
    const u = (V.y1 - V.y0) / H, xc = (V.x0 + V.x1) / 2;
    V.x0 = xc - u * W / 2; V.x1 = xc + u * W / 2;
  }
  draw(); store();
  if (!quiet) Tools.toast(t('fitted'));
  return true;
}
$('btnFit').addEventListener('click', () => fitY(false));
function updateViewInputs() {
  for (const k of ['x0', 'x1', 'y0', 'y1']) {
    const el = $('v' + k);
    if (document.activeElement !== el) el.value = inputVal(Number(V[k].toPrecision(6)));
  }
}
$('viewApply').addEventListener('click', () => {
  const v = {};
  for (const k of ['x0', 'x1', 'y0', 'y1']) v[k] = Tools.parseNum($('v' + k).value);
  if (!okView(v)) { Tools.toast(t('badView')); return; }
  Object.assign(V, v);
  if (S.equal) applyEqual();
  draw(); store(); Tools.toast(t('viewSet'));
});
$('viewReset').addEventListener('click', () => { Object.assign(V, DEF_VIEW); if (S.equal) applyEqual(); draw(); store(); });
$('optPoints').checked = S.points;
$('optPoints').addEventListener('change', () => { S.points = $('optPoints').checked; if (!S.points && cursor) cursor.snap = null; draw(); store(); });
$('optEqual').checked = S.equal;
$('optEqual').addEventListener('change', () => { S.equal = $('optEqual').checked; if (S.equal) applyEqual(); draw(); store(); });
$('optPeriod').value = inputVal(S.period);
$('optPeriod').addEventListener('input', () => { const v = Tools.parseNum($('optPeriod').value); if (v >= 0.5 && v <= 600) { S.period = v; store(); } });

/* ---------- Save as PNG ---------- */
$('btnPng').addEventListener('click', () => {
  const k = 2, out = document.createElement('canvas');
  out.width = Math.round(W * k); out.height = Math.round(H * k);
  paint(out.getContext('2d'), W, H, k);
  out.toBlob(b => {
    if (!b) return;
    const a = document.createElement('a'), d = new Date(), p = n => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(b);
    a.download = `${isEn() ? 'plot' : 'funktionsplot'}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.png`;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    Tools.toast(t('saved'));
  }, 'image/png');
});

/* ---------- Examples ---------- */
const EXAMPLES = [
  { key: 'damped', fns: ['A e^(-γ x) cos(ω x)', 'A e^(-γ x)', '-A e^(-γ x)'], params: { A: [1, 0, 2], γ: [0.2, 0, 1], ω: [3, 0, 10] }, view: [0, 20, -1.2, 1.2] },
  { key: 'wave', fns: ['A sin(k x - ω t)', 'A sin(k x + ω t)', 'A sin(k x - ω t) + A sin(k x + ω t)'], params: { A: [1, 0, 2], k: [1, 0, 3], ω: [1, 0, 5], t: [0, 0, 6.2832] }, view: [0, 12.57, -2.5, 2.5] },
  { key: 'beat', fns: ['cos(w1 x) + cos(w2 x)', '2 cos((w1 - w2)/2 x)', '-2 cos((w1 - w2)/2 x)'], params: { w1: [10, 5, 15], w2: [11, 5, 15] }, view: [0, 20, -2.5, 2.5] },
  { key: 'planck', fns: ['x³ / (e^(x/T) - 1)', '# Wien: Maximum bei x ≈ 2,82 T'], params: { T: [1, 0.3, 2] }, view: [0, 12, -0.2, 2] },
  { key: 'taylor', fns: ['sin x', 'x - x³/3! + x^5/5! - x^7/7!', 'x - x³/3!'], params: {}, view: [-7, 7, -3, 3] },
  { key: 'fourier', fns: ['4/π (sin x + sin(3x)/3 + sin(5x)/5 + sin(7x)/7 + sin(9x)/9)', 'sign(sin x)'], params: {}, view: [-7, 7, -1.6, 1.6] },
  { key: 'gauss', fns: ['1/(σ √(2π)) e^(-(x - μ)²/(2σ²))', '1/2 (1 + erf((x - μ)/(σ √2)))'], params: { μ: [0, -3, 3], σ: [1, 0.2, 3] }, view: [-5, 5, -0.2, 1.2] },
  { key: 'deriv', fns: ['f(x) = x³ - 3x', "f'(x)", "f''(x)"], params: {}, view: [-3, 3, -6, 6] },
  { key: 'lj', fns: ['4 ε ((σ/x)^12 - (σ/x)^6)'], params: { ε: [1, 0.2, 2], σ: [1, 0.5, 1.5] }, view: [0.5, 3, -1.5, 1.5] },
  { key: 'throw', fns: ['g = 9,81', 'y(x) = tan(α) x - g/(2 v0² cos(α)²) x²'], params: { α: [0.785, 0, 1.57], v0: [10, 1, 20] }, view: [0, 12, -1, 6] },
];
function fillExamples() {
  const sel = $('examples');
  [...sel.options].slice(1).forEach(o => o.remove());
  for (const ex of EXAMPLES) sel.add(new Option(t('ex.' + ex.key), ex.key));
}
function loadExample(ex) {
  // in English the decimal comma of "g = 9,81" would still work – show it the English way
  S.fns = ex.fns.map(src => ({ src: isEn() ? src.replace(/(\d),(\d)/g, '$1.$2') : src, on: true }));
  for (const [n, [v, min, max]] of Object.entries(ex.params)) S.params[n] = { v, min, max };
  [V.x0, V.x1, V.y0, V.y1] = ex.view;
  if (S.equal) applyEqual();
  anim.clear(); cursor = null; $('readout').hidden = true;
  C = PlotExpr.compile(S.fns.map(f => f.src));
  renderFns(); renderParams(); draw(); store();
  Tools.diag.log('example', ex.key);
}
$('examples').addEventListener('change', () => {
  const ex = EXAMPLES.find(e => e.key === $('examples').value);
  $('examples').value = '';
  if (!ex) return;
  loadExample(ex);
  Tools.toast(t('exampleLoaded', { n: t('ex.' + ex.key) }));
});

/* ---------- WebMCP (see AGENTS.md "WebMCP") ---------- */
const lineInfo = (it, i) => {
  const o = { line: i + 1, expression: S.fns[i].src };
  if (it.kind === 'error') o.error = t('err.' + it.error, { a: it.arg || '' });
  else if (it.kind === 'const') o.constant = it.name;
  else if (it.kind === 'fn' && it.name) o.name = it.name;
  return o;
};
const num = v => Number.isFinite(v) ? v : null;
Tools.mcp.register({
  name: 'set_functions', title: 'Plot functions', label: 'mcp.set',
  description: 'Replaces the functions shown in the plotter (one expression per entry, variable x, e.g. "a sin(b x)", "f(x) = x^3 - 3x", "f\'(x)", "g = 9.81"). Unknown names become parameters with sliders (a name used before keeps its value, a new one starts at 1 with the range -5 to 5). Optionally sets the visible x range; the y axis is then fitted to the curves. Returns each line with an error message where it could not be parsed, and the parameters with their values.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['functions'],
    properties: {
      functions: { type: 'array', maxItems: MAX_FNS, items: { type: 'string', maxLength: 300 }, description: 'Expressions, one per curve. Use ";" to separate function arguments, e.g. max(x; 0).' },
      x_min: { type: 'number', minimum: -1e12, maximum: 1e12 }, x_max: { type: 'number', minimum: -1e12, maximum: 1e12 },
    },
  },
  execute: ({ functions, x_min, x_max }) => {
    if ((x_min === undefined) !== (x_max === undefined)) throw new Error('Give both x_min and x_max, or neither.');
    if (x_min !== undefined && !(x_max > x_min)) throw new Error('x_max must be greater than x_min.');
    S.fns = (functions.length ? functions : ['']).map(src => ({ src, on: true }));
    if (x_min !== undefined) { V.x0 = x_min; V.x1 = x_max; }
    anim.clear(); cursor = null; $('readout').hidden = true;
    C = PlotExpr.compile(S.fns.map(f => f.src));
    renderFns(); renderParams();
    fitY(true);
    draw(); store();
    const P = paramValues();
    return { lines: C.items.map(lineInfo), parameters: Object.fromEntries(C.params.map(n => [n, P[n]])),
      view: { x_min: V.x0, x_max: V.x1, y_min: V.y0, y_max: V.y1 } };
  },
});
Tools.mcp.register({
  name: 'set_parameter', title: 'Set a parameter', label: 'mcp.param',
  description: 'Sets the value of a parameter (a slider of the plotter, e.g. "a" in "a sin(b x)") and optionally its slider range. Returns the parameter.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['name', 'value'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 40 },
      value: { type: 'number', minimum: -1e12, maximum: 1e12 },
      min: { type: 'number', minimum: -1e12, maximum: 1e12 }, max: { type: 'number', minimum: -1e12, maximum: 1e12 },
    },
  },
  execute: ({ name, value, min, max }) => {
    if (!C.params.includes(name)) throw new Error(`Unknown parameter "${name}". Parameters: ${C.params.join(', ') || 'none'}.`);
    const p = S.params[name];
    const lo = min !== undefined ? min : p.min, hi = max !== undefined ? max : p.max;
    if (!(hi > lo)) throw new Error('max must be greater than min.');
    p.min = lo; p.max = hi; setParam(name, value);
    anim.delete(name); labelParam(paramEl(name), name);
    syncParam(name); renderMessages(); draw(); store();
    return { name, value: p.v, min: p.min, max: p.max };
  },
});
Tools.mcp.register({
  name: 'evaluate', title: 'Evaluate the functions', label: 'mcp.eval', readOnly: true,
  description: 'Evaluates every plotted function at x with the current parameter values. Returns one entry per line (value null where the function is not defined there), plus the parameters and the zeros and extrema of each curve in the visible x range.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['x'], properties: { x: { type: 'number', minimum: -1e12, maximum: 1e12 } } },
  execute: ({ x }) => {
    const P = paramValues();
    cursor = { x, snap: null }; draw();
    return {
      x, parameters: Object.fromEntries(C.params.map(n => [n, P[n]])),
      lines: C.items.map((it, i) => {
        const o = lineInfo(it, i);
        if (it.kind === 'fn') {
          o.value = num(it.f(x, P));
          o.points = PlotExpr.points(v => it.f(v, P), V.x0, V.x1, 600).slice(0, 20).map(p => ({ type: p.type, x: p.x, y: p.y }));
        } else if (it.kind === 'const') o.value = num(it.f(0, P));
        return o;
      }),
    };
  },
});

/* ---------- Start ---------- */
Tools.diag.info(() => ({ functions: S.fns.length, errors: C.items.filter(i => i.kind === 'error').length, params: C.params.length, animating: anim.size, canvas: [W, H, dpr] }));
fillExamples();
renderFns(); renderParams();
new ResizeObserver(() => { resize(); draw(); }).observe($('plot'));
resize(); draw();
Tools.onLang(() => {
  fillExamples(); renderFns();
  [...$('params').children].forEach(el => { labelParam(el, el.dataset.p); syncParam(el.dataset.p); });
  $('optPeriod').value = inputVal(S.period);
  draw();
});
})();
