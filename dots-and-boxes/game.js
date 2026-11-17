// Dots and boxes (Käsekästchen): rules and computer player, no DOM.
//
// Board of n×n boxes between (n+1)×(n+1) dots. Lines are numbered: first the horizontal ones
// row by row (index r*n+c, r = dot row 0..n, c = 0..n-1), then the vertical ones
// (H + r*(n+1)+c, r = 0..n-1, c = dot column 0..n), H = n*(n+1). Boxes: r*n+c.
// Players are 'a' (starts unless told otherwise) and 'b'. Whoever closes a box moves again.
(function (root) {
  'use strict';
  const SIZES = [3, 4, 5, 6];
  const cache = new Map();
  function geom(n) {
    if (cache.has(n)) return cache.get(n);
    const H = n * (n + 1), E = 2 * H, boxLines = [], lineBoxes = Array.from({ length: E }, () => []);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const b = r * n + c, l = [r * n + c, (r + 1) * n + c, H + r * (n + 1) + c, H + r * (n + 1) + c + 1];
      boxLines.push(l);
      for (const e of l) lineBoxes[e].push(b);
    }
    const g = { n, H, E, boxes: n * n, boxLines, lineBoxes };
    cache.set(n, g);
    return g;
  }
  const other = p => (p === 'a' ? 'b' : 'a');

  // Dots at both ends of a line as [column, row]
  function ends(n, e) {
    const g = geom(n);
    if (e < g.H) { const r = Math.floor(e / n), c = e % n; return [[c, r], [c + 1, r]]; }
    const k = e - g.H, r = Math.floor(k / (n + 1)), c = k % (n + 1);
    return [[c, r], [c, r + 1]];
  }
  // Line between two neighbouring dots ([column, row]), -1 if there is none
  function lineBetween(n, p, q) {
    const g = geom(n);
    const [a, b] = p[0] + p[1] <= q[0] + q[1] ? [p, q] : [q, p];
    if (a.some(v => v < 0 || v > n) || b.some(v => v < 0 || v > n)) return -1;
    if (a[1] === b[1] && b[0] === a[0] + 1) return a[1] * n + a[0];
    if (a[0] === b[0] && b[1] === a[1] + 1) return g.H + a[1] * (n + 1) + a[0];
    return -1;
  }
  // Dot names: columns A, B, C … from the left, rows 1, 2, 3 … from the top ("A1-B1")
  const dotName = ([c, r]) => String.fromCharCode(65 + c) + (r + 1);
  const lineName = (n, e) => ends(n, e).map(dotName).join('-');
  function parseLine(n, s) {
    const m = /^\s*([A-Za-z])(\d+)\s*[-–]\s*([A-Za-z])(\d+)\s*$/.exec(String(s));
    if (!m) return -1;
    const dot = (l, d) => [l.toUpperCase().charCodeAt(0) - 65, Number(d) - 1];
    return lineBetween(n, dot(m[1], m[2]), dot(m[3], m[4]));
  }

  // ---------- Positions ----------
  function start(n, starter = 'a') {
    const g = geom(n);
    return { g, lines: new Uint8Array(g.E), owner: Array(g.boxes).fill(null), turn: starter, score: { a: 0, b: 0 }, left: g.E };
  }
  const clone = p => ({ g: p.g, lines: p.lines.slice(), owner: p.owner.slice(), turn: p.turn, score: { ...p.score }, left: p.left });
  const sides = (p, b) => { let k = 0; for (const e of p.g.boxLines[b]) k += p.lines[e]; return k; };
  const free = p => { const f = []; for (let e = 0; e < p.g.E; e++) if (!p.lines[e]) f.push(e); return f; };
  const over = p => p.left === 0;
  // Draws line e for the player to move; returns the boxes it closed (then the same player moves again)
  function play(p, e) {
    if (!Number.isInteger(e) || e < 0 || e >= p.g.E) throw new Error('no_line');
    if (p.lines[e]) throw new Error('taken');
    p.lines[e] = 1; p.left--;
    const done = [];
    for (const b of p.g.lineBoxes[e]) if (sides(p, b) === 4) { p.owner[b] = p.turn; p.score[p.turn]++; done.push(b); }
    if (!done.length) p.turn = other(p.turn);
    return done;
  }
  // Replays a list of lines; stops at the first one that isn't legal. movers[i] = who drew moves[i]
  function replay(n, starter, moves) {
    const p = start(n, starter), valid = [], movers = [];
    for (const e of moves || []) {
      if (!Number.isInteger(e) || e < 0 || e >= p.g.E || p.lines[e]) break;
      movers.push(p.turn); play(p, e); valid.push(e);
    }
    return { pos: p, moves: valid, movers };
  }
  // null while playing, otherwise { winner: 'a' | 'b' | null (draw), score }
  const result = p => (over(p) ? { winner: p.score.a > p.score.b ? 'a' : p.score.b > p.score.a ? 'b' : null, score: { ...p.score } } : null);

  // ---------- Computer ----------
  const closes = (p, e) => p.g.lineBoxes[e].some(b => sides(p, b) === 3);
  // Safe: closes nothing and gives the opponent no box with three sides
  const safe = (p, e) => p.g.lineBoxes[e].every(b => sides(p, b) < 2);
  // Takes every box that can be taken in a row; returns how many and the position afterwards
  function greedy(p) {
    const q = clone(p);
    let count = 0, again = true;
    while (again) {
      again = false;
      for (let e = 0; e < q.g.E; e++) if (!q.lines[e] && closes(q, e)) { count += play(q, e).length; again = true; }
    }
    return { count, pos: q };
  }
  // Endgame without safe lines and without boxes to take: every open box has exactly two free
  // sides, so the open boxes split into chains (both ends at the edge of the board) and loops.
  // Returns [{ loop, boxes: [...], lines: [...] }] or null if the position doesn't split like that.
  function components(p) {
    const g = p.g;
    for (let b = 0; b < g.boxes; b++) if (p.owner[b] === null && 4 - sides(p, b) !== 2) return null;
    const seen = new Uint8Array(g.boxes), out = [];
    for (let s = 0; s < g.boxes; s++) {
      if (p.owner[s] !== null || seen[s]) continue;
      const boxes = [], lines = new Set(), stack = [s];
      let ground = 0;
      seen[s] = 1;
      while (stack.length) {
        const b = stack.pop();
        boxes.push(b);
        for (const e of g.boxLines[b]) {
          if (p.lines[e]) continue;
          if (!lines.has(e)) { lines.add(e); if (g.lineBoxes[e].length === 1) ground++; }
          for (const nb of g.lineBoxes[e]) if (nb !== b && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
        }
      }
      out.push({ loop: ground === 0, boxes, lines: [...lines] });
    }
    return out;
  }
  const code = c => (c.loop ? 'l' : 'c') + c.boxes.length;
  // Value for the player who has to open one of the components (boxes won minus boxes lost from
  // here on, both sides playing perfectly). After an opening the other player either takes
  // everything and has to open the next one, or takes all but 2 (chain) / 4 (loop) and leaves
  // them as a "double deal", keeping control. A chain of 1 or 2 is opened so no deal is possible.
  const memo = new Map();
  function openValue(codes) {
    if (!codes.length) return 0;
    const key = codes.join(',');
    if (memo.has(key)) return memo.get(key);
    let best = -Infinity;
    for (let i = 0; i < codes.length; i++) {
      if (i && codes[i] === codes[i - 1]) continue;
      best = Math.max(best, openOne(codes[i], openValue(codes.slice(0, i).concat(codes.slice(i + 1)))));
    }
    memo.set(key, best);
    return best;
  }
  function openOne(k, rest) {
    const s = Number(k.slice(1));
    if (k[0] === 'l') return Math.min(-s - rest, 8 - s + rest);
    if (s <= 2) return -s - rest;
    return Math.min(-s - rest, 4 - s + rest);
  }
  const valueOf = comps => openValue(comps.map(code).sort());
  const pick = (list, rnd) => list[Math.floor(rnd() * list.length)];
  // Lines that give the opponent the fewest boxes
  function leastGift(p, lines, rnd) {
    let best = Infinity, list = [];
    for (const e of lines) {
      const q = clone(p); play(q, e);
      const k = greedy(q).count;
      if (k < best) { best = k; list = [e]; } else if (k === best) list.push(e);
    }
    return pick(list, rnd);
  }
  const endgame = q => !free(q).some(e => safe(q, e)) && components(q);

  // easy: takes boxes, otherwise any line; medium: takes boxes, otherwise a safe line, otherwise the
  // smallest gift; hard: like medium, but in the endgame counts chains and loops: opens the one that
  // costs least and keeps control with a double deal when that wins more.
  function cpuMove(p, level, rnd = Math.random) {
    const all = free(p);
    if (!all.length) throw new Error('board full');
    const caps = all.filter(e => closes(p, e));
    if (level === 'easy') return pick(caps.length ? caps : all, rnd);
    if (level === 'hard' && caps.length) return hardCapture(p, all, caps, rnd);
    if (caps.length) return pick(caps, rnd);
    const safeLines = all.filter(e => safe(p, e));
    if (safeLines.length) return pick(safeLines, rnd);
    if (level === 'hard') {
      const comps = components(p);
      if (comps) return openLine(p, comps, rnd);
    }
    return leastGift(p, all, rnd);
  }
  function hardCapture(p, all, caps, rnd) {
    const g = greedy(p);
    const comps = !over(g.pos) && endgame(g.pos);
    if (comps && g.count <= 4) {
      // Take everything and open the next component – or leave the rest as a deal?
      const takeAll = g.count + valueOf(comps);
      let deal = null, dealValue = takeAll;
      for (const e of all) {
        if (closes(p, e)) continue;
        const q = clone(p); play(q, e);
        const o = greedy(q);
        if (o.count !== g.count || over(o.pos)) continue;
        const oc = endgame(o.pos);
        if (!oc) continue;
        const v = -o.count - valueOf(oc);
        if (v > dealValue) { dealValue = v; deal = e; }
      }
      if (deal !== null) return deal;
    }
    // Take single boxes first, chains from their end, so a deal stays possible
    const single = caps.filter(e => { const q = clone(p); play(q, e); return !p.g.lineBoxes[e].some(b => q.owner[b] === null && sides(q, b) === 3); });
    return pick(single.length ? single : caps, rnd);
  }
  function openLine(p, comps, rnd) {
    const rest = comps.map(code).sort();
    let best = -Infinity, choice = null;
    for (const c of comps) {
      const k = code(c), i = rest.indexOf(k);
      const v = openOne(k, openValue(rest.slice(0, i).concat(rest.slice(i + 1))));
      if (v > best || (v === best && c.boxes.length < choice.boxes.length)) { best = v; choice = c; }
    }
    const g = p.g;
    if (!choice.loop && choice.boxes.length === 2) {
      // The line between the two boxes: two single boxes, no deal possible
      const mid = choice.lines.find(e => g.lineBoxes[e].length === 2);
      if (mid !== undefined) return mid;
    }
    // A chain from its end (a line at the edge of the board), a loop anywhere
    const edge = choice.lines.filter(e => g.lineBoxes[e].length === 1);
    return pick(edge.length ? edge : choice.lines, rnd);
  }

  root.DotsBoxes = { SIZES, geom, other, ends, lineBetween, lineName, dotName, parseLine, start, clone, sides, free, over, play, replay, result,
    closes, safe, greedy, components, openValue, cpuMove };
})(typeof window !== 'undefined' ? window : globalThis);
