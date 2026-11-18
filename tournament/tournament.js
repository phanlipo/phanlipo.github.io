/* Tournament – rules without DOM: drawing teams, schedules (round robin, home and away, knockout),
   results and the table. The page (index.html) only renders what these functions return.
   Architecture and data format: tournament/README.md */
(function () {
  'use strict';
  const MODES = ['rr', 'rr2', 'ko'];

  /* ---------- Random: seeded, so the same seed always gives the same teams ---------- */
  function newSeed() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 1; }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(list, seed) {
    const out = list.slice(), r = rng(seed);
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
  }

  /* ---------- Teams ----------
     size people per team; if it does not add up, the first teams get one person more.
     seed null = keep the order as entered. */
  function makeTeams(players, size, seed) {
    const order = seed == null ? players.slice() : shuffle(players, seed);
    const count = Math.floor(order.length / size);
    if (!count) return order.length ? [{ members: order }] : [];
    const teams = Array.from({ length: count }, (_, i) => ({ members: order.slice(i * size, i * size + size) }));
    order.slice(count * size).forEach((p, i) => teams[i % count].members.push(p));
    return teams;
  }
  /** "Anna", "Anna & Ben", "Anna, Ben & Cem" */
  function teamName(team) {
    const m = team.members;
    return m.length < 2 ? (m[0] || '') : m.slice(0, -1).join(', ') + ' & ' + m[m.length - 1];
  }

  /* ---------- Schedules (depend only on mode and number of teams) ---------- */
  // Circle method: one team stays, the others rotate; with an odd number one team sits out per round
  function roundRobin(n, twice) {
    const ids = Array.from({ length: n }, (_, i) => i);
    if (n % 2) ids.push(null);
    const m = ids.length, rounds = m - 1, games = [], byes = new Map();
    let no = 0;
    const legs = [];
    for (let r = 0; r < rounds; r++) {
      const pairs = [];
      for (let i = 0; i < m / 2; i++) {
        let x = ids[i], y = ids[m - 1 - i];
        if (x == null || y == null) { byes.set(r + 1, [x == null ? y : x]); continue; }
        if (i === 0 && r % 2) [x, y] = [y, x];   // the fixed team alternates between first and second
        pairs.push([x, y]);
      }
      legs.push(pairs);
      ids.splice(1, 0, ids.pop());
    }
    legs.forEach((pairs, r) => pairs.forEach(([a, b]) => games.push({ no: ++no, round: r + 1, a, b })));
    if (twice) {
      legs.forEach((pairs, r) => pairs.forEach(([a, b]) => games.push({ no: ++no, round: rounds + r + 1, a: b, b: a })));
      for (const [r, t] of [...byes]) byes.set(r + rounds, t);
    }
    return { games, byes, rounds: twice ? 2 * rounds : rounds };
  }
  // Seed order of a bracket of size p: 1 meets p, the two best seeds can only meet in the final
  function seedOrder(p) {
    let order = [1];
    while (order.length < p) {
      const k = order.length * 2;
      order = order.flatMap(s => [s, k + 1 - s]);
    }
    return order;
  }
  // Knockout: byes (smallest power of two ≥ n) only in round 1, never two byes against each other
  function knockout(n) {
    let p = 1;
    while (p < n) p *= 2;
    const order = seedOrder(p), games = [], byes = new Map([[1, []]]);
    let no = 0, prev = [];
    for (let s = 0; s < p / 2; s++) {
      const x = order[2 * s] - 1, y = order[2 * s + 1] - 1;
      if (y >= n) { byes.get(1).push(x); prev.push({ team: x }); continue; }
      const g = { no: ++no, round: 1, a: x, b: y };
      games.push(g); prev.push({ game: g.no });
    }
    let round = 1;
    while (prev.length > 1) {
      round++;
      const next = [];
      for (let s = 0; s < prev.length; s += 2) {
        const A = prev[s], B = prev[s + 1];
        const g = { no: ++no, round, a: A.team ?? null, b: B.team ?? null, fromA: A.game ?? null, fromB: B.game ?? null };
        games.push(g); next.push({ game: g.no });
      }
      prev = next;
    }
    return { games, byes, rounds: round };
  }
  const cache = new Map();
  function schedule(mode, n) {
    const key = mode + n;
    if (!cache.has(key)) cache.set(key, mode === 'ko' ? knockout(n) : roundRobin(n, mode === 'rr2'));
    return cache.get(key);
  }
  function stats(mode, n) {
    const s = schedule(mode, n);
    return { games: s.games.length, rounds: s.rounds };
  }

  /* ---------- A tournament ----------
     { v: 1, mode, teams: [{ members }], results: { "<match no>": [scoreA, scoreB] }, created, view } */
  function create(mode, teams, seed) {
    return { v: 1, mode, teams: teams.map(t => ({ members: t.members.slice() })), results: {}, seed: seed ?? null, created: Date.now() };
  }
  function valid(c) {
    return !!c && typeof c === 'object' && MODES.includes(c.mode) && Array.isArray(c.teams) && c.teams.length >= 2 && c.teams.length <= 64 &&
      c.teams.every(t => t && Array.isArray(t.members) && t.members.length && t.members.every(m => typeof m === 'string')) &&
      !!c.results && typeof c.results === 'object' && !Array.isArray(c.results) &&
      Object.values(c.results).every(r => Array.isArray(r) && r.length === 2 && r.every(x => Number.isInteger(x) && x >= 0 && x <= 999));
  }
  const winnerOf = g => !g.score || g.score[0] === g.score[1] ? null : g.score[0] > g.score[1] ? g.a : g.b;
  /** All matches in order with the teams known so far (knockout: winners move on) and their scores */
  function games(c) {
    const won = new Map();
    return schedule(c.mode, c.teams.length).games.map(s => {
      const g = { no: s.no, round: s.round, a: s.a, b: s.b, fromA: s.fromA ?? null, fromB: s.fromB ?? null };
      if (g.fromA != null) g.a = won.get(g.fromA) ?? null;
      if (g.fromB != null) g.b = won.get(g.fromB) ?? null;
      const r = c.results[g.no];
      g.score = r && g.a != null && g.b != null ? r.slice() : null;
      won.set(g.no, winnerOf(g));
      return g;
    });
  }
  const sitsOut = (c, round) => schedule(c.mode, c.teams.length).byes.get(round) || [];
  const koRounds = c => schedule(c.mode, c.teams.length).rounds;
  // Knockout: matches that depend on match no (directly or further down the bracket)
  function dependents(c, no) {
    const out = [], todo = [no];
    const list = schedule(c.mode, c.teams.length).games;
    while (todo.length) {
      const n = todo.pop();
      for (const g of list) if (g.fromA === n || g.fromB === n) { out.push(g.no); todo.push(g.no); }
    }
    return out.sort((a, b) => a - b);
  }
  function resetDependents(c, no) {
    const reset = [];
    for (const d of dependents(c, no)) if (c.results[d]) { delete c.results[d]; reset.push(d); }
    return reset;
  }
  /** Enters a score; knockout: no draws, and a changed winner resets the later matches of that branch */
  function setResult(c, no, a, b) {
    const g = games(c).find(x => x.no === no);
    if (!g || g.a == null || g.b == null) return { error: 'noMatch' };
    if (c.mode === 'ko' && a === b) return { error: 'noDraw' };
    const before = winnerOf(g);
    c.results[no] = [a, b];
    const reset = c.mode === 'ko' && g.score && before !== winnerOf({ a: g.a, b: g.b, score: [a, b] }) ? resetDependents(c, no) : [];
    return { reset };
  }
  function clearResult(c, no) {
    delete c.results[no];
    return c.mode === 'ko' ? resetDependents(c, no) : [];
  }
  /** Table (round robin): 3 points a win, 1 a draw; then goal difference, goals scored, draw order */
  function standings(c) {
    const rows = c.teams.map((_, i) => ({ team: i, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0 }));
    for (const g of games(c)) {
      if (!g.score) continue;
      const [x, y] = g.score, A = rows[g.a], B = rows[g.b];
      A.played++; B.played++; A.gf += x; A.ga += y; B.gf += y; B.ga += x;
      if (x > y) { A.won++; B.lost++; A.points += 3; } else if (y > x) { B.won++; A.lost++; B.points += 3; } else { A.drawn++; B.drawn++; A.points++; B.points++; }
    }
    const cmp = (p, q) => q.points - p.points || (q.gf - q.ga) - (p.gf - p.ga) || q.gf - p.gf;
    rows.sort((p, q) => cmp(p, q) || p.team - q.team);
    rows.forEach((r, i) => { r.place = i && !cmp(rows[i - 1], r) ? rows[i - 1].place : i + 1; });
    return rows;
  }
  /** Winner once decided: the knockout final, or the round robin leader when every match is played (alone on top) */
  function champion(c) {
    const list = games(c);
    if (c.mode === 'ko') return winnerOf(list[list.length - 1]);
    if (list.some(g => !g.score)) return null;
    const s = standings(c);
    return s.length > 1 && s[1].place === 1 ? null : s[0].team;
  }

  window.Tournament = { newSeed, shuffle, makeTeams, teamName, stats, create, valid, games, sitsOut, koRounds, setResult, clearResult, standings, champion, dependents };
})();
