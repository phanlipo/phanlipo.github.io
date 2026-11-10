// Image Swipe: sources as JSON (fixed items or an API), swipe/like/pass, profiles, results, offline.
// The TCGdex API is answered by Playwright routes shaped like the real responses – nothing leaves the machine.
import { test, expect, clipboardText, openMenu, closeMenu } from './helpers.mjs';

const URL_ = '/image-swipe/';
const K = { sources: 'image-swipe.sources.v1', profiles: 'image-swipe.profiles.v1', swipes: 'image-swipe.swipes.v1' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const ls = (page, key) => page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);

/** Stand-in for api.tcgdex.net and assets.tcgdex.net (answers with CORS headers like the real servers) */
async function mockTcgdex(page, { cards } = {}) {
  const seen = [];
  const cors = { 'access-control-allow-origin': '*' };
  const set = {
    id: 'sv01', name: 'Karmesin & Purpur',
    cards: cards || [
      { id: 'sv01-001', localId: '001', name: 'Tannza', image: 'https://assets.tcgdex.net/de/sv/sv01/001' },
      { id: 'sv01-002', localId: '002', name: 'Skaraborn', image: 'https://assets.tcgdex.net/de/sv/sv01/002' },
      { id: 'sv01-003', localId: '003', name: 'Ohne Bild' },                                                  // skipped: no picture
      { id: 'sv01-002', localId: '002', name: 'Doppelt', image: 'https://assets.tcgdex.net/de/sv/sv01/x' },   // skipped: same id
      { id: 'sv01-004', localId: '004', name: 'Kapilz', image: 'https://assets.tcgdex.net/de/sv/sv01/004' },
    ],
  };
  await page.context().route(/^https:\/\/(api|assets)\.tcgdex\.net\//, async route => {
    const r = route.request();
    seen.push({ url: r.url(), headers: await r.allHeaders() });
    if (r.url() === 'https://api.tcgdex.net/v2/de/sets/sv01')
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(set) });
    if (/^https:\/\/assets\.tcgdex\.net\/de\/sv\/sv01\/\d+\/high\.webp$/.test(r.url()))
      return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: PNG });
    return route.fulfill({ status: 404, headers: cors, body: 'not found' });
  });
  return seen;
}

async function swipe(page, dx) {
  const box = await page.locator('#card').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + dx * i / 8, y + 4 * i / 8);
  await page.mouse.up();
}

async function addJson(page, def) {
  await openMenu(page);
  await page.fill('#srcJson', typeof def === 'string' ? def : JSON.stringify(def));
  await page.click('#btnAdd');
}

