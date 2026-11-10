// Cast demo: picture animates, music, the dialog for screen casting per platform (Android link to the cast
// settings with a hint when it does not open), TV mode (full screen, landscape, screen kept on, bar that
// hides and comes back, exit by button and back gesture), settings persist, English. Direct streaming: with a fake
// Cast SDK (sender and receiver joined by a BroadcastChannel) the real app streams over real WebRTC to the real
// receiver page in a second tab.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

// Record rotation lock and wake lock instead of the real APIs (not available headless)
async function mockDevice(page, { lockOk = true } = {}) {
  await page.addInitScript(lockOk => {
    window.__dev = { locks: [], unlocks: 0, wake: 0, released: 0 };
    if (screen.orientation) {
      screen.orientation.lock = t => { __dev.locks.push(t); return lockOk ? Promise.resolve() : Promise.reject(new DOMException('not supported', 'NotSupportedError')); };
      screen.orientation.unlock = () => { __dev.unlocks++; };
    }
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      __dev.wake++;
      const s = new EventTarget(); s.release = async () => { __dev.released++; s.dispatchEvent(new Event('release')); };
      return s;
    } } });
  }, lockOk);
}

const sample = page => page.evaluate(() => {
  const d = document.getElementById('view').getContext('2d').getImageData(0, 0, 1280, 720).data;
  let s = 0; for (let i = 0; i < d.length; i += 4001) s += d[i];
  return s;
});

test('the picture is live, music toggles both buttons, scene and settings persist', async ({ page }) => {
  await page.goto('/cast-demo/');
  const a = await sample(page);
  await page.waitForTimeout(300);
  expect(await sample(page)).not.toBe(a);
  await page.locator('.controls [data-music]').click();
  await expect(page.locator('.controls [data-music]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.controls [data-music]')).toHaveText('Musik aus');
  await expect(page.locator('#tvBar [data-music]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => Tools.diag.text())).toContain('music: true');
  await page.locator('.scenes').getByRole('button', { name: 'Balken' }).click();
  await openMenu(page);
  await page.locator('#optClock').uncheck();
  await page.locator('#optAutoMusic').uncheck();
  await closeMenu(page);
  await page.reload();
  await expect(page.locator('.scenes').getByRole('button', { name: 'Balken' })).toHaveAttribute('aria-pressed', 'true');
  await openMenu(page);
  await expect(page.locator('#optClock')).not.toBeChecked();
  await expect(page.locator('#optAutoMusic')).not.toBeChecked();
});

test.describe('Android phone', () => {
  test.use({ userAgent: ANDROID, viewport: { width: 390, height: 800 }, hasTouch: true });

  test('dialog shows how to cast, the link opens the cast settings, hint if it did not', async ({ page }) => {
    await page.goto('/cast-demo/');
    await expect(page.locator('#status')).toContainText('Bildschirmübertragung');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    const dlg = page.getByRole('dialog', { name: 'Auf Fernseher zeigen' });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByText('Smart View').first()).toBeVisible();
    await expect(dlg.locator('[data-platform="desktop"]')).toBeHidden();
    const link = dlg.getByRole('link', { name: 'Übertragung in den Einstellungen öffnen' });
    await expect(link).toHaveAttribute('href', 'intent:#Intent;action=android.settings.CAST_SETTINGS;end');
    // Chrome did not open the settings (page stays visible) → hint after 2.5 s
    await link.evaluate(a => a.addEventListener('click', e => e.preventDefault()));
    await link.click();
    await expect(dlg.locator('#castFail')).toBeHidden();
    await expect(dlg.locator('#castFail')).toBeVisible({ timeout: 4000 });
    await dlg.getByRole('button', { name: 'Schließen' }).click();
    await expect(dlg).toBeHidden();
  });

  test('TV mode: full screen, landscape, screen on, music, bar hides and returns, exit', async ({ page }) => {
    await mockDevice(page);
    await page.goto('/cast-demo/');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    await page.getByRole('button', { name: 'Vollbild starten' }).click();
    await expect(page.locator('#screen')).toHaveClass(/\btv\b/);
    expect(await page.evaluate(() => document.fullscreenElement && document.fullscreenElement.id)).toBe('screen');
    expect(await page.evaluate(() => [__dev.locks, __dev.wake])).toEqual([['landscape'], 1]);
    await expect(page.locator('#tvBar [data-music]')).toHaveAttribute('aria-pressed', 'true');   // music started with it
    // The bar fades after 3 s, a tap on the picture brings it back
    await expect(page.locator('#tvBar')).toBeVisible();
    await expect(page.locator('#screen')).toHaveClass(/bar-hidden/, { timeout: 5000 });
    await page.locator('#view').click();
    await expect(page.locator('#screen')).not.toHaveClass(/bar-hidden/);
    await page.locator('#tvBar').getByRole('button', { name: 'Sterne' }).click();
    await expect(page.locator('.scenes').getByRole('button', { name: 'Sterne' })).toHaveAttribute('aria-pressed', 'true');
    const diag = await page.evaluate(() => Tools.diag.text());
    expect(diag).toContain('tv on');
    expect(diag).toContain('"landscape":true');
    await page.locator('#tvBar').getByRole('button', { name: 'Vollbild beenden' }).click();
    await expect(page.locator('#screen')).not.toHaveClass(/\btv\b/);
    expect(await page.evaluate(() => [!!document.fullscreenElement, __dev.unlocks, __dev.released])).toEqual([false, 1, 1]);
  });

  test('back gesture (full screen ended by the browser) leaves TV mode', async ({ page }) => {
    await mockDevice(page);
    await page.goto('/cast-demo/');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    await page.getByRole('button', { name: 'Vollbild starten' }).click();
    await expect(page.locator('#screen')).toHaveClass(/\btv\b/);
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('#screen')).not.toHaveClass(/\btv\b/);
    expect(await page.evaluate(() => __dev.released)).toBe(1);
  });

  test('no rotation lock: hint to turn the phone, TV mode still works', async ({ page }) => {
    await mockDevice(page, { lockOk: false });
    await page.goto('/cast-demo/');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    await page.getByRole('button', { name: 'Vollbild starten' }).click();
    await expect(page.locator('.toast')).toContainText('Handy bitte drehen');
    await expect(page.locator('#screen')).toHaveClass(/\btv\b/);
  });
});

