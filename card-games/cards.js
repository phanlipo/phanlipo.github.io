/* Card games – shared basics for every game: cards, seeded random numbers, game registry.
   No DOM here (the games' rules can be tested on their own). Architecture: card-games/README.md */
(function () {
  'use strict';
  // Card ids: suit + rank, e.g. "H10" = ten of hearts, "SA" = ace of spades
  const SUITS = ['C', 'S', 'H', 'D'];              // Kreuz/Clubs, Pik/Spades, Herz/Hearts, Karo/Diamonds
  const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SYM = { C: '♣', S: '♠', H: '♥', D: '♦' };
  const NAMES = {
    de: { suit: { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' }, rank: { J: 'Bube', Q: 'Dame', K: 'König', A: 'Ass' }, short: { J: 'B', Q: 'D', K: 'K', A: 'A' } },
    en: { suit: { C: 'Clubs', S: 'Spades', H: 'Hearts', D: 'Diamonds' }, rank: { J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace' }, short: { J: 'J', Q: 'Q', K: 'K', A: 'A' } },
  };
  const suit = c => c[0];
  const rank = c => c.slice(1);
  const value = c => RANKS.indexOf(rank(c));          // 6 → 0 … A → 8
  const isCard = c => typeof c === 'string' && SUITS.includes(c[0]) && RANKS.includes(c.slice(1));
  const red = c => suit(c) === 'H' || suit(c) === 'D';
  /** Deck from the given lowest rank: '7' → 32 cards (Mau Mau), '6' → 36 cards (Durak) */
  function deck(from) {
    const out = [];
    for (const s of SUITS) for (const r of RANKS.slice(RANKS.indexOf(from || '6'))) out.push(s + r);
    return out;
  }
  /** "Herz 7" / "7 of Hearts" */
  function name(c, lang) {
    const L = NAMES[lang] || NAMES.de, r = rank(c), rn = L.rank[r] || r;
    return lang === 'en' ? `${rn} of ${L.suit[suit(c)]}` : `${L.suit[suit(c)]} ${rn}`;
  }
  const suitName = (s, lang) => (NAMES[lang] || NAMES.de).suit[s];
  const shortRank = (c, lang) => (NAMES[lang] || NAMES.de).short[rank(c)] || rank(c);

  /* ---------- Random numbers: seeded and kept in the game state (state.rs) ----------
     A game is reproducible from its seed – the tests replay whole games. */
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

  /* ---------- Moves ----------
     A move is a small JSON object, e.g. { a: 'play', c: 'H7' }. A move is legal if it equals one of
     game.moves(state, seat) – the host checks every move it gets, from its own page or another device. */
  const key = m => JSON.stringify(Object.keys(m).sort().reduce((o, k) => { o[k] = m[k]; return o; }, {}));
  function legal(game, st, seat, move) {
    if (!move || typeof move !== 'object') return false;
    const k = key(move);
    return game.moves(st, seat).some(m => key(m) === k);
  }

  /* ---------- Registry ----------
     A game registers itself: CardGames.register({ id, players: { min, max }, strings, setup, view, moves,
     apply, bot, result, describe, summary, ui }) – see README.md for the contract. */
  const games = {};
  function register(g) {
    for (const f of ['id', 'players', 'strings', 'setup', 'view', 'moves', 'apply', 'bot', 'result', 'describe', 'summary', 'ui'])
      if (!g[f]) throw new Error(`card game without ${f}`);
    games[g.id] = g;
  }

  window.CardGames = { SUITS, RANKS, SYM, suit, rank, value, isCard, red, deck, name, suitName, shortRank,
    next, int, shuffle, seed, key, legal, register, games, list: () => Object.values(games) };
})();
