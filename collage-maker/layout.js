/* Collage layouts – pure logic without DOM (see README.md in this folder).

   Every layout fills a rectangle completely: no gaps and – before fitting to a fixed aspect ratio – no
   cropping either. Cells are returned in fractions of the collage: x, y, w, h in 0 … 1.

   CollageLayout.rng(seed)                          seeded random numbers in [0, 1) (mulberry32)
   CollageLayout.search(ids, aspect, target, seed)  best slicing tree for these images → tree
   CollageLayout.refit(tree, aspect, target)        flips cut directions only (images stay in place) → tree
   CollageLayout.geometry(tree, aspect)             { A, cells: [{ id, x, y, w, h }] }
   CollageLayout.rows(ids, aspect, target, cols)    justified rows (or columns), order kept → { A, cells }
   CollageLayout.removeLeaf(tree, id) / swapLeaves(tree, a, b) / leaves(tree) / validTree(tree, ids)
   CollageLayout.score(A, areas, target)            lower is better

   aspect(id) = width / height of the image; target = wanted width / height or null (free: anything
   between 2:3 and 3:2 is fine). A tree is a leaf { id } or a node { d: 'h' | 'v', a, b }:
   'h' puts a and b side by side (same height), 'v' stacks them (same width). The aspect ratio of a node
   follows from its children: h → A = Aa + Ab, v → 1/A = 1/Aa + 1/Ab – any tree tiles its rectangle exactly. */