test('computer: dialog explains "Cast tab"', async ({ page }) => {
  await page.goto('/cast-demo/');
  await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
  const dlg = page.getByRole('dialog');
  await expect(dlg.getByText('Tab streamen')).toBeVisible();
  await expect(dlg.locator('[data-platform="android"]')).toBeHidden();
});

test.describe('English', () => {
  test.use({ locale: 'en-US', userAgent: ANDROID });
  test('texts in English', async ({ page }) => {
    await page.goto('/cast-demo/');
    await expect(page.locator('#status')).toContainText('screen casting');
    await page.getByRole('button', { name: 'Show on TV' }).click();
    await expect(page.getByRole('dialog', { name: 'Show on TV' }).getByText('Cast my screen')).toBeVisible();
  });
});

/* ---------- Direct streaming (assets/shared/cast.js + cast-receiver) with a fake Cast SDK ---------- */
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


const startDirect = async page => {
  await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
  await page.getByRole('button', { name: 'Direkt streamen' }).click();
};

test('direct streaming: nothing is loaded from Google before the tap', async ({ page }) => {
  await page.goto('/cast-demo/');
  await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
  await expect(page.getByRole('button', { name: 'Direkt streamen' })).toBeVisible();
  await page.getByRole('button', { name: 'Schließen' }).click();
  expect(await page.evaluate(() => !!window.cast)).toBe(false);
});

test('own app ID is checked and kept, stream settings persist', async ({ page }) => {
  await page.goto('/cast-demo/');
  await openMenu(page);
  await expect(page.locator('#appId')).toHaveAttribute('placeholder', 'B72055BC');
  await page.locator('#appId').fill('xyz');
  await page.locator('#appId').blur();
  await expect(page.locator('.toast')).toContainText('8 Zeichen');
  await page.locator('#appId').fill('1a2b3c4d');
  await page.locator('#appId').blur();
  await expect(page.locator('#appId')).toHaveValue('1A2B3C4D');
  await page.locator('#quality').selectOption('480');
  await page.locator('#optTvLog').check();
  await closeMenu(page);
  await page.reload();
  expect(await page.evaluate(() => [document.getElementById('view').width, document.getElementById('view').height])).toEqual([854, 480]);
  await openMenu(page);
  await expect(page.locator('#appId')).toHaveValue('1A2B3C4D');
  await expect(page.locator('#optTvLog')).toBeChecked();
});

test.describe('iPhone', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
  test('no direct streaming offered, AirPlay hint', async ({ page }) => {
    await page.goto('/cast-demo/');
    await page.getByRole('button', { name: 'Auf Fernseher zeigen' }).click();
    await expect(page.getByRole('button', { name: 'Direkt streamen' })).toBeHidden();
    await expect(page.getByRole('dialog').getByText('Bildschirmsynchronisierung')).toBeVisible();
  });
});

