/* Durak (throw-in variant, "Podkidnoy") – rules, computer player and table view. Contract: card-games/README.md
   Rules:
   - 36 cards (6 to ace), 6 cards each. The bottom card of the deck lies face up: its suit is trump.
   - The player with the lowest trump attacks first, the next player defends.
   - The defender beats every attacking card with a higher card of the same suit or with a trump
     (a trump only with a higher trump).
   - Attacker and the player after the defender may add cards of a rank already on the table,
     at most 6 and at most as many as the defender had at the start of the round.
   - Defender cannot or will not beat: takes all cards ("Aufnehmen"). The others may still add cards first.
   - Everything beaten and nobody adds more ("Fertig"): the cards are discarded, the defender attacks next.
     After taking, the player after the defender attacks.
   - After each round everyone draws up to 6 cards (attackers first, defender last).
   - Without cards and with an empty deck you are out. The last one with cards is the Durak (fool). */
(function () {
  'use strict';
  const C = window.CardGames;
  const HAND = 6, MAX_TABLE = 6;

  const inGame = (st, s) => st.hands[s].length > 0 || st.deck.length > 0;
  function nextIn(st, s) {
    for (let k = 1; k <= st.n; k++) { const q = (s + k) % st.n; if (inGame(st, q)) return q; }
    return s;
  }
  const beats = (st, d, a) => C.suit(d) === C.suit(a) ? C.value(d) > C.value(a) : C.suit(d) === st.trump;
  /** The players who may attack this round: the attacker and the player after the defender */
  function throwers(st) {
    const out = [st.atk], o = nextIn(st, st.def);
    if (o !== st.def && !out.includes(o)) out.push(o);
    return out;
  }
  const ranksOnTable = st => new Set(st.table.flatMap(p => p.d ? [C.rank(p.a), C.rank(p.d)] : [C.rank(p.a)]));
  function throwable(st, s) {
    if (!st.table.length) return s === st.atk ? st.hands[s].slice() : [];
    if (st.table.length >= st.limit) return [];
    const r = ranksOnTable(st);
    return st.hands[s].filter(c => r.has(C.rank(c)));
  }
  const allBeaten = st => st.table.every(p => p.d);
  /** Attackers that still might add a card (have a fitting card and did not say "done") */
  const open = st => throwers(st).filter(s => !st.passed.includes(s) && throwable(st, s).length);

  function startRound(st, atk) {
    st.atk = atk;
    st.def = nextIn(st, atk);
    st.limit = Math.min(MAX_TABLE, st.hands[st.def].length);
    st.table = []; st.passed = []; st.taking = false;
  }
  function endRound(st, took) {
    const cards = st.table.flatMap(p => p.d ? [p.a, p.d] : [p.a]);
    if (took) st.hands[st.def].push(...cards); else st.discard += cards.length;
    st.last = { s: st.def, a: took ? 'took' : 'beaten', n: cards.length };
    // Draw up to 6: attacker first, then the others in turn, defender last
    const order = [];
    for (let k = 0; k < st.n; k++) { const q = (st.atk + k) % st.n; if (q !== st.def) order.push(q); }
    order.push(st.def);
    for (const q of order) while (st.hands[q].length < HAND && st.deck.length) st.hands[q].push(st.deck.pop());
    for (let q = 0; q < st.n; q++) if (!inGame(st, q) && !st.out.includes(q)) st.out.push(q);
    const left = [...Array(st.n).keys()].filter(q => inGame(st, q));
    if (left.length <= 1) { st.over = true; st.loser = left.length ? left[0] : null; st.table = []; return; }
    const def = st.def;
    startRound(st, took ? nextIn(st, def) : inGame(st, def) ? def : nextIn(st, def));
  }
  function check(st) {
    if (!st.table.length) return;
    if (st.taking) { if (!open(st).length) endRound(st, true); }
    else if (allBeaten(st) && (!open(st).length || !st.hands[st.def].length)) endRound(st, false);
  }

  const game = {
    id: 'durak',
    players: { min: 2, max: 6 },
    strings: {
      de: {
        'dk.title': 'Durak', 'dk.desc': 'Angreifen, schlagen, aufnehmen – wer am Ende noch Karten hat, ist der Durak. 2–6 Spieler.',
        'dk.take': 'Aufnehmen', 'dk.done': 'Fertig', 'dk.on': 'auf {c}',
        'dk.deck': 'Stapel: {n}', 'dk.trump': 'Trumpf: {s}', 'dk.discard': 'Abgelegt: {n}', 'dk.empty': 'Leg eine Karte',
        'dk.b.atk': 'Angriff', 'dk.b.def': 'Verteidigung', 'dk.b.out': 'raus', 'dk.b.take': 'nimmt auf',
        'dk.you.lead': 'Du greifst an: leg eine Karte.', 'dk.you.def': 'Schlag die Karten oder nimm sie auf.',
        'dk.you.add': 'Leg Karten gleichen Werts nach oder sag „Fertig“.', 'dk.you.addTake': '{p} nimmt auf – leg noch Karten dazu oder „Fertig“.',
        'dk.you.waitDef': '{p} verteidigt.', 'dk.you.addWhile': '{p} verteidigt – du kannst Karten gleichen Werts nachlegen.', 'dk.you.waitAdd': 'Die anderen können noch nachlegen.', 'dk.wait': '{p} greift an.',
        'dk.you.out': 'Du bist raus – keine Karten mehr.',
        'dk.last.atk': '{p} spielt {c}.', 'dk.last.def': '{p} schlägt mit {c}.', 'dk.last.take': '{p} nimmt auf.',
        'dk.last.done': '{p}: Fertig.', 'dk.last.beaten': 'Geschlagen! {n} Karten abgelegt.', 'dk.last.took': '{p} hat {n} Karten aufgenommen.', 'dk.last.youTook': 'Du hast {n} Karten aufgenommen.',
        'dk.loser': '{p} ist der Durak!', 'dk.youLost': 'Du bist der Durak!', 'dk.draw': 'Unentschieden – keiner ist der Durak.',
      },
      en: {
        'dk.title': 'Durak', 'dk.desc': 'Attack, beat, take – whoever still holds cards at the end is the Durak (fool). 2–6 players.',
        'dk.take': 'Take', 'dk.done': 'Done', 'dk.on': 'on {c}',
        'dk.deck': 'Deck: {n}', 'dk.trump': 'Trump: {s}', 'dk.discard': 'Discarded: {n}', 'dk.empty': 'Play a card',
        'dk.b.atk': 'Attack', 'dk.b.def': 'Defence', 'dk.b.out': 'out', 'dk.b.take': 'takes',
        'dk.you.lead': 'You attack: play a card.', 'dk.you.def': 'Beat the cards or take them.',
        'dk.you.add': 'Add cards of the same rank or say “Done”.', 'dk.you.addTake': '{p} takes – add more cards or “Done”.',
        'dk.you.waitDef': '{p} is defending.', 'dk.you.addWhile': '{p} is defending – you may add cards of the same rank.', 'dk.you.waitAdd': 'The others may still add cards.', 'dk.wait': '{p} is attacking.',
        'dk.you.out': 'You are out – no cards left.',
        'dk.last.atk': '{p} plays {c}.', 'dk.last.def': '{p} beats with {c}.', 'dk.last.take': '{p} takes.',
        'dk.last.done': '{p}: done.', 'dk.last.beaten': 'Beaten! {n} cards discarded.', 'dk.last.took': '{p} took {n} cards.', 'dk.last.youTook': 'You took {n} cards.',
        'dk.loser': '{p} is the Durak!', 'dk.youLost': 'You are the Durak!', 'dk.draw': 'Draw – nobody is the Durak.',
      },
    },

    setup(n, seed) {
      const st = { n, rs: seed | 0, discard: 0, out: [], over: false, loser: null, last: null, moves: 0 };
      st.deck = C.shuffle(st, C.deck('6'));
      st.hands = Array.from({ length: n }, () => []);
      for (let k = 0; k < HAND; k++) for (let s = 0; s < n; s++) st.hands[s].push(st.deck.pop());
      // Bottom card shows the trump; with 6 players every card is dealt – then the last dealt card shows it
      st.trumpCard = st.deck.length ? st.deck[0] : st.hands[n - 1][HAND - 1];
      st.trump = C.suit(st.trumpCard);
      // Lowest trump starts (nobody has one: random)
      let atk = -1, low = 99;
      st.hands.forEach((h, s) => h.forEach(c => { if (C.suit(c) === st.trump && C.value(c) < low) { low = C.value(c); atk = s; } }));
      startRound(st, atk >= 0 ? atk : C.int(st, n));
      return st;
    },

    moves(st, s) {
      if (st.over) return [];
      const ms = [];
      if (s === st.def) {
        if (st.taking || allBeaten(st)) return [];
        st.table.forEach((p, i) => { if (!p.d) for (const c of st.hands[s]) if (beats(st, c, p.a)) ms.push({ a: 'def', i, c }); });
        ms.push({ a: 'take' });
        return ms;
      }
      if (!throwers(st).includes(s)) return [];
      for (const c of throwable(st, s)) ms.push({ a: 'atk', c });
      if (st.table.length && (st.taking || allBeaten(st)) && !st.passed.includes(s)) ms.push({ a: 'done' });
      return ms;
    },

    apply(st, s, m) {
      st.moves++;
      const hand = st.hands[s];
      if (m.a === 'atk') {
        hand.splice(hand.indexOf(m.c), 1);
        st.table.push({ a: m.c, d: null });
        st.passed = [];
        st.last = { s, a: 'atk', c: m.c };
      } else if (m.a === 'def') {
        hand.splice(hand.indexOf(m.c), 1);
        st.table[m.i].d = m.c;
        st.passed = [];
        st.last = { s, a: 'def', c: m.c };
      } else if (m.a === 'take') {
        st.taking = true; st.passed = [];
        st.last = { s, a: 'take' };
      } else if (m.a === 'done') {
        st.passed.push(s);
        st.last = { s, a: 'done' };
      }
      check(st);
    },

    view(st, s) {
      return { hand: st.hands[s].slice(), counts: st.hands.map(h => h.length), trump: st.trump,
        trumpCard: st.deck.length ? st.trumpCard : null, deckN: st.deck.length, discard: st.discard,
        table: st.table.map(p => ({ a: p.a, d: p.d })), atk: st.atk, def: st.def, limit: st.limit,
        taking: st.taking, passed: st.passed.slice(), throwers: throwers(st), out: st.out.slice(), last: st.last };
    },

    result: st => st.over ? { loser: st.loser, out: st.out.slice() } : null,

    /** Computer player: cheapest cards first, trumps kept for later */
    bot(st, s) {
      const ms = game.moves(st, s);
      const cost = c => C.value(c) + (C.suit(c) === st.trump ? 10 : 0);
      if (s === st.def) {
        const defs = ms.filter(m => m.a === 'def');
        // Can every open card be beaten with different cards? (cheapest first)
        const used = new Set(), plan = [];
        for (const [i, p] of st.table.entries()) {
          if (p.d) continue;
          const opts = defs.filter(m => m.i === i && !used.has(m.c)).sort((a, b) => cost(a.c) - cost(b.c));
          if (!opts.length) return { a: 'take' };
          used.add(opts[0].c); plan.push(opts[0]);
        }
        // Early in the game high trumps are too valuable for small cards
        if (st.deck.length > 8 && plan.some(m => cost(m.c) >= 16)) return { a: 'take' };
        return plan[0] || { a: 'take' };
      }
      const atks = ms.filter(m => m.a === 'atk').sort((a, b) => cost(a.c) - cost(b.c));
      if (!st.table.length) return atks[0];
      const cheap = atks.find(m => C.suit(m.c) !== st.trump || !st.deck.length);
      if (cheap && (cost(cheap.c) < 6 || !st.deck.length || st.taking)) return cheap;
      // Nothing worth adding: "done" once everything is beaten, otherwise wait for the defender (null)
      return ms.find(m => m.a === 'done') || null;
    },

    describe(m, st) {
      if (m.a === 'atk') return st && st.table.length ? `add ${C.name(m.c, 'en')} to the attack` : `attack with ${C.name(m.c, 'en')}`;
      if (m.a === 'def') return `beat ${st ? C.name(st.table[m.i].a, 'en') : 'card ' + m.i} with ${C.name(m.c, 'en')}`;
      if (m.a === 'take') return 'take all cards on the table';
      return 'done (add no more cards)';
    },

    /** English summary of the table for AI agents (WebMCP), from a player's view */
    summary: v => ({ trump: C.suitName(v.trump, 'en'), trump_card: v.trumpCard ? C.name(v.trumpCard, 'en') : null, deck: v.deckN,
      discarded: v.discard, attacker_seat: v.atk, defender_seat: v.def, defender_takes: v.taking, max_attack_cards: v.limit,
      table: v.table.map(p => ({ attack: C.name(p.a, 'en'), beaten_by: p.d ? C.name(p.d, 'en') : null })), out_seats: v.out }),

    ui: {
      sort(hand, v) {
        const tr = v.trump, order = ['C', 'S', 'H', 'D'].filter(s => s !== tr).concat(tr);
        return hand.slice().sort((a, b) => order.indexOf(C.suit(a)) - order.indexOf(C.suit(b)) || C.value(a) - C.value(b));
      },
      table(v, x) {
        const wrap = x.el('div', 'dk-table');
        const side = x.el('div', 'dk-side');
        const deck = x.el('div', 'pile dk-deck');
        if (v.trumpCard) {
          const tc = x.card(v.trumpCard); tc.classList.add('trump-card');
          deck.append(tc);
          if (v.deckN > 1) deck.append(x.back());
        } else deck.append(x.el('div', 'slot', C.SYM[v.trump]));
        deck.append(x.el('span', 'pile-lbl', x.t('dk.deck', { n: v.deckN })));
        side.append(deck,
          x.el('span', 'tag trump ' + (C.red(v.trump + '7') ? 'red' : 'black'), x.t('dk.trump', { s: C.SYM[v.trump] + ' ' + C.suitName(v.trump, x.lang) })),
          x.el('span', 'pile-lbl', x.t('dk.discard', { n: v.discard })));
        const pairs = x.el('div', 'dk-pairs');
        pairs.setAttribute('role', 'list');
        v.table.forEach(p => {
          const pair = x.el('div', 'pair' + (p.d ? ' beaten' : ''));
          pair.setAttribute('role', 'listitem');
          pair.append(x.card(p.a));
          if (p.d) { const d = x.card(p.d); d.classList.add('def'); pair.append(d); }
          pairs.append(pair);
        });
        if (!v.table.length) pairs.append(x.el('div', 'slot wide', x.t('dk.empty')));
        wrap.append(side, pairs);
        return wrap;
      },
      status(v, x) {
        const me = x.you;
        if (v.out.includes(me) || (!v.hand.length && !v.deckN)) return x.t('dk.you.out');
        if (me === v.def) {
          if (v.taking) return x.t('dk.you.waitAdd');
          if (v.table.some(p => !p.d)) return x.t('dk.you.def');
          return v.table.length ? x.t('dk.you.waitAdd') : x.t('dk.wait', { p: x.name(v.atk) });
        }
        if (v.throwers.includes(me)) {
          if (!v.table.length) return me === v.atk ? x.t('dk.you.lead') : x.t('dk.wait', { p: x.name(v.atk) });
          if (v.taking) return x.t('dk.you.addTake', { p: x.name(v.def) });
          if (v.table.some(p => !p.d)) return x.t(v.moves.length ? 'dk.you.addWhile' : 'dk.you.waitDef', { p: x.name(v.def) });
          return x.t('dk.you.add');
        }
        return v.table.length ? x.t('dk.you.waitDef', { p: x.name(v.def) }) : x.t('dk.wait', { p: x.name(v.atk) });
      },
      badge(v, s, x) {
        if (v.out.includes(s)) return x.t('dk.b.out');
        if (s === v.def) return v.taking ? x.t('dk.b.take') : x.t('dk.b.def');
        if (s === v.atk) return x.t('dk.b.atk');
        return '';
      },
      label(m, v, x) {
        if (m.a === 'def') return x.t('dk.on', { c: x.cardName(v.table[m.i].a) });
        if (m.a === 'atk') return x.cardName(m.c);
        return x.t(m.a === 'take' ? 'dk.take' : 'dk.done');
      },
      last(v, x) {
        const l = v.last; if (!l) return '';
        const p = x.name(l.s), mine = l.s === x.you;
        if (l.a === 'beaten') return x.t('dk.last.beaten', { n: l.n });
        if (l.a === 'took') return mine ? x.t('dk.last.youTook', { n: l.n }) : x.t('dk.last.took', { p, n: l.n });
        if (mine) return '';
        if (l.a === 'atk') return x.t('dk.last.atk', { p, c: x.cardName(l.c) });
        if (l.a === 'def') return x.t('dk.last.def', { p, c: x.cardName(l.c) });
        if (l.a === 'take') return x.t('dk.last.take', { p });
        return x.t('dk.last.done', { p });
      },
      over(v, x) {
        const r = v.over;
        if (r.loser == null) return x.t('dk.draw');
        return r.loser === x.you ? x.t('dk.youLost') : x.t('dk.loser', { p: x.name(r.loser) });
      },
      won: (r, you) => r.loser !== you,
    },
  };
  C.register(game);
})();
