/* Rommé – rules, computer player and table view. Contract: card-games/README.md
   Rules (common German rules, simplified):
   - 110 cards: two decks of 52 and 6 jokers. 13 cards each, one card face up starts the discard pile.
   - Turn: draw a card (stock or the top card of the discard pile), lay down, end with discarding one card.
   - Melds: a set (3–4 cards of the same rank, all suits different) or a run (3 or more cards of one suit in a row;
     ace before the 2 or after the king, not both). A joker stands for any card.
   - The first time you lay down, your melds of that turn must be worth at least 40 points
     (ace 11 – in A-2-3 only 1 –, king/queen/jack 10, others their number, a joker what it stands for).
     After that you may lay down any meld and add cards to every meld on the table.
   - The card just taken from the discard pile may not be discarded again in the same turn.
   - Whoever gets rid of all cards wins. The others count their cards: joker 20, ace 11, 10 to king 10, others their number.
   - Empty stock: the discard pile (but its top card) is shuffled to a new stock. When it runs out a third time,
     the round ends and the fewest points on the hand win. */
(function () {
  'use strict';
  const C = window.CardGames;
  const J = C.JOKER, HAND = 13, OPEN = 40, MAX_STEPS = 30000;

  const isJ = c => c === J;
  const pos = c => C.rankIdx(c) + 2;                                   // 2 … 14 (ace high)
  const posVal = p => p === 1 ? 1 : p === 14 ? 11 : p >= 11 ? 10 : p;
  const penalty = c => isJ(c) ? 20 : posVal(pos(c));
  const RANKS = C.RANKS_ALL;
  const rankAt = p => RANKS[(p === 1 ? 14 : p) - 2];

  /* ---------- Melds ---------- */
  /** The meld these cards form, or null: { t: 'set', r, cards } or { t: 'run', s, lo, cards } (cards in order, jokers in place) */
  function analyze(cards) {
    if (cards.length < 3) return null;
    const nat = cards.filter(c => !isJ(c)), j = cards.length - nat.length;
    if (!nat.length) return null;
    // Set: same rank, different suits, at most 4
    if (nat.every(c => C.rank(c) === C.rank(nat[0])) && new Set(nat.map(C.suit)).size === nat.length && cards.length <= 4)
      return { t: 'set', r: C.rank(nat[0]), cards: [...nat, ...Array(j).fill(J)] };
    if (!nat.every(c => C.suit(c) === C.suit(nat[0]))) return null;
    // Run: try the ace after the king (2…14), then before the 2 (1…13)
    for (const [min, max, ace] of [[2, 14, 14], [1, 13, 1]]) {
      const ps = nat.map(c => C.rank(c) === 'A' ? ace : pos(c)).sort((a, b) => a - b);
      if (new Set(ps).size !== ps.length) continue;
      let lo = ps[0], hi = ps[ps.length - 1];
      const gaps = hi - lo + 1 - ps.length;
      if (gaps > j) continue;
      let extra = j - gaps;
      while (extra && hi < max) { hi++; extra--; }
      while (extra && lo > min) { lo--; extra--; }
      if (extra) continue;
      const out = [];
      for (let p = lo; p <= hi; p++) {
        const k = nat.findIndex(c => (C.rank(c) === 'A' ? ace : pos(c)) === p);
        out.push(k >= 0 ? nat[k] : J);
      }
      return { t: 'run', s: C.suit(nat[0]), lo, cards: out };
    }
    return null;
  }
  function meldValue(m) {
    if (m.t === 'set') return m.cards.length * posVal(pos(m.r === 'A' ? 'SA' : 'S' + m.r));
    return m.cards.reduce((v, _, i) => v + posVal(m.lo + i), 0);
  }
  /** Can card c be added to meld m? Returns the new meld or null. A run stays within ace-low (1) and ace-high (14), at most 13 cards */
  function extend(m, c) {
    if (m.t === 'set') {
      if (m.cards.length >= 4) return null;
      if (!isJ(c) && (C.rank(c) !== m.r || m.cards.some(x => !isJ(x) && C.suit(x) === C.suit(c)))) return null;
      return { ...m, cards: [...m.cards, c] };
    }
    const hi = m.lo + m.cards.length - 1;
    if (m.cards.length >= 13) return null;
    if (isJ(c)) {
      if (hi < 14) return { ...m, cards: [...m.cards, J] };
      return { ...m, lo: m.lo - 1, cards: [J, ...m.cards] };
    }
    if (C.suit(c) !== m.s) return null;
    const ps = C.rank(c) === 'A' ? [1, 14] : [pos(c)];
    if (ps.includes(hi + 1)) return { ...m, cards: [...m.cards, c] };
    if (ps.includes(m.lo - 1)) return { ...m, lo: m.lo - 1, cards: [c, ...m.cards] };
    return null;
  }
  /** Melds of the pool that contain pool[i] (a natural card) */
  function candidates(pool, i) {
    const c = pool[i], jokers = pool.filter(isJ).length, out = [];
    const rest = pool.filter((_, k) => k !== i);
    // Sets: one card per other suit, filled with jokers
    const bySuit = {};
    for (const x of rest) if (!isJ(x) && C.rank(x) === C.rank(c) && C.suit(x) !== C.suit(c)) bySuit[C.suit(x)] = x;
    const others = Object.values(bySuit);
    for (let mask = 0; mask < 1 << others.length; mask++) {
      const pick = others.filter((_, k) => mask & (1 << k));
      for (let jj = 0; jj <= jokers && pick.length + 1 + jj <= 4; jj++)
        if (pick.length + 1 + jj >= 3) out.push([c, ...pick, ...Array(jj).fill(J)]);
    }
    // Runs: every window of the suit around this card
    const s = C.suit(c);
    for (const [min, max, ace] of [[2, 14, 14], [1, 13, 1]]) {
      const p = C.rank(c) === 'A' ? ace : pos(c);
      if (p < min || p > max) continue;
      for (let lo = Math.max(min, p - 12); lo <= p; lo++) for (let hi = Math.max(p, lo + 2); hi <= Math.min(max, lo + 12); hi++) {
        const used = new Set([i]), cards = [];
        let jn = 0;
        for (let q = lo; q <= hi; q++) {
          if (q === p) { cards.push(c); continue; }
          const k = pool.findIndex((x, kk) => !used.has(kk) && !isJ(x) && C.suit(x) === s && C.rank(x) === rankAt(q));
          if (k >= 0) { used.add(k); cards.push(pool[k]); } else { jn++; cards.push(J); }
        }
        if (jn <= jokers && jn < cards.length - 1) out.push(cards);
        if (jn > jokers) break;
      }
    }
    return out;
  }
  const without = (pool, cards) => { const p = pool.slice(); for (const c of cards) p.splice(p.indexOf(c), 1); return p; };
  /** Split exactly these cards into melds worth at least `need`, or null */
  function partition(cards, need) {
    let steps = 0;
    const go = (pool, acc, val) => {
      if (++steps > MAX_STEPS) return null;
      if (!pool.length) return val >= need ? acc : null;
      const i = pool.findIndex(c => !isJ(c));
      if (i < 0) return null;
      for (const cand of candidates(pool, i)) {
        const m = analyze(cand);
        if (!m) continue;
        const r = go(without(pool, cand), [...acc, m], val + meldValue(m));
        if (r) return r;
      }
      return null;
    };
    return go(cards.slice(), [], 0);
  }
  /** Most valuable set of separate melds from a hand (computer, hints); remembered for the last hands */
  const memo = new Map();
  function bestMelds(hand) {
    const key = hand.slice().sort().join();
    if (memo.has(key)) return memo.get(key);
    const r = findMelds(hand);
    memo.set(key, r);
    if (memo.size > 60) memo.delete(memo.keys().next().value);
    return r;
  }
  function findMelds(hand) {
    const seen = new Set(), all = [];
    hand.forEach((c, i) => {
      if (isJ(c)) return;
      for (const cand of candidates(hand, i)) {
        const m = analyze(cand);
        if (!m) continue;
        const k = cand.slice().sort().join();
        if (!seen.has(k)) { seen.add(k); all.push({ cards: cand, v: meldValue(m) }); }
      }
    });
    all.sort((a, b) => b.v - a.v);
    let bestV = 0, bestSet = [], steps = 0;
    const go = (start, pool, chosen, v) => {
      if (++steps > MAX_STEPS) return;
      if (v > bestV) { bestV = v; bestSet = chosen; }
      for (let k = start; k < all.length; k++) {
        const m = all[k];
        const p = pool.slice();
        let ok = true;
        for (const c of m.cards) { const x = p.indexOf(c); if (x < 0) { ok = false; break; } p.splice(x, 1); }
        if (ok) go(k + 1, p, [...chosen, m], v + m.v);
      }
    };
    go(0, hand.slice(), [], 0);
    return { value: bestV, melds: bestSet.map(m => m.cards), all };
  }
  const isSub = (cards, hand) => { const p = hand.slice(); for (const c of cards) { const k = p.indexOf(c); if (k < 0) return false; p.splice(k, 1); } return true; };

  /* ---------- Flow ---------- */
  function drawOne(st) {
    if (!st.stock.length) {
      st.renewed++;
      if (st.renewed >= 3 || st.pile.length < 2) { endRound(st, null); return null; }
      st.stock = C.shuffle(st, st.pile.slice(0, -1));
      st.pile = [st.pile[st.pile.length - 1]];
    }
    return st.stock.pop();
  }
  function endRound(st, winner) {
    const points = st.hands.map(h => h.reduce((v, c) => v + penalty(c), 0));
    if (winner == null) { const low = Math.min(...points); winner = points.indexOf(low); }
    st.over = { winner, points, stuck: st.renewed >= 3, scores: points };
  }
  function nextTurn(st) {
    st.turn = (st.turn + 1) % st.n;
    st.phase = 'draw'; st.taken = null;
  }

  const game = {
    id: 'rommee',
    players: { min: 2, max: 6 },
    strings: {
      de: {
        'rm.title': 'Rommé', 'rm.desc': 'Reihen und Sätze auslegen, anlegen, ablegen – wer zuerst alle Karten los ist, gewinnt. 2–6 Spieler.',
        'rm.draw': 'Vom Stapel ziehen', 'rm.take': 'Ablage nehmen', 'rm.discard': 'Ablegen', 'rm.meld': 'Auslegen ({n} Punkte)', 'rm.lay': 'Anlegen an {m}',
        'rm.stock': 'Stapel: {n}', 'rm.pile': 'Ablage', 'rm.noMelds': 'Noch nichts ausgelegt', 'rm.set': '{r}er', 'rm.out': 'draußen',
        'rm.you.draw': 'Du bist dran: vom Stapel ziehen oder die Ablage nehmen.',
        'rm.you.play': 'Karten antippen: 1 zum Ablegen oder Anlegen, mehrere zum Auslegen.',
        'rm.you.open': 'Karten antippen: 1 zum Ablegen, mehrere zum Auslegen (das erste Mal mindestens 40 Punkte).',
        'rm.you.sel': 'Ausgewählt: {n} Karten.', 'rm.you.selOk': 'Ausgewählt: {n} Karten, {v} Punkte.', 'rm.you.selLow': '{v} Punkte – zum ersten Auslegen sind 40 nötig.',
        'rm.you.selBad': 'Das ist keine gültige Reihe oder kein Satz.', 'rm.you.taken': 'Die genommene Karte darf nicht gleich wieder abgelegt werden.',
        'rm.wait': '{p} ist dran.',
        'rm.last.draw': '{p} zieht vom Stapel.', 'rm.last.take': '{p} nimmt {c}.', 'rm.last.discard': '{p} legt {c} ab.',
        'rm.last.meld': '{p} legt {n} Karten aus.', 'rm.last.lay': '{p} legt {c} an.',
        'rm.won': '{p} gewinnt!', 'rm.youWon': 'Du gewinnst!', 'rm.pts': ' Deine Punkte: {n}.', 'rm.stuck': 'Der Stapel ist aufgebraucht.',
        'rm.melds': 'Ausgelegte Karten', 'rm.tally': 'Minuspunkte nach {n} Runden: {s}', 'rm.tally1': 'Minuspunkte nach 1 Runde: {s}',
      },
      en: {
        'rm.title': 'Rummy', 'rm.desc': 'Lay down runs and sets, add to them, discard – whoever gets rid of all cards first wins. 2–6 players.',
        'rm.draw': 'Draw from the stock', 'rm.take': 'Take the discard', 'rm.discard': 'Discard', 'rm.meld': 'Lay down ({n} points)', 'rm.lay': 'Add to {m}',
        'rm.stock': 'Stock: {n}', 'rm.pile': 'Discard pile', 'rm.noMelds': 'Nothing laid down yet', 'rm.set': '{r}s', 'rm.out': 'down',
        'rm.you.draw': 'Your turn: draw from the stock or take the discard.',
        'rm.you.play': 'Tap cards: 1 to discard or add to a meld, several to lay down.',
        'rm.you.open': 'Tap cards: 1 to discard, several to lay down (at least 40 points the first time).',
        'rm.you.sel': 'Selected: {n} cards.', 'rm.you.selOk': 'Selected: {n} cards, {v} points.', 'rm.you.selLow': '{v} points – the first lay-down needs 40.',
        'rm.you.selBad': 'That is no valid run or set.', 'rm.you.taken': 'The card you took may not be discarded right away.',
        'rm.wait': '{p} is playing.',
        'rm.last.draw': '{p} draws from the stock.', 'rm.last.take': '{p} takes {c}.', 'rm.last.discard': '{p} discards {c}.',
        'rm.last.meld': '{p} lays down {n} cards.', 'rm.last.lay': '{p} adds {c}.',
        'rm.won': '{p} wins!', 'rm.youWon': 'You win!', 'rm.pts': ' Your points: {n}.', 'rm.stuck': 'The stock has run out.',
        'rm.melds': 'Laid-down cards', 'rm.tally': 'Penalty points after {n} rounds: {s}', 'rm.tally1': 'Penalty points after 1 round: {s}',
      },
    },

    setup(n, seed) {
      const st = { n, rs: seed | 0, melds: [], out: Array(n).fill(false), renewed: 0, phase: 'draw', taken: null, last: null, over: null, moves: 0 };
      st.stock = C.shuffle(st, [...C.deck('2'), ...C.deck('2'), ...Array(6).fill(J)]);
      st.hands = Array.from({ length: n }, () => []);
      for (let k = 0; k < HAND; k++) for (let s = 0; s < n; s++) st.hands[s].push(st.stock.pop());
      st.pile = [st.stock.pop()];
      st.turn = C.int(st, n);
      return st;
    },

    moves(st, s) {
      if (st.over || s !== st.turn) return [];
      if (st.phase === 'draw') return st.pile.length ? [{ a: 'draw' }, { a: 'take' }] : [{ a: 'draw' }];
      const hand = st.hands[s], ms = [];
      const uniq = [...new Set(hand)];
      // Melds for agents and hints: when down any single meld, otherwise the best set if it reaches 40
      const b = bestMelds(hand);
      if (st.out[s]) for (const m of b.all.slice(0, 12)) ms.push({ a: 'meld', cs: m.cards });
      else if (b.value >= OPEN) ms.push({ a: 'meld', cs: b.melds.flat() });
      if (st.out[s]) for (const c of uniq) st.melds.forEach((m, i) => { if (extend(m, c)) ms.push({ a: 'lay', c, m: i }); });
      for (const c of uniq) if (c !== st.taken || hand.filter(x => x === c).length > 1 || hand.length === 1) ms.push({ a: 'discard', c });
      return ms;
    },

    /** Laying down is checked here: any cards of the hand that split into melds (40 points the first time) */
    allowed(st, s, m) {
      if (m.a !== 'meld') return game.moves(st, s).some(x => C.key(x) === C.key(m));
      if (st.over || s !== st.turn || st.phase !== 'play') return false;
      if (!Array.isArray(m.cs) || m.cs.length < 3 || m.cs.length > 30 || !m.cs.every(C.isCard) || Object.keys(m).length !== 2) return false;
      if (!isSub(m.cs, st.hands[s])) return false;
      return !!partition(m.cs, st.out[s] ? 0 : OPEN);
    },

    apply(st, s, m) {
      st.moves++;
      const hand = st.hands[s];
      if (m.a === 'draw') {
        const c = drawOne(st);
        if (st.over) return;
        hand.push(c); st.phase = 'play'; st.last = { s, a: 'draw' };
      } else if (m.a === 'take') {
        const c = st.pile.pop();
        hand.push(c); st.taken = c; st.phase = 'play'; st.last = { s, a: 'take', c };
      } else if (m.a === 'meld') {
        const melds = partition(m.cs, st.out[s] ? 0 : OPEN);
        for (const c of m.cs) hand.splice(hand.indexOf(c), 1);
        st.melds.push(...melds);
        st.out[s] = true;
        st.last = { s, a: 'meld', n: m.cs.length };
        if (!hand.length) endRound(st, s);
      } else if (m.a === 'lay') {
        st.melds[m.m] = extend(st.melds[m.m], m.c);
        hand.splice(hand.indexOf(m.c), 1);
        st.last = { s, a: 'lay', c: m.c, m: m.m };
        if (!hand.length) endRound(st, s);
      } else if (m.a === 'discard') {
        hand.splice(hand.indexOf(m.c), 1);
        st.pile.push(m.c);
        st.last = { s, a: 'discard', c: m.c };
        if (!hand.length) endRound(st, s); else nextTurn(st);
      }
    },

    view(st, s) {
      return { hand: st.hands[s].slice(), counts: st.hands.map(h => h.length), melds: st.melds.map(m => ({ ...m, cards: m.cards.slice() })),
        top: st.pile[st.pile.length - 1] || null, pileN: st.pile.length, stockN: st.stock.length, out: st.out.slice(),
        phase: st.phase, turn: st.turn, taken: s === st.turn ? st.taken : null, last: st.last };
    },

    result: st => st.over,

    /** Computer: takes the discard if it fits, lays down as much as possible, discards the least useful card */
    bot(st, s) {
      const ms = game.moves(st, s);
      if (!ms.length) return null;
      const hand = st.hands[s];
      if (st.phase === 'draw') {
        const top = st.pile[st.pile.length - 1];
        if (top) {
          const withTop = [...hand, top];
          const useful = isJ(top) || (st.out[s] && st.melds.some(m => extend(m, top))) ||
            candidates(withTop, withTop.length - 1).some(cand => cand.filter(isJ).length === 0 && analyze(cand));
          if (useful && ms.some(m => m.a === 'take')) return { a: 'take' };
        }
        return { a: 'draw' };
      }
      const meld = ms.find(m => m.a === 'meld');
      if (meld) return meld;
      const lay = ms.find(m => m.a === 'lay');
      if (lay) return lay;
      // Discard: no joker, the card with the fewest neighbours (same rank or suit within 2), highest points first
      const near = c => isJ(c) ? 99 : hand.filter(x => x !== c && !isJ(x) &&
        (C.rank(x) === C.rank(c) || (C.suit(x) === C.suit(c) && Math.abs(pos(x) - pos(c)) <= 2))).length;
      const ds = ms.filter(m => m.a === 'discard');
      return ds.reduce((b, m) => (near(m.c) < near(b.c) || (near(m.c) === near(b.c) && penalty(m.c) > penalty(b.c))) ? m : b);
    },

    describe(m, v) {
      if (m.a === 'draw') return 'draw a card from the stock';
      if (m.a === 'take') return v && v.top ? `take ${C.name(v.top, 'en')} from the discard pile` : 'take the top card of the discard pile';
      if (m.a === 'discard') return `discard ${C.name(m.c, 'en')} (ends the turn)`;
      if (m.a === 'lay') return `add ${C.name(m.c, 'en')} to meld ${m.m + 1}`;
      return `lay down ${m.cs.map(c => C.name(c, 'en')).join(', ')}`;
    },

    summary: v => ({ phase: v.phase === 'draw' ? 'draw a card first' : 'lay down, add, then discard', stock: v.stockN,
      discard_top: v.top ? C.name(v.top, 'en') : null, laid_down: v.out.map((o, s) => ({ seat: s, has_laid_down: o })),
      melds: v.melds.map((m, i) => ({ meld: i + 1, kind: m.t, cards: m.cards.map(c => C.name(c, 'en')) })),
      card_taken_from_discard: v.taken ? C.name(v.taken, 'en') : null }),

    ui: {
      multi: true,
      tallyText: 'rm.tally',
      sort(hand) {
        const order = ['C', 'S', 'H', 'D'];
        return hand.slice().sort((a, b) => isJ(a) - isJ(b) || order.indexOf(C.suit(a)) - order.indexOf(C.suit(b)) || pos(a) - pos(b));
      },
      /** Buttons for the selected cards */
      selMoves(v, sel) {
        if (v.phase !== 'play' || v.turn !== v.you) return [];
        const out = [];
        if (sel.length === 1) {
          const c = sel[0];
          if (v.moves.some(m => m.a === 'discard' && m.c === c)) out.push({ a: 'discard', c });
          v.moves.filter(m => m.a === 'lay' && m.c === c).forEach(m => out.push(m));
        }
        if (sel.length >= 3 && partition(sel, v.out[v.you] ? 0 : OPEN)) out.push({ a: 'meld', cs: sel.slice() });
        return out;
      },
      primary: m => m.a === 'meld' || m.a === 'discard',
      table(v, x) {
        const wrap = x.el('div', 'rm-table');
        const piles = x.el('div', 'rm-piles');
        const stock = x.el('div', 'pile');
        stock.append(v.stockN ? x.back() : x.el('div', 'slot'), x.el('span', 'pile-lbl', x.t('rm.stock', { n: v.stockN })));
        const pile = x.el('div', 'pile');
        pile.append(v.top ? x.card(v.top) : x.el('div', 'slot'), x.el('span', 'pile-lbl', x.t('rm.pile')));
        piles.append(stock, pile);
        const melds = x.el('ol', 'rm-melds');
        melds.setAttribute('aria-label', x.t('rm.melds'));
        v.melds.forEach((m, i) => {
          const li = x.el('li', 'rm-meld');
          li.setAttribute('aria-label', game.ui.meldName(m, x));
          li.append(x.el('span', 'rm-no', String(i + 1)));
          m.cards.forEach(c => li.append(x.card(c)));
          melds.append(li);
        });
        if (!v.melds.length) melds.append(x.el('li', 'pile-lbl', x.t('rm.noMelds')));
        wrap.append(piles, melds);
        return wrap;
      },
      meldName(m, x) {
        if (m.t === 'set') return x.t('rm.set', { r: C.shortRank('S' + m.r, x.lang) });
        const hi = m.lo + m.cards.length - 1;
        return C.SYM[m.s] + C.shortRank('S' + rankAt(m.lo), x.lang) + '–' + C.SYM[m.s] + C.shortRank('S' + rankAt(hi), x.lang);
      },
      status(v, x) {
        if (v.turn !== x.you) return x.t('rm.wait', { p: x.name(v.turn) });
        if (v.phase === 'draw') return x.t('rm.you.draw');
        const sel = x.sel || [];
        if (sel.length >= 3) {
          const p = partition(sel, 0);
          if (!p) return x.t('rm.you.selBad');
          const val = p.reduce((a, m) => a + meldValue(m), 0);
          if (!v.out[x.you] && !partition(sel, OPEN)) return x.t('rm.you.selLow', { v: val });
          return x.t('rm.you.selOk', { n: sel.length, v: val });
        }
        if (sel.length === 1 && v.taken === sel[0] && !v.moves.some(m => m.a === 'discard' && m.c === sel[0])) return x.t('rm.you.taken');
        if (sel.length) return x.t('rm.you.sel', { n: sel.length });
        return x.t(v.out[x.you] ? 'rm.you.play' : 'rm.you.open');
      },
      badge: (v, s, x) => v.out[s] ? x.t('rm.out') : '',
      label(m, v, x) {
        if (m.a === 'draw') return x.t('rm.draw');
        if (m.a === 'take') return x.t('rm.take');
        if (m.a === 'discard') return x.t('rm.discard');
        if (m.a === 'lay') return x.t('rm.lay', { m: (m.m + 1) + ' (' + game.ui.meldName(v.melds[m.m], x) + ')' });
        const p = partition(m.cs, 0);
        return x.t('rm.meld', { n: p ? p.reduce((a, q) => a + meldValue(q), 0) : 0 });
      },
      last(v, x) {
        const l = v.last; if (!l || l.s === x.you) return '';
        const p = x.name(l.s);
        if (l.a === 'take' || l.a === 'discard' || l.a === 'lay') return x.t('rm.last.' + l.a, { p, c: x.cardName(l.c) });
        return x.t('rm.last.' + l.a, { p, n: l.n });
      },
      over(v, x) {
        const r = v.over;
        const head = (r.stuck ? x.t('rm.stuck') + ' ' : '') + (r.winner === x.you ? x.t('rm.youWon') : x.t('rm.won', { p: x.name(r.winner) }));
        return head + (r.winner === x.you ? '' : x.t('rm.pts', { n: r.points[x.you] }));
      },
      won: (r, you) => r.winner === you,
    },
  };
  game.rules = { analyze, partition, extend, meldValue, bestMelds, penalty };   // for the tests
  C.register(game);
})();
