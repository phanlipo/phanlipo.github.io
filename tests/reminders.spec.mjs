// Erinnerungen: create, fire on time (notification via the service worker), late after the app was closed,
// edit and schedule again from the history, validation, permission states, English.
// Time is controlled with Playwright's clock; notifications are recorded by a stand-in Notification API.
import { test, expect } from './helpers.mjs';

const KEY = 'reminders.list.v1';
const START = new Date('2026-10-29T12:00:00+01:00'); // = 12:00 in Europe/Berlin (winter time)
test.use({ timezoneId: 'Europe/Berlin' });

/** Stand-in Notification API with a fixed permission; records every notification */
async function fakeNotifications(page, permission = 'granted') {
  await page.addInitScript(perm => {
    window.__notes = [];
    window.__asked = 0;
    if (perm === 'unsupported') { delete window.Notification; return; }
    let p = perm;
    class FakeNotification {
      constructor(title, opts) { window.__notes.push({ title, ...opts, via: 'page' }); }
      static get permission() { return p === 'dismiss' || p === 'timeout' ? 'default' : p; }
      // 'dismiss': answered at once without a prompt (Chrome's block after ignored prompts), stays 'default'
      // 'timeout': the prompt is shown and expires after 5 s without a decision (Chrome 155+ on Android), stays 'default'
      static requestPermission() {
        window.__asked++;
        if (p === 'default') p = 'granted';
        if (p === 'timeout') return new Promise(r => setTimeout(() => r('default'), 5000));
        return Promise.resolve(p === 'dismiss' ? 'default' : p);
      }
    }
    window.Notification = FakeNotification;
    // Push subscription (used to ask on Android): asks like the browser, then the page cancels it
    window.__push = 0; window.__unsub = 0;
    PushManager.prototype.subscribe = function () {
      window.__push++;
      return FakeNotification.requestPermission().then(r => r === 'granted'
        ? { unsubscribe: () => { window.__unsub++; return Promise.resolve(true); } }
        : Promise.reject(new DOMException('Registration failed - permission denied', 'NotAllowedError')));
    };
    ServiceWorkerRegistration.prototype.showNotification = function (title, opts) {
      window.__notes.push({ title, ...opts, via: 'sw' });
      return Promise.resolve();
    };
  }, permission);
}
const notes = page => page.evaluate(() => window.__notes);
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), KEY);

async function open(page, permission) {
  await page.clock.install({ time: START });
  await fakeNotifications(page, permission);
  await page.goto('/reminders/');
}
async function add(page, text, at, repeat) {
  await page.fill('#text', text);
  await page.fill('#at', at);
  if (repeat) await page.selectOption('#repeat', repeat);
  await page.click('#btnSave');
}
const at = s => new Date(s).getTime();

test('reminder fires at its time, not before, and moves to the history', async ({ page }) => {
  await open(page);
  await page.fill('#text', 'Tabletten nehmen');
  await page.click('[data-quick="10"]');
  await expect(page.locator('#at')).toHaveValue('2026-10-29T12:10');
  await page.click('#btnSave');
  await expect(page.locator('#formMsg')).toContainText('gespeichert');
  await expect(page.locator('#text')).toHaveValue('');
  await expect(page.locator('#upList li')).toHaveCount(1);
  await expect(page.locator('#upList li')).toContainText('Tabletten nehmen');
  await expect(page.locator('#upList .rel')).toContainText('in 10 Minuten');

  await page.clock.runFor(9 * 60e3 + 50e3);
  expect(await notes(page)).toEqual([]);
  await page.clock.runFor(15e3);
  await expect.poll(() => notes(page)).toHaveLength(1);
  const [n] = await notes(page);
  expect(n).toMatchObject({ title: 'Tabletten nehmen', tag: expect.stringMatching(/^reminder-/), requireInteraction: true });
  expect(n.body).toContain('12:10');

  await expect(page.locator('#due')).toBeVisible();
  await expect(page.locator('#dueList')).toContainText('Tabletten nehmen');
  await expect(page.locator('#upList li')).toHaveCount(0);
  await expect(page.locator('#pastList li')).toHaveCount(1);
  await expect(page.locator('#pastList li')).toContainText('benachrichtigt');
  await page.click('#btnDueOk');
  await expect(page.locator('#due')).toBeHidden();

  // Fired once only – also after reloading
  await page.reload();
  await page.clock.runFor(120e3);
  expect(await page.evaluate(() => window.__notes.length)).toBe(0);
  await expect(page.locator('#pastList li')).toHaveCount(1);
  const [r] = await stored(page);
  expect(r).toMatchObject({ text: 'Tabletten nehmen', at: START.getTime() + 10 * 60e3, shown: true });
  expect(r.fired).toBeGreaterThanOrEqual(r.at);
});

