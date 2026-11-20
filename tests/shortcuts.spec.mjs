// App shortcuts (long press on the installed app's icon, <meta name="tool:shortcuts">) and the number on the
// app icon (Tools.badge). The manifest is checked for every app with shortcuts, every shortcut is opened once;
// what an app does with its own action is checked here too, the badge of an app in its own spec.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, apps, mockBadge, badgeCalls } from './helpers.mjs';
import { ROOT, parseShortcuts } from '../scripts/lib.mjs';

const withShortcuts = apps().map(a => ({ ...a, shortcuts: parseShortcuts(readFileSync(join(ROOT, a.folder, 'index.html'), 'utf8'), a.folder) }))
  .filter(a => a.shortcuts.length);

test('apps with shortcuts are found', () => {
  expect(withShortcuts.map(a => a.folder)).toEqual(expect.arrayContaining(['sensors', 'code-scanner', 'reminders', 'finance-calculator']));
});

for (const app of withShortcuts) {
  test(`${app.folder}: manifest lists the app shortcuts in both languages with a 192 px icon each`, async ({ request }) => {
    const m = await (await request.get(`/${app.folder}/manifest.webmanifest`)).json();
    expect(m.shortcuts).toEqual(app.shortcuts.map(s => ({
      name: s.name, short_name: s.name, name_localized: { en: s.nameEn }, short_name_localized: { en: s.nameEn },
      url: `./?shortcut=${s.action}`, icons: [{ src: `shortcut-${s.action}.png`, sizes: '192x192', type: 'image/png' }],
    })));
    for (const s of app.shortcuts) {
      const res = await request.get(`/${app.folder}/shortcut-${s.action}.png`);
      expect(res.status(), s.action).toBe(200);
      const png = await res.body();
      // PNG header: width and height at bytes 16–23
      expect([png.readUInt32BE(16), png.readUInt32BE(20)], s.action).toEqual([192, 192]);
    }
  });

  test(`${app.folder}: every shortcut opens the app without errors and leaves a clean address`, async ({ page }) => {
    // Shortcuts that start the camera get a refusal instead (no real camera here)
    await page.addInitScript(() => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test', 'NotAllowedError'); };
    });
    for (const s of app.shortcuts) {
      await page.goto(`/${app.folder}/?shortcut=${s.action}`);
      await expect(page.locator('h1')).toBeVisible();
      await expect.poll(() => new URL(page.url()).search, s.action).toBe('');
      // Toolbox apps (assets/shared/toolbox.js): the action is a tool, which is shown
      if (await page.locator('#tabbar').count()) {
        await expect(page.locator(`[role="tab"][data-tab="${s.action}"]`), s.action).toHaveAttribute('aria-selected', 'true');
        await expect(page.locator('#overview')).toBeHidden();
      }
    }
  });
}

test('apps without tool:shortcuts have none in the manifest', async ({ request }) => {
  for (const app of apps().filter(a => !withShortcuts.some(w => w.folder === a.folder))) {
    const m = await (await request.get(`/${app.folder}/manifest.webmanifest`)).json();
    expect(m.shortcuts, app.folder).toBeUndefined();
  }
});

test('the shortcut format is checked', () => {
  const page = c => `<meta name="tool:shortcuts" content="${c}">`;
  expect(parseShortcuts(page('a-1: bell: Neu | New; b: scan: Scannen | Scan'), 'x')).toEqual([
    { action: 'a-1', icon: 'bell', name: 'Neu', nameEn: 'New' }, { action: 'b', icon: 'scan', name: 'Scannen', nameEn: 'Scan' }]);
  expect(parseShortcuts('<meta name="tool:tags" content="Alltag">', 'x')).toEqual([]);
  expect(() => parseShortcuts(page('a: bell: Neu'), 'x')).toThrow(/expected/);
  expect(() => parseShortcuts(page('A: bell: Neu | New'), 'x')).toThrow(/expected/);
  expect(() => parseShortcuts(page('a: bell: Neu | New; a: scan: X | Y'), 'x')).toThrow(/twice/);
  expect(() => parseShortcuts(page('a: b: Ein viel zu langer Kurzbefehl | New'), 'x')).toThrow(/too long/);
  expect(() => parseShortcuts(page(['a', 'b', 'c', 'd', 'e'].map(x => `${x}: bell: N | N`).join('; ')), 'x')).toThrow(/at most 4/);
});

test('Tools.shortcut: the action once per page load, parameter removed, other parameters kept', async ({ page }) => {
  await page.goto('/template/?shortcut=new&x=1#top');
  expect(await page.evaluate(() => [Tools.shortcut(), Tools.shortcut()])).toEqual(['new', 'new']);
  expect(new URL(page.url()).search).toBe('?x=1');
  expect(new URL(page.url()).hash).toBe('#top');
  // A reload does not repeat it
  await page.reload();
  expect(await page.evaluate(() => Tools.shortcut())).toBeNull();
  // Anything but a plain action name is ignored, and removed all the same
  await page.goto('/template/?shortcut=%3Cb%3E');
  expect(await page.evaluate(() => Tools.shortcut())).toBeNull();
  expect(new URL(page.url()).search).toBe('');
  expect(await page.evaluate(() => Tools.diag.text())).toContain('shortcut: invalid');
});

test('Tools.badge: sets and clears the number on the app icon, only when it changes', async ({ page }) => {
  await mockBadge(page);
  await page.goto('/template/');
  expect(await page.evaluate(() => Tools.badge.supported())).toBe(true);
  await page.evaluate(() => { Tools.badge(3); Tools.badge(3); Tools.badge(2.7); Tools.badge(0); Tools.badge(-1); Tools.badge('x'); });
  expect(await badgeCalls(page)).toEqual([3, 2, 0]);
  await expect.poll(() => page.evaluate(() => Tools.diag.text())).toMatch(/badge: 0/);
});

test('Tools.badge: without the API nothing happens', async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.setAppBadge; delete Navigator.prototype.clearAppBadge; });
  await page.goto('/template/');
  expect(await page.evaluate(() => { Tools.badge(5); return Tools.badge.supported(); })).toBe(false);
  expect(await page.evaluate(() => Tools.diag.text())).toMatch(/^badge: no api$/m);
});

test('reminders: shortcut "new" goes straight to the form', async ({ page }) => {
  await page.goto('/reminders/?shortcut=new');
  await expect(page.locator('#text')).toBeFocused();
});

test('code-scanner: shortcut "scan" starts the camera', async ({ page }) => {
  await page.addInitScript(() => {
    window.__cam = 0;
    navigator.mediaDevices.getUserMedia = async () => {
      window.__cam++;
      const cv = document.createElement('canvas'); cv.width = cv.height = 64;
      cv.getContext('2d').fillRect(0, 0, 64, 64);
      return cv.captureStream(10);
    };
  });
  await page.goto('/code-scanner/');
  await page.locator('#srcSeg [data-src="text"]').click(); // last used source: text
  await page.goto('/code-scanner/?shortcut=scan');
  await expect(page.locator('#srcSeg [data-src="camera"]')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__cam)).toBe(1);
  await expect(page.locator('#btnCamLabel')).not.toHaveText('Scannen starten');
});
