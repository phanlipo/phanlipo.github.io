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
    let p = perm;
    class FakeNotification {
      constructor(title, opts) { window.__notes.push({ title, ...opts, via: 'page' }); }
      static get permission() { return p; }
      static requestPermission() { window.__asked++; if (p === 'default') p = 'granted'; return Promise.resolve(p); }
    }
    window.Notification = FakeNotification;
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
async function add(page, text, at) {
  await page.fill('#text', text);
  await page.fill('#at', at);
  await page.click('#btnSave');
}

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

test('without permission: asks once on saving, blocked reminders still show in the app', async ({ page }) => {
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
  await expect(page.locator('#btnPerm')).toBeVisible();
  await expect(page.locator('#btnTest')).toBeHidden();
  await page.click('#btnPerm');
  await expect(page.locator('#permText')).toContainText('erlaubt');
  await expect(page.locator('#btnPerm')).toBeHidden();
  await page.click('#btnTest');
  await expect.poll(async () => (await notes(page)).map(n => n.title)).toEqual(['Test-Benachrichtigung']);
  expect(await page.evaluate(() => window.__asked)).toBe(1);
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
