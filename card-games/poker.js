/* Poker (Texas Hold'em, no limit, as a tournament) – rules, computer player and table view. Contract: card-games/README.md
   Rules:
   - 52 cards. Everyone starts with 1000 chips. Play chips only – no money.
   - The dealer button moves on each hand. The two players after it post the blinds (small and big blind);
     with two players the dealer posts the small blind. Blinds rise every 6 hands.
   - Everyone gets 2 cards face down. Betting rounds: before the flop, after the flop (3 shared cards),
     the turn (4th) and the river (5th). Fold, check, call, bet or raise (at least the last raise), all-in.
   - The best five of your two and the five shared cards win the pot (side pots when someone is all-in).
   - Without chips you are out. Whoever wins all chips wins the tournament. */
(function () {
  'use strict';
  const C = window.CardGames;
  const START = 1000, LEVEL_HANDS = 6;
  const BLINDS = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400], [300, 600], [500, 1000], [800, 1600], [1000, 2000]];
  const CAT = ['high', 'pair', 'twoPair', 'trips', 'straight', 'flush', 'full', 'quads', 'sflush'];
  const CAT_EN = ['high card', 'one pair', 'two pair', 'three of a kind', 'straight', 'flush', 'full house', 'four of a kind', 'straight flush'];

  /* ---------- Hand ranking ---------- */
  /** Score of the best five of 5–7 cards: higher is better; category(score) is the index in CAT */
  function best(cards) {
    const cnt = Array(15).fill(0), bySuit = {};
    let all = 0;
    for (const c of cards) {
      const r = C.rankIdx(c) + 2;                                     // 2 … 14 (ace)
      cnt[r]++; all |= 1 << r;
      (bySuit[C.suit(c)] = bySuit[C.suit(c)] || []).push(r);
    }
    const straight = mask => {
      if (mask & (1 << 14)) mask |= 2;                                  // ace low: A-2-3-4-5
      for (let top = 14; top >= 5; top--) if (((mask >> (top - 4)) & 31) === 31) return top;
      return 0;
    };
    const enc = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + (ks[i] || 0); return v; };
    const desc = [];
    for (let r = 14; r >= 2; r--) if (cnt[r]) desc.push(r);
    const others = (...not) => desc.filter(r => !not.includes(r));
    const fl = Object.values(bySuit).find(a => a.length >= 5);
    if (fl) {
      const sf = straight(fl.reduce((m, r) => m | (1 << r), 0));
      if (sf) return enc(8, [sf]);
    }
    const quads = desc.filter(r => cnt[r] === 4), trips = desc.filter(r => cnt[r] === 3), pairs = desc.filter(r => cnt[r] === 2);
    if (quads.length) return enc(7, [quads[0], others(quads[0])[0]]);
    if (trips.length && (trips.length > 1 || pairs.length)) return enc(6, [trips[0], Math.max(trips[1] || 0, pairs[0] || 0)]);
    if (fl) return enc(5, fl.slice().sort((a, b) => b - a));
    const st = straight(all);
    if (st) return enc(4, [st]);
    if (trips.length) return enc(3, [trips[0], ...others(trips[0])]);
    if (pairs.length >= 2) return enc(2, [pairs[0], pairs[1], others(pairs[0], pairs[1])[0]]);
    if (pairs.length) return enc(1, [pairs[0], ...others(pairs[0])]);
    return enc(0, desc);
  }
  const category = score => Math.floor(score / 15 ** 5);

  /* ---------- Hand flow ---------- */
  const blinds = st => BLINDS[Math.min(BLINDS.length - 1, Math.floor(st.handNo / LEVEL_HANDS))].map((b, i, a) =>
    st.handNo >= BLINDS.length * LEVEL_HANDS ? a[i] * 2 ** (Math.floor(st.handNo / LEVEL_HANDS) - BLINDS.length + 1) : b);
  const inHand = st => [...Array(st.n).keys()].filter(s => st.dealt[s] && !st.folded[s]);
  const canAct = (st, s) => st.dealt[s] && !st.folded[s] && st.chips[s] > 0;
  function nextFrom(st, s, ok) {
    for (let k = 1; k <= st.n; k++) { const q = (s + k) % st.n; if (ok(q)) return q; }
    return -1;
  }
  const pot = st => st.put.reduce((a, b) => a + b, 0);

  function bet(st, s, to) {
    const x = Math.min(to - st.bets[s], st.chips[s]);
    st.chips[s] -= x; st.bets[s] += x; st.put[s] += x;
  }
  function newHand(st) {
    const players = [...Array(st.n).keys()].filter(s => st.chips[s] > 0);
    if (players.length <= 1) { st.over = { winner: players[0], places: st.places.slice() }; st.toAct = -1; return; }
    st.handNo++;
    st.deck = C.shuffle(st, C.deck('2'));
    st.board = []; st.street = 0;
    st.dealt = st.chips.map(c => c > 0);
    st.folded = Array(st.n).fill(false);
    st.hole = st.dealt.map(d => d ? [st.deck.pop(), st.deck.pop()] : []);
    st.bets = Array(st.n).fill(0); st.put = Array(st.n).fill(0); st.acted = Array(st.n).fill(false);
    st.dealer = nextFrom(st, st.dealer, q => st.dealt[q]);
    const [sb, bb] = blinds(st);
    st.blind = [sb, bb];
    const sbSeat = players.length === 2 ? st.dealer : nextFrom(st, st.dealer, q => st.dealt[q]);
    const bbSeat = nextFrom(st, sbSeat, q => st.dealt[q]);
    bet(st, sbSeat, sb); bet(st, bbSeat, bb);
    st.sbSeat = sbSeat; st.bbSeat = bbSeat;
    st.curBet = bb; st.minRaise = bb;
    st.toAct = nextFrom(st, bbSeat, q => canAct(st, q));
    if (st.toAct < 0 || needsAction(st) < 0) settleStreet(st);
  }
  /** Next seat that still has to act this betting round, or -1 */
  function needsAction(st, from) {
    return nextFrom(st, from == null ? st.toAct - 1 : from, q => canAct(st, q) && (!st.acted[q] || st.bets[q] < st.curBet));
  }
  function settleStreet(st) {
    // Betting round over: deal the next street; nobody (or one) left who can bet → run out the board
    for (;;) {
      if (inHand(st).length <= 1) { finish(st); return; }
      if (st.street >= 3) { finish(st); return; }
      st.street++;
      st.board.push(...(st.street === 1 ? [st.deck.pop(), st.deck.pop(), st.deck.pop()] : [st.deck.pop()]));
      st.bets = Array(st.n).fill(0); st.acted = Array(st.n).fill(false);
      st.curBet = 0; st.minRaise = st.blind[1];
      const actors = inHand(st).filter(q => st.chips[q] > 0);
      if (actors.length >= 2) { st.toAct = nextFrom(st, st.dealer, q => canAct(st, q)); return; }
    }
  }
  /** Hand over: pots to the winners (side pots), then the next hand */
  function finish(st) {
    const live = inHand(st), wins = Array(st.n).fill(0);
    let shown = [];
    if (live.length === 1) wins[live[0]] = pot(st);
    else {
      const sc = {};
      for (const s of live) sc[s] = best([...st.hole[s], ...st.board]);
      shown = live.map(s => ({ s, cards: st.hole[s].slice(), cat: category(sc[s]) }));
      const levels = [...new Set(live.map(s => st.put[s]))].sort((a, b) => a - b);
      let prev = 0;
      const put = st.put.slice();
      levels.forEach((L, li) => {
        let amount = 0;
        for (let q = 0; q < st.n; q++) amount += Math.max(0, Math.min(put[q], L) - prev);
        if (li === levels.length - 1) for (let q = 0; q < st.n; q++) amount += Math.max(0, put[q] - L);   // folded chips above the top level
        const elig = live.filter(s => st.put[s] >= L);
        const top = Math.max(...elig.map(s => sc[s]));
        // Odd chips go to the first winner after the dealer
        const winners = elig.filter(s => sc[s] === top).sort((a, b) => ((a - st.dealer - 1 + st.n) % st.n) - ((b - st.dealer - 1 + st.n) % st.n));
        const share = Math.floor(amount / winners.length);
        winners.forEach((s, i) => { wins[s] += share + (i < amount - share * winners.length ? 1 : 0); });
        prev = L;
      });
    }
    wins.forEach((w, s) => { st.chips[s] += w; });
    st.prev = { hand: st.handNo, board: st.board.slice(), shown, wins: wins.map((w, s) => ({ s, w })).filter(x => x.w > 0) };
    st.last = { a: 'won', s: st.prev.wins[0].s, w: st.prev.wins[0].w, split: st.prev.wins.length > 1 };
    // Busted players get their place (several in one hand: the one with more chips before the hand places better)
    const bust = [...Array(st.n).keys()].filter(s => st.dealt[s] && st.chips[s] === 0).sort((a, b) => st.put[a] - st.put[b]);
    for (const s of bust) st.places.unshift(s);
    st.put = Array(st.n).fill(0); st.bets = Array(st.n).fill(0);
    newHand(st);
  }

  /* ---------- Computer: winning chance by simulation ---------- */
  function rng(seed) {
    let a = seed | 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function equity(st, s, sims) {
    const opp = inHand(st).length - 1;
    const known = new Set([...st.hole[s], ...st.board]);
    const rest = C.deck('2').filter(c => !known.has(c));
    const rnd = rng(st.rs ^ (s * 7919) ^ (st.handNo * 104729) ^ (st.board.length * 31) ^ pot(st));
    let win = 0;
    for (let k = 0; k < sims; k++) {
      const d = rest.slice();
      const take = () => d.splice(Math.floor(rnd() * d.length), 1)[0];
      const board = st.board.slice();
      const opps = Array.from({ length: opp }, () => [take(), take()]);
      while (board.length < 5) board.push(take());
      const me = best([...st.hole[s], ...board]);
      let beat = 0, tie = 0;
      for (const o of opps) { const v = best([...o, ...board]); if (v > me) { beat = 1; break; } if (v === me) tie++; }
      if (!beat) win += 1 / (tie + 1);
    }
    return win / sims;
  }

  const game = {
    id: 'poker',
    players: { min: 2, max: 6 },
    strings: {
      de: {
        'pk.title': 'Poker', 'pk.desc': 'Texas Hold’em als Turnier mit Spielchips: wer am Ende alle Chips hat, gewinnt. 2–6 Spieler.',
        'pk.fold': 'Passen', 'pk.check': 'Schieben', 'pk.call': 'Mitgehen {n}', 'pk.callAll': 'All-in mitgehen {n}',
        'pk.bet': 'Setzen {n}', 'pk.raise': 'Erhöhen auf {n}', 'pk.allin': 'All-in {n}',
        'pk.pot': 'Pot: {n}', 'pk.blinds': 'Blinds {a}/{b} · Hand {h}', 'pk.chips': '{n} Chips', 'pk.betIs': 'Einsatz {n}',
        'pk.b.dealer': 'Geber', 'pk.b.fold': 'passt', 'pk.b.allin': 'all-in', 'pk.b.out': 'raus',
        'pk.you.call': 'Du bist dran: {n} zum Mitgehen.', 'pk.you.check': 'Du bist dran: schieben oder setzen.',
        'pk.wait': '{p} ist dran.', 'pk.you.out': 'Du bist raus – die anderen spielen weiter.', 'pk.you.fold': 'Du hast gepasst – {p} ist dran.',
        'pk.last.fold': '{p} passt.', 'pk.last.check': '{p} schiebt.', 'pk.last.call': '{p} geht mit ({n}).', 'pk.last.bet': '{p} setzt {n}.',
        'pk.last.raise': '{p} erhöht auf {n}.', 'pk.last.allin': '{p} geht all-in ({n}).',
        'pk.last.won': '{p} gewinnt {n}.', 'pk.last.youWon': 'Du gewinnst {n}.', 'pk.last.split': 'Pot geteilt.',
        'pk.prev': 'Letzte Hand', 'pk.prevWin': '{p} gewinnt {n}', 'pk.prevYouWin': 'Du gewinnst {n}', 'pk.prevBoard': 'Tisch',
        'pk.won': '{p} gewinnt das Turnier!', 'pk.youWon': 'Du gewinnst das Turnier!', 'pk.place': ' Du bist {n}. geworden.',
        'pk.cat.high': 'Höchste Karte', 'pk.cat.pair': 'Paar', 'pk.cat.twoPair': 'Zwei Paare', 'pk.cat.trips': 'Drilling', 'pk.cat.straight': 'Straße',
        'pk.cat.flush': 'Flush', 'pk.cat.full': 'Full House', 'pk.cat.quads': 'Vierling', 'pk.cat.sflush': 'Straight Flush',
      },
      en: {
        'pk.title': 'Poker', 'pk.desc': 'Texas Hold’em as a tournament with play chips: whoever ends up with all chips wins. 2–6 players.',
        'pk.fold': 'Fold', 'pk.check': 'Check', 'pk.call': 'Call {n}', 'pk.callAll': 'Call all-in {n}',
        'pk.bet': 'Bet {n}', 'pk.raise': 'Raise to {n}', 'pk.allin': 'All-in {n}',
        'pk.pot': 'Pot: {n}', 'pk.blinds': 'Blinds {a}/{b} · hand {h}', 'pk.chips': '{n} chips', 'pk.betIs': 'Bet {n}',
        'pk.b.dealer': 'Dealer', 'pk.b.fold': 'folded', 'pk.b.allin': 'all-in', 'pk.b.out': 'out',
        'pk.you.call': 'Your turn: {n} to call.', 'pk.you.check': 'Your turn: check or bet.',
        'pk.wait': '{p} is to act.', 'pk.you.out': 'You are out – the others play on.', 'pk.you.fold': 'You folded – {p} is to act.',
        'pk.last.fold': '{p} folds.', 'pk.last.check': '{p} checks.', 'pk.last.call': '{p} calls ({n}).', 'pk.last.bet': '{p} bets {n}.',
        'pk.last.raise': '{p} raises to {n}.', 'pk.last.allin': '{p} goes all-in ({n}).',
        'pk.last.won': '{p} wins {n}.', 'pk.last.youWon': 'You win {n}.', 'pk.last.split': 'Split pot.',
        'pk.prev': 'Last hand', 'pk.prevWin': '{p} wins {n}', 'pk.prevYouWin': 'You win {n}', 'pk.prevBoard': 'Board',
        'pk.won': '{p} wins the tournament!', 'pk.youWon': 'You win the tournament!', 'pk.place': ' You finished {n}.',
        'pk.cat.high': 'High card', 'pk.cat.pair': 'Pair', 'pk.cat.twoPair': 'Two pair', 'pk.cat.trips': 'Three of a kind', 'pk.cat.straight': 'Straight',
        'pk.cat.flush': 'Flush', 'pk.cat.full': 'Full house', 'pk.cat.quads': 'Four of a kind', 'pk.cat.sflush': 'Straight flush',
      },
    },

    setup(n, seed) {
      const st = { n, rs: seed | 0, chips: Array(n).fill(START), handNo: 0, places: [], prev: null, last: null, over: null, moves: 0,
        put: Array(n).fill(0), bets: Array(n).fill(0) };
      st.dealer = C.int(st, n) - 1;
      newHand(st);
      return st;
    },

    moves(st, s) {
      if (st.over || s !== st.toAct || !canAct(st, s)) return [];
      const toCall = st.curBet - st.bets[s], stack = st.chips[s], all = st.bets[s] + stack;
      const ms = [];
      if (toCall > 0) ms.push({ a: 'fold' }, { a: 'call' });
      else ms.push({ a: 'check' });
      if (stack > toCall) {
        const p = pot(st) + toCall;
        const min = st.curBet + Math.max(st.minRaise, st.blind[1]);
        const tos = [min, st.curBet + Math.round(p / 2), st.curBet + p].filter(x => x >= min && x < all);
        for (const to of [...new Set(tos)].sort((a, b) => a - b)) ms.push({ a: 'raise', to });
        ms.push({ a: 'raise', to: all });
      }
      return ms;
    },

    apply(st, s, m) {
      st.moves++;
      if (m.a === 'fold') { st.folded[s] = true; st.last = { s, a: 'fold' }; }
      else if (m.a === 'check') st.last = { s, a: 'check' };
      else if (m.a === 'call') { bet(st, s, st.curBet); st.last = { s, a: st.chips[s] ? 'call' : 'allin', n: st.bets[s] }; }
      else if (m.a === 'raise') {
        const was = st.curBet;
        bet(st, s, m.to);
        if (m.to - was >= st.minRaise) st.minRaise = m.to - was;
        st.curBet = Math.max(st.curBet, st.bets[s]);
        st.acted = st.acted.map(() => false);
        st.last = { s, a: st.chips[s] ? (was ? 'raise' : 'bet') : 'allin', n: st.bets[s] };
      }
      st.acted[s] = true;
      if (inHand(st).length <= 1) { finish(st); return; }
      const nx = needsAction(st, s);
      if (nx >= 0) st.toAct = nx;
      else settleStreet(st);
    },

    view(st, s) {
      return { hand: st.dealt[s] ? st.hole[s].slice() : [], counts: st.hole.map((h, q) => st.dealt[q] && !st.folded[q] ? h.length : 0),
        chips: st.chips.slice(), bets: st.bets.slice(), pot: pot(st), board: st.board.slice(), dealer: st.dealer,
        folded: st.folded.slice(), dealt: st.dealt.slice(), toAct: st.toAct, curBet: st.curBet, blind: st.blind.slice(), handNo: st.handNo,
        toCall: Math.max(0, st.curBet - st.bets[s]), prev: st.prev, places: st.places.slice(), last: st.last,
        mine: st.dealt[s] && !st.folded[s] && st.hole[s].length ? category(best([...st.hole[s], ...st.board])) : null };   // own hand so far
    },

    result: st => st.over,

    /** Computer: winning chance from 150 simulated run-outs against the pot odds, now and then a bluff */
    bot(st, s) {
      const ms = game.moves(st, s);
      if (!ms.length) return null;
      const eq = equity(st, s, 150);
      const opp = inHand(st).length - 1;
      const toCall = st.curBet - st.bets[s], p = pot(st);
      const odds = toCall / (p + toCall || 1);
      const strength = eq * (opp + 1);                    // 1 = average hand against this many opponents
      const raises = ms.filter(m => m.a === 'raise');
      const r = rng(st.rs ^ (s * 31337) ^ st.moves)();
      const cheapRaise = raises[0], potRaise = raises[Math.min(raises.length - 1, 2)];
      if (raises.length && (strength > 1.9 || (strength > 1.4 && r < 0.5) || (r < 0.06 && !toCall))) {
        // Short stack: all-in instead of small raises
        if (st.chips[s] <= st.blind[1] * 8) return raises[raises.length - 1];
        return strength > 2.3 ? potRaise : cheapRaise;
      }
      if (!toCall) return { a: 'check' };
      if (eq >= odds * 1.1 || (toCall <= st.blind[1] && strength > 0.8)) return { a: 'call' };
      return { a: 'fold' };
    },

    describe(m, v) {
      if (m.a === 'fold') return 'fold';
      if (m.a === 'check') return 'check';
      if (m.a === 'call') return v ? `call ${Math.min(v.toCall, v.chips[v.you])}` : 'call';
      const all = v && m.to === v.bets[v.you] + v.chips[v.you];
      return all ? `go all-in (bet total ${m.to} this round)` : v && !v.curBet ? `bet ${m.to}` : `raise to ${m.to}`;
    },

    summary: v => ({ hand_number: v.handNo, blinds: v.blind, pot: v.pot, board: v.board.map(c => C.name(c, 'en')), dealer_seat: v.dealer,
      to_call: v.toCall, current_bet: v.curBet, your_hand: v.mine == null ? null : CAT_EN[v.mine],
      seats: v.chips.map((c, s) => ({ seat: s, chips: c, bet: v.bets[s], folded: !!v.folded[s], out: !v.dealt[s] && !c })),
      last_hand: v.prev ? { board: v.prev.board.map(c => C.name(c, 'en')), winners: v.prev.wins.map(w => ({ seat: w.s, chips: w.w })),
        shown: v.prev.shown.map(x => ({ seat: x.s, cards: x.cards.map(c => C.name(c, 'en')), hand: CAT_EN[x.cat] })) } : null }),

    ui: {
      handPlain: true,
      sort: h => h,
      primary: m => m.a === 'call' || m.a === 'check',
      seat: (v, s, x) => x.t('pk.chips', { n: x.fmt(v.chips[s]) }) + (v.bets[s] ? ' · ' + x.t('pk.betIs', { n: x.fmt(v.bets[s]) }) : ''),
      table(v, x) {
        const wrap = x.el('div', 'pk-table');
        const info = x.el('p', 'pk-info');
        info.append(x.el('span', 'tag', x.t('pk.pot', { n: x.fmt(v.pot) })), x.el('span', 'pile-lbl', x.t('pk.blinds', { a: x.fmt(v.blind[0]), b: x.fmt(v.blind[1]), h: v.handNo })));
        const board = x.el('div', 'pk-board');
        board.setAttribute('role', 'group');
        board.setAttribute('aria-label', x.t('pk.prevBoard'));
        for (let i = 0; i < 5; i++) board.append(v.board[i] ? x.card(v.board[i]) : x.el('div', 'slot'));
        const me = x.el('p', 'pk-me');
        me.textContent = (v.chips[x.you] || v.dealt[x.you] ? x.t('pk.chips', { n: x.fmt(v.chips[x.you]) }) : '') +
          (v.bets[x.you] ? ' · ' + x.t('pk.betIs', { n: x.fmt(v.bets[x.you]) }) : '') + (v.mine != null ? ' · ' + x.t('pk.cat.' + CAT[v.mine]) : '');
        wrap.append(info, board, me);
        if (v.prev) {
          const pv = x.el('div', 'pk-prev');
          pv.append(x.el('strong', '', x.t('pk.prev') + ': '),
            x.el('span', '', v.prev.wins.map(w => x.t(w.s === x.you ? 'pk.prevYouWin' : 'pk.prevWin', { p: x.name(w.s), n: x.fmt(w.w) })).join(', ')));
          for (const sh of v.prev.shown) {
            const row = x.el('div', 'pk-shown');
            row.append(x.el('span', 'pk-who', x.name(sh.s) + ':'));
            sh.cards.forEach(c => row.append(x.card(c)));
            row.append(x.el('span', '', x.t('pk.cat.' + CAT[sh.cat])));
            pv.append(row);
          }
          if (v.prev.shown.length) {
            const row = x.el('div', 'pk-shown');
            row.append(x.el('span', 'pk-who', x.t('pk.prevBoard') + ':'));
            v.prev.board.forEach(c => row.append(x.card(c)));
            pv.append(row);
          }
          wrap.append(pv);
        }
        return wrap;
      },
      status(v, x) {
        if (!v.dealt[x.you] && !v.chips[x.you]) return x.t('pk.you.out');
        if (v.toAct !== x.you) return v.folded[x.you] ? x.t('pk.you.fold', { p: x.name(v.toAct) }) : x.t('pk.wait', { p: x.name(v.toAct) });
        return v.toCall ? x.t('pk.you.call', { n: x.fmt(Math.min(v.toCall, v.chips[x.you])) }) : x.t('pk.you.check');
      },
      badge(v, s, x) {
        if (!v.dealt[s] && !v.chips[s]) return x.t('pk.b.out');
        if (v.folded[s]) return x.t('pk.b.fold');
        if (v.dealt[s] && !v.chips[s]) return x.t('pk.b.allin');
        if (s === v.dealer) return x.t('pk.b.dealer');
        return '';
      },
      label(m, v, x) {
        if (m.a === 'fold') return x.t('pk.fold');
        if (m.a === 'check') return x.t('pk.check');
        const stack = v.chips[x.you];
        if (m.a === 'call') return v.toCall >= stack ? x.t('pk.callAll', { n: x.fmt(stack) }) : x.t('pk.call', { n: x.fmt(v.toCall) });
        if (m.to === v.bets[x.you] + stack) return x.t('pk.allin', { n: x.fmt(m.to) });
        return v.curBet ? x.t('pk.raise', { n: x.fmt(m.to) }) : x.t('pk.bet', { n: x.fmt(m.to) });
      },
      last(v, x) {
        const l = v.last; if (!l) return '';
        if (l.a === 'won') return l.split ? x.t('pk.last.split') : x.t(l.s === x.you ? 'pk.last.youWon' : 'pk.last.won', { p: x.name(l.s), n: x.fmt(l.w) });
        if (l.s === x.you) return '';
        return x.t('pk.last.' + l.a, { p: x.name(l.s), n: x.fmt(l.n || 0) });
      },
      over(v, x) {
        const r = v.over;
        if (r.winner === x.you) return x.t('pk.youWon');
        return x.t('pk.won', { p: x.name(r.winner) }) + (r.places.includes(x.you) ? x.t('pk.place', { n: r.places.indexOf(x.you) + 2 }) : '');
      },
      won: (r, you) => r.winner === you,
    },
  };
  game.rank = { best, category };   // for the tests
  C.register(game);
})();
