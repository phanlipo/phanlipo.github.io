/* Flipper – page script: game flow, touch and keyboard input, drawing, sounds, best scores, WebMCP.
   Table, physics and rules without DOM: engine.js (window.PinballEngine). See README.md. */
(function () {
  'use strict';
  Tools.i18n({
    de: {
      paused: 'Pause', resume: 'Weiterspielen', again: 'Nochmal', over: 'Spiel vorbei', newBest: 'Neuer Bestwert!',
      intro: 'Linke Bildschirmhälfte: linker Flipper, rechte Hälfte: rechter Flipper. Zum Abschießen rechts gedrückt halten und loslassen.',
      best: 'Bestwert ({n} Kugeln): {s}', bestNone: 'Noch kein Bestwert mit {n} Kugeln.',
      ballOf: 'Kugel {b}/{n}', ballLabel: 'Kugel', multLabel: 'Multiplikator', scoreLabel: 'Punkte',
      save: 'Ballsicherung', bonus: 'Bonus {b} × {m}', launchHint: 'Rechts halten, loslassen',
      sayBall: 'Kugel {b} von {n}. Rechts gedrückt halten und loslassen zum Abschießen.',
      sayDrain: 'Kugel verloren. Bonus {s}. Punkte: {p}.', saySaved: 'Ballsicherung: Die Kugel kommt zurück.',
      sayMult: 'Multiplikator {m}.', sayBank: 'Alle Ziele getroffen.', sayOver: 'Spiel vorbei. {p} Punkte.',
      clearQ: 'Bestwerte löschen?', cleared: 'Bestwerte gelöscht', newQ: 'Laufendes Spiel abbrechen und neu beginnen?',
      'mcp.set': 'Spiel eingestellt', 'mcp.new': 'Neues Spiel'
    },
    en: {
      title: 'Pinball', pause: 'Pause', newGame: 'New game', tableL: 'Pinball table', cvLabel: 'Pinball table',
      play: 'Play', settingsH: 'Settings', ballsL: 'Balls per game', sound: 'Sounds', fsOpt: 'Full screen while playing (no status and navigation bar)',
      vibrate: 'Vibrate on flippers and bumpers', clearBest: 'Delete best scores', flipL: 'Left flipper', flipR: 'Right flipper',
      paused: 'Paused', resume: 'Resume', again: 'Play again', over: 'Game over', newBest: 'New best score!',
      intro: 'Left half of the screen: left flipper, right half: right flipper. To launch, hold the right side and let go.',
      best: 'Best ({n} balls): {s}', bestNone: 'No best score with {n} balls yet.',
      ballOf: 'Ball {b}/{n}', ballLabel: 'Ball', multLabel: 'Multiplier', scoreLabel: 'Score',
      save: 'Ball save', bonus: 'Bonus {b} × {m}', launchHint: 'Hold right, let go',
      sayBall: 'Ball {b} of {n}. Hold the right side and let go to launch.',
      sayDrain: 'Ball lost. Bonus {s}. Score: {p}.', saySaved: 'Ball save: the ball comes back.',
      sayMult: 'Multiplier {m}.', sayBank: 'All targets hit.', sayOver: 'Game over. {p} points.',
      clearQ: 'Delete the best scores?', cleared: 'Best scores deleted', newQ: 'Abandon the running game and start again?',
      'mcp.set': 'game set up', 'mcp.new': 'new game'
    }
  });
  const t = Tools.t, $ = Tools.$, E = window.PinballEngine;
  const { W, H, BALL_R, DT, FLIP_R, LANE_REST, SEP_X, CX } = E;

  /* ---------- Stored settings and best scores ---------- */
  const LS = 'pinball.settings.v1';
  const BALLS = [3, 5];
  const settings = Object.assign({ balls: 3, sound: true, fullscreen: true, vibrate: true, best: {} }, Tools.load(LS, {}));
  if (!BALLS.includes(settings.balls)) settings.balls = 3;
  if (!settings.best || typeof settings.best !== 'object') settings.best = {};
  const save = () => Tools.save(LS, settings);
  const best = n => Math.max(0, Math.floor(settings.best[n]) || 0);

  /* ---------- Game state ---------- */
  // phase: 'idle' (start card), 'play', 'paused', 'over'
  let game = E.createGame({ balls: settings.balls }), phase = 'idle', newRecord = false, message = null;
  const cv = $('cv'), ctx = cv.getContext('2d'), table = $('table');

  function newGame() {
    game = E.createGame({ balls: settings.balls });
    newRecord = false; message = null; releaseAll();
    setPhase('play');
    Tools.diag.log('new game', { balls: settings.balls });
    say(t('sayBall', { b: 1, n: game.balls }));
  }
  function setPhase(p) {
    phase = p;
    table.dataset.phase = p;
    if (p === 'play') { last = 0; startLoop(); Tools.wakeLock.hold('game'); } else { stopLoop(); Tools.wakeLock.release('game'); }
    if (p !== 'play') releaseAll();
    document.body.classList.toggle('playing', p === 'play');   // header hidden: nothing to hit by mistake
    renderPanel(); renderHud(); draw();
  }
  function pause() { if (phase === 'play') { setPhase('paused'); Tools.diag.log('paused'); } }
  const say = s => { $('status').textContent = s; };
  const pts = n => Tools.fmt(n, 0);

  function gameOver() {
    newRecord = game.score > best(game.balls);
    if (newRecord) { settings.best[game.balls] = game.score; save(); }
    Tools.diag.log('game over', { balls: game.balls, newRecord });
    say(t('sayOver', { p: pts(game.score) }));
    setPhase('over');
    buzz([60, 60, 120]);
  }

  /* ---------- Panel and score bar ---------- */
  function renderPanel() {
    const panel = $('panel'), show = phase !== 'play';
    panel.hidden = !show;
    $('btnPause').hidden = phase !== 'play';
    if (!show) return;
    const over = phase === 'over', paused = phase === 'paused';
    $('panelTitle').textContent = over ? (newRecord ? t('newBest') : t('over')) : paused ? t('paused') : t('title');
    $('panelScore').hidden = phase === 'idle';
    $('panelScore').textContent = pts(game.score);
    $('panelText').hidden = paused;
    $('panelText').textContent = t('intro');
    const n = phase === 'idle' || over ? settings.balls : game.balls, b = best(n);
    $('best').textContent = b ? t('best', { n, s: pts(b) }) : t('bestNone', { n });
    $('startLabel').textContent = paused ? t('resume') : over ? t('again') : t('play');
  }
  function renderHud() {
    $('hudScore').textContent = pts(game.score);
    $('hudBall').textContent = t('ballOf', { b: Math.min(game.ball, game.balls), n: game.balls });
    $('hudMult').textContent = '×' + Tools.fmt(game.mult, 0);
  }
  function renderSettings() {
    for (const b of document.querySelectorAll('#optBalls button')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === settings.balls));
    $('optSound').checked = settings.sound;
    $('optVibrate').checked = settings.vibrate;
    $('optFullscreen').checked = settings.fullscreen;
    // Only where a page may switch to full screen (not on iPhone, not in the installed full-screen app)
    $('fsRow').hidden = !Tools.fullscreen.supported() || Tools.fullscreen.system();
  }
  function setBalls(n) {
    settings.balls = n; save(); renderSettings();
    if (phase === 'idle') { game = E.createGame({ balls: n }); renderHud(); }
    renderPanel();
  }
  for (const b of document.querySelectorAll('#optBalls button')) b.addEventListener('click', () => setBalls(Number(b.dataset.v)));
  $('optSound').addEventListener('change', e => { settings.sound = e.target.checked; save(); unlockAudio(); });
  $('optVibrate').addEventListener('change', e => { settings.vibrate = e.target.checked; save(); });
  $('optFullscreen').addEventListener('change', e => { settings.fullscreen = e.target.checked; save(); });

  /* ---------- Full screen: only right after a tap (browser rule), so on Play/Resume ---------- */
  function enterFullscreen() {
    const fs = Tools.fullscreen;
    if (settings.fullscreen && fs.supported() && !fs.active()) fs.enter(document.documentElement);
  }
  // Leaving full screen (back gesture, Escape) during a game was probably not meant for the game: pause it
  Tools.fullscreen.onChange(active => { if (!active && phase === 'play') pause(); });
  $('btnStart').addEventListener('click', () => {
    unlockAudio();
    enterFullscreen();
    if (phase === 'paused') { setPhase('play'); Tools.diag.log('resumed'); } else newGame();
    cv.focus({ preventScroll: true });
  });
  $('btnPause').addEventListener('click', pause);
  $('btnNew').addEventListener('click', async () => {
    if ((phase === 'play' || phase === 'paused') && game.score > 0) {
      pause();
      if (!await Tools.confirm(t('newQ'), { action: 'reset' })) return;
    }
    game = E.createGame({ balls: settings.balls }); message = null;
    setPhase('idle');
  });
  $('btnClearBest').addEventListener('click', async () => {
    if (!await Tools.confirm(t('clearQ'), { action: 'delete' })) return;
    settings.best = {}; save(); renderPanel(); Tools.toast(t('cleared')); Tools.menu.close();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  /* ---------- Input: each finger holds the flipper of the half where it touched down ----------
     While the ball waits in the shooter lane, the right half pulls the plunger instead; letting go launches. */
  const held = { L: new Set(), R: new Set(), P: new Set() };   // pointerIds / key names per control
  const waiting = () => game.phase === 'launch' && game.b.vy === 0;
  function press(ctrl, id) {
    if (phase !== 'play') return;
    if (ctrl === 'R' && waiting()) ctrl = 'P';
    held[ctrl].add(id);
    if (ctrl === 'P') E.setPlunger(game, true);
    else { E.setFlipper(game, ctrl === 'L' ? 0 : 1, true); buzz(8); beep(ctrl === 'L' ? 180 : 200, 0.04, 0.05); }
    return ctrl;
  }
  function releaseId(id) {
    for (const c of ['L', 'R', 'P']) {
      if (!held[c].delete(id) || held[c].size) continue;
      if (c === 'P') { for (const ev of E.setPlunger(game, false)) onEvent(ev); }
      else E.setFlipper(game, c === 'L' ? 0 : 1, false);
    }
  }
  function releaseAll() {
    for (const c of ['L', 'R', 'P']) held[c].clear();
    E.setFlipper(game, 0, false); E.setFlipper(game, 1, false);
    game.pulling = false; game.pull = 0;
  }
  let geo = { s: 1, ox: 0, oy: 0, dpr: 1 };
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    unlockAudio();   // iPhone: sound only after a tap, and again after the app was in the background
    const r = cv.getBoundingClientRect(), x = (e.clientX - r.left - geo.ox) / geo.s;
    press(x < CX ? 'L' : 'R', 'p' + e.pointerId);
    try { cv.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  });
  const up = e => releaseId('p' + e.pointerId);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('lostpointercapture', up);
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // Keyboard: left/right flipper with arrows, Shift, Z and M; plunger with space, Enter or arrow down; P or Escape pauses
  const KEYS = { ArrowLeft: 'L', ShiftLeft: 'L', KeyZ: 'L', KeyY: 'L', ArrowRight: 'R', ShiftRight: 'R', KeyM: 'R', Slash: 'R',
    Space: 'P', Enter: 'P', ArrowDown: 'P' };
  cv.addEventListener('keydown', e => {
    if (e.code === 'KeyP' || e.key === 'Escape') { if (phase === 'play') { e.preventDefault(); pause(); } return; }
    const c = KEYS[e.code];
    if (!c || phase !== 'play') return;
    e.preventDefault();
    if (e.repeat) return;
    if (c === 'P') { if (waiting()) press('P', 'k' + e.code); } else press(c, 'k' + e.code);
  });
  cv.addEventListener('keyup', e => { if (KEYS[e.code]) releaseId('k' + e.code); });
  cv.addEventListener('blur', () => { if (phase === 'play') releaseAll(); });

  /* ---------- Loop: fixed physics steps, one drawing per frame ---------- */
  let raf = 0, last = 0, acc = 0;
  function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function frame(now) {
    raf = 0;
    if (phase !== 'play') return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : DT;   // after a stall: slow down, don't jump
    last = now; acc += dt;
    while (acc >= DT && phase === 'play') { for (const ev of E.step(game)) onEvent(ev); acc -= DT; }
    renderHud();
    draw();
    if (phase === 'play') raf = requestAnimationFrame(frame);
  }
  function onEvent(ev) {
    switch (ev) {
      case 'bumper': beep(620 + 80 * (game.bumperHits % 3), 0.06, 0.1); buzz(15); break;
      case 'sling': beep(420, 0.05, 0.09); buzz(10); break;
      case 'wall': beep(150, 0.03, 0.04); break;
      case 'flip0': case 'flip1': beep(260, 0.03, 0.06); break;
      case 'launch': beep(240, 0.12, 0.08); break;
      case 'lane': beep(880, 0.08, 0.08); break;
      case 'target': beep(500, 0.07, 0.1); break;
      case 'lanesAll':
        beep(660, 0.1, 0.1); beep(990, 0.16, 0.1, 0.1);
        message = { text: '×' + Tools.fmt(game.mult, 0), until: game.time + 1.4 };
        say(t('sayMult', { m: Tools.fmt(game.mult, 0) })); break;
      case 'bankAll':
        beep(520, 0.1, 0.1); beep(780, 0.18, 0.1, 0.1);
        message = { text: '+' + pts(E.SCORE.bankAll * game.mult), until: game.time + 1.4 }; say(t('sayBank')); break;
      case 'saved':
        beep(700, 0.1, 0.08); beep(700, 0.1, 0.08, 0.15);
        message = { text: t('save'), until: game.time + 1.6 }; say(t('saySaved')); Tools.diag.log('ball saved'); break;
      case 'drain':
        beep(300, 0.2, 0.1, 0); beep(200, 0.3, 0.1, 0.18); buzz(80);
        message = { text: t('bonus', { b: pts(game.lastBonus / Math.max(1, game.lastMult || 1)), m: Tools.fmt(game.lastMult || 1, 0) }), until: game.time + 1.6 };
        say(t('sayDrain', { s: pts(game.lastBonus), p: pts(game.score) }));
        Tools.diag.log('drain', { ball: game.ball }); break;
      case 'ball': say(t('sayBall', { b: game.ball, n: game.balls })); break;
      case 'over': gameOver(); break;
    }
  }

  /* ---------- Sounds (Tools.audio, generated – no files) and vibration ---------- */
  function unlockAudio() { if (settings.sound) Tools.audio.unlock(); }
  function beep(freq, dur, vol, delay = 0) {
    if (settings.sound) Tools.audio.tone({ freq, ms: dur * 1000, type: 'triangle', vol, at: delay });
  }
  function buzz(p) { if (settings.vibrate) Tools.vibrate(p); }  // at least 30 ms each, see common.js

  /* ---------- Drawing ---------- */
  let P = null;
  function palette() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    P = { cab: v('--cabinet'), field: v('--field'), wall: v('--wall'), bumper: v('--bumper'), lit: v('--lit'), sling: v('--sling'),
      flipper: v('--flipper'), ball: v('--ball'), lamp: v('--lamp'), target: v('--target'), text: v('--text'), font: v('--font') };
  }
  function resize() {
    const r = table.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const pad = 4, s = Math.max(0.1, Math.min((r.width - 2 * pad) / W, (r.height - 2 * pad) / H));
    geo = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2, dpr };
    draw();
  }
  const lit = (id, ms = 0.15) => game.flash[id] !== undefined && game.time - game.flash[id] < ms;
  function disc(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = fill; ctx.fill(); }
  function capsule(x0, y0, x1, y1, r, color) {
    ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = Math.max(0.8, 2 * r);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  function text(txt, x, y, size, color, weight = 800) {
    ctx.font = `${weight} ${size}px ${P.font || 'sans-serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText(txt, x, y);
  }
  function draw() {
    if (!P) palette();
    const { s, ox, oy, dpr } = geo, g = game;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    // Cabinet and playfield (round top)
    ctx.fillStyle = P.cab; ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, 50); ctx.arc(50, 50, 50, Math.PI, 2 * Math.PI); ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = P.field; ctx.fill();
    // Lamps: multiplier row in the middle, ball save above the flippers
    for (let m = 2; m <= E.MAX_MULT; m++) {
      const x = CX + (m - 3.5) * 9, on = g.mult >= m;
      disc(x, 112, 3.2, on ? P.lit : P.lamp);
      text('×' + m, x, 112.2, 2.8, on ? P.field : P.text, 700);
    }
    const saving = g.time < g.saveUntil && phase !== 'idle';
    disc(CX, 140, 2.4, saving && (g.saveUntil - g.time > 2 || Math.floor(g.time * 6) % 2) ? P.lit : P.lamp);
    // Top lanes: lamp above each lane
    E.LANES.forEach((x, i) => { disc(x, 20, 2.2, g.lanes[i] || lit('l' + i, 0.3) ? P.lit : P.lamp); });
    // Walls and slingshots
    for (const w of E.walls) {
      if (w.y0 > H && w.y1 > H) continue;
      const c = w.kind === 'sling' ? (lit(w.id) ? P.lit : P.sling) : P.wall;
      capsule(w.x0, w.y0, w.x1, w.y1, Math.max(w.r, 0.5), c);
    }
    // Drop targets (a dropped one leaves only a thin mark)
    E.TARGETS.forEach((tg, i) => {
      if (g.targets[i]) capsule(E.TARGET_X + 1.2, tg.y0 + 1, E.TARGET_X + 1.2, tg.y1 - 1, 0.3, P.lamp);
      else capsule(E.TARGET_X, tg.y0, E.TARGET_X, tg.y1, 1, lit('t' + i) ? P.lit : P.target);
    });
    // Pop bumpers
    E.BUMPERS.forEach((b, i) => {
      const on = lit('b' + i);
      disc(b.x, b.y, E.BUMPER_R + (on ? 0.8 : 0), on ? P.lit : P.bumper);
      disc(b.x, b.y, E.BUMPER_R * 0.55, P.field);
      disc(b.x, b.y, E.BUMPER_R * 0.3, on ? P.lit : P.bumper);
    });
    // Plunger
    const py = LANE_REST + BALL_R + 0.5 + (g.phase === 'launch' && g.b.vy === 0 ? g.pull * 6 : 0);
    ctx.fillStyle = P.flipper; ctx.fillRect(SEP_X + 1.5, py, W - SEP_X - 3, 2);
    ctx.fillStyle = P.lamp; ctx.fillRect(W - (W - SEP_X) / 2 - 0.8, py + 2, 1.6, H - py);
    // Flippers: thick at the pivot, thinner at the tip
    for (const f of g.flippers) {
      const tip = E.flipperTip(f), dx = tip.x - f.px, dy = tip.y - f.py, l = Math.hypot(dx, dy), nx = -dy / l, ny = dx / l, r0 = FLIP_R + 0.6, r1 = FLIP_R;
      ctx.beginPath();
      ctx.moveTo(f.px + nx * r0, f.py + ny * r0); ctx.lineTo(tip.x + nx * r1, tip.y + ny * r1);
      ctx.arc(tip.x, tip.y, r1, Math.atan2(ny, nx), Math.atan2(-ny, -nx));
      ctx.lineTo(f.px - nx * r0, f.py - ny * r0);
      ctx.arc(f.px, f.py, r0, Math.atan2(-ny, -nx), Math.atan2(ny, nx));
      ctx.closePath(); ctx.fillStyle = P.flipper; ctx.fill();
      disc(f.px, f.py, 0.7, P.field);
    }
    // Ball (not while the next one is coming)
    if (g.phase !== 'drain' && g.phase !== 'over') {
      disc(g.b.x, g.b.y, BALL_R, P.ball);
      disc(g.b.x - 0.8, g.b.y - 0.8, BALL_R * 0.35, P.field);
    }
    // Messages on the table
    if (message && g.time < message.until && phase !== 'idle') text(message.text, CX, 92, 8, P.lit);
    if (phase === 'play' && waiting() && !g.pulling && g.time > 0.6) {
      ctx.globalAlpha = 0.85; text(t('launchHint'), CX, 128, 3.6, P.text, 700); ctx.globalAlpha = 1;
    }
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(table); else window.addEventListener('resize', resize);
  Tools.theme.onChange(() => { palette(); draw(); });
  Tools.onLang(() => { renderPanel(); renderHud(); draw(); });
  renderSettings(); renderPanel(); renderHud(); resize();

  Tools.diag.info(() => ({ phase, game: game.phase, balls: game.balls, ball: game.ball, mult: game.mult, saved: game.saved,
    fullscreen: settings.fullscreen, maxTouchPoints: navigator.maxTouchPoints || 0,
    held: ['L', 'R', 'P'].filter(c => held[c].size).join('') || '-', flippers: game.flippers.map(f => f.up),
    pull: Math.round(game.pull * 100) / 100, pos: [Math.round(game.b.x), Math.round(game.b.y)] }));

  /* ---------- WebMCP ---------- */
  const state = () => ({
    phase, balls_per_game: phase === 'idle' ? settings.balls : game.balls,
    ball: phase === 'idle' ? null : Math.min(game.ball, game.balls),
    score: phase === 'idle' ? null : game.score, multiplier: game.mult,
    lit_lanes: game.lanes.filter(Boolean).length, dropped_targets: game.targets.filter(Boolean).length,
    next_game: { balls_per_game: settings.balls },
    best_scores: Object.fromEntries(BALLS.map(n => [String(n), best(n) || null])),
  });
  Tools.mcp.register({
    name: 'get_state', title: 'Read game state', readOnly: true,
    description: 'Reads the pinball game: phase (idle, play, paused, over), balls per game, the current ball, score, bonus multiplier, lit top lanes and dropped targets, the setting for the next game and the best score per number of balls.',
    execute: state
  });
  Tools.mcp.register({
    name: 'set_game', title: 'Set up the next game', label: 'mcp.set',
    description: 'Sets the number of balls per game for the next game, as in the settings. A running game is not changed. Returns the game state.',
    inputSchema: { type: 'object', properties: {
      balls_per_game: { type: 'integer', enum: BALLS, description: 'Balls per game.' }
    }, additionalProperties: false },
    execute: ({ balls_per_game: n } = {}) => { if (n) setBalls(n); draw(); return state(); }
  });
  Tools.mcp.register({
    name: 'new_game', title: 'Start a new game', label: 'mcp.new',
    description: 'Starts a new game with the current settings, as if the user pressed Play. A running game is abandoned. The user then plays with the flippers; the agent cannot flip or launch. Returns the game state.',
    execute: () => { newGame(); return state(); }
  });
})();
