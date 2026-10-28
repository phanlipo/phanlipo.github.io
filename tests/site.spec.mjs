// Generic checks that run automatically for every page – a new tool is covered without extra work.
import { test, expect, tools, apps, VIEWPORTS, expectNoHorizontalScroll } from './helpers.mjs';

test('robots.txt allows crawling so search engines can see the noindex tag', async ({ request }) => {
  const txt = await (await request.get('/robots.txt')).text();
  expect(txt).not.toMatch(/^Disallow:\s*\/\s*$/m);
});

test.describe('start page', () => {
  test('is not indexed and has a strict Content Security Policy', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /default-src 'self'/);
  });

  for (const [name, viewport] of Object.entries(VIEWPORTS)) {
    test(`loads cleanly (${name})`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('h1')).toHaveText('Werkzeugkiste');
      await expectNoHorizontalScroll(page);
    });
  }

  test('lists every tool with a working link', async ({ page }) => {
    await page.goto('/');
    const list = tools();
    await expect(page.locator('.tool')).toHaveCount(list.length);
    for (const t of list) {
      const card = page.locator('.tool', { has: page.locator('h2', { hasText: t.title }) });
      await expect(card.locator('a.btn')).toHaveAttribute('href', `${t.folder}/`);
      await expect(card.locator('img')).toHaveAttribute('src', `${t.folder}/icon.svg`);
    }
  });

  test('filters the list by category', async ({ page }) => {
    await page.goto('/');
    const list = tools();
    const all = page.getByRole('button', { name: 'Alle', exact: true });
    await expect(all).toHaveAttribute('aria-pressed', 'true');
    // Every category and feature of every tool has exactly one filter button
    const tags = [...new Set(list.flatMap(t => [...t.tags, ...t.features]))];
    await expect(page.locator('.filter .chip')).toHaveCount(tags.length + 1);
    for (const tag of tags) {
      const chip = page.getByRole('button', { name: tag, exact: true });
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await expect(all).toHaveAttribute('aria-pressed', 'false');
      for (const t of list) {
        const card = page.locator('.tool', { has: page.locator('h2', { hasText: t.title }) });
        await expect(card).toBeVisible({ visible: t.tags.includes(tag) || t.features.includes(tag) });
      }
      await expectNoHorizontalScroll(page);
    }
    // Tapping the active category again shows everything
    const last = page.locator(`.filter .chip[data-tag="${tags.at(-1)}"]`);
    await last.click();
    await expect(page.locator('.tool:visible')).toHaveCount(list.length);
    await expect(all).toHaveAttribute('aria-pressed', 'true');
  });
});

for (const app of apps()) {
  test.describe(app.folder, () => {
    const url = `/${app.folder}/`;

    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      test(`loads cleanly, no horizontal scrolling (${name})`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto(url);
        await expect(page.locator('h1')).toBeVisible();
        await expect(page).toHaveTitle(app.title);
        await expectNoHorizontalScroll(page);
      });
    }

    test('not indexed, strict CSP, footer shows the offline cache version', async ({ page, request }) => {
      await page.goto(url);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      const policy = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      const sw = await (await request.get(`${url}sw.js`)).text();
      const version = sw.match(/const VERSION = '([0-9a-f]+)'/)[1];
      await expect(page.locator('footer .footer-version')).toHaveText(`Version ${version}`);
    });

    test('dark mode has a dark background', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.goto(url);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g).map(Number);
      expect((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, `body background ${bg}`).toBeLessThan(0.3);
    });

    test('help is collapsed, shared footer is present', async ({ page }) => {
      await page.goto(url);
      const help = page.locator('details.help');
      await expect(help).toHaveCount(1);
      expect(await help.evaluate(d => d.open)).toBe(false);
      await expect(help.locator('summary')).toHaveText('Anleitung & Hinweise');
      await expect(page.locator('footer .footer-common')).toContainText('KI-generiert');
    });

    test('is an installable PWA and works offline', async ({ page, context }) => {
      await page.goto(url);

      const manifest = await page.evaluate(async () => {
        const href = document.querySelector('link[rel="manifest"]').href;
        return (await fetch(href)).json();
      });
      expect(manifest).toMatchObject({ start_url: './', scope: './', display: 'standalone', lang: 'de' });
      expect(manifest.short_name.length, 'short_name length').toBeLessThanOrEqual(12);
      for (const size of ['192x192', '512x512']) expect(manifest.icons.map(i => i.sizes)).toContain(size);
      expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true);

      await page.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors.map(e => e.errorId)).toEqual([]);

      await page.reload();
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled by its service worker').toBe(true);
      const cacheNames = await page.evaluate(() => caches.keys());
      expect(cacheNames.filter(k => k.startsWith(`pwa:${app.folder}:`)), 'exactly one cache for this app').toHaveLength(1);

      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('footer .footer-common')).toBeVisible();
      await context.setOffline(false);
    });
  });
}

