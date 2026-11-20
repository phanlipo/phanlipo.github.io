/* Free circuit kit without DOM: parts on the edges of a grid of 5 × 4 points, solved by nodal analysis.
   Edge keys: 'h-r-c' joins point (r, c) with (r, c+1), 'v-r-c' joins (r, c) with (r+1, c); point index = r·COLS + c.
   Parts: { k: 'wire' | 'bat' | 'bulb' | 'sw' | 'am' | 'vm' | 'cap', v: volts (bat), ohms (bulb) or farads (cap), d: ±1, on: bool (sw) }
     d = +1: the plus pole (bat) or the red terminal (vm) is at the second point of the edge (right / below), −1 at the first.
   Model: wires, closed switches and ammeters are tiny resistances (R0), a battery is an ideal source with a small inner
   resistance RB = 1000·R0 (Norton form; like a real battery it has much more than a wire, so a short pulls its
   terminal voltage down to almost 0), a voltmeter draws no current. Each connected part of the circuit gets its own reference
   point (0 V): the minus pole of its first battery. Ideal parts make a short circuit show up as a huge current (> SHORT).
   Capacitors: solve(parts, { vc, dt }) takes the voltage of each capacitor at the start of a time step (vc[key] = potential
   of the first point minus the second, 0 if missing) and the step dt. Backward Euler: during the step a capacitor acts like
   a conductance C/dt with a source C/dt·vc (always stable, also for a capacitor joined directly to a battery); the result
   gives its voltage at the end of the step (parts[key].U), the caller keeps it for the next step.
   Used by index.html (window.Network) and the tests. */
