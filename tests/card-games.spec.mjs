// Card games (Mau Mau, Durak): rules checked on hand-made states, whole computer games simulated with
// invariants, a game against the computer through the UI, and several devices over real WebRTC
// (separate browser contexts – like separate phones).
import { test, expect, clipboardText, privateClipboard, openDetails, onDialog, axe } from './helpers.mjs';

const URL_ = '/card-games/';
const FAST = { 'card-games.settings.v1': JSON.stringify({ speed: 'fast' }) };

async function fast(page, extra = {}) {
  await page.addInitScript(items => { for (const [k, v] of Object.entries(items)) if (!localStorage.getItem(k)) localStorage.setItem(k, v); },
    { ...FAST, ...extra });
}
/** Rules in the page: run fn(CardGames) there */
const rules = (page, fn, arg) => page.evaluate(([src, a]) => new Function('C', 'arg', `return (${src})(C, arg);`)(window.CardGames, a), [fn.toString(), arg]);

// Independent card helpers for expectations
const RANKS = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const val = c => RANKS.indexOf(c.slice(1));

test.describe('Mau Mau rules', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('suit or rank fits, jack on everything but a jack, draw is always possible', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games['mau-mau'];
      const st = g.setup(3, 42);
      st.turn = 0; st.pile = ['H9']; st.wish = null; st.pen = 0; st.drew = null;
      st.hands[0] = ['H7', 'S9', 'S8', 'CJ', 'DA'];
      const onNine = g.moves(st, 0);
      const notTurn = g.moves(st, 1);
      st.pile.push('HJ');
      const onJack = g.moves(st, 0).map(m => m.c || m.a);
      return { onNine, notTurn, onJack };
    });
    const cards = r.onNine.filter(m => m.a === 'play');
    expect([...new Set(cards.map(m => m.c))].sort()).toEqual(['CJ', 'H7', 'S9']);
    // The jack comes with all four wishes
    expect(cards.filter(m => m.c === 'CJ').map(m => m.wish).sort()).toEqual(['C', 'D', 'H', 'S']);
    expect(r.onNine.at(-1)).toEqual({ a: 'draw' });
    expect(r.notTurn).toEqual([]);
    // On a jack (no wish): same suit only (hearts) – no second jack
    expect(r.onJack.sort()).toEqual(['H7', 'draw']);
  });

  test('7 makes the next draw 2 (stacked: 4), 8 skips, the jack wish counts', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games['mau-mau'];
      const st = g.setup(3, 7);
      st.turn = 0; st.pile = ['C9']; st.wish = null; st.pen = 0; st.drew = null;
      st.hands = [['C7', 'DK', 'H8'], ['S7', 'HK', 'DQ'], ['SA', 'HA', 'D9']];
      const out = {};
      g.apply(st, 0, { a: 'play', c: 'C7' });
      out.afterSeven = { turn: st.turn, pen: st.pen, moves: g.moves(st, 1) };
      g.apply(st, 1, { a: 'play', c: 'S7' });
      out.stacked = { turn: st.turn, pen: st.pen, moves: g.moves(st, 2) };
      const before = st.hands[2].length, deck = st.draw.length;
      g.apply(st, 2, { a: 'draw' });
      out.drew = { got: st.hands[2].length - before, deck: deck - st.draw.length, turn: st.turn, pen: st.pen };
      // Seat 0 plays an 8 (on an 8 of spades): seat 1 is skipped
      st.pile.push('S8'); st.turn = 0; st.hands[0] = ['H8', 'DK'];
      g.apply(st, 0, { a: 'play', c: 'H8' });
      out.skip = { turn: st.turn, skip: st.last.skip };
      // Jack with wish: only the wished suit afterwards
      st.turn = 2; st.hands[2] = ['CJ', 'H10', 'S10', 'D10'];
      g.apply(st, 2, { a: 'play', c: 'CJ', wish: 'D' });
      st.hands[0] = ['D7', 'C10', 'HJ', 'SJ'];
      out.wish = { turn: st.turn, moves: g.moves(st, 0).map(m => m.c || m.a) };
      return out;
    });
    expect(r.afterSeven).toEqual({ turn: 1, pen: 2, moves: [{ a: 'play', c: 'S7' }, { a: 'draw' }] });
    expect(r.stacked).toMatchObject({ turn: 2, pen: 4 });
    // Seat 2 has no 7: only drawing
    expect(r.stacked.moves).toEqual([{ a: 'draw' }]);
    expect(r.drew).toEqual({ got: 4, deck: 4, turn: 0, pen: 0 });
    expect(r.skip).toEqual({ turn: 2, skip: 1 });
    // Wish diamonds: the 7 of diamonds, no clubs, no jack on the jack
    expect(r.wish.turn).toBe(0);
    expect(r.wish.moves.sort()).toEqual(['D7', 'draw']);
  });

  test('8 in a two-player game: the same player again; drawn card may be played, otherwise pass', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games['mau-mau'];
      const st = g.setup(2, 3);
      st.turn = 0; st.pile = ['S9']; st.wish = null; st.pen = 0; st.drew = null;
      st.hands = [['S8', 'HA', 'CK'], ['D7', 'DQ']];
      g.apply(st, 0, { a: 'play', c: 'S8' });
      const again = st.turn;
      // Seat 0 draws: the drawn card fits (spades on top) → play it or pass, nothing else
      st.draw.push('S10');
      g.apply(st, 0, { a: 'draw' });
      const afterDraw = g.moves(st, 0);
      const stillTurn = st.turn;
      // Drawn card does not fit → only pass
      g.apply(st, 0, { a: 'pass' });
      const passTurn = st.turn;
      st.turn = 1; st.draw.push('H7');
      g.apply(st, 1, { a: 'draw' });
      const noFit = g.moves(st, 1);
      const illegal = C.legal(g, st, 1, { a: 'play', c: 'DQ' });
      return { again, afterDraw, stillTurn, passTurn, noFit, illegal };
    });
    expect(r.again).toBe(0);
    expect(r.afterDraw).toEqual([{ a: 'play', c: 'S10' }, { a: 'pass' }]);
    expect(r.stillTurn).toBe(0);
    expect(r.passTurn).toBe(1);
    expect(r.noFit).toEqual([{ a: 'pass' }]);
    expect(r.illegal).toBe(false);
  });

  test('an empty draw pile is refilled from the discard pile (top card stays)', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games['mau-mau'];
      const st = g.setup(2, 11);
      const all = [...st.draw];
      st.turn = 0; st.wish = null; st.pen = 0;
      st.pile = [...st.pile, ...all.slice(0, -1)]; st.draw = []; // everything on the pile
      const top = st.pile.at(-1), size = st.pile.length;
      g.apply(st, 0, { a: 'draw' });
      return { top, pile: st.pile, size, left: st.draw.length, hand: st.hands[0].length };
    });
    // Only the top card stays on the pile – the very card that was on top before
    expect(r.pile).toEqual([r.top]);
    expect(r.left).toBe(r.size - 2);
    expect(r.hand).toBe(6);
  });
});