test('several reminders fire in order; quick buttons', async ({ page }) => {
  await open(page);
  await add(page, 'Zweite', '2026-10-29T12:05');
  await add(page, 'Erste', '2026-10-29T12:02');
  await expect(page.locator('#upList li .text')).toHaveText(['Erste', 'Zweite']);
  await expect(page.locator('#upCount')).toHaveText('2');
  await page.click('[data-quick="60"]');
  await expect(page.locator('#at')).toHaveValue('2026-10-29T13:00');
  await page.click('[data-quick="tomorrow"]');
  await expect(page.locator('#at')).toHaveValue('2026-10-30T09:00');

  await page.clock.runFor(3 * 60e3);
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Erste']);
  await page.clock.runFor(3 * 60e3);
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Erste', 'Zweite']);
  await expect(page.locator('#pastList li .text')).toHaveText(['Zweite', 'Erste']);
});

test('invalid input is rejected and nothing is saved', async ({ page }) => {
  await open(page);
  await add(page, '   ', '2026-10-29T13:00');
  await expect(page.locator('#formMsg')).toHaveText('Bitte einen Text eingeben.');
  await add(page, 'Ohne Zeit', '');
  await expect(page.locator('#formMsg')).toHaveText('Bitte einen Zeitpunkt wählen.');
  await add(page, 'Vorbei', '2026-10-29T11:59');
  await expect(page.locator('#formMsg')).toHaveText('Der Zeitpunkt liegt in der Vergangenheit.');
  await expect(page.locator('#formMsg')).toHaveClass(/err/);
  expect(await stored(page)).toEqual([]);
  await expect(page.locator('#upEmpty')).toBeVisible();
});

test('edit a scheduled reminder: new text and time, the old time does not fire', async ({ page }) => {
  await open(page);
  await add(page, 'Müll rausbringen', '2026-10-29T12:05');
  await page.click('#upList [data-act="edit"]');
  await expect(page.locator('#h-form')).toHaveText('Erinnerung bearbeiten');
  await expect(page.locator('#text')).toHaveValue('Müll rausbringen');
  await expect(page.locator('#at')).toHaveValue('2026-10-29T12:05');
  await expect(page.locator('#upList li.editing')).toHaveCount(1);
  await page.fill('#text', 'Altpapier rausbringen');
  await page.fill('#at', '2026-10-29T12:20');
  await page.click('#btnSave');
  await expect(page.locator('#formMsg')).toContainText('geändert');
  await expect(page.locator('#h-form')).toHaveText('Neue Erinnerung');
  await expect(page.locator('#upList li')).toHaveCount(1);
  expect(await stored(page)).toHaveLength(1);

  await page.clock.runFor(10 * 60e3);
  expect(await notes(page)).toEqual([]);
  await page.clock.runFor(11 * 60e3);
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Altpapier rausbringen']);
});

test('cancel editing keeps the reminder unchanged', async ({ page }) => {
  await open(page);
  await add(page, 'Anrufen', '2026-10-29T15:00');
  await page.click('#upList [data-act="edit"]');
  await page.fill('#text', 'Etwas anderes');
  await page.click('#btnCancel');
  await expect(page.locator('#btnCancel')).toBeHidden();
  await expect(page.locator('#text')).toHaveValue('');
  expect((await stored(page))[0].text).toBe('Anrufen');
});

