// Cast demo: without an app ID nothing is loaded from Google; with a fake Cast SDK (sender and receiver,
// joined by a BroadcastChannel) the real app streams over real WebRTC to the real receiver page in a
// second tab: picture and sound arrive, stats are shown, stop ends it on both sides. Settings persist, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';

const SENDER_SDK = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js**';
const RECEIVER_SDK = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
const NS = 'urn:x-cast:io.github.phanlipo.stream';

// Minimal stand-in for the Cast sender framework: requestSession() "picks" a TV, messages go over a BroadcastChannel
const FAKE_SENDER = `(() => {
  const bc = new BroadcastChannel('fake-cast');
  const listeners = {}; const ctxListeners = [];
  let session = null; window.__fake = { options: null, sent: [] };
  const fire = s => ctxListeners.forEach(f => f({ sessionState: s }));
  bc.onmessage = e => { if (e.data.to === 'tx' && session) (listeners[e.data.ns] || []).forEach(f => f(e.data.ns, e.data.data)); };
  function Session() {
    this.getCastDevice = () => ({ friendlyName: 'Wohnzimmer' });
    this.sendMessage = (ns, msg) => { window.__fake.sent.push(msg.type); bc.postMessage({ to: 'rx', ns, data: msg }); return Promise.resolve(); };
    this.addMessageListener = (ns, f) => { (listeners[ns] = listeners[ns] || []).push(f); };
    this.removeMessageListener = (ns, f) => { listeners[ns] = (listeners[ns] || []).filter(x => x !== f); };
    this.endSession = () => { bc.postMessage({ to: 'rx', disconnect: true }); session = null; fire('SESSION_ENDED'); };
  }
  const ctx = {
    setOptions: o => { window.__fake.options = o; },
    getCurrentSession: () => session,
    addEventListener: (_t, f) => ctxListeners.push(f),
    requestSession: () => window.__fakeCancel ? Promise.reject('cancel') : (session = new Session(), fire('SESSION_STARTED'), Promise.resolve()),
  };
  window.chrome = window.chrome || {};
  chrome.cast = { AutoJoinPolicy: { ORIGIN_SCOPED: 'origin_scoped' }, ErrorCode: { CANCEL: 'cancel' } };
  window.cast = { framework: { CastContext: { getInstance: () => ctx },
    CastContextEventType: { SESSION_STATE_CHANGED: 'sessionstatechanged' },
    SessionState: { SESSION_STARTED: 'SESSION_STARTED', SESSION_ENDED: 'SESSION_ENDED' } } };
  setTimeout(() => window.__onGCastApiAvailable(true), 10);
})();`;

// Stand-in for the Cast receiver framework on the TV
const FAKE_RECEIVER = `(() => {
  const bc = new BroadcastChannel('fake-cast');
  const msg = {}; const ev = {}; let senders = [];
  window.__rx = { started: null, stopped: false };
  bc.onmessage = e => {
    if (e.data.to !== 'rx') return;
    if (e.data.disconnect) { senders = []; (ev.senderdisconnected || []).forEach(f => f({ senderId: 's1' })); return; }
    senders = ['s1'];
    (msg[e.data.ns] || []).forEach(f => f({ senderId: 's1', data: e.data.data }));
  };
  const ctx = {
    addCustomMessageListener: (ns, f) => { (msg[ns] = msg[ns] || []).push(f); },
    sendCustomMessage: (ns, _id, data) => bc.postMessage({ to: 'tx', ns, data: JSON.stringify(data) }),
    addEventListener: (t, f) => { (ev[t] = ev[t] || []).push(f); },
    getSenders: () => senders,
    start: o => { window.__rx.started = o; },
    stop: () => { window.__rx.stopped = true; },
  };
  window.cast = { framework: { CastReceiverContext: { getInstance: () => ctx },
    system: { EventType: { SENDER_DISCONNECTED: 'senderdisconnected' }, MessageType: { JSON: 'JSON' } } } };
})();`;

const setAppId = async (page, id) => {
  await openMenu(page);
  await page.locator('#appId').fill(id);
  await page.locator('#appId').blur();
  await closeMenu(page);
};

test('without an app ID: hint, menu opens, nothing is loaded from Google', async ({ page }) => {
  await page.goto('/cast-demo/');
  await page.getByRole('button', { name: 'Auf Fernseher streamen' }).click();
  await expect(page.locator('.toast')).toContainText('Cast-App-ID');
  await expect(page.locator('#appId')).toBeVisible();
  await expect(page.locator('#appId')).toBeFocused();
  // The receiver address to register is shown and can be copied
  await expect(page.locator('#receiverUrl')).toHaveText('https://phanlipo.github.io/assets/shared/cast-receiver.html');
  expect(await page.evaluate(() => !!window.cast)).toBe(false);
});

