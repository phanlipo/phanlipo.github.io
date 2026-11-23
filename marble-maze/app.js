/* Murmel-Labyrinth – page script: level choice, game flow, tilt sensor, finger and keys, drawing, sounds, best times,
   WebMCP. Levels, physics and the tilt maths without DOM: engine.js (window.MarbleEngine). See README.md. */
(function () {
  'use strict';
  Tools.i18n({
    de: {
      paused: 'Pause', resume: 'Weiterspielen', won: 'Geschafft!', newBest: 'Neue Bestzeit!', allDone: 'Alle 30 Level geschafft!',
      nextLevel: 'Nächstes Level', levelOf: 'Level {n} von {of}', levelShort: 'Level {n}',
      desc: '{c} × {r} Felder, {h}', holes0: 'keine Löcher', holes1: '1 Loch', holesN: '{n} Löcher',
      locked: 'Erst Level {n} schaffen, dann ist dieses frei.',
      introTilt: 'Handy so halten, wie es bequem ist, „Spielen“ tippen und neigen – die Murmel muss ins grüne Ziel.',
      introTouch: 'Auf das Labyrinth tippen und den Finger in die Richtung ziehen, in die die Murmel rollen soll.',
      best: 'Bestzeit: {t}', bestNone: 'Noch keine Bestzeit.', sec: '{s} s', falls: '{n}× ins Loch',
      fallsShort: '{n}', noSensor: 'Kein Neigungssensor gefunden – steuere mit dem Finger.',
      denied: 'Zugriff auf Bewegung und Ausrichtung abgelehnt. Seite neu öffnen und erlauben – oder mit dem Finger steuern.',
      sayStart: 'Level {n}. Neige das Handy, um die Murmel ins Ziel zu rollen.', sayFall: 'Ins Loch gefallen. Zurück zum Start.',
      sayWon: 'Geschafft in {t}.', recalDone: 'Ausgerichtet', clearQ: 'Alle Bestzeiten löschen und nur noch Level 1 freigeben?',
      cleared: 'Bestzeiten gelöscht', newQ: 'Laufendes Level abbrechen?', 'mcp.choose': 'Level gewählt', 'mcp.start': 'Level gestartet'
    },
    en: {
      title: 'Marble Maze', pause: 'Pause', newGame: 'New game', boardL: 'Maze', cvLabel: 'Maze with marble', levelLabel: 'Level',
      timeLabel: 'Time', fallsLabel: 'Falls into a hole', recal: 'Re-level', recalT: 'Re-level: the way you hold the phone now counts as level',
      prev: 'Previous level', next: 'Next level', play: 'Play', retry: 'Play again', settingsH: 'Settings', controlL: 'Control',
      ctlTilt: 'Tilt', ctlTouch: 'Finger', sensL: 'Sensitivity', sensLow: 'Gentle', sensMid: 'Normal', sensHigh: 'Strong',
      sound: 'Sounds',
      fsOpt: 'Full screen while playing (no status and navigation bar)', vibrate: 'Vibrate',
      clearBest: 'Delete best times and progress',
      paused: 'Paused', resume: 'Resume', won: 'Done!', newBest: 'New best time!', allDone: 'All 30 levels done!',
      nextLevel: 'Next level', levelOf: 'Level {n} of {of}', levelShort: 'Level {n}',
      desc: '{c} × {r} cells, {h}', holes0: 'no holes', holes1: '1 hole', holesN: '{n} holes',
      locked: 'Finish level {n} first, then this one is unlocked.',
      introTilt: 'Hold the phone however is comfortable, tap “Play” and tilt – the marble has to reach the green goal.',
      introTouch: 'Touch the maze and drag your finger in the direction the marble should roll.',
      best: 'Best time: {t}', bestNone: 'No best time yet.', sec: '{s} s', falls: '{n}× into a hole',
      fallsShort: '{n}', noSensor: 'No tilt sensor found – steer with your finger.',
      denied: 'Access to motion and orientation was declined. Open the page again and allow it – or steer with your finger.',
      sayStart: 'Level {n}. Tilt the phone to roll the marble to the goal.', sayFall: 'Fell into a hole. Back to the start.',
      sayWon: 'Done in {t}.', recalDone: 'Levelled', clearQ: 'Delete all best times and unlock only level 1 again?',
      cleared: 'Best times deleted', newQ: 'Abandon the running level?', 'mcp.choose': 'level chosen', 'mcp.start': 'level started'
    }
  });
  const t = Tools.t, $ = Tools.$, E = window.MarbleEngine, N = E.LEVELS;

  /* ---------- Stored settings, progress and best times ---------- */
  const LS = 'marble-maze.settings.v1';
  const SENS = [0.7, 1, 1.5];
  const touchFirst = !('DeviceOrientationEvent' in window) || !(navigator.maxTouchPoints > 0);
  const settings = Object.assign({ level: 1, done: 0, best: {}, control: touchFirst ? 'touch' : 'tilt', sens: 1,
    sound: true, vibrate: true, fullscreen: true }, Tools.load(LS, {}));
  settings.done = Math.max(0, Math.min(N, Math.floor(settings.done) || 0));
  settings.level = Math.max(1, Math.min(unlocked(), Math.floor(settings.level) || 1));
  if (!SENS.includes(settings.sens)) settings.sens = 1;
  if (!['tilt', 'touch'].includes(settings.control)) settings.control = 'tilt';
  if (!settings.best || typeof settings.best !== 'object') settings.best = {};
  function unlocked() { return Math.min(N, settings.done + 1); }
  const save = () => Tools.save(LS, settings);
  const best = n => Number(settings.best[n]) > 0 ? Number(settings.best[n]) : 0;   // seconds
  const secs = s => t('sec', { s: Tools.fmt(Math.floor(s * 10) / 10, 1) });

  /* ---------- Game state ---------- */
  // phase: 'idle' (start card with level choice), 'play', 'paused', 'won'
  let game = E.createGame(settings.level), phase = 'idle', newRecord = false;
  const cv = $('cv'), ctx = cv.getContext('2d'), board = $('board');

  function freshGame() { game = E.createGame(settings.level); draw(); }
  function startLevel() {
    freshGame(); newRecord = false;
    setPhase('play');
    Tools.diag.log('level start', { level: settings.level, control: settings.control });
    say(t('sayStart', { n: settings.level }));
  }
  function setPhase(p) {
    phase = p;
    board.dataset.phase = p;
    if (p === 'play') { last = 0; acc = 0; sensor.wantRef = true; sensor.since = game.time; startLoop(); Tools.wakeLock.hold('game'); }
    else { stopLoop(); Tools.wakeLock.release('game'); releaseInput(); }
    document.body.classList.toggle('playing', p === 'play');
    renderPanel(); renderHud(); draw();
  }
  function pause() { if (phase === 'play') { setPhase('paused'); Tools.diag.log('paused'); } }
  const say = s => { $('status').textContent = s; };

  function won() {
    const n = game.level.n, time = Math.floor(game.time * 10) / 10;   // as shown
    newRecord = best(n) > 0 && time < best(n);   // the first time through is simply "done"
    if (!best(n) || time < best(n)) settings.best[n] = time;
    if (n > settings.done) settings.done = n;
    save();
    Tools.diag.log('level done', { level: n, falls: game.falls, newRecord });
    say(t('sayWon', { t: secs(game.time) }));
    setPhase('won');
  }

  /* ---------- Panel, level choice and score bar ---------- */
  const holesText = h => h === 0 ? t('holes0') : h === 1 ? t('holes1') : t('holesN', { n: Tools.fmt(h, 0) });
  function renderPanel() {
    const panel = $('panel'), show = phase !== 'play';
    panel.hidden = !show;
    $('btnPause').hidden = phase !== 'play';
    $('btnLevel0').hidden = phase !== 'play' || settings.control !== 'tilt' || !sensor.seen;
    if (!show) return;
    const isWon = phase === 'won', paused = phase === 'paused', idle = phase === 'idle', L = game.level, n = isWon || paused ? L.n : settings.level;
    $('panelTitle').textContent = isWon ? (newRecord ? t('newBest') : n === N ? t('allDone') : t('won')) : paused ? t('paused') : t('title');
    $('panelTime').hidden = idle;
    $('panelTime').textContent = secs(game.time);
    $('stepper').hidden = !idle;
    $('lvLabel').textContent = t('levelOf', { n: Tools.fmt(n, 0), of: Tools.fmt(N, 0) });
    $('btnPrev').disabled = settings.level <= 1;
    $('btnNext').disabled = settings.level >= unlocked();
    $('btnNext').title = $('btnNext').disabled && settings.level < N ? t('locked', { n: settings.level }) : t('next');
    const sz = E.size(n);
    $('lvDesc').textContent = t('desc', { c: sz.cols, r: sz.rows, h: holesText(L.n === n ? L.holes.length : E.createLevel(n).holes.length) })
      + (isWon || paused ? ' · ' + t('falls', { n: Tools.fmt(game.falls, 0) }) : '');
    $('panelText').hidden = !idle;
    $('panelText').textContent = settings.control === 'tilt' ? t('introTilt') : t('introTouch');
    $('best').textContent = best(n) ? t('best', { t: secs(best(n)) }) : t('bestNone');
    const note = sensor.denied ? t('denied') : settings.control === 'tilt' && sensor.missing ? t('noSensor') : '';
    $('sensorNote').hidden = !note; $('sensorText').textContent = note;
    const hasNext = isWon && n < N;
    $('startLabel').textContent = paused ? t('resume') : hasNext ? t('nextLevel') : isWon ? t('retry') : t('play');
    $('btnRetry').hidden = !hasNext;
  }
  function renderHud() {
    $('hudLevel').textContent = t('levelShort', { n: Tools.fmt(game.level.n, 0) });
    $('hudTime').textContent = secs(game.time);
    $('hudFalls').textContent = t('falls', { n: Tools.fmt(game.falls, 0) });
  }
  function chooseLevel(n) {
    settings.level = Math.max(1, Math.min(unlocked(), n)); save();
    if (phase === 'idle' || phase === 'won') { freshGame(); if (phase === 'won') setPhase('idle'); }
    renderPanel(); renderHud();
  }
  function renderSettings() {
    for (const b of document.querySelectorAll('#optControl button')) b.setAttribute('aria-pressed', String(b.dataset.v === settings.control));
    for (const b of document.querySelectorAll('#optSens button')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === settings.sens));
    $('optSound').checked = settings.sound;
    $('optVibrate').checked = settings.vibrate;
    $('optFullscreen').checked = settings.fullscreen;
    $('fsRow').hidden = !Tools.fullscreen.supported() || Tools.fullscreen.system();
  }
  for (const b of document.querySelectorAll('#optControl button')) b.addEventListener('click', () => {
    settings.control = b.dataset.v; save(); renderSettings(); renderPanel();
    if (settings.control === 'tilt') askSensor();   // a tap: iPhone may ask for access now
  });
  for (const b of document.querySelectorAll('#optSens button')) b.addEventListener('click', () => { settings.sens = Number(b.dataset.v); save(); renderSettings(); });
  $('optSound').addEventListener('change', e => { settings.sound = e.target.checked; save(); unlockAudio(); });
  $('optVibrate').addEventListener('change', e => { settings.vibrate = e.target.checked; save(); });
  $('optFullscreen').addEventListener('change', e => { settings.fullscreen = e.target.checked; save(); });
  $('btnPrev').addEventListener('click', () => chooseLevel(settings.level - 1));
  $('btnNext').addEventListener('click', () => chooseLevel(settings.level + 1));

  /* ---------- Full screen and orientation lock: only right after a tap (browser rule) ---------- */
  function enterFullscreen() {
    const fs = Tools.fullscreen;
    if (!settings.fullscreen || !fs.supported() || fs.active()) return;
    // Tilting turns the screen otherwise; in full screen the orientation can be held (not on iPhone)
    Promise.resolve(fs.enter(document.documentElement)).then(on => {
      const o = screen.orientation;
      if (on && o && typeof o.lock === 'function') o.lock(o.type).then(() => Tools.diag.log('orientation locked', { type: o.type }), () => {});
    });
  }
  Tools.fullscreen.onChange(active => { if (!active && phase === 'play') pause(); });
  $('btnStart').addEventListener('click', () => {
    unlockAudio();
    if (settings.control === 'tilt') askSensor();   // first: iPhone wants the request straight from the tap
    enterFullscreen();
    if (phase === 'paused') { setPhase('play'); Tools.diag.log('resumed'); }
    else { if (phase === 'won' && game.level.n < N) { settings.level = game.level.n + 1; save(); } startLevel(); }
    cv.focus({ preventScroll: true });
  });
  $('btnRetry').addEventListener('click', () => {
    unlockAudio();
    if (settings.control === 'tilt') askSensor();
    enterFullscreen();
    settings.level = game.level.n; save(); startLevel();
    cv.focus({ preventScroll: true });
  });
  $('btnPause').addEventListener('click', pause);
  $('btnLevel0').addEventListener('click', () => { sensor.wantRef = true; Tools.toast(t('recalDone')); Tools.diag.log('re-level'); });
  $('btnNew').addEventListener('click', async () => {
    if (phase === 'play' || phase === 'paused') {
      pause();
      if (!await Tools.confirm(t('newQ'), { action: 'reset' })) return;
    }
    settings.level = Math.min(settings.level, unlocked());
    freshGame(); setPhase('idle');
  });
  $('btnClearBest').addEventListener('click', async () => {
    if (!await Tools.confirm(t('clearQ'), { action: 'delete' })) return;
    settings.best = {}; settings.done = 0; settings.level = 1; save();
    if (phase !== 'play' && phase !== 'paused') { freshGame(); setPhase('idle'); }
    renderPanel(); Tools.toast(t('cleared')); Tools.menu.close();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  /* ---------- Tilt sensor (deviceorientation) ----------
     Listening starts with the first Play (iPhone: after the permission request from that tap). The direction of
     gravity is smoothed; when a level starts or resumes (and on "Re-level") the current one becomes the reference. */
  const sensor = { listening: false, seen: false, missing: false, denied: false, d: null, ref: null, wantRef: false, since: 0, events: 0 };
  function onOrientation(e) {
    if (e.beta == null || e.gamma == null) return;
    const d = E.down(e.beta, e.gamma);
    sensor.d = sensor.d ? sensor.d.map((v, i) => v + 0.5 * (d[i] - v)) : d;
    sensor.events++;
    if (!sensor.seen) {
      sensor.seen = true; sensor.missing = false; Tools.diag.log('sensor data');
      if (phase === 'play') renderPanel();
    }
    if (sensor.wantRef) { sensor.ref = sensor.d.slice(); sensor.wantRef = false; }
  }
  function listen() {
    if (sensor.listening || !('DeviceOrientationEvent' in window)) return;
    window.addEventListener('deviceorientation', onOrientation);
    sensor.listening = true;
    Tools.diag.log('sensor listening');
  }
  function askSensor() {
    const Ev = window.DeviceOrientationEvent;
    if (!Ev) { sensor.missing = true; return; }
    listen();   // where no permission is needed, values simply arrive
    if (typeof Ev.requestPermission !== 'function' || sensor.seen) return;
    Ev.requestPermission().then(r => {
      Tools.diag.log('sensor permission', { result: r });
      sensor.denied = r === 'denied';
      if (sensor.denied) renderPanel();
    }, e => Tools.diag.log('sensor permission failed', { error: e.name }));
  }
  if (settings.control === 'tilt') listen();
  function screenAngle() {
    const o = screen.orientation;
    const a = o && typeof o.angle === 'number' ? o.angle : (typeof window.orientation === 'number' ? window.orientation : 0);
    return ((a % 360) + 360) % 360;
  }

  /* ---------- Finger (drag like a joystick) and keys ---------- */
  const JOY = 56;          // px of drag for the full finger tilt
  const FINGER_MAX = 0.45, KEY_TILT = 0.3;
  let stick = null;        // { id, x0, y0, x, y } in canvas px
  const keys = new Set();
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'play' || stick) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    unlockAudio();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    stick = { id: e.pointerId, x0: x, y0: y, x, y };
    try { cv.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  cv.addEventListener('pointermove', e => {
    if (!stick || e.pointerId !== stick.id) return;
    const r = cv.getBoundingClientRect();
    stick.x = e.clientX - r.left; stick.y = e.clientY - r.top;
  });
  const up = e => { if (stick && e.pointerId === stick.id) stick = null; };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('lostpointercapture', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());
  const KEYS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  cv.addEventListener('keydown', e => {
    if (e.code === 'KeyP' || e.key === 'Escape') { if (phase === 'play') { e.preventDefault(); pause(); } return; }
    if (!KEYS[e.code] || phase !== 'play') return;
    e.preventDefault(); keys.add(e.code);
  });
  cv.addEventListener('keyup', e => keys.delete(e.code));
  cv.addEventListener('blur', () => keys.clear());
  function releaseInput() { stick = null; keys.clear(); }

  // Tilt on the screen (right, down), then turned into the board's directions (the board may be drawn rotated)
  let tiltNow = { x: 0, y: 0 }, source = '-';
  function currentTilt() {
    let x = 0, y = 0;
    if (stick) {
      const dx = stick.x - stick.x0, dy = stick.y - stick.y0, m = Math.hypot(dx, dy), k = Math.min(1, m / JOY) * FINGER_MAX / (m || 1);
      x = dx * k; y = dy * k; source = 'finger';
    } else if (keys.size) {
      for (const c of keys) { x += KEYS[c][0] * KEY_TILT; y += KEYS[c][1] * KEY_TILT; }
      source = 'keys';
    } else if (settings.control === 'tilt' && sensor.d) {
      ({ x, y } = E.tilt(sensor.d, screenAngle(), sensor.ref));
      x *= settings.sens; y *= settings.sens; source = 'sensor';
    } else source = '-';
    tiltNow = geo.rot ? { x: -y, y: x } : { x, y };   // rotated board: its x runs up the screen, its y to the right
    return tiltNow;
  }

  /* ---------- Loop: fixed physics steps, one drawing per frame ---------- */
  let raf = 0, last = 0, acc = 0;
  function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function frame(now) {
    raf = 0;
    if (phase !== 'play') return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : E.DT;
    last = now; acc += dt;
    const tl = currentTilt();
    while (acc >= E.DT && phase === 'play') {
      for (const ev of E.step(game, tl.x, tl.y)) onEvent(ev);
      acc -= E.DT;
    }
    // No sensor values 1.5 s after the start: say so once (the finger works anyway)
    if (phase === 'play' && settings.control === 'tilt' && !sensor.seen && !sensor.missing && game.time - sensor.since > 1.5) {
      sensor.missing = true; Tools.toast(t('noSensor')); Tools.diag.log('no sensor data');
    }
    renderHud(); draw();
    if (phase === 'play') raf = requestAnimationFrame(frame);
  }
  function onEvent(ev) {
    switch (ev) {
      case 'hit': beep(110 + game.hitV, 0.03, Math.min(0.12, game.hitV / 900)); if (game.hitV > 90) buzz(30); break;
      case 'fall': beep(420, 0.12, 0.12); beep(260, 0.25, 0.12, 0.1); buzz(80); say(t('sayFall')); Tools.diag.log('fall', { falls: game.falls }); break;
      case 'goal': beep(520, 0.1, 0.12); beep(660, 0.1, 0.12, 0.1); beep(880, 0.25, 0.12, 0.2); buzz([40, 40, 80]); won(); break;
    }
  }

  /* ---------- Sounds (Tools.audio, generated – no files) and vibration ---------- */
  function unlockAudio() { if (settings.sound) Tools.audio.unlock(); }
  function beep(freq, dur, vol, delay = 0) { if (settings.sound) Tools.audio.tone({ freq, ms: dur * 1000, type: 'sine', vol, at: delay }); }
  function buzz(p) { if (settings.vibrate) Tools.vibrate(p); }

  /* ---------- Drawing ---------- */
  let P = null, geo = { s: 1, ox: 0, oy: 0, dpr: 1, rot: false };
  function palette() {
    const cs = getComputedStyle(board), v = n => cs.getPropertyValue(n).trim();
    P = { frame: v('--frame'), board: v('--board'), wall: v('--wall'), hole: v('--hole'), goal: v('--goal'), ball: v('--ball'), shine: v('--shine'), text: v('--text') };
  }
  // In landscape the (portrait) board is drawn turned by 90° so that it fills the screen
  function resize() {
    const r = board.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1), L = game.level;
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const rot = r.width > r.height * 1.15, w = rot ? L.h : L.w, h = rot ? L.w : L.h, pad = 8;
    const s = Math.max(0.1, Math.min((r.width - 2 * pad) / (w + 4), (r.height - 2 * pad) / (h + 4)));
    geo = { s, ox: (r.width - w * s) / 2, oy: (r.height - h * s) / 2, dpr, rot, w, h, lv: L.n };
    draw();
  }
  function disc(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = fill; ctx.fill(); }
  function draw() {
    if (!P) palette();
    const g = game, L = g.level;
    if (geo.lv !== L.n) { geo.lv = L.n; resize(); return; }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(geo.dpr * geo.s, 0, 0, geo.dpr * geo.s, geo.dpr * geo.ox, geo.dpr * geo.oy);
    if (geo.rot) { ctx.translate(0, L.w); ctx.rotate(-Math.PI / 2); }   // board x → screen up, board y → screen right
    // Frame and floor
    ctx.fillStyle = P.frame; ctx.beginPath(); ctx.roundRect(-2, -2, L.w + 4, L.h + 4, 3); ctx.fill();
    ctx.fillStyle = P.board; ctx.fillRect(0, 0, L.w, L.h);
    // Goal: a green ring with a dot, then the holes (dark, a lighter rim)
    const gc = E.centre(L, L.goal);
    disc(gc.x, gc.y, E.GOAL_R + 0.6, P.goal); disc(gc.x, gc.y, E.GOAL_R - 0.6, P.board); disc(gc.x, gc.y, 1.6, P.goal);
    for (const h of L.holes) {
      ctx.globalAlpha = 0.35; disc(h.x, h.y, E.HOLE_R + 0.5, P.wall); ctx.globalAlpha = 1;
      disc(h.x, h.y, E.HOLE_R, P.hole);
    }
    // Start mark
    const sc = E.centre(L, L.start);
    ctx.globalAlpha = 0.25; disc(sc.x, sc.y, E.BALL_R + 1, P.wall); ctx.globalAlpha = 1;
    // Walls
    ctx.strokeStyle = P.wall; ctx.lineWidth = 2 * E.WALL_R; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of L.segs) { ctx.moveTo(s.x0, s.y0); ctx.lineTo(s.x1, s.y1); }
    ctx.stroke();
    // Marble (smaller while it drops into a hole), with a light spot
    const k = g.phase === 'falling' ? Math.max(0.15, 1 - g.fallT / E.FALL_TIME) : 1, r = E.BALL_R * k;
    ctx.globalAlpha = 0.25; disc(g.x + 0.6, g.y + 0.8, r, '#000'); ctx.globalAlpha = 1;
    disc(g.x, g.y, r, P.ball);
    ctx.globalAlpha = 0.55; disc(g.x - r * 0.35, g.y - r * 0.35, r * 0.35, P.shine); ctx.globalAlpha = 1;
    // Finger stick: where it went down and where it is now (screen pixels)
    if (stick && phase === 'play') {
      ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);
      ctx.globalAlpha = 0.35; ctx.strokeStyle = P.text; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(stick.x0, stick.y0, JOY, 0, 2 * Math.PI); ctx.stroke();
      const dx = stick.x - stick.x0, dy = stick.y - stick.y0, m = Math.hypot(dx, dy), q = m > JOY ? JOY / m : 1;
      ctx.fillStyle = P.text; ctx.beginPath(); ctx.arc(stick.x0 + dx * q, stick.y0 + dy * q, 14, 0, 2 * Math.PI); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
  if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(board); else window.addEventListener('resize', resize);
  Tools.theme.onChange(() => { palette(); draw(); });
  Tools.onLang(() => { renderPanel(); renderHud(); draw(); });
  renderSettings(); renderPanel(); renderHud(); resize();

  const r1 = v => Math.round(v * 100) / 100;
  Tools.diag.info(() => ({ phase, level: game.level.n, game: game.phase, unlocked: unlocked(), control: settings.control, source,
    sensor: sensor.denied ? 'denied' : sensor.seen ? 'data' : sensor.missing ? 'missing' : sensor.listening ? 'listening' : 'off',
    sensorEvents: sensor.events, ref: !!sensor.ref, sens: settings.sens, angle: screenAngle(), rotated: geo.rot,
    tilt: [r1(tiltNow.x), r1(tiltNow.y)], pos: [Math.round(game.x * 10) / 10, Math.round(game.y * 10) / 10], falls: game.falls,
    time: Math.round(game.time * 10) / 10, fullscreen: settings.fullscreen }));

  /* ---------- WebMCP ---------- */
  const state = () => ({
    phase, level: phase === 'idle' ? settings.level : game.level.n, levels: N, unlocked: unlocked(),
    time_seconds: phase === 'idle' ? null : Math.round(game.time * 10) / 10, falls: phase === 'idle' ? null : game.falls,
    control: settings.control === 'tilt' ? 'tilt' : 'finger',
    best_times_seconds: Object.fromEntries(Array.from({ length: unlocked() }, (_, i) => [String(i + 1), best(i + 1) || null])),
  });
  Tools.mcp.register({
    name: 'get_state', title: 'Read game state', readOnly: true,
    description: 'Reads the marble maze: phase (idle, play, paused, won), the level (1-30), how many levels are unlocked, the time and the number of falls into a hole in the current level, the control (tilt or finger) and the best time in seconds per unlocked level.',
    execute: state
  });
  Tools.mcp.register({
    name: 'choose_level', title: 'Choose a level', label: 'mcp.choose',
    description: 'Chooses an unlocked level on the start card, as with the arrows there. Not while a level is being played or paused. Returns the game state.',
    inputSchema: { type: 'object', properties: { level: { type: 'integer', minimum: 1, maximum: N, description: 'Level number; must be unlocked (see get_state).' } },
      required: ['level'], additionalProperties: false },
    execute: ({ level }) => {
      if (phase === 'play' || phase === 'paused') throw new Error('A level is running. The user has to finish it or go back to the start card first.');
      if (level > unlocked()) throw new Error(`Level ${level} is locked; levels 1-${unlocked()} are unlocked.`);
      chooseLevel(level); if (phase !== 'idle') setPhase('idle');
      return state();
    }
  });
  Tools.mcp.register({
    name: 'start_level', title: 'Start the chosen level', label: 'mcp.start',
    description: 'Starts the chosen level from the beginning, as if the user pressed Play. A running level is abandoned. The user then tilts the phone (or drags a finger); the agent cannot move the marble. Returns the game state.',
    execute: () => { if (phase === 'won' || phase === 'paused') settings.level = Math.min(settings.level, unlocked()); startLevel(); return state(); }
  });
})();
