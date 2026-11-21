/* Airhockey – page script: game flow, multi-touch input, computer player, drawing, sounds, settings, WebMCP.
   Physics and computer player without DOM: engine.js (window.HockeyEngine). See README.md. */
(function () {
  'use strict';
  Tools.i18n({
    de: {
      you: 'Du', computer: 'Computer', blue: 'Blau', red: 'Rot',
      goal: 'Tor!', against: 'Gegentor', won: 'Gewonnen!', lost: 'Verloren',
      winsTwo: '{who} gewinnt', paused: 'Pause', resume: 'Weiterspielen', again: 'Nochmal',
      levelName_easy: 'Leicht', levelName_medium: 'Mittel', levelName_hard: 'Schwer',
      record: 'Bilanz ({level}): {w} {wW} · {l} {lW}', recordNone: 'Noch keine Spiele gegen „{level}“.',
      win1: 'Sieg', winN: 'Siege', loss1: 'Niederlage', lossN: 'Niederlagen',
      introCpu: 'Du spielst unten. Finger auf den Tisch und ziehen.',
      introTwo: 'Gerät flach hinlegen: Blau unten, Rot oben – jeder mit einem Finger auf seiner Hälfte.',
      scoreSay: '{a} {sa} : {sb} {b}', goalSay: 'Tor für {who}. ', firstTo: 'Wer zuerst {n} Tore schießt, gewinnt.',
      clearQ: 'Bilanz gegen den Computer löschen?', cleared: 'Bilanz gelöscht', newQ: 'Laufendes Spiel abbrechen und neu beginnen?',
      'mcp.set': 'Spiel eingestellt', 'mcp.new': 'Neues Spiel'
    },
    en: {
      title: 'Air Hockey', pause: 'Pause', newGame: 'New game', rinkL: 'Rink', cvLabel: 'Air hockey table',
      modeL: 'Mode', cpu: 'Against computer', two: 'Two of us', levelL: 'Computer strength', easy: 'Easy', medium: 'Medium', hard: 'Hard',
      play: 'Play', settingsH: 'Settings', goalsL: 'Goals to win', sound: 'Sounds', vibrate: 'Vibrate on hits and goals', clearRecord: 'Delete record',
      you: 'You', computer: 'Computer', blue: 'Blue', red: 'Red',
      goal: 'Goal!', against: 'Conceded', won: 'You won!', lost: 'You lost',
      winsTwo: '{who} wins', paused: 'Paused', resume: 'Resume', again: 'Play again',
      levelName_easy: 'Easy', levelName_medium: 'Medium', levelName_hard: 'Hard',
      record: 'Record ({level}): {w} {wW} · {l} {lW}', recordNone: 'No games against “{level}” yet.',
      win1: 'win', winN: 'wins', loss1: 'loss', lossN: 'losses',
      introCpu: 'You play at the bottom. Put a finger on the table and drag.',
      introTwo: 'Lay the device flat: blue at the bottom, red at the top – each with a finger on their own half.',
      scoreSay: '{a} {sa} : {sb} {b}', goalSay: 'Goal for {who}. ', firstTo: 'First to {n} goals wins.',
      clearQ: 'Delete your record against the computer?', cleared: 'Record deleted', newQ: 'Abandon the running game and start again?',
      'mcp.set': 'game set up', 'mcp.new': 'new game'
    }
  });
  const t = Tools.t, $ = Tools.$, E = window.HockeyEngine;
  const { W, H, GOAL, CORNER, PUCK_R, MALLET_R, DT } = E;

  /* ---------- Stored settings and record ---------- */
  const LS = 'air-hockey.settings.v1';
  const GOALS = [3, 5, 7, 10], LEVELS = ['easy', 'medium', 'hard'];
  const settings = Object.assign({ mode: 'cpu', level: 'medium', goals: 7, sound: true, vibrate: true, record: {} }, Tools.load(LS, {}));
  if (!['cpu', 'two'].includes(settings.mode)) settings.mode = 'cpu';
  if (!LEVELS.includes(settings.level)) settings.level = 'medium';
  if (!GOALS.includes(settings.goals)) settings.goals = 7;
  if (!settings.record || typeof settings.record !== 'object') settings.record = {};
  const save = () => Tools.save(LS, settings);
  const rec = l => { const r = settings.record[l] || {}; return { w: Math.max(0, Math.floor(r.w) || 0), l: Math.max(0, Math.floor(r.l) || 0) }; };

  /* ---------- Game state ---------- */
  // phase: 'idle' (start card), 'play', 'paused', 'over'
  let game = E.createGame({ goalsToWin: settings.goals }), phase = 'idle', mode = settings.mode, level = settings.level;
  let ai = {}, flash = null;   // flash: last goal for the message on the table { scorer, until }
  const cv = $('cv'), ctx = cv.getContext('2d'), rink = $('rink');

  function newGame() {
    mode = settings.mode; level = settings.level;
    game = E.createGame({ goalsToWin: settings.goals });
    ai = {}; flash = null; owners = [null, null]; keys.clear();
    setPhase('play');
    Tools.diag.log('new game', { mode, level, goals: settings.goals });
    say(t('firstTo', { n: settings.goals }));
  }
  function setPhase(p) {
    phase = p;
    rink.dataset.phase = p;
    if (p === 'play') { last = 0; startLoop(); Tools.wakeLock.hold('game'); } else { stopLoop(); Tools.wakeLock.release('game'); }
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
    $('btnPause').disabled = phase !== 'play';
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
    for (const b of document.querySelectorAll('#optGoals button')) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === settings.goals));
    $('optSound').checked = settings.sound;
    $('optVibrate').checked = settings.vibrate;
  }
  for (const b of document.querySelectorAll('#modes button')) b.addEventListener('click', () => { settings.mode = b.dataset.mode; save(); renderPanel(); draw(); });
  for (const b of document.querySelectorAll('#levels button')) b.addEventListener('click', () => { settings.level = b.dataset.level; save(); renderPanel(); });
  for (const b of document.querySelectorAll('#optGoals button')) b.addEventListener('click', () => {
    settings.goals = Number(b.dataset.v); save(); renderSettings();
    if (phase === 'idle') { game.goalsToWin = settings.goals; }
  });
  $('optSound').addEventListener('change', e => { settings.sound = e.target.checked; save(); unlockAudio(); });
  $('optVibrate').addEventListener('change', e => { settings.vibrate = e.target.checked; save(); });
  $('btnStart').addEventListener('click', () => {
    unlockAudio();
    if (phase === 'paused') { setPhase('play'); Tools.diag.log('resumed'); } else newGame();
    cv.focus({ preventScroll: true });
  });
  $('btnPause').addEventListener('click', pause);
  $('btnNew').addEventListener('click', async () => {
    if ((phase === 'play' || phase === 'paused') && game.score[0] + game.score[1] > 0) {
      pause();
      if (!await Tools.confirm(t('newQ'), { action: 'reset' })) return;
    }
    game = E.createGame({ goalsToWin: settings.goals }); flash = null;
    setPhase('idle');
  });
  $('btnClearRecord').addEventListener('click', async () => {
    if (!await Tools.confirm(t('clearQ'), { action: 'delete' })) return;
    settings.record = {}; save(); renderPanel(); Tools.toast(t('cleared')); Tools.menu.close();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  /* ---------- Multi-touch: every finger belongs to the half where it touched down ---------- */
  let owners = [null, null];   // pointerId per player
  let geo = { s: 1, ox: 0, oy: 0, rot: false, dpr: 1 };
  function toTable(e) {
    const r = cv.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, { s, ox, oy, rot } = geo;
    return rot ? { x: W - (sy - oy) / s, y: (sx - ox) / s } : { x: (sx - ox) / s, y: (sy - oy) / s };
  }
  cv.addEventListener('pointerdown', e => {
    if (phase !== 'play') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    unlockAudio();   // iPhone: sound only after a tap, and again after the app was in the background
    const p = toTable(e), i = mode === 'two' && p.y < H / 2 ? 1 : 0;
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
    // All points since the last frame, so a fast swipe gives the mallet its full speed
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const p = toTable(list.length ? list[list.length - 1] : e);
    E.setTarget(game, i, p.x, p.y);
  });
  const release = e => { const i = owners.indexOf(e.pointerId); if (i >= 0) owners[i] = null; };
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('lostpointercapture', release);
  cv.addEventListener('contextmenu', e => e.preventDefault());

  // Keyboard: arrows move the blue mallet, space pauses
  const keys = new Set();
  cv.addEventListener('keydown', e => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { keys.add(e.key); e.preventDefault(); }
    else if (e.key === ' ' && phase === 'play') { e.preventDefault(); pause(); }
  });
  cv.addEventListener('keyup', e => keys.delete(e.key));
  cv.addEventListener('blur', () => keys.clear());
  function keyStep() {
    if (!keys.size) return;
    const m = game.mallets[0], v = 150 * DT;
    let dx = (keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0), dy = (keys.has('ArrowDown') ? 1 : 0) - (keys.has('ArrowUp') ? 1 : 0);
    if (geo.rot) [dx, dy] = [-dy, dx];   // table turned: screen right is towards the blue goal
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
    else game.mallets[1].speed = E.MALLET_SPEED;
    for (const ev of E.step(game)) onEvent(ev);
  }
  function onEvent(ev) {
    if (ev === 'hit0' || ev === 'hit1') { beep(ev === 'hit0' ? 520 : 440, 0.05, 0.09); if (ev === 'hit0' || mode === 'two') buzz(12); }
    else if (ev === 'wall' || ev === 'post') beep(300, 0.04, 0.05);
    else if (ev === 'goal0' || ev === 'goal1') {
      const s = Number(ev[4]);
      flash = { scorer: s, until: game.time + E.PAUSE_GOAL };
      beep(s === 0 || mode === 'two' ? 660 : 220, 0.18, 0.12); beep(s === 0 || mode === 'two' ? 880 : 180, 0.22, 0.12, 0.16);
      buzz(60);
      say(t('goalSay', { who: names()[s] }) + scoreText());
      Tools.diag.log('goal', { scorer: s, score: game.score.slice() });
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
    P = { table: v('--table'), line: v('--line'), rim: v('--rim'), goal: v('--goal'), puck: v('--puck'), ring: v('--puck-ring'),
      p0: v('--p0'), p1: v('--p1'), knob: v('--knob'), text: v('--text'), font: v('--font') };
  }
  function resize() {
    const r = rink.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const pad = 6, rim = 8, rot = r.width > r.height * 1.1;   // wide screen: lay the table sideways
    const tw = rot ? H : W, th = rot ? W : H;
    const s = Math.max(0.1, Math.min((r.width - 2 * pad) / (tw + rim), (r.height - 2 * pad) / (th + rim)));
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
  function draw() {
    if (!P) palette();
    const { s, ox, oy, rot, dpr } = geo;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (rot) ctx.setTransform(0, -dpr * s, dpr * s, 0, dpr * ox, dpr * (oy + W * s));
    else ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    const lw = 1 / s, two = mode === 'two' && phase !== 'idle' || phase === 'idle' && settings.mode === 'two';
    // Rim, table, goal mouths
    ctx.fillStyle = P.rim; roundRect(-4, -4, W + 8, H + 8, CORNER + 4); ctx.fill();
    ctx.save(); roundRect(0, 0, W, H, CORNER); ctx.clip();
    ctx.fillStyle = P.table; ctx.fillRect(0, 0, W, H);
    // Each half lightly in its player's colour
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = P.p1; ctx.fillRect(0, 0, W, H / 2);
    ctx.fillStyle = P.p0; ctx.fillRect(0, H / 2, W, H / 2);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.fillStyle = P.goal;
    ctx.fillRect(W / 2 - GOAL / 2, -4, GOAL, 4.5); ctx.fillRect(W / 2 - GOAL / 2, H - 0.5, GOAL, 4.5);
    // Lines: centre line and circle, goal creases
    ctx.strokeStyle = P.line; ctx.lineWidth = Math.max(0.6, 2 * lw);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 14, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, 0, GOAL / 2 + 4, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, H, GOAL / 2 + 4, Math.PI, 2 * Math.PI); ctx.stroke();
    // Score beside the centre line, each facing its player
    const sc = game.score;
    ctx.globalAlpha = 0.55;
    label(Tools.fmt(sc[0], 0), W - 12, H / 2 + 11, 13, 0, P.p0);
    label(Tools.fmt(sc[1], 0), W - 12, H / 2 - 11, 13, 1, P.p1);
    ctx.globalAlpha = 1;
    // Goal message in each half (for two) or in the middle (against the computer)
    if (flash && game.phase === 'goal' && game.time < flash.until && phase !== 'idle') {
      const fs = 15;
      if (two) {
        label(flash.scorer === 0 ? t('goal') : t('against'), W / 2, H * 0.72, fs, 0, flash.scorer === 0 ? P.p0 : P.text);
        label(flash.scorer === 1 ? t('goal') : t('against'), W / 2, H * 0.28, fs, 1, flash.scorer === 1 ? P.p1 : P.text);
      } else label(flash.scorer === 0 ? t('goal') : t('against'), W / 2, H * 0.66, fs, 0, flash.scorer === 0 ? P.p0 : P.p1);
    }
    // Result for both players in a game for two
    if (phase === 'over' && two) {
      label(game.winner === 0 ? t('won') : t('lost'), W / 2, H - 14, 9, 0, P.p0);
      label(game.winner === 1 ? t('won') : t('lost'), W / 2, 14, 9, 1, P.p1);
    }
    // Puck (hidden between a goal and the next serve)
    const p = game.puck;
    if (game.phase !== 'goal') { disc(p.x, p.y, PUCK_R, P.puck); ctx.strokeStyle = P.ring; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x, p.y, PUCK_R * 0.6, 0, 2 * Math.PI); ctx.stroke(); }
    // Mallets
    game.mallets.forEach((m, i) => {
      disc(m.x, m.y, MALLET_R, i === 0 ? P.p0 : P.p1);
      disc(m.x, m.y, MALLET_R * 0.55, P.knob);
      disc(m.x, m.y, MALLET_R * 0.35, i === 0 ? P.p0 : P.p1);
    });
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(rink); else window.addEventListener('resize', resize);
  Tools.theme.onChange(() => { palette(); draw(); });
  Tools.onLang(() => { renderPanel(); draw(); });
  renderSettings(); renderPanel(); resize();

  Tools.diag.info(() => ({ phase, mode, level, goals: settings.goals, score: game.score.slice(), rotated: geo.rot,
    fingers: owners.filter(o => o !== null).length, maxTouchPoints: navigator.maxTouchPoints || 0,
    mallets: game.mallets.map(m => [Math.round(m.x), Math.round(m.y)]), puck: [Math.round(game.puck.x), Math.round(game.puck.y)] }));

  /* ---------- WebMCP ---------- */
  const modeName = m => m === 'cpu' ? 'computer' : 'two_players';
  const state = () => ({
    phase, mode: modeName(phase === 'idle' ? settings.mode : mode), level: phase === 'idle' ? settings.level : level,
    goals_to_win: phase === 'idle' ? settings.goals : game.goalsToWin,
    score: phase === 'idle' ? null : { blue: game.score[0], red: game.score[1] },
    winner: phase === 'over' ? (game.winner === 0 ? 'blue' : 'red') : null,
    next_game: { mode: modeName(settings.mode), level: settings.level, goals_to_win: settings.goals },
    record_against_computer: Object.fromEntries(LEVELS.map(l => { const r = rec(l); return [l, { wins: r.w, losses: r.l }]; })),
  });
  Tools.mcp.register({
    name: 'get_state', title: 'Read game state', readOnly: true,
    description: 'Reads the air hockey game: phase (idle, play, paused, over), mode (computer = the user plays blue at the bottom against the computer as red; two_players = two people on one device), computer strength, goals needed to win, current score (blue and red), winner, the settings for the next game and the record of wins and losses against the computer per strength.',
    execute: state
  });
  Tools.mcp.register({
    name: 'set_game', title: 'Set up the next game', label: 'mcp.set',
    description: 'Sets mode, computer strength and/or goals needed to win for the next game, as on the start card and in the settings. A running game is not changed; the settings apply when the next game starts. Returns the game state.',
    inputSchema: { type: 'object', properties: {
      mode: { type: 'string', enum: ['computer', 'two_players'], description: 'computer: one person against the computer; two_players: two people on one device.' },
      level: { type: 'string', enum: LEVELS, description: 'Strength of the computer player.' },
      goals_to_win: { type: 'integer', enum: GOALS, description: 'Goals needed to win the game.' }
    }, additionalProperties: false },
    execute: ({ mode: m, level: l, goals_to_win: g } = {}) => {
      if (m) settings.mode = m === 'computer' ? 'cpu' : 'two';
      if (l) settings.level = l;
      if (g) { settings.goals = g; if (phase === 'idle') game.goalsToWin = g; }
      save(); renderSettings(); renderPanel(); draw();
      return state();
    }
  });
  Tools.mcp.register({
    name: 'new_game', title: 'Start a new game', label: 'mcp.new',
    description: 'Starts a new game with the current settings, as if the user pressed Play. A running game is abandoned. The players then play with their fingers; the agent cannot move the mallets. Returns the game state.',
    execute: () => { newGame(); return state(); }
  });
})();
