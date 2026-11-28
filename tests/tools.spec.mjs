// Small shared helpers in assets/common.js: random numbers, ids, clamp, reduced motion, sharing and
// downloading files, keeping the screen on (Tools.wakeLock). Tested on the template page.
import { test, expect } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await page.goto('/template/'); });

test('randomInt: whole numbers 0 … n-1, every value comes up, uses crypto', async ({ page }) => {
  const r = await page.evaluate(() => {
    const seen = new Array(6).fill(0);
    for (let i = 0; i < 6000; i++) seen[Tools.randomInt(6)]++;
    // A fixed source of randomness gives fixed results (tests can pin the random numbers this way)
    const orig = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = a => { a[0] = 0xFFFFFFFF; return a; };   // above the limit for n = 6 → retried
    let calls = 0;
    crypto.getRandomValues = a => { a[0] = calls++ ? 7 : 0xFFFFFFFF; return a; };
    const pinned = Tools.randomInt(6);
    crypto.getRandomValues = a => { a[0] = 0x80000000; return a; };
    const half = Tools.random();
    crypto.getRandomValues = orig;
    return { seen, pinned, calls, half, one: Tools.randomInt(1) };
  });
  for (const n of r.seen) expect(n).toBeGreaterThan(800);           // 1000 expected each
  expect(r.seen.reduce((a, b) => a + b)).toBe(6000);
  expect(r.pinned).toBe(7 % 6);                                       // the biased top value was thrown away
  expect(r.calls).toBe(2);
  expect(r.half).toBe(0.5);
  expect(r.one).toBe(0);
});

test('uid: prefix, unique, sorts by creation; clamp; reducedMotion', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const a = Tools.uid('r');
    await new Promise(res => setTimeout(res, 5));
    const ids = Array.from({ length: 500 }, () => Tools.uid());
    return { a, b: ids[0], unique: new Set(ids).size, clamp: [Tools.clamp(5, 0, 3), Tools.clamp(-1, 0, 3), Tools.clamp(2, 0, 3)], reduced: Tools.reducedMotion() };
  });
  expect(r.a).toMatch(/^r[0-9a-z]{14,}$/);
  expect(r.b > r.a.slice(1)).toBe(true);
  expect(r.unique).toBe(500);
  expect(r.clamp).toEqual([3, 0, 2]);
  expect(r.reduced).toBe(false);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.evaluate(() => Tools.reducedMotion())).toBe(true);
});

test('canShareFile asks navigator.canShare once per kind of file; download saves under the file name', async ({ page }) => {
  const r = await page.evaluate(() => {
    let asked = 0;
    navigator.canShare = d => { asked++; return d.files[0].type === 'application/pdf'; };
    return { pdf: Tools.canShareFile('x.pdf', 'application/pdf'), again: Tools.canShareFile('x.pdf', 'application/pdf'), png: Tools.canShareFile('x.png', 'image/png'), asked };
  });
  expect(r).toEqual({ pdf: true, again: true, png: false, asked: 2 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.evaluate(() => Tools.download(new File(['hallo'], 'notiz-1.txt', { type: 'text/plain' }))),
  ]);
  expect(download.suggestedFilename()).toBe('notiz-1.txt');
});

test('canvasBlob: PNG/JPEG with the pixels and the real type, OffscreenCanvas, empty canvas; never waits for idle time', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 20;
    const g = c.getContext('2d'); g.fillStyle = '#ff0000'; g.fillRect(0, 0, 20, 20); g.fillStyle = '#0000ff'; g.fillRect(20, 0, 20, 20);
    // pixels of a Blob read back (independent of the encoder)
    const pixels = async b => { const bm = await createImageBitmap(b), k = document.createElement('canvas'); k.width = bm.width; k.height = bm.height;
      const x = k.getContext('2d'); x.drawImage(bm, 0, 0); return { w: bm.width, h: bm.height, left: [...x.getImageData(Math.floor(bm.width / 8), bm.height >> 1, 1, 1).data], right: [...x.getImageData(Math.floor(bm.width * 7 / 8), bm.height >> 1, 1, 1).data] }; };
    const png = await Tools.canvasBlob(c);
    const jpg = await Tools.canvasBlob(c, 'image/jpeg', 0.9);
    const head = async (b, n) => [...new Uint8Array(await b.slice(0, n).arrayBuffer())];
    const oc = new OffscreenCanvas(10, 10); const og = oc.getContext('2d'); og.fillStyle = '#00ff00'; og.fillRect(0, 0, 10, 10);
    const off = await Tools.canvasBlob(oc);
    const empty = document.createElement('canvas'); empty.width = 0;
    // a browser that cannot write a type answers with PNG – the Blob says so (like toBlob)
    const unknown = await Tools.canvasBlob(c, 'image/x-unknown');
    // a busy page: a long task right after the call does not delay the picture beyond that task
    const t0 = performance.now(); const p = Tools.canvasBlob(c); const end = performance.now() + 300; while (performance.now() < end) { /* busy */ }
    await p; const busyMs = performance.now() - t0;
    return { png: { type: png.type, head: await head(png, 4), px: await pixels(png) }, jpg: { type: jpg.type, head: await head(jpg, 3), px: await pixels(jpg) },
      off: { type: off.type, px: await pixels(off) }, empty: await Tools.canvasBlob(empty), unknown: unknown.type, busyMs };
  });
  expect(r.png.type).toBe('image/png');
  expect(r.png.head).toEqual([0x89, 0x50, 0x4e, 0x47]);                 // PNG signature
  expect(r.png.px).toEqual({ w: 40, h: 20, left: [255, 0, 0, 255], right: [0, 0, 255, 255] });
  expect(r.jpg.type).toBe('image/jpeg');
  expect(r.jpg.head).toEqual([0xff, 0xd8, 0xff]);                       // JPEG start
  expect(r.jpg.px.w).toBe(40);
  expect(r.jpg.px.left[0]).toBeGreaterThan(240); expect(r.jpg.px.left[2]).toBeLessThan(20);
  expect(r.off).toEqual({ type: 'image/png', px: { w: 10, h: 10, left: [0, 255, 0, 255], right: [0, 255, 0, 255] } });
  expect(r.empty).toBeNull();
  expect(r.unknown).toBe('image/png');
  expect(r.busyMs).toBeLessThan(1500);
});

