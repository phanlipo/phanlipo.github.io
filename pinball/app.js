/* Flipper – page script: table choice, game flow, touch and keyboard input, drawing, sounds, best scores, WebMCP.
   Tables as data: tables.js (window.PinballTables); physics and rules without DOM: engine.js (window.PinballEngine).
   See README.md. */
(function () {
  'use strict';
  Tools.i18n({
    de: {
      paused: 'Pause', resume: 'Weiterspielen', again: 'Nochmal', over: 'Spiel vorbei', newBest: 'Neuer Bestwert!',
      intro: 'Linke Bildschirmhälfte: linker Flipper, rechte Hälfte: rechter Flipper. Zum Abschießen rechts gedrückt halten und loslassen.',
      desc_komet: 'Zum Einstieg: drei Bumper, Bahnen oben, Ziele rechts.',
      desc_tiefsee: 'Mittel: Rampe, Spinner, Kugelfang mit Multiball, Kickback.',
      desc_uhrwerk: 'Schwer: zwei Rampen, dritter Flipper, fünf Missionen bis zum Multiball mit drei Kugeln.',
      mis_ramp: '{n} Rampen', mis_spinner: 'Spinner {n}×', mis_bumper: '{n} Bumper', mis_bankAll: 'Alle Ziele', mis_saucer: 'In die Uhr', mis_lane: '{n} Bahnen',
      missionDone: 'Mission geschafft', missionsAll: 'Uhrwerk aufgezogen!',
      sayMission: 'Mission geschafft. Nächste: {m}.', sayMissionsAll: 'Alle Missionen geschafft – Multiball!',
      best: 'Bestwert ({table}, {n} Kugeln): {s}', bestNone: 'Noch kein Bestwert auf „{table}“ mit {n} Kugeln.',
      ballOf: 'Kugel {b}/{n}', ballLabel: 'Kugel', multLabel: 'Multiplikator', scoreLabel: 'Punkte',
      save: 'Ballsicherung', bonus: 'Bonus {b} × {m}', launchHint: 'Rechts halten, loslassen',
      multiball: 'Multiball!', jackpot: 'Jackpot', lockLit: 'Multiball bereit', kickbackLit: 'Kickback an', kickback: 'Kickback!',
      lamp_lock: 'Multiball', lamp_jackpot: 'Jackpot',
      sayBall: 'Kugel {b} von {n}. Rechts gedrückt halten und loslassen zum Abschießen.',
      sayDrain: 'Kugel verloren. Bonus {s}. Punkte: {p}.', saySaved: 'Ballsicherung: Die Kugel kommt zurück.',
      sayMult: 'Multiplikator {m}.', sayBank: 'Alle Ziele getroffen.', sayOver: 'Spiel vorbei. {p} Punkte.',
      sayLock: 'Multiball bereit: in den Kugelfang schießen.', sayMultiball: 'Multiball! Rampe gibt Jackpot.', sayJackpot: 'Jackpot! Punkte: {p}.',
      sayKickLit: 'Kickback links ist an.', sayKick: 'Kickback.',
      clearQ: 'Alle Bestwerte löschen?', cleared: 'Bestwerte gelöscht', newQ: 'Laufendes Spiel abbrechen und neu beginnen?',
      'mcp.set': 'Spiel eingestellt', 'mcp.new': 'Neues Spiel'
    },
    en: {
      title: 'Pinball', pause: 'Pause', newGame: 'New game', tableL: 'Pinball table', cvLabel: 'Pinball table', tablesL: 'Table',
      play: 'Play', settingsH: 'Settings', ballsL: 'Balls per game', sound: 'Sounds', fsOpt: 'Full screen while playing (no status and navigation bar)',
      vibrate: 'Vibrate on flippers and bumpers', clearBest: 'Delete best scores', flipL: 'Left flipper', flipR: 'Right flipper',
      paused: 'Paused', resume: 'Resume', again: 'Play again', over: 'Game over', newBest: 'New best score!',
      intro: 'Left half of the screen: left flipper, right half: right flipper. To launch, hold the right side and let go.',
      desc_komet: 'To start with: three bumpers, top lanes, targets on the right.',
      desc_tiefsee: 'Medium: ramp, spinner, saucer with multiball, kickback.',
      desc_uhrwerk: 'Hard: two ramps, a third flipper, five missions up to a three-ball multiball.',
      mis_ramp: '{n} ramps', mis_spinner: 'Spinner {n}×', mis_bumper: '{n} bumpers', mis_bankAll: 'All targets', mis_saucer: 'Into the clock', mis_lane: '{n} lanes',
      missionDone: 'Mission done', missionsAll: 'Clockwork wound up!',
      sayMission: 'Mission done. Next: {m}.', sayMissionsAll: 'All missions done – multiball!',
      best: 'Best ({table}, {n} balls): {s}', bestNone: 'No best score on “{table}” with {n} balls yet.',
      ballOf: 'Ball {b}/{n}', ballLabel: 'Ball', multLabel: 'Multiplier', scoreLabel: 'Score',
      save: 'Ball save', bonus: 'Bonus {b} × {m}', launchHint: 'Hold right, let go',
      multiball: 'Multiball!', jackpot: 'Jackpot', lockLit: 'Multiball ready', kickbackLit: 'Kickback on', kickback: 'Kickback!',
      lamp_lock: 'Multiball', lamp_jackpot: 'Jackpot',
      sayBall: 'Ball {b} of {n}. Hold the right side and let go to launch.',
      sayDrain: 'Ball lost. Bonus {s}. Score: {p}.', saySaved: 'Ball save: the ball comes back.',
      sayMult: 'Multiplier {m}.', sayBank: 'All targets hit.', sayOver: 'Game over. {p} points.',
      sayLock: 'Multiball ready: shoot into the saucer.', sayMultiball: 'Multiball! The ramp scores the jackpot.', sayJackpot: 'Jackpot! Score: {p}.',
      sayKickLit: 'The left kickback is on.', sayKick: 'Kickback.',
      clearQ: 'Delete all best scores?', cleared: 'Best scores deleted', newQ: 'Abandon the running game and start again?',
      'mcp.set': 'game set up', 'mcp.new': 'new game'
    }
  });
  const t = Tools.t, $ = Tools.$, E = window.PinballEngine, TABLES = window.PinballTables;
  const { W, H, BALL_R, DT, FLIP_R, LANE_REST, SEP_X, CX } = E;
  const tableName = id => TABLES.byId[id].name[Tools.lang() === 'en' ? 'en' : 'de'];

  /* ---------- Stored settings and best scores ----------
     v2: best scores per table ({ komet: { 3: n, 5: n }, … }). v1 (only the first table) is taken over once. */
  const LS = 'pinball.settings.v2', LS1 = 'pinball.settings.v1';
  const BALLS = [3, 5], IDS = TABLES.list.map(tb => tb.id);
  const stored = Tools.load(LS, null) || (old => old ? { ...old, table: 'komet', best: { komet: old.best || {} } } : {})(Tools.load(LS1, null));
  const settings = Object.assign({ table: 'komet', balls: 3, sound: true, fullscreen: true, vibrate: true, best: {} }, stored);
  if (!IDS.includes(settings.table)) settings.table = 'komet';
  if (!BALLS.includes(settings.balls)) settings.balls = 3;
  if (!settings.best || typeof settings.best !== 'object') settings.best = {};
  const save = () => Tools.save(LS, settings);
  const best = (id, n) => Math.max(0, Math.floor((settings.best[id] || {})[n]) || 0);

  /* ---------- Game state ---------- */
  // phase: 'idle' (start card), 'play', 'paused', 'over'
  let game = E.createGame(TABLES.byId[settings.table], { balls: settings.balls }), phase = 'idle', newRecord = false, message = null;
  const cv = $('cv'), ctx = cv.getContext('2d'), table = $('table');

  function freshGame() { game = E.createGame(TABLES.byId[settings.table], { balls: settings.balls }); message = null; showTable(); }
  function newGame() {
    freshGame();
    newRecord = false; releaseAll();
    setPhase('play');
    Tools.diag.log('new game', { table: settings.table, balls: settings.balls });
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
    const id = game.table.id;
    newRecord = game.score > best(id, game.balls);
    if (newRecord) { settings.best[id] = { ...settings.best[id], [game.balls]: game.score }; save(); }
    Tools.diag.log('game over', { table: id, balls: game.balls, newRecord });
    say(t('sayOver', { p: pts(game.score) }));
    setPhase('over');
    buzz([60, 60, 120]);
  }

  /* ---------- Panel, table choice and score bar ---------- */
  function renderTables() {
    const box = $('tables');
    if (box.children.length !== IDS.length) {
      box.textContent = '';
      for (const id of IDS) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.table = id;
        b.addEventListener('click', () => setTable(id));
        box.append(b);
      }
    }
    for (const b of box.children) { b.textContent = tableName(b.dataset.table); b.setAttribute('aria-pressed', String(b.dataset.table === settings.table)); }
  }
  function renderPanel() {
    const panel = $('panel'), show = phase !== 'play';
    panel.hidden = !show;
    $('btnPause').hidden = phase !== 'play';
    if (!show) return;
    const over = phase === 'over', paused = phase === 'paused', choose = phase === 'idle' || over;
    $('panelTitle').textContent = over ? (newRecord ? t('newBest') : t('over')) : paused ? t('paused') : t('title');
    $('panelScore').hidden = phase === 'idle';
    $('panelScore').textContent = pts(game.score);
    $('tables').hidden = !choose;
    renderTables();
    $('tableDesc').hidden = !choose;
    $('tableDesc').textContent = t('desc_' + settings.table);
    $('panelText').hidden = phase !== 'idle';
    $('panelText').textContent = t('intro');
    const id = choose ? settings.table : game.table.id, n = choose ? settings.balls : game.balls, b = best(id, n);
    $('best').textContent = b ? t('best', { table: tableName(id), n, s: pts(b) }) : t('bestNone', { table: tableName(id), n });
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
  // The table on screen: its colours (CSS per data-table) and, before a game, the chosen layout
  function showTable() { table.dataset.table = game.table.id; P = null; draw(); }
  function setTable(id) {
    settings.table = id; save();
    if (phase === 'idle' || phase === 'over') { freshGame(); renderHud(); }
    renderPanel();
  }
  function setBalls(n) {
    settings.balls = n; save(); renderSettings();
    if (phase === 'idle') { freshGame(); renderHud(); }
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
    freshGame();
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
  const waiting = () => game.phase === 'launch';
  function press(ctrl, id) {
    if (phase !== 'play') return;
    if (ctrl === 'R' && waiting()) ctrl = 'P';
    held[ctrl].add(id);
    if (ctrl === 'P') E.setPlunger(game, true);
    else { E.setFlipper(game, ctrl === 'L' ? 0 : 1, true); buzz(30); beep(ctrl === 'L' ? 180 : 200, 0.04, 0.05); }
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
  const show = (text, s = 1.4) => { message = { text, until: game.time + s }; };
  function onEvent(ev) {
    switch (ev) {
      case 'bumper': beep(620 + 80 * (game.bumperHits % 3), 0.06, 0.1); buzz(30); break;
      case 'sling': beep(420, 0.05, 0.09); buzz(30); break;
      case 'wall': beep(150, 0.03, 0.04); break;
      case 'flip0': case 'flip1': beep(260, 0.03, 0.06); break;
      case 'launch': beep(240, 0.12, 0.08); break;
      case 'lane': beep(880, 0.08, 0.08); break;
      case 'target': beep(500, 0.07, 0.1); break;
      case 'spinner': beep(1200, 0.03, 0.05); beep(1300, 0.03, 0.05, 0.05); break;
      case 'saucer': beep(330, 0.1, 0.1); beep(440, 0.1, 0.1, 0.1); break;
      case 'rampIn': beep(300, 0.25, 0.05); break;
      case 'ramp': beep(660, 0.08, 0.1); beep(880, 0.12, 0.1, 0.08); show('+' + pts(game.table.ramps[0].score), 1); break;
      case 'lanesAll':
        beep(660, 0.1, 0.1); beep(990, 0.16, 0.1, 0.1);
        show('×' + Tools.fmt(game.mult, 0)); say(t('sayMult', { m: Tools.fmt(game.mult, 0) })); break;
      case 'bankAll':
        beep(520, 0.1, 0.1); beep(780, 0.18, 0.1, 0.1); say(t('sayBank')); break;
      case 'kickbackLit': show(t('kickbackLit')); say(t('sayKickLit')); break;
      case 'kickback': beep(200, 0.15, 0.12); buzz(60); show(t('kickback')); say(t('sayKick')); break;
      case 'lockLit': beep(700, 0.1, 0.1); beep(900, 0.1, 0.1, 0.12); show(t('lockLit')); say(t('sayLock')); break;
      case 'multiball':
        for (let i = 0; i < 4; i++) beep(520 + i * 130, 0.1, 0.1, i * 0.1);
        buzz([60, 40, 60]); show(t('multiball'), 2); say(t('sayMultiball')); Tools.diag.log('multiball'); break;
      case 'jackpot':
        for (let i = 0; i < 3; i++) beep(880 + i * 220, 0.12, 0.12, i * 0.12);
        buzz(80); show(t('jackpot') + ' +' + pts(game.table.multiball.jackpot), 1.8); say(t('sayJackpot', { p: pts(game.score) })); break;
      case 'saved':
        beep(700, 0.1, 0.08); beep(700, 0.1, 0.08, 0.15);
        show(t('save'), 1.6); say(t('saySaved')); Tools.diag.log('ball saved'); break;
      case 'drain':
        beep(300, 0.2, 0.1, 0); beep(200, 0.3, 0.1, 0.18); buzz(80);
        show(t('bonus', { b: pts(game.lastBonus / Math.max(1, game.lastMult)), m: Tools.fmt(game.lastMult, 0) }), 1.6);
        say(t('sayDrain', { s: pts(game.lastBonus), p: pts(game.score) }));
        Tools.diag.log('drain', { ball: game.ball }); break;
      case 'mission': beep(780, 0.1, 0.1); beep(1040, 0.14, 0.1, 0.1); show(t('missionDone')); say(t('sayMission', { m: missionText() })); break;
      case 'missionsAll':
        for (let i = 0; i < 5; i++) beep(440 + i * 110, 0.1, 0.1, i * 0.09);
        show(t('missionsAll'), 2); say(t('sayMissionsAll')); Tools.diag.log('missions done'); break;
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
    // Colours from the tokens; each table has its own (CSS .table[data-table=…])
    const cs = getComputedStyle(table), v = n => cs.getPropertyValue(n).trim();
    P = { cab: v('--cabinet'), field: v('--field'), wall: v('--wall'), bumper: v('--bumper'), lit: v('--lit'), sling: v('--sling'),
      flipper: v('--flipper'), ball: v('--ball'), lamp: v('--lamp'), target: v('--target'), ramp: v('--ramp'), text: v('--text'), font: v('--font') };
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
  // The current mission as text: "2 Rampen 1/2"
  function missionText() {
    const list = game.table.missions;
    if (!list || !list.length) return '';
    const m = list[game.mission.i];
    return t('mis_' + m.kind, { n: Tools.fmt(m.count, 0) }) + ' ' + Tools.fmt(game.mission.n, 0) + '/' + Tools.fmt(m.count, 0);
  }
  const blink = () => Math.floor(game.time * 4) % 2 === 0;
  function lampOn(l) {
    const g = game;
    switch (l.kind) {
      case 'mult': return g.mult >= l.n;
      case 'save': return g.time < g.saveUntil && phase !== 'idle' && (g.saveUntil - g.time > 2 || blink());
      case 'kickback': return g.lamps.kickback;
      case 'lock': return g.lamps.lock && blink();
      case 'jackpot': return g.multiball && blink();
      case 'mission': return l.n < g.mission.i || (l.n === g.mission.i && g.mission.n > 0 && blink());
    }
    return false;
  }
  function drawBall(b) {
    const big = b.layer === 1 ? 1.12 : 1;   // on the ramp: a little closer to the eye
    if (b.layer === 1) { ctx.globalAlpha = 0.25; disc(b.x + 1, b.y + 1.4, BALL_R, P.cab); ctx.globalAlpha = 1; }
    disc(b.x, b.y, BALL_R * big, P.ball);
    disc(b.x - 0.8, b.y - 0.8, BALL_R * 0.35 * big, P.field);
  }
  function draw() {
    if (!P) palette();
    const { s, ox, oy, dpr } = geo, g = game, T = g.table;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    // Cabinet and playfield (round top)
    ctx.fillStyle = P.cab; ctx.fillRect(0, 0, W, H);
    ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, 50); ctx.arc(50, 50, 50, Math.PI, 2 * Math.PI); ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = P.field; ctx.fill();
    // Lamps
    for (const l of T.lamps) {
      const on = lampOn(l);
      disc(l.x, l.y, l.r, on ? P.lit : P.lamp);
      if (l.kind === 'mult') text('×' + l.n, l.x, l.y + 0.2, 2.8, on ? P.field : P.text, 700);
      else if (l.kind === 'lock' || l.kind === 'jackpot') text(t('lamp_' + l.kind), l.x, l.y + l.r + 2.4, 2.4, on ? P.lit : P.text, 700);
    }
    // Rollover lanes: a lamp in each lane
    for (const r of T.rollovers) r.lanes.forEach((l, i) => disc(l.x, (l.y0 + l.y1) / 2, 2.2, g.lit[r.id][i] || lit(r.id + i, 0.3) ? P.lit : P.lamp));
    // Saucers: a hole
    for (const sc of T.saucers) {
      disc(sc.x, sc.y, E.SAUCER_R + 1.4, lit(sc.id, 0.4) ? P.lit : P.wall);
      disc(sc.x, sc.y, E.SAUCER_R + 0.4, P.cab);
    }
    // Kickbacks: the kicker plate in the outlane
    for (const k of T.kickbacks) capsule(k.x0 - 0.8, k.y0 + 1.2, k.x1 + 0.8, k.y1 + 1.2, 0.6, g.lamps.kickback || lit(k.id, 0.3) ? P.lit : P.lamp);
    // Walls on the playfield and slingshots
    for (const w of T.walls) {
      if ((w.y0 > H && w.y1 > H) || w.layer === 1) continue;
      const c = w.kind === 'sling' ? (lit(w.id) ? P.lit : P.sling) : P.wall;
      capsule(w.x0, w.y0, w.x1, w.y1, Math.max(w.r, 0.5), c);
    }
    // Spinners: a flat plate that turns (seen from above it gets thinner and wider)
    for (const sp of T.spinners) {
      const a = g.spin[sp.id].a, th = 0.4 + 1.6 * Math.abs(Math.cos(a));
      capsule(sp.x0, sp.y0, sp.x1, sp.y1, th / 2, Math.abs(g.spin[sp.id].w) > 2 ? P.lit : P.target);
    }
    // Drop targets (a dropped one leaves only a thin mark)
    for (const bank of T.banks) bank.targets.forEach((tg, i) => {
      if (g.down[bank.id][i]) capsule(tg.x0 + 1.2, tg.y0 + 1, tg.x1 + 1.2, tg.y1 - 1, 0.3, P.lamp);
      else capsule(tg.x0, tg.y0, tg.x1, tg.y1, 1, lit(bank.id + i) ? P.lit : P.target);
    });
    // Pop bumpers
    for (const b of T.bumpers) {
      const on = lit(b.id);
      disc(b.x, b.y, b.r + (on ? 0.8 : 0), on ? P.lit : P.bumper);
      disc(b.x, b.y, b.r * 0.55, P.field);
      disc(b.x, b.y, b.r * 0.3, on ? P.lit : P.bumper);
    }
    // Plunger
    const py = LANE_REST + BALL_R + 0.5 + (waiting() ? g.pull * 6 : 0);
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
    const inPlay = g.phase !== 'drain' && g.phase !== 'over';
    if (inPlay) for (const b of g.live) if (b.layer === 0) drawBall(b);
    // Ramps above the playfield: a translucent band with its rails, then the balls on it
    for (const r of T.ramps) {
      const [a, b] = r.rails;
      ctx.beginPath();
      a.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i].x, b[i].y);
      ctx.closePath();
      ctx.globalAlpha = 0.55; ctx.fillStyle = lit(r.id, 0.5) ? P.lit : P.ramp; ctx.fill(); ctx.globalAlpha = 1;
      for (const side of r.rails) for (let i = 0; i + 1 < side.length; i++) capsule(side[i].x, side[i].y, side[i + 1].x, side[i + 1].y, 0.5, P.wall);
    }
    if (inPlay) for (const b of g.live) if (b.layer === 1) drawBall(b);
    // Current mission above its lamps
    const mt = missionText();
    if (mt && phase !== 'idle') text(mt, CX, 101.5, 2.6, P.text, 700);
    // Messages on the table
    if (message && g.time < message.until && phase !== 'idle') text(message.text, CX, 92, 7, P.lit);
    if (phase === 'play' && waiting() && !g.pulling && g.time > 0.6) {
      ctx.globalAlpha = 0.85; text(t('launchHint'), CX, 128, 3.6, P.text, 700); ctx.globalAlpha = 1;
    }
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(table); else window.addEventListener('resize', resize);
  Tools.theme.onChange(() => { palette(); draw(); });
  Tools.onLang(() => { renderPanel(); renderHud(); draw(); });
  showTable(); renderSettings(); renderPanel(); renderHud(); resize();

  Tools.diag.info(() => ({ phase, table: game.table.id, game: game.phase, balls: game.balls, ball: game.ball, mult: game.mult, saved: game.saved,
    live: game.live.length, multiball: game.multiball, mission: game.mission.i + '/' + game.mission.n, fullscreen: settings.fullscreen, maxTouchPoints: navigator.maxTouchPoints || 0,
    held: ['L', 'R', 'P'].filter(c => held[c].size).join('') || '-', flippers: game.held.slice(),
    pull: Math.round(game.pull * 100) / 100, pos: game.live[0] ? [Math.round(game.live[0].x), Math.round(game.live[0].y)] : null }));

  /* ---------- WebMCP ---------- */
  const state = () => ({
    phase, table: phase === 'idle' ? settings.table : game.table.id, balls_per_game: phase === 'idle' ? settings.balls : game.balls,
    ball: phase === 'idle' ? null : Math.min(game.ball, game.balls),
    score: phase === 'idle' ? null : game.score, multiplier: game.mult, multiball: game.multiball,
    mission: game.table.missions && phase !== 'idle' ? { number: game.mission.i + 1, of: game.table.missions.length, kind: game.table.missions[game.mission.i].kind,
      progress: game.mission.n, needed: game.table.missions[game.mission.i].count, chains_done: game.mission.done } : null,
    next_game: { table: settings.table, balls_per_game: settings.balls },
    tables: TABLES.list.map(tb => ({ id: tb.id, name: tb.name.en, best_scores: Object.fromEntries(BALLS.map(n => [String(n), best(tb.id, n) || null])) })),
  });
  Tools.mcp.register({
    name: 'get_state', title: 'Read game state', readOnly: true,
    description: 'Reads the pinball game: phase (idle, play, paused, over), the table, balls per game, the current ball, score, bonus multiplier, whether a multiball is running, the current mission (only on tables with missions), the settings for the next game and, per table, the best score per number of balls.',
    execute: state
  });
  Tools.mcp.register({
    name: 'set_game', title: 'Set up the next game', label: 'mcp.set',
    description: 'Chooses the table and/or the number of balls per game for the next game, as on the start card and in the settings. A running game is not changed. Returns the game state.',
    inputSchema: { type: 'object', properties: {
      table: { type: 'string', enum: IDS, description: 'Table: komet (easy, bumpers and targets), tiefsee (medium, ramp, spinner, multiball) or uhrwerk (hard, two ramps, third flipper, mission chain).' },
      balls_per_game: { type: 'integer', enum: BALLS, description: 'Balls per game.' }
    }, additionalProperties: false },
    execute: ({ table: id, balls_per_game: n } = {}) => { if (id) setTable(id); if (n) setBalls(n); draw(); return state(); }
  });
  Tools.mcp.register({
    name: 'new_game', title: 'Start a new game', label: 'mcp.new',
    description: 'Starts a new game on the chosen table with the current settings, as if the user pressed Play. A running game is abandoned. The user then plays with the flippers; the agent cannot flip or launch. Returns the game state.',
    execute: () => { newGame(); return state(); }
  });
})();
