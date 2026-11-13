/* Laserspiegel – rules and beam tracing, window.LaserEngine. No DOM here: the page, the level generator
   (scripts/laser-levels.mjs) and the tests use the same rules. Architecture: laser-mirrors/README.md

   Board: 5 × 5 cells, x = column 0–4 (A–E), y = row 0–4 (1–5, top to bottom).
   Directions: 0 = up (north), 1 = right (east), 2 = down (south), 3 = left (west).
   A piece is { type, x, y, r }: r = quarter turns clockwise from its base orientation (0–3).
   Base orientations (r = 0):
     laser   shoots right
     target  mirror on the diagonal from top left to bottom right, mirror side towards top right;
             the target sits on the left side, the bottom side swallows the beam
     split   half mirror on the same diagonal: lets the beam through and reflects a second one
     double  mirror on both sides of the same diagonal
     check   gate open from left to right (blocks beams travelling up or down)
     block   lets every beam pass, only takes up the cell
     wall    stops every beam (need not be hit) */
(function (root) {
  'use strict';
  const N = 5;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
  const TYPES = ['laser', 'target', 'split', 'double', 'check', 'block', 'wall'];
  // Rotations that look and act differently (split/double/check repeat after half a turn)
  const PERIOD = { laser: 4, target: 4, split: 2, double: 2, check: 2, block: 1, wall: 1 };
  const BACKSLASH = d => 3 - d;   // mirror "\": right ↔ down, left ↔ up

  /** What a piece does with a beam travelling in direction d (world directions).
      Returns { out: [directions], lit, stop } */
  function react(type, r, d) {
    const l = (d - r + 4) % 4;               // direction in the piece's own frame
    const w = x => (x + r) % 4;              // back to the world
    switch (type) {
      case 'laser': return { out: [], stop: true };
      case 'target':
        if (l === 2 || l === 3) return { out: [w(BACKSLASH(l))] };   // mirror side
        if (l === 1) return { out: [], lit: true };                  // beam travelling right hits the target on the left
        return { out: [], stop: true };                              // bottom side
      case 'split': return { out: [d, w(BACKSLASH(l))] };
      case 'double': return { out: [w(BACKSLASH(l))] };
      case 'check': return l === 1 || l === 3 ? { out: [d] } : { out: [], stop: true };
      case 'wall': return { out: [], stop: true };
      default: return { out: [d] };          // block
    }
  }

  /** Follows the laser beam. pieces: [{ type, x, y, r }] (the first laser shoots).
      Returns { segs: [[x1, y1, x2, y2, end]], touched: Set, passed: Set, lit: Set } with indexes into pieces.
      Coordinates in cells, cell centres at .5; end: 'edge', 'lit' (target), 'stop' (blocked), '' (piece). */
  function trace(pieces) {
    const grid = new Array(N * N).fill(-1);
    pieces.forEach((p, i) => { if (onBoard(p.x, p.y)) grid[p.y * N + p.x] = i; });
    const touched = new Set(), passed = new Set(), lit = new Set(), segs = [];
    const li = pieces.findIndex(p => p.type === 'laser' && onBoard(p.x, p.y));
    if (li < 0) return { segs, touched, passed, lit };
    const seen = new Set();
    const queue = [[pieces[li].x, pieces[li].y, (1 + pieces[li].r) % 4]];
    while (queue.length) {
      const [sx, sy, d] = queue.shift();
      let x = sx, y = sy;
      for (;;) {
        x += DX[d]; y += DY[d];
        if (!onBoard(x, y)) {
          segs.push([sx + .5, sy + .5, x + .5 - DX[d] * .5, y + .5 - DY[d] * .5, 'edge']);
          break;
        }
        const i = grid[y * N + x];
        if (i < 0) continue;
        const p = pieces[i], key = i * 4 + d;
        touched.add(i);
        const res = react(p.type, p.r, d);
        if (res.lit) lit.add(i);
        if (p.type === 'check' && !res.stop) passed.add(i);
        const face = res.lit || res.stop;
        // A beam that hits a side ends at that side; otherwise it reaches the centre
        segs.push([sx + .5, sy + .5, x + .5 - (face ? DX[d] * .36 : 0), y + .5 - (face ? DY[d] * .36 : 0),
          res.lit ? 'lit' : res.stop ? 'stop' : '']);
        if (!seen.has(key)) {
          seen.add(key);
          for (const o of res.out) queue.push([x, y, o]);
        }
        break;
      }
    }
    return { segs, touched, passed, lit };
  }
  const onBoard = (x, y) => x >= 0 && y >= 0 && x < N && y < N;

  /** Checks the rules: the right number of targets lit, every piece on the board touched by the beam
      (the blocker excepted, a checkpoint passed through), every target marked "must" lit, no piece left
      over (trayLeft). Walls need not be hit. Returns { solved, lit, issues: [{ k, … }], trace } */
  function evaluate(pieces, targets, trayLeft) {
    const tr = trace(pieces);
    const issues = [];
    if (trayLeft > 0) issues.push({ k: 'tray', n: trayLeft });
    pieces.forEach((p, i) => {
      if (p.type === 'block' || p.type === 'laser' || p.type === 'wall') return;
      if (p.type === 'check' ? !tr.passed.has(i) : !tr.touched.has(i)) issues.push({ k: p.type === 'check' ? 'check' : 'untouched', i });
    });
    pieces.forEach((p, i) => { if (p.must && !tr.lit.has(i)) issues.push({ k: 'must', i }); });
    if (tr.lit.size !== targets) issues.unshift({ k: 'count', lit: tr.lit.size, targets });
    return { solved: issues.length === 0, lit: tr.lit.size, issues, trace: tr };
  }

  const cellName = (x, y) => 'ABCDE'[x] + (y + 1);
  function parseCell(s) {
    const m = /^([A-Ea-e])([1-5])$/.exec(String(s || '').trim());
    return m ? { x: m[1].toUpperCase().charCodeAt(0) - 65, y: Number(m[2]) - 1 } : null;
  }

  root.LaserEngine = { N, DX, DY, TYPES, PERIOD, react, trace, evaluate, cellName, parseCell };
})(typeof self !== 'undefined' ? self : globalThis);