test('app ID is checked and kept, settings persist', async ({ page }) => {
  await page.goto('/cast-demo/');
  await openMenu(page);
  await page.locator('#appId').fill('xyz');
  await page.locator('#appId').blur();
  await expect(page.locator('.toast')).toContainText('8 Zeichen');
  await page.locator('#appId').fill('1a2b3c4d');
  await page.locator('#appId').blur();
  await expect(page.locator('#appId')).toHaveValue('1A2B3C4D');
  await page.locator('#quality').selectOption('480');
  await page.locator('#optTvLog').check();
  await closeMenu(page);
  await page.getByRole('button', { name: 'Sterne' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Sterne' })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height])).toEqual([854, 480]);
  await openMenu(page);
  await expect(page.locator('#appId')).toHaveValue('1A2B3C4D');
  await expect(page.locator('#optTvLog')).toBeChecked();
});

test('the picture is live and taps draw on it', async ({ page }) => {
  await page.goto('/cast-demo/');
  const frames = () => page.evaluate(() => document.getElementById('view').getContext('2d').getImageData(0, 0, 1280, 720).data.reduce((a, v, i) => (i % 97 ? a : a + v), 0));
  const a = await frames();
  await page.waitForTimeout(300);
  expect(await frames()).not.toBe(a);
  await page.getByRole('button', { name: 'Musik an' }).click();
  await expect(page.getByRole('button', { name: 'Musik aus' })).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#view').click({ position: { x: 50, y: 50 } });
});

test.describe('streaming with a fake Cast SDK', () => {
  // The app's service worker would fetch the SDK itself (not routed by Playwright) – block it here
  test.use({ serviceWorkers: 'block', allowedProblems: /external request: https:\/\/www\.gstatic\.com\/cv\/js\/sender\/v1\/cast_sender\.js/ });

  test('picture and sound reach the receiver, stats show, stop ends both', async ({ page, context }) => {
    test.setTimeout(60000);
    await context.route(SENDER_SDK, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_SENDER }));
    await context.route(RECEIVER_SDK, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_RECEIVER }));
    // The TV: the real receiver page
    const tv = await context.newPage();
    const tvErrors = [];
    tv.on('pageerror', e => tvErrors.push(e.message));
    tv.on('console', m => { if (m.type() === 'error') tvErrors.push(m.text()); });
    await tv.goto('/assets/shared/cast-receiver.html');
    const started = await tv.evaluate(() => window.__rx.started);
    expect(started.customNamespaces).toEqual({ [NS]: 'JSON' });
    expect(started.disableIdleTimeout).toBe(true);
    await expect(tv.locator('#idle')).toBeVisible();

    await page.goto('/cast-demo/');
    await setAppId(page, '1A2B3C4D');
    await page.getByRole('button', { name: 'Auf Fernseher streamen' }).click();
    await expect.poll(() => page.evaluate(() => window.__fake && window.__fake.options)).toEqual({ receiverApplicationId: '1A2B3C4D', autoJoinPolicy: 'origin_scoped' });
    await expect(page.locator('#status')).toContainText('Live auf Wohnzimmer', { timeout: 20000 });
    // Music starts with the stream
    await expect(page.getByRole('button', { name: 'Musik aus' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Streaming beenden' })).toBeVisible();

    // The TV plays a 1280×720 video with an audio track
    await expect.poll(() => tv.evaluate(() => document.getElementById('video').videoWidth), { timeout: 20000 }).toBe(1280);
    const rx = await tv.evaluate(() => {
      const v = document.getElementById('video');
      return { h: v.videoHeight, audio: v.srcObject.getAudioTracks().length, video: v.srcObject.getVideoTracks().length, idle: document.getElementById('idle').hidden };
    });
    expect(rx).toEqual({ h: 720, audio: 1, video: 1, idle: true });
    // The audio track carries sound (level measured on the TV, independent of the app)
    const level = await tv.evaluate(async () => {
      const ac = new AudioContext(); await ac.resume();
      const an = ac.createAnalyser(); an.fftSize = 2048;
      ac.createMediaStreamSource(document.getElementById('video').srcObject).connect(an);
      const buf = new Float32Array(an.fftSize); let max = 0;
      for (let i = 0; i < 30; i++) { await new Promise(r => setTimeout(r, 100)); an.getFloatTimeDomainData(buf); for (const x of buf) max = Math.max(max, Math.abs(x)); }
      return max;
    });
    expect(level).toBeGreaterThan(0.01);
    // Stats from WebRTC: size, fps, bitrate
    await expect(page.locator('#status')).toContainText('1280×720', { timeout: 10000 });
    const diag = await page.evaluate(() => window.Tools.diag.text());
    expect(diag).toContain('"state":"streaming"');
    expect(diag).not.toContain('1A2B3C4D');

    // Stop: the TV is told (bye), the receiver goes back to idle
    await page.getByRole('button', { name: 'Streaming beenden' }).click();
    await expect(page.locator('#status')).toHaveText('Nicht verbunden');
    await expect(tv.locator('#idle')).toBeVisible();
    await expect.poll(() => tv.evaluate(() => window.__rx.stopped)).toBe(true);
    expect(await page.evaluate(() => window.__fake.sent)).toEqual(['offer', 'bye']);
    expect(tvErrors).toEqual([]);
  });

  test('cancelling the TV choice is quiet', async ({ page, context }) => {
    await context.route(SENDER_SDK, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_SENDER }));
    await page.addInitScript(() => { window.__fakeCancel = true; });
    await page.goto('/cast-demo/');
    await setAppId(page, '1A2B3C4D');
    await page.getByRole('button', { name: 'Auf Fernseher streamen' }).click();
    await expect.poll(() => page.evaluate(() => window.CastStream.info().sdk)).toBe('ready');
    await expect(page.locator('#status')).toHaveText('Nicht verbunden');
    await expect(page.getByRole('button', { name: 'Auf Fernseher streamen' })).toBeVisible();
  });

  test('no answer from the TV: clear error', async ({ page, context }) => {
    test.setTimeout(40000);
    await context.route(SENDER_SDK, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_SENDER }));
    await page.goto('/cast-demo/');
    await setAppId(page, '1A2B3C4D');
    await page.getByRole('button', { name: 'Auf Fernseher streamen' }).click();
    await expect(page.locator('#status')).toContainText('Der Fernseher antwortet nicht', { timeout: 30000 });
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts in English', async ({ page }) => {
    await page.goto('/cast-demo/');
    await expect(page.locator('#status')).toHaveText('Not connected');
    await page.getByRole('button', { name: 'Stream to TV' }).click();
    await expect(page.locator('.toast')).toContainText('Cast app ID');
  });
});