test('schedule again from the history: next day at the same time, then it fires again', async ({ page }) => {
  await open(page);
  await add(page, 'Blumen gießen', '2026-10-29T12:01');
  await page.clock.runFor(2 * 60e3);
  await expect(page.locator('#pastList li')).toHaveCount(1);
  await page.click('#pastList [data-act="edit"]');
  await expect(page.locator('#btnSave')).toHaveText('Änderungen speichern');
  await expect(page.locator('#at')).toHaveValue('2026-10-30T12:01');
  await page.fill('#at', '2026-10-29T12:30');
  await page.click('#btnSave');
  await expect(page.locator('#pastList li')).toHaveCount(0);
  await expect(page.locator('#upList li')).toHaveCount(1);
  const [r] = await stored(page);
  expect(r.fired).toBe(0);
  await page.clock.runFor(30 * 60e3);
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Blumen gießen', 'Blumen gießen']);
});

test('reminder that was due while the app was closed comes when it opens, marked late', async ({ page }) => {
  await open(page);
  await page.evaluate(([k, at]) => localStorage.setItem(k, JSON.stringify([
    { id: 'rold', text: 'Zahnarzt', at, created: at - 864e5, fired: 0 },
    { id: 'rnew', text: 'Später', at: at + 3 * 3600e3, created: at - 864e5, fired: 0 },
  ])), [KEY, START.getTime() - 3600e3]);
  await page.reload();
  await expect.poll(() => notes(page)).toHaveLength(1);
  const [n] = await notes(page);
  expect(n.title).toBe('Zahnarzt');
  expect(n.body).toMatch(/^Fällig war: .*11:00/);
  await expect(page.locator('#pastList li')).toContainText('verspätet');
  await expect(page.locator('#upList li .text')).toHaveText(['Später']);
});

test('blocked: reminders still show in the app', async ({ page }) => {
  await open(page, 'denied');
  await expect(page.locator('#permText')).toContainText('blockiert');
  await expect(page.locator('#btnPerm')).toBeHidden();
  await add(page, 'Nur in der App', '2026-10-29T12:01');
  await page.clock.runFor(2 * 60e3);
  await expect(page.locator('#dueList')).toContainText('Nur in der App');
  expect(await notes(page)).toEqual([]);
  await expect(page.locator('#pastList li')).toContainText('nur in der App');
  expect((await stored(page))[0].shown).toBe(false);
});

test('permission "default": button asks, then the test notification works', async ({ page }) => {
  await open(page, 'default');
  await expect(page.locator('#install')).toBeHidden(); // not Android
  await expect(page.locator('#btnPerm')).toHaveClass(/primary/);
  await expect(page.locator('#btnPerm')).toBeVisible();
  await expect(page.locator('#btnTest')).toBeHidden();
  await page.click('#btnPerm');
  await expect(page.locator('#permText')).toContainText('erlaubt');
  await expect(page.locator('#btnPerm')).toBeHidden();
  await page.click('#btnTest');
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Test-Benachrichtigung']);
  expect(await page.evaluate(() => [window.__asked, window.__push])).toEqual([1, 0]); // no push subscription outside Android
});

test('declined at once without a prompt: explains the block and how to lift it', async ({ page }) => {
  await open(page, 'dismiss');
  await expect(page.locator('#permHint')).toBeHidden();
  await page.click('#btnPerm');
  await expect(page.locator('#permHint')).toBeVisible();
  await expect(page.locator('#permHint')).toContainText('sofort abgelehnt');
  await expect(page.locator('#btnPerm')).toBeVisible();
});

test('prompt expired without a decision: says to look for the banner and tap again', async ({ page }) => {
  await open(page, 'timeout');
  await page.click('#btnPerm');
  await expect(page.locator('#permHint')).toBeHidden();
  await page.clock.runFor(5000);
  await expect(page.locator('#permHint')).toContainText('kleines Banner');
  await expect(page.locator('#btnPerm')).toBeVisible();
});