test.describe('Durak rules', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('deal, trump from the bottom card, lowest trump attacks', async ({ page }) => {
    const games = await rules(page, C => [2, 3, 4, 6].flatMap(n => [1, 2, 3, 4, 5].map(seed => {
      const st = C.games.durak.setup(n, seed * 97 + n);
      return { n, hands: st.hands, deck: st.deck, trump: st.trump, trumpCard: st.trumpCard, atk: st.atk, def: st.def, limit: st.limit };
    })));
    for (const g of games) {
      expect(g.hands.every(h => h.length === 6)).toBe(true);
      expect(g.deck.length).toBe(36 - 6 * g.n);
      expect(new Set([...g.hands.flat(), ...g.deck]).size).toBe(36);
      if (g.deck.length) expect(g.trumpCard).toBe(g.deck[0]);
      expect(g.trump).toBe(g.trumpCard[0]);
      const trumps = g.hands.map(h => h.filter(c => c[0] === g.trump).map(val));
      const low = Math.min(...trumps.flat());
      if (Number.isFinite(low)) expect(trumps[g.atk]).toContain(low);
      expect(g.def).toBe((g.atk + 1) % g.n);
      expect(g.limit).toBe(6);
    }
  });

  test('beating: higher card of the same suit or trump; throw-in only with ranks on the table', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.durak;
      const st = g.setup(3, 5);
      st.trump = 'H'; st.atk = 0; st.def = 1; st.limit = 6; st.table = []; st.passed = []; st.taking = false;
      st.hands = [['S9', 'D9', 'C6', 'HA'], ['S10', 'S7', 'H6', 'D6', 'CK', 'HQ'], ['C9', 'DA', 'CQ']];
      const lead = g.moves(st, 0).map(m => m.c);
      const others = [g.moves(st, 1), g.moves(st, 2)];
      g.apply(st, 0, { a: 'atk', c: 'S9' });
      const def = g.moves(st, 1);
      const add = g.moves(st, 0).map(m => m.c || m.a);
      const add2 = g.moves(st, 2).map(m => m.c || m.a);
      g.apply(st, 1, { a: 'def', i: 0, c: 'S10' });
      const afterBeat0 = g.moves(st, 0).map(m => m.c || m.a);
      const afterBeat2 = g.moves(st, 2).map(m => m.c || m.a);
      return { lead, others, def, add, add2, afterBeat0, afterBeat2 };
    });
    expect(r.lead.sort()).toEqual(['C6', 'D9', 'HA', 'S9']);
    // Before the lead nobody else may play
    expect(r.others).toEqual([[], []]);
    // S9: S10 (higher spade), H6 and HQ (trumps); not S7, D6, CK
    expect(r.def.filter(m => m.a === 'def').map(m => m.c).sort()).toEqual(['H6', 'HQ', 'S10']);
    expect(r.def.at(-1)).toEqual({ a: 'take' });
    // Attacker may add the other 9; nothing to say "done" while a card is open
    expect(r.add).toEqual(['D9']);
    // Player after the defender (seat 2) throws in too
    expect(r.add2).toEqual(['C9']);
    // All beaten: ranks 9 and 10 on the table; now "done" is possible
    expect(r.afterBeat0.sort()).toEqual(['D9', 'done']);
    expect(r.afterBeat2.sort()).toEqual(['C9', 'done']);
  });

  test('round beaten: discarded, everyone draws (attacker first), defender attacks next', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.durak;
      const st = g.setup(3, 9);
      st.trump = 'H'; st.atk = 0; st.def = 1; st.limit = 6; st.table = []; st.passed = []; st.taking = false; st.discard = 0;
      st.hands = [['S9', 'C10'], ['S10', 'D7', 'D8'], ['CA']];
      st.deck = ['H6', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8', 'X9', 'Y1', 'Y2', 'Y3', 'Y4'];
      g.apply(st, 0, { a: 'atk', c: 'S9' });
      g.apply(st, 1, { a: 'def', i: 0, c: 'S10' });
      // Seat 2 (CA) has no 9/10 → passes automatically; seat 0 (C10) must say done
      const before = { table: st.table.length };
      g.apply(st, 0, { a: 'done' });
      return { before, hands: st.hands, discard: st.discard, atk: st.atk, def: st.def, table: st.table.length, deck: st.deck.length, last: st.last };
    });
    expect(r.before.table).toBe(1);
    expect(r.discard).toBe(2);
    expect(r.table).toBe(0);
    // Deck is popped from the end: attacker (0) draws Y4,Y3,Y2,Y1,X9 (5 to have 6), then seat 2 (5 cards), defender last (4)
    expect(r.hands[0]).toEqual(['C10', 'Y4', 'Y3', 'Y2', 'Y1', 'X9']);
    expect(r.hands[2]).toEqual(['CA', 'X8', 'X7', 'X6', 'X5', 'X4']);
    expect(r.hands[1]).toEqual(['D7', 'D8', 'X3', 'X2', 'X1', 'H6']);
    expect(r.deck).toBe(0);
    expect(r.atk).toBe(1);
    expect(r.def).toBe(2);
    expect(r.last).toMatchObject({ a: 'beaten', n: 2 });
  });

  test('taking: others may still add, the defender takes all, the next player attacks; limit = defender cards', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.durak;
      const st = g.setup(4, 13);
      st.trump = 'H'; st.atk = 0; st.def = 1; st.table = []; st.passed = []; st.taking = false; st.deck = [];
      st.hands = [['S9', 'D9', 'C9'], ['S6', 'D6'], ['H9', 'CK'], ['DA']];
      st.limit = 2;   // defender had 2 cards at the start
      g.apply(st, 0, { a: 'atk', c: 'S9' });
      g.apply(st, 1, { a: 'take' });
      const whileTaking = { def: g.moves(st, 1), atk: g.moves(st, 0).map(m => m.c || m.a), third: g.moves(st, 3) };
      g.apply(st, 0, { a: 'done' });                  // seat 2 may still add: the round goes on
      const mid = st.table.length;
      g.apply(st, 2, { a: 'atk', c: 'H9' });          // seat 2 is after the defender: limit 2 reached → taken at once
      return { whileTaking, mid, def: st.hands[1].sort(), atk: st.atk, defNow: st.def, last: st.last, table: st.table.length };
    });
    expect(r.whileTaking.def).toEqual([]);
    expect(r.whileTaking.atk.sort()).toEqual(['C9', 'D9', 'done']);
    // Seat 3 is neither attacker nor after the defender
    expect(r.whileTaking.third).toEqual([]);
    expect(r.mid).toBe(1);
    expect(r.table).toBe(0);
    expect(r.def).toEqual(['D6', 'H9', 'S6', 'S9']);
    expect(r.atk).toBe(2);
    expect(r.defNow).toBe(3);
    expect(r.last).toMatchObject({ a: 'took', n: 2 });
  });

  test('the last player with cards is the Durak', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.durak;
      const st = g.setup(2, 21);
      st.trump = 'H'; st.atk = 0; st.def = 1; st.limit = 1; st.table = []; st.passed = []; st.taking = false; st.deck = [];
      st.hands = [['S9'], ['S6', 'D6']];
      g.apply(st, 0, { a: 'atk', c: 'S9' });
      g.apply(st, 1, { a: 'take' });   // attacker has nothing more → round ends at once
      return { over: st.over, result: g.result(st) };
    });
    expect(r.over).toBe(true);
    expect(r.result).toEqual({ loser: 1, out: [0] });
  });
});

