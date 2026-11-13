/* Videoanalyse – page: open video, step through frames, set scale/origin/points (with loupe), automatic tracking,
   results (graph, fit, table, CSV), keeping the work over a reload (Tools.keep), WebMCP.
   Calculations without DOM are in analysis.js (window.VideoMath). */
(function () {
'use strict';
const { $, load, save, t, fmt } = Tools;
const M = window.VideoMath;

Tools.i18n({
  de: {
    frame: 'Bild {k} von {n}', time: 't = {t} s', noVideo: 'Dieses Video lässt sich im Browser nicht abspielen.',
    loading: 'Video wird geladen …', notVideo: 'Das ist kein Video.',
    'hint.scale0': 'Erstes Ende des Gegenstands bekannter Länge antippen.', 'hint.scale1': 'Jetzt das zweite Ende antippen.',
    'hint.scale2': 'Maßstab: {px} Pixel = {len}. Antippen verschiebt das nähere Ende; Länge unten eintragen.',
    'hint.origin': 'Nullpunkt antippen – x nach rechts, y nach oben.', 'hint.track': 'Das Objekt antippen – danach geht es {s} Bild(er) weiter.',
    'hint.trackDone': 'Punkt gesetzt. Weiter mit dem nächsten Bild.', 'hint.end': 'Letztes Bild erreicht.',
    'hint.needPoint': 'Erst das Objekt in diesem Bild antippen, dann automatisch verfolgen.',
    'hint.lost': 'Objekt verloren in Bild {k} – dort neu antippen und erneut starten.', 'hint.tracking': 'Verfolge … Bild {k}',
    'hint.flat': 'An dieser Stelle ist kein Muster zu erkennen – auf eine Kante oder Markierung des Objekts tippen.',
    'hint.tracked': '{n} Bilder automatisch verfolgt.', stop: 'Stopp', auto: 'Automatisch verfolgen',
    detected: '(erkannt: {f})', noScale: 'ohne Maßstab – Werte in Pixeln', scaleInfo: 'Maßstab {px} px = {len}',
    points: '{n} Punkte', point1: '1 Punkt', clearAsk: 'Alle Messpunkte dieses Videos löschen?', closeAsk: 'Video schließen? Punkte und Maßstab werden verworfen.',
    copied: 'Tabelle kopieren', copyOk: 'Tabelle kopiert', copyFail: 'Kopieren nicht möglich', restored: 'Letztes Video wiederhergestellt',
    keptBad: 'Das gespeicherte Video ließ sich nicht öffnen und wurde verworfen.',
    'fit.few': 'Für diese Ausgleichskurve sind mehr Punkte nötig.', 'fit.fail': 'Keine Ausgleichskurve gefunden.',
    'fit.lin': 'y = a + b·{x}', 'fit.quad': 'y = c₀ + c₁·{x} + c₂·{x}²', 'fit.sine': 'y = A·sin(ω{x} + φ) + c',
    slope: 'Steigung b', icpt: 'Achsenabschnitt a', accel: 'Beschleunigung 2c₂', period: 'Periode T = 2π/ω', amp: 'Amplitude A', mid: 'Mittellage c',
    file: 'videoanalyse', 'mcp.read': 'Messwerte gelesen', 'mcp.fit': 'Ausgleichskurve gewählt',
  },
  en: {
    title: 'Video Analysis', sub: 'Measure motion in a video', loadH: 'Open video',
    loadIntro: 'Choose or record a short video of a motion – e.g. a falling ball, a pendulum, a rolling car. With a tripod, from the side and with an object of known length in the picture.',
    choose: 'Choose video', record: 'Record video', videoH: 'Video', ovLabel: 'Video with marks. Tapping sets the scale, origin or a point, depending on the mode.',
    back10: '10 frames back', back1: '1 frame back', fwd1: '1 frame forward', fwd10: '10 frames forward', seekLabel: 'Frame in the video',
    modeLabel: 'What a tap on the video sets', modeScale: 'Scale', modeOrigin: 'Origin', modeTrack: 'Points',
    auto: 'Track automatically', delPoint: 'Delete point in this frame', calH: 'Scale & time', lenL: 'Length of the scale', unitL: 'Unit',
    fpsL: 'Frame rate of the file (fps)', slowL: 'Slow-motion factor', stepL: 'After each point move on by (frames)',
    rotateL: 'x axis along the scale (for a tilted camera)', closeVideo: 'Close video', resH: 'Measurements', qtyL: 'Graph',
    'q.y': 'y over t', 'q.x': 'x over t', 'q.vy': 'vy over t', 'q.vx': 'vx over t', 'q.v': 'speed v over t', 'q.path': 'Path: y over x',
    modelL: 'Fit', 'm.none': 'none', 'm.lin': 'linear', 'm.quad': 'quadratic (projectile, fall)', 'm.sine': 'sine (oscillation)',
    graphLabel: 'Graph of the measurements with fitted curve', tableCap: 'Measured points', csv: 'Save CSV', copy: 'Copy table', clearPts: 'Delete all points',
    frame: 'Frame {k} of {n}', time: 't = {t} s', noVideo: 'This video cannot be played in the browser.',
    loading: 'Loading video …', notVideo: 'This is not a video.',
    'hint.scale0': 'Tap the first end of the object of known length.', 'hint.scale1': 'Now tap the second end.',
    'hint.scale2': 'Scale: {px} pixels = {len}. Tapping moves the nearer end; enter the length below.',
    'hint.origin': 'Tap the zero point – x to the right, y upwards.', 'hint.track': 'Tap the object – then it moves on by {s} frame(s).',
    'hint.trackDone': 'Point set. On to the next frame.', 'hint.end': 'Last frame reached.',
    'hint.needPoint': 'First tap the object in this frame, then track automatically.',
    'hint.lost': 'Lost the object in frame {k} – tap it there and start again.', 'hint.tracking': 'Tracking … frame {k}',
    'hint.flat': 'There is no pattern to follow at this spot – tap an edge or mark of the object.',
    'hint.tracked': '{n} frames tracked automatically.', stop: 'Stop',
    detected: '(detected: {f})', noScale: 'no scale – values in pixels', scaleInfo: 'scale {px} px = {len}',
    points: '{n} points', point1: '1 point', clearAsk: 'Delete all points of this video?', closeAsk: 'Close the video? Points and scale are discarded.',
    copied: 'Copy table', copyOk: 'Table copied', copyFail: 'Copying is not possible', restored: 'Last video restored',
    keptBad: 'The kept video could not be opened and was discarded.',
    'fit.few': 'This fit needs more points.', 'fit.fail': 'No fit found.',
    'fit.lin': 'y = a + b·{x}', 'fit.quad': 'y = c₀ + c₁·{x} + c₂·{x}²', 'fit.sine': 'y = A·sin(ω{x} + φ) + c',
    slope: 'Slope b', icpt: 'Intercept a', accel: 'Acceleration 2c₂', period: 'Period T = 2π/ω', amp: 'Amplitude A', mid: 'Centre c',
    file: 'video-analysis', 'mcp.read': 'measurements read', 'mcp.fit': 'fit chosen',
  },
});

/* ---------- State ---------- */
const LS = 'video-analysis.settings.v1';
const settings = Object.assign({ step: 1, qty: 'y', model: 'none' }, load(LS, {}) || {});
const storeSettings = () => save(LS, settings);
const blank = () => ({ points: {}, cal: { a: null, b: null, len: 1, unit: 1, origin: null, rotate: false }, fps: 30, fpsAuto: null, slow: 1, mode: 'track', frame: 0 });
let A = blank();          // analysis of the open video (kept next to it in Tools.keep)
let file = null, nFrames = 0, vw = 0, vh = 0, openToken = 0;
const vid = $('vid'), ov = $('ov'), loupe = $('loupe');
const frameCv = document.createElement('canvas'); // current frame in full resolution (loupe)
let keepTimer = 0;
function keepState() {
  clearTimeout(keepTimer);
  keepTimer = setTimeout(() => { if (file) Tools.keep.putJson('state', A); }, 300);
}

/* ---------- Numbers ---------- */
const isEn = () => Tools.lang() === 'en';
const unitName = () => ({ 1: 'm', 0.01: 'cm', 0.001: 'mm' })[A.cal.unit] || 'm';
const hasScale = () => !!(A.cal.a && A.cal.b && A.cal.len > 0 && Math.hypot(A.cal.b.x - A.cal.a.x, A.cal.b.y - A.cal.a.y) > 0);
const cal = () => Object.assign({}, A.cal, { len: A.cal.len * A.cal.unit, origin: A.cal.origin || { x: 0, y: vh } });
const sig = (v, n) => {
  if (!Number.isFinite(v)) return '–';
  if (v === 0) return '0';
  return fmt(v, Math.max(0, Math.min(8, n - 1 - Math.floor(Math.log10(Math.abs(v))))));
};
// value ± error, rounded to two significant digits of the error
function pm(v, e) {
  if (!Number.isFinite(e) || e <= 0) return sig(v, 4);
  const d = Math.max(0, Math.min(10, 1 - Math.floor(Math.log10(e))));
  return `${fmt(v, d)} ± ${fmt(e, d)}`;
}
// with up to n significant digits, without trailing zeros ("1 m", "2,5 cm")
function short(v, n) {
  const str = sig(v, n), dec = isEn() ? '.' : ',';
  return str.includes(dec) ? str.replace(/0+$/, '').replace(new RegExp('\\' + dec + '$'), '') : str;
}
const inputVal = v => { const s = String(Number(Number(v).toPrecision(8))); return isEn() ? s : s.replace('.', ','); };

/* ---------- Opening a video ---------- */
function fitBox() {
  // the box keeps the video's aspect ratio and at most 60 % of the screen height
  const r = vw / vh;
  $('vbox').style.aspectRatio = `${vw} / ${vh}`;
  $('vbox').style.width = `min(100%, calc(60vh * ${r}))`;
  requestAnimationFrame(drawOverlay);
}
async function openVideo(f, restored) {
  const token = ++openToken;
  if (!f || !(/^video\//.test(f.type) || /\.(mp4|m4v|mov|webm|mkv|3gp)$/i.test(f.name || ''))) { $('loadHint').textContent = t('notVideo'); return false; }
  $('loadHint').textContent = t('loading'); $('loadHint').className = 'hint';
  stopAuto();
  if (vid.src) URL.revokeObjectURL(vid.src);
  vid.src = URL.createObjectURL(f);
  try {
    await new Promise((res, rej) => {
      const ok = () => { off(); res(); }, bad = () => { off(); rej(new Error('media')); };
      const off = () => { vid.removeEventListener('loadedmetadata', ok); vid.removeEventListener('error', bad); };
      vid.addEventListener('loadedmetadata', ok); vid.addEventListener('error', bad);
    });
    if (!vid.videoWidth) throw new Error('no picture');
  } catch (e) {
    if (token !== openToken) return false;
    Tools.diag.log('video failed', { type: f.type, size: f.size, error: String(e && e.message || e), code: vid.error && vid.error.code });
    $('loadHint').textContent = t('noVideo'); $('loadHint').className = 'hint warn';
    return false;
  }
  if (token !== openToken) return false;
  file = f; vw = vid.videoWidth; vh = vid.videoHeight;
  if (!restored) {
    A = blank();
    A.fpsAuto = await detectFps();
    if (token !== openToken) return false;
    A.fps = A.fpsAuto || 30;
  }
  nFrames = Math.max(1, Math.floor(vid.duration * A.fps + 1e-6));
  Tools.diag.log('video opened', { type: f.type, sizeMB: Math.round(f.size / 1e5) / 10, w: vw, h: vh, duration: Math.round(vid.duration * 1000) / 1000, fps: A.fps, fpsAuto: A.fpsAuto, restored: !!restored });
  frameCv.width = vw; frameCv.height = vh;
  $('loadCard').hidden = true;
  $('videoCard').hidden = false; $('calCard').hidden = false; $('resCard').hidden = false;
  $('loadHint').textContent = '';
  fitBox(); fillCal(); setMode(A.mode || 'track');
  $('seek').max = String(nFrames - 1);
  await seek(Math.min(A.frame || 0, nFrames - 1));
  renderResults();
  if (!restored) { Tools.keep.put('video', f); Tools.keep.putJson('state', A); }
  return true;
}
// Frame rate: let the video run a few frames and look at the media times (requestVideoFrameCallback)
async function detectFps() {
  if (!('requestVideoFrameCallback' in HTMLVideoElement.prototype)) return null;
  const times = [];
  try {
    vid.muted = true;
    const done = new Promise(res => {
      const tick = (now, meta) => { times.push(meta.mediaTime); if (times.length >= 12) res(); else vid.requestVideoFrameCallback(tick); };
      vid.requestVideoFrameCallback(tick);
      setTimeout(res, 2500);
      vid.addEventListener('ended', res, { once: true });
    });
    await vid.play();
    await done;
  } catch (e) { Tools.diag.log('fps detection failed', String(e && e.message || e)); }
  vid.pause();
  const d = times.slice(1).map((v, i) => v - times[i]).filter(x => x > 1e-4).sort((a, b) => a - b);
  if (d.length < 3) return null;
  let fps = 1 / d[Math.floor(d.length / 2)];
  // NTSC rates (29,97 = 30000/1001 …) are told apart from the round ones by the exact frame duration
  const ntsc = [23.976, 29.97, 59.94, 119.88].find(c => Math.abs(fps - c) < 0.01);
  if (ntsc) fps = ntsc;
  else for (const c of [24, 25, 30, 48, 50, 60, 90, 100, 120, 240, 480]) if (Math.abs(fps - c) / c < 0.02) fps = c;
  return Math.round(fps * 100) / 100;
}
function closeVideo() {
  stopAuto();
  openToken++;
  file = null; A = blank(); nFrames = 0;
  if (vid.src) { URL.revokeObjectURL(vid.src); vid.removeAttribute('src'); vid.load(); }
  Tools.keep.clear();
  $('loadCard').hidden = false;
  $('videoCard').hidden = true; $('calCard').hidden = true; $('resCard').hidden = true;
  $('fileIn').value = ''; $('camIn').value = '';
}
for (const id of ['fileIn', 'camIn']) $(id).addEventListener('change', e => { const f = e.target.files[0]; if (f) openVideo(f); });
$('closeVideo').addEventListener('click', () => { if (confirm(t('closeAsk'))) closeVideo(); });

/* ---------- Frames ---------- */
let seekTarget = null, seeking = false;
const frameTime = k => (k + 0.5) / A.fps; // middle of the frame: the decoder shows exactly frame k
function waitSeeked() {
  return new Promise(res => {
    const done = () => { clearTimeout(to); vid.removeEventListener('seeked', done); res(); };
    const to = setTimeout(done, 4000);
    vid.addEventListener('seeked', done);
  });
}
function presented() {
  if (!('requestVideoFrameCallback' in vid)) return Promise.resolve(null);
  return new Promise(res => {
    const id = vid.requestVideoFrameCallback((now, meta) => { clearTimeout(to); res(meta.mediaTime); });
    const to = setTimeout(() => { vid.cancelVideoFrameCallback(id); res(null); }, 400);
  });
}
async function seek(k) {
  seekTarget = Math.max(0, Math.min(nFrames - 1, Math.round(k)));
  if (seeking) return seekDone;
  seeking = true;
  seekDone = (async () => {
    while (seekTarget !== null) {
      const target = seekTarget;
      seekTarget = null;
      const time = Math.min(frameTime(target), Math.max(0, vid.duration - 1e-3));
      if (Math.abs(vid.currentTime - time) > 1e-6 || vid.readyState < 2) {
        // "seeked" can come before the new picture is ready to be drawn (seen under load):
        // also wait until the frame is presented (requestVideoFrameCallback, registered before seeking)
        const shown = presented();
        vid.currentTime = time;
        await waitSeeked();
        const mt = await shown;
        if (mt != null && Math.abs(mt * A.fps - target) > 0.5) Tools.diag.log('seek: other frame presented', { target, got: Math.round(mt * A.fps * 100) / 100 });
      }
      A.frame = target;
      grab();
    }
    seeking = false;
    showFrame(); drawOverlay(); markRow(); keepState();
  })();
  return seekDone;
}
let seekDone = Promise.resolve();
function grab() {
  try { frameCv.getContext('2d').drawImage(vid, 0, 0, vw, vh); } catch (_) { /* not decoded yet */ }
}
function showFrame() {
  const k = A.frame, rows = M.series(A.points, cal(), A.fps, A.slow);
  const t0 = rows.length ? rows[0].frame : 0;
  const tt = (k - t0) / (A.fps * A.slow);
  $('frameInfo').innerHTML = '';
  $('frameInfo').append(t('frame', { k: k + 1, n: nFrames }));
  const sm = document.createElement('small');
  sm.textContent = t('time', { t: fmt(tt, 3) });
  $('frameInfo').append(sm);
  $('seek').value = String(k);
  $('back1').disabled = $('back10').disabled = k <= 0;
  $('fwd1').disabled = $('fwd10').disabled = k >= nFrames - 1;
  $('delPoint').disabled = !A.points[k];
}
$('back1').addEventListener('click', () => seek(A.frame - 1));
$('back10').addEventListener('click', () => seek(A.frame - 10));
$('fwd1').addEventListener('click', () => seek(A.frame + 1));
$('fwd10').addEventListener('click', () => seek(A.frame + 10));
$('seek').addEventListener('input', () => seek(Number($('seek').value)));
document.addEventListener('keydown', e => {
  if ($('videoCard').hidden || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === 'ArrowRight' || e.key === '.') { e.preventDefault(); seek(A.frame + 1); }
  else if (e.key === 'ArrowLeft' || e.key === ',') { e.preventDefault(); seek(A.frame - 1); }
});

/* ---------- Modes and hints ---------- */
function setMode(m) {
  A.mode = m;
  document.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m)));
  hint();
  drawOverlay(); keepState();
}
document.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
function hint(key, vars, warn) {
  let text;
  if (key) text = t(key, vars);
  else if (A.mode === 'scale') {
    const c = A.cal;
    text = !c.a ? t('hint.scale0') : !c.b ? t('hint.scale1')
      : t('hint.scale2', { px: fmt(Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y), 1), len: `${short(c.len, 4)} ${unitName()}` });
  } else if (A.mode === 'origin') text = t('hint.origin');
  else text = t('hint.track', { s: settings.step });
  $('hint').textContent = text;
  $('hint').className = 'hint' + (warn ? ' warn' : '');
}