test('saving a reminder does not ask for permission (unanswered requests count against the site)', async ({ page }) => {
  await open(page, 'default');
  await add(page, 'Ohne Abfrage', '2026-10-29T13:00');
  await expect(page.locator('#upList li')).toHaveCount(1);
  expect(await page.evaluate(() => window.__asked)).toBe(0);
  await expect(page.locator('#btnPerm')).toBeVisible();
});

test('blocked: shows how to allow', async ({ page }) => {
  await open(page, 'denied');
  await expect(page.locator('#permHint')).toContainText('Benachrichtigungen');
});

test('no Notification API at all (in-app browser): hint, reminders still show in the app', async ({ page }) => {
  await open(page, 'unsupported');
  await expect(page.locator('#permText')).toContainText('in Chrome öffnen');
  await expect(page.locator('#btnPerm')).toBeHidden();
  await add(page, 'Trotzdem', '2026-10-29T12:01');
  await page.clock.runFor(2 * 60e3);
  await expect(page.locator('#dueList')).toContainText('Trotzdem');
  await expect(page.locator('#pastList li')).toContainText('nur in der App');
});

test('diagnostics: copied from the help with permission state and the steps, without reminder texts', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page, 'dismiss');
  await add(page, 'Geheimer Termin', '2026-10-29T13:00');
  await page.click('#btnPerm');
  await page.locator('details.help summary').click();
  await page.click('[data-diag="copy"]');
  await expect(page.locator('#toast')).toHaveText('Diagnose kopiert');
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain('Notification.permission: default');
  expect(text).toContain('userAgent: ');
  expect(text).toContain('ask: requestPermission resolved default');
  expect(text).toMatch(/ask: done .*"result":"blocked"/);
  expect(text).toContain('reminders: {"scheduled":1');
  expect(text).not.toContain('Geheimer Termin');
});

test.describe('Android', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36' });
  test('asks through a push subscription and cancels it right away', async ({ page }) => {
    await open(page, 'default');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.click('#btnPerm');
    await expect(page.locator('#permText')).toContainText('erlaubt');
    expect(await page.evaluate(() => [window.__push, window.__unsub, window.__asked])).toEqual([1, 1, 1]);
    await page.click('#btnTest');
    await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Test-Benachrichtigung']);
  });
  test('tapped while the service worker is still installing: waits for it, then asks', async ({ page }) => {
    // Service worker becomes ready only 1 s after the tap (first visit, or site data just cleared)
    await page.addInitScript(() => {
      const desc = Object.getOwnPropertyDescriptor(ServiceWorkerContainer.prototype, 'ready');
      Object.defineProperty(ServiceWorkerContainer.prototype, 'ready', { configurable: true,
        get() { const ready = desc.get.call(this); return new Promise(r => setTimeout(() => r(ready), 1000)); } });
    });
    await open(page, 'default');
    await page.click('#btnPerm');
    await expect(page.locator('#permText')).not.toContainText('erlaubt');
    await page.clock.runFor(1000);
    await expect(page.locator('#permText')).toContainText('erlaubt');
    expect(await page.evaluate(() => [window.__push, window.__unsub])).toEqual([1, 1]);
  });
  test('push subscription declined at once: hint about the block', async ({ page }) => {
    await open(page, 'dismiss');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.click('#btnPerm');
    await expect(page.locator('#permHint')).toContainText('sofort abgelehnt');
    expect(await page.evaluate(() => [window.__push, window.__unsub])).toEqual([1, 0]);
  });
  test('diagnostics log the push steps', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await open(page, 'default');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.click('#btnPerm');
    await page.locator('details.help summary').click();
    await page.click('[data-diag="copy"]');
    await expect(page.locator('#toast')).toHaveText('Diagnose kopiert');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('push: subscribe …');
    expect(text).toContain('push: unsubscribed');
    expect(text).toMatch(/ask: done .*"permission":"granted"/);
  });
  test('in a Chrome tab: suggests installing, with Chrome’s install prompt when offered', async ({ page }) => {
    await open(page, 'default');
    await expect(page.locator('#install')).toBeVisible();
    await expect(page.locator('#btnInstall')).toBeHidden();
    await expect(page.locator('#installInfo')).toContainText('⋮ → „App installieren“');
    await expect(page.locator('#btnPerm')).not.toHaveClass(/primary/);
    // Chrome offers installing: the button appears and opens its prompt
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__installPrompt = (window.__installPrompt || 0) + 1; return Promise.resolve(); };
      e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(e);
    });
    await expect(page.locator('#btnInstall')).toBeVisible();
    await expect(page.locator('#installInfo')).toHaveText('');
    await page.click('#btnInstall');
    await expect(page.locator('#installInfo')).toContainText('vom Startbildschirm öffnen');
    expect(await page.evaluate(() => window.__installPrompt)).toBe(1);
    await expect(page.locator('#btnInstall')).toBeHidden();
  });
  test('installed app: no install box, allowing is the main button', async ({ page }) => {
    await page.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = q => q === '(display-mode: standalone)' ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q);
    });
    await open(page, 'default');
    await expect(page.locator('#install')).toBeHidden();
    await expect(page.locator('#btnPerm')).toHaveClass(/primary/);
  });
  test('already allowed in the tab: no install box', async ({ page }) => {
    await open(page, 'granted');
    await expect(page.locator('#install')).toBeHidden();
  });
  test('hints name the Chrome and app settings', async ({ page }) => {
    await open(page, 'dismiss');
    await page.click('#btnPerm');
    await expect(page.locator('#permHint')).toContainText('ⓘ links neben der Adresse → Berechtigungen → „Berechtigungen zurücksetzen“');
  });
  test('blocked: names site and app settings', async ({ page }) => {
    await open(page, 'denied');
    await expect(page.locator('#permHint')).toContainText('ⓘ links neben der Adresse → Berechtigungen → Benachrichtigungen');
    await expect(page.locator('#permHint')).toContainText('App-Info');
  });
});

