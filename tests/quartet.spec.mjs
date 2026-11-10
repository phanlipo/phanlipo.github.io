// Quartett (Supertrumpf rules): rules on hand-made states, deck data, whole computer games simulated with
// invariants, a game against the computer through the UI, and two devices over real WebRTC
// (separate browser contexts – like separate phones).
import { test, expect, clipboardText, privateClipboard, openDetails, openMenu } from './helpers.mjs';

const URL_ = '/quartet/';
const SET = 'quartet.settings.v1';

async function settings(page, s) {
  await page.addInitScript(([k, v]) => { if (!localStorage.getItem(k)) localStorage.setItem(k, v); }, [SET, JSON.stringify(s)]);
}
/** Rules in the page: run fn(Quartet) there */
const rules = (page, fn, arg) => page.evaluate(([src, a]) => new Function('Q', 'arg', `return (${src})(Q, arg);`)(window.Quartet, a), [fn.toString(), arg]);

test.describe('rules', () => {
  test.beforeEach(async ({ page }) => { await page.goto(URL_); });

  test('decks: numeric values for every category, unique card numbers, enough cards for 6 players', async ({ page }) => {
    const decks = await page.evaluate(() => window.QuartetDecks);
    expect(decks.length).toBe(20);
    expect(new Set(decks.map(d => d.id)).size).toBe(20);
    for (const d of decks) {
      expect(d.cats.length, d.id).toBeGreaterThanOrEqual(3);
      expect(d.cards.length, d.id).toBeGreaterThanOrEqual(12);
      expect(new Set(d.cards.map(c => c.id)).size, d.id).toBe(d.cards.length);
      for (const c of d.cards) {
        expect(c.v.length, `${d.id} ${c.n}`).toBe(d.cats.length);
        for (const v of c.v) expect(Number.isFinite(v), `${d.id} ${c.n}`).toBe(true);
        expect(Object.keys(d.groups)).toContain(c.g);
      }
      for (const cat of d.cats) expect(cat.en, d.id).toMatch(/^[A-Z]/);
    }
    // German thousands separators of the source are read as such ("357.588" km² for Germany)
    const de = decks.find(d => d.id === 'countries_continents').cards.find(c => c.n === 'Deutschland');
    expect(de.v[0]).toBe(357588);
  });

  test('deal: all cards once, evenly, seeded', async ({ page }) => {
    const r = await rules(page, Q => {
      const a = Q.setup('tiere', 3, 42), b = Q.setup('tiere', 3, 42);
      return { piles: a.piles, same: JSON.stringify(a) === JSON.stringify(b), turn: a.turn, n: Q.deck('tiere').cards.length };
    });
    expect(r.same).toBe(true);
    const all = r.piles.flat().sort((x, y) => x - y);
    expect(all).toEqual([...Array(r.n).keys()]);
    expect(r.piles.map(p => p.length)).toEqual([27, 27, 26]);
    expect([0, 1, 2]).toContain(r.turn);
  });

  test('higher wins and takes all cards; lower wins where marked; only the chooser picks', async ({ page }) => {
    const r = await rules(page, Q => {
      const d = Q.deck('dinosaurs');
      const T = d.cards.findIndex(c => c.n === 'Tyrannosaurus Rex'), V = d.cards.findIndex(c => c.n === 'Velociraptor');
      const st = Q.setup('dinosaurs', 2, 1);
      st.piles = [[V, 5], [T, 6]]; st.turn = 0;
      const notYours = Q.moves(st, 1).length;
      const size = d.cats.findIndex(c => c.n === 'Größe');
      Q.apply(st, 0, { a: 'pick', k: size });
      const after = { piles: st.piles.map(p => p.slice()), turn: st.turn, last: st.last, phase: st.phase, next0: Q.moves(st, 0), next1: Q.moves(st, 1) };
      // Unicorns: acceleration in seconds – the smaller value wins
      const u = Q.deck('einhoerner'), k = u.cats.findIndex(c => c.low);
      const fast = u.cards.reduce((b, c, i) => (c.v[k] < u.cards[b].v[k] ? i : b), 0);
      const slow = u.cards.reduce((b, c, i) => (c.v[k] > u.cards[b].v[k] ? i : b), 0);
      const su = Q.setup('einhoerner', 2, 1);
      su.piles = [[slow, 1], [fast, 2]]; su.turn = 0;
      Q.apply(su, 0, { a: 'pick', k });
      return { T, V, notYours, after, lowWinner: su.last.win, low: u.cats[k].n, legalWrong: Q.legal(su, 1, { a: 'pick', k: 0 }), legalExtra: Q.legal(su, 0, { a: 'next', x: 1 }) };
    });
    expect(r.notYours).toBe(0);
    expect(r.after.last.win).toBe(1);
    expect(r.after.piles).toEqual([[5], [6, r.T, r.V]]);   // winner: own card first, then the others, under the pile
    expect(r.after.turn).toBe(1);
    expect(r.after.phase).toBe('shown');
    expect(r.after.next0).toEqual([{ a: 'next' }]);
    expect(r.after.next1).toEqual([{ a: 'next' }]);
    expect(r.low).toBe('Beschleunigung');
    expect(r.lowWinner).toBe(1);
    expect(r.legalWrong).toBe(false);
    expect(r.legalExtra).toBe(false);
  });

  test('tie: cards go to the pot, the same player chooses again, the next winner takes the pot', async ({ page }) => {
    const r = await rules(page, Q => {
      const d = Q.deck('prinzessinnen');
      // Two cards with the same value in some category, and one that beats both in another
      let a = -1, b = -1, k = -1;
      for (let i = 0; i < d.cards.length && a < 0; i++) for (let j = i + 1; j < d.cards.length && a < 0; j++)
        for (let x = 0; x < d.cats.length; x++) if (d.cards[i].v[x] === d.cards[j].v[x]) { a = i; b = j; k = x; break; }
      const rest = d.cards.map((_, i) => i).filter(i => i !== a && i !== b);
      const st = Q.setup('prinzessinnen', 3, 7);
      st.piles = [[a, rest[0]], [b, rest[1]], [rest[2], rest[3]]]; st.turn = 0;
      // seat 2 must lose the first comparison: give it the weakest card in category k
      const weakest = rest.slice(2).reduce((w, i) => (d.cards[i].v[k] < d.cards[w].v[k] ? i : w), rest[2]);
      if (d.cards[weakest].v[k] >= d.cards[a].v[k]) return { skip: true };
      st.piles[2] = [weakest, rest.find(i => i !== weakest && i !== rest[0] && i !== rest[1])];
      Q.apply(st, 0, { a: 'pick', k });
      const tie = { pot: st.pot.slice(), turn: st.turn, win: st.last.win, tied: st.last.tied, counts: st.piles.map(p => p.length), view: Q.view(st, 1).pot };
      Q.apply(st, 0, { a: 'next' });
      const k2 = 0;
      const tops = st.piles.map(p => p[0]);
      Q.apply(st, 0, { a: 'pick', k: k2 });
      const vals = tops.map(c => d.cards[c].v[k2]), max = Math.max(...vals);
      return { tie, a, b, weakest, potAfter: st.pot.length, last: st.last, maxCount: vals.filter(v => v === max).length,
        bestSeat: vals.indexOf(max), counts: st.piles.map(p => p.length) };
    });
    test.skip(!!r.skip, 'no fitting tie in this deck');
    expect(r.tie.win).toBe(-1);
    expect(r.tie.tied).toEqual([0, 1]);
    expect(r.tie.pot.sort()).toEqual([r.a, r.b, r.weakest].sort());
    expect(r.tie.turn).toBe(0);
    expect(r.tie.counts).toEqual([1, 1, 1]);
    expect(r.tie.view).toBe(3);
    if (r.maxCount === 1) {
      expect(r.last.win).toBe(r.bestSeat);
      expect(r.potAfter).toBe(0);
      expect(r.counts[r.bestSeat]).toBe(6);   // 3 from the pot + 3 of this round
    }
  });

  test('a seat sees only its own top card', async ({ page }) => {
    const r = await rules(page, Q => {
      const st = Q.setup('autos', 3, 9), v = Q.view(st, 1);
      return { v: JSON.stringify(v), own: st.piles[1][0], other: [st.piles[0][0], st.piles[2][0], st.piles[0][1]], top: v.top.i, names: Q.deck('autos').cards.map(c => c.n) };
    });
    expect(r.top).toBe(r.own);
    for (const c of r.other) expect(r.v).not.toContain(JSON.stringify(r.names[c]));
  });

  test('game length: after the last round the one with most cards wins', async ({ page }) => {
    const r = await rules(page, Q => {
      const st = Q.setup('tiere', 2, 3, 'short');
      while (!st.over) {
        if (st.phase === 'shown') Q.apply(st, 0, { a: 'next' });
        else Q.apply(st, st.turn, Q.bot(st, st.turn, 'hard'));
      }
      return { round: st.round, max: st.max, over: st.over, counts: st.piles.map(p => p.length) };
    });
    expect(r.max).toBe(25);
    if (r.over.why === 'rounds') {
      expect(r.round).toBe(25);
      const most = Math.max(...r.counts);
      expect(r.over.winners).toEqual(r.counts.map((c, s) => (c === most ? s : -1)).filter(s => s >= 0));
    } else expect(r.round).toBeLessThanOrEqual(25);
  });
});

