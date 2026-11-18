/* Quantenmagnetismus – page script: settings, animation loop, drawing, charts, WebMCP.
   Physics without DOM: lattice.js (window.IsingLattice), chain.js (window.QuantumChain). See README.md. */
(function () {
  'use strict';
  Tools.i18n({
    de: {
      cvLabel: 'Spins auf dem Gitter: rot nach oben, blau nach unten. Tippen oder Ziehen dreht Spins um.',
      pause: 'Pause', start: 'Start', speedV: '{n} Durchl./Bild', sweep: 'Durchlauf {n}',
      badgeC: 'T = {T} · h = {h}', badgeScan: 'Scan {i}/{n} · T = {T}', badgeQ: 'N = {N} · Γ = {g} · h = {h}',
      lgM: 'Magnetisierung m', lgMs: 'Untergitter-Ordnung', lgE: 'Energie je Bindung', lgOrder: 'Ordnung |m|', lgOrderS: 'Ordnung (Untergitter)',
      lgC: 'Wärmekapazität C (skaliert)', lgChi: 'Suszeptibilität χ (skaliert)', lgOnsager: 'exakt (Onsager)', lgTc: 'kritische Temperatur',
      lgLoop: 'm gegen h', axSweeps: 'Durchläufe', axT: 'Temperatur T', axH: 'Feld h', axG: 'Querfeld Γ', axR: 'Abstand r',
      lgLevel: '{n}. angeregter Zustand', lgSx: '⟨σˣ⟩ quer', lgZZ: 'Ordnung |⟨σᶻ₀σᶻ⟩| (halber Ring)', lgS: 'Verschränkung (bit)',
      lgCorr: 'Korrelation ⟨σᶻ₀σᶻᵣ⟩', lgGc: 'Übergang Γ = |J|', computing: 'rechnet … {p} %',
      emptyLoop: 'Mit dem Knopf neben dem Magnetfeld schwingt das Feld hin und her – hier erscheint dann die Hystereseschleife.',
      emptyScan: 'Der Temperatur-Scan (unten in der Leiste) kühlt das Gitter langsam ab und misst bei jeder Temperatur.',
      scanDone: 'Temperatur-Scan fertig', scanStopped: 'Scan abgebrochen',
      factTc: 'Exakt bekannt: Phasenübergang bei T_c = {tc} |J|. Darunter ordnen sich die Spins ({order}).',
      orderF: 'alle gleich', orderAF: 'Schachbrett',
      factFrust: 'Frustriert: In jedem Dreieck bleibt mindestens eine Bindung unzufrieden (⅓ aller Bindungen). Keine Ordnung bis T = 0, Restentropie {s} k_B je Spin.',
      factPlateau: ' Im Feld 0 < h < 6 |J| stellt sich ein Plateau bei m = ⅓ ein: zwei Spins hoch, einer runter je Dreieck.',
      factKagomeField: ' Im Feld 0 < h < 4 |J| sinkt die Restentropie, die Magnetisierung bleibt bei ⅓.',
      factField: ' (Mit Feld h ≠ 0 gibt es keinen scharfen Übergang mehr.)',
      factE0: ' Grundzustand: E = {e} je Spin.',
      qFactF: 'Quanten-Phasenübergang bei Γ = |J|: darunter geordnet (fast doppelt entarteter „Katzen“-Grundzustand), darüber zeigen die Spins zur Seite.',
      qFactAFe: 'Antiferro mit gerader Anzahl: wie Ferro, nur abwechselnd ↑↓↑↓ geordnet. Übergang bei Γ = |J|.',
      qFactAFo: 'Antiferro mit ungerader Anzahl ist frustriert: Eine Bindung bleibt unzufrieden, und dafür gibt es N gleich gute Stellen.',
      qFactExact: ' Probe mit der exakten Lösung (freie Fermionen): E₀/N = {e}.',
      cvLabelQ: 'Ring aus Quanten-Spins: Die Pfeile zeigen die mittlere Richtung jedes Spins, kurze Pfeile bedeuten Verschränkung.',
      'mcp.set': 'Gitter eingestellt', 'mcp.run': 'Monte-Carlo gerechnet', 'mcp.q': 'Quanten-Kette eingestellt',
      ex_domains: 'Ferro: Domänen wachsen', ex_critical: 'Ferro am kritischen Punkt', ex_neel: 'Antiferro: Schachbrett',
      ex_tri: 'Frustriertes Dreiecksgitter', ex_plateau: 'Dreieck im Feld: ⅓-Plateau', ex_kagome: 'Kagome-Antiferro',
      ex_hyst: 'Hystereseschleife', ex_cat: 'Quanten: Katzenzustand', ex_qcp: 'Quanten: kritischer Punkt', ex_odd: 'Quanten: ungerader Antiferro-Ring'
    },
    en: {
      title: 'Quantum Magnetism', sub: 'Ising model on lattices and as a quantum chain',
      cvLabel: 'Spins on the lattice: red up, blue down. Tap or drag to flip spins.',
      run: 'Start', hot: 'Random', cold: 'Ordered', scan: 'T scan', frust: 'Frustration',
      modeL: 'Model', modeC: 'Lattice (classical)', modeQ: 'Quantum chain', classicH: 'Ising model on the lattice', quantumH: 'Quantum Ising chain in a transverse field',
      sM: 'Magnetisation', sMs: 'Sublattice order', sE: 'Energy per spin', sF: 'frustrated bonds',
      chartL: 'Chart', chTime: 'History', chLoop: 'Hysteresis', chScan: 'Temperature scan',
      latticeL: 'Lattice', square: 'Square', triangular: 'Triangle', kagome: 'Kagome',
      couplingL: 'Interaction', ferro: 'Ferro (J > 0)', antiferro: 'Antiferro (J < 0)',
      tempL: 'Temperature T', fieldL: 'Magnetic field h', osc: 'Swing the field back and forth',
      sizeL: 'Size', small: 'Small', medium: 'Medium', large: 'Large', speedL: 'Speed',
      examplesL: 'Load an example', examples: 'Choose an example …',
      qE: 'Energy per spin', qGap: 'Energy gap', qX: '⟨σˣ⟩ transverse', qS: 'Entanglement (bit)',
      chSpec: 'Spectrum', chOrder: 'Order & entanglement', chCorr: 'Correlations',
      nL: 'Number of spins N', gammaL: 'Transverse field Γ', sweepG: 'Sweep the transverse field', qFieldL: 'Longitudinal field h',
      configsH: 'Most likely spin configurations',
      pause: 'Pause', start: 'Start', speedV: '{n} sweeps/frame', sweep: 'Sweep {n}',
      badgeC: 'T = {T} · h = {h}', badgeScan: 'Scan {i}/{n} · T = {T}', badgeQ: 'N = {N} · Γ = {g} · h = {h}',
      lgM: 'Magnetisation m', lgMs: 'Sublattice order', lgE: 'Energy per bond', lgOrder: 'Order |m|', lgOrderS: 'Order (sublattice)',
      lgC: 'Heat capacity C (scaled)', lgChi: 'Susceptibility χ (scaled)', lgOnsager: 'exact (Onsager)', lgTc: 'critical temperature',
      lgLoop: 'm against h', axSweeps: 'Sweeps', axT: 'Temperature T', axH: 'Field h', axG: 'Transverse field Γ', axR: 'Distance r',
      lgLevel: 'excited state {n}', lgSx: '⟨σˣ⟩ transverse', lgZZ: 'Order |⟨σᶻ₀σᶻ⟩| (half ring)', lgS: 'Entanglement (bit)',
      lgCorr: 'Correlation ⟨σᶻ₀σᶻᵣ⟩', lgGc: 'transition Γ = |J|', computing: 'computing … {p} %',
      emptyLoop: 'The button next to the magnetic field swings the field back and forth – the hysteresis loop then appears here.',
      emptyScan: 'The temperature scan (in the bar below) slowly cools the lattice and measures at every temperature.',
      scanDone: 'Temperature scan finished', scanStopped: 'Scan stopped',
      factTc: 'Known exactly: phase transition at T_c = {tc} |J|. Below it the spins order ({order}).',
      orderF: 'all alike', orderAF: 'chessboard',
      factFrust: 'Frustrated: in every triangle at least one bond stays unhappy (⅓ of all bonds). No order down to T = 0, residual entropy {s} k_B per spin.',
      factPlateau: ' In a field 0 < h < 6 |J| a plateau at m = ⅓ forms: two spins up, one down per triangle.',
      factKagomeField: ' In a field 0 < h < 4 |J| the residual entropy drops, the magnetisation stays at ⅓.',
      factField: ' (With a field h ≠ 0 there is no sharp transition any more.)',
      factE0: ' Ground state: E = {e} per spin.',
      qFactF: 'Quantum phase transition at Γ = |J|: below it ordered (an almost doubly degenerate “cat” ground state), above it the spins point sideways.',
      qFactAFe: 'Antiferro with an even number: like ferro, just ordered alternately ↑↓↑↓. Transition at Γ = |J|.',
      qFactAFo: 'Antiferro with an odd number is frustrated: one bond stays unhappy, and there are N equally good places for it.',
      qFactExact: ' Check against the exact solution (free fermions): E₀/N = {e}.',
      cvLabelQ: 'Ring of quantum spins: the arrows show the average direction of each spin, short arrows mean entanglement.',
      'mcp.set': 'lattice set', 'mcp.run': 'Monte Carlo run', 'mcp.q': 'quantum chain set',
      ex_domains: 'Ferro: domains grow', ex_critical: 'Ferro at the critical point', ex_neel: 'Antiferro: chessboard',
      ex_tri: 'Frustrated triangular lattice', ex_plateau: 'Triangle in a field: ⅓ plateau', ex_kagome: 'Kagome antiferro',
      ex_hyst: 'Hysteresis loop', ex_cat: 'Quantum: cat state', ex_qcp: 'Quantum: critical point', ex_odd: 'Quantum: odd antiferro ring'
    }
  });
  const t = Tools.t, $ = Tools.$, fmt = Tools.fmt;
  const IL = window.IsingLattice, QC = window.QuantumChain;

  /* ---------- Settings ---------- */
  const LS = 'quantum-magnetism.settings.v1';
  const LATTICES = ['square', 'triangular', 'kagome'];
  const SIZES = { square: [12, 24, 48], triangular: [12, 24, 48], kagome: [6, 12, 24] };
  const SPEEDS = [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10];
  const TMAX = { square: 4, triangular: 6, kagome: 4 };
  const OSC_PERIOD = 160;  // sweeps per period of the swinging field
  const clamp = (v, a, b, d) => Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d;
  const DEF = { mode: 'classic', lattice: 'square', J: 1, T: 1.5, h: 0, size: 1, speed: 5, frust: false, chart: 'time',
    q: { N: 8, J: 1, gamma: 0.5, h: 0, chart: 'spectrum' } };
  const saved = Tools.load(LS, {}) || {};
  const S = {
    mode: saved.mode === 'quantum' ? 'quantum' : 'classic',
    lattice: LATTICES.includes(saved.lattice) ? saved.lattice : DEF.lattice,
    J: saved.J === -1 ? -1 : 1,
    T: clamp(saved.T, 0.05, 6, DEF.T),
    h: clamp(saved.h, -6, 6, DEF.h),
    size: [0, 1, 2].includes(saved.size) ? saved.size : DEF.size,
    speed: Number.isInteger(saved.speed) ? clamp(saved.speed, 0, SPEEDS.length - 1, DEF.speed) : DEF.speed,
    frust: saved.frust === true,
    chart: ['time', 'loop', 'scan'].includes(saved.chart) ? saved.chart : DEF.chart,
    q: {
      N: Number.isInteger(saved.q && saved.q.N) ? clamp(saved.q.N, 3, 10, 8) : DEF.q.N,
      J: saved.q && saved.q.J === -1 ? -1 : 1,
      gamma: clamp(saved.q && saved.q.gamma, 0, 3, DEF.q.gamma),
      h: clamp(saved.q && saved.q.h, -2, 2, DEF.q.h),
      chart: ['spectrum', 'order', 'corr'].includes(saved.q && saved.q.chart) ? saved.q.chart : DEF.q.chart
    }
  };
  const save = () => Tools.save(LS, S);

  /* ---------- Colours from the CSS tokens (light/dark) ---------- */
  let C = {};
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ['up', 'down', 'arrow', 'frust', 'bond', 'c1', 'c2', 'c3', 'c4', 'c5', 'grid', 'axis', 'muted', 'text', 'border', 'surface-2', 'accent'])
      C[k] = cs.getPropertyValue('--' + k).trim() || '#888';
  };
  readColors();
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); }); } catch (_) { /* old browsers */ }

  /* ---------- Classical simulation state ---------- */
  let lat, sim;
  let running = false, flipDebt = 0, sweeps = 0;
  let series = [];        // { t, m, ms, e } per sweep (last 400)
  let loopPts = [];       // { h, m } while the field swings
  const osc = { on: false, phase: 0, amp: 2 };
  let scan = null;        // running temperature scan
  let scanResults = null; // { lattice, J, h, pts: [{ T, m, ms, e, c, chi }] }
  let last = null;        // last measurement

  function rebuild(start) {
    lat = IL.build(S.lattice, SIZES[S.lattice][S.size]);
    sim = IL.createSim(lat);
    sim.set({ J: S.J, h: S.h, T: S.T });
    if (start === 'ordered') sim.order(S.J < 0 ? 'neel' : 'up'); else sim.randomize();
    series = []; loopPts = []; sweeps = 0; flipDebt = 0;
    last = sim.measure();
    Tools.diag.log('lattice', { type: S.lattice, L: lat.L, sites: lat.n });
  }
  function measure() {
    last = sim.measure();
    series.push({ t: sweeps, m: last.m, ms: Math.abs(last.ms), e: last.e / (lat.z / 2) });
    if (series.length > 400) series.shift();
    if (osc.on) { loopPts.push({ h: sim.h, m: last.m }); if (loopPts.length > OSC_PERIOD * 3) loopPts.shift(); }
  }
  // Runs k single-spin steps, measuring after every full sweep and moving the swinging field along
  function advance(flips) {
    const n = lat.n;
    while (flips > 0) {
      const room = n - flipDebt;
      const k = Math.min(flips, room, osc.on ? Math.ceil(n / 8) : room);
      sim.flips(k);
      flips -= k; flipDebt += k;
      if (osc.on) {
        osc.phase += 2 * Math.PI * k / n / OSC_PERIOD;
        S.h = osc.amp * Math.sin(osc.phase);
        sim.set({ h: S.h });
      }
      if (flipDebt >= n) { flipDebt -= n; sweeps++; measure(); }
    }
  }

  /* ---------- Temperature scan ---------- */
  const SCAN_POINTS = 30, SCAN_EQ = [150, 200, 250], SCAN_MEAS = [400, 500, 600];
  function startScan() {
    stopOsc();
    const tmax = TMAX[S.lattice], tmin = 0.2;
    scan = { temps: Array.from({ length: SCAN_POINTS }, (_, i) => tmax - (tmax - tmin) * i / (SCAN_POINTS - 1)),
      i: 0, k: 0, acc: null, pts: [] };
    scanResults = { lattice: S.lattice, J: S.J, h: S.h, pts: scan.pts };
    sim.randomize();
    setT(scan.temps[0]);
    S.chart = 'scan';
    running = true;
    Tools.diag.log('scan start', { lattice: S.lattice, J: S.J, size: S.size });
    renderControls(); kick();
  }
  function stopScan(msg) {
    if (!scan) return;
    scan = null;
    if (msg) Tools.toast(t(msg));
    renderControls();
  }
  function scanStep(budget) {
    const t0 = performance.now(), eq = SCAN_EQ[S.size], meas = SCAN_MEAS[S.size];
    while (scan && performance.now() - t0 < budget) {
      sim.sweep(1); sweeps++;
      scan.k++;
      if (scan.k > eq) {
        const r = sim.measure();
        const o = S.J < 0 ? Math.abs(r.ms) : Math.abs(r.m);
        const a = scan.acc || (scan.acc = { o: 0, o2: 0, m: 0, ms: 0, e: 0, e2: 0, n: 0 });
        a.o += o; a.o2 += o * o; a.m += Math.abs(r.m); a.ms += Math.abs(r.ms); a.e += r.e; a.e2 += r.e * r.e; a.n++;
        last = r;
      }
      if (scan.k >= eq + meas) {
        const a = scan.acc, T = scan.temps[scan.i], n = lat.n;
        const e = a.e / a.n, o = a.o / a.n;
        scan.pts.push({ T, order: o, m: a.m / a.n, ms: a.ms / a.n, e,
          c: n * Math.max(0, a.e2 / a.n - e * e) / (T * T), chi: n * Math.max(0, a.o2 / a.n - o * o) / T });
        scan.i++; scan.k = 0; scan.acc = null;
        if (scan.i >= scan.temps.length) {
          Tools.diag.log('scan done', { points: scan.pts.length });
          running = false; stopScan('scanDone');
        } else setT(scan.temps[scan.i]);
      }
    }
  }
  function setT(T) { S.T = T; sim.set({ T }); }

  /* ---------- Swinging field (hysteresis) ---------- */
  function startOsc() {
    osc.amp = Math.abs(S.h) >= 0.25 ? Math.abs(S.h) : 2;
    osc.phase = Math.asin(clamp(S.h / osc.amp, -1, 1, 0));
    osc.on = true; loopPts = [];
    S.chart = 'loop'; running = true;
    renderControls(); kick();
  }
  function stopOsc() {
    if (!osc.on) return;
    osc.on = false;
    S.h = Math.round(S.h * 20) / 20; sim.set({ h: S.h });
    renderControls();
  }

  /* ---------- Quantum chain state ---------- */
  let qRes = null;     // { E0, gap, levels, obs }
  let curves = null;   // { key, gammas, levels: [], sx: [], zz: [], S: [] }
  let qSweep = false, qSweepT = 0, qLast = 0;
  const qParams = () => ({ N: S.q.N, J: S.q.J, gamma: S.q.gamma, h: S.q.h });
  function solveQ(p) {
    const lev = QC.levels(p, 6), g = QC.ground(p);
    const obs = QC.observe(g.psi, p.N);
    return { E0: Math.min(g.E0, lev[0]), gap: lev.length > 1 ? lev[1] - lev[0] : 0, levels: lev, obs };
  }
  function computeQ() {
    qRes = solveQ(qParams());
    const key = [S.q.N, S.q.J, S.q.h].join('|');
    if (!curves || curves.key !== key) {
      curves = { key, gammas: Array.from({ length: 41 }, (_, i) => i * 0.075), i: 0, levels: [], sx: [], zz: [], S: [] };
      kick();
    }
  }
  function curveStep(budget) {
    const t0 = performance.now();
    while (curves && curves.i < curves.gammas.length && performance.now() - t0 < budget) {
      const p = Object.assign(qParams(), { gamma: curves.gammas[curves.i] });
      const r = solveQ(p);
      curves.levels.push(r.levels.map(x => x - r.levels[0]));
      curves.sx.push(r.obs.sx.reduce((a, b) => a + b, 0) / p.N);
      curves.zz.push(Math.abs(r.obs.zz[r.obs.zz.length - 1]));
      curves.S.push(r.obs.entropy);
      curves.i++;
    }
  }

  /* ---------- Animation loop ---------- */
  let raf = 0, lastText = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function frame(now) {
    raf = 0;
    let again = false;
    if (S.mode === 'classic' && running) {
      if (scan) scanStep(12);
      else advance(Math.max(1, Math.round(SPEEDS[S.speed] * lat.n)));
      again = running;
    }
    if (S.mode === 'quantum') {
      if (qSweep) {
        if (!qLast) qLast = now;
        qSweepT += (now - qLast) / 1000; qLast = now;
        S.q.gamma = Math.round(((qSweepT / 8) % 1) * 300) / 100;
        computeQ();
        again = true;
      }
      if (curves && curves.i < curves.gammas.length) { curveStep(10); again = true; }
    }
    draw();
    if (now - lastText > 150 || !again) { lastText = now; renderText(); }
    if (again) kick();
  }

  /* ---------- Drawing: canvas helpers ---------- */
  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  const cv = $('cv');
  let view = null; // transform of the lattice drawing (for tapping)

  function draw() {
    if (S.mode === 'classic') { drawLattice(); drawChart(); } else { drawRing(); drawQChart(); }
  }

  function drawLattice() {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    if (!lat) return;
    const pad = 6, sc = Math.min((w - 2 * pad) / lat.W, (h - 2 * pad) / lat.H);
    const ox = (w - sc * lat.W) / 2, oy = (h - sc * lat.H) / 2;
    view = { sc, ox, oy };
    const s = sim.s, n = lat.n, X = i => ox + lat.x[i] * sc, Y = i => oy + lat.y[i] * sc;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, sc * lat.W, sc * lat.H); ctx.clip();
    if (lat.type === 'kagome') {
      // Lattice bonds, then a disc for every spin
      ctx.strokeStyle = C.bond; ctx.lineWidth = Math.max(1, sc * 0.08);
      ctx.beginPath();
      forBonds((i, j) => { ctx.moveTo(X(i), Y(i)); ctx.lineTo(X(j), Y(j)); });
      ctx.stroke();
    }
    for (const up of [true, false]) {
      ctx.fillStyle = up ? C.up : C.down;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if ((s[i] > 0) !== up) continue;
        const x = X(i), y = Y(i);
        if (lat.type === 'square') ctx.rect(x - sc / 2, y - sc / 2, sc + 0.6, sc + 0.6);
        else {
          for (const dx of wraps(lat.x[i])) {
            if (lat.type === 'triangular') hexPath(ctx, x + dx * sc, y, sc * 0.5774 + 0.4);
            else { ctx.moveTo(x + dx * sc + sc * 0.36, y); ctx.arc(x + dx * sc, y, sc * 0.36, 0, 2 * Math.PI); }
          }
        }
      }
      ctx.fill();
    }
    if (S.frust) {
      ctx.strokeStyle = C.frust; ctx.lineWidth = Math.max(2, sc * 0.14); ctx.lineCap = 'round';
      ctx.beginPath();
      forBonds((i, j) => { if (sim.J * s[i] * s[j] < 0) { ctx.moveTo(X(i), Y(i)); ctx.lineTo(X(j), Y(j)); } });
      ctx.stroke();
    }
    if (sc >= 16) {
      // Arrows ↑ / ↓ on big spins
      ctx.strokeStyle = C.arrow; ctx.lineWidth = Math.max(1.5, sc * 0.08); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const a = sc * (lat.type === 'kagome' ? 0.22 : 0.28), hd = a * 0.55;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = X(i), y = Y(i), d = s[i] > 0 ? -1 : 1;
        ctx.moveTo(x, y - d * a); ctx.lineTo(x, y + d * a);
        ctx.moveTo(x - hd, y + d * (a - hd)); ctx.lineTo(x, y + d * a); ctx.lineTo(x + hd, y + d * (a - hd));
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // Sites near the left/right edge are drawn twice so the periodic picture has no gaps
  const wraps = x => x < 0.7 ? [0, lat.W] : x > lat.W - 0.7 ? [0, -lat.W] : [0];
  function hexPath(ctx, x, y, r) {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + k * Math.PI / 3, px = x + r * Math.cos(a), py = y + r * Math.sin(a);
      if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.closePath();
  }
  // Bonds that do not wrap around the edge (length 1 in the drawing)
  function forBonds(fn) {
    const b = lat.bonds;
    for (let k = 0; k < b.length; k += 2) {
      const i = b[k], j = b[k + 1];
      const dx = lat.x[i] - lat.x[j], dy = lat.y[i] - lat.y[j];
      if (dx * dx + dy * dy < 1.02) fn(i, j);
    }
  }

  // Simple line chart: axes with ticks, series of points, vertical markers
  function niceStep(span, n) {
    const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p;
  }
  function plot(canvas, o) {
    const { ctx, w, h } = fitCanvas(canvas);
    ctx.clearRect(0, 0, w, h);
    const L = 34, R = 8, T = 8, B = 22, pw = w - L - R, ph = h - T - B;
    const px = x => L + (x - o.x0) / (o.x1 - o.x0) * pw, py = y => T + ph - (y - o.y0) / (o.y1 - o.y0) * ph;
    ctx.font = '11px system-ui, sans-serif'; ctx.lineWidth = 1;
    ctx.fillStyle = C.muted; ctx.strokeStyle = C.grid;
    const xs = niceStep(o.x1 - o.x0, Math.max(2, Math.floor(pw / 60))), ys = niceStep(o.y1 - o.y0, Math.max(2, Math.floor(ph / 36)));
    const xd = xs < 1 ? (xs < 0.1 ? 2 : 1) : 0, yd = ys < 1 ? (ys < 0.1 ? 2 : 1) : 0;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.beginPath();
    for (let x = Math.ceil(o.x0 / xs) * xs; x <= o.x1 + 1e-9; x += xs) {
      ctx.moveTo(px(x), T); ctx.lineTo(px(x), T + ph);
      ctx.fillText(fmt(x, xd), px(x), T + ph + 4);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (let y = Math.ceil(o.y0 / ys) * ys; y <= o.y1 + 1e-9; y += ys) {
      ctx.moveTo(L, py(y)); ctx.lineTo(L + pw, py(y));
      ctx.fillText(fmt(Math.abs(y) < 1e-12 ? 0 : y, yd), L - 4, py(y));
    }
    ctx.stroke();
    ctx.strokeStyle = C.axis; ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.rect(L, T, pw, ph); ctx.clip();
    for (const v of o.vlines || []) {
      ctx.strokeStyle = v.color; ctx.lineWidth = 1.5; ctx.setLineDash(v.dash ? [5, 4] : []);
      ctx.beginPath(); ctx.moveTo(px(v.x), T); ctx.lineTo(px(v.x), T + ph); ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const s of o.series) {
      if (!s.pts.length) continue;
      ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash ? [5, 4] : []);
      if (s.bars) {
        const bw = Math.max(3, pw / (o.x1 - o.x0) * 0.5);
        for (const [x, y] of s.pts) ctx.fillRect(px(x) - bw / 2, Math.min(py(y), py(0)), bw, Math.abs(py(y) - py(0)));
        continue;
      }
      ctx.beginPath();
      s.pts.forEach(([x, y], k) => { if (k) ctx.lineTo(px(x), py(y)); else ctx.moveTo(px(x), py(y)); });
      ctx.stroke();
      if (s.dots) for (const [x, y] of s.pts) { ctx.beginPath(); ctx.arc(px(x), py(y), 2.5, 0, 2 * Math.PI); ctx.fill(); }
      if (s.head) { const [x, y] = s.pts[s.pts.length - 1]; ctx.beginPath(); ctx.arc(px(x), py(y), 4.5, 0, 2 * Math.PI); ctx.fill(); }
    }
    ctx.restore();
    ctx.setLineDash([]);
    if (o.xlabel) { ctx.fillStyle = C.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillText(o.xlabel, L + pw - 4, T + ph - 3); }
  }
  function legend(el, items) {
    const html = items.map(it => `<li><i${it.dash ? ' class="dash"' : ''} style="background:${it.color}"></i>${Tools.esc(it.label)}</li>`).join('');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  function drawChart() {
    const cvs = $('chart'), empty = $('chartEmpty');
    let msg = '';
    if (S.chart === 'time') {
      const x1 = Math.max(50, sweeps), x0 = Math.max(0, x1 - 400);
      const ser = [{ color: C.c1, pts: series.map(p => [p.t, p.m]) }, { color: C.c2, pts: series.map(p => [p.t, p.e]) }];
      const lg = [{ color: C.c1, label: t('lgM') }, { color: C.c2, label: t('lgE') }];
      if (S.J < 0) { ser.push({ color: C.c4, pts: series.map(p => [p.t, p.ms]) }); lg.push({ color: C.c4, label: t('lgMs') }); }
      plot(cvs, { x0, x1, y0: -1.05, y1: 1.05, series: ser, xlabel: t('axSweeps') });
      legend($('legend'), lg);
    } else if (S.chart === 'loop') {
      const A = Math.max(osc.amp, Math.abs(S.h), 0.5);
      plot(cvs, { x0: -A, x1: A, y0: -1.05, y1: 1.05, series: [{ color: C.c1, pts: loopPts.map(p => [p.h, p.m]), head: true }],
        vlines: [{ x: 0, color: C.grid }], xlabel: t('axH') });
      legend($('legend'), [{ color: C.c1, label: t('lgLoop') }]);
      if (!loopPts.length) msg = t('emptyLoop');
    } else {
      const r = scanResults, tmax = TMAX[r ? r.lattice : S.lattice];
      const ser = [], lg = [], vl = [];
      if (r && r.pts.length) {
        const cm = Math.max(...r.pts.map(p => p.c)) || 1, xm = Math.max(...r.pts.map(p => p.chi)) || 1;
        ser.push({ color: C.c1, pts: r.pts.map(p => [p.T, p.order]), dots: true });
        ser.push({ color: C.c2, pts: r.pts.map(p => [p.T, p.c / cm]), dots: true });
        ser.push({ color: C.c3, pts: r.pts.map(p => [p.T, p.chi / xm]), dots: true });
        lg.push({ color: C.c1, label: t(r.J < 0 ? 'lgOrderS' : 'lgOrder') }, { color: C.c2, label: t('lgC') }, { color: C.c3, label: t('lgChi') });
        const ex = IL.exact(r.lattice, r.J);
        if (ex.tc && !r.h) {
          vl.push({ x: ex.tc, color: C.c5, dash: true });
          lg.push({ color: C.c5, label: t('lgTc') + ' ' + fmt(ex.tc, 3), dash: true });
        }
        if (r.lattice === 'square' && !r.h) {
          const pts = [];
          for (let k = 0; k <= 200; k++) { const T = 0.05 + (tmax - 0.05) * k / 200; pts.push([T, IL.onsagerM(T)]); }
          ser.push({ color: C.muted, pts, dash: true });
          lg.push({ color: C.muted, label: t('lgOnsager'), dash: true });
        }
      } else msg = t('emptyScan');
      plot(cvs, { x0: 0, x1: tmax, y0: 0, y1: 1.08, series: ser, vlines: vl, xlabel: t('axT') });
      legend($('legend'), lg);
    }
    empty.hidden = !msg;
    if (msg && empty.textContent !== msg) empty.textContent = msg;
  }

  function drawRing() {
    const { ctx, w, h } = fitCanvas(cv);
    ctx.clearRect(0, 0, w, h);
    if (!qRes) return;
    // Ring below the badge in the top left corner
    const N = S.q.N, top = 40, cx = w / 2, cy = top + (h - top) / 2, R = Math.min(w, h - top) * 0.36;
    const r = Math.min(R * Math.sin(Math.PI / N) * 0.7, Math.min(w, h) * 0.1);
    const pos = i => { const a = -Math.PI / 2 + 2 * Math.PI * i / N; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; };
    const zz1 = nnCorr();
    ctx.lineCap = 'round';
    for (let i = 0; i < N; i++) {
      const [x1, y1] = pos(i), [x2, y2] = pos((i + 1) % N);
      // Bond: thick and yellow where neighbours disagree with the coupling (frustrated on average)
      const happy = S.q.J * zz1[i];
      ctx.strokeStyle = happy < 0 ? C.frust : C.bond;
      ctx.lineWidth = 2 + 4 * Math.abs(zz1[i]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    const { sx, sz } = qRes.obs;
    for (let i = 0; i < N; i++) {
      const [x, y] = pos(i);
      ctx.fillStyle = C['surface-2']; ctx.strokeStyle = C.border; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      const vx = sx[i], vz = sz[i], len = Math.hypot(vx, vz);
      ctx.strokeStyle = vz > 0.15 ? C.up : vz < -0.15 ? C.down : C.accent;
      ctx.fillStyle = ctx.strokeStyle;
      if (len < 0.04) { ctx.beginPath(); ctx.arc(x, y, 3, 0, 2 * Math.PI); ctx.fill(); continue; }
      // Arrow through the centre, its length = length of the Bloch vector (1 = the spin points one way for sure)
      const ux = vx / len, uy = -vz / len, a = r * 0.9 * Math.min(1, len);
      ctx.lineWidth = Math.max(2, r * 0.12);
      ctx.beginPath(); ctx.moveTo(x - ux * a, y - uy * a); ctx.lineTo(x + ux * a, y + uy * a); ctx.stroke();
      const hd = Math.min(a * 0.8, Math.max(5, r * 0.4));
      ctx.beginPath();
      ctx.moveTo(x + ux * a, y + uy * a);
      ctx.lineTo(x + ux * a - ux * hd - uy * hd * 0.6, y + uy * a - uy * hd + ux * hd * 0.6);
      ctx.lineTo(x + ux * a - ux * hd + uy * hd * 0.6, y + uy * a - uy * hd - ux * hd * 0.6);
      ctx.closePath(); ctx.fill();
    }
  }
  // ⟨σᶻ_i σᶻ_{i+1}⟩ – translation invariant on the ring, so the same for every bond
  const nnCorr = () => new Array(S.q.N).fill(qRes.obs.zz[1]);

  function drawQChart() {
    const cvs = $('qchart'), c = curves;
    const progress = c && c.i < c.gammas.length ? [{ color: C.muted, label: t('computing', { p: fmt(100 * c.i / c.gammas.length, 0) }) }] : [];
    const gc = S.q.h ? [] : [{ x: 1, color: C.c5, dash: true }];
    const gcl = S.q.h ? [] : [{ color: C.c5, label: t('lgGc'), dash: true }];
    const cur = { x: S.q.gamma, color: C.accent };
    if (S.q.chart === 'spectrum') {
      const ser = [], lg = [], cols = [C.c1, C.c2, C.c3, C.c4, C.c5];
      let ymax = 1;
      for (let n = 1; n <= 5; n++) {
        const pts = [];
        if (c) c.levels.forEach((lv, k) => { if (lv[n] != null) { pts.push([c.gammas[k], lv[n]]); ymax = Math.max(ymax, lv[n]); } });
        if (pts.length) { ser.push({ color: cols[n - 1], pts }); lg.push({ color: cols[n - 1], label: t('lgLevel', { n }) }); }
      }
      plot(cvs, { x0: 0, x1: 3, y0: 0, y1: Math.min(ymax * 1.05, 12), series: ser, vlines: gc.concat(cur), xlabel: t('axG') });
      legend($('qlegend'), lg.concat(gcl, progress));
    } else if (S.q.chart === 'order') {
      const g = c ? c.gammas.slice(0, c.i) : [];
      const ymax = Math.max(1.05, ...(c ? c.S : [0])) ;
      plot(cvs, { x0: 0, x1: 3, y0: 0, y1: ymax, xlabel: t('axG'), vlines: gc.concat(cur), series: [
        { color: C.c1, pts: g.map((x, k) => [x, c.zz[k]]) }, { color: C.c2, pts: g.map((x, k) => [x, c.sx[k]]) },
        { color: C.c3, pts: g.map((x, k) => [x, c.S[k]]) }] });
      legend($('qlegend'), [{ color: C.c1, label: t('lgZZ') }, { color: C.c2, label: t('lgSx') }, { color: C.c3, label: t('lgS') }].concat(gcl, progress));
    } else {
      const zz = qRes ? qRes.obs.zz : [];
      plot(cvs, { x0: -0.5, x1: zz.length - 0.5, y0: -1.05, y1: 1.05, xlabel: t('axR'),
        series: [{ color: C.c1, pts: zz.map((v, r) => [r, v]), bars: true }] });
      legend($('qlegend'), [{ color: C.c1, label: t('lgCorr') }]);
    }
  }

  /* ---------- Text, controls ---------- */
  const sign = v => (v > 0.005 ? '+' : '') + fmt(v, 2);
  function factsText() {
    const ex = IL.exact(S.lattice, S.J);
    let txt;
    if (ex.tc) txt = t('factTc', { tc: fmt(ex.tc, 3), order: t(S.J < 0 ? 'orderAF' : 'orderF') }) + (S.h ? t('factField') : '');
    else txt = t('factFrust', { s: fmt(ex.s0, 3) }) + (S.lattice === 'triangular' ? t('factPlateau') : t('factKagomeField'));
    return txt + t('factE0', { e: fmt(ex.e0, 3) });
  }
  function renderText() {
    if (S.mode === 'classic') {
      if (last) {
        $('sM').textContent = sign(last.m);
        $('sMs').textContent = fmt(Math.abs(last.ms), 2);
        $('sE').textContent = fmt(last.e, 3);
        $('sF').textContent = fmt(100 * last.frustrated, 0) + ' %';
      }
      $('badge').textContent = scan
        ? t('badgeScan', { i: Math.min(scan.i + 1, scan.temps.length), n: scan.temps.length, T: fmt(S.T, 2) })
        : t('badgeC', { T: fmt(S.T, 2), h: fmt(S.h, 2) }) + ' · ' + t('sweep', { n: fmt(sweeps, 0) });
      if (osc.on) { $('rH').value = S.h; $('oH').textContent = fmt(S.h, 2); }
      if (scan) { $('rT').value = S.T; $('oT').textContent = fmt(S.T, 2); }
    } else if (qRes) {
      const N = S.q.N, o = qRes.obs;
      $('qE').textContent = fmt(qRes.E0 / N, 3);
      $('qGap').textContent = fmt(qRes.gap, 3);
      $('qX').textContent = fmt(o.sx.reduce((a, b) => a + b, 0) / N, 2);
      $('qS').textContent = fmt(o.entropy, 2);
      $('badge').textContent = t('badgeQ', { N, g: fmt(S.q.gamma, 2), h: fmt(S.q.h, 2) });
      $('rG').value = S.q.gamma; $('oG').textContent = fmt(S.q.gamma, 2);
      renderConfigs();
      let f = t(S.q.J > 0 ? 'qFactF' : N % 2 ? 'qFactAFo' : 'qFactAFe');
      if (!S.q.h && (S.q.J > 0 || N % 2 === 0)) f += t('qFactExact', { e: fmt(QC.exactE0(N, 1, S.q.gamma) / N, 3) });
      if ($('qFacts').textContent !== f) $('qFacts').textContent = f;
    }
  }
  function renderConfigs() {
    const N = S.q.N;
    const html = qRes.obs.top.filter(c => c.p > 0.0005).map(c => {
      let ket = '';
      for (let i = 0; i < N; i++) ket += (c.s >> i) & 1 ? '<span class="u">↑</span>' : '<span class="d">↓</span>';
      return `<li><span class="ket">${ket}</span><span class="bar"><span style="width:${(100 * c.p).toFixed(1)}%"></span></span><span class="pct">${fmt(100 * c.p, 1)} %</span></li>`;
    }).join('');
    const el = $('configs');
    if (el.innerHTML !== html) el.innerHTML = html;
  }
  const press = (sel, val) => { for (const b of document.querySelectorAll(sel + ' button')) b.setAttribute('aria-pressed', String(b.dataset.v === String(val) || b.dataset.mode === val || b.dataset.chart === val)); };
  function setRunIcon(btn, on, label) {
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('use').setAttribute('href', '../assets/icons.svg#' + (on ? 'player-pause' : 'player-play'));
    if (label) btn.querySelector('.tb-label').textContent = t(on ? 'pause' : 'start');
  }
  function renderControls() {
    const q = S.mode === 'quantum';
    press('#mode', S.mode);
    $('classic').hidden = q; $('quantum').hidden = !q; $('tb').hidden = q;
    cv.setAttribute('aria-label', q ? t('cvLabelQ') : t('cvLabel'));
    press('#lattice', S.lattice); press('#coupling', S.J); press('#size', S.size); press('#chartMode', S.chart);
    $('rT').value = S.T; $('oT').textContent = fmt(S.T, 2);
    $('rH').value = S.h; $('oH').textContent = fmt(S.h, 2); $('rH').disabled = osc.on;
    $('rSpeed').value = S.speed; $('oSpeed').textContent = t('speedV', { n: fmt(SPEEDS[S.speed], SPEEDS[S.speed] < 0.1 ? 2 : SPEEDS[S.speed] < 1 ? 2 : 0) });
    setRunIcon($('btnRun'), running, true);
    $('btnScan').setAttribute('aria-pressed', String(!!scan));
    $('btnFrust').setAttribute('aria-pressed', String(S.frust));
    setRunIcon($('btnOsc'), osc.on, false);
    $('factsText').textContent = factsText();
    press('#qCoupling', S.q.J); press('#qChartMode', S.q.chart);
    $('rN').value = S.q.N; $('oN').textContent = String(S.q.N);
    $('rG').value = S.q.gamma; $('oG').textContent = fmt(S.q.gamma, 2);
    $('rQh').value = S.q.h; $('oQh').textContent = fmt(S.q.h, 2);
    setRunIcon($('btnSweepG'), qSweep, false);
    renderText(); draw(); save();
  }

  /* ---------- Events ---------- */
  const on = (id, ev, fn) => $(id).addEventListener(ev, fn);
  const segClick = (sel, fn) => { for (const b of document.querySelectorAll(sel + ' button')) b.addEventListener('click', () => fn(b)); };
  segClick('#mode', b => setMode(b.dataset.mode));
  function setMode(m) {
    S.mode = m;
    if (m === 'quantum') { stopScan(); computeQ(); } else { qSweep = false; if (running) kick(); }
    Tools.diag.log('mode', { mode: m });
    renderControls(); kick();
  }
  segClick('#lattice', b => { if (S.lattice === b.dataset.v) return; stopScan(); stopOsc(); S.lattice = b.dataset.v; rebuild(); renderControls(); });
  segClick('#coupling', b => { stopScan(); S.J = Number(b.dataset.v); sim.set({ J: S.J }); last = sim.measure(); renderControls(); });
  segClick('#size', b => { if (S.size === Number(b.dataset.v)) return; stopScan(); S.size = Number(b.dataset.v); rebuild(); renderControls(); });
  segClick('#chartMode', b => { S.chart = b.dataset.chart; renderControls(); });
  on('rT', 'input', e => { stopScan('scanStopped'); setT(Number(e.target.value)); $('oT').textContent = fmt(S.T, 2); renderText(); save(); });
  on('rH', 'input', e => { stopScan('scanStopped'); S.h = Number(e.target.value); sim.set({ h: S.h }); $('oH').textContent = fmt(S.h, 2); $('factsText').textContent = factsText(); renderText(); save(); });
  on('rSpeed', 'input', e => { S.speed = Number(e.target.value); renderControls(); });
  on('btnOsc', 'click', () => { stopScan(); if (osc.on) stopOsc(); else startOsc(); });
  on('btnRun', 'click', () => { running = !running; renderControls(); if (running) kick(); });
  on('btnHot', 'click', () => { stopScan(); sim.randomize(); last = sim.measure(); draw(); renderText(); });
  on('btnCold', 'click', () => { stopScan(); sim.order(S.J < 0 ? 'neel' : 'up'); last = sim.measure(); draw(); renderText(); });
  on('btnScan', 'click', () => { if (scan) { running = false; stopScan('scanStopped'); } else startScan(); });
  on('btnFrust', 'click', () => { S.frust = !S.frust; renderControls(); });
  segClick('#qCoupling', b => { S.q.J = Number(b.dataset.v); computeQ(); renderControls(); });
  segClick('#qChartMode', b => { S.q.chart = b.dataset.chart; renderControls(); });
  on('rN', 'input', e => { S.q.N = Number(e.target.value); computeQ(); renderControls(); });
  on('rG', 'input', e => { qSweep = false; S.q.gamma = Number(e.target.value); computeQ(); renderControls(); });
  on('rQh', 'input', e => { S.q.h = Number(e.target.value); computeQ(); renderControls(); });
  on('btnSweepG', 'click', () => {
    qSweep = !qSweep; qLast = 0; qSweepT = S.q.gamma >= 2.99 ? 0 : S.q.gamma / 3 * 8;
    renderControls(); kick();
  });

  // Tap or drag on the lattice: paint spins (opposite of the first one touched)
  let paint = null;
  function siteAt(e) {
    if (!view || !lat) return -1;
    const r = cv.getBoundingClientRect();
    const x = (e.clientX - r.left - view.ox) / view.sc, y = (e.clientY - r.top - view.oy) / view.sc;
    let best = -1, bd = 0.8; // squared distance: anywhere inside a cell, also its corners
    for (let i = 0; i < lat.n; i++) {
      let dx = Math.abs(lat.x[i] - x); dx = Math.min(dx, lat.W - dx);
      const dy = lat.y[i] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  cv.addEventListener('pointerdown', e => {
    if (S.mode !== 'classic') return;
    const i = siteAt(e);
    if (i < 0) return;
    paint = -sim.s[i];
    sim.s[i] = paint;
    try { cv.setPointerCapture(e.pointerId); } catch (_) { /* not supported */ }
    last = sim.measure(); draw(); renderText();
  });
  cv.addEventListener('pointermove', e => {
    if (paint == null) return;
    const i = siteAt(e);
    if (i >= 0 && sim.s[i] !== paint) { sim.s[i] = paint; if (!running) { last = sim.measure(); draw(); } }
  });
  const endPaint = () => { paint = null; };
  cv.addEventListener('pointerup', endPaint);
  cv.addEventListener('pointercancel', endPaint);
  try { new ResizeObserver(() => draw()).observe($('view')); } catch (_) { window.addEventListener('resize', draw); }

  /* ---------- Examples ---------- */
  const EXAMPLES = {
    domains: { lattice: 'square', J: 1, T: 1, h: 0, start: 'random', chart: 'time' },
    critical: { lattice: 'square', J: 1, T: 2.27, h: 0, start: 'random', chart: 'time' },
    neel: { lattice: 'square', J: -1, T: 1, h: 0, start: 'random', chart: 'time' },
    tri: { lattice: 'triangular', J: -1, T: 0.3, h: 0, start: 'random', frust: true, chart: 'time' },
    plateau: { lattice: 'triangular', J: -1, T: 0.3, h: 3, start: 'random', frust: true, chart: 'time' },
    kagome: { lattice: 'kagome', J: -1, T: 0.2, h: 0, start: 'random', frust: true, chart: 'time' },
    hyst: { lattice: 'square', J: 1, T: 1.5, h: 1.5, start: 'ordered', osc: true },
    cat: { q: { N: 8, J: 1, gamma: 0.2, h: 0 } },
    qcp: { q: { N: 10, J: 1, gamma: 1, h: 0, chart: 'order' } },
    odd: { q: { N: 7, J: -1, gamma: 0.3, h: 0 } }
  };
  function fillExamples() {
    const sel = $('examples'), cur = sel.value;
    sel.length = 1;
    for (const k of Object.keys(EXAMPLES)) sel.add(new Option(t('ex_' + k), k));
    sel.value = cur;
  }
  on('examples', 'change', e => {
    const ex = EXAMPLES[e.target.value];
    e.target.value = '';
    if (!ex) return;
    Tools.diag.log('example', { name: Object.keys(EXAMPLES).find(k => EXAMPLES[k] === ex) });
    if (ex.q) { Object.assign(S.q, ex.q); setMode('quantum'); return; }
    applyClassic(ex);
    if (ex.osc) startOsc();
    running = true; renderControls(); kick();
  });
  function applyClassic(p) {
    stopScan(); stopOsc();
    const relattice = (p.lattice && p.lattice !== S.lattice) || (p.size != null && p.size !== S.size);
    if (p.lattice) S.lattice = p.lattice;
    if (p.size != null) S.size = p.size;
    if (p.J != null) S.J = p.J;
    if (p.T != null) S.T = p.T;
    if (p.h != null) S.h = p.h;
    if (p.frust != null) S.frust = p.frust;
    if (p.chart) S.chart = p.chart;
    S.mode = 'classic';
    if (relattice) rebuild(p.start);
    sim.set({ J: S.J, h: S.h, T: S.T });
    if (!relattice && p.start === 'random') sim.randomize();
    if (!relattice && p.start === 'ordered') sim.order(S.J < 0 ? 'neel' : 'up');
    if (p.start && p.start !== 'keep') { series = []; loopPts = []; sweeps = 0; }
    last = sim.measure();
  }

  /* ---------- Start ---------- */
  rebuild();
  fillExamples();
  if (S.mode === 'quantum') computeQ();
  running = !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  renderControls();
  kick();
  Tools.onLang(() => { fillExamples(); renderControls(); });
  Tools.diag.info(() => ({ mode: S.mode, lattice: S.lattice, sites: lat.n, J: S.J, T: S.T, h: S.h, running, scanning: !!scan,
    oscillating: osc.on, sweeps, quantum: { N: S.q.N, J: S.q.J, gamma: S.q.gamma, h: S.q.h } }));
  // Pause while the page is hidden (requestAnimationFrame stops anyway; resume cleanly)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  /* ---------- WebMCP ---------- */
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const sizeName = ['small', 'medium', 'large'];
  const classicState = () => ({
    lattice: S.lattice, coupling: S.J > 0 ? 'ferro' : 'antiferro', temperature: r4(S.T), field: r4(S.h),
    size: sizeName[S.size], sites: lat.n, sweeps
  });
  const measurements = () => ({
    magnetization: r4(last.m), staggered_order: r4(Math.abs(last.ms)), energy_per_spin: r4(last.e), frustrated_bonds: r4(last.frustrated)
  });
  const exactInfo = () => {
    const ex = IL.exact(S.lattice, S.J);
    return { critical_temperature: ex.tc == null ? null : r4(ex.tc), ground_energy_per_spin: r4(ex.e0), residual_entropy_per_spin: ex.s0 };
  };
  Tools.mcp.register({
    name: 'set_classical', title: 'Set up the Ising lattice', label: 'mcp.set',
    description: 'Switches to the classical Ising model and sets lattice (square, triangular, kagome), coupling (ferro: J = +1, antiferro: J = −1), temperature T and field h in units of |J|, lattice size and the start configuration. Omitted values stay. Energy H = −J Σ s_i s_j − h Σ s_i. Returns the settings and exactly known results for this lattice (critical temperature, ground state energy and residual entropy per spin at h = 0).',
    inputSchema: { type: 'object', properties: {
      lattice: { type: 'string', enum: LATTICES },
      coupling: { type: 'string', enum: ['ferro', 'antiferro'] },
      temperature: { type: 'number', minimum: 0.05, maximum: 6 },
      field: { type: 'number', minimum: -6, maximum: 6 },
      size: { type: 'string', enum: sizeName },
      start: { type: 'string', enum: ['random', 'ordered', 'keep'], description: 'random = hot start, ordered = all up (ferro) or the lowest-energy pattern (antiferro), keep = keep the spins. Default keep (random when the lattice changes).' }
    }, additionalProperties: false },
    execute: p => {
      applyClassic({ lattice: p.lattice, size: p.size == null ? null : sizeName.indexOf(p.size), J: p.coupling == null ? null : p.coupling === 'ferro' ? 1 : -1,
        T: p.temperature, h: p.field, start: p.start || 'keep' });
      renderControls();
      return { settings: classicState(), exact: exactInfo(), measurements: measurements() };
    }
  });
  Tools.mcp.register({
    name: 'run_sweeps', title: 'Run Monte Carlo sweeps', label: 'mcp.run',
    description: 'Runs Metropolis Monte Carlo sweeps (one sweep = as many single-spin flip attempts as there are spins) at the current settings of the classical lattice and shows the result in the app. Returns the measurements after the last sweep and averages over the sweeps (absolute magnetisation, energy per spin, heat capacity per spin from the energy fluctuations).',
    inputSchema: { type: 'object', properties: {
      sweeps: { type: 'integer', minimum: 1, maximum: 2000 }
    }, required: ['sweeps'], additionalProperties: false },
    execute: ({ sweeps: k }) => {
      if (S.mode !== 'classic') setMode('classic');
      stopScan();
      let am = 0, e = 0, e2 = 0;
      for (let i = 0; i < k; i++) {
        advance(lat.n - flipDebt);
        am += Math.abs(last.m); e += last.e; e2 += last.e * last.e;
      }
      am /= k; e /= k; e2 /= k;
      renderControls();
      return { settings: classicState(), measurements: measurements(),
        averages: { abs_magnetization: r4(am), energy_per_spin: r4(e), heat_capacity_per_spin: r4(lat.n * Math.max(0, e2 - e * e) / (S.T * S.T)) } };
    }
  });
  Tools.mcp.register({
    name: 'get_classical', title: 'Read the Ising lattice', readOnly: true,
    description: 'Reads the classical Ising model as shown in the app: settings, whether the simulation runs, current measurements (magnetisation, staggered/sublattice order, energy per spin, share of frustrated bonds), exactly known results and the points of the last temperature scan (T, order parameter, energy, heat capacity C and susceptibility χ per spin).',
    execute: () => ({ settings: classicState(), running, scanning: !!scan, field_swinging: osc.on, measurements: measurements(), exact: exactInfo(),
      temperature_scan: scanResults && scanResults.pts.length ? {
        lattice: scanResults.lattice, coupling: scanResults.J > 0 ? 'ferro' : 'antiferro', field: scanResults.h,
        points: scanResults.pts.map(p => ({ temperature: r4(p.T), order: r4(p.order), energy_per_spin: r4(p.e), heat_capacity: r4(p.c), susceptibility: r4(p.chi) })) } : null })
  });
  Tools.mcp.register({
    name: 'set_quantum', title: 'Set up the quantum Ising chain', label: 'mcp.q',
    description: 'Switches to the quantum Ising ring H = −J Σ σᶻ_i σᶻ_{i+1} − Γ Σ σˣ_i − h Σ σᶻ_i (Pauli matrices, periodic) and solves it exactly. Omitted values stay. Returns ground state energy per spin (and the exact free-fermion value where it applies: h = 0 and ferro or an even ring), the gap to the first excited level, the average transverse magnetisation ⟨σˣ⟩, the correlation ⟨σᶻ_0 σᶻ_r⟩ for r = 0 … N/2, the entanglement entropy of half the ring in bits and the most likely basis configurations (u = up, d = down).',
    inputSchema: { type: 'object', properties: {
      spins: { type: 'integer', minimum: 3, maximum: 10 },
      coupling: { type: 'string', enum: ['ferro', 'antiferro'] },
      transverse_field: { type: 'number', minimum: 0, maximum: 3 },
      field: { type: 'number', minimum: -2, maximum: 2 }
    }, additionalProperties: false },
    execute: p => {
      if (p.spins != null) S.q.N = p.spins;
      if (p.coupling) S.q.J = p.coupling === 'ferro' ? 1 : -1;
      if (p.transverse_field != null) S.q.gamma = p.transverse_field;
      if (p.field != null) S.q.h = p.field;
      qSweep = false;
      setMode('quantum');
      const N = S.q.N, o = qRes.obs, exactOk = !S.q.h && (S.q.J > 0 || N % 2 === 0);
      return {
        spins: N, coupling: S.q.J > 0 ? 'ferro' : 'antiferro', transverse_field: S.q.gamma, field: S.q.h,
        energy_per_spin: r4(qRes.E0 / N), exact_energy_per_spin: exactOk ? r4(QC.exactE0(N, 1, S.q.gamma) / N) : null,
        gap: r4(qRes.gap), transverse_magnetization: r4(o.sx.reduce((a, b) => a + b, 0) / N),
        correlations: o.zz.map(r4), entanglement_bits: r4(o.entropy),
        top_configurations: o.top.filter(c => c.p > 0.0005).map(c => ({
          spins: Array.from({ length: N }, (_, i) => (c.s >> i) & 1 ? 'u' : 'd').join(''), probability: r4(c.p) }))
      };
    }
  });
})();
