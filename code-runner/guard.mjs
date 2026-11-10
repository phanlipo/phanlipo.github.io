// Lockdown for the workers that run the user's code (Code ausführen).
// Code typed or pasted into the app must not reach the network or the storage that all apps of this
// site share (Cache Storage with opened files, IndexedDB). Everything that could is removed from the
// worker's global scope and its prototype chain before the first line of user code runs.
// Not a complete sandbox: `import('https://…')` cannot be switched off from inside a worker – the help says so.
//
// lockdown({ allow }) – `allow`: URL prefix fetch() may still load (the Python engine's own files), or none.
// Returns a function that sends output to the page (the original postMessage).

const NETWORK = ['XMLHttpRequest', 'WebSocket', 'WebSocketStream', 'EventSource', 'WebTransport', 'RTCPeerConnection',
  'importScripts', 'Worker', 'SharedWorker', 'BroadcastChannel'];
const STORAGE = ['caches', 'indexedDB', 'CacheStorage', 'Cache', 'IDBFactory', 'cookieStore'];
const NAVIGATOR = ['sendBeacon', 'serviceWorker', 'storage', 'locks', 'usb', 'hid', 'serial', 'bluetooth'];

function removeEverywhere(start, name) {
  for (let o = start; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
    if (!Object.prototype.hasOwnProperty.call(o, name)) continue;
    try { delete o[name]; } catch { /* not configurable */ }
    if (Object.prototype.hasOwnProperty.call(o, name)) {
      try { Object.defineProperty(o, name, { value: undefined, writable: false, configurable: false }); } catch { /* keep going */ }
    }
  }
}

export function lockdown({ allow } = {}) {
  const post = self.postMessage.bind(self);
  const ownFetch = self.fetch.bind(self);
  const blocked = what => new TypeError(`${what} is blocked: code in this app runs without network access`);
  const guarded = (input, init) => {
    let url = '';
    try { url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url, self.location.href).href; } catch { /* invalid */ }
    if (allow && url.startsWith(allow)) return ownFetch(input, init);
    return Promise.reject(blocked('fetch'));
  };
  removeEverywhere(self, 'fetch');
  Object.defineProperty(self, 'fetch', { value: guarded, writable: false, configurable: false });
  for (const name of [...NETWORK, ...STORAGE]) removeEverywhere(self, name);
  if (self.navigator) for (const name of NAVIGATOR) removeEverywhere(self.navigator, name);
  return post;
}

// Output goes to the page in batches: a script that prints in an endless loop must neither flood the page
// with messages nor fill the memory. After LIMIT characters per run the rest is dropped (the page says so).
export const LIMIT = 1000000;
export function outputChannel(post) {
  let parts = [], size = 0, total = 0, last = 0, timer = 0, truncated = false;
  const setT = self.setTimeout.bind(self), clearT = self.clearTimeout.bind(self);
  function flush() {
    clearT(timer); timer = 0; last = Date.now();
    if (!parts.length) return;
    post({ type: 'out', parts });
    parts = []; size = 0;
  }
  function write(s, text) {
    if (!text || truncated) return;
    if (total + text.length > LIMIT) {
      text = text.slice(0, LIMIT - total);
      truncated = true;
    }
    total += text.length;
    const tail = parts[parts.length - 1];
    if (tail && tail.s === s) tail.text += text; else parts.push({ s, text });
    size += text.length;
    if (truncated) { flush(); post({ type: 'truncated' }); return; }
    // Timers do not fire while synchronous code runs – so also flush by the clock
    if (size > 65536 || Date.now() - last > 50) flush();
    else if (!timer) timer = setT(flush, 50);
  }
  return { write, flush, reset() { flush(); total = 0; truncated = false; }, get truncated() { return truncated; } };
}