/* ---------- Overlay and loupe ---------- */
function boxScale() { const r = ov.getBoundingClientRect(); return { r, s: r.width / vw }; }
function drawOverlay() {
  if (!vw) return;
  const { r, s } = boxScale(), dpr = window.devicePixelRatio || 1;
  if (!r.width) return;
  ov.width = Math.round(r.width * dpr); ov.height = Math.round(r.height * dpr);
  const c = ov.getContext('2d');
  c.setTransform(dpr * s, 0, 0, dpr * s, 0, 0); // draw in video pixels
  const px = 1 / s; // one screen pixel in video pixels
  const css = getComputedStyle(document.documentElement);
  const ptColor = css.getPropertyValue('--pt').trim() || '#e11d48';
  const halo = (draw, w) => { c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = (w + 2.5) * px; draw(); c.stroke(); c.lineWidth = w * px; };
  // Track: path and points
  const frames = Object.keys(A.points).map(Number).sort((a, b) => a - b);
  if (frames.length > 1) {
    const path = () => { c.beginPath(); frames.forEach((f, i) => { const p = A.points[f]; i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }); };
    halo(path, 1.5); c.strokeStyle = ptColor; path(); c.stroke();
  }
  for (const f of frames) {
    const p = A.points[f], cur = f === A.frame, rad = (cur ? 7 : 3) * px;
    c.beginPath(); c.arc(p.x, p.y, rad, 0, 2 * Math.PI);
    c.fillStyle = cur ? 'rgba(255,255,255,.25)' : ptColor; c.fill();
    c.strokeStyle = cur ? '#fff' : 'rgba(0,0,0,.7)'; c.lineWidth = (cur ? 2.5 : 1) * px; c.stroke();
    if (cur) { c.beginPath(); c.moveTo(p.x - 12 * px, p.y); c.lineTo(p.x + 12 * px, p.y); c.moveTo(p.x, p.y - 12 * px); c.lineTo(p.x, p.y + 12 * px); c.strokeStyle = ptColor; c.lineWidth = 1.5 * px; c.stroke(); }
  }
  // Scale line with end ticks and label
  const { a, b } = A.cal;
  c.font = `${13 * px}px ${css.getPropertyValue('--font')}`;
  if (a) {
    const yellow = '#facc15';
    const ends = b ? [a, b] : [a];
    if (b) {
      const line = () => { c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); };
      halo(line, 2.5); c.strokeStyle = yellow; line(); c.stroke();
    }
    for (const e of ends) { c.beginPath(); c.arc(e.x, e.y, 5 * px, 0, 2 * Math.PI); c.fillStyle = yellow; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1.5 * px; c.stroke(); }
    if (b) {
      const label = `${short(A.cal.len, 4)} ${unitName()}`, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - 10 * px;
      c.textAlign = 'center'; c.lineWidth = 3 * px; c.strokeStyle = '#000'; c.strokeText(label, mx, my); c.fillStyle = yellow; c.fillText(label, mx, my);
    }
  }
  // Axes at the origin (shown in origin mode or when set)
  if (A.cal.origin || A.mode === 'origin') {
    const o = cal().origin, L = 50 * px;
    let ux = 1, uy = 0;
    if (A.cal.rotate && a && b) { const d = Math.hypot(b.x - a.x, b.y - a.y) || 1; ux = (b.x - a.x) / d; uy = (b.y - a.y) / d; }
    const arrow = (dx, dy, label) => {
      const ex = o.x + dx * L, ey = o.y + dy * L;
      const shape = () => { c.beginPath(); c.moveTo(o.x, o.y); c.lineTo(ex, ey); c.moveTo(ex, ey); c.lineTo(ex - (dx * 8 - dy * 5) * px, ey - (dy * 8 + dx * 5) * px); c.moveTo(ex, ey); c.lineTo(ex - (dx * 8 + dy * 5) * px, ey - (dy * 8 - dx * 5) * px); };
      halo(shape, 2); c.strokeStyle = '#22d3ee'; shape(); c.stroke();
      c.textAlign = 'center'; c.lineWidth = 3 * px; c.strokeStyle = '#000'; c.strokeText(label, ex + dx * 10 * px, ey + dy * 10 * px + 4 * px);
      c.fillStyle = '#22d3ee'; c.fillText(label, ex + dx * 10 * px, ey + dy * 10 * px + 4 * px);
    };
    arrow(ux, uy, 'x'); arrow(uy, -ux, 'y');
  }
}
window.addEventListener('resize', () => requestAnimationFrame(drawOverlay));

