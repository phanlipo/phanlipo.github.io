/* Skat – rules, computer player and table view. Contract: card-games/README.md
   Rules (international Skat order, without Ramsch and Kontra):
   - 3 players, 32 cards, 10 each, 2 face down are the Skat. Forehand (Vorhand) is the player after the dealer,
     then middlehand (Mittelhand) and rearhand (Hinterhand, the dealer).
   - Bidding: middlehand bids to forehand (18, 20, 22, 23, 24, 27 …), forehand holds ("Ja") or passes.
     Then rearhand bids to the winner. Whoever stays is the declarer. Nobody bids: forehand may play at 18, otherwise new deal.
   - The declarer takes the Skat and puts two cards away ("drücken") or plays hand, then names the game:
     suit (clubs 12, spades 11, hearts 10, diamonds 9), grand (24, only jacks are trump) or null (23, hand 35, ouvert 46, ouvert hand 59).
   - Trumps: jacks (clubs, spades, hearts, diamonds), then A 10 K Q 9 8 7 of the trump suit. Follow suit (jacks count as trump).
     Null: no trumps, order A K Q J 10 9 8 7, the declarer must not win a single trick.
   - Card points: ace 11, ten 10, king 4, queen 3, jack 2. The declarer wins with 61 of 120 points (Skat included).
   - Game value = base × (matadors "with/without" + 1 game + hand + schneider (90 / 30 points) + schwarz (all tricks)).
     A value below the bid loses (overbid: as the next multiple of the base above the bid). Won: +value, lost: −2 × value. */
