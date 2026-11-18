// Minesweeper rules without DOM (window.Minesweeper; loaded by index.html and by the tests via node:vm).
//
// A game is a plain object that can be stored as JSON:
//   { rows, cols, mines,            board size and number of mines
//     mine: null | [0/1 …],         mine per cell (row by row); null until the first cell is opened,
//                                   so the first tap never hits a mine (its neighbours stay free as well, if possible)
//     open: [0/1 …], flag: [0/1 …], opened and flagged cells
//     status: 'ready' | 'playing' | 'won' | 'lost',
//     hit: -1 | index }             the mine that ended a lost game
// Every function that changes the game returns the list of cells it opened (or [] for nothing).
(function (root) {
  'use strict';

  const LEVELS = {
    easy: { rows: 9, cols: 8, mines: 10 },
    medium: { rows: 13, cols: 10, mines: 22 },
    hard: { rows: 16, cols: 12, mines: 38 },
  };

  function create(rows, cols, mines) {
    if (!(Number.isInteger(rows) && Number.isInteger(cols) && rows >= 2 && cols >= 2)) throw new Error('size');
    if (!(Number.isInteger(mines) && mines >= 1 && mines <= rows * cols - 1)) throw new Error('mines');
    const n = rows * cols;
    return { rows, cols, mines, mine: null, open: new Array(n).fill(0), flag: new Array(n).fill(0), status: 'ready', hit: -1 };
  }

  function neighbours(g, i) {
    const r = Math.floor(i / g.cols), c = i % g.cols, out = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < g.rows && cc >= 0 && cc < g.cols) out.push(rr * g.cols + cc);
    }
    return out;
  }

  // Mines around a cell
  const count = (g, i) => neighbours(g, i).reduce((s, j) => s + g.mine[j], 0);

  // Places the mines at random, keeping `safe` free – and its neighbours too while there is room
  function layMines(g, safe, rnd = Math.random) {
    const n = g.rows * g.cols;
    const keep = new Set([safe]);
    const around = neighbours(g, safe);
    if (n - 1 - around.length >= g.mines) for (const j of around) keep.add(j);
    const pool = [];
    for (let i = 0; i < n; i++) if (!keep.has(i)) pool.push(i);
    // Partial Fisher–Yates: the first `mines` entries of the pool become mines
    for (let k = 0; k < g.mines; k++) {
      const j = k + Math.floor(rnd() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
    }
    g.mine = new Array(n).fill(0);
    for (let k = 0; k < g.mines; k++) g.mine[pool[k]] = 1;
  }

  const isOver = g => g.status === 'won' || g.status === 'lost';

  function checkWin(g) {
    const n = g.rows * g.cols;
    let opened = 0;
    for (let i = 0; i < n; i++) opened += g.open[i];
    if (opened === n - g.mines) {
      g.status = 'won';
      // Every remaining cell is a mine: flag them all
      for (let i = 0; i < n; i++) if (g.mine[i]) g.flag[i] = 1;
    }
  }

  // Opens a cell; an empty cell (0 mines around) opens its whole area. Returns the opened cells.
  function reveal(g, i, rnd) {
    if (isOver(g) || g.open[i] || g.flag[i]) return [];
    if (!g.mine) { layMines(g, i, rnd); g.status = 'playing'; }
    if (g.mine[i]) {
      g.open[i] = 1; g.hit = i; g.status = 'lost';
      return [i];
    }
    const opened = [], stack = [i];
    while (stack.length) {
      const j = stack.pop();
      if (g.open[j] || g.flag[j]) continue;
      g.open[j] = 1; opened.push(j);
      if (count(g, j) === 0) for (const k of neighbours(g, j)) if (!g.open[k] && !g.flag[k]) stack.push(k);
    }
    checkWin(g);
    return opened;
  }

  // Tap on an open number whose flags around it are complete: opens all other neighbours ("chord").
  function chord(g, i) {
    if (isOver(g) || !g.open[i] || !g.mine) return [];
    const nb = neighbours(g, i);
    const flags = nb.reduce((s, j) => s + g.flag[j], 0);
    if (!flags || flags !== count(g, i)) return [];
    const opened = [];
    for (const j of nb) {
      if (g.open[j] || g.flag[j]) continue;
      opened.push(...reveal(g, j));
      if (isOver(g)) break;
    }
    return opened;
  }

  function toggleFlag(g, i) {
    if (isOver(g) || g.open[i]) return false;
    g.flag[i] = g.flag[i] ? 0 : 1;
    return true;
  }

  const flags = g => g.flag.reduce((s, f) => s + f, 0);

  // What a player may see of a cell: 'hidden', 'flag', 0–8 or – once the game is over – 'mine', 'hit', 'wrong-flag'
  function view(g, i) {
    const over = isOver(g);
    if (g.open[i]) return g.mine[i] ? 'hit' : count(g, i);
    if (g.flag[i]) return over && g.status === 'lost' && !g.mine[i] ? 'wrong-flag' : 'flag';
    if (over && g.status === 'lost' && g.mine[i]) return 'mine';
    return 'hidden';
  }

  // Restores a stored game; anything inconsistent gives null
  function restore(s) {
    if (!s || typeof s !== 'object') return null;
    let g;
    try { g = create(s.rows, s.cols, s.mines); } catch { return null; }
    const n = g.rows * g.cols;
    const bits = a => Array.isArray(a) && a.length === n && a.every(v => v === 0 || v === 1);
    if (!bits(s.open) || !bits(s.flag)) return null;
    if (s.mine !== null && !(bits(s.mine) && s.mine.reduce((x, v) => x + v, 0) === g.mines)) return null;
    if (!['ready', 'playing', 'won', 'lost'].includes(s.status)) return null;
    if ((s.mine === null) !== (s.status === 'ready')) return null;
    g.mine = s.mine && s.mine.slice(); g.open = s.open.slice(); g.flag = s.flag.slice(); g.status = s.status;
    g.hit = Number.isInteger(s.hit) && s.hit >= 0 && s.hit < n ? s.hit : -1;
    for (let i = 0; i < n; i++) if (g.open[i] && g.flag[i]) return null;
    if (g.status === 'ready' && g.open.some(Boolean)) return null;
    return g;
  }

  root.Minesweeper = { LEVELS, create, neighbours, count, layMines, reveal, chord, toggleFlag, flags, view, restore, isOver };
})(typeof window !== 'undefined' ? window : globalThis);