let touch = null; // { id, pos (video px), type }
const toVideo = e => { const { r, s } = boxScale(); return { x: Math.max(0, Math.min(vw, (e.clientX - r.left) / s)), y: Math.max(0, Math.min(vh, (e.clientY - r.top) / s)) }; };
function showLoupe(p, type) {
  const { r, s } = boxScale(), size = 132, zoom = 3;
  // above the finger (touch) or to the upper right of the mouse, inside the box
  let lx = p.x * s - size / 2, ly = p.y * s - size - (type === 'touch' ? 70 : 24);
  if (type !== 'touch') lx = p.x * s + 24;
  if (ly < 0) ly = Math.min(r.height - size, p.y * s + (type === 'touch' ? 70 : 24));
  lx = Math.max(0, Math.min(r.width - size, lx));
  loupe.style.left = lx + 'px'; loupe.style.top = Math.max(0, ly) + 'px';
  const c = loupe.getContext('2d'), W = loupe.width, src = size / 2 / (zoom * s); // half the visible region in video px
  c.fillStyle = '#000'; c.fillRect(0, 0, W, W);
  c.imageSmoothingEnabled = false;
  c.drawImage(frameCv, p.x - src, p.y - src, 2 * src, 2 * src, 0, 0, W, W);
  c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath();
  c.moveTo(W / 2, W / 2 - 22); c.lineTo(W / 2, W / 2 - 6); c.moveTo(W / 2, W / 2 + 6); c.lineTo(W / 2, W / 2 + 22);
  c.moveTo(W / 2 - 22, W / 2); c.lineTo(W / 2 - 6, W / 2); c.moveTo(W / 2 + 6, W / 2); c.lineTo(W / 2 + 22, W / 2); c.stroke();
  c.strokeStyle = '#e11d48'; c.beginPath(); c.arc(W / 2, W / 2, 2, 0, 2 * Math.PI); c.stroke();
  loupe.hidden = false;
}
ov.addEventListener('pointerdown', e => {
  if (!vw || auto) return;
  e.preventDefault();
  ov.setPointerCapture(e.pointerId);
  touch = { id: e.pointerId, pos: toVideo(e), type: e.pointerType };
  showLoupe(touch.pos, touch.type);
});
ov.addEventListener('pointermove', e => {
  if (!touch || touch.id !== e.pointerId) return;
  touch.pos = toVideo(e);
  showLoupe(touch.pos, touch.type);
});
ov.addEventListener('pointerup', e => {
  if (!touch || touch.id !== e.pointerId) return;
  const p = touch.pos;
  touch = null; loupe.hidden = true;
  place(p);
});
ov.addEventListener('pointercancel', () => { touch = null; loupe.hidden = true; });