test('computer games run to the end without losing or duplicating a card', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(URL_);
  const res = await rules(page, Q => {
    const out = [];
    const decks = Q.decks();
    for (let k = 0; k < 120; k++) {
      const d = decks[k % decks.length], n = 2 + (k % 5), len = ['short', 'normal', 'long'][k % 3];
      const st = Q.setup(d.id, n, 500 + k, len);
      let steps = 0, bad = null;
      while (!st.over && steps < 5000) {
        if (st.phase === 'shown') { if (!Q.legal(st, k % n, { a: 'next' })) { bad = 'next not allowed'; break; } Q.apply(st, k % n, { a: 'next' }); }
        else {
          if (!st.piles[st.turn].length) { bad = 'chooser without cards'; break; }
          const m = Q.bot(st, st.turn, ['easy', 'normal', 'hard'][k % 3]);
          if (!m || !Q.legal(st, st.turn, m)) { bad = 'bot made an illegal move'; break; }
          Q.apply(st, st.turn, m);
        }
        steps++;
        const cards = [...st.piles.flat(), ...st.pot];
        if (cards.length !== d.cards.length || new Set(cards).size !== cards.length) { bad = 'cards lost or doubled'; break; }
      }
      out.push({ id: d.id, n, len, bad, over: st.over, round: st.round, max: st.max, counts: st.piles.map(p => p.length), pot: st.pot.length, size: d.cards.length });
    }
    return out;
  });
  for (const g of res) {
    expect(g.bad, `${g.id} ${g.n} players`).toBeNull();
    expect(g.over, `${g.id} ended`).not.toBeNull();
    expect(g.round).toBeLessThanOrEqual(g.max);
    if (g.over.why === 'all') { expect(g.over.winners).toHaveLength(1); expect(g.counts[g.over.winners[0]] + g.pot).toBe(g.size); }
  }
  expect(res.some(g => g.over.why === 'all')).toBe(true);
  expect(res.some(g => g.over.why === 'rounds')).toBe(true);
});