test.describe('Skat rules', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('bid values, tricks (jacks, trump, follow suit, null order) and matadors', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.skat, R = g.rules;
      const T = (a, b, c) => [{ s: 0, c: a }, { s: 1, c: b }, { s: 2, c: c }];
      const st = g.setup(3, 4);
      Object.assign(st, { phase: 'play', game: { g: 'C', o: false }, turn: 1 });
      st.hands[1] = ['SJ', 'S7', 'CA', 'HQ'];
      st.trick = [{ s: 0, c: 'S9' }];
      const followSpades = g.moves(st, 1).map(m => m.c);
      st.trick = [{ s: 0, c: 'CJ' }];
      st.hands[1] = ['SJ', 'C8', 'HA'];
      const followTrump = g.moves(st, 1).map(m => m.c);
      st.trick = [{ s: 0, c: 'DA' }];
      const cannotFollow = g.moves(st, 1).map(m => m.c);
      return {
        bids: R.BIDS.slice(0, 22),
        tricks: [R.trickWinner(T('SA', 'S10', 'H7'), 'H'), R.trickWinner(T('SA', 'DJ', 'CJ'), 'G'), R.trickWinner(T('S10', 'SK', 'CA'), 'H'),
          R.trickWinner(T('S10', 'SJ', 'S9'), 'N'), R.trickWinner(T('H7', 'HJ', 'HA'), 'C'), R.trickWinner(T('D7', 'DA', 'D10'), 'G')],
        followSpades, followTrump, cannotFollow,
        mat: [R.matadors(['CJ', 'SJ', 'HJ', 'CA', 'C7'], 'C'), R.matadors(['SJ', 'HJ', 'DJ', 'CA'], 'C'), R.matadors(['C10', 'H7'], 'C'),
          R.matadors(['CJ', 'SJ', 'HJ', 'DJ', 'CA', 'C10', 'CK', 'CQ', 'C9', 'C8', 'C7'], 'C'), R.matadors(['CJ', 'SJ', 'HJ', 'DJ', 'CA'], 'G')],
      };
    });
    // Suit games 9/10/11/12 and grand 24 times 2 …, null 23/35/46/59
    expect(r.bids).toEqual([18, 20, 22, 23, 24, 27, 30, 33, 35, 36, 40, 44, 45, 46, 48, 50, 54, 55, 59, 60, 63, 66]);
    expect(r.tricks).toEqual([2, 2, 0, 1, 1, 1]);
    // The jack of spades is trump, not spades
    expect(r.followSpades).toEqual(['S7']);
    expect(r.followTrump.sort()).toEqual(['C8', 'SJ']);
    expect(r.cannotFollow.sort()).toEqual(['C8', 'HA', 'SJ']);
    // with 3, without 1, without 4 jacks + ace … (11 for clubs), with 11, grand: jacks only
    expect(r.mat).toEqual([3, 1, 5, 11, 4]);
  });

  test('bidding: middlehand to forehand, then rearhand; all pass → forehand may play 18, else new deal', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.skat, out = {};
      let st = g.setup(3, 8);
      const v = g.view(st, 0);
      out.seats = { fore: v.fore, mid: v.mid, rear: v.rear, dealer: v.dealer, turn: st.turn };
      out.m1 = g.moves(st, v.mid);
      g.apply(st, v.mid, { a: 'bid' });
      out.afterBid = { bid: st.bid, turn: st.turn, moves: g.moves(st, v.fore) };
      g.apply(st, v.fore, { a: 'yes' });
      g.apply(st, v.mid, { a: 'bid' });
      g.apply(st, v.fore, { a: 'pass' });           // middlehand wins stage 1 at 20
      out.stage2 = { stage: st.stage, turn: st.turn, listener: st.listener };
      g.apply(st, v.rear, { a: 'pass' });
      out.decl = { decl: st.decl, bid: st.bid, phase: st.phase, moves: g.moves(st, v.mid) };
      g.apply(st, v.mid, { a: 'skat' });
      out.twelve = st.hands[v.mid].length;
      const [p1, p2] = st.hands[v.mid].slice(0, 2);
      g.apply(st, v.mid, { a: 'push', c: p1 });
      g.apply(st, v.mid, { a: 'push', c: p2 });
      out.pushed = { skat: st.skat, want: [p1, p2], phase: st.phase, games: g.moves(st, v.mid).length, hand: st.hands[v.mid].length };
      // Everybody passes
      st = g.setup(3, 9);
      const w = g.view(st, 0);
      g.apply(st, w.mid, { a: 'pass' });
      g.apply(st, w.rear, { a: 'pass' });
      out.stage3 = { stage: st.stage, turn: st.turn, fore: w.fore, moves: g.moves(st, w.fore) };
      g.apply(st, w.fore, { a: 'pass' });
      out.redeal = { dealer: st.dealer, was: w.dealer, phase: st.phase, bid: st.bid, last: st.last.a, cards: st.hands.map(h => h.length), skat: st.skat.length };
      return out;
    });
    expect(r.seats.fore).toBe((r.seats.dealer + 1) % 3);
    expect(r.seats.mid).toBe((r.seats.dealer + 2) % 3);
    expect(r.seats.rear).toBe(r.seats.dealer);
    expect(r.seats.turn).toBe(r.seats.mid);
    expect(r.m1).toEqual([{ a: 'bid' }, { a: 'pass' }]);
    expect(r.afterBid).toEqual({ bid: 18, turn: r.seats.fore, moves: [{ a: 'yes' }, { a: 'pass' }] });
    expect(r.stage2).toEqual({ stage: 2, turn: r.seats.rear, listener: r.seats.mid });
    expect(r.decl).toEqual({ decl: r.seats.mid, bid: 20, phase: 'skat', moves: [{ a: 'skat' }, { a: 'hand' }] });
    expect(r.twelve).toBe(12);
    expect(r.pushed.skat).toEqual(r.pushed.want);
    expect(r.pushed).toMatchObject({ phase: 'declare', games: 7, hand: 10 });
    expect(r.stage3).toEqual({ stage: 3, turn: r.stage3.fore, fore: r.stage3.fore, moves: [{ a: 'bid' }, { a: 'pass' }] });
    expect(r.redeal).toEqual({ dealer: (r.redeal.was + 1) % 3, was: r.redeal.was, phase: 'bid', bid: 0, last: 'redeal', cards: [10, 10, 10], skat: 2 });
  });

  test('scoring: game value, schneider, overbid, null', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.skat;
      const finish = (game, bid, won, last, declCards) => {
        const st = g.setup(3, 3);
        Object.assign(st, { phase: 'play', decl: 0, bid, game, isHand: false, skatCards: ['H7', 'D8'], skat: ['H7', 'D8'],
          declCards, won: [won.slice(), [], []], tricksN: [won.length / 3, 2, 2], trick: [], turn: 0 });
        st.hands = last.map(c => [c]);
        for (let s = 0; s < 3 && !st.over; s++) g.apply(st, s, { a: 'play', c: last[s] });
        return st.over;
      };
      const mit2 = ['CJ', 'SJ', 'DJ', 'C10'];
      const big = ['CA', 'C10', 'SA', 'S10', 'HA', 'H10'];     // 63 points
      return {
        won: finish({ g: 'C', o: false }, 24, big, ['DK', 'D7', 'D9'], mit2),
        overbid: finish({ g: 'C', o: false }, 48, big, ['DK', 'D7', 'D9'], mit2),
        schneiderLost: finish({ g: 'C', o: false }, 24, ['SA', 'SK', 'S7'], ['D7', 'DK', 'D9'], mit2),
        grandSchneider: finish({ g: 'G', o: false }, 24, [...big, 'DA', 'D10', 'SK', 'CK', 'HK', 'HQ'], ['DK', 'D7', 'D9'], ['CJ', 'SJ', 'HJ']),
        nullLost: finish({ g: 'N', o: false }, 23, [], ['DA', 'D7', 'D9'], []),
      };
    });
    // 67 points (63 + king of diamonds), with 2 → (2 + 1) × 12 = 36
    expect(r.won).toMatchObject({ decl: 0, points: 67, won: true, value: 36, score: 36, scores: [36, 0, 0], schneider: false });
    // Bid 48 > 36: lost as the next multiple of 12 from 48, twice
    expect(r.overbid).toMatchObject({ won: false, overbid: true, value: 48, score: -96 });
    // 15 points: lost and schneider → (2 + 1 + 1) × 12 = 48, −96
    expect(r.schneiderLost).toMatchObject({ points: 15, won: false, schneider: true, value: 48, score: -96 });
    // Grand with 3: 99 + king of diamonds = 103 points, schneider → (3 + 1 + 1) × 24 = 120
    expect(r.grandSchneider).toMatchObject({ points: 103, won: true, schneider: true, value: 120, score: 120 });
    // Null: the declarer takes a trick → lost at once, 2 × 23
    expect(r.nullLost).toMatchObject({ g: 'N', won: false, value: 23, score: -46 });
  });
});

test.describe('Rommé rules', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('runs, sets and jokers; adding to melds', async ({ page }) => {
    const r = await rules(page, C => {
      const R = C.games.rommee.rules, J = C.JOKER;
      const a = cs => { const m = R.analyze(cs); return m && { t: m.t, lo: m.lo, cards: m.cards, v: R.meldValue(m) }; };
      const run = R.analyze(['H5', 'H6', 'H7']), set = R.analyze(['C7', 'S7', 'H7']), four = R.analyze(['C7', 'S7', 'H7', 'D7']);
      const ext = (m, c) => { const x = R.extend(m, c); return x && x.cards; };
      return {
        ok: [a(['H7', 'H5', 'H6']), a(['H5', J, 'H7']), a(['HA', 'H2', 'H3']), a(['HQ', 'HK', 'HA']), a(['C7', 'S7', 'H7']), a([J, 'S7', 'H7']), a(['H5', J, J])],
        bad: [['HK', 'HA', 'H2'], ['C7', 'C7', 'S7'], ['C7', 'S7', 'H7', 'D7', J], ['H5', 'S6', 'H7'], ['H5', 'H6'], [J, J, J], ['H5', 'H5', 'H6']].map(cs => R.analyze(cs)),
        ext: [ext(run, 'H8'), ext(run, 'H4'), ext(run, 'S8'), ext(run, J), ext(run, 'H9'), ext(set, 'D7'), ext(set, 'C7'), ext(four, J),
          ext(R.analyze(['HJ', 'HQ', 'HK']), 'HA'), ext(R.analyze(['H2', 'H3', 'H4']), 'HA')],
        penalty: [J, 'HA', 'HK', 'H10', 'H5', 'C2'].map(R.penalty),
      };
    });
    expect(r.ok).toEqual([
      { t: 'run', lo: 5, cards: ['H5', 'H6', 'H7'], v: 18 },
      { t: 'run', lo: 5, cards: ['H5', 'X*', 'H7'], v: 18 },
      { t: 'run', lo: 1, cards: ['HA', 'H2', 'H3'], v: 6 },        // ace low counts 1
      { t: 'run', lo: 12, cards: ['HQ', 'HK', 'HA'], v: 31 },
      { t: 'set', lo: undefined, cards: ['C7', 'S7', 'H7'], v: 21 },
      { t: 'set', lo: undefined, cards: ['S7', 'H7', 'X*'], v: 21 },
      { t: 'set', lo: undefined, cards: ['H5', 'X*', 'X*'], v: 15 },
    ]);
    // K-A-2 wraps, two clubs 7 in a set, 5 cards in a set, mixed suits, too short, jokers only, a run with a rank twice
    expect(r.bad).toEqual([null, null, null, null, null, null, null]);
    expect(r.ext).toEqual([['H5', 'H6', 'H7', 'H8'], ['H4', 'H5', 'H6', 'H7'], null, ['H5', 'H6', 'H7', 'X*'], null,
      ['C7', 'S7', 'H7', 'D7'], null, null, ['HJ', 'HQ', 'HK', 'HA'], ['HA', 'H2', 'H3', 'H4']]);
    expect(r.penalty).toEqual([20, 11, 10, 10, 5, 2]);
  });

  test('first lay-down needs 40 points, then any meld; taken card stays; winner and points', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.rommee, out = {};
      const st = g.setup(2, 6);
      Object.assign(st, { turn: 0, phase: 'draw', melds: [], out: [false, false] });
      st.hands[0] = ['HQ', 'HK', 'HA', 'C7', 'S7', 'H7', 'D2', 'D3', 'D4', 'S9'];
      st.hands[1] = [C.JOKER, 'CA', 'CK', 'C10', 'C5'];
      st.pile.push('S9');
      out.draw = g.moves(st, 0);
      out.notTurn = g.moves(st, 1);
      g.apply(st, 0, { a: 'take' });
      out.taken = { discard: g.moves(st, 0).filter(m => m.a === 'discard').map(m => m.c).sort() };
      out.allowed = [
        C.legal(g, st, 0, { a: 'meld', cs: ['HQ', 'HK', 'HA'] }),                          // 31 < 40
        C.legal(g, st, 0, { a: 'meld', cs: ['HQ', 'HK', 'HA', 'C7', 'S7', 'H7'] }),        // 52
        C.legal(g, st, 0, { a: 'meld', cs: ['HQ', 'HK', 'HA', 'C7', 'S7', 'D7'] }),        // not in the hand
        C.legal(g, st, 0, { a: 'meld', cs: ['HQ', 'HK', 'HA', 'C7', 'S7', 'D2'] }),        // no meld
        C.legal(g, st, 0, { a: 'meld', cs: ['HQ', 'HK', 'HA', 'C7', 'S7', 'H7'], x: 1 }),  // unknown field
        C.legal(g, st, 1, { a: 'meld', cs: ['CA', 'CK', 'C10'] }),                         // not this player's turn
      ];
      g.apply(st, 0, { a: 'meld', cs: ['HA', 'HK', 'HQ', 'H7', 'S7', 'C7'] });
      out.afterOpen = { melds: st.melds.map(m => m.cards), hand: st.hands[0].slice().sort(), out: st.out[0] };
      out.small = C.legal(g, st, 0, { a: 'meld', cs: ['D2', 'D3', 'D4'] });
      out.lay = g.moves(st, 0).filter(m => m.a === 'lay');
      g.apply(st, 0, { a: 'meld', cs: ['D2', 'D3', 'D4'] });
      out.left = st.hands[0].slice();
      st.hands[0] = ['S9']; st.taken = null;                 // last card: discarding it ends the round
      g.apply(st, 0, { a: 'discard', c: 'S9' });
      out.over = g.result(st);
      out.ended = { hand: st.hands[0].length, moves: g.moves(st, 1) };
      return out;
    });
    expect(r.draw).toEqual([{ a: 'draw' }, { a: 'take' }]);
    expect(r.notTurn).toEqual([]);
    // S9 was taken from the pile: the other S9 may go, but only because there are two
    expect(r.taken.discard).toEqual(['C7', 'D2', 'D3', 'D4', 'H7', 'HA', 'HK', 'HQ', 'S7', 'S9']);
    expect(r.allowed).toEqual([false, true, false, false, false, false]);
    expect(r.afterOpen.out).toBe(true);
    expect(r.afterOpen.melds).toEqual(expect.arrayContaining([['HQ', 'HK', 'HA'], ['H7', 'S7', 'C7']].map(m => expect.arrayContaining(m))));
    expect(r.afterOpen.hand).toEqual(['D2', 'D3', 'D4', 'S9', 'S9']);
    expect(r.small).toBe(true);
    // Down now: S9 fits neither the hearts run nor the set of 7s
    expect(r.lay.filter(m => m.c === 'S9')).toEqual([]);
    expect(r.left).toEqual(['S9', 'S9']);
    // Joker 20 + ace 11 + king 10 + ten 10 + 5 = 56
    expect(r.over).toEqual({ winner: 0, points: [0, 56], stuck: false, scores: [0, 56] });
    expect(r.ended).toEqual({ hand: 0, moves: [] });
  });
});

