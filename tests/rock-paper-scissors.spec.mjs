// Schere, Stein, Papier: rules of all three variants, computer independent of the player's choice,
// "smart" computer learns from history, score and persistence.
import { test, expect, axe, switchLang, clipboardText, privateClipboard, openDetails } from './helpers.mjs';

// Rules written down independently of the page: winner → losers
const BEATS = {
  3: { schere: ['papier'], stein: ['schere'], papier: ['stein'] },
  4: { schere: ['papier'], stein: ['schere'], papier: ['stein', 'brunnen'], brunnen: ['schere', 'stein'] },
  5: {
    schere: ['papier', 'echse'], papier: ['stein', 'spock'], stein: ['echse', 'schere'],
    echse: ['spock', 'papier'], spock: ['schere', 'stein'],
  },
};
const expected = (v, p, c) => (p === c ? 'draw' : BEATS[v][p].includes(c) ? 'win' : 'lose');

async function play(page, move) {
  await page.click(`#choices [data-move="${move}"]`);
  return {
    p: await page.locator('#you').getAttribute('data-move'),
    c: await page.locator('#cpu').getAttribute('data-move'),
    o: await page.locator('#result').getAttribute('data-outcome'),
  };
}

test('every variant: each pair of moves loses against the other', () => {
  for (const [v, beats] of Object.entries(BEATS)) {
    const moves = Object.keys(beats);
    for (const a of moves) for (const b of moves) {
      if (a === b) continue;
      expect(beats[a].includes(b) !== beats[b].includes(a), `${v}: ${a}/${b}`).toBe(true);
    }
  }
});

for (const v of ['3', '4', '5']) {
  test(`variant ${v}: outcomes follow the rules`, async ({ page }) => {
    await page.goto('/rock-paper-scissors/');
    await page.click(`#variants [data-v="${v}"]`);
    await page.click('#modes [data-m="random"]');
    const moves = Object.keys(BEATS[v]);
    await expect(page.locator('#choices .choice')).toHaveCount(moves.length);
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const r = await play(page, moves[i % moves.length]);
      expect(moves).toContain(r.c);
      expect(r.o, `${r.p} vs ${r.c}`).toBe(expected(v, r.p, r.c));
      seen.add(r.c);
    }
    expect(seen.size).toBe(moves.length);
    // Score adds up
    const n = async id => Number(await page.locator(id).textContent());
    expect((await n('#sWin')) + (await n('#sDraw')) + (await n('#sLose'))).toBe(60);
  });

  test(`variant ${v}: help shows a diagram with one arrow per rule`, async ({ page }) => {
    await page.goto('/rock-paper-scissors/');
    const rules = Object.values(BEATS[v]).flat().length;
    const box = page.locator(`#ruleDiagrams [data-variant="${v}"]`);
    await expect(box.locator('svg line.arrow')).toHaveCount(rules);
    await expect(box.locator('li')).toHaveCount(rules);
  });
}

test('computer has chosen before the player – its move does not depend on the choice', async ({ page }) => {
  for (const seed of [1, 7, 42, 99]) {
    // Same history and same random numbers on every load
    await page.addInitScript(([s]) => {
      if (sessionStorage.getItem('seed') !== String(s)) return;
      let x = s;
      Math.random = () => ((x = (x * 16807) % 2147483647) / 2147483647);
      localStorage.setItem('rock-paper-scissors.state.v1', JSON.stringify({
        variant: '5', mode: 'smart',
        v: { 5: { rounds: [['stein', 'papier', 'lose'], ['echse', 'stein', 'lose'], ['stein', 'spock', 'lose']], win: 0, lose: 3, draw: 0 } },
      }));
    }, [seed]);
    const results = [];
    for (const move of ['schere', 'stein', 'papier', 'echse', 'spock']) {
      await page.goto('/rock-paper-scissors/');
      await page.evaluate(s => sessionStorage.setItem('seed', String(s)), seed);
      await page.reload();
      results.push((await play(page, move)).c);
    }
    expect(new Set(results).size, `seed ${seed}: ${results}`).toBe(1);
  }
});

test('smart computer learns when the player always picks the same', async ({ page }) => {
  await page.goto('/rock-paper-scissors/');
  await page.click('#modes [data-m="smart"]');
  const late = [];
  for (let i = 0; i < 40; i++) {
    const r = await play(page, 'stein');
    if (i >= 20) late.push(r.c);
  }
  // Only Papier beats Stein; pure chance would give about 7 of 20
  expect(late.filter(c => c === 'papier').length).toBeGreaterThanOrEqual(12);
});