function place(p) {
  const pt = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
  if (A.mode === 'scale') {
    const c = A.cal;
    if (!c.a) c.a = pt;
    else if (!c.b) c.b = pt;
    else if (Math.hypot(pt.x - c.a.x, pt.y - c.a.y) < Math.hypot(pt.x - c.b.x, pt.y - c.b.y)) c.a = pt; else c.b = pt;
    Tools.diag.log('scale point', { set: c.b ? 2 : 1 });
    hint(); drawOverlay(); renderResults(); keepState();
  } else if (A.mode === 'origin') {
    A.cal.origin = pt;
    hint(); drawOverlay(); renderResults(); keepState();
  } else {
    A.points[A.frame] = pt;
    renderResults(); keepState();
    if (A.frame + settings.step <= nFrames - 1) { hint('hint.trackDone'); seek(A.frame + settings.step); }
    else { hint('hint.end'); drawOverlay(); showFrame(); }
  }
}
$('delPoint').addEventListener('click', () => {
  delete A.points[A.frame];
  showFrame(); drawOverlay(); renderResults(); keepState();
});

/* ---------- Automatic tracking ---------- */
let auto = false;
const work = document.createElement('canvas');
function grey(ws) {
  const w = Math.max(1, Math.round(vw * ws)), h = Math.max(1, Math.round(vh * ws));
  if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }
  const c = work.getContext('2d', { willReadFrequently: true });
  c.drawImage(vid, 0, 0, w, h);
  const d = c.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  return { g, w, h };
}
// Smallest patch radius around the point that has enough contrast to follow
function patchRadius(img, p) {
  for (const r of [6, 8, 10, 13, 16, 20, 25]) {
    const x0 = Math.round(p.x), y0 = Math.round(p.y);
    if (x0 - r < 0 || y0 - r < 0 || x0 + r >= img.w || y0 + r >= img.h) return null;
    let s = 0, s2 = 0, n = 0;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const v = img.g[(y0 + y) * img.w + x0 + x]; s += v; s2 += v * v; n++; }
    if (Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) > 12) return r;
  }
  return null;
}
function stopAuto() { auto = false; }
async function runAuto() {
  const start = A.points[A.frame];
  if (!start) { hint('hint.needPoint', null, true); return; }
  const step = settings.step, ws = Math.min(1, 640 / Math.max(vw, vh));
  let img = grey(ws), p = { x: start.x * ws, y: start.y * ws };
  const r = patchRadius(img, p);
  if (!r) { hint('hint.flat', null, true); return; }
  auto = true;
  $('auto').textContent = t('stop');
  const prev = A.points[A.frame - step];
  let vel = prev ? { x: (start.x - prev.x) * ws, y: (start.y - prev.y) * ws } : { x: 0, y: 0 };
  let n = 0, lost = null, reanchored = 0;
  // The pattern of the first frame is the reference (no creeping drift); if the object changes its look
  // (turns, gets smaller), the previous frame takes over as the new reference.
  let anchor = { g: img.g, p };
  Tools.diag.log('auto track start', { frame: A.frame, r, ws: Math.round(ws * 1000) / 1000 });
  while (auto && A.frame + step <= nFrames - 1) {
    const k = A.frame + step;
    await seek(k);
    if (!auto) break;
    const next = grey(ws);
    const R = Math.round(Math.min(80, Math.max(16, 1.5 * r + 0.5 * Math.hypot(vel.x, vel.y))));
    const guess = { x: p.x + vel.x, y: p.y + vel.y };
    let res = M.track(anchor.g, next.g, img.w, img.h, anchor.p, guess, r, R);
    if (!res || res.score < 0.85) {
      const alt = anchor.g === img.g ? null : M.track(img.g, next.g, img.w, img.h, p, guess, r, R);
      if (alt && (!res || alt.score > res.score)) { res = alt; anchor = { g: next.g, p: { x: alt.x, y: alt.y } }; reanchored++; }
    }
    if (!res || res.score < 0.6) { lost = k; break; }
    vel = { x: res.x - p.x, y: res.y - p.y };
    p = { x: res.x, y: res.y };
    A.points[k] = { x: Math.round(p.x / ws * 100) / 100, y: Math.round(p.y / ws * 100) / 100 };
    img = next; n++;
    drawOverlay();
    if (n % 5 === 0) { renderResults(); hint('hint.tracking', { k: k + 1 }); }
    await new Promise(requestAnimationFrame);
  }
  auto = false;
  $('auto').textContent = t('auto');
  Tools.diag.log('auto track end', { tracked: n, lostAt: lost, reanchored });
  renderResults(); showFrame(); drawOverlay(); keepState();
  if (lost != null) hint('hint.lost', { k: lost + 1 }, true);
  else hint('hint.tracked', { n });
}
$('auto').addEventListener('click', () => { if (auto) stopAuto(); else runAuto(); });

