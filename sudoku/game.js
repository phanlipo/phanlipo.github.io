// Sudoku rules, solver and puzzle generator (no DOM). A grid is an array of 81 numbers, row by row from the
// top left, 0 for an empty cell. Puzzles are stored as 81-character strings ("0" = empty).
// Every generated puzzle has exactly one solution. Difficulty:
//   easy   – about 40 givens, solvable with singles only (one possible digit in a cell, or one place in a unit)
//   medium – about 32 givens, still solvable with singles
//   hard   – as few givens as the random order allows (often 22–27), needs more than singles
(function (root) {
  'use strict';
  const ROW = [], COL = [], BOX = [], PEERS = [], UNITS = [];
  for (let i = 0; i < 81; i++) {
    ROW[i] = (i / 9) | 0; COL[i] = i % 9; BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0);
  }
  for (let i = 0; i < 81; i++) {
    const p = [];
    for (let j = 0; j < 81; j++) if (j !== i && (ROW[j] === ROW[i] || COL[j] === COL[i] || BOX[j] === BOX[i])) p.push(j);
    PEERS[i] = p;
  }
  // 27 units: 9 rows, 9 columns, 9 boxes
  for (let u = 0; u < 9; u++) {
    UNITS.push([...Array(9)].map((_, k) => u * 9 + k));
    UNITS.push([...Array(9)].map((_, k) => k * 9 + u));
    UNITS.push([...Array(9)].map((_, k) => (((u / 3) | 0) * 3 + ((k / 3) | 0)) * 9 + (u % 3) * 3 + (k % 3)));
  }
  const ALL = 0x3fe; // bits 1..9
  const bits = m => { const out = []; for (let d = 1; d <= 9; d++) if (m & (1 << d)) out.push(d); return out; };
  const count = m => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

  // Small seeded random number generator (mulberry32): the same seed gives the same puzzle
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, rnd) {
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list;
  }

  // Candidates of cell i as a bit mask (bit d set = digit d possible)
  function candidates(g, i) {
    let used = 0;
    for (const j of PEERS[i]) if (g[j]) used |= 1 << g[j];
    return ALL & ~used;
  }

  // Counts solutions up to `limit` (backtracking, cell with the fewest candidates first).
  // Returns { count, solution } – solution is the first one found, or null. Duplicate givens → count 0.
  function solve(grid, limit = 2, rnd = null) {
    const g = grid.slice(), r = Array(9).fill(0), c = Array(9).fill(0), b = Array(9).fill(0);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) continue;
      const m = 1 << v;
      if ((r[ROW[i]] | c[COL[i]] | b[BOX[i]]) & m) return { count: 0, solution: null };
      r[ROW[i]] |= m; c[COL[i]] |= m; b[BOX[i]] |= m;
    }
    let found = 0, solution = null;
    (function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = ALL & ~(r[ROW[i]] | c[COL[i]] | b[BOX[i]]), n = count(m);
        if (n === 0) return;
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n === 1) break; }
      }
      if (best < 0) { found++; if (!solution) solution = g.slice(); return; }
      const ds = bits(bestMask);
      if (rnd) shuffle(ds, rnd);
      for (const d of ds) {
        const m = 1 << d;
        g[best] = d; r[ROW[best]] |= m; c[COL[best]] |= m; b[BOX[best]] |= m;
        rec();
        g[best] = 0; r[ROW[best]] &= ~m; c[COL[best]] &= ~m; b[BOX[best]] &= ~m;
        if (found >= limit) return;
      }
    })();
    return { count: found, solution };
  }

  // Fills what singles alone can fill: a cell with one candidate, or a digit with one place in a unit.
  // Returns the grid it reached (complete if singles are enough).
  function solveSingles(grid) {
    const g = grid.slice();
    let progress = true;
    while (progress) {
      progress = false;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const m = candidates(g, i);
        if (count(m) === 1) { g[i] = bits(m)[0]; progress = true; }
      }
      for (const unit of UNITS) {
        for (let d = 1; d <= 9; d++) {
          let place = -1, n = 0;
          for (const i of unit) {
            if (g[i] === d) { n = -1; break; }
            if (!g[i] && candidates(g, i) & (1 << d)) { place = i; n++; }
          }
          if (n === 1) { g[place] = d; progress = true; }
        }
      }
    }
    return g;
  }
  const singlesEnough = grid => solveSingles(grid).every(Boolean);

  const LEVELS = ['easy', 'medium', 'hard'];
  const TARGET = { easy: 40, medium: 32, hard: 17 };

  // A new puzzle for a level and a seed: { puzzle, solution } as 81-character strings.
  // "hard" tries further (derived) seeds until singles are not enough – about one in three is too easy.
  function generate(level, seed) {
    if (!LEVELS.includes(level)) throw new Error('unknown level');
    if (level !== 'hard') return dig(level, seed);
    let p;
    for (let k = 0; k < 20; k++) {
      p = dig(level, (seed + k * 7919) >>> 0);
      if (!singlesEnough(p.puzzle.split('').map(Number))) break;
    }
    return p;
  }
  function dig(level, seed) {
    const rnd = rng(seed);
    const solution = solve(Array(81).fill(0), 1, rnd).solution;
    const puzzle = solution.slice();
    let givens = 81;
    for (const i of shuffle([...Array(81).keys()], rnd)) {
      if (givens <= TARGET[level]) break;
      const v = puzzle[i];
      puzzle[i] = 0;
      const ok = solve(puzzle, 2).count === 1 && (level === 'hard' || singlesEnough(puzzle));
      if (ok) givens--; else puzzle[i] = v;
    }
    return { puzzle: puzzle.join(''), solution: solution.join('') };
  }

  // Cells whose digit appears again in the same row, column or box
  function conflicts(g) {
    const out = [];
    for (let i = 0; i < 81; i++) if (g[i] && PEERS[i].some(j => g[j] === g[i])) out.push(i);
    return out;
  }
  // True for an 81-digit grid without zeros that breaks no rule
  const isComplete = g => g.length === 81 && g.every(v => v >= 1 && v <= 9) && !conflicts(g).length;

  const parse = s => (typeof s === 'string' && /^[0-9]{81}$/.test(s) ? [...s].map(Number) : null);

  root.Sudoku = { ROW, COL, BOX, PEERS, UNITS, LEVELS, rng, bits, count, candidates, solve, solveSingles, singlesEnough, generate, conflicts, isComplete, parse };
})(typeof window !== 'undefined' ? window : globalThis);