test.describe('Poker rules', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('hand ranking with kickers', async ({ page }) => {
    const hands = {
      sflush: ['HA', 'HK', 'HQ', 'HJ', 'H10', 'C2', 'D3'],
      quads: ['C9', 'D9', 'H9', 'S9', 'HK', 'C2', 'D3'],
      full: ['C9', 'D9', 'H9', 'SK', 'HK', 'CK', 'D3'],          // two trips: kings full of nines
      flush: ['H2', 'H7', 'H9', 'HJ', 'HK', 'C3', 'D4'],
      straight6: ['C2', 'D3', 'S4', 'H5', 'C6', 'DK', 'SA'],
      wheel: ['HA', 'C2', 'D3', 'S4', 'H5', 'C9', 'DK'],
      trips: ['C7', 'D7', 'H7', 'SA', 'HK', 'C2', 'D4'],
      twoPair: ['CA', 'DA', 'H8', 'S8', 'H3', 'C3', 'DK'],         // third pair: king kicker counts
      twoPairQ: ['CA', 'DA', 'H8', 'S8', 'HQ', 'C3', 'D2'],
      pairK: ['CA', 'DA', 'HK', 'S8', 'H6', 'C3', 'D2'],
      pairQ: ['CA', 'DA', 'HQ', 'S8', 'H6', 'C3', 'D2'],
      high: ['CA', 'DJ', 'H9', 'S7', 'H5', 'C3', 'D2'],
    };
    const r = await rules(page, (C, hs) => {
      const R = C.games.poker.rank;
      return Object.fromEntries(Object.entries(hs).map(([k, h]) => [k, { s: R.best(h), cat: R.category(R.best(h)) }]));
    }, hands);
    const order = ['sflush', 'quads', 'full', 'flush', 'straight6', 'wheel', 'trips', 'twoPair', 'twoPairQ', 'pairK', 'pairQ', 'high'];
    for (let i = 1; i < order.length; i++) expect(r[order[i - 1]].s, `${order[i - 1]} > ${order[i]}`).toBeGreaterThan(r[order[i]].s);
    expect(order.map(k => r[k].cat)).toEqual([8, 7, 6, 5, 4, 4, 3, 2, 2, 1, 1, 0]);
    // Same five cards from the board: a tie
    const tie = await rules(page, C => { const R = C.games.poker.rank; return [R.best(['C2', 'D3', 'HA', 'HK', 'HQ', 'HJ', 'H10']), R.best(['S4', 'D5', 'HA', 'HK', 'HQ', 'HJ', 'H10'])]; });
    expect(tie[0]).toBe(tie[1]);
  });

  test('blinds heads-up, raise sizes, all-ins with side pots', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.poker, out = {};
      let st = g.setup(2, 12);
      out.hu = { dealer: st.dealer, sb: st.sbSeat, toAct: st.toAct, bets: st.bets.slice(), moves: g.moves(st, st.toAct) };
      g.apply(st, st.toAct, { a: 'raise', to: 60 });
      out.reraise = g.moves(st, st.toAct).filter(m => m.a === 'raise').map(m => m.to)[0];
      g.apply(st, st.toAct, { a: 'fold' });
      out.fold = { prev: st.prev, hand: st.handNo };
      // Three players all-in for 100, 300 and 500 chips: aces, kings, queens
      st = g.setup(3, 5);
      Object.assign(st, { chips: [100, 300, 500], put: [0, 0, 0], bets: [0, 0, 0], acted: [false, false, false], folded: [false, false, false],
        dealt: [true, true, true], curBet: 0, minRaise: 20, toAct: 0, street: 0, board: [], dealer: 2, blind: [10, 20],
        hole: [['SA', 'HA'], ['SK', 'HK'], ['SQ', 'HQ']] });
      st.deck = ['D3', 'C2', 'D7', 'S9', 'HJ', 'C4'];
      g.apply(st, 0, { a: 'raise', to: 100 });
      g.apply(st, 1, { a: 'raise', to: 300 });
      g.apply(st, 2, { a: 'call' });
      out.side = { prev: st.prev, total: st.chips.map((c, s) => c + st.put[s]) };
      return out;
    });
    // Heads-up: the dealer posts the small blind and acts first
    expect(r.hu.sb).toBe(r.hu.dealer);
    expect(r.hu.toAct).toBe(r.hu.dealer);
    expect(r.hu.bets[r.hu.dealer]).toBe(10);
    expect(r.hu.bets[1 - r.hu.dealer]).toBe(20);
    // Call 10; raise to 40 (min = half pot: 20 + 40 / 2), 60 (pot: 20 + 30 + 10), all-in 1000
    expect(r.hu.moves).toEqual([{ a: 'fold' }, { a: 'call' }, { a: 'raise', to: 40 }, { a: 'raise', to: 60 }, { a: 'raise', to: 1000 }]);
    // Raised by 40 to 60: the next raise goes to at least 100
    expect(r.reraise).toBe(100);
    // Folding: no cards shown, the raiser wins the pot (60 + 20)
    expect(r.fold.prev.shown).toEqual([]);
    expect(r.fold.prev.wins).toEqual([{ s: r.hu.dealer, w: 80 }]);
    expect(r.fold.hand).toBe(2);
    // Main pot 3 × 100 to the aces, side pot 2 × 200 to the kings, the queens keep their 200
    expect(r.side.prev.board).toEqual(['C4', 'HJ', 'S9', 'D7', 'C2']);
    expect(r.side.prev.wins).toEqual([{ s: 0, w: 300 }, { s: 1, w: 400 }]);
    expect(r.side.total).toEqual([300, 400, 200]);
    expect(r.side.prev.shown.map(x => x.cat)).toEqual([1, 1, 1]);
  });
});