test('daily: stays scheduled at the next day, every date goes to the history', async ({ page }) => {
  await open(page);
  await add(page, 'Tabletten', '2026-10-29T12:01', 'daily');
  await expect(page.locator('#upList .rel')).toContainText('🔁 täglich');
  await expect(page.locator('#repeat')).toHaveValue('none');
  await page.clock.runFor(2 * 60e3);
  await expect.poll(() => notes(page)).toHaveLength(1);
  await expect(page.locator('#upList li')).toHaveCount(1);
  await expect(page.locator('#pastList li')).toHaveCount(1);
  let list = await stored(page);
  expect(list.find(r => !r.fired)).toMatchObject({ text: 'Tabletten', repeat: 'daily', at: at('2026-10-30T12:01:00+01:00') });
  await page.clock.runFor(24 * 3600e3);
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Tabletten', 'Tabletten']);
  await expect(page.locator('#pastList li')).toHaveCount(2);
  list = await stored(page);
  expect(list.find(r => !r.fired).at).toBe(at('2026-10-31T12:01:00+01:00'));
  expect(list.filter(r => r.fired).map(r => r.at).sort()).toEqual([at('2026-10-29T12:01:00+01:00'), at('2026-10-30T12:01:00+01:00')]);
});

test('daily across the change to winter time keeps the local time of day', async ({ page }) => {
  // Daylight saving time ends on Sunday, 25 October 2026 in Germany: that day has 25 hours
  await page.clock.install({ time: new Date('2026-10-24T11:00:00+02:00') });
  await fakeNotifications(page);
  await page.goto('/reminders/');
  await add(page, 'Gießen', '2026-10-24T12:00', 'daily');
  await page.clock.runFor(61 * 60e3);
  await expect.poll(() => notes(page)).toHaveLength(1);
  expect((await stored(page)).find(r => !r.fired).at).toBe(at('2026-10-25T12:00:00+01:00'));
  await page.clock.runFor(25 * 3600e3);
  await expect.poll(() => notes(page)).toHaveLength(2);
  expect((await stored(page)).find(r => !r.fired).at).toBe(at('2026-10-26T12:00:00+01:00'));
});