(function () {
  'use strict';
  const C = window.CardGames;
  const BASE = { D: 9, H: 10, S: 11, C: 12, G: 24 };
  const NULL = { '': 23, h: 35, o: 46, oh: 59 };
  const PTS = { A: 11, 10: 10, K: 4, Q: 3, J: 2 };
  const JACKS = ['D', 'H', 'S', 'C'];                         // weakest to strongest
  const ORDER = ['7', '8', '9', 'Q', 'K', '10', 'A'];          // suit and grand (jacks apart)
  const ORDER_NULL = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  const SUIT_ORDER = ['C', 'S', 'H', 'D'];
  const BIDS = (() => {
    const v = new Set(Object.values(NULL));
    for (const b of Object.values(BASE)) for (let m = 2; m <= 18; m++) if (b * m <= 264) v.add(b * m);
    return [...v].filter(x => x >= 18).sort((a, b) => a - b);
  })();

  const pts = c => PTS[C.rank(c)] || 0;
  const isTrump = (c, g) => g !== 'N' && (C.rank(c) === 'J' || C.suit(c) === g);
  const kind = (c, g) => isTrump(c, g) ? 'T' : C.suit(c);
  function power(c, g) {
    if (g === 'N') return ORDER_NULL.indexOf(C.rank(c));
    if (C.rank(c) === 'J') return 120 + JACKS.indexOf(C.suit(c));
    return (isTrump(c, g) ? 100 : 0) + ORDER.indexOf(C.rank(c));
  }
  /** Seat that wins a full trick [{s, c}] */
  function trickWinner(trick, g) {
    // The best card so far is always of the led suit or a trump; only a higher card of its kind or a first trump beats it
    let best = trick[0];
    for (const p of trick.slice(1)) {
      const k = kind(p.c, g), bk = kind(best.c, g);
      if (k === bk ? power(p.c, g) > power(best.c, g) : k === 'T') best = p;
    }
    return best.s;
  }
  /** Matadors: how many top trumps in a row the declarer has ("with") or lacks ("without") */
  function matadors(cards, g) {
    const seq = ['CJ', 'SJ', 'HJ', 'DJ', ...(g === 'G' ? [] : ['A', '10', 'K', 'Q', '9', '8', '7'].map(r => g + r))];
    const has = seq.map(c => cards.includes(c));
    let k = 0;
    while (k < seq.length && has[k] === has[0]) k++;
    return k;
  }
  /** Value of a suit/grand game before the result (hand counts) – what the declarer can know at least */
  const minValue = (cards, g, hand) => g === 'N' ? 0 : BASE[g] * (matadors(cards, g) + 1 + (hand ? 1 : 0));
  const nullValue = (hand, open) => NULL[(open ? 'o' : '') + (hand ? 'h' : '')];
  const fore = st => (st.dealer + 1) % 3, mid = st => (st.dealer + 2) % 3, rear = st => st.dealer;

  function deal(st) {
    st.dealer = (st.dealer + 1) % 3;
    const deck = C.shuffle(st, C.deck('7'));
    st.hands = [0, 1, 2].map(() => []);
    // 3 – Skat – 4 – 3, as at the table
    for (const k of [3, 4, 3]) for (let i = 0; i < 3; i++) st.hands[(st.dealer + 1 + i) % 3].push(...deck.splice(0, k));
    st.skat = deck.splice(0, 2);
    st.phase = 'bid'; st.bid = 0; st.stage = 1; st.sayer = mid(st); st.listener = fore(st); st.waiting = 'say'; st.win1 = -1;
    st.decl = -1; st.game = null; st.isHand = false; st.pushed = []; st.trick = []; st.prevTrick = null;
    st.won = [[], [], []]; st.tricksN = [0, 0, 0]; st.turn = st.sayer;
  }
  function stage2(st, winner) {
    st.win1 = winner; st.stage = 2; st.sayer = rear(st); st.listener = winner; st.waiting = 'say'; st.turn = st.sayer;
  }
  function declarer(st, s) {
    st.decl = s; st.phase = 'skat'; st.turn = s;
    if (!st.bid) st.bid = 18;
  }
  function score(st) {
    const g = st.game.g, d = st.decl, cards = [...st.declCards];
    const res = { decl: d, g, hand: st.isHand, open: !!st.game.o, bid: st.bid, skat: st.skatCards.slice() };
    if (g === 'N') {
      res.value = nullValue(st.isHand, st.game.o);
      res.won = st.tricksN[d] === 0 && res.value >= st.bid;
      res.overbid = res.value < st.bid;
    } else {
      const p = st.won[d].reduce((a, c) => a + pts(c), 0) + st.skatCards.reduce((a, c) => a + pts(c), 0);
      res.points = p;
      res.schneider = p >= 90 || p <= 30;
      res.schwarz = st.tricksN[d] === 10 || st.tricksN[d] === 0;
      const mult = matadors(cards, g) + 1 + (st.isHand ? 1 : 0) + (res.schneider ? 1 : 0) + (res.schwarz ? 1 : 0);
      res.value = BASE[g] * mult;
      res.won = p >= 61;
      if (res.value < st.bid) { res.overbid = true; res.won = false; res.value = BASE[g] * Math.ceil(st.bid / BASE[g]); }
    }
    res.score = res.won ? res.value : -2 * res.value;
    res.scores = [0, 1, 2].map(s => s === d ? res.score : 0);
    st.over = res;
    st.phase = 'done';
  }

  /* ---------- Computer: hand strength ---------- */
  function bestGame(cards) {
    // Rough rule of thumb: enough trumps and aces → highest playable suit game or grand, with its value
    const jacks = cards.filter(c => C.rank(c) === 'J').length;
    const aces = s => cards.filter(c => C.rank(c) === 'A' && C.suit(c) !== s).length;
    let best = null;
    for (const g of SUIT_ORDER) {
      const tr = cards.filter(c => isTrump(c, g)).length;
      const strength = tr + aces(g) * 0.8 + jacks * 0.4;
      if (tr >= 5 && strength >= (cards.length > 10 ? 8 : 7.2)) {
        const v = minValue(cards, g, false);
        if (!best || tr > best.tr || (tr === best.tr && v > best.v)) best = { g, v, tr };
      }
    }
    const allAces = cards.filter(c => C.rank(c) === 'A').length;
    if ((jacks >= 3 && allAces >= 2) || (jacks === 4 && allAces >= 1) || (jacks >= 2 && cards.includes('CJ') && allAces >= 3))
      best = { g: 'G', v: minValue(cards, 'G', false), tr: jacks };
    return best;
  }

  const game = {
    id: 'skat',
    players: { min: 3, max: 3 },
    strings: {
      de: {
        'sk.title': 'Skat', 'sk.desc': 'Reizen, drücken, Stiche machen – der Alleinspieler braucht 61 Augen. Genau 3 Spieler.',
        'sk.bid': '{n} sagen', 'sk.play18': 'Spielen (18)', 'sk.yes': 'Ja ({n})', 'sk.pass': 'Passe', 'sk.skat': 'Skat aufnehmen', 'sk.hand': 'Handspiel',
        'sk.g.C': 'Kreuz', 'sk.g.S': 'Pik', 'sk.g.H': 'Herz', 'sk.g.D': 'Karo', 'sk.g.G': 'Grand', 'sk.g.N': 'Null', 'sk.g.NO': 'Null ouvert',
        'sk.val': '{g} ({n})', 'sk.handG': '{g} Hand',
        'sk.b.fore': 'Vorhand', 'sk.b.mid': 'Mittelhand', 'sk.b.rear': 'Hinterhand', 'sk.b.decl': 'Alleinspieler',
        'sk.bidIs': 'Gereizt: {n}', 'sk.noBid': 'Noch nichts gereizt', 'sk.gameIs': '{g} · Reizwert {n}', 'sk.declIs': 'Alleinspieler: {p}',
        'sk.skatN': 'Skat', 'sk.pushed': 'Gedrückt', 'sk.tricks': 'Stiche: {n}', 'sk.open': 'Offene Karten von {p}', 'sk.prevTrick': 'Letzter Stich',
        'sk.you.say': 'Reizen: {n} sagen oder passen.', 'sk.you.hear': '{p} sagt {n} – hältst du?', 'sk.you.v18': 'Keiner hat gereizt – spielst du für 18?',
        'sk.you.skat': 'Du spielst! Skat aufnehmen oder Hand spielen.', 'sk.you.push': 'Drück {n} Karten: antippen.', 'sk.you.decl': 'Sag dein Spiel an.',
        'sk.you.lead': 'Du spielst aus.', 'sk.you.follow': 'Du bist dran: Farbe bedienen.',
        'sk.wait.bid': '{p} reizt.', 'sk.wait.decl': '{p} überlegt das Spiel.', 'sk.wait': '{p} ist dran.',
        'sk.last.bid': '{p} sagt {n}.', 'sk.last.yes': '{p}: ja.', 'sk.last.pass': '{p}: passe.', 'sk.last.skat': '{p} nimmt den Skat auf.',
        'sk.last.hand': '{p} spielt Hand.', 'sk.last.game': '{p} spielt {g}.', 'sk.last.trick': '{p} bekommt den Stich.', 'sk.last.redeal': 'Alle haben gepasst – neu gegeben.',
        'sk.last.youTrick': 'Du bekommst den Stich.',
        'sk.res.won': '{p} gewinnt {g} mit {a} Augen: +{n}.', 'sk.res.lost': '{p} verliert {g} mit {a} Augen: −{n}.',
        'sk.res.nullWon': '{p} gewinnt {g}: +{n}.', 'sk.res.nullLost': '{p} verliert {g}: −{n}.',
        'sk.res.youWon': 'Du gewinnst {g} mit {a} Augen: +{n}.', 'sk.res.youLost': 'Du verlierst {g} mit {a} Augen: −{n}.',
        'sk.res.youNullWon': 'Du gewinnst {g}: +{n}.', 'sk.res.youNullLost': 'Du verlierst {g}: −{n}.', 'sk.res.over': ' Überreizt!',
        'sk.res.schneider': ' Schneider.', 'sk.res.schwarz': ' Schwarz.', 'sk.res.skat': ' Im Skat: {a} und {b}.',
      },
      en: {
        'sk.title': 'Skat', 'sk.desc': 'Bid, discard, take tricks – the declarer needs 61 points. Exactly 3 players.',
        'sk.bid': 'Bid {n}', 'sk.play18': 'Play (18)', 'sk.yes': 'Hold ({n})', 'sk.pass': 'Pass', 'sk.skat': 'Pick up the Skat', 'sk.hand': 'Play hand',
        'sk.g.C': 'Clubs', 'sk.g.S': 'Spades', 'sk.g.H': 'Hearts', 'sk.g.D': 'Diamonds', 'sk.g.G': 'Grand', 'sk.g.N': 'Null', 'sk.g.NO': 'Null ouvert',
        'sk.val': '{g} ({n})', 'sk.handG': '{g} hand',
        'sk.b.fore': 'Forehand', 'sk.b.mid': 'Middlehand', 'sk.b.rear': 'Rearhand', 'sk.b.decl': 'Declarer',
        'sk.bidIs': 'Bid: {n}', 'sk.noBid': 'No bid yet', 'sk.gameIs': '{g} · bid {n}', 'sk.declIs': 'Declarer: {p}',
        'sk.skatN': 'Skat', 'sk.pushed': 'Discarded', 'sk.tricks': 'Tricks: {n}', 'sk.open': 'Open cards of {p}', 'sk.prevTrick': 'Last trick',
        'sk.you.say': 'Bidding: bid {n} or pass.', 'sk.you.hear': '{p} bids {n} – do you hold?', 'sk.you.v18': 'Nobody has bid – do you play for 18?',
        'sk.you.skat': 'You play! Pick up the Skat or play hand.', 'sk.you.push': 'Discard {n} cards: tap them.', 'sk.you.decl': 'Name your game.',
        'sk.you.lead': 'Your lead.', 'sk.you.follow': 'Your turn: follow suit.',
        'sk.wait.bid': '{p} is bidding.', 'sk.wait.decl': '{p} chooses the game.', 'sk.wait': '{p} is playing.',
        'sk.last.bid': '{p} bids {n}.', 'sk.last.yes': '{p}: hold.', 'sk.last.pass': '{p}: pass.', 'sk.last.skat': '{p} picks up the Skat.',
        'sk.last.hand': '{p} plays hand.', 'sk.last.game': '{p} plays {g}.', 'sk.last.trick': '{p} takes the trick.', 'sk.last.redeal': 'Everyone passed – new deal.',
        'sk.last.youTrick': 'You take the trick.',
        'sk.res.won': '{p} wins {g} with {a} points: +{n}.', 'sk.res.lost': '{p} loses {g} with {a} points: −{n}.',
        'sk.res.nullWon': '{p} wins {g}: +{n}.', 'sk.res.nullLost': '{p} loses {g}: −{n}.',
        'sk.res.youWon': 'You win {g} with {a} points: +{n}.', 'sk.res.youLost': 'You lose {g} with {a} points: −{n}.',
        'sk.res.youNullWon': 'You win {g}: +{n}.', 'sk.res.youNullLost': 'You lose {g}: −{n}.', 'sk.res.over': ' Overbid!',
        'sk.res.schneider': ' Schneider.', 'sk.res.schwarz': ' Schwarz.', 'sk.res.skat': ' In the Skat: {a} and {b}.',
      },
    },

    setup(n, seed) {
      const st = { n: 3, rs: seed | 0, last: null, over: null, moves: 0, deals: 0 };
      st.dealer = C.int(st, 3);
      deal(st);
      return st;
    },

    moves(st, s) {
      if (st.over || s !== st.turn) return [];
      const next = BIDS.find(b => b > st.bid);
      switch (st.phase) {
        case 'bid':
          if (st.stage === 3) return [{ a: 'bid' }, { a: 'pass' }];
          if (st.waiting === 'say') return next ? [{ a: 'bid' }, { a: 'pass' }] : [{ a: 'pass' }];
          return [{ a: 'yes' }, { a: 'pass' }];
        case 'skat': return [{ a: 'skat' }, { a: 'hand' }];
        case 'push': return [...new Set(st.hands[s])].map(c => ({ a: 'push', c }));
        case 'declare': return [...SUIT_ORDER, 'G', 'N'].map(g => ({ a: 'game', g })).concat([{ a: 'game', g: 'N', o: true }]);
        case 'play': {
          const hand = st.hands[s], g = st.game.g;
          if (!st.trick.length) return hand.map(c => ({ a: 'play', c }));
          const led = kind(st.trick[0].c, g);
          const follow = hand.filter(c => kind(c, g) === led);
          return (follow.length ? follow : hand).map(c => ({ a: 'play', c }));
        }
      }
      return [];
    },

    apply(st, s, m) {
      st.moves++;
      if (st.phase === 'bid') {
        st.last = { s, a: m.a };
        if (st.stage === 3) {
          if (m.a === 'bid') { st.last.n = 18; declarer(st, s); }
          else { st.deals++; deal(st); st.last = { s, a: 'redeal' }; }
          return;
        }
        if (m.a === 'bid') { st.bid = BIDS.find(b => b > st.bid); st.last.n = st.bid; st.waiting = 'hear'; st.turn = st.listener; return; }
        if (m.a === 'yes') { st.last.n = st.bid; st.waiting = 'say'; st.turn = st.sayer; return; }
        // pass
        const other = s === st.sayer ? st.listener : st.sayer;
        if (st.stage === 1) { stage2(st, other); return; }
        if (!st.bid) { st.stage = 3; st.turn = fore(st); st.sayer = st.listener = fore(st); return; }
        declarer(st, other);
        return;
      }
      if (m.a === 'skat') {
        st.hands[s].push(...st.skat); st.skat = []; st.phase = 'push'; st.last = { s, a: 'skat' };
      } else if (m.a === 'hand') {
        st.isHand = true; st.phase = 'declare'; st.last = { s, a: 'hand' };
      } else if (m.a === 'push') {
        const h = st.hands[s];
        h.splice(h.indexOf(m.c), 1);
        st.pushed.push(m.c);
        if (st.pushed.length === 2) { st.skat = st.pushed.slice(); st.phase = 'declare'; }
      } else if (m.a === 'game') {
        st.game = { g: m.g, o: !!m.o };
        st.skatCards = st.skat.slice();
        st.declCards = [...st.hands[s], ...st.skat];
        st.phase = 'play'; st.turn = fore(st);
        st.last = { s, a: 'game', g: m.g + (m.o ? 'O' : ''), hand: st.isHand };
      } else if (m.a === 'play') {
        const h = st.hands[s];
        h.splice(h.indexOf(m.c), 1);
        st.trick.push({ s, c: m.c });
        st.last = { s, a: 'play', c: m.c };
        if (st.trick.length < 3) { st.turn = (s + 1) % 3; return; }
        const w = trickWinner(st.trick, st.game.g);
        st.won[w].push(...st.trick.map(p => p.c));
        st.tricksN[w]++;
        st.prevTrick = st.trick; st.trick = [];
        st.last = { s: w, a: 'trick', c: m.c };
        st.turn = w;
        if ((st.game.g === 'N' && w === st.decl) || !st.hands[0].length) score(st);
      }
    },

    view(st, s) {
      const declOpen = st.game && st.game.o && st.decl !== s && st.phase === 'play';
      return { hand: st.hands[s].slice(), counts: st.hands.map(h => h.length), phase: st.phase, bid: st.bid, stage: st.stage,
        sayer: st.sayer, listener: st.listener, waiting: st.waiting, turn: st.turn, decl: st.decl, contract: st.game,
        isHand: st.isHand, dealer: st.dealer, fore: fore(st), mid: mid(st), rear: rear(st), skatN: st.skat.length,
        pushed: s === st.decl ? st.pushed.slice() : [], trick: st.trick.map(p => ({ s: p.s, c: p.c })),
        prevTrick: st.prevTrick ? st.prevTrick.map(p => ({ s: p.s, c: p.c })) : null, tricksN: st.tricksN.slice(),
        open: declOpen ? st.hands[st.decl].slice() : null, next: BIDS.find(b => b > st.bid) || null, last: st.last,
        values: s === st.decl && st.phase === 'declare'
          ? Object.fromEntries([...SUIT_ORDER, 'G'].map(g => [g, st.isHand ? null : minValue([...st.hands[s], ...st.skat], g, false)])) : null };
    },

    result: st => st.over,

    bot(st, s) {
      const ms = game.moves(st, s);
      if (!ms.length) return null;
      const hand = st.hands[s];
      if (st.phase === 'bid') {
        const bg = bestGame(hand), max = bg ? bg.v : 0;
        if (st.stage === 3) return max >= 18 ? { a: 'bid' } : { a: 'pass' };
        if (st.waiting === 'say') { const nx = BIDS.find(b => b > st.bid); return nx && nx <= max ? { a: 'bid' } : { a: 'pass' }; }
        return st.bid <= max ? { a: 'yes' } : { a: 'pass' };
      }
      if (st.phase === 'skat') return { a: 'skat' };
      if (st.phase === 'push') {
        const bg = bestGame(hand) || { g: SUIT_ORDER.reduce((b, g) => hand.filter(c => isTrump(c, g)).length > hand.filter(c => isTrump(c, b)).length ? g : b) };
        const g = bg.g;
        const cnt = x => hand.filter(c => !isTrump(c, g) && C.suit(c) === x).length;
        const hasAce = x => hand.includes(x + 'A');
        const keep = c => (isTrump(c, g) ? 100 : 0) + (C.rank(c) === 'A' ? 50 : 0) - (C.rank(c) === '10' && !hasAce(C.suit(c)) ? 30 : 0) + cnt(C.suit(c)) * 4 - pts(c);
        return ms.reduce((b, m) => keep(m.c) < keep(b.c) ? m : b);
      }
      if (st.phase === 'declare') {
        const cards = [...hand, ...st.skat];
        const bg = bestGame(hand);
        const options = [...SUIT_ORDER, 'G'].map(g => ({ g, v: minValue(cards, g, st.isHand), tr: hand.filter(c => isTrump(c, g)).length }));
        let pick = bg && minValue(cards, bg.g, st.isHand) >= st.bid ? bg.g : null;
        if (!pick) {
          const ok = options.filter(o => o.v >= st.bid).sort((a, b) => b.tr - a.tr);
          pick = ok.length ? ok[0].g : options.sort((a, b) => b.tr - a.tr)[0].g;
        }
        return { a: 'game', g: pick };
      }
      // Playing a card
      const g = st.game.g, decl = s === st.decl;
      const byPow = (a, b) => power(a.c, g) - power(b.c, g);
      const sorted = ms.slice().sort(byPow);
      if (g === 'N') {
        if (!decl) return st.trick.length ? sorted[sorted.length - 1] : sorted[0];
        if (!st.trick.length) return sorted[0];
        // Highest card that still stays under the trick
        const under = sorted.filter(m => trickWinner([...st.trick, { s, c: m.c }], g) !== s);
        return under.length ? under[under.length - 1] : sorted[0];
      }
      if (!st.trick.length) {
        const trumps = sorted.filter(m => isTrump(m.c, g));
        if (decl && trumps.length >= 2) return trumps[trumps.length - 1];
        const ace = sorted.find(m => !isTrump(m.c, g) && C.rank(m.c) === 'A');
        if (ace) return ace;
        const side = sorted.filter(m => !isTrump(m.c, g));
        return (side.length ? side : sorted).slice().sort((a, b) => pts(a.c) - pts(b.c) || byPow(a, b))[0];
      }
      const cur = trickWinner(st.trick, g);
      const partner = !decl && cur !== st.decl;
      const last = st.trick.length === 2;
      if (partner && (last || power(st.trick.find(p => p.s === cur).c, g) >= 105)) return ms.slice().sort((a, b) => pts(b.c) - pts(a.c) || byPow(a, b))[0];
      const winners = sorted.filter(m => trickWinner([...st.trick, { s, c: m.c }], g) === s);
      const onTable = st.trick.reduce((a, p) => a + pts(p.c), 0);
      if (winners.length && (last || onTable >= 4 || decl)) return winners[0];
      return ms.slice().sort((a, b) => pts(a.c) - pts(b.c) || byPow(a, b))[0];
    },

    describe(m, v) {
      switch (m.a) {
        case 'bid': return v && v.stage === 3 ? 'play for 18' : `bid ${v && v.next ? v.next : 'the next value'}`;
        case 'yes': return `hold ${v ? v.bid : ''}`.trim();
        case 'pass': return 'pass';
        case 'skat': return 'pick up the Skat';
        case 'hand': return 'play hand (without the Skat)';
        case 'push': return `discard ${C.name(m.c, 'en')} into the Skat`;
        case 'game': return 'declare ' + (m.g === 'N' ? (m.o ? 'null ouvert' : 'null') : m.g === 'G' ? 'grand' : C.suitName(m.g, 'en') + ' (suit game)');
        default: return `play ${C.name(m.c, 'en')}`;
      }
    },

    summary: v => ({ phase: v.phase, bid: v.bid, declarer_seat: v.decl >= 0 ? v.decl : null, forehand_seat: v.fore,
      game: v.contract ? (v.contract.g === 'N' ? (v.contract.o ? 'null ouvert' : 'null') : v.contract.g === 'G' ? 'grand' : C.suitName(v.contract.g, 'en')) + (v.isHand ? ' hand' : '') : null,
      trick: v.trick.map(p => ({ seat: p.s, card: C.name(p.c, 'en') })), tricks_won: v.tricksN,
      declarer_open_cards: v.open ? v.open.map(c => C.name(c, 'en')) : null, discarded: v.pushed.map(c => C.name(c, 'en')) }),

    ui: {
      handPlain: v => v.phase !== 'play' && v.phase !== 'push',
      sort(hand, v) {
        const g = v.contract ? v.contract.g : null;
        const so = g && g !== 'N' && g !== 'G' ? [g, ...SUIT_ORDER.filter(x => x !== g)] : SUIT_ORDER;
        const key = c => {
          if (g === 'N') return so.indexOf(C.suit(c)) * 10 - ORDER_NULL.indexOf(C.rank(c));
          if (C.rank(c) === 'J') return -10 - JACKS.indexOf(C.suit(c));
          return so.indexOf(C.suit(c)) * 10 - ORDER.indexOf(C.rank(c));
        };
        return hand.slice().sort((a, b) => key(a) - key(b));
      },
      gameName(g, o, hand, x) {
        const n = x.t(g === 'N' && o ? 'sk.g.NO' : 'sk.g.' + g);
        return hand ? x.t('sk.handG', { g: n }) : n;
      },
      table(v, x) {
        const wrap = x.el('div', 'sk-table');
        const info = x.el('p', 'sk-info');
        if (v.contract) info.append(x.el('span', 'tag', x.t('sk.gameIs', { g: game.ui.gameName(v.contract.g, v.contract.o, v.isHand, x), n: v.bid })),
          x.el('span', 'pile-lbl', x.t('sk.declIs', { p: x.name(v.decl) })));
        else info.append(x.el('span', 'tag', v.bid ? x.t('sk.bidIs', { n: v.bid }) : x.t('sk.noBid')));
        wrap.append(info);
        const mid = x.el('div', 'sk-mid');
        if (v.phase === 'bid' || v.phase === 'skat') {
          const sk = x.el('div', 'pile');
          const two = x.el('div', 'sk-two');
          for (let i = 0; i < v.skatN; i++) two.append(x.back());
          sk.append(two, x.el('span', 'pile-lbl', x.t('sk.skatN')));
          mid.append(sk);
        } else if (v.phase === 'push' || v.phase === 'declare') {
          if (v.pushed.length || v.phase === 'push') {
            const sk = x.el('div', 'pile'), two = x.el('div', 'sk-two');
            for (let i = 0; i < 2; i++) two.append(v.pushed[i] ? x.card(v.pushed[i]) : x.el('div', 'slot'));
            sk.append(two, x.el('span', 'pile-lbl', x.t('sk.pushed')));
            mid.append(sk);
          }
        } else {
          const tr = x.el('div', 'sk-trick');
          tr.setAttribute('role', 'list');
          for (const p of v.trick) {
            const it = x.el('div', 'pile');
            it.setAttribute('role', 'listitem');
            it.append(x.card(p.c), x.el('span', 'pile-lbl', x.name(p.s)));
            tr.append(it);
          }
          if (!v.trick.length && v.prevTrick) {
            tr.classList.add('prev');
            for (const p of v.prevTrick) {
              const it = x.el('div', 'pile');
              it.setAttribute('role', 'listitem');
              it.append(x.card(p.c), x.el('span', 'pile-lbl', x.name(p.s)));
              tr.append(it);
            }
            tr.setAttribute('aria-label', x.t('sk.prevTrick'));
          }
          if (!tr.children.length) { tr.removeAttribute('role'); tr.append(x.el('div', 'slot')); }
          mid.append(tr);
        }
        wrap.append(mid);
        if (v.open && v.open.length) {
          const op = x.el('div', 'sk-open');
          op.setAttribute('role', 'group');
          op.setAttribute('aria-label', x.t('sk.open', { p: x.name(v.decl) }));
          op.append(x.el('span', 'pile-lbl', x.t('sk.open', { p: x.name(v.decl) })));
          game.ui.sort(v.open, v).forEach(c => op.append(x.card(c)));
          wrap.append(op);
        }
        if (v.phase === 'play' || v.phase === 'done') wrap.append(x.el('p', 'pile-lbl', x.t('sk.tricks', { n: v.tricksN[x.you] })));
        return wrap;
      },
      status(v, x) {
        const me = x.you;
        if (v.turn !== me) {
          if (v.phase === 'bid') return x.t('sk.wait.bid', { p: x.name(v.turn) });
          if (v.phase !== 'play') return x.t('sk.wait.decl', { p: x.name(v.decl) });
          return x.t('sk.wait', { p: x.name(v.turn) });
        }
        if (v.phase === 'bid') {
          if (v.stage === 3) return x.t('sk.you.v18');
          return v.waiting === 'say' ? x.t('sk.you.say', { n: v.next }) : x.t('sk.you.hear', { p: x.name(v.sayer), n: v.bid });
        }
        if (v.phase === 'skat') return x.t('sk.you.skat');
        if (v.phase === 'push') return x.t('sk.you.push', { n: 2 - v.pushed.length });
        if (v.phase === 'declare') return x.t('sk.you.decl');
        return v.trick.length ? x.t('sk.you.follow') : x.t('sk.you.lead');
      },
      badge(v, s, x) {
        if (s === v.decl) return x.t('sk.b.decl');
        if (v.phase === 'bid') return x.t(s === v.fore ? 'sk.b.fore' : s === v.mid ? 'sk.b.mid' : 'sk.b.rear');
        return '';
      },
      primary: m => m.a !== 'pass',
      label(m, v, x) {
        switch (m.a) {
          case 'bid': return v.stage === 3 ? x.t('sk.play18') : x.t('sk.bid', { n: v.next });
          case 'yes': return x.t('sk.yes', { n: v.bid });
          case 'pass': return x.t('sk.pass');
          case 'skat': return x.t('sk.skat');
          case 'hand': return x.t('sk.hand');
          case 'game': {
            const n = game.ui.gameName(m.g, m.o, v.isHand, x);
            const val = m.g === 'N' ? nullValue(v.isHand, m.o) : v.values && v.values[m.g];
            return val ? x.t('sk.val', { g: n, n: val }) : n;
          }
          default: return x.cardName(m.c);
        }
      },
      last(v, x) {
        const l = v.last; if (!l) return '';
        const p = x.name(l.s);
        if (l.a === 'redeal') return x.t('sk.last.redeal');
        if (l.a === 'trick') return l.s === x.you ? x.t('sk.last.youTrick') : x.t('sk.last.trick', { p });
        if (l.s === x.you) return '';
        if (l.a === 'game') return x.t('sk.last.game', { p, g: game.ui.gameName(l.g[0], l.g[1] === 'O', l.hand, x) });
        if (l.a === 'play') return '';
        return x.t('sk.last.' + l.a, { p, n: l.n });
      },
      over(v, x) {
        const r = v.over, p = x.name(r.decl), g = game.ui.gameName(r.g, r.open, r.hand, x);
        const you = r.decl === x.you ? 'you' : '', outcome = (r.g === 'N' ? 'null' : '') + (r.won ? 'Won' : 'Lost');
        const key = 'sk.res.' + (you ? you + outcome[0].toUpperCase() + outcome.slice(1) : outcome[0].toLowerCase() + outcome.slice(1));
        let s = x.t(key, { p, g, a: r.points, n: r.won ? r.value : 2 * r.value });
        if (r.overbid) s += x.t('sk.res.over');
        if (r.schwarz) s += x.t('sk.res.schwarz'); else if (r.schneider) s += x.t('sk.res.schneider');
        if (r.skat && r.skat.length === 2) s += x.t('sk.res.skat', { a: x.cardName(r.skat[0]), b: x.cardName(r.skat[1]) });
        return s;
      },
      won: (r, you) => r.decl === you ? r.won : !r.won,
    },
  };
  game.rules = { trickWinner, matadors, power, BIDS };   // for the tests
  C.register(game);
})();
