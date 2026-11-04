// Card games (Mau Mau, Durak): rules checked on hand-made states, whole computer games simulated with
// invariants, a game against the computer through the UI, and several devices over real WebRTC
// (separate browser contexts – like separate phones).
import { test, expect, clipboardText, privateClipboard, openDetails } from './helpers.mjs';

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
      return { top: st.pile, size, left: st.draw.length, hand: st.hands[0].length };
    });
    expect(r.top.length).toBe(1);
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

test('computer games run to the end without losing or duplicating a card', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(URL_);
  const res = await rules(page, C => {
    const out = [];
    for (const id of ['mau-mau', 'durak']) {
      const g = C.games[id];
      for (let k = 0; k < 120; k++) {
        const n = g.players.min + (k % (g.players.max - g.players.min + 1));
        const st = g.setup(n, 1000 + k);
        let steps = 0, bad = null;
        while (!g.result(st) && steps < 3000) {
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
          // Every card exactly once
          const cards = id === 'mau-mau' ? [...st.hands.flat(), ...st.draw, ...st.pile]
            : [...st.hands.flat(), ...st.deck, ...st.table.flatMap(p => p.d ? [p.a, p.d] : [p.a])];
          const total = cards.length + (id === 'durak' ? st.discard : 0);
          if (total !== (id === 'mau-mau' ? 32 : 36) || new Set(cards).size !== cards.length) { bad = 'cards lost or doubled'; break; }
        }
        out.push({ id, n, steps, bad, result: g.result(st), hands: st.hands.map(h => h.length) });
      }
    }
    return out;
  });
  for (const g of res) {
    expect(g.bad, `${g.id} ${g.n} players`).toBeNull();
    expect(g.result, `${g.id} ended`).not.toBeNull();
    if (g.id === 'mau-mau') expect(g.hands[g.result.winner]).toBe(0);
    else {
      // Durak: everyone but the loser is out without cards; the loser holds cards
      g.hands.forEach((h, s) => { if (s !== g.result.loser) expect(h).toBe(0); });
      if (g.result.loser != null) expect(g.hands[g.result.loser]).toBeGreaterThan(0);
      expect(new Set(g.result.out).size).toBe(g.result.out.length);
    }
  }
  // Both outcomes of Durak occur and Mau Mau is won by different seats
  expect(new Set(res.filter(g => g.id === 'mau-mau').map(g => g.result.winner)).size).toBeGreaterThan(1);
});

/** Plays one own move through the UI: first playable card (first option of the chooser) or an action */
async function playOnce(page) {
  return page.evaluate(() => {
    const card = document.querySelector('#hand .card-face.can');
    const act = [...document.querySelectorAll('#actions .btn')];
    // Prefer cards; Durak "done"/"take" and Mau Mau "draw"/"pass" otherwise
    if (card) { card.click(); const opt = document.querySelector('#chooser:not([hidden]) .btn.primary'); if (opt) opt.click(); return 'card'; }
    const pref = act.find(b => b.dataset.move === 'done' || b.dataset.move === 'pass') || act[0];
    if (pref) { pref.click(); return pref.dataset.move; }
    return null;
  });
}
async function playToEnd(pages, limit = 600) {
  for (let k = 0; k < limit; k++) {
    let acted = false;
    for (const p of pages) {
      if (await p.locator('#over').isVisible()) return k;
      if (await p.locator('#turn.mine').count()) { if (await playOnce(p)) acted = true; }
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
  b.page.on('dialog', d => d.accept());
  await b.page.click('#btnLeave');
  await expect(b.page.locator('#scrLobby')).toBeVisible();
  await expect(host.locator('#seats')).toContainText('Cleo (Computer)');
  await playToEnd([host, a.page], 800);
  await expect(host.locator('#over')).toBeVisible();

  // Host ends: the guest is told
  host.on('dialog', d => d.accept());
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
});