test('undoKeys: Ctrl/⌘+Z undoes, Ctrl/⌘+Shift+Z and Ctrl+Y redo – only enabled, shown buttons; not in text fields or dialogs', async ({ page }) => {
  await page.evaluate(() => {
    window.__n = { undo: 0, redo: 0 };
    document.body.insertAdjacentHTML('beforeend', '<button id="u">U</button><button id="r">R</button><input id="f"><dialog id="d"><p>x</p></dialog>');
    document.getElementById('u').addEventListener('click', () => window.__n.undo++);
    document.getElementById('r').addEventListener('click', () => window.__n.redo++);
    Tools.undoKeys({ undo: document.getElementById('u'), redo: document.getElementById('r') });
  });
  const n = () => page.evaluate(() => ({ ...window.__n }));
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Meta+z');
  await page.keyboard.press('Control+Shift+Z');
  await page.keyboard.press('Meta+Shift+Z');
  await page.keyboard.press('Control+y');
  expect(await n()).toEqual({ undo: 2, redo: 3 });
  // a disabled or hidden button is not clicked
  await page.evaluate(() => { document.getElementById('u').disabled = true; document.getElementById('r').hidden = true; });
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+y');
  expect(await n()).toEqual({ undo: 2, redo: 3 });
  await page.evaluate(() => { document.getElementById('u').disabled = false; });
  // text fields keep their own undo, an open dialog takes the keys
  await page.locator('#f').focus();
  await page.keyboard.press('Control+z');
  await page.evaluate(() => { document.activeElement.blur(); document.getElementById('d').showModal(); });
  await page.keyboard.press('Control+z');
  await page.evaluate(() => document.getElementById('d').close());
  expect(await n()).toEqual({ undo: 2, redo: 3 });
  // plain z, Alt+Ctrl+Z: nothing
  await page.keyboard.press('z');
  await page.keyboard.press('Control+Alt+z');
  expect(await n()).toEqual({ undo: 2, redo: 3 });
  await expect(page.locator('#u')).toHaveAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
  await expect(page.locator('#r')).toHaveAttribute('aria-keyshortcuts', 'Control+Shift+Z Meta+Shift+Z Control+Y');
});

test.describe('wakeLock', () => {
  test.beforeEach(async ({ page }) => {
    // Stand-in for the Screen Wake Lock API: counts requests, the page can drop the lock like a browser does
    await page.addInitScript(() => {
      window.__wake = { requests: 0, held: 0, sentinels: [] };
      Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
        window.__wake.requests++; window.__wake.held++;
        const s = new EventTarget();
        s.released = false;
        s.release = async () => { if (!s.released) { s.released = true; window.__wake.held--; s.dispatchEvent(new Event('release')); } };
        window.__wake.sentinels.push(s);
        return s;
      } } });
    });
    await page.goto('/template/');
  });

  test('held while any reason holds it, released after the last one; one lock for several reasons', async ({ page }) => {
    await page.evaluate(async () => { await Tools.wakeLock.hold('game'); await Tools.wakeLock.hold('music'); });
    expect(await page.evaluate(() => [window.__wake.requests, window.__wake.held, Tools.wakeLock.active()])).toEqual([1, 1, true]);
    await page.evaluate(() => Tools.wakeLock.release('game'));
    expect(await page.evaluate(() => [window.__wake.held, Tools.wakeLock.active(), Tools.wakeLock.reasons()])).toEqual([1, true, ['music']]);
    await page.evaluate(() => Tools.wakeLock.release('music'));
    expect(await page.evaluate(() => [window.__wake.held, Tools.wakeLock.active()])).toEqual([0, false]);
    expect(await page.evaluate(() => Tools.diag.text())).toMatch(/wake lock on game\n[\s\S]*wake lock off/);
  });

  test('asked for again when the page becomes visible after the browser dropped it', async ({ page }) => {
    await page.evaluate(() => Tools.wakeLock.hold());
    await page.evaluate(() => window.__wake.sentinels[0].release());          // tab hidden: the browser releases
    expect(await page.evaluate(() => Tools.wakeLock.active())).toBe(false);
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => page.evaluate(() => [window.__wake.requests, Tools.wakeLock.active()])).toEqual([2, true]);
    expect(await page.evaluate(() => Tools.diag.text())).toContain('wake lock: {"held":true,"reasons":["app"],"supported":true}');
  });

  test('released before the request finished: no lock is kept', async ({ page }) => {
    await page.evaluate(async () => { const p = Tools.wakeLock.hold('x'); Tools.wakeLock.release('x'); await p; });
    expect(await page.evaluate(() => [window.__wake.requests, window.__wake.held, Tools.wakeLock.active()])).toEqual([1, 0, false]);
  });
});

