/* Scoring rules of the scoreboard – no DOM, loaded by index.html (window.ScoreRules).
   A match is a list of points (0 = player/team 1, 1 = player/team 2); the score is always worked out
   from that list again. So undo = drop the last point, and a correction cannot leave a wrong state.
   Darts: the list holds the score of each visit (3 darts) instead, -1 = bust; whose turn it is follows from the order
   (2 to 6 players in turn, cfg.players). */
(function (root) {
  'use strict';

  const SPORTS = ['football', 'tabletennis', 'tennis', 'padel', 'darts'];
  const DEFAULTS = {
    football: { halfMin: 45 },
    tabletennis: { bestOf: 5 },
    tennis: { bestOf: 3, goldenPoint: false, matchTiebreak: false },
    padel: { bestOf: 3, goldenPoint: true, matchTiebreak: false },
    darts: { start: 501, doubleOut: true, legs: 3, players: 2 },
  };
  const DART_START = [301, 501, 701];
  const DART_LEGS = [1, 2, 3, 5];
  const DART_PLAYERS = [2, 3, 4, 5, 6];
  const dartPlayers = cfg => (DART_PLAYERS.includes(cfg && cfg.players) ? cfg.players : 2);
  const BEST_OF = { tabletennis: [3, 5, 7], tennis: [3, 5], padel: [3, 5] };
  const HALF_MIN = [5, 10, 15, 20, 25, 30, 35, 40, 45];

  const other = p => 1 - p;

  /* ---------- Table tennis: games to 11 (win by 2), serve changes every 2 points, from 10:10 every point ---------- */
  function tableTennis(pts, cfg, first) {
    const need = Math.floor(cfg.bestOf / 2) + 1, to = 11;
    const sets = [0, 0], done = [];
    let cur = [0, 0], winner = null;
    for (const p of pts) {
      if (winner != null) break;
      cur[p]++;
      if (Math.max(cur[0], cur[1]) >= to && Math.abs(cur[0] - cur[1]) >= 2) {
        const w = cur[0] > cur[1] ? 0 : 1;
        sets[w]++; done.push(cur); cur = [0, 0];
        if (sets[w] === need) winner = w;
      }
    }
    // The first server of each game alternates; within a game every 2 points, from 10:10 every point
    const game = done.length, gameFirst = game % 2 ? other(first) : first, n = cur[0] + cur[1];
    const swap = n < 2 * (to - 1) ? Math.floor(n / 2) % 2 : (n - (to - 1)) % 2;
    const deciding = sets[0] === need - 1 && sets[1] === need - 1;
    return {
      sport: 'tabletennis', points: cur.map(String), raw: cur, sets, games: null, done: done.map(g => ({ games: g })),
      server: winner != null ? null : (swap ? other(gameFirst) : gameFirst), winner, game: game + 1, need,
      deuce: winner == null && cur[0] >= to - 1 && cur[0] === cur[1],
      // Deciding game: players change ends when the first reaches 5 (shown right after that point)
      changeEnds: winner == null && deciding && n > 0 && cur[pts[pts.length - 1]] === 5 && cur[other(pts[pts.length - 1])] < 5,
    };
  }

  /* ---------- Tennis and padel: 15-30-40, games, sets to 6 with tiebreak at 6:6 ---------- */
  const LABELS = ['0', '15', '30', '40'];
  function tennis(pts, cfg, first, sport) {
    const need = Math.floor(cfg.bestOf / 2) + 1;
    const sets = [0, 0], done = [];
    let games = [0, 0], pt = [0, 0], winner = null, server = first, tb = false, mtb = false, tbFirst = first, total = 0;
    const deciding = () => sets[0] === need - 1 && sets[1] === need - 1;
    const startTiebreak = match => { tb = true; mtb = match; tbFirst = server; };
    for (const p of pts) {
      if (winner != null) break;
      pt[p]++;
      let gameWon = false;
      if (tb) {
        const to = mtb ? 10 : 7;
        gameWon = pt[p] >= to && pt[p] - pt[other(p)] >= 2;
      } else {
        // Golden point (no advantage): at 40:40 the next point wins the game
        gameWon = pt[p] >= 4 && (cfg.goldenPoint || pt[p] - pt[other(p)] >= 2);
      }
      if (!gameWon) continue;
      total++;
      let setWon = false, entry = null;
      if (tb) {
        // Who served first in the tiebreak receives first in the next set
        server = other(tbFirst);
        if (mtb) entry = { games: [pt[0], pt[1]], matchTiebreak: true };
        else { games[p]++; entry = { games: games.slice(), tiebreak: [pt[0], pt[1]] }; }
        setWon = true;
      } else {
        games[p]++; server = other(server);
        if (games[p] >= 6 && games[p] - games[other(p)] >= 2) { setWon = true; entry = { games: games.slice() }; }
        else if (games[0] === 6 && games[1] === 6) startTiebreak(false);
      }
      pt = [0, 0];
      if (setWon) {
        tb = mtb = false;
        sets[p]++; done.push(entry); games = [0, 0];
        if (sets[p] === need) winner = p;
        else if (cfg.matchTiebreak && deciding()) startTiebreak(true);
      }
    }
    let points, current = server;
    if (tb) {
      points = pt.map(String);
      const n = pt[0] + pt[1];
      current = n && Math.floor((n - 1) / 2) % 2 === 0 ? other(tbFirst) : tbFirst;
    } else if (pt[0] >= 3 && pt[1] >= 3) {
      points = pt[0] === pt[1] ? ['40', '40'] : pt.map((v, i) => (v > pt[other(i)] ? 'AD' : '40'));
    } else points = pt.map(v => LABELS[v]);
    return {
      sport, points, raw: pt, sets, games, done, server: winner != null ? null : current, winner, need,
      tiebreak: tb && !mtb, matchTiebreak: mtb, set: done.length + 1,
      deuce: !tb && winner == null && pt[0] >= 3 && pt[0] === pt[1],
      goldenPoint: !!cfg.goldenPoint && !tb && winner == null && pt[0] === 3 && pt[1] === 3,
      // Players change ends after every odd game of the match (a tiebreak counts as one) and every 6 points of a tiebreak
      changeEnds: winner == null && (pt[0] + pt[1] ? tb && (pt[0] + pt[1]) % 6 === 0 : total % 2 === 1),
    };
  }

  /* ---------- Football: goals; the clock is kept by the page ---------- */
  function football(pts) {
    const goals = [0, 0];
    for (const p of pts) goals[p]++;
    return { sport: 'football', points: goals.map(String), raw: goals, winner: null, server: null };
  }

  /* ---------- Darts: count down from 301/501/701, legs, optional double out ---------- */
  // Scores 3 darts cannot make (largest is 180)
  const NO_VISIT = [163, 166, 169, 172, 173, 175, 176, 178, 179];
  const validVisit = v => Number.isInteger(v) && v >= 0 && v <= 180 && !NO_VISIT.includes(v);
  // Single darts for checkout routes: finishing doubles in the usual order of preference, then the rest
  const D = n => ({ v: n * 2, l: 'D' + n }), T = n => ({ v: n * 3, l: 'T' + n }), S = n => ({ v: n, l: String(n) });
  const range = (a, b) => { const r = []; for (let i = a; i >= b; i--) r.push(i); return r; };
  const FINISH = [20, 16, 18, 12, 10, 8, 4, 2, 1, 19, 17, 15, 14, 13, 11, 9, 7, 6, 5, 3].map(D).concat({ v: 50, l: 'Bull' });
  const ONE = n => (n >= 1 && n <= 20 ? S(n) : n === 25 ? { v: 25, l: '25' } : n % 3 === 0 && n <= 60 ? T(n / 3)
    : n % 2 === 0 && n <= 40 ? D(n / 2) : n === 50 ? { v: 50, l: 'Bull' } : null);
  const FIRST = range(20, 1).map(T).concat({ v: 50, l: 'Bull' }, { v: 25, l: '25' }, range(20, 1).map(S));
  // Shortest way to finish on a double (or bull) with up to 3 darts, e.g. 170 → T20 T20 Bull; null if there is none
  function checkout(n) {
    if (n < 2 || n > 170) return null;
    // Two darts: a single, treble or bull to set up the double first, a double as set-up only if nothing else works
    const two = r => {
      for (const d of FINISH) if (r === d.v) return [d.l];
      for (const setupDouble of [false, true]) {
        for (const d of FINISH) {
          const o = r > d.v ? ONE(r - d.v) : null;
          if (o && (setupDouble || !/^D/.test(o.l))) return [o.l, d.l];
        }
      }
      return null;
    };
    const r2 = two(n);
    if (r2) return r2;
    for (const f of FIRST) {
      const r = n - f.v, t = r >= 2 ? two(r) : null;
      if (t) return [f.l].concat(t);
    }
    return null;
  }
  // Players throw in turn; each leg is started by the next player (with 2: the other one)
  function darts(visits, cfg, first) {
    const n = dartPlayers(cfg), need = cfg.legs, start = cfg.start, legs = Array(n).fill(0), done = [];
    const stats = Array.from({ length: n }, () => ({ scored: 0, visits: 0, last: null }));
    first = first >= 0 && first < n ? first : 0;
    let rem = Array(n).fill(start), leg = 0, turn = first, winner = null, lastBust = false;
    for (const v of visits) {
      if (winner != null) break;
      const r = rem[turn] - v;
      // Bust: below zero, left on 1 or reaching zero without a possible double finish – the score stays
      const bust = v < 0 || r < 0 || (cfg.doubleOut && (r === 1 || (r === 0 && !checkout(rem[turn]))));
      const st = stats[turn];
      st.visits++; st.last = bust ? -1 : v; lastBust = bust;
      if (!bust) { st.scored += v; rem[turn] = r; }
      if (!bust && r === 0) {
        legs[turn]++; done.push({ games: legs.slice(), winner: turn, rest: rem.slice() });
        if (legs[turn] === need) { winner = turn; break; }
        leg++; rem = Array(n).fill(start); turn = (first + leg) % n;
      } else turn = (turn + 1) % n;
    }
    return {
      sport: 'darts', players: n, points: rem.map(String), raw: rem, sets: legs, games: null, done, need, leg: leg + 1,
      server: winner != null ? null : turn, winner, bust: lastBust && winner == null,
      average: stats.map(x => (x.visits ? x.scored / x.visits : 0)), last: stats.map(x => x.last),
      checkout: winner == null && cfg.doubleOut ? checkout(rem[turn]) : null,
    };
  }

  function score(match) {
    const cfg = Object.assign({}, DEFAULTS[match.sport], match.cfg);
    const pts = match.pts || [], first = match.sport === 'darts' ? (Number.isInteger(match.first) ? match.first : 0) : match.first ? 1 : 0;
    let s;
    if (match.sport === 'tabletennis') s = tableTennis(pts, cfg, first);
    else if (match.sport === 'tennis' || match.sport === 'padel') s = tennis(pts, cfg, first, match.sport);
    else if (match.sport === 'darts') s = darts(pts, cfg, first);
    else s = football(pts);
    // Game, set or match point: what one more point would win
    s.ball = null;
    if (match.sport !== 'football' && match.sport !== 'darts' && s.winner == null) {
      for (const p of [0, 1]) {
        const next = score.raw(Object.assign({}, match, { pts: pts.concat(p) }));
        if (next.winner === p) s.ball = { p, kind: 'match' };
        else if (next.sets[p] > s.sets[p]) s.ball = { p, kind: 'set' };
        if (s.ball) break;
      }
    }
    return s;
  }
  // Without the point lookahead (used by score itself)
  score.raw = match => {
    const cfg = Object.assign({}, DEFAULTS[match.sport], match.cfg), first = match.first ? 1 : 0;
    return match.sport === 'tabletennis' ? tableTennis(match.pts, cfg, first) : tennis(match.pts, cfg, first, match.sport);
  };

  /* ---------- Football clock: running time of the current half, shown like on TV (45:00 +2:13) ---------- */
  function clock(ms, half, halfMin) {
    const sec = Math.max(0, Math.floor(ms / 1000)), len = halfMin * 60, base = (half - 1) * len;
    const mmss = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    if (sec <= len) return { main: mmss(base + sec), extra: '', over: sec >= len, minute: Math.floor((base + sec) / 60) + 1 };
    const add = sec - len;
    return { main: mmss(base + len), extra: '+' + Math.floor(add / 60) + ':' + String(add % 60).padStart(2, '0'), over: true,
      minute: halfMin * half, plus: Math.floor(add / 60) + 1 };
  }

  root.ScoreRules = { SPORTS, DEFAULTS, BEST_OF, HALF_MIN, DART_START, DART_LEGS, DART_PLAYERS, dartPlayers, validVisit, checkout, score, clock };
})(typeof self !== 'undefined' ? self : globalThis);
