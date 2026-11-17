// assets/shared/p2p-connect.js: P2PConnect.room() (one host, several guests) on its own, with two browsers.
// The apps' own flows are tested in card-games / quartet (room), rock-paper-scissors / sea-battle (session).
// Harness: the template page gets the elements and scripts the module needs.
import { test, expect, clipboardText, privateClipboard } from './helpers.mjs';

const ELEMENTS = `<div id="harness">
  <button id="btnJoin">join</button><input id="offerIn"><button id="btnOfferIn">offer</button><p id="lobbyStatus"></p>
  <canvas id="qrOffer" width="200" height="200"></canvas><button id="btnCopyOffer">copy</button><button id="btnShareOffer" hidden>share</button>
  <button id="btnScanAnswer">scan</button><input id="answerIn"><button id="btnAnswerIn">answer</button><p id="inviteStatus"></p>
  <canvas id="qrAnswer" width="200" height="200"></canvas><button id="btnCopyAnswer">copy</button><button id="btnShareAnswer" hidden>share</button><p id="answerStatus"></p>
  <video id="video"></video><h2 id="h-scan"></h2><p id="scanStatus"></p><button id="btnScanCancel">cancel</button>
</div>`;

/** A page with a room: canJoin decides whether a seat is free; events are recorded in window.__room */
async function roomPage(context, { canJoin }) {
  const page = await context.newPage();
  await privateClipboard(page);
  await page.goto('/template/');
  await page.evaluate(html => document.body.insertAdjacentHTML('beforeend', html), ELEMENTS);
  for (const src of ['../assets/vendor/qrcode-generator/qrcode.js', '../assets/vendor/zxing-wasm/iife/reader/index.js', '../assets/shared/p2p.js', '../assets/shared/p2p-connect.js'])
    await page.addScriptTag({ url: src });
  await page.evaluate(canJoin => {
    const ev = window.__room = { log: [], guests: [], status: {} };
    Tools.i18n({ de: { ...P2PConnect.texts.de, full: 'Die Runde ist voll.', shareTitle: 'Test' }, en: { ...P2PConnect.texts.en, full: 'No more seats.', shareTitle: 'Test' } });
    window.room = P2PConnect.room({
      label: 'test', stun: () => false,
      status: (id, text) => { ev.status[id] = text; },
      show: step => ev.log.push('show ' + step), back: expect => ev.log.push('back ' + expect),
      beforeJoin: () => ev.log.push('beforeJoin'),
      canJoin: () => canJoin, onFull: () => ev.log.push('full'),
      onGuest: p => { ev.guests.push(p); ev.log.push('guest'); p.on('message', m => ev.log.push('host got ' + m.t)); },
      onGuestPeer: () => ev.log.push('guestPeer'),
      onHostOpen: p => { ev.log.push('hostOpen'); p.send({ t: 'hello' }); },
      onHostMessage: m => ev.log.push('guest got ' + m.t),
      onHostLost: reason => ev.log.push('lost ' + reason),
    });
  }, canJoin);
  return page;
}
const log = page => page.evaluate(() => window.__room.log);
const status = (page, id) => page.evaluate(id => window.__room.status[id], id);

/** Host invites, guest answers – by copied codes, like the apps' tests */
async function connect(host, guest) {
  await host.evaluate(() => room.invite());
  await expect.poll(() => status(host, 'inviteStatus')).toBe('Warte auf den Antwort-Code …');
  await host.click('#btnCopyOffer');
  await guest.fill('#offerIn', await clipboardText(host));
  await guest.click('#btnOfferIn');
  await expect(guest.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  await guest.click('#btnCopyAnswer');
  await host.fill('#answerIn', await clipboardText(guest));
  await host.click('#btnAnswerIn');
}

test('a guest joins: host gets the connection, guest says hello; codes are checked', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE' });
  const host = await roomPage(ctx, { canJoin: true }), guest = await roomPage(ctx, { canJoin: true });
  // A reply code where a game code is expected is refused with a message
  await guest.fill('#offerIn', 'A1~x');
  await guest.click('#btnOfferIn');
  await expect.poll(() => status(guest, 'lobbyStatus')).toMatch(/Antwort-Code|kein gültiger Code/);
  await connect(host, guest);
  await expect.poll(() => log(host)).toEqual(['show invite', 'show invite', 'guest', 'host got hello']);
  expect(await log(guest)).toEqual(['beforeJoin', 'show answer', 'guestPeer', 'hostOpen']);
  expect(await host.evaluate(() => room.inviting())).toBe(false);
  // Guest leaves: the host is told with a bye
  await guest.evaluate(() => room.close());
  await expect.poll(() => log(host)).toContain('host got bye');
  await ctx.close();
});

test('room full: the guest gets a bye and the host the notice', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE' });
  const host = await roomPage(ctx, { canJoin: false }), guest = await roomPage(ctx, { canJoin: true });
  await connect(host, guest);
  await expect(host.locator('#toast')).toHaveText('Die Runde ist voll.');
  await expect.poll(() => log(host)).toEqual(['show invite', 'show invite', 'full']);
  await expect.poll(() => log(guest)).toContain('guest got bye');
  expect(await host.evaluate(() => window.__room.guests.length)).toBe(0);
  await ctx.close();
});

test('cancelling an invitation: a late reply code is refused', async ({ browser, baseURL }) => {
  const ctx = await browser.newContext({ baseURL, locale: 'de-DE' });
  const host = await roomPage(ctx, { canJoin: true }), guest = await roomPage(ctx, { canJoin: true });
  await host.evaluate(() => room.invite());
  await expect.poll(() => status(host, 'inviteStatus')).toBe('Warte auf den Antwort-Code …');
  await host.click('#btnCopyOffer');
  await guest.fill('#offerIn', await clipboardText(host));
  await guest.click('#btnOfferIn');
  await expect(guest.locator('#qrAnswer')).toHaveAttribute('data-text', /^A1~/);
  await host.evaluate(() => room.cancelInvite());
  expect(await host.evaluate(() => room.inviting())).toBe(false);
  await guest.click('#btnCopyAnswer');
  await host.fill('#answerIn', await clipboardText(guest));
  await host.click('#btnAnswerIn');
  await expect.poll(() => status(host, 'inviteStatus')).toBe(await host.evaluate(() => Tools.t('connectFail')));
  expect(await log(host)).not.toContain('guest');
  await ctx.close();
});