test('without the Wake Lock API nothing breaks', async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.wakeLock; });
  await page.goto('/template/');
  expect(await page.evaluate(async () => { await Tools.wakeLock.hold(); return [Tools.wakeLock.supported(), Tools.wakeLock.active()]; })).toEqual([false, false]);
});

test.describe('audio', () => {
  test.beforeEach(async ({ page }) => {
    // Stand-in for Web Audio: starts suspended like a browser before the first tap, records every tone
    await page.addInitScript(() => {
      window.__audio = { created: 0, tones: [] };
      const param = () => ({ events: [], setValueAtTime(v, t) { this.events.push(['set', v, t]); }, exponentialRampToValueAtTime(v, t) { this.events.push(['ramp', v, t]); } });
      window.AudioContext = class {
        constructor() { __audio.created++; this.state = 'suspended'; this.currentTime = 10; this.sampleRate = 48000; this.destination = {}; }
        resume() { this.state = 'running'; return Promise.resolve(); }
        createGain() { return { gain: param(), connect() {} }; }
        createOscillator() {
          const o = { type: 'sine', frequency: param(), connect() {}, start(t) { o.at = t; __audio.tones.push(o); }, stop(t) { o.end = t; } };
          return o;
        }
      };
    });
    await page.goto('/template/');
  });

  test('silent until unlocked in a tap; one context; tones with glide, delay and length', async ({ page }) => {
    const r = await page.evaluate(async () => {
      Tools.audio.tone({ freq: 440 });                            // no context yet: nothing, no context created
      const before = [__audio.created, Tools.audio.ready()];
      Tools.audio.unlock(); Tools.audio.unlock();
      await Promise.resolve();
      Tools.audio.tone({ freq: 300, to: 900, ms: 100, type: 'triangle', vol: 0.5, at: 0.2 });
      const o = __audio.tones[0];
      return { before, created: __audio.created, ready: Tools.audio.ready(), n: __audio.tones.length,
        type: o.type, freq: o.frequency.events.map(([k, v, t]) => [k, v, Math.round(t * 1000) / 1000]), at: o.at, end: o.end, same: Tools.audio.context() === Tools.audio.context() };
    });
    expect(r.before).toEqual([0, false]);
    expect(r.created).toBe(1);
    expect(r.same).toBe(true);
    expect(r.ready).toBe(true);
    expect(r.n).toBe(1);
    expect(r.type).toBe('triangle');
    expect(r.freq).toEqual([['set', 300, 10.2], ['ramp', 900, 10.3]]);  // currentTime 10 + 0.2 s, 100 ms long
    expect(r.at).toBeCloseTo(10.2);
    expect(r.end).toBeCloseTo(10.32);
    expect(await page.evaluate(() => Tools.diag.text())).toMatch(/^audio: \{"state":"running","rate":48000\}$/m);
  });
});

test('Tools.vibrate: every vibration at least 30 ms, pauses and 0 unchanged; without support false', async ({ page }) => {
  await page.evaluate(() => {
    window.__vib = [];
    Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: p => { window.__vib.push(p); return window.__ok !== false; } });
  });
  expect(await page.evaluate(() => [Tools.vibrate(8), Tools.vibrate(200), Tools.vibrate([10, 20, 15]), Tools.vibrate(0), Tools.vibrate(-5)])).toEqual([true, true, true, true, true]);
  expect(await page.evaluate(() => window.__vib)).toEqual([30, 200, [30, 20, 30], 0, 0]);
  // { min: 0 }: exactly as given (vibration test in the sensors)
  await page.evaluate(() => { window.__vib = []; Tools.vibrate(5, { min: 0 }); Tools.vibrate([10, 20, 15], { min: 0 }); });
  expect(await page.evaluate(() => window.__vib)).toEqual([5, [10, 20, 15]]);
  // Refused (no tap on the page yet): false, noted once in the diagnostics
  expect(await page.evaluate(() => { window.__ok = false; return [Tools.vibrate(50), Tools.vibrate(50)]; })).toEqual([false, false]);
  expect((await page.evaluate(() => Tools.diag.text())).match(/vibrate: refused/g)).toHaveLength(1);
  // No API (iPhone/Safari)
  expect(await page.evaluate(() => { delete Navigator.prototype.vibrate; return Tools.vibrate(50); })).toBe(false);
});