(function (root) {
  'use strict';
  const COLS = 5, ROWS = 4, R0 = 1e-7, RB = 1e-4, SHORT = 5000, P_FULL = 4, DT = 1 / 120; // Ω, A, W (a bulb glows fully at 4 W), s
  const KINDS = ['wire', 'bat', 'bulb', 'sw', 'am', 'vm', 'cap'];

  function edges() {
    const out = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (c < COLS - 1) out.push({ key: `h-${r}-${c}`, dir: 'h', r, c, a: r * COLS + c, b: r * COLS + c + 1 });
      if (r < ROWS - 1) out.push({ key: `v-${r}-${c}`, dir: 'v', r, c, a: r * COLS + c, b: (r + 1) * COLS + c });
    }
    return out;
  }
  const EDGES = edges(), BY_KEY = Object.fromEntries(EDGES.map(e => [e.key, e]));

  // check a stored part; returns a clean copy or null
  function clean(p) {
    if (!p || typeof p !== 'object' || !KINDS.includes(p.k)) return null;
    const o = { k: p.k };
    if (p.k === 'bat') { o.v = Number.isFinite(p.v) ? Math.min(12, Math.max(1.5, Math.round(p.v * 2) / 2)) : 6; o.d = p.d === -1 ? -1 : 1; }
    if (p.k === 'bulb') o.v = Number.isFinite(p.v) ? Math.min(50, Math.max(2, Math.round(p.v))) : 10;
    if (p.k === 'cap') o.v = Number.isFinite(p.v) ? Math.min(5, Math.max(0.1, Math.round(p.v * 10) / 10)) : 1;
    if (p.k === 'vm') o.d = p.d === -1 ? -1 : 1;
    if (p.k === 'sw') o.on = p.on !== false;
    return o;
  }

  // numbers per kind in reading order (row by row, horizontal edge before the vertical one at the same point)
  function labels(parts) {
    const n = {}, out = {};
    for (const e of EDGES) { const p = parts[e.key]; if (p && p.k !== 'wire') { n[p.k] = (n[p.k] || 0) + 1; out[e.key] = n[p.k]; } }
    return out;
  }

  function uf(n) {
    const p = Array.from({ length: n }, (_, i) => i);
    const find = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
    return { find, join: (a, b) => { a = find(a); b = find(b); if (a !== b) p[Math.max(a, b)] = Math.min(a, b); } };
  }

  // Gaussian elimination with partial pivoting (A is n×n, changed in place)
  function gauss(A, b) {
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let m = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[m][i])) m = r;
      [A[i], A[m]] = [A[m], A[i]]; [b[i], b[m]] = [b[m], b[i]];
      const p = A[i][i] || 1e-300;
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / p;
        if (!f) continue;
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
      x[i] = s / (A[i][i] || 1e-300);
    }
    return x;
  }

  function solve(parts, opts = {}) {
    const vc = opts.vc || {}, dt = opts.dt || DT;
    const N = COLS * ROWS, list = [];
    for (const e of EDGES) { const p = parts[e.key]; if (p) list.push({ e, p }); }
    // elements that carry current: [a, b, conductance, source current a→b]
    const el = [];
    for (const { e, p } of list) {
      if (p.k === 'vm' || (p.k === 'sw' && !p.on)) continue;
      if (p.k === 'bulb') el.push({ key: e.key, a: e.a, b: e.b, g: 1 / p.v, s: 0 });
      else if (p.k === 'bat') el.push({ key: e.key, a: e.a, b: e.b, g: 1 / RB, s: p.d * p.v / RB });
      else if (p.k === 'cap') { const g = p.v / dt; el.push({ key: e.key, a: e.a, b: e.b, g, s: -g * (vc[e.key] || 0) }); }
      else el.push({ key: e.key, a: e.a, b: e.b, g: 1 / R0, s: 0 });
    }
    // connected parts and their reference points
    const comp = uf(N), used = new Array(N).fill(false);
    for (const x of el) { comp.join(x.a, x.b); used[x.a] = used[x.b] = true; }
    const ground = new Map();
    for (const { e, p } of list) if (p.k === 'bat' && !ground.has(comp.find(e.a))) ground.set(comp.find(e.a), p.d === 1 ? e.a : e.b);
    for (let i = 0; i < N; i++) if (used[i] && !ground.has(comp.find(i))) ground.set(comp.find(i), i);
    const grounds = new Set(ground.values());
    const idx = new Array(N).fill(-1); let n = 0;
    for (let i = 0; i < N; i++) if (used[i] && !grounds.has(i)) idx[i] = n++;
    const A = Array.from({ length: n }, () => new Array(n).fill(0)), rhs = new Array(n).fill(0);
    for (const x of el) {
      const i = idx[x.a], j = idx[x.b];
      if (i >= 0) { A[i][i] += x.g; rhs[i] -= x.s; }
      if (j >= 0) { A[j][j] += x.g; rhs[j] += x.s; }
      if (i >= 0 && j >= 0) { A[i][j] -= x.g; A[j][i] -= x.g; }
    }
    const sol = n ? gauss(A, rhs) : [];
    const phi = new Array(N).fill(NaN);
    for (let i = 0; i < N; i++) if (used[i]) phi[i] = grounds.has(i) ? 0 : sol[idx[i]];
    const V = i => (Number.isFinite(phi[i]) ? phi[i] : 0);

    // results per part; I = current from the first to the second point of the edge
    const out = {}, lab = labels(parts);
    let short = false;
    for (const { e, p } of list) {
      const U = V(e.a) - V(e.b), r = { kind: p.k, n: lab[e.key] || 0, U, I: 0, P: 0 };
      if (p.k === 'bulb') { r.I = U / p.v; r.P = U * U / p.v; r.bright = Math.min(1, r.P / P_FULL); }
      else if (p.k === 'bat') { r.I = U / RB + p.d * p.v / RB; r.out = p.d * r.I; r.terminal = -p.d * U; r.P = r.terminal * r.out; }
      else if (p.k === 'vm') r.reading = -p.d * U;           // red terminal minus black terminal
      else if (p.k === 'cap') { r.I = p.v / dt * (U - (vc[e.key] || 0)); r.Q = p.v * U; r.E = p.v * U * U / 2; r.P = U * r.I; }
      else if (p.k !== 'sw' || p.on) r.I = U / R0;
      r.short = Math.abs(r.I) > SHORT;
      if (r.short && p.k === 'bat') short = true;
      out[e.key] = r;
    }

    // nets: points joined by wires, closed switches and ammeters (one potential each, for the nodal analysis)
    const net = uf(N);
    for (const { e, p } of list) if (p.k === 'wire' || p.k === 'am' || (p.k === 'sw' && p.on)) net.join(e.a, e.b);
    const netIdx = new Array(N).fill(-1), nets = [];
    for (let i = 0; i < N; i++) {
      if (!used[i]) continue;
      const root = net.find(i);
      if (netIdx[root] < 0) { netIdx[root] = nets.length; nets.push({ id: nets.length + 1, nodes: [], phi: 0, ground: false, fixed: false, source: false }); }
      netIdx[i] = netIdx[root];
      nets[netIdx[i]].nodes.push(i);
    }
    const netOf = i => (used[i] ? netIdx[i] : -1);
    for (const N1 of nets) { N1.phi = N1.nodes.reduce((s, i) => s + V(i), 0) / N1.nodes.length; N1.ground = N1.nodes.some(i => grounds.has(i)); }
    // nets fixed by batteries: start at each reference point that is a minus pole and follow the batteries
    const bats = list.filter(x => x.p.k === 'bat'), caps = list.filter(x => x.p.k === 'cap');
    const queue = [];
    for (const { e, p } of bats) { const m = netOf(p.d === 1 ? e.a : e.b); if (nets[m].ground && !nets[m].fixed) { nets[m].fixed = true; queue.push(m); } }
    while (queue.length) {
      const m = queue.shift();
      for (const { e } of bats.concat(caps)) {
        const x = netOf(e.a), y = netOf(e.b);
        for (const [u, w] of [[x, y], [y, x]]) if (u === m && !nets[w].fixed) { nets[w].fixed = true; queue.push(w); }
      }
    }
    for (const { e } of bats.concat(caps)) { nets[netOf(e.a)].source = true; nets[netOf(e.b)].source = true; }
    // live: the net belongs to a connected part with a battery (elsewhere no current can flow)
    const live = new Set(bats.concat(caps.filter(({ e }) => Math.abs(vc[e.key] || 0) > 1e-9)).map(({ e }) => comp.find(e.a)));
    for (const n1 of nets) n1.live = live.has(comp.find(n1.nodes[0]));
    let I = 0, P = 0;
    for (const { e } of bats) { I += out[e.key].out; P += out[e.key].P; }
    return { phi, parts: out, nets, netOf, short, total: { I, P }, batteries: bats.length, capacitors: caps.length };
  }

  /* Examples. Battery on the left edge with the plus pole at the top (d = −1), a rectangle of wire around rows 1–3. */
  const W = { k: 'wire' }, frame = { 'v-0-0': W, 'h-0-0': W, 'h-2-0': W, 'h-2-1': W, 'h-2-2': W, 'h-2-3': W };
  const EXAMPLES = {
    // two bulbs in series, a voltmeter across L1, an ammeter and a switch in the return wire
    series: { ...frame, 'v-1-0': { k: 'bat', v: 6, d: -1 }, 'h-0-1': { k: 'bulb', v: 10 }, 'h-0-2': W, 'h-0-3': { k: 'bulb', v: 20 },
      'v-0-4': W, 'v-1-4': W, 'h-2-1': { k: 'am' }, 'h-2-2': { k: 'sw', on: true }, 'v-0-1': W, 'v-0-2': W, 'h-1-1': { k: 'vm', d: -1 } },
    // two bulbs in parallel, the right one with a switch; the ammeter measures the total current
    parallel: { ...frame, 'v-1-0': { k: 'bat', v: 6, d: -1 }, 'h-0-1': W, 'h-0-2': W, 'h-0-3': W, 'h-2-0': { k: 'am' },
      'v-0-2': { k: 'bulb', v: 10 }, 'v-1-2': W, 'v-0-4': { k: 'bulb', v: 10 }, 'v-1-4': { k: 'sw', on: true } },
    // one bulb in series with two in parallel
    mixed: { ...frame, 'v-1-0': { k: 'bat', v: 6, d: -1 }, 'h-0-1': { k: 'bulb', v: 10 }, 'h-0-2': W, 'h-0-3': W,
      'v-0-3': { k: 'bulb', v: 20 }, 'v-1-3': W, 'v-0-4': { k: 'bulb', v: 20 }, 'v-1-4': W },
    // a bulb in series with a capacitor: bright at first, darker while the capacitor fills (τ = R·C = 10 s)
    rc: { ...frame, 'v-1-0': { k: 'bat', v: 6, d: -1 }, 'h-0-1': { k: 'bulb', v: 10 }, 'h-0-2': W, 'h-0-3': W, 'v-0-4': { k: 'cap', v: 1 }, 'v-1-4': W, 'h-2-1': { k: 'sw', on: true } },
    // a bulb, and a closed switch that joins the poles of the battery by wire
    short: { ...frame, 'v-1-0': { k: 'bat', v: 6, d: -1 }, 'h-0-1': { k: 'bulb', v: 10 }, 'h-0-2': W, 'h-0-3': W, 'v-0-4': W, 'v-1-4': W,
      'h-1-0': { k: 'sw', on: true }, 'v-1-1': W },
  };
  const example = name => Object.fromEntries(Object.entries(EXAMPLES[name]).map(([k, p]) => [k, { ...p }]));

  // let time run: n steps of dt, the capacitor voltages vc are changed in place; returns the last solution
  function step(parts, vc, seconds, dt = DT) {
    let sol = null;
    const n = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < n; i++) {
      sol = solve(parts, { vc, dt });
      for (const k in parts) if (parts[k].k === 'cap') vc[k] = sol.parts[k].U;
    }
    return sol;
  }
  /* What the rest of the circuit looks like from one capacitor: a source U_end behind a resistance R (Thévenin), found
     by holding the capacitor at two voltages for an instant. Then U_C(t) = U_end + (U_0 − U_end)·e^(−t/τ), τ = R·C. */
  function thevenin(parts, key, vc = {}) {
    const tiny = 1e-9, C = parts[key].v, at = v => solve(parts, { vc: { ...vc, [key]: v }, dt: tiny }).parts[key].I;
    const i0 = at(0), i1 = at(1), G = i0 - i1;                      // current into the capacitor falls by G per volt
    if (!(Math.abs(G) > 1e-12)) return { R: Infinity, end: vc[key] || 0, tau: Infinity };
    const R = 1 / G - tiny / C, end = i0 / G;                      // remove the conductance C/tiny of the step itself
    return { R: Math.max(0, R), end, tau: Math.max(0, R) * C };
  }

  root.Network = { COLS, ROWS, R0, RB, SHORT, P_FULL, KINDS, EDGES, BY_KEY, EXAMPLES, example, clean, labels, solve, step, thevenin, DT };
})(typeof window !== 'undefined' ? window : globalThis);
