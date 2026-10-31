// Generic checks that run automatically for every page – a new tool is covered without extra work.
import { test, expect, tools, apps, VIEWPORTS, expectNoHorizontalScroll } from './helpers.mjs';
import { allPages } from '../scripts/lib.mjs';

test('robots.txt allows crawling so search engines can see the noindex tag', async ({ request }) => {
  const txt = await (await request.get('/robots.txt')).text();
  expect(txt).not.toMatch(/^Disallow:\s*\/\s*$/m);
  // Never block the start page, an app or a redirect page
  const rules = [...txt.matchAll(/^Disallow:\s*(\S+)/gm)].map(m => m[1]);
  const blocked = path => rules.some(r => {
    const re = new RegExp('^' + r.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    return re.test(path);
  });
  for (const path of ['/', '/index.html', ...allPages().map(p => p.folder).filter(a => a && !['scripts', 'tests', 'template', 'node_modules'].includes(a)).flatMap(a => [`/${a}/`, `/${a}/index.html`, `/${a}/manifest.webmanifest`, `/${a}/sw.js`]),
    '/assets/base.css', '/assets/common.js', '/robots.txt']) {
    expect(blocked(path), `robots.txt blocks ${path}`).toBe(false);
  }
});

test('repository files are not published, only what the pages need', async ({ request }) => {
  // Same rule as GitHub Pages via scripts/site.mjs – these files cannot carry noindex
  for (const path of ['/README.md', '/AGENTS.md', '/NOTICE.md', '/LICENSE', '/package.json', '/package-lock.json',
    '/playwright.config.mjs', '/scripts/build.mjs', '/scripts/vendor.json', '/tests/server.mjs',
    '/assets/vendor/README.md', '/sbom.cdx.json', '/.nojekyll', '/.github/workflows/pages.yml']) {
    expect((await request.get(path)).status(), path).toBe(404);
  }
  for (const path of ['/', '/robots.txt', '/icon.svg', '/manifest.webmanifest', '/assets/base.css', '/assets/vendor/katex/LICENSE', '/dice-coin/', '/dice-coin/sw.js']) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
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
      await expect(page.locator('h1')).toHaveText('App-Regal');
      await expectNoHorizontalScroll(page);
    });
  }

  test('footer has no link to itself', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('footer .footer-common')).toContainText('KI-generiert');
    await expect(page.locator('footer .footer-home')).toHaveCount(0);
  });

  test('lists every tool with a working link', async ({ page }) => {
    await page.goto('/');
    const list = tools();
    await expect(page.locator('.tool')).toHaveCount(list.length);
    for (const t of list) {
      const card = page.locator('.tool', { has: page.locator('h2', { hasText: t.title }) });
      await expect(card.getByRole('link', { name: t.title, exact: true })).toHaveAttribute('href', `${t.folder}/`);
      // The link covers the whole card: a tap on the description opens the tool too
      expect(await card.locator('p').evaluate(p => {
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('a')?.getAttribute('href');
      })).toBe(`${t.folder}/`);
      await expect(card.locator('img')).toHaveAttribute('src', `${t.folder}/icon.svg`);
    }
  });

  test('lists the tools alphabetically – in English by their English titles', async ({ page }) => {
    const titles = () => page.locator('.tool .open').allTextContents().then(a => a.map(x => x.trim()));
    await page.goto('/');
    const de = tools().map(t => t.title).sort((a, b) => a.localeCompare(b, 'de'));
    expect(await titles()).toEqual(de);
    await page.locator('[data-set-lang="en"]').click();
    const en = tools().map(t => t.titleEn).sort((a, b) => a.localeCompare(b, 'en'));
    expect(await titles()).toEqual(en);
    await page.locator('[data-set-lang="de"]').click();
    expect(await titles()).toEqual(de);
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

  test('phone: filter rows scroll sideways without a scroll bar, a faded edge shows there is more', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    const row = page.locator('.filter .chips').first();
    // Overlay or classic: no scroll bar is drawn (same height with and without scrollable content)
    expect(await row.evaluate(r => [r.scrollWidth > r.clientWidth, getComputedStyle(r).scrollbarWidth, r.offsetHeight - r.clientHeight]))
      .toEqual([true, 'none', 0]);
    await expect(row).toHaveClass(/more-end/);
    await expect(row).not.toHaveClass(/more-start/);
    expect(await row.evaluate(r => getComputedStyle(r).maskImage)).toMatch(/linear-gradient/);
    await row.evaluate(r => { r.scrollLeft = 60; });
    await expect(row).toHaveClass(/more-start more-end|more-end more-start/);
    await row.evaluate(r => { r.scrollLeft = r.scrollWidth; });
    await expect(row).toHaveClass(/more-start/);
    await expect(row).not.toHaveClass(/more-end/);
    // Wide screens: rows wrap, nothing faded
    await page.setViewportSize(VIEWPORTS.desktop);
    await expect(row).not.toHaveClass(/more-end|more-start/);
    expect(await row.evaluate(r => getComputedStyle(r).maskImage)).toBe('none');
  });

  test('home screen shortcut (Android): manifest with full-bleed icon, opens as a normal tab', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('manifest.webmanifest');
    const m = await (await request.get('/' + href)).json();
    expect(m).toMatchObject({ short_name: 'App-Regal', short_name_localized: { en: 'App Shelf' }, start_url: './',
      display: 'browser', theme_color: '#334155', background_color: '#334155' });
    // Without a maskable icon Android puts the icon on a white circle
    const maskable = m.icons.find(i => i.purpose === 'maskable');
    expect(maskable).toMatchObject({ src: 'icon-maskable-512.png', sizes: '512x512' });
    for (const i of m.icons) expect((await request.get('/' + i.src)).status(), i.src).toBe(200);
    // Every corner of the maskable icon is the page colour, not white or transparent
    const corners = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      return [[0, 0], [img.width - 1, 0], [0, img.height - 1], [img.width - 1, img.height - 1]]
        .map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
    }, maskable.src);
    for (const c of corners) expect(c).toEqual([0x33, 0x41, 0x55, 255]);
    // No service worker of its own: it would sit above every app's scope
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
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
        // App icon next to the title, decorative (the title is the name)
        const logo = page.locator('header h1 img.app-logo');
        await expect(logo).toHaveAttribute('src', 'icon.svg');
        await expect(logo).toHaveAttribute('alt', '');
        expect(await logo.evaluate(i => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width === 32)).toBe(true);
        await expectNoHorizontalScroll(page);
      });
    }

    test('accent colour matches the icon colour (tool:color)', async ({ page, request }) => {
      const html = await (await request.get(url)).text();
      const color = html.match(/<meta name="tool:color" content="([^"]+)"/)[1].toLowerCase();
      const accent = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim().toLowerCase());
      await page.goto(url);
      expect(await accent()).toBe(color);
      // Dark mode uses its own (lighter) shade, not the shared default blue – unless the app is that blue
      await page.emulateMedia({ colorScheme: 'dark' });
      const dark = await accent();
      expect(dark).not.toBe(color);
      if (color !== '#0b5cad') expect(dark).not.toBe('#5aa2ef');
    });

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
      // Licences of the bundled libraries (MIT/Apache-2.0 ask for the licence text to be available)
      await expect(page.locator('footer .footer-common').getByRole('link', { name: 'Open-Source-Lizenzen' }))
        .toHaveAttribute('href', 'https://github.com/phanlipo/phanlipo.github.io/blob/main/NOTICE.md');
      await expect(page.locator('footer .footer-home').getByRole('link', { name: 'Alle Tools auf phanlipo.github.io' }))
        .toHaveAttribute('href', 'https://phanlipo.github.io/');
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