/* ---------- Scale & time settings ---------- */
function fillCal() {
  $('len').value = inputVal(A.cal.len);
  $('unit').value = String(A.cal.unit);
  $('fps').value = inputVal(A.fps);
  $('fpsAuto').textContent = A.fpsAuto ? t('detected', { f: fmt(A.fpsAuto, Number.isInteger(A.fpsAuto) ? 0 : 2) }) : '';
  $('slow').value = inputVal(A.slow);
  $('step').value = String(settings.step);
  $('rotate').checked = !!A.cal.rotate;
}
$('len').addEventListener('input', () => { const v = Tools.parseNum($('len').value); if (v > 0) { A.cal.len = v; hint(); drawOverlay(); renderResults(); keepState(); } });
$('unit').addEventListener('change', () => { A.cal.unit = Number($('unit').value); hint(); drawOverlay(); renderResults(); keepState(); });
$('fps').addEventListener('change', () => {
  const v = Tools.parseNum($('fps').value);
  if (!(v >= 1 && v <= 1000)) { $('fps').value = inputVal(A.fps); return; }
  // points are stored per frame: keep them at the same picture (frame index stays, time changes)
  A.fps = v;
  nFrames = Math.max(1, Math.floor(vid.duration * A.fps + 1e-6));
  $('seek').max = String(nFrames - 1);
  for (const f of Object.keys(A.points)) if (Number(f) >= nFrames) delete A.points[f];
  seek(Math.min(A.frame, nFrames - 1)); renderResults(); keepState();
});
$('slow').addEventListener('input', () => { const v = Tools.parseNum($('slow').value); if (v > 0 && v <= 1000) { A.slow = v; showFrame(); renderResults(); keepState(); } });
$('step').addEventListener('input', () => { const v = Math.round(Tools.parseNum($('step').value)); if (v >= 1 && v <= 100) { settings.step = v; storeSettings(); hint(); } });
$('rotate').addEventListener('change', () => { A.cal.rotate = $('rotate').checked; drawOverlay(); renderResults(); keepState(); });

