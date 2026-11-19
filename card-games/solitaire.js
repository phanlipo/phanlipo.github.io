/* Solitaire (Klondike, draw one) – rules, hint player and table view. Contract: card-games/README.md
   Rules:
   - 52 cards. Seven columns with 1 to 7 cards, only the last one face up. The rest is the stock.
   - Tap the stock: its top card goes face up onto the waste. Empty stock: the waste becomes the stock again
     (as often as you like).
   - On the columns: alternating colours, one rank lower (red 6 on black 7). Face-up runs move together.
     Only a king (or a run starting with a king) goes into an empty column.
   - The four foundations are built up by suit from ace to king. Their top card may go back to a column.
   - A face-down card that becomes the last of its column turns face up.
   - Won when all 52 cards are on the foundations. Undo is possible; giving up ends the game. */
(function () {
  'use strict';
  const C = window.CardGames;
  const UNDO = 40;                                    // undo steps kept in the state

  const r = c => C.rankIdx(c);                        // 2 → 0 … A → 12
  const lvl = c => (r(c) + 1) % 13;                   // ace → 0, 2 → 1 … king → 12
  const fi = c => C.SUITS.indexOf(C.suit(c));
  const topOf = a => a[a.length - 1];
  const onFound = (st, c) => st.found[fi(c)].length === lvl(c);
  const onCol = (col, c) => col.up.length
    ? C.red(topOf(col.up)) !== C.red(c) && lvl(topOf(col.up)) === lvl(c) + 1
    : !col.down.length && lvl(c) === 12;
  const snap = st => JSON.stringify({ stock: st.stock, waste: st.waste, found: st.found, tab: st.tab, moves: st.moves, idle: st.idle, recycled: st.recycled });
  const allUp = st => !st.stock.length && !st.waste.length && st.tab.every(col => !col.down.length);
  const won = st => st.found.every(f => f.length === 13);

  /** Where a face-up card lies: { from: 'w' | 'f' | column index, k: position in the column } */
  function where(st, c) {
    if (topOf(st.waste) === c) return { from: 'w' };
    const f = st.found.findIndex(a => topOf(a) === c);
    if (f >= 0) return { from: 'f' };
    for (let i = 0; i < 7; i++) { const k = st.tab[i].up.indexOf(c); if (k >= 0) return { from: i, k }; }
    return null;
  }
  function flipTops(st) {
    for (const col of st.tab) if (!col.up.length && col.down.length) col.up.push(col.down.pop());
  }

  const game = {
    id: 'solitaire',
    players: { min: 1, max: 1 },
    strings: {
      de: {
        'so.title': 'Solitaire', 'so.desc': 'Klondike-Patience für dich allein: alle Karten nach Farbe vom Ass bis zum König ablegen.',
        'so.draw': 'Karte aufdecken', 'so.recycle': 'Stapel umdrehen', 'so.undo': 'Rückgängig', 'so.auto': 'Alles ablegen', 'so.giveup': 'Aufgeben',
        'so.toF': 'Auf die Ablage', 'so.toT': 'Auf Spalte {n}', 'so.col': 'Spalte {n}', 'so.stock': 'Stapel: {n}', 'so.waste': 'Aufgedeckt',
        'so.found': 'Ablage {s}', 'so.down': '{n} verdeckt',
        'so.you': 'Karte antippen, um sie zu bewegen.', 'so.youAuto': 'Alles liegt offen – „Alles ablegen“.',
        'so.won': 'Gewonnen in {n} Zügen!', 'so.lost': 'Aufgegeben – {n} von 52 Karten abgelegt.', 'so.giveupQ': 'Aufgeben? Das Spiel ist dann vorbei.',
        'so.last.undo': 'Zug zurückgenommen.', 'so.moves': 'Züge: {n}',
      },
      en: {
        'so.title': 'Solitaire', 'so.desc': 'Klondike patience on your own: build all cards up by suit from ace to king.',
        'so.draw': 'Turn a card', 'so.recycle': 'Turn the stock over', 'so.undo': 'Undo', 'so.auto': 'Finish', 'so.giveup': 'Give up',
        'so.toF': 'To the foundation', 'so.toT': 'To column {n}', 'so.col': 'Column {n}', 'so.stock': 'Stock: {n}', 'so.waste': 'Waste',
        'so.found': 'Foundation {s}', 'so.down': '{n} face down',
        'so.you': 'Tap a card to move it.', 'so.youAuto': 'Everything is face up – “Finish”.',
        'so.won': 'Won in {n} moves!', 'so.lost': 'Given up – {n} of 52 cards on the foundations.', 'so.giveupQ': 'Give up? The game is over then.',
        'so.last.undo': 'Move undone.', 'so.moves': 'Moves: {n}',
      },
    },

    setup(n, seed) {
      const st = { n: 1, rs: seed | 0, waste: [], found: [[], [], [], []], tab: [], moves: 0, idle: 0, recycled: 0, hist: [], over: null, last: null };
      const deck = C.shuffle(st, C.deck('2'));
      for (let i = 0; i < 7; i++) {
        const down = deck.splice(0, i);
        st.tab.push({ down, up: [deck.shift()] });
      }
      st.stock = deck;
      return st;
    },

    moves(st, s) {
      if (st.over || s !== 0) return [];
      const ms = [];
      const tryCard = (c, fromCol, single) => {
        if (single && onFound(st, c)) ms.push({ a: 'mv', c, to: 'f' });
        st.tab.forEach((col, j) => {
          if (j === fromCol || !onCol(col, c)) return;
          // A king that already lies alone at the top of a column gains nothing in another empty column
          if (!col.up.length && typeof fromCol === 'number' && !st.tab[fromCol].down.length && st.tab[fromCol].up[0] === c) return;
          ms.push({ a: 'mv', c, to: j });
        });
      };
      if (st.waste.length) tryCard(topOf(st.waste), 'w', true);
      st.tab.forEach((col, i) => col.up.forEach((c, k) => tryCard(c, i, k === col.up.length - 1)));
      for (const f of st.found) if (f.length) {
        const c = topOf(f);
        st.tab.forEach((col, j) => { if (col.up.length && onCol(col, c)) ms.push({ a: 'mv', c, to: j }); });
      }
      if (st.stock.length || st.waste.length) ms.push({ a: 'draw' });
      if (allUp(st)) ms.push({ a: 'auto' });
      if (st.hist.length) ms.push({ a: 'undo' });
      ms.push({ a: 'giveup' });
      return ms;
    },

    apply(st, s, m) {
      if (m.a === 'undo') {
        Object.assign(st, JSON.parse(st.hist.pop()));
        st.last = { s, a: 'undo' };
        return;
      }
      if (m.a === 'giveup') { st.over = { won: false, found: st.found.reduce((n, f) => n + f.length, 0), moves: st.moves }; st.last = { s, a: 'giveup' }; return; }
      st.hist.push(snap(st));
      if (st.hist.length > UNDO) st.hist.shift();
      st.moves++;
      if (m.a === 'draw') {
        if (st.stock.length) st.waste.push(st.stock.pop());
        else { st.stock = st.waste.reverse(); st.waste = []; st.recycled++; }
        st.idle++;
        st.last = { s, a: 'draw' };
      } else if (m.a === 'auto') {
        // Everything is face up: put all cards onto the foundations, lowest first
        for (let moved = true; moved;) {
          moved = false;
          for (const col of st.tab) {
            const c = topOf(col.up);
            if (c && onFound(st, c)) { st.found[fi(c)].push(col.up.pop()); moved = true; }
          }
        }
        st.last = { s, a: 'auto' };
      } else if (m.a === 'mv') {
        const w = where(st, m.c);
        let cards;
        if (w.from === 'w') cards = [st.waste.pop()];
        else if (w.from === 'f') cards = [st.found[fi(m.c)].pop()];
        else cards = st.tab[w.from].up.splice(w.k);
        if (m.to === 'f') st.found[fi(m.c)].push(...cards);
        else st.tab[m.to].up.push(...cards);
        flipTops(st);
        st.idle = 0;
        st.last = { s, a: 'mv', c: m.c, to: m.to, n: cards.length };
      }
      if (won(st)) st.over = { won: true, found: 52, moves: st.moves };
    },

    view(st) {
      return { hand: [], counts: [0], stockN: st.stock.length, waste: st.waste.slice(-3), wasteN: st.waste.length,
        found: st.found.map(f => topOf(f) || null), foundN: st.found.map(f => f.length),
        tab: st.tab.map(col => ({ down: col.down.length, up: col.up.slice() })), movesN: st.moves, last: st.last };
    },

    result: st => st.over,

    /** Hint player (also for the simulation in the tests): foundation, uncover, waste, stock – gives up after a lap without progress */
    bot(st, s) {
      const ms = game.moves(st, s);
      if (!ms.length) return null;
      const auto = ms.find(m => m.a === 'auto');
      if (auto) return auto;
      const real = ms.filter(m => m.a === 'mv' && where(st, m.c).from !== 'f');
      const found = real.find(m => m.to === 'f');
      if (found) return found;
      // Moves that uncover a face-down card (more face-down cards first), or empty a column for a king
      const uncover = real.filter(m => { const w = where(st, m.c); return w.from !== 'w' && w.k === 0 && st.tab[w.from].down.length; })
        .sort((a, b) => st.tab[where(st, b.c).from].down.length - st.tab[where(st, a.c).from].down.length);
      if (uncover.length) return uncover[0];
      const fromWaste = real.find(m => where(st, m.c).from === 'w');
      if (fromWaste) return fromWaste;
      if (ms.some(m => m.a === 'draw') && st.idle <= st.stock.length + st.waste.length) return { a: 'draw' };
      return { a: 'giveup' };
    },

    describe(m) {
      if (m.a === 'mv') return `move ${C.name(m.c, 'en')} ` + (m.to === 'f' ? 'to its foundation' : `to column ${m.to + 1}`);
      return { draw: 'turn the next stock card (or turn the waste over when the stock is empty)', auto: 'move all cards to the foundations',
        undo: 'undo the last move', giveup: 'give up (ends the game)' }[m.a];
    },

    summary: v => ({ stock: v.stockN, waste_top: v.waste.length ? C.name(topOf(v.waste), 'en') : null,
      foundations: C.SUITS.map((s, i) => ({ suit: C.suitName(s, 'en'), cards: v.foundN[i] })),
      columns: v.tab.map((col, i) => ({ column: i + 1, face_down: col.down, face_up: col.up.map(c => C.name(c, 'en')) })), moves: v.movesN }),

    ui: {
      hand: false,
      sort: h => h,
      /** A tap on a card: to the foundation if possible, otherwise the only target; several columns → chooser */
      pick(ms) {
        return ms.find(m => m.to === 'f') || (ms.length === 1 ? ms[0] : null);
      },
      confirm: (m, v, x) => m.a === 'giveup' ? x.t('so.giveupQ') : '',
      primary: m => m.a === 'auto',
      table(v, x) {
        const wrap = x.el('div', 'so-wrap'), grid = x.el('div', 'so-grid');
        // Stock: tap to turn a card
        const draw = v.moves.find(m => m.a === 'draw');
        const stock = x.el('button', 'so-stock');
        stock.type = 'button';
        stock.disabled = !draw;
        stock.setAttribute('aria-label', (v.stockN ? x.t('so.draw') : x.t('so.recycle')) + ' – ' + x.t('so.stock', { n: v.stockN }));
        stock.append(v.stockN ? x.back() : x.el('div', 'slot', '↺'));
        if (draw) stock.addEventListener('click', () => x.move(draw));
        const waste = x.el('div', 'so-waste');
        waste.setAttribute('aria-label', x.t('so.waste'));
        waste.setAttribute('role', 'group');
        if (v.waste.length) waste.append(x.cardBtn(topOf(v.waste)));
        else waste.append(x.el('div', 'slot'));
        grid.append(stock, waste, x.el('div', 'so-gap'));
        C.SUITS.forEach((s, i) => {
          const f = x.el('div', 'so-found');
          f.setAttribute('role', 'group');
          f.setAttribute('aria-label', x.t('so.found', { s: C.suitName(s, x.lang) }) + ': ' + v.foundN[i]);
          f.append(v.found[i] ? x.cardBtn(v.found[i]) : x.el('div', 'slot' + (C.red(s + '7') ? ' red' : ''), C.SYM[s]));
          grid.append(f);
        });
        v.tab.forEach((col, i) => {
          const ul = x.el('div', 'so-col');
          ul.setAttribute('role', 'group');
          ul.setAttribute('aria-label', x.t('so.col', { n: i + 1 }) + (col.down ? ', ' + x.t('so.down', { n: col.down }) : ''));
          for (let k = 0; k < col.down; k++) ul.append(x.back());
          col.up.forEach(c => ul.append(x.cardBtn(c)));
          if (!col.down && !col.up.length) ul.append(x.el('div', 'slot'));
          grid.append(ul);
        });
        wrap.append(grid, x.el('p', 'so-moves', x.t('so.moves', { n: v.movesN })));
        return wrap;
      },
      status: (v, x) => v.moves.some(m => m.a === 'auto') ? x.t('so.youAuto') : x.t('so.you'),
      badge: () => '',
      label(m, v, x) {
        if (m.a === 'mv') return m.to === 'f' ? x.t('so.toF') : x.t('so.toT', { n: m.to + 1 });
        if (m.a === 'draw') return v.stockN ? x.t('so.draw') : x.t('so.recycle');
        return x.t('so.' + m.a);
      },
      last: (v, x) => v.last && v.last.a === 'undo' ? x.t('so.last.undo') : '',
      over: (v, x) => v.over.won ? x.t('so.won', { n: v.over.moves }) : x.t('so.lost', { n: v.over.found }),
      won: r => !!r.won,
    },
  };
  C.register(game);
})();
