// Four in a row: rules and computer player (no DOM).
// Board: array of 42 entries, 'r' (red), 'y' (yellow) or null, row by row from the top left
// (index = row * 7 + column, row 0 at the top). Discs fall to the lowest free cell of a column.
(function (root) {
  'use strict';
  const COLS = 7, ROWS = 6, N = 4;
  const empty = () => Array(COLS * ROWS).fill(null);
  const other = p => (p === 'r' ? 'y' : 'r');
  const at = (r, c) => r * COLS + c;

  // Every line of four cells (horizontal, vertical, both diagonals)
  const LINES = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
      const er = r + dr * (N - 1), ec = c + dc * (N - 1);
      if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
      LINES.push([0, 1, 2, 3].map(k => at(r + dr * k, c + dc * k)));
    }
  }
  // Lines through each cell, for checking only around the last disc
  const LINES_AT = Array.from({ length: COLS * ROWS }, () => []);
  for (const l of LINES) for (const i of l) LINES_AT[i].push(l);

  // Row the next disc lands in, or -1 if the column is full
  function dropRow(b, c) {
    for (let r = ROWS - 1; r >= 0; r--) if (!b[at(r, c)]) return r;
    return -1;
  }
  const free = b => [0, 1, 2, 3, 4, 5, 6].filter(c => !b[c]);

  // Drops a disc into a copy of the board; returns { board, index } or null if the column is full
  function drop(b, c, p) {
    const r = dropRow(b, c);
    if (r < 0) return null;
    const n = b.slice(); n[at(r, c)] = p;
    return { board: n, index: at(r, c) };
  }

  // null while playing, { winner, line } on a win, { winner: null, line: null } on a draw
  function result(b) {
    for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]] && b[l[0]] === b[l[3]]) return { winner: b[l[0]], line: l };
    return b.every(Boolean) ? { winner: null, line: null } : null;
  }
  const winsAt = (b, i) => LINES_AT[i].some(l => l.every(j => b[j] === b[i]));

  // ---------- Computer ----------
  // The search works on a typed copy (0 empty, 1 = player to move at the root, 2 = opponent)
  // with the height of each column, so it is fast enough on a phone.
  const ORDER = [3, 2, 4, 1, 5, 0, 6]; // centre first: better pruning, better play
  const WIN = 1e6;
  const FLAT = Int8Array.from(LINES.flat());
  const AT = LINES_AT.map(ls => Int8Array.from(ls.flat()));

  function wins(g, i) {
    const v = g[i], l = AT[i];
    for (let k = 0; k < l.length; k += 4) if (g[l[k]] === v && g[l[k + 1]] === v && g[l[k + 2]] === v && g[l[k + 3]] === v) return true;
    return false;
  }
  // Static value for `me` (1 or 2): open lines of two and three, discs in the centre column
  function evaluate(g, me) {
    let s = 0;
    for (let r = 0; r < ROWS; r++) { const v = g[r * COLS + 3]; if (v) s += v === me ? 3 : -3; }
    for (let k = 0; k < FLAT.length; k += 4) {
      let m = 0, o = 0;
      for (let j = k; j < k + 4; j++) { const v = g[FLAT[j]]; if (v === me) m++; else if (v) o++; }
      if (m && o) continue;
      if (m === 3) s += 5; else if (m === 2) s += 2;
      else if (o === 3) s -= 5; else if (o === 2) s -= 2;
    }
    return s;
  }
  // Negamax with alpha-beta; g and h are changed in place and restored
  function negamax(g, h, p, depth, alpha, beta, ply) {
    if (depth === 0) return evaluate(g, p);
    let any = false;
    for (let k = 0; k < 7; k++) {
      const c = ORDER[k];
      if (h[c] < 0) continue;
      any = true;
      const i = h[c] * COLS + c;
      g[i] = p; h[c]--;
      const v = wins(g, i) ? WIN - ply : -negamax(g, h, 3 - p, depth - 1, -beta, -alpha, ply + 1);
      g[i] = 0; h[c]++;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return any ? alpha : 0; // full board: draw
  }
  function typed(b, p) {
    const g = new Int8Array(COLS * ROWS);
    b.forEach((v, i) => { if (v) g[i] = v === p ? 1 : 2; });
    return { g, h: Int8Array.from({ length: COLS }, (_, c) => dropRow(b, c)) };
  }
  // Value of one column for p after searching `depth` plies (bounded by alpha/beta)
  function scoreCol(g, h, c, depth, alpha, beta) {
    const i = h[c] * COLS + c;
    g[i] = 1; h[c]--;
    const v = wins(g, i) ? WIN : -negamax(g, h, 2, depth - 1, -beta, -alpha, 1);
    g[i] = 0; h[c]++;
    return v;
  }
  // Exact value of every free column for p (higher = better)
  function scoreMoves(b, p, depth = 7) {
    const { g, h } = typed(b, p);
    return ORDER.filter(c => h[c] >= 0).map(c => ({ col: c, value: scoreCol(g, h, c, depth, -Infinity, Infinity) }));
  }
  // All columns with the best value: one full search, then a null-window test per other column
  function bestMoves(b, p, depth = 7) {
    const { g, h } = typed(b, p);
    const cols = ORDER.filter(c => h[c] >= 0);
    let best = -Infinity, list = [];
    for (const c of cols) {
      const v = scoreCol(g, h, c, depth, best === -Infinity ? -Infinity : best - 1, Infinity);
      if (v > best) { best = v; list = [c]; } else if (v === best) list.push(c);
    }
    return list;
  }

  const winningCol = (b, p) => free(b).find(c => { const d = drop(b, c, p); return winsAt(d.board, d.index); });
  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

  // easy: takes an immediate win, otherwise random;
  // medium: wins, blocks, avoids handing over a win right above, prefers the centre;
  // hard: searches 7 plies ahead, random among equally good columns
  function cpuMove(b, p, level, rnd = Math.random) {
    const cols = free(b);
    if (!cols.length) throw new Error('board full');
    if (level === 'hard') return pick(bestMoves(b, p, 7), rnd);
    const win = winningCol(b, p);
    if (win !== undefined) return win;
    if (level === 'easy') return pick(cols, rnd);
    const block = winningCol(b, other(p));
    if (block !== undefined) return block;
    const safe = cols.filter(c => winningCol(drop(b, c, p).board, other(p)) === undefined);
    const list = safe.length ? safe : cols;
    // Weighted towards the centre: weights 1 2 3 4 3 2 1
    const weights = list.map(c => 4 - Math.abs(3 - c));
    let x = rnd() * weights.reduce((a, z) => a + z, 0);
    for (let k = 0; k < list.length; k++) { x -= weights[k]; if (x < 0) return list[k]; }
    return list[list.length - 1];
  }

  root.FourInARow = { COLS, ROWS, LINES, empty, other, at, dropRow, drop, free, result, cpuMove, bestMoves, scoreMoves };
})(typeof window !== 'undefined' ? window : globalThis);