/** Plays through the UI: picks the first category on own turn, taps "Weiter" after a comparison */
async function playToEnd(pages, limit = 2000) {
  for (let k = 0; k < limit; k++) {
    let acted = false;
    for (const p of pages) {
      if (await p.locator('#over').isVisible()) return k;
      acted = await p.evaluate(() => {
        const pick = document.querySelector('#table button.stat');
        if (pick) { pick.click(); return true; }
        const next = document.querySelector('#actions:not([hidden]) #btnNext');
        if (next) { next.click(); return true; }
        return false;
      }) || acted;
    }
    if (!acted) await pages[0].waitForTimeout(60);
  }
  throw new Error('game did not end');
}

test.describe('against the computer', () => {
  test.beforeEach(async ({ page }) => { await settings(page, { speed: 'fast', length: 'short' }); });

  test('a whole game through the UI, result counted', async ({ page }) => {
    test.setTimeout(90000);
    await page.goto(URL_);
    await page.selectOption('#deckSel', 'autos');
    await expect(page.locator('#deckInfo')).toHaveText('32 Karten · Baujahr, Leistung, Tempo, Länge, Gewicht');
    await page.selectOption('#cpuN', '2');
    await page.click('#btnCpu');
    await expect(page.locator('#scrPlay')).toBeVisible();
    await expect(page.locator('#seats .seat')).toHaveCount(3);
    await expect(page.locator('#seats .sname')).toHaveText(['Du', 'Computer 1', 'Computer 2']);
    // 32 cards for 3 players
    const counts = await page.locator('#seats .scount').evaluateAll(els => els.map(e => parseInt(e.textContent, 10)));
    expect(counts.sort()).toEqual([10, 11, 11]);
    await expect(page.locator('#turn')).toContainText('Runde 1 von 25');
    await playToEnd([page]);
    await expect(page.locator('#over')).toBeVisible();
    await expect(page.locator('#overText')).toHaveText(/gewonnen|Unentschieden/);
    await page.click('#btnEnd');
    await expect(page.locator('#scrLobby')).toBeVisible();
    await expect(page.locator('#stats')).toContainText('von 1 Spielen gewonnen');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('quartet.stats.v1')));
    expect(saved.played).toBe(1);
  });

  test('own card: categories as buttons on own turn, comparison shows every card and the winner', async ({ page }) => {
    await page.goto(URL_);
    await page.selectOption('#deckSel', 'dinosaurs');
    await page.selectOption('#cpuN', '1');
    await page.click('#btnCpu');
    // Wait for own turn (the computer may start)
    for (let i = 0; i < 50 && !(await page.locator('#table button.stat').count()); i++) {
      if (await page.locator('#btnNext').isVisible()) await page.click('#btnNext');
      await page.waitForTimeout(100);
    }
    await expect(page.locator('#turn.mine')).toHaveText(/^Du bist dran – wähle eine Kategorie!/);
    await expect(page.locator('#table button.stat')).toHaveCount(6);
    const name = await page.locator('#table .cname').textContent();
    const weight = await page.locator('#table button.stat').nth(1).locator('.sv').textContent();
    await expect(page.locator('#table button.stat').nth(1)).toHaveAccessibleName(`Gewicht: ${weight} wählen`);
    await page.locator('#table button.stat').nth(1).click();
    await expect(page.locator('.reveal .cat')).toContainText('Du wählst Gewicht');
    await expect(page.locator('.cmp li')).toHaveCount(2);
    await expect(page.locator('.cmp li').first()).toContainText(name);
    await expect(page.locator('.cmp li').first().locator('.val')).toHaveText(weight);
    // Winner independently: the larger weight (or a tie)
    const vals = await page.locator('.cmp .val').evaluateAll(els => els.map(e => parseFloat(e.textContent.replace(/\./g, '').replace(',', '.'))));
    const won = await page.locator('.cmp li.win').count(), tie = await page.locator('.cmp li.tie').count();
    if (vals[0] === vals[1]) expect(tie).toBe(2);
    else {
      expect(won).toBe(1);
      await expect(page.locator('.cmp li.win')).toHaveCount(1);
      expect(await page.locator('.cmp li').nth(vals[0] > vals[1] ? 0 : 1).getAttribute('class')).toContain('win');
    }
    await expect(page.locator('#btnNext')).toBeVisible();
  });

  test('settings are kept', async ({ page }) => {
    await page.goto(URL_);
    await openMenu(page);
    await page.fill('#optName', 'Kim');
    await page.locator('#optName').blur();
    await page.selectOption('#optLevel', 'hard');
    await page.selectOption('#optLength', 'long');
    await page.reload();
    await expect(page.locator('#optName')).toHaveValue('Kim');
    await expect(page.locator('#optLevel')).toHaveValue('hard');
    await expect(page.locator('#optLength')).toHaveValue('long');
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

test('two phones and a computer play; each sees only its own card; forged moves are ignored', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(150000);
  await settings(host, { speed: 'fast', name: 'Ada', length: 'short' });
  const g = await phone(browser, baseURL);
  await settings(g.page, { name: 'Ben' });
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
  await expect(host.locator('#btnStart')).toBeDisabled();
  await host.selectOption('#roomDeck', 'grossstaedte');
  await invite(host, g.page);
  await expect(host.locator('#roomPlayers')).toContainText('Ben');
  await host.click('#btnAddBot');
  await expect(g.page.locator('#waitPlayers li')).toHaveCount(3);
  await expect(g.page.locator('#waitPlayers')).toContainText('Ada');
  await expect(g.page.locator('#waitDeck')).toHaveText('Kartensatz: 🏙️ Deutsche Großstädte');

  await host.click('#btnStart');
  for (const p of [host, g.page]) {
    await expect(p.locator('#scrPlay')).toBeVisible();
    await expect(p.locator('#seats .seat')).toHaveCount(3);
  }
  await expect(g.page.locator('#seats .sname')).toHaveText(['Ada', 'Du', 'Computer 1']);
  // Each phone shows its own top card – different cards
  const hostCard = await host.locator('#table .cname').textContent();
  const guestCard = await g.page.locator('#table .cname').textContent();
  expect(hostCard).not.toBe(guestCard);

  // A forged move: pick on someone else's turn, or a category that does not exist
  const guestTurn = await g.page.locator('#turn.mine').count() === 1;
  const round = await host.locator('#turn').textContent();
  await g.page.evaluate(own => {
    window.__dc.send(JSON.stringify({ t: 'move', m: { a: 'pick', k: 99 } }));
    if (!own) window.__dc.send(JSON.stringify({ t: 'move', m: { a: 'pick', k: 0 } }));
  }, guestTurn);
  await host.waitForTimeout(400);
  if (!guestTurn && !(await host.locator('.reveal').count())) expect(await host.locator('#turn').textContent()).toBe(round);

  await playToEnd([host, g.page]);
  for (const p of [host, g.page]) await expect(p.locator('#over')).toBeVisible();
  await expect(g.page.locator('#btnAgain')).toBeHidden();
  await expect(g.page.locator('#overText')).toContainText('Warte auf den Gastgeber');

  // Host ends: the guest is told
  host.on('dialog', d => d.accept());
  await host.click('#btnEnd');
  await expect(g.page.locator('#lobbyStatus')).toHaveText('Der Gastgeber hat das Spiel beendet.');
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test.describe('WebMCP', () => {
  test('get_game and play_move in a game against the computer', async ({ page }) => {
    await page.addInitScript(() => {
      const tools = [];
      Object.defineProperty(Document.prototype, 'modelContext', { configurable: true, get: () => ({
        registerTool: tool => { tools.push(tool); return Promise.resolve(); } }) });
      window.__call = (name, input) => tools.find(t => t.name === name).execute(input).then(r => ({ ok: true, r: JSON.parse(JSON.stringify(r)) }), e => ({ ok: false, e: e.message }));
    });
    await settings(page, { speed: 'slow', deck: 'wolken' });
    await page.goto(URL_);
    let r = await page.evaluate(() => window.__call('quartet_get_game', {}));
    expect(r.r).toEqual({ phase: 'lobby', deck: 'wolken' });
    r = await page.evaluate(() => window.__call('quartet_play_move', { index: 0 }));
    expect(r).toEqual({ ok: false, e: 'No game is running.' });
    await page.click('#btnCpu');
    await expect(page.locator('#scrPlay')).toBeVisible();
    // Until it is this player's turn
    for (let i = 0; i < 60; i++) {
      r = await page.evaluate(() => window.__call('quartet_get_game', {}));
      if (r.r.your_turn) break;
      if (r.r.phase === 'comparison') await page.evaluate(() => window.__call('quartet_play_move', { index: 0 }));
      await page.waitForTimeout(250);
    }
    const gm = r.r;
    expect(gm).toMatchObject({ phase: 'choosing', deck: 'Clouds', mode: 'local', your_seat: 0, your_turn: true, max_rounds: 60 });
    expect(gm.categories.map(c => c.name)).toEqual(['Height', 'Temperature', 'Water content', 'Precipitation']);
    expect(gm.legal_moves).toEqual(gm.categories.map((c, i) => ({ index: i, move: `pick category ${c.name}` })));
    const name = await page.locator('#table .cname').textContent();
    expect(gm.your_card.name).toBe(name);
    expect(Object.keys(gm.your_card.values)).toEqual(['Height', 'Temperature', 'Water content', 'Precipitation']);
    r = await page.evaluate(() => window.__call('quartet_play_move', { index: 1 }));
    expect(r.ok).toBe(true);
    expect(r.r.done).toBe('picked Temperature');
    expect(r.r.game.phase).toMatch(/comparison|over/);
    expect(r.r.game.last_round.category).toBe('Temperature');
    expect(r.r.game.last_round.cards.find(c => c.seat === 0).card).toBe(name);
    await expect(page.locator('.reveal .cat')).toContainText('Temperatur');
    r = await page.evaluate(() => window.__call('quartet_play_move', { index: 9 }));
    expect(r.ok).toBe(false);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('lobby and card in English', async ({ page }) => {
    await settings(page, { speed: 'fast', deck: 'dinosaurs' });
    await page.goto(URL_);
    await expect(page.locator('#btnCpu')).toHaveText('Against the computer');
    await expect(page.locator('#deckSel option:checked')).toHaveText('🦖 Dinosaurs (12 cards)');
    await page.click('#btnCpu');
    await expect(page.locator('#table .qcard .sn').first()).toHaveText('Size');
    await expect(page.locator('#table .qcard .ctext')).toHaveCount(0);
  });
});
