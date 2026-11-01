// Sea battle: two devices connect over WebRTC by exchanging two codes (QR or copied), then play.
// Every test uses two separate browser contexts – like two phones.
import { test, expect, clipboardText, privateClipboard, openDetails } from './helpers.mjs';

const URL_ = '/sea-battle/';
const N = 10, COLS = 'ABCDEFGHIJ';
const cellName = i => COLS[i % N] + (Math.floor(i / N) + 1);

/** A second "phone": own context, own clipboard, fails the test on JS errors or external requests */
async function secondPhone(browser, baseURL, testInfo, options = {}) {
  const context = await browser.newContext({ baseURL, locale: 'de-DE', serviceWorkers: 'allow', ...options });
  const page = await context.newPage();
  await privateClipboard(page);
  const problems = [];
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(baseURL) && !/^(data|blob):/.test(u)) problems.push(`external request: ${u}`); });
  return { context, page, problems };
}

/** Host shows the game code; returns the copied link */
async function hostCode(host) {
  await host.click('#btnHost');
  await expect(host.locator('#qrOffer')).toHaveAttribute('data-text', /#join=O1~/);
  await host.click('#btnCopyOffer');
  return clipboardText(host);
}
/** Guest enters the game code by hand; returns the reply code */
async function guestReply(guest, link) {
  await openDetails(guest, 'Spiel-Code von Hand eingeben');
  await guest.fill('#offerIn', link);
  await guest.click('#btnOfferIn');
  await expect(guest.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  await guest.click('#btnCopyAnswer');
  return clipboardText(guest);
}
async function connect(host, guest) {
  const link = await hostCode(host);
  const reply = await guestReply(guest, link);
  await openDetails(host, 'Antwort-Code von Hand eingeben');
  await host.fill('#answerIn', reply);
  await host.click('#btnAnswerIn');
  await expect(host.locator('#scrSetup')).toBeVisible({ timeout: 15000 });
  await expect(guest.locator('#scrSetup')).toBeVisible({ timeout: 15000 });
}
const shipCells = (page, board) => page.locator(`#${board} .cell.ship`).evaluateAll(els => els.map(e => Number(e.dataset.i)));

/** Fleet rules checked independently: 5 ships (5,4,3,3,2) in straight lines, no two ships touching */
function checkFleet(cells) {
  const set = new Set(cells), seen = new Set(), ships = [];
  for (const c of cells) {
    if (seen.has(c)) continue;
    const comp = [], stack = [c];
    seen.add(c);
    while (stack.length) {
      const i = stack.pop(); comp.push(i);
      const x = i % N, y = Math.floor(i / N);
      // 8-neighbourhood: touching diagonally would merge two ships into one component
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, j = ny * N + nx;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < N && ny < N && set.has(j) && !seen.has(j)) { seen.add(j); stack.push(j); }
      }
    }
    const xs = new Set(comp.map(i => i % N)), ys = new Set(comp.map(i => Math.floor(i / N)));
    expect(xs.size === 1 || ys.size === 1, `ship ${comp.map(cellName)} is a straight line`).toBe(true);
    ships.push(comp.length);
  }
  expect(ships.sort((a, b) => b - a)).toEqual([5, 4, 3, 3, 2]);
}