/* ---------- Results: table, graph, fit ---------- */
const QTY = {
  y: { x: 't', y: 'y', ux: 's', uy: 'm' }, x: { x: 't', y: 'x', ux: 's', uy: 'm' },
  vy: { x: 't', y: 'vy', ux: 's', uy: 'm/s' }, vx: { x: 't', y: 'vx', ux: 's', uy: 'm/s' }, v: { x: 't', y: 'v', ux: 's', uy: 'm/s' },
  path: { x: 'x', y: 'y', ux: 'm', uy: 'm' },
};
// in pixels without a scale
const unit = u => hasScale() ? u : u.replace(/m/g, 'px');
function currentRows() { return M.series(A.points, cal(), A.fps, A.slow); }
function computeFit(rows, qty, model) {
  const q = QTY[qty], xs = rows.map(r => r[q.x]), ys = rows.map(r => r[q.y]);
  const ok = xs.map((x, i) => Number.isFinite(x) && Number.isFinite(ys[i]));
  const X = xs.filter((_, i) => ok[i]), Y = ys.filter((_, i) => ok[i]);
  const need = { lin: 3, quad: 4, sine: 6 }[model];
  if (!need) return null;
  if (X.length < need) return { error: 'few' };
  if (model === 'sine') {
    const f = M.sineFit(X, Y);
    return f ? { model, f, q, fn: x => f.A * Math.sin(f.omega * x + f.phi) + f.c } : { error: 'fail' };
  }
  const f = M.polyFit(X, Y, model === 'lin' ? 1 : 2);
  return f ? { model, f, q, fn: x => f.coef.reduce((a, c, k) => a + c * Math.pow(x, k), 0) } : { error: 'fail' };
}
function fitLines(res) {
  if (!res) return [];
  if (res.error) return [t('fit.' + res.error)];
  const { f, q, model } = res, ux = unit(q.ux), uy = unit(q.uy), xs = q.x;
  const r2 = `R² = ${fmt(f.r2, 5)}`;
  if (model === 'lin') return [t('fit.lin', { x: xs }), `${t('slope')} = ${pm(f.coef[1], f.err[1])} ${uy}/${ux}`, `${t('icpt')} = ${pm(f.coef[0], f.err[0])} ${uy}`, r2];
  if (model === 'quad') {
    const lines = [t('fit.quad', { x: xs })];
    if (q.x === 't') lines.push(`${t('accel')} = ${pm(2 * f.coef[2], 2 * f.err[2])} ${uy}/${ux}²`);
    lines.push(`c₂ = ${pm(f.coef[2], f.err[2])} ${uy}/${ux}²`, `c₁ = ${pm(f.coef[1], f.err[1])} ${uy}/${ux}`, `c₀ = ${pm(f.coef[0], f.err[0])} ${uy}`, r2);
    return lines;
  }
  const T = 2 * Math.PI / f.omega, eT = T * f.err.omega / f.omega;
  return [t('fit.sine', { x: xs }), `${t('period')} = ${pm(T, eT)} ${ux}`, `ω = ${pm(f.omega, f.err.omega)} 1/${ux}`,
    `${t('amp')} = ${pm(f.A, f.err.A)} ${uy}`, `${t('mid')} = ${pm(f.c, f.err.c)} ${uy}`, r2];
}
function renderResults() {
  if (!file) return;
  const rows = currentRows();
  const sc = hasScale()
    ? t('scaleInfo', { px: fmt(Math.hypot(A.cal.b.x - A.cal.a.x, A.cal.b.y - A.cal.a.y), 1), len: `${short(A.cal.len, 4)} ${unitName()}` })
    : t('noScale');
  $('summary').textContent = `${t(rows.length === 1 ? 'point1' : 'points', { n: rows.length })} · ${sc}`;
  // table
  const head = ['t (s)', `x (${unit('m')})`, `y (${unit('m')})`, `vx (${unit('m/s')})`, `vy (${unit('m/s')})`];
  $('thead').innerHTML = '';
  for (const h of head) { const th = document.createElement('th'); th.scope = 'col'; th.textContent = h; $('thead').append(th); }
  const tb = $('tbody');
  tb.textContent = '';
  const dec = hasScale() ? 4 : 1;
  for (const r of rows) {
    const tr = document.createElement('tr');
    tr.dataset.frame = r.frame;
    const td0 = document.createElement('td'), b = document.createElement('button');
    b.type = 'button'; b.textContent = fmt(r.t, 3); b.dataset.go = r.frame;
    b.setAttribute('aria-label', t('frame', { k: r.frame + 1, n: nFrames }));
    td0.append(b); tr.append(td0);
    for (const v of [r.x, r.y, r.vx, r.vy]) { const td = document.createElement('td'); td.textContent = fmt(v, dec); tr.append(td); }
    tb.append(tr);
  }
  markRow();
  for (const id of ['csv', 'copy', 'clearPts']) $(id).disabled = !rows.length;
  const res = computeFit(rows, settings.qty, settings.model);
  const ul = $('fitOut');
  ul.textContent = '';
  for (const l of fitLines(res)) { const li = document.createElement('li'); li.textContent = l; ul.append(li); }
  drawGraph(rows, res && !res.error ? res : null);
  showFrame();
}
function markRow() {
  document.querySelectorAll('#tbody tr').forEach(tr => tr.classList.toggle('cur', Number(tr.dataset.frame) === A.frame));
}
$('tbody').addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { seek(Number(b.dataset.go)); $('vbox').scrollIntoView({ block: 'nearest' }); } });
function niceStep(range, px, per) {
  const raw = range / Math.max(1, px / per), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}