// A picture of the 1280×720 stream: 16:9 (within 2 px, encoders round to even sizes), at most the full size
// and not smaller than a quarter of it
function expectPicture(w, h) {
  expect(w, `width of ${w}×${h}`).toBeLessThanOrEqual(1280);
  expect(w, `width of ${w}×${h}`).toBeGreaterThanOrEqual(320);
  expect(Math.abs(w * 9 / 16 - h), `16:9, got ${w}×${h}`).toBeLessThanOrEqual(2);
}

test.describe('direct streaming with a fake Cast SDK', () => {
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
    await startDirect(page);
    // The registered receiver app is the default
    await expect.poll(() => page.evaluate(() => window.__fake && window.__fake.options)).toEqual({ receiverApplicationId: 'B72055BC', autoJoinPolicy: 'origin_scoped' });
    await expect(page.locator('#status')).toContainText('Live auf Wohnzimmer', { timeout: 20000 });
    await expect(page.locator('.controls [data-music]')).toHaveAttribute('aria-pressed', 'true');   // music starts with the stream
    await expect(page.getByRole('button', { name: 'Streaming beenden' })).toBeVisible();

    // The TV plays the 16:9 picture with an audio track. The app sends 1280×720; on a busy computer WebRTC
    // itself sends a smaller picture to keep it smooth (960×540, 640×360 …) – never a larger or distorted one.
    await expect.poll(() => tv.evaluate(() => document.getElementById('video').videoWidth), { timeout: 20000 }).toBeGreaterThan(0);
    const rx = await tv.evaluate(() => {
      const v = document.getElementById('video');
      return { w: v.videoWidth, h: v.videoHeight, audio: v.srcObject.getAudioTracks().length, video: v.srcObject.getVideoTracks().length, idle: document.getElementById('idle').hidden };
    });
    expect(rx).toMatchObject({ audio: 1, video: 1, idle: true });
    expectPicture(rx.w, rx.h);
    // What goes into the stream is the full 1280×720 canvas
    expect(await page.evaluate(() => { const c = document.getElementById('view'); return [c.width, c.height]; })).toEqual([1280, 720]);
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
    await expect(page.locator('#status')).toContainText(/\d+×\d+/, { timeout: 10000 });
    const sent = (await page.locator('#status').textContent()).match(/(\d+)×(\d+)/);
    expectPicture(Number(sent[1]), Number(sent[2]));
    expect(await page.evaluate(() => Tools.diag.text())).toContain('"state":"streaming"');

    // Stop: the TV is told (bye), the receiver goes back to idle
    await page.getByRole('button', { name: 'Streaming beenden' }).click();
    await expect(page.getByRole('button', { name: 'Auf Fernseher zeigen' })).toBeVisible();
    await expect(tv.locator('#idle')).toBeVisible();
    await expect.poll(() => tv.evaluate(() => window.__rx.stopped)).toBe(true);
    expect(await page.evaluate(() => window.__fake.sent)).toEqual(['offer', 'bye']);
    expect(tvErrors).toEqual([]);
  });

  test('own app ID is used', async ({ page, context }) => {
    await context.route(SENDER_SDK, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_SENDER }));
    await page.addInitScript(() => { window.__fakeCancel = true; localStorage.setItem('cast-demo.settings.v1', JSON.stringify({ appId: '1A2B3C4D' })); });
    await page.goto('/cast-demo/');
    await startDirect(page);
    await expect.poll(() => page.evaluate(() => window.__fake && window.__fake.options && window.__fake.options.receiverApplicationId)).toBe('1A2B3C4D');
  });

  test('cancelling the TV choice is quiet', async ({ page, context }) => {
    await context.route(SENDER_SDK, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_SENDER }));
    await page.addInitScript(() => { window.__fakeCancel = true; });
    await page.goto('/cast-demo/');
    await startDirect(page);
    await expect.poll(() => page.evaluate(() => window.CastStream.info().sdk)).toBe('ready');
    await expect(page.locator('#status')).toHaveText('Tipp: In Chrome über ⋮ → Streamen den Tab übertragen, dann Vollbild.');
    await expect(page.getByRole('button', { name: 'Auf Fernseher zeigen' })).toBeVisible();
  });

  test('no answer from the TV: clear error', async ({ page, context }) => {
    test.setTimeout(40000);
    await context.route(SENDER_SDK, r => r.fulfill({ contentType: 'text/javascript', body: FAKE_SENDER }));
    await page.goto('/cast-demo/');
    await startDirect(page);
    await expect(page.locator('#status')).toContainText('Der Fernseher antwortet nicht', { timeout: 30000 });
  });
});
