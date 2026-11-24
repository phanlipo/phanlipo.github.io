// Generic checks that run automatically for every page – a new tool is covered without extra work.
import { test, expect, axe, tools, apps, VIEWPORTS, expectNoHorizontalScroll, openMenu, onDialog, switchLang } from './helpers.mjs';
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

// One test per app: a single test over all apps outgrew the test time limit as apps were added
for (const app of apps()) {
  test(`${app.folder}: no subtitle in the header`, async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto(`/${app.folder}/`);
    const sub = page.locator('header .sub');
    if (await sub.count()) await expect(sub, app.folder).toBeHidden();
  });
}
test('the start page shows its subtitle in the header', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.goto('/');
  await expect(page.locator('header .sub')).toBeVisible();
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

  // Expected groups, worked out here independently of build.mjs: the area (first tag), games of the area
  // Freizeit in their own group "Spiele" right after it
  const groupOf = t => t.tags[0] === 'Freizeit' && t.tags.includes('Spiele') ? 'Spiele' : t.tags[0];
  const row = (page, title) => page.locator('.app', { has: page.locator('.open', { hasText: title }) });
  const visibleTitles = page => page.locator('.app:visible .open').allTextContents().then(a => a.map(x => x.trim()).sort());

  test('lists every tool in one compact row with a working link', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    const list = tools();
    await expect(page.locator('.app')).toHaveCount(list.length);
    for (const t of list) {
      const item = page.locator(`.app[data-folder="${t.folder}"]`);
      await expect(item.getByRole('link', { name: t.title, exact: true })).toHaveAttribute('href', `${t.folder}/`);
      // The link covers the whole row: a tap on the description opens the tool too
      expect(await item.locator('p').evaluate(p => {
        p.scrollIntoView({ block: 'center' });
        const r = p.getBoundingClientRect();
        return document.elementFromPoint(r.left + 20, r.top + r.height / 2)?.closest('a')?.getAttribute('href');
      })).toBe(`${t.folder}/`);
      await expect(item.locator('img')).toHaveAttribute('src', `${t.folder}/icon.svg`);
      // Compact: one row of at most 72 px, the description cut to one line
      expect(await item.evaluate(el => el.getBoundingClientRect().height), t.folder).toBeLessThanOrEqual(72);
    }
    // No tags on the rows; "KI-Agent" (every app has it) offers no filter
    await expect(page.locator('.app .tag')).toHaveCount(0);
    await expect(page.locator('.chip[data-tag="KI-Agent"]')).toHaveCount(0);
  });

  test('groups the tools by area, games in their own group, alphabetical inside – in English by English titles', async ({ page }) => {
    await page.goto('/');
    const list = tools();
    const shown = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.group')].map(g =>
      [g.dataset.group, [...g.querySelectorAll('.open')].map(a => a.textContent.trim())])));
    const expected = (key, lang) => {
      const out = {};
      for (const g of ['Alltag', 'Arbeit', 'Freizeit', 'Spiele']) {
        const titles = list.filter(t => groupOf(t) === g).map(t => t[key]).sort((a, b) => a.localeCompare(b, lang));
        if (titles.length) out[g] = titles;
      }
      return out;
    };
    expect(Object.keys(await shown())).toEqual(Object.keys(expected('title', 'de')));
    expect(await shown()).toEqual(expected('title', 'de'));
    for (const [g, titles] of Object.entries(expected('title', 'de')))
      await expect(page.locator(`.group[data-group="${g}"] h2 .count`)).toHaveText(String(titles.length));
    await expect(page.locator('.group[data-group="Spiele"] h2')).toContainText('Spiele');
    await switchLang(page, 'en');
    expect(await shown()).toEqual(expected('titleEn', 'en'));
    await expect(page.locator('.group[data-group="Spiele"] h2')).toContainText('Games');
    await switchLang(page, 'de');
    expect(await shown()).toEqual(expected('title', 'de'));
  });

  test('group switch and filter: one button per group, topics with at least two apps, features that set apps apart', async ({ page }) => {
    await page.goto('/');
    const list = tools();
    const groups = ['Alltag', 'Arbeit', 'Freizeit', 'Spiele'].filter(g => list.some(t => groupOf(t) === g));
    const btn = g => page.locator('.seg.area').getByRole('button', { name: g, exact: true });
    // One button per group, in the order of the list; none pressed = all apps
    await expect(page.locator('.seg.area button')).toHaveText(groups);
    await expect(page.locator('.seg.area [aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('.app:visible')).toHaveCount(list.length);
    for (const g of groups) {
      await btn(g).click();
      await expect(btn(g)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.seg.area [aria-pressed="true"]')).toHaveCount(1);
      expect(await visibleTitles(page), g).toEqual(list.filter(t => groupOf(t) === g).map(t => t.title).sort());
      await expect(page.locator('.group:visible')).toHaveCount(1);
    }
    // Tapping the pressed group again shows everything
    await btn(groups.at(-1)).click();
    await expect(page.locator('.seg.area [aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('.app:visible')).toHaveCount(list.length);
    // The filter panel opens with its button
    const filterBtn = page.getByRole('button', { name: 'Filter' });
    await expect(page.locator('#filter-panel')).toBeHidden();
    await filterBtn.click();
    await expect(filterBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#filter-panel')).toBeVisible();
    const areas = [...new Set(list.map(t => t.tags[0]))];
    const count = x => list.filter(t => t.tags.includes(x) || t.features.includes(x)).length;
    // Topics: no areas, no topic that has its own group (Spiele), at least two apps
    const topics = [...new Set(list.flatMap(t => t.tags.slice(1)))].filter(x => !areas.includes(x) && !groups.includes(x) && count(x) >= 2);
    const features = [...new Set(list.flatMap(t => t.features))].filter(x => count(x) < list.length);
    const values = [...topics, ...features];
    await expect(page.locator('.filter-panel .chip')).toHaveCount(values.length);
    await expect(page.locator('.chip[data-tag="Spiele"]')).toHaveCount(0);
    for (const tag of values) {
      const chip = page.locator(`.chip[data-tag="${tag}"]`);
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.filter-count')).toHaveText('1');
      expect(await visibleTitles(page), tag).toEqual(list.filter(t => t.tags.includes(tag) || t.features.includes(tag)).map(t => t.title).sort());
      await expectNoHorizontalScroll(page);
    }
    // Tapping the active chip again shows everything
    await page.locator(`.chip[data-tag="${values.at(-1)}"]`).click();
    await expect(page.locator('.app:visible')).toHaveCount(list.length);
    await expect(page.locator('.filter-count')).toBeHidden();
    // Group and topic together; in a group only chips with apps there are offered
    await btn('Spiele').click();
    await page.locator('.chip[data-tag="Kinder"]').click();
    expect(await visibleTitles(page)).toEqual(list.filter(t => groupOf(t) === 'Spiele' && t.tags.includes('Kinder')).map(t => t.title).sort());
    const offered = await page.locator('.filter-panel .chip:visible').evaluateAll(cs => cs.map(c => c.dataset.tag));
    expect(offered.sort()).toEqual(values.filter(x => list.some(t => groupOf(t) === 'Spiele' && (t.tags.includes(x) || t.features.includes(x)))).sort());
  });

  test('search finds apps by title, description and tag – in German and English, combined with group and filter', async ({ page }) => {
    await page.goto('/');
    const list = tools();
    const search = page.getByRole('searchbox', { name: 'Apps durchsuchen' });
    const titles = pred => list.filter(pred).map(t => t.title).sort();
    const norm = s => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');
    // Every app is found by its own title
    for (const t of list) {
      await search.fill(t.title);
      expect(await visibleTitles(page)).toContain(t.title);
    }
    // Case and umlauts don't matter; several words must all appear
    const dice = list.find(t => t.folder === 'dice-coin');
    await search.fill('WURFEL munze');
    expect(await visibleTitles(page)).toContain(dice.title);
    // English words find the app too, independently of the language shown
    await search.fill(dice.titleEn.split(' ')[0]);
    expect(await visibleTitles(page)).toContain(dice.title);
    // A tag without its own filter chip (a topic of one app) still finds the app
    const single = list.find(t => t.tags.slice(1).some(x => list.filter(u => u.tags.includes(x)).length === 1));
    const lone = single.tags.slice(1).find(x => list.filter(u => u.tags.includes(x)).length === 1);
    await search.fill(lone);
    expect(await visibleTitles(page)).toContain(single.title);
    // A word from a description
    await search.fill('pdf');
    const hay = t => norm([t.title, t.description, t.titleEn, t.descriptionEn, t.folder, ...t.tags, ...t.features].join(' '));
    expect(await visibleTitles(page)).toEqual(titles(t => hay(t).includes('pdf')));
    // Combined with a group (tapping it again removes it)
    await page.locator('.seg.area').getByRole('button', { name: 'Arbeit', exact: true }).click();
    expect(await visibleTitles(page)).toEqual(titles(t => hay(t).includes('pdf') && groupOf(t) === 'Arbeit'));
    await page.locator('.seg.area').getByRole('button', { name: 'Arbeit', exact: true }).click();
    expect(await visibleTitles(page)).toEqual(titles(t => hay(t).includes('pdf')));
    // No match: a visible message, no empty groups
    await search.fill('xyzqwv');
    await expect(page.locator('.app:visible')).toHaveCount(0);
    await expect(page.locator('.group:visible')).toHaveCount(0);
    await expect(page.locator('.filter-empty')).toBeVisible();
    await expectNoHorizontalScroll(page);
    // Escape clears the search
    await search.press('Escape');
    await expect(search).toHaveValue('');
    await expect(page.locator('.app:visible')).toHaveCount(list.length);
    await expect(page.locator('.filter-empty')).toBeHidden();
    // "/" jumps to the search field; English labels
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(search).toBeFocused();
    await switchLang(page, 'en');
    await expect(page.getByRole('searchbox', { name: 'Search apps' })).toHaveAttribute('placeholder', 'Search apps');
  });

  test('phone: tapping the search field moves the bar to the top, also when nothing matches', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    const search = page.getByRole('searchbox', { name: 'Apps durchsuchen' });
    const top = () => search.evaluate(el => Math.round(el.getBoundingClientRect().top));
    expect(await top()).toBeGreaterThan(100); // below the header at first
    await search.click();
    await expect.poll(top).toBeLessThan(30);
    await search.fill('xyzqwv');
    await expect(page.locator('.app:visible')).toHaveCount(0);
    expect(await top()).toBeLessThan(30);
    await search.press('Enter'); // keyboard closes, results and field stay
    expect(await top()).toBeLessThan(30);
  });

  test('phone: search, group switch and filter stay at the top while the list scrolls', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.locator('.filter').evaluate(el => Math.round(el.getBoundingClientRect().top))).toBe(0);
    await expect(page.getByRole('searchbox', { name: 'Apps durchsuchen' })).toBeInViewport();
    await expect(page.locator('.seg.area')).toBeInViewport();
  });

  test('favourites and recently used: stars on the rows, the apps note themselves', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    const list = tools();
    const [a, b, c] = ['dice-coin', 'qr-code', 'calc-pad'].map(f => list.find(t => t.folder === f));
    await page.goto('/');
    await expect(page.locator('#shelf-fav')).toBeHidden();
    await expect(page.locator('#shelf-recent')).toBeHidden();
    // Opening apps notes them (newest first); the template and hidden pages don't count
    for (const t of [a, b]) await page.goto(`/${t.folder}/`);
    await page.goto('/template/');
    await page.goto('/');
    const recent = page.locator('#shelf-recent .shelf-row a');
    await expect(recent).toHaveCount(2);
    expect(await recent.evaluateAll(as => as.map(x => x.getAttribute('href')))).toEqual([`${b.folder}/`, `${a.folder}/`]);
    await expect(recent.first()).toHaveAccessibleName(b.title);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tools.recent.v1')))).toEqual([b.folder, a.folder]);
    // A star makes a favourite: on top, pressed, kept after reload, no longer under "recently used"
    const star = row(page, c.title).getByRole('button', { name: `Favorit: ${c.title}` });
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await star.click();
    await row(page, a.title).getByRole('button', { name: `Favorit: ${a.title}` }).click();
    await expect(star).toHaveAttribute('aria-pressed', 'true');
    const favs = page.locator('#shelf-fav .shelf-row a');
    await expect(favs).toHaveCount(2);
    expect(await favs.evaluateAll(as => as.map(x => x.getAttribute('href')))).toEqual([`${c.folder}/`, `${a.folder}/`]);
    await page.reload();
    await expect(favs).toHaveCount(2);
    expect(await recent.evaluateAll(as => as.map(x => x.getAttribute('href')))).toEqual([`${b.folder}/`]);
    await expect(row(page, c.title).getByRole('button', { name: `Favorit: ${c.title}` })).toHaveAttribute('aria-pressed', 'true');
    await expectNoHorizontalScroll(page);
    // Accessible with filled shelves and the filter panel open
    await page.getByRole('button', { name: 'Filter' }).click();
    expect((await axe(page).analyze()).violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
    await page.getByRole('button', { name: 'Filter' }).click();
    // A tile opens its app
    await favs.first().click();
    await expect(page).toHaveURL(new RegExp(`/${c.folder}/$`));
    await page.goBack();
    // While searching or filtering, only the results show
    await page.getByRole('searchbox', { name: 'Apps durchsuchen' }).fill('pdf');
    await expect(page.locator('#shelf-fav')).toBeHidden();
    await expect(page.locator('#shelf-recent')).toBeHidden();
    await page.getByRole('searchbox', { name: 'Apps durchsuchen' }).fill('');
    await expect(page.locator('#shelf-fav')).toBeVisible();
    // Star again removes the favourite
    await row(page, a.title).getByRole('button', { name: `Favorit: ${a.title}` }).click();
    await expect(favs).toHaveCount(1);
    // "Zuletzt benutzt" can be cleared from the menu (after a question); favourites stay
    await openMenu(page);
    await onDialog(page, d => d.accept(), { once: true });
    await page.getByRole('button', { name: '„Zuletzt benutzt“ leeren' }).click();
    await expect(page.locator('#shelf-recent')).toBeHidden();
    await expect(favs).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('tools.recent.v1'))).toBe('[]');
    // English
    await switchLang(page, 'en');
    await expect(page.locator('#shelf-fav h2')).toHaveText('Favourites');
    await expect(row(page, c.titleEn).getByRole('button', { name: `Favourite: ${c.titleEn}` })).toHaveAttribute('aria-pressed', 'true');
  });

  test('favourites: long press, right click or Delete removes one right in the row – undo puts it back', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    const list = tools();
    const [a, b, c] = ['calc-pad', 'dice-coin', 'qr-code'].map(f => list.find(t => t.folder === f));
    await page.goto('/');
    await page.evaluate(favs => localStorage.setItem('tools.favorites.v1', JSON.stringify(favs)), [a.folder, b.folder, c.folder]);
    await page.reload();
    const tiles = page.locator('#shelf-fav .shelf-row a');
    const order = () => tiles.evaluateAll(as => as.map(x => x.dataset.folder));
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('tools.favorites.v1')));
    await expect(tiles).toHaveCount(3);
    await expect(page.locator('#fav-hint')).toHaveText('Zum Entfernen lange drücken');
    await expect(tiles.first()).toHaveAccessibleDescription('Zum Entfernen lange drücken');
    const press = async el => {
      const box = await el.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
    };
    // Long press on the middle tile: it shrinks while held, then goes; lifting the finger opens nothing
    await press(tiles.nth(1));
    await expect(tiles.nth(1)).toHaveClass(/pressing/);
    await expect(tiles).toHaveCount(2);
    // Android also fires contextmenu during the same press – it must not take the tile that moved up
    await tiles.nth(1).dispatchEvent('contextmenu');
    await page.mouse.up();
    expect(await order()).toEqual([a.folder, c.folder]);
    expect(await stored()).toEqual([a.folder, c.folder]);
    await expect(page).toHaveURL(/\/$/);
    // Undo puts it back at its place
    await expect(page.locator('#toast')).toContainText(`„${b.title}“ aus den Favoriten entfernt.`);
    await page.locator('#toast').getByRole('button', { name: 'Rückgängig' }).click();
    await expect(tiles).toHaveCount(3);
    expect(await order()).toEqual([a.folder, b.folder, c.folder]);
    await expect(page.locator(`.app[data-folder="${b.folder}"] .fav`)).toHaveAttribute('aria-pressed', 'true');
    // Moving the finger (scrolling the row) cancels the press
    await press(tiles.first());
    await expect(tiles.first()).toHaveClass(/pressing/);
    await page.mouse.move(300, 600, { steps: 3 });
    await expect(tiles.first()).not.toHaveClass(/pressing/);
    await page.mouse.up();
    await expect(page).toHaveURL(/\/$/);
    // Right click removes too (desktop)
    await tiles.last().click({ button: 'right' });
    await expect(tiles).toHaveCount(2);
    expect(await order()).toEqual([a.folder, b.folder]);
    // Keyboard: Delete removes the focused tile, focus stays in the row
    await tiles.first().focus();
    await page.keyboard.press('Delete');
    await expect(tiles).toHaveCount(1);
    await expect(tiles.first()).toBeFocused();
    expect(await stored()).toEqual([b.folder]);
    await expect(page.locator(`.app[data-folder="${a.folder}"] .fav`)).toHaveAttribute('aria-pressed', 'false');
    // The last one gone: the row disappears
    await page.keyboard.press('Delete');
    await expect(page.locator('#shelf-fav')).toBeHidden();
    await expect(page.getByRole('searchbox', { name: 'Apps durchsuchen' })).toBeFocused();
    // English
    await switchLang(page, 'en');
    await page.locator(`.app[data-folder="${a.folder}"] .fav`).click();
    await expect(page.locator('#fav-hint')).toHaveText('Long press to remove');
    await tiles.first().click({ button: 'right' });
    await expect(page.locator('#toast')).toContainText(`Removed “${a.titleEn}” from favourites.`);
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
      // Only own server, unless the page declares more in <meta name="tool:connect"> (api-check)
      const connect = await page.evaluate(() => document.querySelector('meta[name="tool:connect"]')?.content);
      expect(policy).toContain(`connect-src 'self'${connect ? ' ' + connect.trim().split(/\s+/).join(' ') : ''};`);
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
      await openMenu(page); // stage apps: the footer is in the menu
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
      // Feature "Vollbild": installed app without status and navigation bar
      const display = (app.features || []).includes('Vollbild') ? 'fullscreen' : 'standalone';
      expect(manifest).toMatchObject({ start_url: './', scope: './', display, lang: 'de' });
      expect(manifest.short_name.length, 'short_name length').toBeLessThanOrEqual(12);
      for (const size of ['192x192', '512x512']) expect(manifest.icons.map(i => i.sizes)).toContain(size);
      expect(manifest.icons.some(i => i.purpose === 'maskable')).toBe(true);

      await page.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors.map(e => e.errorId)).toEqual([]);
      // Own app id per app – otherwise Chrome/Edge (Windows) merges all installed apps into one
      // ("./" would resolve against the origin, not the manifest URL)
      const { manifest: parsed } = await cdp.send('Page.getAppManifest');
      expect(parsed.id).toBe(new URL(url, page.url()).href);

      await page.reload();
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled by its service worker').toBe(true);
      const cacheNames = await page.evaluate(() => caches.keys());
      expect(cacheNames.filter(k => k.startsWith(`pwa:${app.folder}:`)), 'exactly one cache for this app').toHaveLength(1);

      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('h1')).toBeVisible();
      await openMenu(page); // stage apps: the footer is in the menu
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
      await openMenu(page);
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
      await onDialog(page, d => d.accept(), { once: true });
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
      await onDialog(page, d => d.accept(), { once: true });
      await page.click('[data-data="clear"]');
      await page.waitForEvent('load');
      const state = await page.evaluate(([own]) => ({ own: localStorage.getItem(own), other: localStorage.getItem('zzOtherApp.data.v1') }), [own]);
      expect(state).toEqual({ own: null, other: 'keep' });
      await page.evaluate(() => localStorage.removeItem('zzOtherApp.data.v1'));
    });
  });
}
