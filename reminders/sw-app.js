// Erinnerungen: background check in the service worker (loaded by the generated sw.js via importScripts).
// Periodic Background Sync (Chrome, installed app only): Chrome wakes the service worker now and then – when is up to
// Chrome (site engagement, battery, network; in practice rarely more often than every 12 hours). It is not punctual,
// but it brings reminders that fell due while the phone had ended the app, without opening the app.
//
// The service worker cannot read localStorage. The page therefore mirrors its scheduled reminders into the Cache
// Storage (Tools.keep "schedule", cache "file:reminders"), with title, body and tag already prepared in the
// page's language. What the service worker showed goes to Tools.keep "sw-fired" ({ tag: ms }); on the next start the
// page marks those reminders as notified instead of notifying again. Nothing here goes to the network.
'use strict';
(() => {
  const TAG = 'reminders-check';
  const CACHE = 'file:reminders';
  const LATE_MS = 2 * 60 * 1000; // like the page: "late" after more than 2 minutes
  const url = name => new URL(name, self.location).href;

  async function readJson(cache, name, fallback) {
    try {
      const res = await cache.match(url(name));
      return res ? await res.json() : fallback;
    } catch (_) { return fallback; }
  }

  async function checkDue() {
    // The page itself notifies while it is visible
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some(c => c.visibilityState === 'visible')) return;
    if (!self.Notification || Notification.permission !== 'granted') return;
    const cache = await caches.open(CACHE);
    const schedule = await readJson(cache, 'schedule', null);
    const items = schedule && Array.isArray(schedule.items) ? schedule.items : [];
    const fired = await readJson(cache, 'sw-fired', {});
    const now = Date.now();
    for (const r of items) {
      if (!r || typeof r.tag !== 'string' || !Number.isFinite(r.at) || r.at > now || fired[r.tag]) continue;
      try {
        await self.registration.showNotification(String(r.title), {
          body: String(now - r.at > LATE_MS ? r.lateBody : r.body), tag: r.tag, icon: 'icon-192.png',
          renotify: true, requireInteraction: true, data: { tag: r.tag },
        });
        fired[r.tag] = now;
      } catch (_) {}
    }
    // Only what the page has not taken over yet (it removes notified reminders from the schedule)
    const tags = new Set(items.map(r => r && r.tag));
    for (const k of Object.keys(fired)) if (!tags.has(k)) delete fired[k];
    await cache.put(url('sw-fired'), new Response(JSON.stringify(fired), { headers: { 'Content-Type': 'application/json' } }));
  }

  // For the tests (tests/reminders.spec.mjs): a synthetic periodicsync event cannot use waitUntil
  self.remindersCheck = checkDue;
  self.addEventListener('periodicsync', event => {
    if (event.tag === TAG) event.waitUntil(checkDue().catch(() => {}));
  });
})();