function drawGraph(rows, res) {
  const cv = $('graph'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const css = getComputedStyle(document.documentElement), col = n => css.getPropertyValue(n).trim();
  const q = QTY[settings.qty];
  const pts = rows.map(r => [r[q.x], r[q.y]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  c.font = `12px ${col('--font')}`;
  c.fillStyle = col('--muted');
  if (!pts.length) return;
  let x0 = Math.min(...pts.map(p => p[0])), x1 = Math.max(...pts.map(p => p[0]));
  let y0 = Math.min(...pts.map(p => p[1])), y1 = Math.max(...pts.map(p => p[1]));
  if (x1 - x0 < 1e-12) { x0 -= 1; x1 += 1; }
  if (y1 - y0 < 1e-12) { y0 -= 1; y1 += 1; }
  const padX = (x1 - x0) * 0.05, padY = (y1 - y0) * 0.1;
  x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
  const L = 52, B = 22, T = 8, Rm = 10;
  const X = x => L + (x - x0) / (x1 - x0) * (w - L - Rm), Y = y => h - B - (y - y0) / (y1 - y0) * (h - B - T);
  c.strokeStyle = col('--border'); c.lineWidth = 1;
  const sx = niceStep(x1 - x0, w - L, 70), sy = niceStep(y1 - y0, h - B, 40);
  const dx = Math.max(0, -Math.floor(Math.log10(sx) + 1e-9)), dy = Math.max(0, -Math.floor(Math.log10(sy) + 1e-9));
  c.textAlign = 'center'; c.textBaseline = 'top';
  for (let k = Math.ceil(x0 / sx); k * sx <= x1; k++) { const x = X(k * sx); c.beginPath(); c.moveTo(x, T); c.lineTo(x, h - B); c.stroke(); c.fillText(fmt((k * sx) || 0, dx), x, h - B + 4); }
  c.textAlign = 'right'; c.textBaseline = 'middle';
  for (let k = Math.ceil(y0 / sy); k * sy <= y1; k++) { const y = Y(k * sy); c.beginPath(); c.moveTo(L, y); c.lineTo(w - Rm, y); c.stroke(); c.fillText(fmt((k * sy) || 0, dy), L - 6, y); }
  c.textAlign = 'left'; c.textBaseline = 'top';
  c.fillText(`${q.y} (${unit(q.uy)})`, L + 4, T + 2);
  c.textAlign = 'right'; c.textBaseline = 'bottom';
  c.fillText(`${q.x} (${unit(q.ux)})`, w - Rm - 2, h - B - 2);
  c.fillStyle = col('--pt');
  for (const [x, y] of pts) { c.beginPath(); c.arc(X(x), Y(y), 3.5, 0, 2 * Math.PI); c.fill(); }
  if (res) {
    // the fitted curve on top of the points, clipped to the plot area
    c.save(); c.beginPath(); c.rect(L, T, w - L - Rm, h - B - T); c.clip();
    c.strokeStyle = col('--fit'); c.lineWidth = 2.5; c.beginPath();
    for (let i = 0; i <= 200; i++) { const x = x0 + (x1 - x0) * i / 200, y = res.fn(x); i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y)); }
    c.stroke(); c.restore();
  }
}
$('qty').value = settings.qty; $('model').value = settings.model;
$('qty').addEventListener('change', () => { settings.qty = $('qty').value; storeSettings(); renderResults(); });
$('model').addEventListener('change', () => { settings.model = $('model').value; storeSettings(); renderResults(); });
new ResizeObserver(() => { if (file) { drawGraph(currentRows(), (() => { const r = computeFit(currentRows(), settings.qty, settings.model); return r && !r.error ? r : null; })()); drawOverlay(); } }).observe($('graph'));

/* ---------- Export ---------- */
function tableText(sep, withBom) {
  // numbers follow the language (German: decimal comma) – for the CSV and for pasting into a spreadsheet
  const rows = currentRows(), num = (v, d) => Number.isFinite(v) ? (isEn() ? v.toFixed(d) : v.toFixed(d).replace('.', ',')) : '';
  const head = ['t (s)', `x (${unit('m')})`, `y (${unit('m')})`, `vx (${unit('m/s')})`, `vy (${unit('m/s')})`].join(sep);
  const d = hasScale() ? 5 : 2;
  const lines = rows.map(r => [num(r.t, 4), num(r.x, d), num(r.y, d), num(r.vx, d), num(r.vy, d)].join(sep));
  return (withBom ? '﻿' : '') + [head, ...lines].join('\r\n') + '\r\n';
}
$('csv').addEventListener('click', () => {
  const a = document.createElement('a'), d = new Date(), p = n => String(n).padStart(2, '0');
  a.href = URL.createObjectURL(new Blob([tableText(isEn() ? ',' : ';', true)], { type: 'text/csv;charset=utf-8' }));
  a.download = `${t('file')}-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.csv`;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
});
$('copy').addEventListener('click', async () => {
  const ok = await Tools.copyText(tableText('\t', false));
  Tools.toast(t(ok === false ? 'copyFail' : 'copyOk'));
});
$('clearPts').addEventListener('click', () => {
  if (!confirm(t('clearAsk'))) return;
  A.points = {};
  renderResults(); drawOverlay(); keepState();
});

/* ---------- WebMCP (read and fit only: no video, no points) ---------- */
const QTYS = Object.keys(QTY), MODELS = ['none', 'lin', 'quad', 'sine'];
function fitResult(res) {
  if (!res) return null;
  if (res.error) return { error: res.error === 'few' ? 'Not enough points for this fit.' : 'No fit found.' };
  const { f, model } = res;
  if (model === 'sine') return { model, amplitude: f.A, omega: f.omega, period: 2 * Math.PI / f.omega, phase: f.phi, offset: f.c, errors: { amplitude: f.err.A, omega: f.err.omega, period: 2 * Math.PI / f.omega * f.err.omega / f.omega, offset: f.err.c }, r2: f.r2 };
  return { model, coefficients: f.coef, errors: f.err, r2: f.r2, ...(model === 'quad' && res.q.x === 't' ? { acceleration: 2 * f.coef[2], acceleration_error: 2 * f.err[2] } : {}) };
}
Tools.mcp.register({
  name: 'get_measurements', title: 'Read the measured points', label: 'mcp.read', readOnly: true,
  description: 'Returns the points the user measured in the open video: time t (s, from the first point), position x, y and velocity vx, vy (metres and m/s with a scale, otherwise pixels), the scale, frame rate and slow-motion factor, and the fit currently shown. At most 2000 points.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  execute: () => {
    if (!file) throw new Error('No video is open. Ask the user to open a video in the app.');
    const rows = currentRows();
    return {
      units: hasScale() ? { position: 'm', velocity: 'm/s' } : { position: 'px', velocity: 'px/s' },
      scale: hasScale() ? { pixels: Math.hypot(A.cal.b.x - A.cal.a.x, A.cal.b.y - A.cal.a.y), length_m: A.cal.len * A.cal.unit } : null,
      frame_rate: A.fps, slow_motion_factor: A.slow, frames: nFrames,
      points: rows.slice(0, 2000).map(r => ({ frame: r.frame + 1, t: r.t, x: r.x, y: r.y, vx: Number.isFinite(r.vx) ? r.vx : null, vy: Number.isFinite(r.vy) ? r.vy : null })),
      graph: settings.qty, fit: fitResult(computeFit(rows, settings.qty, settings.model)),
    };
  },
});
Tools.mcp.register({
  name: 'fit_data', title: 'Fit a curve to the measurements', label: 'mcp.fit',
  description: 'Shows the chosen quantity in the graph of the app and fits a curve to it: "lin" (y = a + b·t), "quad" (y = c0 + c1·t + c2·t², acceleration = 2·c2), "sine" (y = A·sin(ω·t + φ) + c) or "none". Quantities: y, x, vy, vx, v over time, or "path" (y over x). Returns the fit parameters with standard errors.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['quantity', 'model'],
    properties: { quantity: { type: 'string', enum: QTYS }, model: { type: 'string', enum: MODELS } },
  },
  execute: ({ quantity, model }) => {
    if (!file) throw new Error('No video is open. Ask the user to open a video in the app.');
    settings.qty = quantity; settings.model = model; storeSettings();
    $('qty').value = quantity; $('model').value = model;
    renderResults();
    return { quantity, fit: fitResult(computeFit(currentRows(), quantity, model)) };
  },
});

/* ---------- Start: kept work first, then a shared/opened video ---------- */
Tools.diag.info(() => ({ open: !!file, w: vw, h: vh, frames: nFrames, fps: A.fps, fpsAuto: A.fpsAuto, slow: A.slow, points: Object.keys(A.points).length, scale: hasScale(), origin: !!A.cal.origin, mode: A.mode, auto }));
(async () => {
  const kept = await Tools.keep.get('video');
  if (kept) {
    const st = await Tools.keep.json('state', null);
    if (st && st.points && st.cal) A = Object.assign(blank(), st);
    const ok = await openVideo(kept, true);
    if (ok) Tools.toast(t('restored'));
    else { Tools.keep.clear(); A = blank(); $('loadHint').textContent = t('keptBad'); }
  }
  const shared = await Tools.takeSharedFile();
  if (shared) { Tools.diag.log('shared video'); await openVideo(shared); }
})();
Tools.onLang(() => {
  if (!file) return;
  fillCal(); hint(); renderResults(); drawOverlay();
  $('auto').textContent = t(auto ? 'stop' : 'auto');
});
})();