// ---------- Data backup standard (export / import / clear) – see AGENTS.md "Daten sichern" ----------
for (const app of apps()) {
  test.describe(`${app.folder} · data backup`, () => {
    const url = `/${app.folder}/`;

    /** Prefix declared by the page, an own test key and a foreign key that must never be touched */
    async function prepare(page) {
      await page.goto(url);
      const prefix = await page.evaluate(() => Tools.data.prefixes()[0]);
      expect(prefix, 'page declares <meta name="tool:storage">').toBeTruthy();
      const own = `${prefix}backuptest.v1`;
      await page.evaluate(([own]) => {
        localStorage.setItem(own, JSON.stringify({ hello: 'Grüße', n: 1 }));
      }, [own]);
      await page.locator('details.data summary').click();
      return { own };
    }

    async function exportBackup(page) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.click('[data-data="export"]'),
      ]);
      expect(download.suggestedFilename()).toMatch(new RegExp(`^${app.folder}-sicherung-\\d{4}-\\d{2}-\\d{2}\\.json$`));
      const chunks = [];
      for await (const c of await download.createReadStream()) chunks.push(c);
      return Buffer.concat(chunks);
    }

    const importFile = (page, buffer) =>
      page.setInputFiles('details.data input[type=file]', { name: 'backup.json', mimeType: 'application/json', buffer });

    test('export contains only this app’s data, import restores it', async ({ page }) => {
      const { own } = await prepare(page);
      const file = await exportBackup(page);
      const backup = JSON.parse(file.toString('utf8'));
      expect(backup).toMatchObject({ format: 'phanlipo-tools-backup', formatVersion: 1, app: app.folder, title: app.title });
      expect(Date.parse(backup.exportedAt)).not.toBeNaN();
      expect(JSON.parse(backup.data[own])).toEqual({ hello: 'Grüße', n: 1 });
      const prefixes = await page.evaluate(() => Tools.data.prefixes());
      for (const k of Object.keys(backup.data)) expect(prefixes.some(p => k.startsWith(p)), k).toBe(true);

      // Change the data, then import the backup again
      await page.evaluate(([own]) => localStorage.setItem(own, '"changed"'), [own]);
      page.once('dialog', d => d.accept());
      await importFile(page, file);
      await page.waitForEvent('load');
      expect(await page.evaluate(([own]) => localStorage.getItem(own), [own])).toBe(JSON.stringify({ hello: 'Grüße', n: 1 }));
    });

    test('rejects invalid files and backups of other apps', async ({ page }) => {
      const { own } = await prepare(page);
      const before = await page.evaluate(() => JSON.stringify(Tools.data.exportData().data));
      const info = page.locator('[data-data="info"]');

      await importFile(page, Buffer.from('not json'));
      await expect(info).toHaveText('Die Datei ist keine gültige JSON-Sicherung.');

      const other = { format: 'phanlipo-tools-backup', formatVersion: 1, app: 'other-app', title: 'Andere App', exportedAt: new Date().toISOString(), data: {} };
      await importFile(page, Buffer.from(JSON.stringify(other)));
      await expect(info).toContainText('Andere App');

      const foreign = { ...other, app: app.folder, data: { [own]: '1', 'someone.else': '2' } };
      await importFile(page, Buffer.from(JSON.stringify(foreign)));
      await expect(info).toContainText('unbekannte Einträge');

      const newer = { ...other, app: app.folder, formatVersion: 99 };
      await importFile(page, Buffer.from(JSON.stringify(newer)));
      await expect(info).toContainText('neueren Version');

      expect(await page.evaluate(() => JSON.stringify(Tools.data.exportData().data))).toBe(before);
    });

    test('clear removes this app’s data only', async ({ page }) => {
      const { own } = await prepare(page);
      // A key of another app on the same domain must survive (removed again before the end of the test)
      await page.evaluate(() => localStorage.setItem('zzOtherApp.data.v1', 'keep'));
      page.once('dialog', d => d.accept());
      await page.click('[data-data="clear"]');
      await page.waitForEvent('load');
      const state = await page.evaluate(([own]) => ({ own: localStorage.getItem(own), other: localStorage.getItem('zzOtherApp.data.v1') }), [own]);
      expect(state).toEqual({ own: null, other: 'keep' });
      await page.evaluate(() => localStorage.removeItem('zzOtherApp.data.v1'));
    });
  });
}