// Requests to TCGdex are answered by the routes above – allow exactly these
test.use({ allowedProblems: /^external request: https:\/\/(api|assets)\.tcgdex\.net\// });

test.describe('Image Swipe', () => {
  test('emoji example: swipe right/left, buttons, undo – ratings saved per source and item id', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#emptyText')).toContainText('Noch keine Datenquelle');
    await expect(page.locator('#btnLike')).toBeDisabled();
    await page.locator('#emptyBtns button', { hasText: 'Beispiel: Emojis' }).click();
    await expect(page.locator('#sourceSel option:checked')).toHaveText('Emojis: Tiere & Essen');
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F436');
    await expect(page.locator('#cardEmoji')).toHaveText('🐶');
    await expect(page.locator('#cardTitle')).toHaveText('Hund');
    await expect(page.locator('#cardSub')).toHaveText('U+1F436');
    await expect(page.locator('#progress')).toHaveText('0 von 36 bewertet · ♥ 0 · ✕ 0');

    await swipe(page, 220);                                     // right = like
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F431');
    await swipe(page, -220);                                    // left = pass
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F42D');
    await swipe(page, 20);                                      // too short: snaps back, nothing rated
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F42D');
    await page.click('#btnLike');
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F439');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F430');
    await expect(page.locator('#progress')).toHaveText('4 von 36 bewertet · ♥ 2 · ✕ 2');
    // Undo brings back the last one
    await page.click('#btnUndo');
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F439');
    await expect(page.locator('#progress')).toHaveText('3 von 36 bewertet · ♥ 2 · ✕ 1');

    expect(await ls(page, K.swipes)).toEqual({ p1: { 'emoji-tiere-essen': { '1F436': 'like', '1F431': 'nope', '1F42D': 'like' } } });
    await page.reload();
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F439');
    await expect(page.locator('#progress')).toHaveText('3 von 36 bewertet · ♥ 2 · ✕ 1');
  });

  test('profiles keep their own ratings; renaming, deleting', async ({ page }) => {
    await page.goto(URL_);
    await page.locator('#emptyBtns button', { hasText: 'Beispiel: Emojis' }).click();
    await page.click('#btnLike');
    await expect(page.locator('#progress')).toHaveText('1 von 36 bewertet · ♥ 1 · ✕ 0');
    await openMenu(page);
    await page.fill('#profNew', 'Anna');
    await page.click('#btnProfAdd');
    await closeMenu(page);
    await expect(page.locator('#profileSel option:checked')).toHaveText('Anna');
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F436');
    await expect(page.locator('#progress')).toHaveText('0 von 36 bewertet · ♥ 0 · ✕ 0');
    await page.click('#btnNope');
    await page.click('#btnNope');
    await expect(page.locator('#progress')).toHaveText('2 von 36 bewertet · ♥ 0 · ✕ 2');
    // Back to the first profile
    await page.selectOption('#profileSel', { label: 'Ich' });
    await expect(page.locator('#progress')).toHaveText('1 von 36 bewertet · ♥ 1 · ✕ 0');
    const swipes = await ls(page, K.swipes);
    const anna = (await ls(page, K.profiles)).list.find(p => p.name === 'Anna').id;
    expect(swipes.p1).toEqual({ 'emoji-tiere-essen': { '1F436': 'like' } });
    expect(swipes[anna]).toEqual({ 'emoji-tiere-essen': { '1F436': 'nope', '1F431': 'nope' } });
    // Rename the first profile, delete Anna (with her ratings)
    await openMenu(page);
    await page.locator('#profList input').first().fill('Max');
    await page.locator('#profList input').first().press('Tab');
    await expect(page.locator('#profileSel option')).toHaveText(['Max', 'Anna']);
    page.once('dialog', d => d.accept());
    await page.locator('#profList li').nth(1).locator('button').click();
    await expect(page.locator('#profileSel option')).toHaveText(['Max']);
    await expect(page.locator('#profList button')).toBeDisabled();       // the last profile stays
    expect(Object.keys(await ls(page, K.swipes))).toEqual(['p1']);
  });

  test('TCGdex example: nothing is requested until “Daten laden”; list, ids and pictures as mapped; cookies never sent', async ({ page }) => {
    const seen = await mockTcgdex(page);
    await page.goto(URL_);
    await openMenu(page);
    await page.click('#btnExTcg');
    const def = JSON.parse(await page.inputValue('#srcJson'));
    expect(def).toMatchObject({ format: 'image-swipe-source', formatVersion: 1, id: 'tcgdex-de-sv01', api: { url: 'https://api.tcgdex.net/v2/de/sets/sv01', list: 'cards' } });
    await page.click('#btnAdd');
    await expect(page.locator('#srcInfo')).toHaveText('„TCGdex: Karmesin & Purpur (deutsch)“ hinzugefügt – jetzt auf „Daten laden“ tippen.');
    await expect(page.locator('#srcList .smeta').first()).toHaveText('id: tcgdex-de-sv01 · API api.tcgdex.net · noch nicht geladen');
    await closeMenu(page);
    await expect(page.locator('#emptyText')).toContainText('von api.tcgdex.net');
    expect(seen).toEqual([]);

    await page.locator('#emptyBtns button', { hasText: 'Daten laden' }).click();
    await expect(page.locator('#card')).toHaveAttribute('data-id', 'sv01-001');
    await expect(page.locator('#cardTitle')).toHaveText('Tannza');
    await expect(page.locator('#cardSub')).toHaveText('#001');
    await expect(page.locator('#cardAttr')).toContainText('TCGdex');
    await expect(page.locator('#cardImg')).toBeVisible();
    expect(await page.locator('#cardImg').evaluate(i => i.src.startsWith('blob:') && i.naturalWidth === 1)).toBe(true);
    // Card without picture and the duplicate id are skipped
    await expect(page.locator('#progress')).toHaveText('0 von 3 bewertet · ♥ 0 · ✕ 0');
    const urls = seen.map(s => s.url);
    expect(urls[0]).toBe('https://api.tcgdex.net/v2/de/sets/sv01');
    expect(urls).toContain('https://assets.tcgdex.net/de/sv/sv01/001/high.webp');
    for (const s of seen) expect(s.headers.cookie).toBeUndefined();

    await page.click('#btnLike');
    await page.click('#btnNope');
    await page.click('#btnLike');
    await expect(page.locator('#emptyText')).toHaveText('Alles bewertet 🎉');
    expect((await ls(page, K.swipes)).p1['tcgdex-de-sv01']).toEqual({ 'sv01-001': 'like', 'sv01-002': 'nope', 'sv01-004': 'like' });
  });

  test('API source works offline after loading: list and seen pictures stay on the device', async ({ page, context }) => {
    const seen = await mockTcgdex(page);
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await openMenu(page);
    await page.click('#btnExTcg');
    await page.click('#btnAdd');
    await page.locator('#srcList button', { hasText: 'Daten laden' }).click();
    await expect(page.locator('#srcList .smeta').first()).toContainText('3 Einträge · geladen');
    await closeMenu(page);
    await expect(page.locator('#cardImg')).toBeVisible();
    await page.reload(); // controlled by the service worker
    await expect(page.locator('#cardImg')).toBeVisible();
    const before = seen.length;
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#card')).toHaveAttribute('data-id', 'sv01-001');
    await expect(page.locator('#cardImg')).toBeVisible();
    expect(await page.locator('#cardImg').evaluate(i => i.naturalWidth)).toBe(1);
    expect(seen.length).toBe(before);
    await context.setOffline(false);
  });

  test.describe('errors', () => {
    test.use({ allowedProblems: /api\.tcgdex\.net|Failed to load resource/ });
    test('server error and wrong list path are shown; retry works', async ({ page }) => {
      let fail = true;
      await page.context().route('https://api.tcgdex.net/**', route => fail
        ? route.fulfill({ status: 503, headers: { 'access-control-allow-origin': '*' }, body: 'busy' })
        : route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: JSON.stringify({ items: [] }) }));
      await page.goto(URL_);
      await openMenu(page);
      await page.click('#btnExTcg');
      await page.click('#btnAdd');
      await closeMenu(page);
      await page.locator('#emptyBtns button', { hasText: 'Daten laden' }).click();
      await expect(page.locator('#emptyText')).toContainText('Der Server antwortete mit Status 503.');
      fail = false;
      await page.locator('#emptyBtns button', { hasText: 'Daten laden' }).click();
      await expect(page.locator('#emptyText')).toContainText('In der Antwort steht unter „cards“ keine Liste');
    });
  });

  test('invalid descriptions are rejected with a clear message', async ({ page }) => {
    await page.goto(URL_);
    await openMenu(page);
    await page.click('#btnAdd');
    await expect(page.locator('#srcInfo')).toHaveText('Bitte zuerst JSON eintragen.');
    const cases = [
      ['{ kaputt', /^Keine gültige JSON/],
      [[], 'Die JSON muss ein Objekt sein: { … }.'],
      [{ title: 'x', items: [{ id: 1, text: 'a' }] }, /^„id“ fehlt oder ist ungültig/],
      [{ id: 'a b', title: 'x', items: [{ id: 1, text: 'a' }] }, /^„id“ fehlt oder ist ungültig/],
      [{ id: 'x', items: [{ id: 1, text: 'a' }] }, '„title“ fehlt.'],
      [{ id: 'x', title: 'x' }, 'Es fehlt „items“ (Liste) oder „api“ mit „url“.'],
      [{ id: 'x', title: 'x', items: [{ title: 'ohne id', text: 'a' }, { id: 2, image: 'http://example.com/a.png' }] }, /^Keine verwendbaren Einträge/],
      [{ id: 'x', title: 'x', api: { url: 'http://example.com/list' } }, /^„api\.url“ muss eine https-Adresse sein/],
      [{ id: 'x', title: 'x', format: 'other', items: [{ id: 1, text: 'a' }] }, '„format“ muss „image-swipe-source“ sein.'],
    ];
    for (const [def, msg] of cases) {
      await page.fill('#srcJson', typeof def === 'string' ? def : JSON.stringify(def));
      await page.click('#btnAdd');
      await expect(page.locator('#srcInfo')).toHaveText(msg);
      await expect(page.locator('#srcInfo')).toHaveClass(/err/);
    }
    expect(await ls(page, K.sources)).toBeNull();
  });

  test('same id replaces the source and keeps the ratings; deleting keeps them for a later re-add', async ({ page }) => {
    const v1 = { id: 'meine', title: 'Erste Fassung', items: [{ id: 'a', text: '🅰️', title: 'A' }, { id: 'b', text: '🅱️', title: 'B' }] };
    const v2 = { id: 'meine', title: 'Zweite Fassung', items: [{ id: 'b', text: '🅱️', title: 'B' }, { id: 'c', text: '©️', title: 'C' }, { id: 'a', text: '🅰️', title: 'A neu' }] };
    await page.goto(URL_);
    await addJson(page, v1);
    await closeMenu(page);
    await page.click('#btnLike');                              // a = like
    await expect(page.locator('#card')).toHaveAttribute('data-id', 'b');
    page.once('dialog', d => d.accept());
    await addJson(page, v2);
    await closeMenu(page);
    await expect(page.locator('#sourceSel option')).toHaveText(['Zweite Fassung']);
    await expect(page.locator('#progress')).toHaveText('1 von 3 bewertet · ♥ 1 · ✕ 0');
    await expect(page.locator('#card')).toHaveAttribute('data-id', 'b');
    // Delete: the ratings stay and come back with the same id
    await openMenu(page);
    page.once('dialog', d => d.accept());
    await page.locator('#srcList button', { hasText: 'Löschen' }).click();
    await expect(page.locator('#srcList li')).toHaveCount(0);
    expect((await ls(page, K.swipes)).p1).toEqual({ meine: { a: 'like' } });
    await page.fill('#srcJson', JSON.stringify(v2));
    await page.click('#btnAdd');
    await closeMenu(page);
    await expect(page.locator('#progress')).toHaveText('1 von 3 bewertet · ♥ 1 · ✕ 0');
  });

  test('results: lists, flip and remove ratings, copy, reset', async ({ page }) => {
    await page.goto(URL_);
    await page.locator('#emptyBtns button', { hasText: 'Beispiel: Emojis' }).click();
    await page.click('#btnLike');   // Hund
    await page.click('#btnNope');   // Katze
    await page.click('#btnLike');   // Maus
    await page.click('#btnResults');
    await expect(page.locator('#play')).toBeHidden();
    await expect(page.locator('.tab')).toHaveText(['♥ Gefällt mir (2)', '✕ Weg (1)']);
    await expect(page.locator('#resList b')).toHaveText(['Maus', 'Hund']);       // newest first
    await page.click('#btnCopy');
    expect(await clipboardText(page)).toBe('Maus (1F42D)\nHund (1F436)');
    // Flip Hund to “pass”, remove the rating of Maus
    await page.locator('#resList li[data-id="1F436"] button[data-act="flip"]').click();
    await page.locator('#resList li[data-id="1F42D"] button[data-act="unrate"]').click();
    await expect(page.locator('.tab')).toHaveText(['♥ Gefällt mir (0)', '✕ Weg (2)']);
    await expect(page.locator('#resInfo')).toHaveText('Noch nichts in dieser Liste.');
    await page.locator('.tab[data-tab="nope"]').click();
    await expect(page.locator('#resList b')).toHaveText(['Katze', 'Hund']);
    page.once('dialog', d => d.accept());
    await page.click('#btnResetSrc');
    await expect(page.locator('.tab')).toHaveText(['♥ Gefällt mir (0)', '✕ Weg (0)']);
    await page.click('#btnResults');
    await expect(page.locator('#card')).toHaveAttribute('data-id', '1F436');
    expect(await ls(page, K.swipes)).toEqual({ p1: {} });
  });

  test('a JSON file can be opened', async ({ page }) => {
    await page.goto(URL_);
    await openMenu(page);
    const chooser = page.waitForEvent('filechooser');
    await page.click('#btnFile');
    await (await chooser).setFiles({ name: 'quelle.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ id: 'datei', title: 'Aus Datei', items: [{ id: 1, text: '📄' }] })) });
    await expect(page.locator('#srcInfo')).toHaveText('Datei gelesen – prüfen und „Hinzufügen“ tippen.');
    await page.click('#btnAdd');
    await closeMenu(page);
    await expect(page.locator('#cardEmoji')).toHaveText('📄');
    await expect(page.locator('#cardTitle')).toHaveText('1');               // no title: the id is shown
  });

  test('WebMCP: sources and results for agents, read only', async ({ page }) => {
    await page.addInitScript(() => {
      const tools = new Map();
      document.modelContext = { registerTool: t => { tools.set(t.name, t); } };
      window.__call = (n, i) => tools.get(n).execute(i);
    });
    await page.goto(URL_);
    await page.locator('#emptyBtns button', { hasText: 'Beispiel: Emojis' }).click();
    await page.click('#btnLike');
    await page.click('#btnNope');
    await expect(page.locator('#progress')).toHaveText('2 von 36 bewertet · ♥ 1 · ✕ 1');
    const list = await page.evaluate(() => window.__call('image_swipe_list_sources', {}));
    expect(list).toEqual({ profile: 'Ich', profiles: ['Ich'], selected: 'emoji-tiere-essen',
      sources: [{ id: 'emoji-tiere-essen', title: 'Emojis: Tiere & Essen', kind: 'items', loaded: true, entries: 36, liked: 1, passed: 1 }] });
    const res = await page.evaluate(() => window.__call('image_swipe_get_results', { rating: 'like' }));
    expect(res).toEqual({ profile: 'Ich', source: 'emoji-tiere-essen', title: 'Emojis: Tiere & Essen', count: 1,
      entries: [{ id: '1F436', rating: 'like', title: 'Hund', subtitle: 'U+1F436' }] });
    const err = await page.evaluate(() => window.__call('image_swipe_get_results', { source: 'nope' }).then(() => null, e => e.message));
    expect(err).toBe('Unknown source id: nope');
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('example titles and messages in English', async ({ page }) => {
      await page.goto(URL_);
      await expect(page.locator('#emptyText')).toContainText('No data source yet.');
      await page.locator('#emptyBtns button', { hasText: 'Example: Emojis' }).click();
      await expect(page.locator('#sourceSel option:checked')).toHaveText('Emojis: animals & food');
      await expect(page.locator('#cardTitle')).toHaveText('Dog');
      await expect(page.locator('#progress')).toHaveText('0 of 36 rated · ♥ 0 · ✕ 0');
    });
  });
});
