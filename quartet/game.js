/* Quartett (Supertrumpf rules) – window.Quartet. No DOM here: the rules can be tested on their own.
   The state is plain JSON and lives only on the host (or the single device against the computer).
   Architecture: quartet/README.md */
(function () {
  'use strict';
  const LENGTHS = { short: 25, normal: 60, long: 500 };   // rounds until the one with most cards wins

  /* ---------- Random numbers: seeded and kept in the state (st.rs), like card-games ---------- */
  function next(st) {
    // mulberry32
    let t = (st.rs = (st.rs + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (st, n) => Math.floor(next(st) * n);
  function shuffle(st, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = int(st, i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const seed = () => {
    try { return crypto.getRandomValues(new Uint32Array(1))[0] | 0; } catch (_) { return (Math.random() * 2 ** 32) | 0; }
  };

  /* ---------- Decks ---------- */
  const decks = () => window.QuartetDecks || [];
  const deck = id => decks().find(d => d.id === id) || null;
  /** Does a beat b in category k? 1 = yes, 0 = equal, -1 = no */
  function cmp(d, k, a, b) {
    const x = d.cards[a].v[k], y = d.cards[b].v[k];
    if (x === y) return 0;
    return (d.cats[k].low ? x < y : x > y) ? 1 : -1;
  }

  /* ---------- Game ----------
     st = { deck, n, rs, piles: [[card index, … top first], …], pot: [], turn, phase: 'choose' | 'shown',
            round, max, last: { by, k, cards: [{ s, c }], win (seat or -1 = tie) } | null, over: null | { winners, why } } */
  function setup(deckId, n, rs, length) {
    const d = deck(deckId);
    if (!d) throw new Error('unknown deck');
    if (!(n >= 2 && n <= 6)) throw new Error('2 to 6 players');
    const st = { deck: deckId, n, rs: rs | 0, piles: [], pot: [], turn: 0, phase: 'choose', round: 0,
      max: LENGTHS[length] || LENGTHS.normal, last: null, over: null };
    for (let s = 0; s < n; s++) st.piles.push([]);
    const order = shuffle(st, d.cards.map((_, i) => i));
    order.forEach((c, i) => st.piles[i % n].push(c));
    st.turn = int(st, n);
    return st;
  }
  const alive = st => st.piles.map((p, s) => (p.length ? s : -1)).filter(s => s >= 0);

  function moves(st, seat) {
    if (!st || st.over) return [];
    if (st.phase === 'choose') {
      if (seat !== st.turn) return [];
      return deck(st.deck).cats.map((_, k) => ({ a: 'pick', k }));
    }
    return seat >= 0 && seat < st.n ? [{ a: 'next' }] : [];
  }
  /** Legal = equal to one of moves() (the host checks every move it gets) */
  function legal(st, seat, m) {
    if (!m || typeof m !== 'object') return false;
    return moves(st, seat).some(x => x.a === m.a && (x.k === undefined ? Object.keys(m).length === 1 : x.k === m.k && Object.keys(m).length === 2));
  }

  function apply(st, seat, m) {
    const d = deck(st.deck);
    if (m.a === 'next') {
      st.phase = 'choose';
      // The chooser ran out of cards (after a tie): the next player with cards chooses
      if (!st.piles[st.turn].length) {
        for (let k = 1; k <= st.n; k++) { const s = (st.turn + k) % st.n; if (st.piles[s].length) { st.turn = s; break; } }
      }
      return;
    }
    // pick: everyone with cards shows the top card
    const k = m.k, played = alive(st).map(s => ({ s, c: st.piles[s].shift() }));
    let best = [played[0]];
    for (const p of played.slice(1)) {
      const r = cmp(d, k, p.c, best[0].c);
      if (r > 0) best = [p]; else if (r === 0) best.push(p);
    }
    st.round++;
    st.phase = 'shown';
    if (best.length === 1) {
      // Winner takes everything: own card first, then the others in seat order, then the pot
      const w = best[0].s, pile = st.piles[w];
      pile.push(best[0].c, ...played.filter(p => p.s !== w).map(p => p.c), ...st.pot);
      st.pot = [];
      st.turn = w;
      st.last = { by: seat, k, cards: played, win: w };
    } else {
      // Tie: all cards go to the pot, the same player chooses again
      st.pot.push(...played.map(p => p.c));
      st.last = { by: seat, k, cards: played, win: -1, tied: best.map(p => p.s) };
    }
    const left = alive(st);
    if (left.length <= 1) st.over = { winners: left.length ? left : st.last.tied || [], why: left.length ? 'all' : 'tie' };
    else if (st.round >= st.max) {
      const most = Math.max(...st.piles.map(p => p.length));
      st.over = { winners: st.piles.map((p, s) => (p.length === most ? s : -1)).filter(s => s >= 0), why: 'rounds' };
    }
  }
  const result = st => st.over;

  /** What one seat may see: the own top card, card counts, the last comparison – never others' hidden cards */
  function view(st, seat) {
    const d = deck(st.deck), card = c => Object.assign({ i: c }, d.cards[c]);
    const own = st.piles[seat] || [];
    return {
      deck: { id: d.id, emoji: d.emoji, de: d.de, en: d.en, cats: d.cats, groups: d.groups, size: d.cards.length },
      n: st.n, counts: st.piles.map(p => p.length), pot: st.pot.length, turn: st.turn, phase: st.phase,
      round: st.round, max: st.max, top: own.length ? card(own[0]) : null,
      last: st.last ? Object.assign({}, st.last, { cards: st.last.cards.map(p => ({ s: p.s, c: card(p.c) })) }) : null,
      over: st.over,
    };
  }

  /** How strong a card is in category k: share of the deck it beats (ties count half), 0…1 */
  function strength(d, c, k) {
    let score = 0;
    for (let o = 0; o < d.cards.length; o++) if (o !== c) score += (cmp(d, k, c, o) + 1) / 2;
    return score / Math.max(1, d.cards.length - 1);
  }
  /** Computer: easy = any category, normal = strongest with a little doubt, hard = strongest */
  function bot(st, seat, level) {
    const ms = moves(st, seat);
    if (!ms.length || ms[0].a !== 'pick') return null;
    const d = deck(st.deck), c = st.piles[seat][0];
    if (level === 'easy') return ms[int(st, ms.length)];
    let best = ms[0], bestScore = -1;
    for (const m of ms) {
      const sc = strength(d, c, m.k) + (level === 'hard' ? 0 : next(st) * 0.25);
      if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return best;
  }

  /** Text of a value: fraction as in the source, years without grouping, otherwise up to d decimals */
  function fmtValue(cat, card, k, locale) {
    if (card.s && card.s[k]) return card.s[k].replace('-', '−');
    const v = card.v[k];
    if (cat.y) return String(v);
    return v.toLocaleString(locale, { maximumFractionDigits: cat.d || 0 });
  }

  window.Quartet = { LENGTHS, next, int, shuffle, seed, decks, deck, cmp, setup, alive, moves, legal, apply, result, view, strength, bot, fmtValue };
})();
