// Tic Tac Toe rules and computer player (no DOM). Board: array of 9 entries, 'x', 'o' or null,
// row by row from the top left.
(function (root) {
  'use strict';
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const empty = () => Array(9).fill(null);
  const other = p => (p === 'x' ? 'o' : 'x');
  const free = b => b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);

  // null while playing, { winner, line } on a win, { winner: null, line: null } on a draw
  function result(b) {
    for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { winner: b[l[0]], line: l };
    return b.every(Boolean) ? { winner: null, line: null } : null;
  }

  // Minimax value for `me` with `p` to move: +10-depth win, -10+depth loss, 0 draw
  function value(b, p, me, depth) {
    const r = result(b);
    if (r) return r.winner === me ? 10 - depth : r.winner ? depth - 10 : 0;
    let best = p === me ? -Infinity : Infinity;
    for (const i of free(b)) {
      b[i] = p;
      const v = value(b, other(p), me, depth + 1);
      b[i] = null;
      best = p === me ? Math.max(best, v) : Math.min(best, v);
    }
    return best;
  }
  function bestMoves(b, p) {
    let best = -Infinity, list = [];
    for (const i of free(b)) {
      const c = b.slice(); c[i] = p;
      const v = value(c, other(p), p, 1);
      if (v > best) { best = v; list = [i]; } else if (v === best) list.push(i);
    }
    return list;
  }
  const winningMove = (b, p) => free(b).find(i => { const c = b.slice(); c[i] = p; return result(c)?.winner === p; });
  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];

  // easy: takes an immediate win, otherwise random; medium: wins, blocks, otherwise random;
  // hard: a perfect move (never loses), random among equally good ones
  function cpuMove(b, p, level, rnd = Math.random) {
    const moves = free(b);
    if (!moves.length) throw new Error('board full');
    if (level === 'hard') return pick(bestMoves(b, p), rnd);
    const win = winningMove(b, p);
    if (win !== undefined) return win;
    if (level === 'medium') {
      const block = winningMove(b, other(p));
      if (block !== undefined) return block;
    }
    return pick(moves, rnd);
  }

  root.TicTacToe = { LINES, empty, other, free, result, cpuMove, bestMoves };
})(typeof window !== 'undefined' ? window : globalThis);