(function (root) {
  'use strict';

  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A wrong aspect ratio costs crop when the collage is fitted to the target – weighted much higher than
  // uneven cell sizes, but below 0.3 % (invisible crop) only a little, so the sizes can even out.
  const W_ASPECT = 2000, TOL = 0.003;
  const FREE = Math.log(1.5);
  function aspectPenalty(A, target) {
    const d = target ? Math.abs(Math.log(A / target)) : Math.max(0, Math.abs(Math.log(A)) - FREE);
    const h = Math.max(0, d - TOL);
    return h * h + d * d / 100;
  }
  // areas: share of each cell in the whole collage (sum 1)
  function score(A, areas, target) {
    const n = areas.length;
    let s = 0;
    for (const a of areas) { const l = Math.log(a * n); s += l * l; }
    return W_ASPECT * aspectPenalty(A, target) + s / n;
  }

  const isLeaf = n => n.d === undefined;
  function leaves(node, out = []) {
    if (isLeaf(node)) out.push(node.id); else { leaves(node.a, out); leaves(node.b, out); }
    return out;
  }
  function inner(node, out = []) {
    if (!isLeaf(node)) { out.push(node); inner(node.a, out); inner(node.b, out); }
    return out;
  }
  function leafNodes(node, out = []) {
    if (isLeaf(node)) out.push(node); else { leafNodes(node.a, out); leafNodes(node.b, out); }
    return out;
  }
  // Aspect ratio of every node, stored on the node (A)
  function measure(node, aspect) {
    if (isLeaf(node)) return (node.A = aspect(node.id));
    const a = measure(node.a, aspect), b = measure(node.b, aspect);
    return (node.A = node.d === 'h' ? a + b : 1 / (1 / a + 1 / b));
  }
  // Share of the area of each leaf, after measure()
  function areas(node, share, out) {
    if (isLeaf(node)) { out.push(share); return out; }
    const fa = node.d === 'h' ? node.a.A / node.A : node.A / node.a.A;
    areas(node.a, share * fa, out); areas(node.b, share * (1 - fa), out);
    return out;
  }
  function treeScore(tree, aspect, target) {
    const A = measure(tree, aspect);
    return score(A, areas(tree, 1, []), target);
  }

  // Start from a balanced design: cut the region across its longer side, half of the images on each side,
  // so every image gets about the same area if its shape fits its place (the climbing then fixes shapes)
  function build(ids, R, r) {
    const n = ids.length;
    if (n === 1) return { id: ids[0] };
    const k = n % 2 && r() < 0.5 ? Math.ceil(n / 2) : Math.floor(n / 2);
    const d = R > 1.05 ? 'h' : R < 0.95 ? 'v' : (r() < 0.5 ? 'h' : 'v');
    const [Ra, Rb] = d === 'h' ? [R * k / n, R * (n - k) / n] : [R * n / k, R * n / (n - k)];
    return { d, a: build(ids.slice(0, k), Ra, r), b: build(ids.slice(k), Rb, r) };
  }
  function randomTree(ids, r) {
    const n = ids.length;
    if (n === 1) return { id: ids[0] };
    const k = 1 + Math.floor(r() * (n - 1));
    return { d: r() < 0.5 ? 'h' : 'v', a: randomTree(ids.slice(0, k), r), b: randomTree(ids.slice(k), r) };
  }
  const clone = node => isLeaf(node) ? { id: node.id } : { d: node.d, a: clone(node.a), b: clone(node.b) };
  const strip = node => isLeaf(node) ? { id: node.id } : { d: node.d, a: strip(node.a), b: strip(node.b) };

  // Hill climbing: flip one cut or (allowSwap) swap two images; keep the change if it is not worse
  function climb(tree, aspect, target, r, steps, allowSwap) {
    const nodes = inner(tree), lv = leafNodes(tree);
    let best = treeScore(tree, aspect, target);
    for (let s = 0; s < steps && nodes.length; s++) {
      if (allowSwap && lv.length > 2 && r() < 0.5) {
        const p = lv[Math.floor(r() * lv.length)], q = lv[Math.floor(r() * lv.length)];
        if (p === q) continue;
        [p.id, q.id] = [q.id, p.id];
        const sc = treeScore(tree, aspect, target);
        if (sc <= best) best = sc; else [p.id, q.id] = [q.id, p.id];
      } else {
        const nd = nodes[Math.floor(r() * nodes.length)];
        nd.d = nd.d === 'h' ? 'v' : 'h';
        const sc = treeScore(tree, aspect, target);
        if (sc <= best) best = sc; else nd.d = nd.d === 'h' ? 'v' : 'h';
      }
    }
    // Finally every cut once more, until nothing improves
    for (let changed = true, rounds = 0; changed && rounds < 20; rounds++) {
      changed = false;
      for (const nd of nodes) {
        nd.d = nd.d === 'h' ? 'v' : 'h';
        const sc = treeScore(tree, aspect, target);
        if (sc < best - 1e-12) { best = sc; changed = true; } else nd.d = nd.d === 'h' ? 'v' : 'h';
      }
    }
    return best;
  }

  // Every slicing tree over a few images (children unordered: mirroring changes neither shape nor sizes)
  function* allTrees(ids) {
    if (ids.length === 1) { yield { id: ids[0] }; return; }
    const [first, ...rest] = ids, m = rest.length;
    for (let mask = 0; mask < (1 << m); mask++) {
      const a = [first], b = [];
      rest.forEach((id, i) => (mask >> i & 1 ? a : b).push(id));
      if (!b.length) continue;
      const tb = [...allTrees(b)];
      for (const ta of allTrees(a)) for (const t of tb) for (const d of ['h', 'v']) yield { d, a: ta, b: t };
    }
  }
  // Random left/right and top/bottom order – the same sizes, another picture
  function mirror(node, r) {
    if (isLeaf(node)) return { id: node.id };
    const a = mirror(node.a, r), b = mirror(node.b, r);
    return r() < 0.5 ? { d: node.d, a, b } : { d: node.d, a: b, b: a };
  }

  function search(ids, aspect, target, seed) {
    if (!ids.length) return null;
    if (ids.length === 1) return { id: ids[0] };
    const r = rng(seed * 7919 + ids.length);
    const n = ids.length;
    // Few images: try all trees, then pick by seed among the (nearly) best ones
    if (n <= 6) {
      const found = [];
      for (const t of allTrees(ids)) found.push({ t: strip(t), sc: treeScore(t, aspect, target) });
      found.sort((p, q) => p.sc - q.sc);
      const good = found.filter(f => f.sc <= found[0].sc + 0.02).slice(0, 12);
      return mirror(good[Math.floor(r() * good.length)].t, r);
    }
    // Middle counts have the fewest good trees – more starting points there (each run takes a few ms)
    const steps = Math.min(4000, 200 + 40 * n), restarts = n <= 12 ? 48 : n <= 30 ? 16 : 8;
    let best = null, bestScore = Infinity;
    for (let i = 0; i < restarts; i++) {
      const order = ids.slice();
      for (let j = order.length - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [order[j], order[k]] = [order[k], order[j]]; }
      // Images sorted by shape, so similar shapes start next to each other in every other run
      if (i % 2) order.sort((p, q) => aspect(p) - aspect(q));
      const tree = i % 3 === 2 ? randomTree(order, r) : build(order, target || 1, r);
      const sc = climb(tree, aspect, target, r, steps, true);
      if (sc < bestScore) { bestScore = sc; best = tree; }
    }
    return mirror(strip(best), r);
  }

  // After a swap or a removal: keep every image where it is, only choose the cut directions anew
  function refit(tree, aspect, target) {
    if (!tree) return null;
    const t = clone(tree);
    climb(t, aspect, target, rng(leaves(t).length), 0, false);
    return strip(t);
  }

  function geometry(tree, aspect) {
    const A = measure(tree, aspect), cells = [];
    (function place(node, x, y, w, h) {
      if (isLeaf(node)) { cells.push({ id: node.id, x, y, w, h }); return; }
      if (node.d === 'h') {
        const wa = w * node.a.A / node.A;
        place(node.a, x, y, wa, h); place(node.b, x + wa, y, w - wa, h);
      } else {
        const ha = h * node.A / node.a.A;
        place(node.a, x, y, w, ha); place(node.b, x, y + ha, w, h - ha);
      }
    })(tree, 0, 0, 1, 1);
    return { A, cells };
  }

  function removeLeaf(node, id) {
    if (isLeaf(node)) return node.id === id ? null : { id: node.id };
    const a = removeLeaf(node.a, id), b = removeLeaf(node.b, id);
    if (!a) return b;
    if (!b) return a;
    return { d: node.d, a, b };
  }
  function swapLeaves(node, p, q) {
    if (isLeaf(node)) return { id: node.id === p ? q : node.id === q ? p : node.id };
    return { d: node.d, a: swapLeaves(node.a, p, q), b: swapLeaves(node.b, p, q) };
  }
  // A stored tree fits the images: every id exactly once, nothing else
  function validTree(tree, ids) {
    try {
      const ok = n => n && typeof n === 'object' && (n.d === undefined ? typeof n.id === 'string' : (n.d === 'h' || n.d === 'v') && ok(n.a) && ok(n.b));
      if (!ok(tree)) return false;
      const l = leaves(tree);
      return l.length === ids.length && new Set(l).size === l.length && l.every(id => ids.includes(id));
    } catch (_) { return false; }
  }

  // Images in order into k rows with sums of aspect ratios as even as possible (dynamic programming)
  function partition(a, k) {
    const n = a.length, pre = [0];
    for (const x of a) pre.push(pre[pre.length - 1] + x);
    const mean = pre[n] / k;
    const cost = (i, j) => { const d = pre[j] - pre[i] - mean; return d * d; };
    let prev = new Array(n + 1).fill(Infinity); prev[0] = 0;
    const cut = [];
    for (let r = 1; r <= k; r++) {
      const cur = new Array(n + 1).fill(Infinity), from = new Array(n + 1).fill(0);
      for (let j = r; j <= n - (k - r); j++) {
        for (let i = r - 1; i < j; i++) {
          if (prev[i] === Infinity) continue;
          const c = prev[i] + cost(i, j);
          if (c < cur[j]) { cur[j] = c; from[j] = i; }
        }
      }
      cut.push(from); prev = cur;
    }
    const bounds = [n];
    for (let r = k - 1, j = n; r >= 0; r--) { j = cut[r][j]; bounds.unshift(j); }
    return bounds;   // k + 1 indices: row r holds a[bounds[r] … bounds[r+1])
  }

  // Justified rows: each row fills the full width, its height follows from its images. cols = the same
  // turned by 90° (columns of equal width). The number of rows is chosen for the best score.
  function rows(ids, aspect, target, cols) {
    if (!ids.length) return null;
    const asp = id => cols ? 1 / aspect(id) : aspect(id);
    const tgt = target ? (cols ? 1 / target : target) : null;
    const a = ids.map(asp), n = ids.length;
    let best = null;
    for (let k = 1; k <= Math.min(n, 40); k++) {
      const b = partition(a, k);
      if (b.some((v, i) => i && v <= b[i - 1])) continue;
      const sums = [];
      for (let r = 0; r < k; r++) { let s = 0; for (let i = b[r]; i < b[r + 1]; i++) s += a[i]; sums.push(s); }
      const H = sums.reduce((s, x) => s + 1 / x, 0), A = 1 / H;   // width 1, row height 1 / sum
      const cells = [];
      let y = 0;
      for (let r = 0; r < k; r++) {
        const h = 1 / sums[r];
        let x = 0;
        for (let i = b[r]; i < b[r + 1]; i++) {
          const w = a[i] * h;
          cells.push({ id: ids[i], x, y: y / H, w, h: h / H });
          x += w;
        }
        y += h;
      }
      const sc = score(A, cells.map(c => c.w * c.h), tgt);
      if (!best || sc < best.sc) best = { sc, A, cells };
    }
    if (!cols) return { A: best.A, cells: best.cells };
    return { A: 1 / best.A, cells: best.cells.map(c => ({ id: c.id, x: c.y, y: c.x, w: c.h, h: c.w })) };
  }

  root.CollageLayout = { rng, search, refit, geometry, rows, removeLeaf, swapLeaves, leaves, validTree, score };
})(typeof window !== 'undefined' ? window : globalThis);
