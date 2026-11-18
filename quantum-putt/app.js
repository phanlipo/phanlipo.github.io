/* Quantenputt – page script: game flow, aiming, drawing the wave, measuring, scores, settings, WebMCP.
   Physics and courses without DOM: engine.js (window.PuttEngine). See README.md. */
(function () {
  'use strict';
  Tools.i18n({
    de: {
      c_open: 'Freie Bahn', c_lens: 'Linse', c_ramp: 'Rampe', c_hill: 'Hügel', c_funnel: 'Trichter', c_slits: 'Doppelspalt',
      c_corner: 'Um die Ecke', c_crystal: 'Kristall', c_tunnel: 'Tunnel', c_zigzag: 'Zickzack',
      w_open: 'Wie weit läuft die Welle auseinander?', w_lens: 'Die Mulde bündelt die Welle.', w_ramp: 'Fest genug, sonst rollt sie zurück.',
      w_hill: 'Zu hoch für die Kugel – die Welle läuft herum.', w_funnel: 'Hinter der Öffnung fächert die Welle auf.',
      w_slits: 'Zwei Spalte, Streifen dahinter.', w_corner: 'Über die Bande ins Loch.', w_crystal: 'Pfosten im Gitter streuen die Welle.',
      w_tunnel: 'Klassisch unüberwindbar – die Welle tunnelt.', w_zigzag: 'Zwei Banden, drei Abschnitte.',
      courseName: 'Bahn {n}: {name}', strokesV: 'Schlag {n} · Par {par}', strokes0: 'Par {par}',
      best: 'Bestwert {n}', notPlayed: 'noch nicht gespielt', parV: 'Par {par}',
      total: 'Gespielt: {done} von {all} Bahnen · zusammen {strokes} Schläge (Par {par})', totalNone: 'Noch keine Bahn eingelocht.',
      aim: 'Richtung {a} · Stärke {s} %', aimHint: 'Auf die Bahn tippen oder ziehen zum Zielen.',
      left: '{n}° links', right: '{n}° rechts', straight: 'geradeaus',
      flying: 'Der Ball ist eine Welle – jetzt im richtigen Moment messen!',
      missed: 'Gemessen: daneben. Der nächste Schlag geht von hier.', holed: 'Eingelocht mit {n} {w}!',
      holedPar: 'Eingelocht mit {n} {w} – {d}!', stroke1: 'Schlag', strokeN: 'Schlägen',
      underPar: '{n} unter Par', overPar: '{n} über Par', atPar: 'genau Par', newBest: ' Neuer Bestwert.',
      shoot: 'Schlagen', measure: 'Messen', next: 'Nächste Bahn', toList: 'Alle Bahnen',
      restarted: 'Bahn neu begonnen', clearQ: 'Alle Bestwerte löschen?', cleared: 'Bestwerte gelöscht',
      cvLabel: 'Minigolf-Bahn mit Ball, Loch und Hindernissen. Tippen oder ziehen zum Zielen; Pfeiltasten drehen und ändern die Stärke, Eingabe schlägt bzw. misst.',
      'mcp.start': 'Bahn gestartet', 'mcp.shoot': 'Ball geschlagen', 'mcp.measure': 'Position gemessen'
    },
    en: {
      title: 'Quantum Putt', restart: 'Start course again', courses: 'Choose course', pickH: 'Choose course', gameL: 'Game',
      chanceL: 'In the hole', settingsH: 'Settings', sizeL: 'Width of the ball (wave)', small: 'Narrow', medium: 'Medium', large: 'Wide',
      speedL: 'Speed', slow: 'Slow', normal: 'Normal', fast: 'Fast', ghost: 'Show a classical ball for comparison',
      phase: 'Show the phase of the wave as colour', clearScores: 'Delete best results',
      c_open: 'Open green', c_lens: 'Lens', c_ramp: 'Ramp', c_hill: 'Hill', c_funnel: 'Funnel', c_slits: 'Double slit',
      c_corner: 'Round the corner', c_crystal: 'Crystal', c_tunnel: 'Tunnel', c_zigzag: 'Zigzag',
      w_open: 'How far does the wave spread?', w_lens: 'The hollow focuses the wave.', w_ramp: 'Hard enough, or it rolls back.',
      w_hill: 'Too high for the ball – the wave goes around.', w_funnel: 'Behind the opening the wave fans out.',
      w_slits: 'Two slits, stripes behind.', w_corner: 'Off the cushion into the hole.', w_crystal: 'Posts in a lattice scatter the wave.',
      w_tunnel: 'Impassable classically – the wave tunnels.', w_zigzag: 'Two cushions, three sections.',
      courseName: 'Course {n}: {name}', strokesV: 'Hit {n} · Par {par}', strokes0: 'Par {par}',
      best: 'Best {n}', notPlayed: 'not played yet', parV: 'Par {par}',
      total: 'Played: {done} of {all} courses · {strokes} hits in total (par {par})', totalNone: 'No course sunk yet.',
      aim: 'Direction {a} · strength {s} %', aimHint: 'Tap or drag on the course to aim.',
      left: '{n}° left', right: '{n}° right', straight: 'straight',
      flying: 'The ball is a wave – now measure at the right moment!',
      missed: 'Measured: missed. The next hit starts from here.', holed: 'Sunk with {n} {w}!',
      holedPar: 'Sunk with {n} {w} – {d}!', stroke1: 'hit', strokeN: 'hits',
      underPar: '{n} under par', overPar: '{n} over par', atPar: 'exactly par', newBest: ' New best.',
      shoot: 'Hit', measure: 'Measure', next: 'Next course', toList: 'All courses',
      restarted: 'Course started again', clearQ: 'Delete all best results?', cleared: 'Best results deleted',
      cvLabel: 'Minigolf course with ball, hole and obstacles. Tap or drag to aim; arrow keys turn and change the strength, Enter hits or measures.',
      'mcp.start': 'course started', 'mcp.shoot': 'ball hit', 'mcp.measure': 'position measured'
    }
  });
  const t = Tools.t, $ = Tools.$, E = window.PuttEngine;
  const { W, H, COURSES } = E;

  /* ---------- Stored state ---------- */
  const LS_SET = 'quantum-putt.settings.v1', LS_SCORES = 'quantum-putt.scores.v1', LS_GAME = 'quantum-putt.game.v1';
  const settings = Object.assign({ size: 'medium', speed: 'normal', ghost: true, phase: false }, Tools.load(LS_SET, {}));
  if (!E.SIGMAS[settings.size]) settings.size = 'medium';
  if (!['slow', 'normal', 'fast'].includes(settings.speed)) settings.speed = 'normal';
  const scores = Object.assign({}, Tools.load(LS_SCORES, {}));
  const saveSettings = () => Tools.save(LS_SET, settings);
  const saveScores = () => Tools.save(LS_SCORES, scores);
  const STEPS = { slow: 0.5, normal: 1, fast: 2 };   // time steps per frame (fewer if the device is slow)

  // Game: course index, strokes so far, ball position, phase 'aim' | 'fly' | 'holed', aim (angle in degrees, 0 = up)
  const game = { ci: 0, strokes: 0, ball: null, phase: 'aim', angle: 0, strength: 0.6, last: null, chance: 0 };
  let field = null, sim = null, ghost = null, view = 'game';
  const course = () => COURSES[game.ci];
  const saveGame = () => Tools.save(LS_GAME, { course: course().id, strokes: game.strokes, ball: [round1(game.ball.x), round1(game.ball.y)], holed: game.phase === 'holed' });
  const round1 = v => Math.round(v * 10) / 10;

  function aimAtHole() {
    const [hx, hy] = course().hole;
    game.angle = Math.round(Math.atan2(hx - game.ball.x, -(hy - game.ball.y)) * 180 / Math.PI);
    game.strength = 0.6;
  }
  function loadCourse(ci, restore) {
    game.ci = ci;
    field = E.buildField(course());
    sim = E.createSim(field);
    ghost = E.createBall(field);
    const [sx, sy] = course().start;
    game.ball = { x: sx, y: sy };
    game.strokes = 0; game.phase = 'aim'; game.last = null; game.chance = 0;
    if (restore) {
      game.strokes = Math.max(0, Math.min(999, Math.floor(restore.strokes) || 0));
      const [x, y] = Array.isArray(restore.ball) ? restore.ball.map(Number) : [];
      if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x < W && y < H && !field.wall[Math.floor(y) * W + Math.floor(x)]) game.ball = { x, y };
      if (restore.holed) game.phase = 'holed';
    }
    aimAtHole();
    baseImg = null;
    Tools.diag.log('course', { id: course().id, restored: !!restore });
  }

  /* ---------- Playing ---------- */
  function shoot(angle = game.angle, strength = game.strength) {
    if (game.phase !== 'aim') return false;
    game.angle = angle; game.strength = strength;
    game.strokes++; game.phase = 'fly'; game.last = null;
    sim.launch(game.ball.x, game.ball.y, angle, strength, E.SIGMAS[settings.size]);
    ghost.launch(game.ball.x, game.ball.y, angle, strength);
    game.chance = sim.probIn(...course().hole);
    saveGame();
    Tools.diag.log('shoot', { angle: Math.round(angle), strength: round1(strength), sigma: settings.size });
    render(); startLoop();
    return true;
  }
  function measure() {
    if (game.phase !== 'fly') return null;
    const before = sim.probIn(...course().hole);
    const p = sim.sample(Math.random(), Math.random(), Math.random());
    const [hx, hy, hr] = course().hole;
    const inHole = Math.hypot(p.x - hx, p.y - hy) <= hr;
    sim.clear(); ghost.active = false;
    game.last = { x: p.x, y: p.y, at: performance.now() };
    game.chance = 0;
    let newBest = false;
    if (inHole) {
      game.phase = 'holed'; game.ball = { x: hx, y: hy };
      const id = course().id;
      if (!scores[id] || game.strokes < scores[id]) { scores[id] = game.strokes; saveScores(); newBest = true; }
      if ('vibrate' in navigator) try { navigator.vibrate([40, 60, 40]); } catch (_) {}
    } else {
      game.phase = 'aim'; game.ball = { x: p.x, y: p.y }; aimAtHole();
    }
    game.newBest = newBest;
    saveGame();
    Tools.diag.log('measure', { inHole, chance: Math.round(before * 100), strokes: game.strokes });
    render(); startLoop();
    return { x: round1(p.x), y: round1(p.y), inHole, chance: before };
  }
  function mainAction() {
    if (game.phase === 'aim') shoot();
    else if (game.phase === 'fly') measure();
    else if (game.ci < COURSES.length - 1) { loadCourse(game.ci + 1); saveGame(); render(); }
    else showPick(true);
  }
  function restart() {
    const prev = { ci: game.ci, strokes: game.strokes, ball: { ...game.ball }, phase: game.phase === 'fly' ? 'aim' : game.phase };
    loadCourse(game.ci); saveGame(); render();
    if (prev.strokes) Tools.undo(t('restarted'), () => {
      loadCourse(prev.ci, { strokes: prev.strokes, ball: [prev.ball.x, prev.ball.y], holed: prev.phase === 'holed' });
      saveGame(); render();
    });
  }

  /* ---------- Course choice ---------- */
  function renderPick() {
    const list = $('courseList');
    list.textContent = '';
    COURSES.forEach((c, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'course' + (scores[c.id] ? ' done' : '');
      b.dataset.course = c.id;
      const best = scores[c.id];
      b.innerHTML = `<span class="no"></span><span><span class="name"></span><span class="what"></span></span><span class="score">${best ? Tools.icon('check') : ''}<span></span></span>`;
      b.querySelector('.no').textContent = Tools.fmt(i + 1, 0);
      b.querySelector('.name').textContent = t('c_' + c.id);
      b.querySelector('.what').textContent = t('w_' + c.id);
      b.querySelector('.score>span').textContent = t('parV', { par: Tools.fmt(c.par, 0) }) + ' · ' + (best ? t('best', { n: Tools.fmt(best, 0) }) : t('notPlayed'));
      b.addEventListener('click', () => pickCourse(i));
      li.append(b); list.append(li);
    });
    const done = COURSES.filter(c => scores[c.id]);
    $('total').textContent = done.length ? t('total', {
      done: Tools.fmt(done.length, 0), all: Tools.fmt(COURSES.length, 0),
      strokes: Tools.fmt(done.reduce((s, c) => s + scores[c.id], 0), 0), par: Tools.fmt(done.reduce((s, c) => s + c.par, 0), 0)
    }) : t('totalNone');
  }
  function showPick(on) {
    view = on ? 'pick' : 'game';
    $('pick').hidden = !on; $('game').hidden = on;
    $('btnCourses').setAttribute('aria-pressed', String(on));
    $('btnRestart').hidden = on;
    if (on) { renderPick(); stopLoop(); } else { resize(); render(); }
  }
  function pickCourse(i) {
    if (i !== game.ci || game.phase === 'holed') { loadCourse(i); saveGame(); }
    else if (game.phase === 'fly') { sim.clear(); ghost.active = false; game.phase = 'aim'; saveGame(); }
    showPick(false);
    $('cv').focus({ preventScroll: true });
  }

  /* ---------- Texts ---------- */
  function dirText(a) {
    const n = Math.round(((a + 540) % 360) - 180);
    return n === 0 ? t('straight') : n < 0 ? t('left', { n: Tools.fmt(-n, 0) }) : t('right', { n: Tools.fmt(n, 0) });
  }
  function render() {
    const c = course();
    $('courseName').textContent = t('courseName', { n: Tools.fmt(game.ci + 1, 0), name: t('c_' + c.id) });
    $('strokes').textContent = game.strokes ? t('strokesV', { n: Tools.fmt(game.strokes, 0), par: Tools.fmt(c.par, 0) }) : t('strokes0', { par: Tools.fmt(c.par, 0) });
    const st = $('status');
    st.classList.toggle('ok', game.phase === 'holed');
    if (game.phase === 'holed') {
      const d = game.strokes - c.par, w = t(game.strokes === 1 ? 'stroke1' : 'strokeN');
      const dTxt = d < 0 ? t('underPar', { n: Tools.fmt(-d, 0) }) : d > 0 ? t('overPar', { n: Tools.fmt(d, 0) }) : t('atPar');
      st.textContent = t('holedPar', { n: Tools.fmt(game.strokes, 0), w, d: dTxt }) + (game.newBest ? t('newBest') : '');
    } else if (game.phase === 'fly') st.textContent = t('flying');
    else if (game.last) st.textContent = t('missed') + ' ' + aimText();
    else st.textContent = (game.strokes ? '' : t('w_' + c.id) + ' ') + aimText();
    $('chance').hidden = game.phase !== 'fly';
    renderChance();
    const btn = $('btnMain');
    const [icon, label] = game.phase === 'aim' ? [Tools.icon('golf'), 'shoot'] : game.phase === 'fly' ? [Tools.icon('focus-2'), 'measure']
      : game.ci < COURSES.length - 1 ? [Tools.icon('chevron-right'), 'next'] : [Tools.icon('layout-grid'), 'toList'];
    btn.innerHTML = icon + '<span></span>';
    btn.querySelector('span').textContent = t(label);
    draw();
  }
  const aimText = () => t('aim', { a: dirText(game.angle), s: Tools.fmt(Math.round(game.strength * 100), 0) });
  function renderChance() {
    const pct = Math.round(game.chance * 100);
    $('chanceBar').style.width = Math.min(100, game.chance * 100) + '%';
    $('chanceVal').textContent = Tools.fmt(pct, 0) + ' %';
  }

  /* ---------- Drawing ---------- */
  const cv = $('cv'), ctx = cv.getContext('2d');
  const off = document.createElement('canvas'); off.width = W; off.height = H;
  const octx = off.getContext('2d');
  const img = octx.createImageData(W, H);
  let baseImg = null, geo = { s: 1, ox: 0, oy: 0, dpr: 1 };
  const dark = () => { try { return matchMedia('(prefers-color-scheme: dark)').matches; } catch (_) { return false; } };
  const PAL = {
    light: { grass: [47, 125, 74], grass2: [43, 116, 68], wall: [120, 92, 64], sand: [222, 190, 110], water: [40, 110, 170], wave: [255, 251, 214], bg: [233, 239, 235] },
    dark: { grass: [24, 72, 44], grass2: [21, 65, 40], wall: [92, 72, 52], sand: [168, 140, 76], water: [30, 84, 140], wave: [255, 247, 190], bg: [16, 22, 18] },
  };
  const pal = () => PAL[dark() ? 'dark' : 'light'];
  function buildBase() {
    const P = pal(), d = new Uint8ClampedArray(W * H * 4);
    const vtop = Math.max(2.4, field.vmax), vlow = Math.min(-0.9, field.vmin);
    for (let i = 0; i < W * H; i++) {
      const y = Math.floor(i / W);
      let c;
      if (field.wall[i]) c = P.wall;
      else {
        const g = (y >> 4) & 1 ? P.grass2 : P.grass, v = field.V[i];
        const [tc, f] = v > 0 ? [P.sand, Math.min(1, 0.25 + 0.75 * v / vtop)] : v < 0 ? [P.water, Math.min(1, 0.2 + 0.6 * v / vlow)] : [g, 0];
        const ff = Math.abs(v) < 0.02 ? 0 : f;
        c = [g[0] + (tc[0] - g[0]) * ff, g[1] + (tc[1] - g[1]) * ff, g[2] + (tc[2] - g[2]) * ff];
      }
      d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
    }
    baseImg = d;
  }
  function hsv(h, s, v) {
    const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function paintField() {
    if (!baseImg) buildBase();
    const d = img.data;
    d.set(baseImg);
    if (sim.active) {
      const dens = sim.density(), P = pal();
      let max = 0;
      for (let i = 0; i < dens.length; i++) if (!field.wall[i] && dens[i] > max) max = dens[i];
      const inv = max > 0 ? 1 / max : 0;
      for (let i = 0; i < dens.length; i++) {
        if (field.wall[i]) continue;
        const a = Math.min(1, Math.sqrt(dens[i] * inv) * 1.15);
        if (a < 0.01) continue;
        const c = settings.phase ? hsv((Math.atan2(sim.im[i], sim.re[i]) / (2 * Math.PI) + 1) % 1, 0.75, 1) : P.wave;
        const o = i * 4;
        d[o] += (c[0] - d[o]) * a; d[o + 1] += (c[1] - d[o + 1]) * a; d[o + 2] += (c[2] - d[o + 2]) * a;
      }
    }
    octx.putImageData(img, 0, 0);
  }
  function resize() {
    const r = $('view').getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr));
    const pad = 6, s = Math.max(0.1, Math.min((r.width - 2 * pad) / W, (r.height - 2 * pad) / H));
    geo = { s, ox: (r.width - W * s) / 2, oy: (r.height - H * s) / 2, dpr };
    draw();
  }
  function draw() {
    if (!field || view !== 'game') return;
    const { s, ox, oy, dpr } = geo, P = pal(), now = performance.now();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgb(${P.bg})`; ctx.fillRect(0, 0, cv.width, cv.height);
    paintField();
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(off, 0, 0, W, H);
    const lw = 1 / s;   // one CSS pixel in course units
    // Hole with flag
    const [hx, hy, hr] = course().hole;
    ctx.beginPath(); ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    ctx.lineWidth = 2 * lw; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.setLineDash([4 * lw, 3 * lw]); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(hx, hy, 3, 0, 2 * Math.PI); ctx.fillStyle = '#0b1410'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx, hy - 16); ctx.lineWidth = 1.5 * lw; ctx.strokeStyle = '#f5f5f4'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx, hy - 16); ctx.lineTo(hx + 9, hy - 13); ctx.lineTo(hx, hy - 10); ctx.closePath(); ctx.fillStyle = '#e11d48'; ctx.fill();
    // Classical ball for comparison
    if (game.phase === 'fly' && settings.ghost && ghost.active) {
      ctx.beginPath(); ctx.arc(ghost.x, ghost.y, 3.2, 0, 2 * Math.PI);
      ctx.lineWidth = 2 * lw; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
    }
    // Measurement: flash and ring where the ball was found
    if (game.last) {
      const age = (now - game.last.at) / 600;
      if (age < 1) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - age)})`; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
      }
      ctx.beginPath(); ctx.arc(game.last.x, game.last.y, 7 + 10 * Math.max(0, 1 - age), 0, 2 * Math.PI);
      ctx.lineWidth = 2 * lw; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
    }
    // Ball and aim
    if (game.phase !== 'fly') {
      const { x, y } = game.ball;
      if (game.phase === 'aim') {
        const [dx, dy] = E.dirOf(game.angle), len = 18 + game.strength * 80;
        const ex = x + dx * len, ey = y + dy * len;
        ctx.beginPath(); ctx.moveTo(x + dx * 5, y + dy * 5); ctx.lineTo(ex, ey);
        ctx.lineWidth = 3 * lw; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineCap = 'round'; ctx.stroke();
        const a = Math.atan2(dy, dx), hl = 7;
        ctx.beginPath(); ctx.moveTo(ex, ey);
        ctx.lineTo(ex - hl * Math.cos(a - 0.45), ey - hl * Math.sin(a - 0.45));
        ctx.lineTo(ex - hl * Math.cos(a + 0.45), ey - hl * Math.sin(a + 0.45)); ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(x, y, 3.2, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.2 * lw; ctx.strokeStyle = '#1c1917'; ctx.stroke();
    }
  }

  /* ---------- Animation ---------- */
  let raf = 0, stepDebt = 0;
  function frame() {
    raf = 0;
    if (view !== 'game') return;
    if (game.phase === 'fly') {
      stepDebt += STEPS[settings.speed];
      const want = Math.floor(stepDebt), t0 = performance.now();
      stepDebt -= want;
      for (let k = 0; k < want; k++) {
        sim.step(1); ghost.step(1);
        if (performance.now() - t0 > 28) break;   // slow device: slow motion rather than stutter
      }
      game.chance = sim.probIn(...course().hole);
      renderChance();
    }
    draw();
    if (game.phase === 'fly' || (game.last && performance.now() - game.last.at < 650)) raf = requestAnimationFrame(frame);
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(frame); }
  function stopLoop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  /* ---------- Input ---------- */
  function toCourse(e) {
    const r = cv.getBoundingClientRect();
    return [(e.clientX - r.left - geo.ox) / geo.s, (e.clientY - r.top - geo.oy) / geo.s];
  }
  function aimAt(e) {
    const [px, py] = toCourse(e), dx = px - game.ball.x, dy = py - game.ball.y;
    if (Math.hypot(dx, dy) < 2) return;
    game.angle = Math.round(Math.atan2(dx, -dy) * 180 / Math.PI);
    game.strength = Math.round(Math.max(0.05, Math.min(1, Math.hypot(dx, dy) / 100)) * 100) / 100;
    render();
  }
  let dragging = false;
  cv.addEventListener('pointerdown', e => {
    if (game.phase === 'fly') { e.preventDefault(); measure(); return; }
    if (game.phase !== 'aim') return;
    dragging = true;
    try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    aimAt(e);
  });
  cv.addEventListener('pointermove', e => { if (dragging && game.phase === 'aim') aimAt(e); });
  const endDrag = () => { dragging = false; };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); mainAction(); return; }
    if (game.phase !== 'aim') return;
    const step = e.shiftKey ? 10 : 2;
    if (e.key === 'ArrowLeft') game.angle = ((game.angle - step + 540) % 360) - 180;
    else if (e.key === 'ArrowRight') game.angle = ((game.angle + step + 540) % 360) - 180;
    else if (e.key === 'ArrowUp') game.strength = Math.min(1, Math.round((game.strength + 0.05) * 100) / 100);
    else if (e.key === 'ArrowDown') game.strength = Math.max(0.05, Math.round((game.strength - 0.05) * 100) / 100);
    else return;
    e.preventDefault(); render();
  });
  $('btnMain').addEventListener('click', mainAction);
  $('btnRestart').addEventListener('click', restart);
  $('btnCourses').addEventListener('click', () => showPick(view !== 'pick'));
  $('btnClearScores').addEventListener('click', async () => {
    if (!Object.keys(scores).length) { Tools.menu.close(); return; }
    if (!await Tools.confirm(t('clearQ'), { action: 'delete' })) return;
    for (const k of Object.keys(scores)) delete scores[k];
    saveScores(); Tools.toast(t('cleared')); Tools.menu.close();
    if (view === 'pick') renderPick();
  });

  /* ---------- Settings ---------- */
  function renderSettings() {
    for (const b of document.querySelectorAll('#optSize button')) b.setAttribute('aria-pressed', String(b.dataset.v === settings.size));
    for (const b of document.querySelectorAll('#optSpeed button')) b.setAttribute('aria-pressed', String(b.dataset.v === settings.speed));
    $('optGhost').checked = settings.ghost;
    $('optPhase').checked = settings.phase;
  }
  for (const b of document.querySelectorAll('#optSize button')) b.addEventListener('click', () => { settings.size = b.dataset.v; saveSettings(); renderSettings(); });
  for (const b of document.querySelectorAll('#optSpeed button')) b.addEventListener('click', () => { settings.speed = b.dataset.v; saveSettings(); renderSettings(); });
  $('optGhost').addEventListener('change', e => { settings.ghost = e.target.checked; saveSettings(); draw(); });
  $('optPhase').addEventListener('change', e => { settings.phase = e.target.checked; saveSettings(); draw(); });

  /* ---------- Start ---------- */
  const saved = Tools.load(LS_GAME, null);
  const savedIdx = saved ? COURSES.findIndex(c => c.id === saved.course) : -1;
  loadCourse(savedIdx >= 0 ? savedIdx : 0, savedIdx >= 0 ? saved : null);
  renderSettings();
  try { new ResizeObserver(() => resize()).observe($('view')); } catch (_) { window.addEventListener('resize', resize); }
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { baseImg = null; draw(); }); } catch (_) {}
  resize(); render();
  Tools.onLang(() => { render(); if (view === 'pick') renderPick(); });
  Tools.diag.info(() => ({ course: course().id, phase: game.phase, strokes: game.strokes, size: settings.size, speed: settings.speed,
    ghost: settings.ghost, phase_colour: settings.phase, solved: Object.keys(scores).length, time: sim ? sim.t : 0 }));

  /* ---------- WebMCP ---------- */
  const courseInfo = (c, i) => ({ id: c.id, number: i + 1, name: t('c_' + c.id), par: c.par, best: scores[c.id] || null });
  const state = () => {
    const c = course();
    return {
      course: courseInfo(c, game.ci), phase: game.phase, strokes: game.strokes,
      ball: game.phase === 'fly' ? null : { x: round1(game.ball.x), y: round1(game.ball.y) },
      hole: { x: c.hole[0], y: c.hole[1], radius: c.hole[2] },
      aim: { angle: game.angle, strength: game.strength },
      chance_in_hole: game.phase === 'fly' ? Math.round(sim.probIn(...c.hole) * 1000) / 1000 : null,
      wave_time: game.phase === 'fly' ? sim.t : null,
      field: { width: W, height: H },
    };
  };
  Tools.mcp.register({
    name: 'list_courses', title: 'List courses', readOnly: true,
    description: 'Lists the ten courses of the game in order with id, number, name, par (target number of hits) and the best result so far (null if not sunk yet).',
    execute: () => ({ courses: COURSES.map(courseInfo) })
  });
  Tools.mcp.register({
    name: 'start_course', title: 'Start a course', label: 'mcp.start',
    description: 'Starts a course from the beginning (hit counter 0, ball on the tee) and shows it. Returns the game state like get_state.',
    inputSchema: { type: 'object', properties: {
      course: { type: 'string', enum: COURSES.map(c => c.id), description: 'Course id from list_courses.' }
    }, required: ['course'], additionalProperties: false },
    execute: ({ course: id }) => {
      loadCourse(COURSES.findIndex(c => c.id === id)); saveGame();
      if (view !== 'game') showPick(false); else render();
      return state();
    }
  });
  Tools.mcp.register({
    name: 'shoot', title: 'Hit the ball', label: 'mcp.shoot',
    description: 'Hits the ball from where it lies; it then runs as a quantum wave packet until measure is called. The course is 128 × 256 cells, x to the right, y downwards, the hole is near the top. Only possible while aiming (not while the wave runs or after the ball is sunk). Returns the game state.',
    inputSchema: { type: 'object', properties: {
      angle: { type: 'number', minimum: -180, maximum: 180, description: 'Direction in degrees: 0 = straight up the course (towards smaller y), 90 = right, -90 = left.' },
      strength: { type: 'number', minimum: 0.05, maximum: 1, description: 'Strength of the hit, 0.05–1 (sets the momentum of the wave).' }
    }, required: ['angle', 'strength'], additionalProperties: false },
    execute: ({ angle, strength }) => {
      if (view !== 'game') showPick(false);
      if (game.phase === 'fly') throw new Error('The ball is already running as a wave – call measure first.');
      if (game.phase === 'holed') throw new Error('The ball is already sunk – start the next course with start_course.');
      shoot(Math.round(angle * 10) / 10, Math.round(strength * 100) / 100);
      return state();
    }
  });
  Tools.mcp.register({
    name: 'measure', title: 'Measure the ball position', label: 'mcp.measure',
    description: 'Measures where the ball is while it runs as a wave: a position is picked at random with the probability of the wave there. Optionally lets the wave run a number of time steps first (each step is 0.5 time units; the ball covers about 2 × strength-dependent wave number cells per time unit). Returns where it was found, whether it is in the hole, the probability it had to be in the hole, and the game state.',
    inputSchema: { type: 'object', properties: {
      steps: { type: 'integer', minimum: 0, maximum: 1000, description: 'Time steps to let the wave run before measuring. Default 0 (measure now).' }
    }, additionalProperties: false },
    execute: ({ steps = 0 }) => {
      if (game.phase !== 'fly') throw new Error('Nothing to measure – hit the ball with shoot first.');
      if (steps) { sim.step(steps); ghost.step(steps); }
      const r = measure();
      return { found: { x: r.x, y: r.y }, in_hole: r.inHole, chance_in_hole: Math.round(r.chance * 1000) / 1000, state: state() };
    }
  });
  Tools.mcp.register({
    name: 'get_state', title: 'Read the game state', readOnly: true,
    description: 'Reads the game: current course, phase (aim, fly = the wave runs, holed = sunk), hits so far, ball and hole position in cells (x right, y down, course 128 × 256), the current aim and, while the wave runs, the probability that a measurement finds the ball in the hole.',
    execute: () => state()
  });
})();
