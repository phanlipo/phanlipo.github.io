// Generates laser-mirrors/levels.js: the puzzles of the app Laserspiegel (all own, made here at random).
// Run by hand: node scripts/laser-levels.mjs [seed]
// Each puzzle has exactly one solution – checked by a complete search that follows the beam
// (every piece must be touched by the beam, so a piece to add can only sit on its path).
// The puzzles are sorted by how much searching it takes to solve them. Rules: laser-mirrors/engine.js
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from './lib.mjs';

const ctx = {};
vm.runInNewContext(readFileSync(join(ROOT, 'laser-mirrors/engine.js'), 'utf8'), { globalThis: ctx, self: ctx });
const E = ctx.LaserEngine;
const { N, DX, DY, PERIOD, react } = E;

let seed = Number(process.argv[2] || 20261113) | 0;
function rnd() {   // mulberry32
  let t = (seed = (seed + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = n => Math.floor(rnd() * n);
const pick = a => a[int(a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// The box: how many of each piece there are (the laser excepted)
const BOX = { target: 5, split: 2, double: 1, check: 1, block: 1 };
// Levels: id letter, pieces on the board (without laser), pieces to add, unknown rotations,
// how many puzzles with 1, 2, 3 targets, extra weight for splitters (more beams, more targets)
const TIERS = [
  { d: 'easy', id: 'e', pieces: [2, 3], add: [1, 1], free: [0, 1], quota: [10, 0, 0], split: 0 },
  { d: 'medium', id: 'm', pieces: [3, 5], add: [1, 2], free: [1, 2], quota: [6, 4, 0], split: 1 },
  { d: 'hard', id: 'h', pieces: [4, 6], add: [2, 3], free: [1, 3], quota: [4, 5, 1], split: 2 },
  { d: 'expert', id: 'x', pieces: [5, 8], add: [3, 4], free: [2, 4], quota: [0, 6, 4], split: 3 },
  // Added later (keep it last: the tiers above then come out exactly as before): walls next to the beam
  { d: 'walls', id: 'w', pieces: [3, 6], add: [2, 3], free: [1, 2], quota: [5, 4, 1], split: 1, walls: [2, 4] },
];
const between = ([a, b]) => a + int(b - a + 1);

/** A random board: the laser, then pieces put one by one onto the beam's path */
function randomBoard(tier) {
  const want = between(tier.pieces);
  const left = { ...BOX };
  const pieces = [];
  const free = () => { const c = []; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!pieces.some(p => p.x === x && p.y === y)) c.push([x, y]); return c; };
  // Laser on the edge, shooting into the board
  for (;;) {
    const x = int(N), y = int(N), r = int(4), d = (1 + r) % 4;
    const nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
    if (!(x === 0 || y === 0 || x === N - 1 || y === N - 1)) continue;
    pieces.push({ type: 'laser', x, y, r });
    break;
  }
  let tries = 0;
  while (pieces.length - 1 < want && tries++ < 60) {
    const tr = E.trace(pieces);
    // Cells the beam crosses that are still empty
    const path = [];
    for (const [x1, y1, x2, y2] of tr.segs) {
      const steps = Math.round(Math.abs(x2 - x1) + Math.abs(y2 - y1));
      for (let k = 1; k <= steps; k++) {
        const x = Math.floor(x1 + Math.sign(x2 - x1) * k), y = Math.floor(y1 + Math.sign(y2 - y1) * k);
        if (x >= 0 && y >= 0 && x < N && y < N && !pieces.some(p => p.x === x && p.y === y)) path.push([x, y]);
      }
    }
    const types = Object.keys(left).filter(k => left[k] > 0 && k !== 'block');
    if (!path.length || !types.length) break;
    const type = pick(['target', 'target', 'target', 'double', 'split', 'check', ...Array(tier.split).fill('split')].filter(t => types.includes(t)));
    const [x, y] = pick(path);
    const p = { type, x, y, r: int(4) };
    pieces.push(p);
    const ev = E.trace(pieces);
    const ok = ev.touched.has(pieces.length - 1) && (type !== 'check' || ev.passed.has(pieces.length - 1));
    if (!ok) { pieces.pop(); continue; }
    left[type]--;
  }
  // Sometimes a blocker: anywhere
  if (left.block && rnd() < .35) { const [x, y] = pick(free()); pieces.push({ type: 'block', x, y, r: 0 }); }
  // Walls (only in their own tier): on empty squares the beam does not cross, preferably right beside it –
  // they leave the solution as it is but rule out other ways
  if (tier.walls) {
    const tr = E.trace(pieces), onPath = new Set();
    for (const [x1, y1, x2, y2] of tr.segs) {
      const steps = Math.round(Math.abs(x2 - x1) + Math.abs(y2 - y1));
      for (let k = 0; k <= steps; k++) onPath.add(`${Math.floor(x1 + Math.sign(x2 - x1) * k)},${Math.floor(y1 + Math.sign(y2 - y1) * k)}`);
    }
    const near = ([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => onPath.has(`${x + a},${y + b}`));
    const cand = free().filter(c => !onPath.has(c.join()));
    for (let n = between(tier.walls); n > 0 && cand.length; n--) {
      const pref = cand.filter(near);
      const c = pick(pref.length ? pref : cand);
      cand.splice(cand.indexOf(c), 1);
      pieces.push({ type: 'wall', x: c[0], y: c[1], r: 0 });
    }
  }
  for (const p of pieces) p.r %= PERIOD[p.type];
  return pieces;
}

function valid(pieces) {
  const tr = E.trace(pieces);
  let mirrors = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.type === 'block' || p.type === 'laser' || p.type === 'wall') continue;
    if (p.type === 'check' ? !tr.passed.has(i) : !tr.touched.has(i)) return null;
    if (p.type !== 'check') mirrors++;
  }
  if (!tr.lit.size || mirrors < 1) return null;
  return tr;
}

/** Complete search: counts the boards that solve the puzzle (stops at 2).
    fixed: [{ type, x, y, r, q (rotation unknown), must }], add: [{ type, must }], targets */
function solve(fixed, add, targets) {
  let count = 0, nodes = 0, found = null;
  const types = [];   // distinct pieces to add: { type, must, n }
  for (const a of add) {
    const t = types.find(o => o.type === a.type && !!o.must === !!a.must);
    if (t) t.n++; else types.push({ type: a.type, must: !!a.must, n: 1 });
  }
  const start = {
    grid: new Int16Array(N * N).fill(-1),   // -1 unknown, -2 empty (the beam crossed it), else piece index
    pcs: fixed.map(p => ({ ...p, r: p.q ? -1 : p.r })),
    left: types.map(t => t.n),
    beams: [],
    seen: new Uint8Array(16 * 4 * 4),
    lit: 0,
  };
  start.pcs.forEach((p, i) => { start.grid[p.y * N + p.x] = i; });
  const laser = start.pcs.findIndex(p => p.type === 'laser');
  const clone = s => ({ grid: s.grid.slice(), pcs: s.pcs.map(p => ({ ...p })), left: s.left.slice(), beams: s.beams.map(b => b.slice()), seen: s.seen.slice(), lit: s.lit });

  function enter(s, i, x, y, d) {
    const p = s.pcs[i];
    p.hit = true;
    const res = react(p.type, p.r, d);
    if (res.lit && !p.isLit) { p.isLit = true; s.lit++; }
    if (p.type === 'check' && !res.stop) p.pass = true;
    const key = i * 4 + d;
    if (s.seen[key]) return;
    s.seen[key] = 1;
    for (const o of res.out) s.beams.push([x, y, o]);
  }
  function run(s) {
    if (count > 1) return;
    nodes++;
    if (s.lit > targets) return;
    while (s.beams.length) {
      const b = s.beams[s.beams.length - 1];
      const [x0, y0, d] = b;
      const x = x0 + DX[d], y = y0 + DY[d];
      if (x < 0 || y < 0 || x >= N || y >= N) { s.beams.pop(); continue; }
      const c = y * N + x, g = s.grid[c];
      if (g === -2) { b[0] = x; b[1] = y; continue; }
      if (g === -1) {
        // Branch: the cell stays empty, or one of the pieces to add goes here (in every rotation)
        const e = clone(s);
        e.grid[c] = -2; e.beams[e.beams.length - 1] = [x, y, d];
        run(e);
        types.forEach((t, k) => {
          if (!s.left[k]) return;
          for (let r = 0; r < PERIOD[t.type]; r++) {
            const n = clone(s);
            n.left[k]--;
            n.pcs.push({ type: t.type, x, y, r, must: t.must, added: true });
            n.grid[c] = n.pcs.length - 1;
            n.beams.pop();
            enter(n, n.pcs.length - 1, x, y, d);
            run(n);
          }
        });
        return;
      }
      const p = s.pcs[g];
      if (p.r < 0) {
        for (let r = 0; r < PERIOD[p.type]; r++) {
          const n = clone(s);
          n.pcs[g].r = r; n.beams.pop();
          enter(n, g, x, y, d);
          run(n);
        }
        return;
      }
      s.beams.pop();
      enter(s, g, x, y, d);
      if (s.lit > targets) return;
    }
    // The beam has ended: check the rules
    if (s.left.some(n => n > 0) || s.lit !== targets) return;
    for (const p of s.pcs) {
      if (p.type === 'block' || p.type === 'laser' || p.type === 'wall') continue;
      if (p.type === 'check' ? !p.pass : !p.hit) return;
      if (p.must && !p.isLit) return;
    }
    count++;
    found = s.pcs;
  }
  const s0 = clone(start);
  if (start.pcs[laser].r < 0) {
    for (let r = 0; r < 4; r++) { const n = clone(s0); n.pcs[laser].r = r; n.beams.push([n.pcs[laser].x, n.pcs[laser].y, (1 + r) % 4]); run(n); }
  } else {
    s0.beams.push([s0.pcs[laser].x, s0.pcs[laser].y, (1 + s0.pcs[laser].r) % 4]);
    run(s0);
  }
  return { count, nodes, found };
}

/** Turns a solved board into a puzzle: some pieces to add, some rotations unknown, some targets marked */
function makePuzzle(tier, pieces, tr) {
  const movable = pieces.map((p, i) => i).filter(i => !['laser', 'block', 'wall'].includes(pieces[i].type));
  const nAdd = Math.min(between(tier.add), movable.length);
  const addIdx = new Set(shuffle(movable.slice()).slice(0, nAdd));
  const rest = pieces.map((p, i) => i).filter(i => !addIdx.has(i) && pieces[i].type !== 'block' && PERIOD[pieces[i].type] > 1);
  const nFree = Math.min(between(tier.free), rest.length);
  const freeIdx = new Set(shuffle(rest.slice()).slice(0, nFree));
  const fixed = [], add = [];
  pieces.forEach((p, i) => {
    const must = p.type === 'target' && tr.lit.has(i) && rnd() < .6;
    if (addIdx.has(i)) add.push({ type: p.type, must });
    else fixed.push({ type: p.type, x: p.x, y: p.y, r: p.r, q: freeIdx.has(i), must });
  });
  return { fixed, add, targets: tr.lit.size };
}

const cell = (x, y) => E.cellName(x, y);
const T = { laser: 'L', target: 'T', split: 'S', double: 'D', check: 'C', block: 'B', wall: 'W' };
function encode(id, tier, pz, sol) {
  const fl = p => (p.q ? 'q' : '') + (p.must ? 'm' : '');
  return {
    id, d: tier.d, t: pz.targets,
    p: pz.fixed.map(p => T[p.type] + cell(p.x, p.y) + p.r + fl(p)),
    a: pz.add.map(p => T[p.type] + fl(p)),
    s: sol.filter(p => p.added || p.q).map(p => T[p.type] + cell(p.x, p.y) + p.r),
  };
}

const out = [];
const seenBoards = new Set();
for (const tier of TIERS) {
  const pools = [[], [], []], want = tier.quota.map(n => n * 4);
  let attempts = 0;
  while (pools.some((p, k) => p.length < want[k]) && attempts++ < 400000) {
    const pieces = randomBoard(tier);
    const n = pieces.filter(p => p.type !== 'laser').length;
    if (n < tier.pieces[0]) continue;
    const tr = valid(pieces);
    if (!tr || tr.lit.size > 3 || pools[tr.lit.size - 1].length >= want[tr.lit.size - 1]) continue;
    const key = pieces.map(p => p.type + p.x + p.y + p.r).sort().join();
    if (seenBoards.has(key)) continue;
    const pz = makePuzzle(tier, pieces, tr);
    if (pz.add.length < tier.add[0]) continue;
    const res = solve(pz.fixed, pz.add, pz.targets);
    if (res.count !== 1) continue;
    seenBoards.add(key);
    pools[tr.lit.size - 1].push({ pz, sol: res.found, nodes: res.nodes });
  }
  // Per number of targets: spread over the pool by difficulty (the easiest quarter skipped above easy)
  const chosen = [];
  pools.forEach((pool, t) => {
    const n = tier.quota[t];
    if (!n) return;
    if (pool.length < n) throw new Error(`${tier.d}: only ${pool.length} puzzles with ${t + 1} targets found`);
    pool.sort((a, b) => a.nodes - b.nodes);
    const lo = tier.d === 'easy' ? 0 : Math.floor(pool.length * .25);
    for (let k = 0; k < n; k++) chosen.push(pool[lo + Math.floor(k * (pool.length - lo) / n)]);
  });
  // Easiest first
  chosen.sort((a, b) => a.nodes - b.nodes);
  chosen.forEach((c, k) => out.push(encode(tier.id + String(k + 1).padStart(2, '0'), tier, c.pz, c.sol)));
  console.log(`${tier.d}: ${pools.map(p => p.length).join('/')} candidates, search nodes ${chosen.map(c => c.nodes).join(' ')}`);
}

const js = `/* Laserspiegel – puzzles. Generated by scripts/laser-levels.mjs – never edit by hand.
   Each puzzle: id, d (difficulty), t (targets to light), p (pieces on the board), a (pieces to add),
   s (solution: the added pieces and the unknown rotations).
   Piece = type letter (L laser, T target/mirror, S splitter, D double mirror, C checkpoint, B blocker, W wall)
   + cell (A1–E5) + rotation (0–3) + flags (q: rotation unknown, m: must be lit). Pieces to add: letter + flags. */
(function (root) {
  'use strict';
  root.LaserLevels = ${JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n    {')};
})(typeof self !== 'undefined' ? self : globalThis);
`;
writeFileSync(join(ROOT, 'laser-mirrors/levels.js'), js);
console.log(`${out.length} puzzles written to laser-mirrors/levels.js`);
