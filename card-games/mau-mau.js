/* Mau Mau – rules, computer player and table view. Contract: card-games/README.md
   Rules (common German house rules):
   - 32 cards (7 to ace), 5 cards each, one card face up starts the discard pile.
   - Play a card of the same suit or the same rank as the top card.
   - 7: the next player draws 2 cards – unless they play a 7 too, then the one after draws 4, …
   - 8: the next player is skipped.
   - Jack: fits on every card except another jack; the player wishes a suit.
   - Cannot or will not play: draw one card. If it fits it may be played at once, otherwise pass.
   - Whoever gets rid of all cards first wins. An empty draw pile is refilled from the discard pile. */
(function () {
  'use strict';
  const C = window.CardGames;
  const HAND = 5;

  const top = st => st.pile[st.pile.length - 1];
  const nextSeat = (st, s, k) => (s + (k || 1) * st.dir + st.n * 4) % st.n;
  function fits(st, c) {
    const tp = top(st);
    if (C.rank(c) === 'J') return C.rank(tp) !== 'J';
    if (st.wish) return C.suit(c) === st.wish;
    return C.suit(c) === C.suit(tp) || C.rank(c) === C.rank(tp);
  }
  function drawOne(st) {
    if (!st.draw.length && st.pile.length > 1) {
      // Refill: everything but the top card, shuffled
      st.draw = C.shuffle(st, st.pile.slice(0, -1));
      st.pile = [top(st)];
      st.reshuffled = (st.reshuffled || 0) + 1;
    }
    return st.draw.pop() || null;
  }
  const playMoves = c => C.rank(c) === 'J' ? C.SUITS.map(w => ({ a: 'play', c, wish: w })) : [{ a: 'play', c }];

  const game = {
    id: 'mau-mau',
    players: { min: 2, max: 5 },
    strings: {
      de: {
        'mm.title': 'Mau Mau', 'mm.desc': 'Farbe auf Farbe, Wert auf Wert – wer zuerst alle Karten los ist, gewinnt. 2–5 Spieler.',
        'mm.draw': 'Karte ziehen', 'mm.drawPen': '{n} Karten ziehen', 'mm.pass': 'Weiter',
        'mm.wish': '{s} wünschen', 'mm.drawPile': 'Stapel: {n} Karten', 'mm.pile': 'Ablage',
        'mm.wishIs': 'Wunsch: {s}', 'mm.penIs': '+{n} Karten',
        'mm.you.pen': 'Leg eine 7 oder zieh {n} Karten.', 'mm.you.drew': 'Gezogene Karte legen oder „Weiter“.',
        'mm.you.play': 'Du bist dran: passende Karte legen oder ziehen.', 'mm.wait': '{p} ist dran.',
        'mm.last.play': '{p} legt {c}.', 'mm.last.wish': '{p} legt {c} und wünscht {s}.', 'mm.last.draw': '{p} zieht eine Karte.',
        'mm.last.drawN': '{p} zieht {n} Karten.', 'mm.last.pass': '{p} sagt weiter.', 'mm.last.skip': '{p} muss aussetzen.', 'mm.last.youSkip': 'Du musst aussetzen.',
        'mm.won': '{p} gewinnt!', 'mm.youWon': 'Du gewinnst! 🎉', 'mm.mau': 'Mau!',
      },
      en: {
        'mm.title': 'Mau Mau', 'mm.desc': 'Suit on suit, rank on rank – whoever gets rid of all cards first wins. 2–5 players.',
        'mm.draw': 'Draw a card', 'mm.drawPen': 'Draw {n} cards', 'mm.pass': 'Pass',
        'mm.wish': 'Wish {s}', 'mm.drawPile': 'Deck: {n} cards', 'mm.pile': 'Discard pile',
        'mm.wishIs': 'Wish: {s}', 'mm.penIs': '+{n} cards',
        'mm.you.pen': 'Play a 7 or draw {n} cards.', 'mm.you.drew': 'Play the drawn card or “Pass”.',
        'mm.you.play': 'Your turn: play a matching card or draw.', 'mm.wait': '{p} is playing.',
        'mm.last.play': '{p} plays {c}.', 'mm.last.wish': '{p} plays {c} and wishes {s}.', 'mm.last.draw': '{p} draws a card.',
        'mm.last.drawN': '{p} draws {n} cards.', 'mm.last.pass': '{p} passes.', 'mm.last.skip': '{p} is skipped.', 'mm.last.youSkip': 'You are skipped.',
        'mm.won': '{p} wins!', 'mm.youWon': 'You win! 🎉', 'mm.mau': 'Mau!',
      },
    },

    setup(n, seed) {
      const st = { n, rs: seed | 0, dir: 1, wish: null, pen: 0, drew: null, last: null, winner: null, moves: 0 };
      st.draw = C.shuffle(st, C.deck('7'));
      st.hands = Array.from({ length: n }, () => []);
      for (let k = 0; k < HAND; k++) for (let s = 0; s < n; s++) st.hands[s].push(st.draw.pop());
      st.pile = [st.draw.pop()];
      st.turn = C.int(st, n);
      return st;
    },

    moves(st, s) {
      if (st.winner != null || s !== st.turn) return [];
      const hand = st.hands[s];
      if (st.pen > 0) return [...hand.filter(c => C.rank(c) === '7').map(c => ({ a: 'play', c })), { a: 'draw' }];
      if (st.drew) return [...(hand.includes(st.drew) && fits(st, st.drew) ? playMoves(st.drew) : []), { a: 'pass' }];
      return [...hand.filter(c => fits(st, c)).flatMap(playMoves), { a: 'draw' }];
    },

    apply(st, s, m) {
      st.moves++;
      const hand = st.hands[s];
      if (m.a === 'play') {
        hand.splice(hand.indexOf(m.c), 1);
        st.pile.push(m.c);
        st.wish = m.wish || null;
        st.drew = null;
        st.last = { s, a: 'play', c: m.c, wish: m.wish || null };
        if (!hand.length) { st.winner = s; return; }
        const r = C.rank(m.c);
        if (r === '7') { st.pen += 2; st.turn = nextSeat(st, s); }
        else if (r === '8') { st.last.skip = nextSeat(st, s); st.turn = nextSeat(st, s, 2); }
        else st.turn = nextSeat(st, s);
      } else if (m.a === 'draw') {
        if (st.pen > 0) {
          let k = 0;
          for (; k < st.pen; k++) { const c = drawOne(st); if (!c) break; hand.push(c); }
          st.last = { s, a: 'draw', n: k };
          st.pen = 0;
          st.turn = nextSeat(st, s);
        } else {
          const c = drawOne(st);
          st.last = { s, a: 'draw', n: c ? 1 : 0 };
          if (c) { hand.push(c); st.drew = c; } else st.turn = nextSeat(st, s);   // nothing left to draw: next player
        }
      } else if (m.a === 'pass') {
        st.drew = null;
        st.last = { s, a: 'pass' };
        st.turn = nextSeat(st, s);
      }
    },

    view(st, s) {
      return { hand: st.hands[s].slice(), counts: st.hands.map(h => h.length), top: top(st), pileN: st.pile.length,
        drawN: st.draw.length, wish: st.wish, pen: st.pen, turn: st.turn, drew: s === st.turn ? st.drew : null, last: st.last };
    },

    result: st => st.winner == null ? null : { winner: st.winner, counts: st.hands.map(h => h.length) },

    /** Computer player: keeps jacks for later, wishes its strongest suit */
    bot(st, s) {
      const ms = game.moves(st, s), hand = st.hands[s];
      const plays = ms.filter(m => m.a === 'play');
      if (!plays.length) return ms[ms.length - 1];
      const nextCards = st.hands[nextSeat(st, s)].length;
      const score = m => {
        const r = C.rank(m.c);
        let v = hand.filter(c => c !== m.c && C.suit(c) === C.suit(m.c)).length;   // keep options open
        if (r === 'J') v -= 10;                                                    // jack is the joker
        if ((r === '7' || r === '8') && nextCards <= 2) v += 5;                     // slow down a player near the end
        if (m.wish) v += hand.filter(c => c !== m.c && C.suit(c) === m.wish && C.rank(c) !== 'J').length * 2;
        return v;
      };
      return plays.reduce((b, m) => score(m) > score(b) ? m : b);
    },

    /** English, for AI agents (WebMCP) */
    describe(m, st) {
      if (m.a === 'play') return `play ${C.name(m.c, 'en')}` + (m.wish ? ` and wish ${C.suitName(m.wish, 'en')}` : '');
      if (m.a === 'draw') return st && st.pen ? `draw ${st.pen} cards` : 'draw a card';
      return 'pass (end the turn)';
    },

    /** English summary of the table for AI agents (WebMCP), from a player's view */
    summary: v => ({ top_card: C.name(v.top, 'en'), wished_suit: v.wish ? C.suitName(v.wish, 'en') : null,
      cards_to_draw: v.pen || 0, deck: v.drawN, drawn_card: v.drew ? C.name(v.drew, 'en') : null, current_seat: v.turn }),

    ui: {
      sort(hand) {
        const order = ['C', 'S', 'H', 'D'];
        return hand.slice().sort((a, b) => order.indexOf(C.suit(a)) - order.indexOf(C.suit(b)) || C.value(a) - C.value(b));
      },
      table(v, x) {
        const wrap = x.el('div', 'mm-table');
        const drawBox = x.el('div', 'pile');
        drawBox.append(v.drawN ? x.back() : x.el('div', 'slot'), x.el('span', 'pile-lbl', x.t('mm.drawPile', { n: v.drawN })));
        const pileBox = x.el('div', 'pile');
        const topCard = x.card(v.top);
        pileBox.append(topCard, x.el('span', 'pile-lbl', x.t('mm.pile')));
        wrap.append(drawBox, pileBox);
        if (v.wish || v.pen) {
          const info = x.el('div', 'mm-info');
          if (v.wish) {
            const w = x.el('span', 'tag wish ' + (C.red(v.wish + '7') ? 'red' : 'black'), x.t('mm.wishIs', { s: C.SYM[v.wish] + ' ' + C.suitName(v.wish, x.lang) }));
            info.append(w);
          }
          if (v.pen) info.append(x.el('span', 'tag pen', x.t('mm.penIs', { n: v.pen })));
          wrap.append(info);
        }
        return wrap;
      },
      status(v, x) {
        if (v.turn !== x.you) return x.t('mm.wait', { p: x.name(v.turn) });
        if (v.pen) return x.t('mm.you.pen', { n: v.pen });
        if (v.drew) return x.t('mm.you.drew');
        return x.t('mm.you.play');
      },
      badge: () => '',
      label(m, v, x) {
        if (m.a === 'play') return m.wish ? x.t('mm.wish', { s: C.SYM[m.wish] + ' ' + C.suitName(m.wish, x.lang) }) : x.cardName(m.c);
        if (m.a === 'draw') return v.pen ? x.t('mm.drawPen', { n: v.pen }) : x.t('mm.draw');
        return x.t('mm.pass');
      },
      last(v, x) {
        const l = v.last; if (!l) return '';
        const p = x.name(l.s);
        let s = '';
        if (l.s === x.you) { /* own move: known already */ }
        else if (l.a === 'play') s = l.wish ? x.t('mm.last.wish', { p, c: x.cardName(l.c), s: C.suitName(l.wish, x.lang) }) : x.t('mm.last.play', { p, c: x.cardName(l.c) });
        else if (l.a === 'draw') s = l.n === 1 ? x.t('mm.last.draw', { p }) : x.t('mm.last.drawN', { p, n: l.n });
        else s = x.t('mm.last.pass', { p });
        if (l.skip != null) s += ' ' + (l.skip === x.you ? x.t('mm.last.youSkip') : x.t('mm.last.skip', { p: x.name(l.skip) }));
        if (l.a === 'play' && l.s !== x.you && v.counts[l.s] === 1) s += ' ' + x.t('mm.mau');
        return s.trim();
      },
      over(v, x) { const r = v.over; return r.winner === x.you ? x.t('mm.youWon') : x.t('mm.won', { p: x.name(r.winner) }); },
      won: (r, you) => r.winner === you,
    },
  };
  C.register(game);
})();