test('two devices connect, place ships, play to the end and start a rematch', async ({ page: host, browser, baseURL }, testInfo) => {
  test.setTimeout(90000);
  const g = await secondPhone(browser, baseURL, testInfo);
  const guest = g.page;
  await host.goto(URL_);
  await guest.goto(URL_);
  await connect(host, guest);

  // Placement follows the rules on both devices
  const hostShips = await shipCells(host, 'setupBoard');
  const guestShips = await shipCells(guest, 'setupBoard');
  checkFleet(hostShips);
  checkFleet(guestShips);
  await expect(guest.locator('#btnLeave')).toBeVisible();

  await guest.click('#btnReady');
  await expect(guest.locator('#setupStatus')).toHaveText('Bereit! Warte auf den anderen …');
  await expect(host.locator('#setupStatus')).toContainText('Der andere ist bereit.');
  await host.click('#btnReady');
  await expect(host.locator('#scrPlay')).toBeVisible();
  await expect(guest.locator('#scrPlay')).toBeVisible();
  // The fleet shown in the game is the one placed
  expect(await shipCells(host, 'ownBoard')).toEqual(hostShips);

  // Exactly one player starts
  const hostStarts = await host.locator('#turn.mine').count() === 1;
  await expect(guest.locator('#turn.mine')).toHaveCount(hostStarts ? 0 : 1);
  if (!hostStarts) {
    // Guest misses once: the turn passes to the host
    const water = [...Array(100).keys()].find(i => !hostShips.includes(i));
    await guest.click(`#enemyBoard .cell[data-i="${water}"]`);
    await expect(guest.locator(`#enemyBoard .cell[data-i="${water}"]`)).toHaveClass(/miss/);
    await expect(host.locator(`#ownBoard .cell[data-i="${water}"]`)).toHaveClass(/miss/);
    await expect(host.locator('#turn')).toHaveClass(/mine/);
    await expect(host.locator('#turn')).toContainText(`Der andere schoss auf ${cellName(water)}: Wasser`);
  }
  // Host hits every ship cell of the guest – after each hit it is still the host's turn
  for (const [k, i] of guestShips.entries()) {
    await expect(host.locator('#turn')).toHaveClass(/mine/);
    await host.click(`#enemyBoard .cell[data-i="${i}"]`);
    await expect(host.locator(`#enemyBoard .cell[data-i="${i}"]`)).toHaveClass(/hit/);
    await expect(guest.locator(`#ownBoard .cell[data-i="${i}"]`)).toHaveClass(/hit/);
    if (k === 0) await expect(guest.locator('#turn')).not.toHaveClass(/mine/);
  }
  // All guest ships are sunk
  await expect(host.locator('#enemyBoard .cell.sunk')).toHaveCount(17);
  await expect(host.locator('#enemyFleet li.down')).toHaveCount(5);
  await expect(host.locator('#turn')).toHaveText('Gewonnen! 🎉');
  await expect(guest.locator('#turn')).toHaveText('Verloren – alle Schiffe versenkt.');
  await expect(guest.locator('#ownFleet li.down')).toHaveCount(5);
  // The loser sees the winner's ships (none of them was hit)
  await expect(guest.locator('#enemyBoard .cell.reveal')).toHaveCount(17);
  expect(await guest.locator('#enemyBoard .cell.reveal').evaluateAll(els => els.map(e => Number(e.dataset.i)))).toEqual(hostShips);
  // Score is saved per device
  await host.click('#btnAgain');
  await expect(host.locator('#scrSetup')).toBeVisible();
  await expect(guest.locator('#scrSetup')).toBeVisible();
  // Rematch keeps the placed fleet
  expect(await shipCells(guest, 'setupBoard')).toEqual(guestShips);
  const stats = p => p.evaluate(() => JSON.parse(localStorage.getItem('sea-battle.stats.v1')));
  expect(await stats(host)).toEqual({ wins: 1, losses: 0 });
  expect(await stats(guest)).toEqual({ wins: 0, losses: 1 });

  // Leaving tells the other device
  host.once('dialog', d => d.accept());
  await host.click('#btnLeave');
  await expect(host.locator('#scrLobby')).toBeVisible();
  await expect(guest.locator('#scrLobby')).toBeVisible();
  await expect(guest.locator('#lobbyStatus')).toHaveText('Der andere hat das Spiel verlassen.');
  await expect(host.locator('#sWins')).toHaveText('1');
  await expect(guest.locator('#sLosses')).toHaveText('1');
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test('the game link opens the app and joins right away; the code is short', async ({ page: host, browser, baseURL }, testInfo) => {
  const g = await secondPhone(browser, baseURL, testInfo);
  await host.goto(URL_);
  const link = await hostCode(host);
  expect(link.startsWith(`${baseURL}${URL_}#join=O1~`)).toBe(true);
  // Small QR code: well below 300 characters for a local connection
  expect(link.length).toBeLessThan(300);
  await g.page.goto(link.slice(baseURL.length));
  await expect(g.page.locator('#scrGuest')).toBeVisible();
  await expect(g.page.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  // The code is removed from the address
  expect(new URL(g.page.url()).hash).toBe('');
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test('a game link opened while the app is already open joins too', async ({ page: host, browser, baseURL }, testInfo) => {
  const g = await secondPhone(browser, baseURL, testInfo);
  await host.goto(URL_);
  await g.page.goto(URL_);
  // Broken link: message in the start screen
  await g.page.evaluate(() => { location.hash = 'join=kaputt'; });
  await expect(g.page.locator('#lobbyStatus')).toHaveText('Das ist kein gültiger Code.');
  const link = await hostCode(host);
  await g.page.evaluate(h => { location.hash = h; }, new URL(link).hash);
  await expect(g.page.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  expect(new URL(g.page.url()).hash).toBe('');
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test('wrong or broken codes are rejected with a clear message', async ({ page }) => {
  await page.goto(URL_);
  await openDetails(page, 'Spiel-Code von Hand eingeben');
  await page.fill('#offerIn', 'hallo');
  await page.click('#btnOfferIn');
  await expect(page.locator('#lobbyStatus')).toHaveText('Das ist kein gültiger Code.');
  // Tampered fingerprint
  await page.fill('#offerIn', 'O1~x~abcd~abcdefghijklmnopqrstuvwx~AAAA~1_1_udp_1_a.local_1_typ_host');
  await page.click('#btnOfferIn');
  await expect(page.locator('#lobbyStatus')).toHaveText('Das ist kein gültiger Code.');
  // A reply code in the wrong place
  const reply = 'A1~a~abcd~abcdefghijklmnopqrstuvwx~' + 'A'.repeat(43) + '~1_1_udp_1_a.local_1_typ_host';
  await page.fill('#offerIn', reply);
  await page.click('#btnOfferIn');
  await expect(page.locator('#lobbyStatus')).toHaveText('Das ist ein Antwort-Code – den scannt das Handy, das das Spiel erstellt hat.');
  await expect(page.locator('#scrLobby')).toBeVisible();
  // Host: a game code instead of the reply
  await page.click('#btnHost');
  await expect(page.locator('#qrOffer')).toHaveAttribute('data-text', /#join=/);
  await openDetails(page, 'Antwort-Code von Hand eingeben');
  await page.fill('#answerIn', await page.locator('#qrOffer').getAttribute('data-text'));
  await page.click('#btnAnswerIn');
  await expect(page.locator('#hostStatus')).toHaveText('Das ist ein Spiel-Code – hier wird der Antwort-Code gebraucht.');
  // Leave goes back to the start
  await page.click('#btnLeave');
  await expect(page.locator('#scrLobby')).toBeVisible();
});

test('placing ships: select, move, rotate – touching ships are refused', async ({ page: host, browser, baseURL }, testInfo) => {
  const g = await secondPhone(browser, baseURL, testInfo);
  await host.goto(URL_);
  await g.page.goto(URL_);
  await connect(host, g.page);
  const page = host;
  // Random placements always follow the rules
  for (let k = 0; k < 5; k++) {
    await page.click('#btnRandom');
    checkFleet(await shipCells(page, 'setupBoard'));
  }
  await expect(page.locator('#btnRotate')).toBeDisabled();
  // Select the ship on the first ship cell and remember its cells
  const before = await shipCells(page, 'setupBoard');
  await page.click(`#setupBoard .cell[data-i="${before[0]}"]`);
  const sel = await page.locator('#setupBoard .cell.sel').evaluateAll(els => els.map(e => Number(e.dataset.i)));
  expect(sel.length).toBeGreaterThanOrEqual(2);
  await expect(page.locator('#btnRotate')).toBeEnabled();
  await expect(page.locator('#setupStatus')).toContainText('gewählt');
  // Moving it next to another ship is refused, the fleet stays the same
  const other = before.find(i => !sel.includes(i));
  const touching = [other - 1, other + 1, other - N, other + N].find(j => j >= 0 && j < 100 && !before.includes(j) &&
    Math.abs((j % N) - (other % N)) <= 1);
  if (touching !== undefined) await page.click(`#setupBoard .cell[data-i="${touching}"]`);
  // Either refused, or (if the ship fits after clamping without touching) the rules still hold
  const after = await shipCells(page, 'setupBoard');
  checkFleet(after);
  if (JSON.stringify(after) === JSON.stringify(before)) await expect(page.locator('#setupStatus')).toHaveText('Passt dort nicht – Schiffe dürfen sich nicht berühren.');
  // Rotating keeps the rules
  await page.click('#btnRandom');
  const fleet = await shipCells(page, 'setupBoard');
  for (const i of fleet.slice(0, 3)) {
    await page.click(`#setupBoard .cell[data-i="${i}"]`);
    if (await page.locator('#setupBoard .cell.sel').count()) await page.click('#btnRotate');
    checkFleet(await shipCells(page, 'setupBoard'));
    if (await page.locator('#setupBoard .cell.sel').count()) await page.click('#setupBoard .cell.sel >> nth=0');
  }
  await page.click('#btnReady');
  await expect(page.locator('#setupBoard .cell').first()).toBeDisabled();
  await expect(page.locator('#btnRandom')).toBeDisabled();
  expect(g.problems).toEqual([]);
  await g.context.close();
});

/** Fake camera: a canvas stream showing a QR code with the given text (drawn by the app's own QR library) */
async function fakeCameraWithQr(page) {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const c = document.createElement('canvas');
      c.width = c.height = 480;
      const ctx = c.getContext('2d');
      const draw = () => {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 480, 480);
        const text = window.__cameraSees;
        if (text) {
          const qr = qrcode(0, 'L'); qr.addData(text, 'Byte'); qr.make();
          // Quiet zone of 4+ modules around the code
          const n = qr.getModuleCount(), s = Math.floor(300 / n), o = (480 - n * s) / 2;
          ctx.fillStyle = '#000';
          for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) ctx.fillRect(o + k * s, o + r * s, s, s);
        }
        requestAnimationFrame(draw);
      };
      draw();
      return c.captureStream(15);
    };
  });
}

test('scanning: the QR reader works offline; the guest scans the game code, the host scans the reply', async ({ page: host, context, browser, baseURL }, testInfo) => {
  test.setTimeout(90000);
  const g = await secondPhone(browser, baseURL, testInfo);
  const guest = g.page;
  await fakeCameraWithQr(host);
  await fakeCameraWithQr(guest);
  // Both load once, then go offline: the QR reader (WebAssembly) comes from the offline cache
  for (const [p, ctx] of [[host, context], [guest, g.context]]) {
    await p.goto(URL_);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await ctx.setOffline(true);
    await p.reload();
  }

  // The camera first sees the wrong code: a hint, scanning goes on
  await guest.evaluate(() => { window.__cameraSees = 'irgendwas'; });
  await guest.click('#btnJoin');
  await expect(guest.locator('#h-scan')).toHaveText('Spiel-Code des anderen scannen');
  await expect(guest.locator('#scanStatus')).toHaveText('Das ist kein gültiger Code.', { timeout: 20000 });
  // Chromium's offline emulation also cuts WebRTC (on phones Wi-Fi or a hotspot stays on) – connect with network
  await context.setOffline(false);
  await g.context.setOffline(false);
  await host.click('#btnHost');
  await expect(host.locator('#qrOffer')).toHaveAttribute('data-text', /#join=/);
  const link = await host.locator('#qrOffer').getAttribute('data-text');
  await guest.evaluate(l => { window.__cameraSees = l; }, link);
  await expect(guest.locator('#scrGuest')).toBeVisible({ timeout: 20000 });
  await expect(guest.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  const reply = await guest.locator('#qrAnswer').getAttribute('data-text');

  await host.evaluate(r => { window.__cameraSees = r; }, reply);
  await host.click('#btnScanAnswer');
  await expect(host.locator('#scrSetup')).toBeVisible({ timeout: 20000 });
  await expect(guest.locator('#scrSetup')).toBeVisible({ timeout: 20000 });
  // Camera is off again
  expect(await host.evaluate(() => document.getElementById('video').srcObject)).toBeNull();
  expect(g.problems).toEqual([]);
  await g.context.close();
});

test('cancel scanning goes back and stops the camera', async ({ page }) => {
  await fakeCameraWithQr(page);
  await page.goto(URL_);
  await page.click('#btnJoin');
  await expect(page.locator('#scanStatus')).toHaveText('QR-Code in den Rahmen halten.', { timeout: 20000 });
  await page.click('#btnScanCancel');
  await expect(page.locator('#scrLobby')).toBeVisible();
  expect(await page.evaluate(() => document.getElementById('video').srcObject)).toBeNull();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and errors in English', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#btnHost')).toContainText('New game');
    await openDetails(page, 'Enter game code manually');
    await page.fill('#offerIn', 'nonsense');
    await page.click('#btnOfferIn');
    await expect(page.locator('#lobbyStatus')).toHaveText('This is not a valid code.');
  });
});

test('WebMCP: read the game and fire shots like the player', async ({ page: host, browser, baseURL }, testInfo) => {
  test.setTimeout(90000);
  const g = await secondPhone(browser, baseURL, testInfo);
  const guest = g.page;
  const call = (p, name, input) => p.evaluate(([n, i]) => {
    const tool = Tools.mcp.tools().find(t => t.name === n);
    return tool.execute(i).then(r => ({ ok: true, result: r }), e => ({ ok: false, error: e.message }));
  }, [name, input]);
  await host.goto(URL_);
  await guest.goto(URL_);
  // Lobby: nothing to shoot at
  expect((await call(host, 'sea_battle_get_game', {})).result).toMatchObject({ connected: false, phase: 'lobby', your_board: null });
  expect(await call(host, 'sea_battle_fire_shot', { column: 'A', row: 1 })).toEqual({ ok: false, error: 'No game is running.' });
  expect(await call(host, 'sea_battle_fire_shot', { column: 'K', row: 1 })).toMatchObject({ ok: false });
  expect(await call(host, 'sea_battle_fire_shot', { column: 'A', row: 11 })).toEqual({ ok: false, error: 'input.row must be <= 10' });

  await connect(host, guest);
  const hostShips = await shipCells(host, 'setupBoard');
  const guestShips = await shipCells(guest, 'setupBoard');
  const setup = (await call(host, 'sea_battle_get_game', {})).result;
  expect(setup).toMatchObject({ connected: true, role: 'host', phase: 'setup', your_ships_left: 5 });
  // Own board as rows: "S" exactly on the placed ship cells
  const sCells = setup.your_board.flatMap((r, y) => [...r].map((ch, x) => ch === 'S' ? y * N + x : -1)).filter(i => i >= 0);
  expect(sCells).toEqual(hostShips);

  await guest.click('#btnReady');
  await host.click('#btnReady');
  await expect(host.locator('#scrPlay')).toBeVisible();
  let state = (await call(host, 'sea_battle_get_game', {})).result;
  expect(state.phase).toBe('playing');
  const hostWater = [...Array(100).keys()].filter(i => !hostShips.includes(i));
  if (!state.your_turn) {
    expect(await call(host, 'sea_battle_fire_shot', { column: 'A', row: 1 })).toEqual({ ok: false, error: 'It is not your turn.' });
    await guest.click(`#enemyBoard .cell[data-i="${hostWater[0]}"]`);
    await expect(host.locator('#turn')).toHaveClass(/mine/);
  }
  // A miss first (if there is water the host has not tried), then hits until the end
  const water = [...Array(100).keys()].find(i => !guestShips.includes(i));
  const miss = await call(host, 'sea_battle_fire_shot', { column: COLS[water % N], row: Math.floor(water / N) + 1 });
  expect(miss.result).toEqual({ cell: cellName(water), result: 'miss', sunk_ship: null, game_over: false, you_won: false, your_turn: false });
  await expect(host.locator(`#enemyBoard .cell[data-i="${water}"]`)).toHaveClass(/miss/);
  await expect(host.locator('#toast')).toHaveText('KI-Agent: geschossen');
  expect(await call(host, 'sea_battle_fire_shot', { column: 'A', row: 1 })).toEqual({ ok: false, error: 'It is not your turn.' });
  // Guest misses so the host can go on
  await guest.click(`#enemyBoard .cell[data-i="${hostWater[1]}"]`);
  await expect(host.locator('#turn')).toHaveClass(/mine/);
  expect(await call(host, 'sea_battle_fire_shot', { column: COLS[water % N], row: Math.floor(water / N) + 1 }))
    .toEqual({ ok: false, error: `${cellName(water)} has already been shot at.` });
  let last;
  for (const i of guestShips) {
    last = (await call(host, 'sea_battle_fire_shot', { column: COLS[i % N], row: Math.floor(i / N) + 1 })).result;
    expect(['hit', 'sunk']).toContain(last.result);
  }
  expect(last).toMatchObject({ result: 'sunk', game_over: true, you_won: true, your_turn: false });
  expect(last.sunk_ship).toHaveProperty('length');
  state = (await call(host, 'sea_battle_get_game', {})).result;
  expect(state).toMatchObject({ phase: 'over', result: 'you_won', opponent_ships_left: 0, score: { wins: 1, losses: 0 } });
  expect(state.opponent_board.join('').replace(/[^#]/g, '')).toHaveLength(17);
  expect(state.opponent_board.join('').replace(/[^o]/g, '')).toHaveLength(1);
  const gs = (await call(guest, 'sea_battle_get_game', {})).result;
  expect(gs).toMatchObject({ phase: 'over', result: 'you_lost', your_ships_left: 0 });
  // The guest sees the host's remaining ships as "S"
  expect(gs.opponent_board.join('').replace(/[^S]/g, '')).toHaveLength(17);
  expect(gs.opponent_board.join('').replace(/[^o]/g, '').length).toBeGreaterThanOrEqual(1);
  expect(g.problems).toEqual([]);
  await g.context.close();
});