test('weekly, app closed for several weeks: one late notification, next date in the future', async ({ page }) => {
  await open(page);
  // Wednesday 14 October, 12:00 – missed on 14, 21 and 28 October
  await page.evaluate(([k, a]) => localStorage.setItem(k, JSON.stringify([
    { id: 'rw', text: 'Gelber Sack', at: a, created: a, fired: 0, repeat: 'weekly' },
  ])), [KEY, at('2026-10-14T12:00:00+02:00')]);
  await page.reload();
  await expect.poll(() => notes(page)).toHaveLength(1);
  expect((await notes(page))[0].body).toContain('Fällig war');
  await expect(page.locator('#upList .rel')).toContainText('🔁 wöchentlich');
  const list = await stored(page);
  expect(list.find(r => !r.fired)).toMatchObject({ id: 'rw', at: at('2026-11-04T12:00:00+01:00') });
  expect(list.filter(r => r.fired)).toHaveLength(1);
});

test('edit a series: shows its repetition, "Nie" ends it', async ({ page }) => {
  await open(page);
  await add(page, 'Sport', '2026-10-29T12:01', 'weekly');
  await page.click('#upList [data-act="edit"]');
  await expect(page.locator('#repeat')).toHaveValue('weekly');
  await page.selectOption('#repeat', 'none');
  await page.click('#btnSave');
  await page.clock.runFor(2 * 60e3);
  await expect.poll(() => notes(page)).toHaveLength(1);
  await expect(page.locator('#upList li')).toHaveCount(0);
  // Scheduling a history entry again starts without repetition
  await page.click('#pastList [data-act="edit"]');
  await expect(page.locator('#repeat')).toHaveValue('none');
});

test('delete a reminder and clear the history', async ({ page }) => {
  await open(page);
  await add(page, 'Weg damit', '2026-10-29T14:00');
  await add(page, 'Bleibt', '2026-10-29T15:00');
  await add(page, 'Gleich', '2026-10-29T12:01');
  await page.clock.runFor(2 * 60e3);
  page.on('dialog', d => d.accept());
  await page.locator('#upList li', { hasText: 'Weg damit' }).locator('[data-act="del"]').click();
  await expect(page.locator('#upList li .text')).toHaveText(['Bleibt']);
  await page.click('#btnClearPast');
  await expect(page.locator('#pastList li')).toHaveCount(0);
  expect((await stored(page)).map(r => r.text)).toEqual(['Bleibt']);
});

test('reminders from another tab are scheduled too', async ({ page, context }) => {
  await open(page);
  const other = await context.newPage();
  await other.goto('/reminders/');
  await add(other, 'Aus dem anderen Tab', '2026-10-29T12:03');
  await other.close();
  await expect(page.locator('#upList li .text')).toHaveText(['Aus dem anderen Tab']);
  await page.clock.runFor(4 * 60e3);
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Aus dem anderen Tab']);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });

  test('texts, date format and messages in English', async ({ page }) => {
    await open(page);
    await expect(page.locator('h1')).toHaveText('Reminders');
    await add(page, 'Call mum', '2026-10-29T18:45');
    await expect(page.locator('#formMsg')).toContainText('Reminder saved for');
    await expect(page.locator('#upList .when')).toContainText('18:45');
    await expect(page.locator('#upList .rel')).toContainText('in 7 hours');
    await expect(page.locator('#upList [data-act="edit"]')).toHaveText('Edit');
    await page.click('#upList [data-act="edit"]');
    await expect(page.locator('#h-form')).toHaveText('Edit reminder');
    // Switching the language while editing keeps the edit state
    await page.click('[data-set-lang="de"]');
    await expect(page.locator('#h-form')).toHaveText('Erinnerung bearbeiten');
    await expect(page.locator('#btnSave')).toHaveText('Änderungen speichern');
  });
});
