/* Tischtennis – page script: game flow, multi-touch input, computer player, drawing, sounds, settings, WebMCP.
   Ball flight, rules and computer player without DOM: engine.js (window.PingEngine). See README.md. */
(function () {
  'use strict';
  Tools.i18n({
    de: {
      you: 'Du', computer: 'Computer', blue: 'Blau', red: 'Rot',
      r_out: 'Aus', r_net: 'Netz', r_miss: 'Punkt!', serveYou: 'Aufschlag', won: 'Gewonnen!', lost: 'Verloren',
      winsTwo: '{who} gewinnt', paused: 'Pause', resume: 'Weiterspielen', again: 'Nochmal',
      levelName_easy: 'Leicht', levelName_medium: 'Mittel', levelName_hard: 'Schwer',
      record: 'Bilanz ({level}): {w} {wW} · {l} {lW}', recordNone: 'Noch keine Spiele gegen „{level}“.',
      win1: 'Sieg', winN: 'Siege', loss1: 'Niederlage', lossN: 'Niederlagen',
      introCpu: 'Du spielst unten. Finger aufs Spielfeld und den Schläger zum Ball ziehen – je schneller, desto härter der Schlag.',
      introTwo: 'Gerät flach hinlegen: Blau unten, Rot oben – jeder mit einem Finger auf seiner Seite des Netzes.',
      scoreSay: '{a} {sa} : {sb} {b}', pointSay: 'Punkt für {who}. ', firstTo: 'Gespielt wird bis {n} Punkte.',
      clearQ: 'Bilanz gegen den Computer löschen?', cleared: 'Bilanz gelöscht', newQ: 'Laufendes Spiel abbrechen und neu beginnen?',
      'mcp.set': 'Spiel eingestellt', 'mcp.new': 'Neues Spiel'
    },
    en: {
      title: 'Table Tennis', pause: 'Pause', newGame: 'New game', courtL: 'Court', cvLabel: 'Table tennis table seen from above',
      modeL: 'Mode', cpu: 'Against computer', two: 'Two of us', levelL: 'Computer strength', easy: 'Easy', medium: 'Medium', hard: 'Hard',
      play: 'Play', settingsH: 'Settings', pointsL: 'Points to win', sound: 'Sounds', fsOpt: 'Full screen while playing (no status and navigation bar)', vibrate: 'Vibrate on shots and points', clearRecord: 'Delete record',
      you: 'You', computer: 'Computer', blue: 'Blue', red: 'Red',
      r_out: 'Out', r_net: 'Net', r_miss: 'Point!', serveYou: 'Serve', won: 'You won!', lost: 'You lost',
      winsTwo: '{who} wins', paused: 'Paused', resume: 'Resume', again: 'Play again',
      levelName_easy: 'Easy', levelName_medium: 'Medium', levelName_hard: 'Hard',
      record: 'Record ({level}): {w} {wW} · {l} {lW}', recordNone: 'No games against “{level}” yet.',
      win1: 'win', winN: 'wins', loss1: 'loss', lossN: 'losses',
      introCpu: 'You play at the bottom. Put a finger on the court and drag the paddle to the ball – the faster, the harder the shot.',
      introTwo: 'Lay the device flat: blue at the bottom, red at the top – each with a finger on their side of the net.',
      scoreSay: '{a} {sa} : {sb} {b}', pointSay: 'Point for {who}. ', firstTo: 'The game goes to {n} points.',
      clearQ: 'Delete your record against the computer?', cleared: 'Record deleted', newQ: 'Abandon the running game and start again?',
      'mcp.set': 'game set up', 'mcp.new': 'new game'
    }
  });
  const t = Tools.t, $ = Tools.$, E = window.PingEngine;
  const { W, H, TX0, TX1, TY0, TY1, NET_Y, NET_H, NET_OVER, BALL_R, PADDLE_R, DT } = E;

  /* ---------- Stored settings and record ---------- */
  const LS = 'table-tennis.settings.v1';
  const POINTS = [5, 11, 21], LEVELS = ['easy', 'medium', 'hard'];
  const settings = Object.assign({ mode: 'cpu', level: 'medium', points: 11, sound: true, fullscreen: true, vibrate: true, record: {} }, Tools.load(LS, {}));
  if (!['cpu', 'two'].includes(settings.mode)) settings.mode = 'cpu';
  if (!LEVELS.includes(settings.level)) settings.level = 'medium';
  if (!POINTS.includes(settings.points)) settings.points = 11;
  if (!settings.record || typeof settings.record !== 'object') settings.record = {};
  const save = () => Tools.save(LS, settings);
  const rec = l => { const r = settings.record[l] || {}; return { w: Math.max(0, Math.floor(r.w) || 0), l: Math.max(0, Math.floor(r.l) || 0) }; };

  /* ---------- Game state ---------- */
  // phase: 'idle' (start card), 'play', 'paused', 'over'; the engine has its own phases (serve, play, point, over)
  let game = E.createGame({ pointsToWin: settings.points }), phase = 'idle', mode = settings.mode, level = settings.level;
  let ai = {}, flash = null;   // flash: last point for the message on the table { to, reason, until }
  const cv = $('cv'), ctx = cv.getContext('2d'), court = $('court');

  function newGame() {
    mode = settings.mode; level = settings.level;
    game = E.createGame({ pointsToWin: settings.points });
    ai = {}; flash = null; owners = [null, null]; keys.clear();
    setPhase('play');
    Tools.diag.log('new game', { mode, level, points: settings.points });
    say(t('firstTo', { n: settings.points }));
  }
  function setPhase(p) {
    phase = p;
    court.dataset.phase = p;
    if (p === 'play') { last = 0; startLoop(); Tools.wakeLock.hold('game'); } else { stopLoop(); Tools.wakeLock.release('game'); }
    document.body.classList.toggle('playing', p === 'play');   // header hidden: nothing to hit by mistake
    renderPanel(); draw();
  }
  function pause() { if (phase === 'play') { setPhase('paused'); Tools.diag.log('paused'); } }
  const names = () => mode === 'cpu' ? [t('you'), t('computer')] : [t('blue'), t('red')];
  const scoreText = () => { const [a, b] = names(); return t('scoreSay', { a, b, sa: Tools.fmt(game.score[0], 0), sb: Tools.fmt(game.score[1], 0) }); };
  const say = s => { $('status').textContent = s; };

  function gameOver() {
    if (mode === 'cpu') {
      const r = rec(level);
      if (game.winner === 0) r.w++; else r.l++;
      settings.record[level] = r; save();
    }
    Tools.diag.log('game over', { mode, level, score: game.score.slice() });
    setPhase('over');
    buzz([60, 60, 120]);
  }

  /* ---------- Panel: start, pause, result ---------- */
  function renderPanel() {
    const panel = $('panel'), show = phase !== 'play';
    panel.hidden = !show;
    $('btnPause').hidden = phase !== 'play';
    if (!show) return;
    const over = phase === 'over', paused = phase === 'paused';
    const choose = phase === 'idle' || over;
    let title = t('title'), text = '';
    if (over) {
      title = mode === 'cpu' ? (game.winner === 0 ? t('won') : t('lost')) : t('winsTwo', { who: names()[game.winner] });
    } else if (paused) title = t('paused');
    if (choose) text = settings.mode === 'cpu' ? t('introCpu') : t('introTwo');
    $('panelTitle').textContent = title;
    $('panelScore').hidden = phase === 'idle';
    $('panelScore').textContent = Tools.fmt(game.score[0], 0) + ' : ' + Tools.fmt(game.score[1], 0);
    $('panelText').textContent = text;
    $('panelText').hidden = !text;
    $('modes').hidden = !choose;
    $('levels').hidden = !choose || settings.mode !== 'cpu';
    for (const b of document.querySelectorAll('#modes button')) b.setAttribute('aria-pressed', String(b.dataset.mode === settings.mode));
    for (const b of document.querySelectorAll('#levels button')) b.setAttribute('aria-pressed', String(b.dataset.level === settings.level));
    const r = rec(settings.level), lv = t('levelName_' + settings.level);
    $('record').hidden = !choose || settings.mode !== 'cpu';
    $('record').textContent = r.w + r.l ? t('record', { level: lv, w: Tools.fmt(r.w, 0), l: Tools.fmt(r.l, 0), wW: t(r.w === 1 ? 'win1' : 'winN'), lW: t(r.l === 1 ? 'loss1' : 'lossN') }) : t('recordNone', { level: lv });
    $('startLabel').textContent = paused ? t('resume') : over ? t('again') : t('play');
  }
  function renderSettings() {
    for (const b of document.querySelectorAll('#optPoints button')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === settings.points));
    $('optSound').checked = settings.sound;
    $('optVibrate').checked = settings.vibrate;
    $('optFullscreen').checked = settings.fullscreen;
    // Only where a page may switch to full screen (not on iPhone, not in the installed full-screen app)
    $('fsRow').hidden = !Tools.fullscreen.supported() || Tools.fullscreen.system();
  }
  for (const b of document.querySelectorAll('#modes button')) b.addEventListener('click', () => { settings.mode = b.dataset.mode; save(); renderPanel(); draw(); });
  for (const b of document.querySelectorAll('#levels button')) b.addEventListener('click', () => { settings.level = b.dataset.level; save(); renderPanel(); });
  for (const b of document.querySelectorAll('#optPoints button')) b.addEventListener('click', () => {
    settings.points = Number(b.dataset.v); save(); renderSettings();
    if (phase === 'idle') game.pointsToWin = settings.points;
  });
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
    if ((phase === 'play' || phase === 'paused') && game.score[0] + game.score[1] > 0) {
      pause();
      if (!await Tools.confirm(t('newQ'), { action: 'reset' })) return;
    }
    game = E.createGame({ pointsToWin: settings.points }); flash = null;
    setPhase('idle');
  });
  $('btnClearRecord').addEventListener('click', async () => {
    if (!await Tools.confirm(t('clearQ'), { action: 'delete' })) return;
    settings.record = {}; save(); renderPanel(); Tools.toast(t('cleared')); Tools.menu.close();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  /* ---------- Multi-touch: every finger belongs to the side of the net where it touched down ---------- */
  let owners = [null, null];   // pointerId per player
  let geo = { s: 1, ox: 0, oy: 0, rot: false, dpr: 1 };
  function toRoom(e) {
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, { s, ox, oy, rot } = geo;
    return rot ? { x: W - (sy - oy) / s, y: (sx - ox) / s } : { x: (sx - ox) / s, y: (sy - oy) / s };
  }
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    unlockAudio();   // iPhone: sound only after a tap, and again after the app was in the background
    const p = toRoom(e), i = mode === 'two' && p.y < NET_Y ? 1 : 0;
    owners[i] = e.pointerId;
    try { cv.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    E.setTarget(game, i, p.x, p.y);
  });
  cv.addEventListener('pointermove', e => {
    if (phase !== 'play') return;
    let i = owners.indexOf(e.pointerId);
    // Against the computer a mouse steers without pressing a button
    if (i < 0 && mode === 'cpu' && e.pointerType === 'mouse') i = 0;
    if (i < 0) return;
    // The newest of all points since the last frame, so a fast swipe gives the paddle its full speed
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const p = toRoom(list.length ? list[list.length - 1] : e);
    E.setTarget(game, i, p.x, p.y);
  });
  const release = e => { const i = owners.indexOf(e.pointerId); if (i >= 0) owners[i] = null; };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('lostpointercapture', release);
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // Keyboard: arrows move the blue paddle, space pauses
  const keys = new Set();
  cv.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { keys.add(e.key); e.preventDefault(); }
    else if (e.key === ' ' && phase === 'play') { e.preventDefault(); pause(); }
  });
  cv.addEventListener('keyup', e => keys.delete(e.key));
  cv.addEventListener('blur', () => keys.clear());
  function keyStep() {
    if (!keys.size) return;
    const m = game.paddles[0], v = 160 * DT;
    let dx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), dy = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    if (geo.rot) [dx, dy] = [-dy, dx];   // table turned: screen right is towards blue's end
    E.setTarget(game, 0, m.tx + dx * v, m.ty + dy * v);
  }

  /* ---------- Loop: fixed physics steps, one drawing per frame ---------- */
  let raf = 0, last = 0, acc = 0;
  function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  function frame(now) {
    raf = 0;
    if (phase !== 'play') return;
    const dt = last ? Math.min(0.1, (now - last) / 1000) : DT;   // after a stall: slow down, don't jump
    last = now; acc += dt;
    while (acc >= DT && phase === 'play') { tick(); acc -= DT; }
    draw();
    if (phase === 'play') raf = requestAnimationFrame(frame);
  }
  function tick() {
    keyStep();
    if (mode === 'cpu') { const p = E.aiTarget(game, level, ai); E.setTarget(game, 1, p.x, p.y); }
    else game.paddles[1].speed = E.PADDLE_SPEED;
    for (const ev of E.step(game)) onEvent(ev);
  }
  function onEvent(ev) {
    if (ev === 'hit0' || ev === 'hit1') { beep(ev === 'hit0' ? 620 : 540, 0.04, 0.1); if (ev === 'hit0' || mode === 'two') buzz(12); }
    else if (ev === 'table') beep(880, 0.03, 0.06);
    else if (ev === 'net') beep(200, 0.08, 0.08);
    else if (ev === 'point0' || ev === 'point1') {
      const s = Number(ev[5]), good = s === 0 || mode === 'two';
      flash = { to: s, reason: game.lastPoint.reason, until: game.time + E.PAUSE_POINT };
      beep(good ? 660 : 260, 0.16, 0.1, 0.05); beep(good ? 880 : 200, 0.2, 0.1, 0.2);
      buzz(50);
      say(t('pointSay', { who: names()[s] }) + scoreText());
      Tools.diag.log('point', { to: s, reason: game.lastPoint.reason, rally: game.rally, score: game.score.slice() });
    } else if (ev === 'over') gameOver();
  }

  /* ---------- Sounds (Tools.audio, generated – no files) and vibration ---------- */
  function unlockAudio() { if (settings.sound) Tools.audio.unlock(); }
  function beep(freq, dur, vol, delay = 0) {
    if (settings.sound) Tools.audio.tone({ freq, ms: dur * 1000, type: 'triangle', vol, at: delay });
  }
  function buzz(p) { if (settings.vibrate && 'vibrate' in navigator) try { navigator.vibrate(p); } catch { /* optional */ } }

  /* ---------- Drawing ---------- */
  let P = null;
  function palette() {
    const cs = getComputedStyle(document.documentElement), v = n => cs.getPropertyValue(n).trim();
    P = { floor: v('--floor'), floorLine: v('--floor-line'), table: v('--table'), edge: v('--table-edge'), tline: v('--tline'),
      net: v('--net'), post: v('--post'), ball: v('--ball'), shadow: v('--shadow'), handle: v('--handle'),
      p0: v('--p0'), p1: v('--p1'), text: v('--text'), font: v('--font') };
  }
  function resize() {
    const r = court.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const rot = r.width > r.height * 1.1;   // wide screen: lay the table sideways
    const tw = rot ? H : W, th = rot ? W : H;
    const s = Math.max(0.1, Math.min(r.width / tw, r.height / th));
    geo = { s, ox: (r.width - tw * s) / 2, oy: (r.height - th * s) / 2, rot, dpr };
    draw();
  }
  // Text the right way up: in a game for two facing its player, against the computer upright on the screen
  function label(txt, x, y, size, player, color, weight = 800) {
    ctx.save();
    ctx.translate(x, y);
    const rot = mode === 'two' && phase !== 'idle' ? (player === 1 ? Math.PI : 0) : (geo.rot ? Math.PI / 2 : 0);
    ctx.rotate(rot);
    ctx.font = `${weight} ${size}px ${P.font || 'sans-serif'}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }
  function disc(x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fillStyle = fill; ctx.fill(); }
  function paddle(m, i) {
    const dir = i === 0 ? 1 : -1;   // the handle points to the player
    ctx.fillStyle = P.handle;
    ctx.fillRect(m.x - 1.6, m.y + dir * (PADDLE_R - 1) - (dir < 0 ? 7 : 0), 3.2, 7);
    disc(m.x, m.y, PADDLE_R, i === 0 ? P.p0 : P.p1);
    ctx.globalAlpha = 0.25; disc(m.x, m.y, PADDLE_R * 0.7, '#fff'); ctx.globalAlpha = 1;
    disc(m.x, m.y, PADDLE_R * 0.6, i === 0 ? P.p0 : P.p1);
  }
  function draw() {
    if (!P) palette();
    const { s, ox, oy, rot, dpr } = geo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (rot) ctx.setTransform(0, -dpr * s, dpr * s, 0, dpr * ox, dpr * (oy + W * s));
    else ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const lw = 1 / s, two = phase === 'idle' ? settings.mode === 'two' : mode === 'two';
    // Floor with each player's area lightly in their colour
    ctx.fillStyle = P.floor; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = P.p1; ctx.fillRect(0, 0, W, NET_Y);
    ctx.fillStyle = P.p0; ctx.fillRect(0, NET_Y, W, H - NET_Y);
    ctx.globalAlpha = 1;
    // Table: top, edge lines, centre line
    ctx.fillStyle = P.edge; ctx.fillRect(TX0 - 1, TY0 - 1, TX1 - TX0 + 2, TY1 - TY0 + 2.5);
    ctx.fillStyle = P.table; ctx.fillRect(TX0, TY0, TX1 - TX0, TY1 - TY0);
    ctx.strokeStyle = P.tline; ctx.lineWidth = Math.max(0.8, 2.5 * lw);
    ctx.strokeRect(TX0 + 0.6, TY0 + 0.6, TX1 - TX0 - 1.2, TY1 - TY0 - 1.2);
    ctx.lineWidth = Math.max(0.4, 1.2 * lw);
    ctx.beginPath(); ctx.moveTo(W / 2, TY0); ctx.lineTo(W / 2, TY1); ctx.stroke();
    // Score on the floor beside the net, each facing its player; a small ball beside the server's score
    const sc = game.score;
    label(Tools.fmt(sc[0], 0), W - 6, NET_Y + 9, 9, 0, P.p0);
    label(Tools.fmt(sc[1], 0), W - 6, NET_Y - 9, 9, 1, P.p1);
    if (phase !== 'over') disc(W - 6, NET_Y + (game.server === 0 ? 17 : -17), 1.6, P.ball);
    // Shadow of the ball (further away the higher it is), then the net, then the ball
    const b = game.ball, showBall = game.phase !== 'point' || (flash && game.time < flash.until - E.PAUSE_POINT + 0.5);
    if (b && showBall) { ctx.globalAlpha = 1; disc(b.x + b.z * 0.25, b.y + b.z * 0.35, BALL_R * 0.95, P.shadow); }
    ctx.fillStyle = P.post; ctx.fillRect(TX0 - NET_OVER - 1, NET_Y - 1.2, 2, 2.4); ctx.fillRect(TX1 + NET_OVER - 1, NET_Y - 1.2, 2, 2.4);
    ctx.fillStyle = P.net; ctx.fillRect(TX0 - NET_OVER, NET_Y - 0.7, TX1 - TX0 + 2 * NET_OVER, 1.4);
    ctx.globalAlpha = 0.5; ctx.fillStyle = P.post; ctx.fillRect(TX0 - NET_OVER, NET_Y + 0.5, TX1 - TX0 + 2 * NET_OVER, 0.5 + NET_H * 0.08); ctx.globalAlpha = 1;
    // Paddles below the ball (it flies above them)
    game.paddles.forEach((m, i) => paddle(m, i));
    if (b && showBall) {
      const r = BALL_R * (1 + Math.max(0, b.z) / 45);
      disc(b.x, b.y, r, P.ball);
      ctx.globalAlpha = 0.45; disc(b.x - r * 0.3, b.y - r * 0.3, r * 0.4, '#fff'); ctx.globalAlpha = 1;
    }
    // Serve hint at the server's end
    if (game.phase === 'serve' && phase === 'play' && (two || game.server === 0)) {
      const i = game.server;
      label(t('serveYou'), W / 2, i === 0 ? TY1 - 14 : TY0 + 14, 7, i, P.tline, 700);
    }
    // Message after a point: in both halves (for two) or in the middle of the player's half (against the computer)
    if (flash && game.phase === 'point' && game.time < flash.until && phase !== 'idle') {
      const txt = t('r_' + flash.reason), col = flash.to === 0 ? P.p0 : P.p1;
      if (two) {
        label(txt, W / 2, NET_Y + 30, 13, 0, col);
        label(txt, W / 2, NET_Y - 30, 13, 1, col);
      } else label(txt, W / 2, NET_Y + 30, 13, 0, col);
    }
    // Result for both players in a game for two
    if (phase === 'over' && two) {
      label(game.winner === 0 ? t('won') : t('lost'), W / 2, H - 8, 8, 0, P.p0);
      label(game.winner === 1 ? t('won') : t('lost'), W / 2, 8, 8, 1, P.p1);
    }
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(court); else window.addEventListener('resize', resize);
  Tools.theme.onChange(() => { palette(); draw(); });
  Tools.onLang(() => { renderPanel(); draw(); });
  renderSettings(); renderPanel(); resize();

  Tools.diag.info(() => ({ phase, mode, level, points: settings.points, score: game.score.slice(), rotated: geo.rot, fullscreen: settings.fullscreen,
    fingers: owners.filter(o => o !== null).length, maxTouchPoints: navigator.maxTouchPoints || 0, engine: game.phase, server: game.server,
    paddles: game.paddles.map(m => [Math.round(m.x), Math.round(m.y)]), ball: [Math.round(game.ball.x), Math.round(game.ball.y), Math.round(game.ball.z)] }));

  /* ---------- WebMCP ---------- */
  const modeName = m => m === 'cpu' ? 'computer' : 'two_players';
  const state = () => ({
    phase, mode: modeName(phase === 'idle' ? settings.mode : mode), level: phase === 'idle' ? settings.level : level,
    points_to_win: phase === 'idle' ? settings.points : game.pointsToWin,
    score: phase === 'idle' ? null : { blue: game.score[0], red: game.score[1] },
    server: phase === 'idle' || phase === 'over' ? null : (game.server === 0 ? 'blue' : 'red'),
    winner: phase === 'over' ? (game.winner === 0 ? 'blue' : 'red') : null,
    next_game: { mode: modeName(settings.mode), level: settings.level, points_to_win: settings.points },
    record_against_computer: Object.fromEntries(LEVELS.map(l => { const r = rec(l); return [l, { wins: r.w, losses: r.l }]; })),
  });
  Tools.mcp.register({
    name: 'get_state', title: 'Read game state', readOnly: true,
    description: 'Reads the table tennis game: phase (idle, play, paused, over), mode (computer = the user plays blue at the bottom against the computer as red; two_players = two people on one device), computer strength, points needed to win (with a lead of 2), current score (blue and red), who serves, winner, the settings for the next game and the record of wins and losses against the computer per strength.',
    execute: state
  });
  Tools.mcp.register({
    name: 'set_game', title: 'Set up the next game', label: 'mcp.set',
    description: 'Sets mode, computer strength and/or points needed to win for the next game, as on the start card and in the settings. A running game is not changed; the settings apply when the next game starts. Returns the game state.',
    inputSchema: { type: 'object', properties: {
      mode: { type: 'string', enum: ['computer', 'two_players'], description: 'computer: one person against the computer; two_players: two people on one device.' },
      level: { type: 'string', enum: LEVELS, description: 'Strength of the computer player.' },
      points_to_win: { type: 'integer', enum: POINTS, description: 'Points needed to win the game (with a lead of 2).' }
    }, additionalProperties: false },
    execute: ({ mode: m, level: l, points_to_win: n } = {}) => {
      if (m) settings.mode = m === 'computer' ? 'cpu' : 'two';
      if (l) settings.level = l;
      if (n) { settings.points = n; if (phase === 'idle') game.pointsToWin = n; }
      save(); renderSettings(); renderPanel(); draw();
      return state();
    }
  });
  Tools.mcp.register({
    name: 'new_game', title: 'Start a new game', label: 'mcp.new',
    description: 'Starts a new game with the current settings, as if the user pressed Play. A running game is abandoned. The players then play with their fingers; the agent cannot move the paddles. Returns the game state.',
    execute: () => { newGame(); return state(); }
  });
})();