test('score is kept per variant, survives reload and can be reset', async ({ page }) => {
  await page.goto('/rock-paper-scissors/');
  await page.click('#variants [data-v="4"]');
  for (let i = 0; i < 3; i++) await play(page, 'brunnen');
  await expect(page.locator('#last li')).toHaveCount(3);
  await page.reload();
  await expect(page.locator('#variants [data-v="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#last li')).toHaveCount(3);
  await page.click('#variants [data-v="3"]');
  await expect(page.locator('#last li')).toHaveCount(0);
  await page.click('#variants [data-v="4"]');
  page.once('dialog', d => d.accept());
  await page.click('#btnReset');
  await expect(page.locator('#last li')).toHaveCount(0);
  await expect(page.locator('#sWin')).toHaveText('0');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('signs, result and rules in English; switching keeps the last round', async ({ page }) => {
    await page.goto('/rock-paper-scissors/');
    await expect(page.locator('#choices .choice')).toHaveText(['✂️Scissors', '🪨Rock', '📄Paper']);
    await expect(page.locator('#status')).toHaveText('🤫 The computer has already chosen – your turn!');
    await page.locator('#choices [data-move="stein"]').click();
    const cpu = await page.locator('#cpu').getAttribute('data-move');
    // Independent rules: rock beats scissors, loses to paper
    const big = cpu === 'stein' ? 'Draw!' : cpu === 'schere' ? 'You win! 🎉' : 'The computer wins!';
    const why = cpu === 'stein' ? 'You both chose Rock.' : cpu === 'schere' ? 'Rock crushes scissors.' : 'Paper covers rock.';
    await expect(page.locator('#result .big')).toHaveText(big);
    await expect(page.locator('#result .why')).toHaveText(why);
    await expect(page.locator('#ruleDiagrams [data-variant="3"] li').first()).toContainText('Scissors beats');
    await switchLang(page, 'de');
    await expect(page.locator('#result .why')).toHaveText(
      cpu === 'stein' ? 'Ihr habt beide Stein.' : cpu === 'schere' ? 'Stein macht Schere stumpf.' : 'Papier wickelt Stein ein.');
    await expect(page.locator('#choices .choice').first()).toHaveText('✂️Schere');
  });
});

/* ================= Two players on two devices (WebRTC) =================
   Every test uses two browser contexts – like two phones. */
const URL_ = '/rock-paper-scissors/';

