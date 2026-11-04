/* Scoring rules of the scoreboard – no DOM, loaded by index.html (window.ScoreRules).
   A match is a list of points (0 = player/team 1, 1 = player/team 2); the score is always worked out
   from that list again. So undo = drop the last point, and a correction cannot leave a wrong state. */
(function (root) {
  'use strict';

  const SPORTS = ['football', 'tabletennis', 'tennis', 'padel'];
  const DEFAULTS = {
    football: { halfMin: 45 },
    tabletennis: { bestOf: 5 },
    tennis: { bestOf: 3, goldenPoint: false, matchTiebreak: false },
    padel: { bestOf: 3, goldenPoint: true, matchTiebreak: false },
  };
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

  function score(match) {
    const cfg = Object.assign({}, DEFAULTS[match.sport], match.cfg);
    const pts = match.pts || [], first = match.first ? 1 : 0;
    let s;
    if (match.sport === 'tabletennis') s = tableTennis(pts, cfg, first);
    else if (match.sport === 'tennis' || match.sport === 'padel') s = tennis(pts, cfg, first, match.sport);
    else s = football(pts);
    // Game, set or match point: what one more point would win
    s.ball = null;
    if (match.sport !== 'football' && s.winner == null) {
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

  root.ScoreRules = { SPORTS, DEFAULTS, BEST_OF, HALF_MIN, score, clock };
})(typeof self !== 'undefined' ? self : globalThis);