test.describe('Solitaire rules', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('deal, moves on columns and foundations, uncovering, undo, turning the stock over, finishing', async ({ page }) => {
    const r = await rules(page, C => {
      const g = C.games.solitaire, out = {};
      let st = g.setup(1, 77);
      out.deal = { down: st.tab.map(c => c.down.length), up: st.tab.map(c => c.up.length), stock: st.stock.length,
        unique: new Set([...st.stock, ...st.tab.flatMap(c => [...c.down, ...c.up])]).size };
      st.tab = [{ down: [], up: ['S8'] }, { down: ['C2'], up: ['H7'] }, { down: [], up: [] }, { down: ['D5'], up: ['CK', 'HQ'] },
        { down: [], up: ['DA'] }, { down: [], up: ['S9'] }, { down: [], up: ['C3'] }];
      st.stock = ['D9']; st.waste = ['C8']; st.found = [[], [], [], []];
      const key = m => m.a + (m.c ? ':' + m.c + '>' + m.to : '');
      out.moves = g.moves(st, 0).map(key);
      g.apply(st, 0, { a: 'mv', c: 'H7', to: 0 });
      out.uncover = { col0: st.tab[0].up, col1: st.tab[1] };
      g.apply(st, 0, { a: 'mv', c: 'CK', to: 2 });
      out.king = { col2: st.tab[2].up, col3: st.tab[3] };
      g.apply(st, 0, { a: 'undo' });
      out.undo = { col2: st.tab[2].up, col3: st.tab[3], moves: st.moves };
      g.apply(st, 0, { a: 'mv', c: 'DA', to: 'f' });
      out.found = st.found[3];
      g.apply(st, 0, { a: 'draw' });
      out.stock = { stock: st.stock.slice(), waste: st.waste.slice(), label: g.moves(st, 0).some(m => m.a === 'draw') };
      g.apply(st, 0, { a: 'draw' });
      out.over = { stock: st.stock, waste: st.waste, recycled: st.recycled };
      // Everything face up: "finish" puts all cards away
      st = g.setup(1, 5);
      const all = C.deck('2');
      st.stock = []; st.waste = []; st.found = [[], [], [], []];
      st.tab = C.SUITS.map(s => ({ down: [], up: ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2', 'A'].map(r => s + r) }));
      st.tab.push({ down: [], up: [] }, { down: [], up: [] }, { down: [], up: [] });
      out.auto = g.moves(st, 0).some(m => m.a === 'auto');
      g.apply(st, 0, { a: 'auto' });
      out.won = { result: g.result(st), found: st.found.map(f => f.length), total: all.length };
      return out;
    });
    expect(r.deal).toEqual({ down: [0, 1, 2, 3, 4, 5, 6], up: [1, 1, 1, 1, 1, 1, 1], stock: 24, unique: 52 });
    // Red 7 on black 8, king (with its queen) into the empty column, ace to its foundation – nothing else
    expect(r.moves.sort()).toEqual(['draw', 'giveup', 'mv:CK>2', 'mv:DA>f', 'mv:H7>0']);
    expect(r.uncover).toEqual({ col0: ['S8', 'H7'], col1: { down: [], up: ['C2'] } });
    expect(r.king).toEqual({ col2: ['CK', 'HQ'], col3: { down: [], up: ['D5'] } });
    expect(r.undo).toEqual({ col2: [], col3: { down: ['D5'], up: ['CK', 'HQ'] }, moves: 1 });
    expect(r.found).toEqual(['DA']);
    expect(r.stock).toEqual({ stock: [], waste: ['C8', 'D9'], label: true });
    // Empty stock: the waste becomes the stock again (top card of the waste last)
    expect(r.over).toEqual({ stock: ['D9', 'C8'], waste: [], recycled: 1 });
    expect(r.auto).toBe(true);
    expect(r.won.found).toEqual([13, 13, 13, 13]);
    expect(r.won.result).toMatchObject({ won: true, found: 52 });
  });
});

test('computer games run to the end without losing or duplicating a card', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto(URL_);
  const res = await rules(page, C => {
    // Every card of the game exactly once, wherever it is (Rommé: two decks and 6 jokers)
    const cardsOf = {
      'mau-mau': st => [...st.hands.flat(), ...st.draw, ...st.pile],
      durak: st => [...st.hands.flat(), ...st.deck, ...st.table.flatMap(p => p.d ? [p.a, p.d] : [p.a])],
      skat: st => [...st.hands.flat(), ...(st.phase === 'push' ? st.pushed : st.skat), ...st.trick.map(p => p.c), ...st.won.flat()],
      rommee: st => [...st.hands.flat(), ...st.stock, ...st.pile, ...st.melds.flatMap(m => m.cards)],
      poker: st => [...st.hole.flat(), ...st.board, ...st.deck],
      solitaire: st => [...st.stock, ...st.waste, ...st.found.flat(), ...st.tab.flatMap(c => [...c.down, ...c.up])],
    };
    const deck = { 'mau-mau': 32, durak: 36, skat: 32, rommee: 110, poker: 52, solitaire: 52 };
    const count = { 'mau-mau': 120, durak: 120, skat: 120, rommee: 60, poker: 15, solitaire: 120 };
    const out = [];
    for (const id of Object.keys(deck)) {
      const g = C.games[id];
      for (let k = 0; k < count[id]; k++) {
        const n = g.players.min + (k % (g.players.max - g.players.min + 1));
        const st = g.setup(n, 1000 + k);
        let steps = 0, bad = null;
        while (!g.result(st) && steps < 6000) {
          const seats = [...Array(n).keys()].filter(s => g.moves(st, s).length);
          if (!seats.length) { bad = 'nobody can move'; break; }
          let moved = false;
          for (const s of seats) {
            const m = g.bot(st, s);
            if (!m) continue;
            if (!C.legal(g, st, s, m)) { bad = 'bot made an illegal move'; break; }
            g.apply(st, s, m); moved = true; break;
          }
          if (bad) break;
          if (!moved) { bad = 'all bots wait'; break; }
          steps++;
          const cards = cardsOf[id](st);
          const total = cards.length + (id === 'durak' ? st.discard : 0);
          const unique = id === 'rommee'
            ? cards.filter(c => c === C.JOKER).length === 6 && C.deck('2').every(c => cards.filter(x => x === c).length === 2)
            : new Set(cards).size === cards.length;
          if (total !== deck[id] || !unique) { bad = 'cards lost or doubled'; break; }
          // Poker: chips never appear or vanish
          if (id === 'poker' && st.chips.reduce((a, b) => a + b, 0) + st.put.reduce((a, b) => a + b, 0) !== 1000 * n) { bad = 'chips lost'; break; }
        }
        out.push({ id, n, steps, bad, result: g.result(st), hands: (st.hands || []).map(h => h.length), chips: st.chips });
      }
    }
    return out;
  });
  for (const g of res) {
    expect(g.bad, `${g.id} ${g.n} players`).toBeNull();
    expect(g.result, `${g.id} ended`).not.toBeNull();
    if (g.id === 'mau-mau') expect(g.hands[g.result.winner]).toBe(0);
    else if (g.id === 'durak') {
      // Durak: everyone but the loser is out without cards; the loser holds cards
      g.hands.forEach((h, s) => { if (s !== g.result.loser) expect(h).toBe(0); });
      if (g.result.loser != null) expect(g.hands[g.result.loser]).toBeGreaterThan(0);
      expect(new Set(g.result.out).size).toBe(g.result.out.length);
    } else if (g.id === 'rommee') {
      if (!g.result.stuck) expect(g.hands[g.result.winner]).toBe(0);
      expect(g.result.points[g.result.winner]).toBe(Math.min(...g.result.points));
    } else if (g.id === 'poker') {
      // The winner holds every chip, the others are placed in the order they dropped out
      expect(g.chips[g.result.winner]).toBe(1000 * g.n);
      expect([...g.result.places, g.result.winner].sort()).toEqual([...Array(g.n).keys()]);
    } else if (g.id === 'skat') {
      expect(g.result.scores.filter(x => x !== 0).length).toBe(1);
      expect(g.result.scores[g.result.decl]).toBe(g.result.won ? g.result.value : -2 * g.result.value);
    }
  }
  // Different winners; Skat won and lost; Solitaire sometimes solved
  for (const id of ['mau-mau', 'rommee', 'poker']) expect(new Set(res.filter(g => g.id === id).map(g => g.result.winner)).size).toBeGreaterThan(1);
  expect(new Set(res.filter(g => g.id === 'skat').map(g => g.result.won)).size).toBe(2);
  expect(new Set(res.filter(g => g.id === 'skat').map(g => g.result.g)).size).toBeGreaterThan(2);
  expect(res.filter(g => g.id === 'solitaire' && g.result.won).length).toBeGreaterThan(0);
});

/** Plays one own move through the UI: first playable card (first option of the chooser) or an action.
    prefs: the actions to prefer (data-move), 'LAST' = the last button (Poker: all-in) */
async function playOnce(page, prefs = ['done', 'pass']) {
  return page.evaluate(prefs => {
    const card = document.querySelector('#hand .card-face.can');
    const act = [...document.querySelectorAll('#actions .btn')];
    // Prefer cards; Durak "done"/"take" and Mau Mau "draw"/"pass" otherwise
    if (card) { card.click(); const opt = document.querySelector('#chooser:not([hidden]) .btn.primary'); if (opt) opt.click(); return 'card'; }
    for (const p of prefs) {
      const b = p === 'LAST' ? act[act.length - 1] : act.find(x => x.dataset.move === p);
      if (b) { b.click(); return b.dataset.move; }
    }
    if (act[0]) { act[0].click(); return act[0].dataset.move; }
    // Rommé: select one card and discard it (the card just taken from the pile may not go back: then the next one)
    const hand = [...document.querySelectorAll('#hand .card-face:not(:disabled)')];
    for (let i = 0; i < hand.length; i++) {
      document.querySelectorAll('#hand .card-face')[i].click();
      const d = document.querySelector('#actions [data-move="discard"]');
      if (d) { d.click(); return 'discard'; }
      document.querySelectorAll('#hand .card-face')[i].click();
    }
    return null;
  }, prefs);
}
async function playToEnd(pages, limit = 600, prefs) {
  for (let k = 0; k < limit; k++) {
    let acted = false;
    for (const p of pages) {
      if (await p.locator('#over').isVisible()) return k;
      if (await p.locator('#turn.mine').count()) { if (await playOnce(p, prefs)) acted = true; }
    }
    if (!acted) await pages[0].waitForTimeout(60);
  }
  throw new Error('game did not end');
}

test.describe('against the computer', () => {
  test.beforeEach(async ({ page }) => { await fast(page); });

  for (const [id, title, bots] of [['mau-mau', 'Mau Mau', 2], ['durak', 'Durak', 3]]) {
    test(`${title}: a whole game through the UI, result counted`, async ({ page }) => {
      test.setTimeout(90000);
      await page.goto(URL_);
      await page.click(`#gamePick [data-game="${id}"]`);
      await expect(page.locator(`#gamePick [data-game="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      await page.selectOption('#cpuN', String(bots));
      await page.click('#btnCpu');
      await expect(page.locator('#scrPlay')).toBeVisible();
      await expect(page.locator('#seats .seat')).toHaveCount(bots);
      await expect(page.locator('#seats .seat').first()).toContainText('Computer 1');
      await expect(page.locator('#hand .card-face')).toHaveCount(id === 'mau-mau' ? 5 : 6);
      // Shown counts = cards of each player in the game state
      await playToEnd([page]);
      await expect(page.locator('#over')).toBeVisible();
      await expect(page.locator('#overText')).toHaveText(id === 'mau-mau' ? /gewinnst|gewinnt/ : /Durak|Unentschieden/);
      await page.click('#btnEnd');
      await expect(page.locator('#scrLobby')).toBeVisible();
      await expect(page.locator('#stats')).toContainText(`${title}: `);
      await expect(page.locator('#stats')).toContainText('von 1 gewonnen');
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('card-games.stats.v1')));
      expect(saved[id].played).toBe(1);
    });
  }

  // Skat: always bid and hold (this player becomes declarer), pick up the Skat, first game (clubs); Poker: always all-in
  for (const [id, title, bots, prefs, over] of [
    ['skat', 'Skat', 2, ['bid', 'yes', 'skat'], /^Du (gewinnst|verlierst) Kreuz mit \d+ Augen: [+−]\d+\./],
    ['rommee', 'Rommé', 1, ['draw'], /gewinnst|gewinnt/],
    ['poker', 'Poker', 1, ['LAST'], /Turnier/],
  ]) {
    test(`${title}: a whole game through the UI, result counted`, async ({ page }) => {
      test.setTimeout(120000);
      await page.goto(URL_);
      await page.click(`#gamePick [data-game="${id}"]`);
      if (id !== 'skat') await page.selectOption('#cpuN', String(bots));
      await page.click('#btnCpu');
      await expect(page.locator('#seats .seat')).toHaveCount(bots);
      await expect(page.locator('#hand .card-face')).toHaveCount({ skat: 10, rommee: 13, poker: 2 }[id]);
      await playToEnd([page], 3000, prefs);
      await expect(page.locator('#overText')).toHaveText(over);
      if (id === 'skat') await expect(page.locator('#overTally')).toHaveText(/^Stand nach 1 Spiel: Du -?\d+ · Computer 1 0 · Computer 2 0$/);
      if (id === 'rommee') await expect(page.locator('#overTally')).toHaveText(/^Minuspunkte nach 1 Runde: Du \d+ · Computer 1 \d+$/);
      if (id === 'poker') await expect(page.locator('#overTally')).toBeHidden();
      await page.click('#btnEnd');
      await expect(page.locator('#stats')).toContainText(`${title}: `);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('card-games.stats.v1')));
      expect(saved[id].played).toBe(1);
    });
  }

  test('Skat: only two computer opponents; the score adds up over several games', async ({ page }) => {
    test.setTimeout(120000);
    await page.goto(URL_);
    await page.click('#gamePick [data-game="skat"]');
    await expect(page.locator('#cpuN option')).toHaveText(['2']);
    await page.click('#btnCpu');
    await expect(page.locator('.sk-table')).toContainText('Noch nichts gereizt');
    const scores = [];
    for (let k = 1; k <= 2; k++) {
      await playToEnd([page], 3000, ['bid', 'yes', 'skat']);
      const text = await page.locator('#overText').textContent();
      scores.push(Number(text.match(/: ([+−])(\d+)\./).slice(1).join('').replace('−', '-')));
      const sum = scores.reduce((a, b) => a + b, 0);
      await expect(page.locator('#overTally')).toHaveText(new RegExp(`^Stand nach ${k} Spiel(en)?: Du ${sum < 0 ? '-' : ''}${Math.abs(sum)} · `));
      if (k === 1) await page.click('#btnAgain');
    }
  });

  test('Rommé: select cards, the buttons follow the selection; laid-down melds show on the table', async ({ page }) => {
    await page.goto(URL_);
    await page.click('#gamePick [data-game="rommee"]');
    await page.click('#btnCpu');
    await expect(page.locator('#turn.mine')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#turn')).toHaveText('Du bist dran: vom Stapel ziehen oder die Ablage nehmen.');
    await expect(page.locator('#actions .btn')).toHaveText(['Vom Stapel ziehen', 'Ablage nehmen']);
    // Before drawing the cards cannot be selected
    await expect(page.locator('#hand .card-face:disabled')).toHaveCount(13);
    await page.click('#actions [data-move="draw"]');
    await expect(page.locator('#hand .card-face:not(:disabled)')).toHaveCount(14);
    await expect(page.locator('#actions .btn')).toHaveCount(0);
    await page.locator('#hand .card-face').first().click();
    await expect(page.locator('#hand .card-face').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#actions [data-move="discard"]')).toHaveText('Ablegen');
    await page.locator('#hand .card-face').nth(1).click();
    await expect(page.locator('#turn')).toHaveText('Ausgewählt: 2 Karten.');
    await expect(page.locator('#actions .btn')).toHaveCount(0);
    await page.locator('#hand .card-face').nth(2).click();
    await expect(page.locator('#turn')).toHaveText(/^(Das ist keine gültige Reihe oder kein Satz\.|\d+ Punkte – zum ersten Auslegen sind 40 nötig\.|Ausgewählt: 3 Karten, \d+ Punkte\.)$/);
    // Deselect all, discard one card: the computer is next
    for (const i of [2, 1]) await page.locator('#hand .card-face').nth(i).click();
    await page.click('#actions [data-move="discard"]');
    await expect(page.locator('#hand .card-face')).toHaveCount(13);
    await expect(page.locator('#turn.mine')).toHaveCount(0);
    await expect(page.locator('.rm-piles .pile').nth(1).locator('.card-face')).toHaveCount(1);
  });

  test('Solitaire: alone, tap the stock and cards, undo, give up', async ({ page }) => {
    await page.goto(URL_);
    await page.click('#gamePick [data-game="solitaire"]');
    await expect(page.locator('#btnCpu')).toHaveText('Spielen');
    await expect(page.locator('#cpuN')).toBeHidden();
    await expect(page.locator('#btnHost')).toBeHidden();
    await page.click('#btnCpu');
    await expect(page.locator('#seats')).toBeHidden();
    await expect(page.locator('#hand')).toBeHidden();
    await expect(page.locator('.so-col')).toHaveCount(7);
    await expect(page.locator('.so-col .card-back')).toHaveCount(21);
    await expect(page.locator('.so-col .card-face')).toHaveCount(7);
    await expect(page.locator('.so-moves')).toHaveText('Züge: 0');
    await page.click('.so-stock');
    await expect(page.locator('.so-waste .card-face')).toHaveCount(1);
    await expect(page.locator('.so-moves')).toHaveText('Züge: 1');
    await page.click('#actions [data-move="undo"]');
    await expect(page.locator('.so-waste .card-face')).toHaveCount(0);
    await expect(page.locator('.so-moves')).toHaveText('Züge: 0');
    // Tap movable cards (turn the stock until there is one): every tap is a move
    for (let k = 0; k < 6; k++) {
      const can = page.locator('.so-grid button.card-face.can');
      if (!await can.count()) { await page.click('.so-stock'); continue; }
      const before = Number((await page.locator('.so-moves').textContent()).match(/\d+/)[0]);
      await can.first().click({ position: { x: 10, y: 6 } });   // the visible strip of a covered card
      if (await page.locator('#chooser').isVisible()) await page.locator('#chooser .btn.primary').first().click();
      await expect(page.locator('.so-moves')).toHaveText(`Züge: ${before + 1}`);
    }
    await onDialog(page, d => d.accept());
    await page.click('#actions [data-move="giveup"]');
    await expect(page.locator('#overText')).toHaveText(/^Aufgegeben – \d+ von 52 Karten abgelegt\.$/);
    await page.click('#btnEnd');
    await expect(page.locator('#stats')).toContainText('Solitaire: 0 von 1 gewonnen');
  });

  for (const scheme of ['light', 'dark']) {
    test(`game tables are accessible (${scheme})`, async ({ page }) => {
      test.setTimeout(60000);
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(URL_);
      for (const id of ['mau-mau', 'durak', 'skat', 'rommee', 'poker', 'solitaire']) {
        await page.click(`#gamePick [data-game="${id}"]`);
        await page.click('#btnCpu');
        await expect(page.locator('#scrPlay')).toBeVisible();
        if (id === 'rommee') {
          await expect(page.locator('#turn.mine')).toBeVisible({ timeout: 15000 });
          await page.click('#actions [data-move="draw"]');
          await page.locator('#hand .card-face').first().click();
        }
        const { violations } = await axe(page).analyze();
        expect(violations.map(v => `${id}: ${v.id} ${v.nodes.map(n => n.target).join(' ')}`)).toEqual([]);
        await onDialog(page, d => d.accept(), { once: true });
        await page.click('#btnLeave');
        await expect(page.locator('#scrLobby')).toBeVisible();
      }
    });
  }

  test('the round with other phones offers no single-player game', async ({ page }) => {
    await page.goto(URL_);
    await page.click('#gamePick [data-game="solitaire"]');
    await page.click('#gamePick [data-game="poker"]');
    await page.click('#btnHost');
    await expect(page.locator('#roomPick .btn')).toHaveText(['Mau Mau', 'Durak', 'Skat', 'Rommé', 'Poker']);
    await expect(page.locator('#roomPick [data-game="poker"]')).toHaveAttribute('aria-pressed', 'true');
    await page.click('#roomPick [data-game="skat"]');
    await page.click('#btnAddBot');
    await expect(page.locator('#btnStart')).toBeDisabled();
    await expect(page.locator('#roomStatus')).toHaveText('Mindestens 3 Spieler – Handy einladen oder Computer dazu.');
    await page.click('#btnAddBot');
    await expect(page.locator('#btnStart')).toBeEnabled();
    await expect(page.locator('#btnAddBot')).toBeDisabled();
  });

  test('only cards that fit can be tapped (checked independently), drawing is offered', async ({ page }) => {
    await page.goto(URL_);
    await page.click('#btnCpu');
    await expect(page.locator('#turn.mine')).toBeVisible({ timeout: 15000 });
    const s = await page.evaluate(() => ({
      top: document.querySelector('.mm-table .pile .card-face').dataset.card,
      wish: (document.querySelector('.tag.wish') || {}).textContent || '',
      pen: !!document.querySelector('.tag.pen'),
      can: [...document.querySelectorAll('#hand .card-face.can')].map(e => e.dataset.card).sort(),
      all: [...document.querySelectorAll('#hand .card-face')].map(e => e.dataset.card),
      off: document.querySelectorAll('#hand .card-face:disabled').length,
      draw: document.querySelector('#actions [data-move="draw"]').textContent,
    }));
    const SYM = { '♣': 'C', '♠': 'S', '♥': 'H', '♦': 'D' };
    const wish = SYM[[...s.wish].find(ch => SYM[ch])] || null;
    const rank = c => c.slice(1), suit = c => c[0];
    const fits = c => s.pen ? rank(c) === '7'
      : rank(c) === 'J' ? rank(s.top) !== 'J'
      : wish ? suit(c) === wish : suit(c) === suit(s.top) || rank(c) === rank(s.top);
    expect(s.can).toEqual(s.all.filter(fits).sort());
    expect(s.can.length + s.off).toBe(s.all.length);
    expect(s.draw).toBe(s.pen ? `${(await page.locator('.tag.pen').textContent()).match(/\d+/)[0]} Karten ziehen` : 'Karte ziehen');
  });

  test('settings: name and speed are kept', async ({ page }) => {
    await page.goto(URL_);
    const { openMenu } = await import('./helpers.mjs');
    await openMenu(page);
    await page.fill('#optName', 'Kim');
    await page.locator('#optName').blur();
    await page.selectOption('#optSpeed', 'slow');
    await page.reload();
    await expect(page.locator('#optName')).toHaveValue('Kim');
    await expect(page.locator('#optSpeed')).toHaveValue('slow');
  });
});

/* ---------------- Several devices ---------------- */
async function phone(browser, baseURL, opts = {}) {
  const context = await browser.newContext({ baseURL, locale: 'de-DE', serviceWorkers: 'allow', ...opts });
  const page = await context.newPage();
  await privateClipboard(page);
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(baseURL) && !/^(data|blob):/.test(u)) problems.push(`external request: ${u}`); });
  return { context, page, problems };
}
/** Host invites one guest by copied codes */
async function invite(host, guest) {
  await host.click('#btnInvite');
  await expect(host.locator('#qrOffer')).toHaveAttribute('data-text', /#join=O1~/);
  await host.click('#btnCopyOffer');
  const link = await clipboardText(host);
  await openDetails(guest, 'Spiel-Code von Hand eingeben');
  await guest.fill('#offerIn', link);
  await guest.click('#btnOfferIn');
  await expect(guest.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  await guest.click('#btnCopyAnswer');
  const reply = await clipboardText(guest);
  await openDetails(host, 'Antwort-Code von Hand eingeben');
  await host.fill('#answerIn', reply);
  await host.click('#btnAnswerIn');
  await expect(host.locator('#scrRoom')).toBeVisible({ timeout: 15000 });
  await expect(guest.locator('#scrWait')).toBeVisible({ timeout: 15000 });
}

test('three phones and a computer play Durak; everyone sees only their own cards', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(150000);
  await fast(host, { 'card-games.settings.v1': JSON.stringify({ speed: 'fast', name: 'Ada' }) });
  const a = await phone(browser, baseURL), b = await phone(browser, baseURL);
  await fast(a.page, { 'card-games.settings.v1': JSON.stringify({ name: 'Ben' }) });
  await fast(b.page, { 'card-games.settings.v1': JSON.stringify({ name: 'Cleo' }) });
  for (const p of [host, a.page, b.page]) await p.goto(URL_);
  await host.click('#gamePick [data-game="durak"]');
  await host.click('#btnHost');
  await expect(host.locator('#scrRoom')).toBeVisible();
  await expect(host.locator('#roomPlayers li')).toHaveCount(1);
  await expect(host.locator('#btnStart')).toBeDisabled();
  await expect(host.locator('#roomStatus')).toHaveText('Mindestens 2 Spieler – Handy einladen oder Computer dazu.');

  await invite(host, a.page);
  await expect(host.locator('#roomPlayers')).toContainText('Ben');
  await invite(host, b.page);
  await expect(host.locator('#roomPlayers')).toContainText('Cleo');
  await host.click('#btnAddBot');
  await expect(host.locator('#roomPlayers li')).toHaveCount(4);
  // Guests see the round
  await expect(a.page.locator('#waitPlayers li')).toHaveCount(4);
  await expect(a.page.locator('#waitPlayers')).toContainText('Ada');
  await expect(a.page.locator('#waitPlayers')).toContainText('Cleo');
  await expect(a.page.locator('#waitGame')).toHaveText('Spiel: Durak');

  await host.click('#btnStart');
  for (const p of [host, a.page, b.page]) {
    await expect(p.locator('#scrPlay')).toBeVisible();
    await expect(p.locator('#seats .seat')).toHaveCount(3);
    await expect(p.locator('#hand .card-face')).toHaveCount(6);
  }
  // Seats are shown from each player's place on: Ben sees Cleo, Computer 1, Ada
  await expect(a.page.locator('#seats .sname')).toHaveText(['Cleo', 'Computer 1', 'Ada']);
  // The guests' views hold only their own cards: hands of 6 and no card of another player
  const hands = await Promise.all([host, a.page, b.page].map(p => p.locator('#hand .card-face').evaluateAll(els => els.map(e => e.dataset.card))));
  expect(new Set(hands.flat()).size).toBe(18);

  await playToEnd([host, a.page, b.page], 1500);
  for (const p of [host, a.page, b.page]) await expect(p.locator('#over')).toBeVisible();
  const texts = await Promise.all([host, a.page, b.page].map(p => p.locator('#overText').textContent()));
  // Everyone agrees on the result (one Durak at most)
  expect(texts.filter(s => /Du bist der Durak/.test(s)).length).toBeLessThanOrEqual(1);
  await expect(a.page.locator('#btnAgain')).toBeHidden();
  await expect(a.page.locator('#overText')).toContainText('Warte auf den Gastgeber');

  // Back to the round: guests wait again; host starts Mau Mau
  await host.click('#btnToRoom');
  await expect(a.page.locator('#scrWait')).toBeVisible();
  await host.click('#roomPick [data-game="mau-mau"]');
  await expect(b.page.locator('#waitGame')).toHaveText('Spiel: Mau Mau');
  await host.click('#btnStart');
  await expect(b.page.locator('#hand .card-face')).toHaveCount(5);

  // A guest leaves during the game: the computer takes over, the game goes on
  await onDialog(b.page, d => d.accept());
  await b.page.click('#btnLeave');
  await expect(b.page.locator('#scrLobby')).toBeVisible();
  await expect(host.locator('#seats')).toContainText('Cleo (Computer)');
  await playToEnd([host, a.page], 800);
  await expect(host.locator('#over')).toBeVisible();

  // Host ends: the guest is told
  await onDialog(host, d => d.accept());
  await host.click('#btnEnd');
  await expect(a.page.locator('#lobbyStatus')).toHaveText('Der Gastgeber hat das Spiel beendet.');
  for (const x of [a, b]) { expect(x.problems).toEqual([]); await x.context.close(); }
});

test('wrong codes are refused; a guest cannot move out of turn', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(60000);
  await fast(host);
  const g = await phone(browser, baseURL);
  // Keeps the guest's data channel so the test can send a forged move past the UI
  await g.page.addInitScript(() => {
    const orig = RTCPeerConnection.prototype.createDataChannel;
    RTCPeerConnection.prototype.createDataChannel = function (...a) { const dc = orig.apply(this, a); window.__dc = dc; return dc; };
  });
  await host.goto(URL_);
  await g.page.goto(URL_);
  await openDetails(g.page, 'Spiel-Code von Hand eingeben');
  await g.page.fill('#offerIn', 'hallo');
  await g.page.click('#btnOfferIn');
  await expect(g.page.locator('#lobbyStatus')).toHaveText('Das ist kein gültiger Code.');
  await host.click('#btnHost');
  await invite(host, g.page);
  await host.click('#btnStart');
  await expect(g.page.locator('#scrPlay')).toBeVisible();
  // A forged move from the guest (not its turn or not a legal card) is ignored by the host
  const before = await host.locator('#seats .scount').first().textContent();
  const hostHand = await host.locator('#hand .card-face').evaluateAll(els => els.map(e => e.dataset.card));
  const top = await host.locator('.mm-table .pile .card-face').getAttribute('data-card');
  // Forged moves: a card of the host's hand, the top card, and drawing (only legal on the guest's turn)
  const guestTurn = await g.page.locator('#turn.mine').count() === 1;
  await g.page.evaluate(cards => {
    for (const c of cards) window.__dc.send(JSON.stringify({ t: 'move', m: { a: 'play', c } }));
  }, [hostHand[0], top]);
  if (!guestTurn) await g.page.evaluate(() => window.__dc.send(JSON.stringify({ t: 'move', m: { a: 'draw' } })));
  await host.waitForTimeout(400);
  expect(await host.locator('#seats .scount').first().textContent()).toBe(before);
  expect(await host.locator('#hand .card-face').count()).toBe(hostHand.length);
  expect(await host.locator('.mm-table .pile .card-face').getAttribute('data-card')).toBe(top);
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test.describe('WebMCP', () => {
  test('get_game and play_move in a game against the computer', async ({ page }) => {
    await page.addInitScript(() => {
      const tools = [];
      Object.defineProperty(Document.prototype, 'modelContext', { configurable: true, get: () => ({
        registerTool: (tool, opts) => { tools.push(tool); return Promise.resolve(); } }) });
      window.__call = (name, input) => tools.find(t => t.name === name).execute(input).then(r => ({ ok: true, r: JSON.parse(JSON.stringify(r)) }), e => ({ ok: false, e: e.message }));
    });
    await fast(page, { 'card-games.settings.v1': JSON.stringify({ speed: 'slow' }) });
    await page.goto(URL_);
    let r = await page.evaluate(() => window.__call('card_games_get_game', {}));
    expect(r.r).toEqual({ phase: 'lobby', game: 'mau-mau' });
    r = await page.evaluate(() => window.__call('card_games_play_move', { index: 0 }));
    expect(r).toEqual({ ok: false, e: 'No game is running.' });
    await page.click('#btnCpu');
    // Wait until it is this player's turn
    await expect(page.locator('#turn.mine')).toBeVisible({ timeout: 15000 });
    r = await page.evaluate(() => window.__call('card_games_get_game', {}));
    const gm = r.r;
    expect(gm).toMatchObject({ phase: 'playing', game: 'mau-mau', mode: 'local', your_seat: 0, your_turn: true });
    // 5 dealt – plus 2 to draw if the computer started with a 7
    const pen = gm.table.cards_to_draw;
    expect(gm.your_cards).toHaveLength(5);
    expect([0, 2]).toContain(pen);
    expect(gm.your_cards[0].name).toMatch(/ of (Clubs|Spades|Hearts|Diamonds)$/);
    expect(gm.players).toHaveLength(2);
    expect(gm.players[1]).toMatchObject({ seat: 1, computer: true, name: 'Computer 1' });
    await expect(page.locator('#seats .scount')).toHaveText(String(gm.players[1].cards) + ' Karten');
    expect(gm.table.top_card).toMatch(/ of /);
    const drawText = pen ? `draw ${pen} cards` : 'draw a card';
    expect(gm.legal_moves.at(-1)).toEqual({ index: gm.legal_moves.length - 1, move: drawText });
    // Every other move plays a card of this hand
    const names = gm.your_cards.map(c => c.name);
    for (const m of gm.legal_moves.slice(0, -1)) expect(names).toContain(m.move.replace(/^play /, '').replace(/ and wish \w+$/, ''));
    r = await page.evaluate(i => window.__call('card_games_play_move', { index: i }), gm.legal_moves.length - 1);
    expect(r.ok).toBe(true);
    expect(r.r.done).toBe(drawText);
    expect(r.r.game.your_cards).toHaveLength(5 + (pen || 1));
    await expect(page.locator('#hand .card-face')).toHaveCount(5 + (pen || 1));
    r = await page.evaluate(() => window.__call('card_games_play_move', { index: 99 }));
    expect(r).toEqual({ ok: false, e: 'No legal move with this index – read the game again.' });
  });
});

test('WebMCP: Solitaire and Poker through get_game and play_move', async ({ page }) => {
  await page.addInitScript(() => {
    const tools = [];
    Object.defineProperty(Document.prototype, 'modelContext', { configurable: true, get: () => ({
      registerTool: tool => { tools.push(tool); return Promise.resolve(); } }) });
    window.__call = (name, input) => tools.find(t => t.name === name).execute(input).then(r => ({ ok: true, r: JSON.parse(JSON.stringify(r)) }), e => ({ ok: false, e: e.message }));
  });
  await fast(page, { 'card-games.settings.v1': JSON.stringify({ speed: 'slow', game: 'solitaire' }) });
  await page.goto(URL_);
  await page.click('#btnCpu');
  let r = await page.evaluate(() => window.__call('card_games_get_game', {}));
  expect(r.r).toMatchObject({ phase: 'playing', game: 'solitaire', your_turn: true, your_cards: [] });
  expect(r.r.table.columns.map(c => c.face_down)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  expect(r.r.table.stock).toBe(24);
  const draw = r.r.legal_moves.find(m => m.move.startsWith('turn the next stock card'));
  r = await page.evaluate(i => window.__call('card_games_play_move', { index: i }), draw.index);
  expect(r.r.game.table.stock).toBe(23);
  expect(r.r.game.table.waste_top).toMatch(/ of /);
  await expect(page.locator('.so-waste .card-face')).toHaveCount(1);

  await onDialog(page, d => d.accept());
  await page.click('#btnLeave');
  await expect(page.locator('#scrLobby')).toBeVisible();
  await page.click('#gamePick [data-game="poker"]');
  await page.click('#btnCpu');
  await expect(page.locator('#turn.mine')).toBeVisible({ timeout: 15000 });
  r = await page.evaluate(() => window.__call('card_games_get_game', {}));
  expect(r.r).toMatchObject({ game: 'poker', your_turn: true });
  expect(r.r.your_cards).toHaveLength(2);
  expect(r.r.table.pot).toBeGreaterThanOrEqual(30);
  expect(r.r.table.seats.map(x => x.chips + x.bet).reduce((a, b) => a + b, 0)).toBe(2000);
  const fold = r.r.legal_moves.find(m => m.move === 'fold' || m.move === 'check');
  r = await page.evaluate(i => window.__call('card_games_play_move', { index: i }), fold.index);
  expect(r.ok).toBe(true);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('lobby, game and card names in English', async ({ page }) => {
    await fast(page);
    await page.goto(URL_);
    await expect(page.locator('#btnCpu')).toHaveText('Against the computer');
    await page.click('#gamePick [data-game="durak"]');
    await expect(page.locator('#gameDesc')).toContainText('Durak (fool)');
    await page.click('#btnCpu');
    await expect(page.locator('#scrPlay')).toBeVisible();
    await expect(page.locator('.dk-table')).toContainText('Trump: ');
    const label = await page.locator('#hand .card-face').first().getAttribute('aria-label');
    expect(label).toMatch(/^(6|7|8|9|10|Jack|Queen|King|Ace) of (Clubs|Spades|Hearts|Diamonds)$/);
  });
  test('new games in English', async ({ page }) => {
    await fast(page);
    await page.goto(URL_);
    await expect(page.locator('#gamePick .btn')).toHaveText(['Mau Mau', 'Durak', 'Skat', 'Rummy', 'Poker', 'Solitaire']);
    await page.click('#gamePick [data-game="skat"]');
    await page.click('#btnCpu');
    await expect(page.locator('.sk-table')).toContainText('No bid yet');
    await expect(page.locator('#seats .sbadge')).toHaveCount(2);
    await onDialog(page, d => d.accept());
    await page.click('#btnLeave');
    await page.click('#gamePick [data-game="solitaire"]');
    await expect(page.locator('#btnCpu')).toHaveText('Play');
    await page.click('#btnCpu');
    await expect(page.locator('#turn')).toHaveText('Tap a card to move it.');
    await expect(page.locator('#actions [data-move="draw"]')).toHaveText('Turn a card');
  });
});