/** Records the messages a page sends over the data channel; optionally rewrites them (cheating) */
const recordChannel = page => page.addInitScript(() => {
  window.__sent = [];
  const send = RTCDataChannel.prototype.send;
  RTCDataChannel.prototype.send = function (data) {
    let msg = JSON.parse(data);
    if (window.__tamper) msg = window.__tamper(msg);
    window.__sent.push(msg);
    return send.call(this, JSON.stringify(msg));
  };
});
/** A second phone: own context and clipboard, fails on JS errors or external requests */
async function secondPhone(browser, baseURL, options = {}) {
  const context = await browser.newContext({ baseURL, locale: 'de-DE', serviceWorkers: 'allow', ...options });
  const page = await context.newPage();
  await privateClipboard(page);
  await recordChannel(page);
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(baseURL) && !/^(data|blob):/.test(u)) problems.push(`external request: ${u}`); });
  return { context, page, problems };
}
async function hostLink(host) {
  await host.click('#opp [data-o="online"]');
  await host.click('#btnHost');
  await expect(host.locator('#qrOffer')).toHaveAttribute('data-text', /#join=O1~/);
  await host.click('#btnCopyOffer');
  return clipboardText(host);
}
/** Guest enters the game code by hand (or opens the link like the camera app would) */
async function guestReply(guest, link, viaLink) {
  if (viaLink) await guest.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  else {
    await guest.click('#opp [data-o="online"]');
    await openDetails(guest, 'Spiel-Code von Hand eingeben');
    await guest.fill('#offerIn', link);
    await guest.click('#btnOfferIn');
  }
  await expect(guest.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  await guest.click('#btnCopyAnswer');
  return clipboardText(guest);
}
async function connect(host, guest, viaLink = false) {
  const reply = await guestReply(guest, await hostLink(host), viaLink);
  await openDetails(host, 'Antwort-Code von Hand eingeben');
  await host.fill('#answerIn', reply);
  await host.click('#btnAnswerIn');
  for (const p of [host, guest]) {
    await expect(p.locator('#connOn')).toBeVisible({ timeout: 15000 });
    await expect(p.locator('#gameCard')).toBeVisible();
  }
}
const hand = (page, id) => page.locator(`#${id}`).getAttribute('data-move');

test('two devices: connect, both choose, results match the rules on both sides', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(90000);
  await recordChannel(host);
  const g = await secondPhone(browser, baseURL);
  const guest = g.page;
  await host.goto(URL_);
  await guest.goto(URL_);

  // Lobby: no game yet, computer settings hidden; accessible
  await host.click('#opp [data-o="online"]');
  await expect(host.locator('#connLobby')).toBeVisible();
  await expect(host.locator('#gameCard')).toBeHidden();
  await expect(host.locator('#cpuCard')).toBeHidden();
  const { violations } = await axe(host).analyze();
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);

  await connect(host, guest, true);
  await expect(host.locator('#whoOpp')).toHaveText('Gegner');
  await expect(host.locator('#status')).toContainText('Wähle dein Zeichen');

  const plays = [['stein', 'schere'], ['papier', 'papier'], ['schere', 'stein'], ['stein', 'papier']];
  const tally = { win: 0, lose: 0, draw: 0 };
  for (const [i, [hm, gm]] of plays.entries()) {
    // Guest chooses first: the host learns only THAT the guest has chosen
    await guest.click(`#choices [data-move="${gm}"]`);
    await expect(guest.locator('#status')).toContainText('Warte auf den anderen');
    await expect(guest.locator(`#choices [data-move="${gm}"]`)).toHaveAttribute('aria-pressed', 'true');
    await expect(host.locator('#status')).toContainText('Der andere hat schon gewählt');
    // The host still shows the previous round (or nothing) – not the new move
    expect(await hand(host, 'cpu')).toBe(i ? plays[i - 1][1] : '');
    // What went over the wire so far: only a commitment, never the move
    const commits = await guest.evaluate(r => window.__sent.filter(m => m.t === 'commit' && m.r === r), i);
    expect(commits).toHaveLength(1);
    expect(Object.keys(commits[0]).sort()).toEqual(['h', 'r', 't']);
    expect(await guest.evaluate(r => window.__sent.some(m => m.t === 'reveal' && m.r === r), i)).toBe(false);

    await host.click(`#choices [data-move="${hm}"]`);
    const o = expected('3', hm, gm);
    const mirror = { win: 'lose', lose: 'win', draw: 'draw' }[o];
    await expect(host.locator('#result')).toHaveAttribute('data-outcome', o);
    await expect(guest.locator('#result')).toHaveAttribute('data-outcome', mirror);
    expect([await hand(host, 'you'), await hand(host, 'cpu')]).toEqual([hm, gm]);
    expect([await hand(guest, 'you'), await hand(guest, 'cpu')]).toEqual([gm, hm]);
    tally[o]++;
  }
  // stein–schere win, papier–papier draw, schere–stein lose, stein–papier lose
  expect(tally).toEqual({ win: 1, draw: 1, lose: 2 });
  await expect(host.locator('#result .big')).toHaveText('Der andere gewinnt!');
  for (const [p, w, l] of [[host, '1', '2'], [guest, '2', '1']]) {
    await expect(p.locator('#sWin')).toHaveText(w);
    await expect(p.locator('#sLose')).toHaveText(l);
    await expect(p.locator('#sDraw')).toHaveText('1');
    await expect(p.locator('#last li')).toHaveCount(4);
  }
  // The two-player score is not mixed into the saved computer score
  const saved = await host.evaluate(() => JSON.parse(localStorage.getItem('rock-paper-scissors.state.v1')));
  expect(saved.opp).toBe('online');
  expect(saved.v['3']?.rounds ?? []).toEqual([]);

  // Guest asks for another variant: both switch, with a fresh score
  await guest.click('#variants [data-v="5"]');
  for (const p of [host, guest]) {
    await expect(p.locator('#variants [data-v="5"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(p.locator('#choices .choice')).toHaveCount(5);
    await expect(p.locator('#last li')).toHaveCount(0);
  }
  await host.click('#choices [data-move="spock"]');
  await guest.click('#choices [data-move="echse"]');
  await expect(host.locator('#result')).toHaveAttribute('data-outcome', 'lose');
  await expect(guest.locator('#result .why')).toHaveText('Echse beißt Spock.');

  // Guest disconnects: host is told and back in the lobby
  guest.once('dialog', d => d.accept());
  await guest.click('#btnLeave');
  await expect(guest.locator('#connLobby')).toBeVisible();
  await expect(host.locator('#connLobby')).toBeVisible({ timeout: 10000 });
  await expect(host.locator('#lobbyStatus')).toHaveText('Der andere hat die Verbindung getrennt.');
  await expect(host.locator('#gameCard')).toBeHidden();

  // Back to the computer: its saved score is still there and the page works as before
  await host.click('#opp [data-o="cpu"]');
  await expect(host.locator('#gameCard')).toBeVisible();
  await expect(host.locator('#whoOpp')).toHaveText('Computer');
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test('two devices: a reveal that does not match the commitment is rejected', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(60000);
  await recordChannel(host);
  const g = await secondPhone(browser, baseURL);
  const guest = g.page;
  await host.goto(URL_);
  await guest.goto(URL_);
  await connect(host, guest);
  // The guest commits to "stein" but reveals "papier" once it has seen the host's commitment
  await guest.evaluate(() => { window.__tamper = m => (m.t === 'reveal' ? { ...m, m: 'papier' } : m); });
  await guest.click('#choices [data-move="stein"]');
  await host.click('#choices [data-move="stein"]');
  await expect(host.locator('.toast')).toContainText('passt nicht zu seiner Wahl');
  await expect(host.locator('#sWin')).toHaveText('0');
  await expect(host.locator('#sLose')).toHaveText('0');
  await expect(host.locator('#last li')).toHaveCount(0);
  // The host can choose again (new round)
  await expect(host.locator('#choices [data-move="stein"]')).toBeEnabled();
  await g.context.close();
});

test('two devices: wrong codes are explained, cancel returns to the lobby', async ({ page }) => {
  await page.goto(URL_);
  await page.click('#opp [data-o="online"]');
  await openDetails(page, 'Spiel-Code von Hand eingeben');
  await page.fill('#offerIn', 'hallo');
  await page.click('#btnOfferIn');
  await expect(page.locator('#lobbyStatus')).toHaveText('Das ist kein gültiger Code.');
  await page.click('#btnHost');
  await expect(page.locator('#qrOffer')).toHaveAttribute('data-text', /#join=O1~/);
  const link = await page.locator('#qrOffer').getAttribute('data-text');
  await openDetails(page, 'Antwort-Code von Hand eingeben');
  await page.fill('#answerIn', link);
  await page.click('#btnAnswerIn');
  await expect(page.locator('#hostStatus')).toHaveText(/Spiel-Code – hier wird der Antwort-Code gebraucht/);
  await page.click('#btnHostCancel');
  await expect(page.locator('#connLobby')).toBeVisible();
  // The choice of opponent is remembered
  await page.reload();
  await expect(page.locator('#opp [data-o="online"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#connLobby')).toBeVisible();
});

test('two devices: an AI agent plays a round and waits for the other player', async ({ page: host, browser, baseURL }) => {
  test.setTimeout(60000);
  // Minimal stand-in for document.modelContext (see webmcp.spec.mjs)
  await host.addInitScript(() => {
    const tools = {};
    Object.defineProperty(Document.prototype, 'modelContext', { configurable: true,
      get: () => ({ registerTool: tool => { tools[tool.name] = tool; return Promise.resolve(); } }) });
    window.__call = (n, i) => Promise.resolve().then(() => tools[n].execute(i, { signal: new AbortController().signal }))
      .then(r => ({ ok: true, r }), e => ({ ok: false, e: e.message }));
  });
  const g = await secondPhone(browser, baseURL);
  const guest = g.page;
  await host.goto(URL_);
  await guest.goto(URL_);
  await host.click('#opp [data-o="online"]');
  expect((await host.evaluate(() => window.__call('rock_paper_scissors_play_round', { move: 'rock' }))).e).toMatch(/not connected/);
  await connect(host, guest);
  const pending = host.evaluate(() => window.__call('rock_paper_scissors_play_round', { move: 'paper' }));
  await expect(guest.locator('#status')).toContainText('Der andere hat schon gewählt');
  await guest.click('#choices [data-move="stein"]');
  const { ok, r } = await pending;
  expect(ok).toBe(true);
  expect(r).toMatchObject({ opponent: 'two_players', your_move: 'paper', opponent_move: 'rock', outcome: 'you_win',
    explanation: 'paper beats rock', score: { you: 1, draws: 0, opponent: 0 } });
  const score = await host.evaluate(() => window.__call('rock_paper_scissors_get_score', {}));
  expect(score.r).toMatchObject({ opponent: 'two_players', connected: true, score: { you: 1, draws: 0, opponent: 0 } });
  await g.context.close();
});
