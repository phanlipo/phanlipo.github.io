// RSS reader: feeds from stand-in servers (tests/feed-mock.mjs) – with and without CORS, through a proxy, from a file.
import { test, expect, openMenu, switchLang } from './helpers.mjs';
import { FEED_ORIGIN, NOCORS_ORIGIN, PROXY_ORIGIN, FEED_PROBLEMS, RSS, mockFeeds } from './feed-mock.mjs';

const URL_ = '/rss-reader/';
const items = page => page.locator('#items .item');
const titles = page => page.locator('#items .item .i-title');

async function addFeed(page, url, name = '') {
  if (!(await page.locator('#manage').evaluate(d => d.open))) await page.locator('#manage > summary').click();
  await page.fill('#feedUrl', url);
  await page.fill('#feedName', name);
  await page.click('#btnAdd');
}

test.use({ allowedProblems: FEED_PROBLEMS });

test.describe('RSS reader', () => {
  test('add an RSS feed: entries newest first, categories, search, read marks – saved over a reload', async ({ page }) => {
    const seen = await mockFeeds(page);
    await page.goto(URL_);
    await expect(page.locator('#items')).toContainText('Unter „Feeds verwalten“ einen Feed hinzufügen.');
    await expect(page.locator('#manage')).toHaveJSProperty('open', true);
    await addFeed(page, `${FEED_ORIGIN}/rss.xml`);
    await expect(titles(page)).toHaveText(['Teams: Neue Ansicht', 'Outlook: Ordner teilen', 'Outlook: Kalender drucken']);
    // Title from the feed, unread count in the selection
    await expect(page.locator('#feedSel option:checked')).toHaveText('Roadmap Test (3 ungelesen)');
    await expect(page.locator('#status')).toContainText('3 Einträge');
    await expect(page.locator('#itemCount')).toHaveText('3');
    // No cookies, no referrer
    expect(seen).toHaveLength(1);
    expect(seen[0].cookie).toBeNull();
    expect(seen[0].referer).toBeNull();
    // Dates in the page language
    await expect(items(page).first().locator('.i-meta')).toContainText('14.11.2026');
    await expect(items(page).first().locator('.badge')).toHaveText(['In development', 'Teams']);

    // Category filter (sorted, with counts)
    await expect(page.locator('#cat option')).toHaveText(['Alle Kategorien', 'In development (2)', 'Outlook (2)', 'Rolling out (1)', 'Teams (1)']);
    await page.selectOption('#cat', 'Outlook');
    await expect(titles(page)).toHaveText(['Outlook: Ordner teilen', 'Outlook: Kalender drucken']);
    await expect(page.locator('#itemCount')).toHaveText('2 von 3');
    // Search in the text too (entity decoded), all words must match
    await page.selectOption('#cat', '');
    await page.fill('#q', 'kalendern listen');
    await expect(titles(page)).toHaveText(['Outlook: Kalender drucken']);
    await page.fill('#q', 'zzz');
    await expect(page.locator('#items')).toContainText('Kein Eintrag passt zum Filter.');
    await page.fill('#q', '');

    // Opening an entry marks it read
    await items(page).nth(1).locator('summary').click();
    await expect(items(page).nth(1)).not.toHaveClass(/unread/);
    await expect(items(page).nth(1).locator('.i-body')).toContainText('Ordner lassen sich teilen.');
    await expect(items(page).nth(1).getByRole('link', { name: 'Im Browser öffnen' })).toHaveAttribute('href', `${FEED_ORIGIN}/roadmap?id=1002`);
    await expect(page.locator('#feedSel option:checked')).toHaveText('Roadmap Test (2 ungelesen)');
    await page.check('#unreadOnly');
    await expect(titles(page)).toHaveText(['Teams: Neue Ansicht', 'Outlook: Kalender drucken']);

    // Reload: feeds, entries, read marks and the filter setting stay – nothing is fetched by itself
    await page.reload();
    await expect(page.locator('#unreadOnly')).toBeChecked();
    await expect(titles(page)).toHaveText(['Teams: Neue Ansicht', 'Outlook: Kalender drucken']);
    expect(seen).toHaveLength(1);
    await page.uncheck('#unreadOnly');
    await page.click('#btnAllRead');
    await expect(page.locator('#items .item.unread')).toHaveCount(0);
    await expect(page.locator('#feedSel option:checked')).toHaveText('Roadmap Test');
    await expect(page.locator('#btnAllRead')).toBeDisabled();
    // Refresh fetches again, read marks stay
    await page.click('#btnRefresh');
    await expect.poll(() => seen.length).toBe(2);
    await expect(page.locator('#items .item.unread')).toHaveCount(0);
  });

  test('feed content is shown safely: no scripts, handlers, images or javascript: links; links open in a new tab', async ({ page }) => {
    await mockFeeds(page);
    await page.goto(URL_);
    await addFeed(page, `${FEED_ORIGIN}/rss.xml`);
    await items(page).first().locator('summary').click();
    const body = items(page).first().locator('.i-body .content');
    await expect(body).toContainText('Eine neue Ansicht.');
    await expect(body.locator('strong')).toHaveText('neue');
    // Image replaced by its alt text, nothing loaded
    await expect(body).toContainText('[Bild]');
    await expect(body.locator('img, script, [onerror]')).toHaveCount(0);
    // javascript: link loses the link, relative link is resolved against the entry link
    await expect(body.locator('a')).toHaveCount(1);
    await expect(body).toContainText('böser Link');
    const a = body.getByRole('link', { name: 'Details' });
    await expect(a).toHaveAttribute('href', `${FEED_ORIGIN}/details`);
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', 'noopener noreferrer');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('Atom feed next to RSS: "All feeds" merges by date, names from the feed or the user', async ({ page }) => {
    await mockFeeds(page);
    await page.goto(URL_);
    await addFeed(page, `${FEED_ORIGIN}/rss.xml`, 'Roadmap');
    await expect(titles(page)).toHaveCount(3);
    await addFeed(page, `${FEED_ORIGIN}/atom.xml`);
    await expect(titles(page)).toHaveText(['Erster & bester Beitrag', 'Zweiter Beitrag']);
    await expect(page.locator('#feedSel option:checked')).toHaveText('Atom Blog (2 ungelesen)');
    await items(page).first().locator('summary').click();
    const body = items(page).first().locator('.i-body .content');
    // Headings one level below the entry, iframes dropped
    await expect(body.locator('h4')).toHaveText('Überschrift');
    await expect(body.locator('em')).toHaveText('Betonung');
    await expect(body.locator('iframe')).toHaveCount(0);
    await expect(items(page).first().locator('.badge')).toHaveText(['Neuigkeiten']);

    await page.selectOption('#feedSel', 'all');
    await expect(page.locator('#feedSel option')).toHaveText(['Alle Feeds (4 ungelesen)', 'Roadmap (3 ungelesen)', 'Atom Blog (1 ungelesen)']);
    await expect(titles(page)).toHaveText(['Teams: Neue Ansicht', 'Outlook: Ordner teilen', 'Outlook: Kalender drucken', 'Erster & bester Beitrag', 'Zweiter Beitrag']);
    await expect(items(page).first().locator('.i-meta')).toContainText('Roadmap');
    // Refresh with "All feeds" loads every feed
    await page.click('#btnRefresh');
    await expect(page.locator('#toast')).toHaveText('5 Einträge geladen');
  });

  test('feed without CORS (like Microsoft 365 Roadmap): explained, then loaded through the own proxy and remembered', async ({ page }) => {
    const seen = await mockFeeds(page);
    await page.goto(URL_);
    await page.click('#btnExample');
    await expect(page.locator('#feedUrl')).toHaveValue('https://www.microsoft.com/releasecommunications/api/v2/m365/rss/');
    await expect(page.locator('#feedName')).toHaveValue('Microsoft 365 Roadmap');
    await addFeed(page, `${NOCORS_ORIGIN}/m365/rss/`, 'M365');
    const err = page.locator('#feedError');
    await expect(err).toContainText('M365: Der Anbieter erlaubt Browsern nicht, diesen Feed direkt abzurufen (CORS).');
    await expect(err).toContainText('XML-Datei öffnen');
    await expect(err.getByRole('link', { name: 'Feed im Browser öffnen' })).toHaveAttribute('href', `${NOCORS_ORIGIN}/m365/rss/`);
    await expect(page.locator('#status')).toHaveText('Noch nicht geladen – „Aktualisieren“ tippen.');

    // Proxy in the menu: http:// rejected, https:// with {url} accepted
    await openMenu(page);
    await page.fill('#proxy', 'http://proxy.example.test/?url={url}');
    await page.click('#btnProxy');
    await expect(page.locator('#proxyError')).toHaveText('Bitte eine https://-Adresse eingeben (oder leer lassen).');
    await page.fill('#proxy', `${PROXY_ORIGIN}/?url={url}`);
    await page.click('#btnProxy');
    await expect(page.locator('#proxyError')).toBeEmpty();
    await expect(page.locator('#appMenu')).toBeHidden();

    await page.click('#btnRefresh');
    await expect(titles(page)).toHaveCount(3);
    await expect(err).toBeHidden();
    const viaProxy = seen.filter(s => s.url.startsWith(PROXY_ORIGIN));
    expect(viaProxy).toHaveLength(1);
    expect(new URL(viaProxy[0].url).searchParams.get('url')).toBe(`${NOCORS_ORIGIN}/m365/rss/`);
    // Next time straight through the proxy, no failing direct request first
    const before = seen.filter(s => s.url.startsWith(NOCORS_ORIGIN)).length;
    await page.click('#btnRefresh');
    await expect.poll(() => seen.filter(s => s.url.startsWith(PROXY_ORIGIN)).length).toBe(2);
    expect(seen.filter(s => s.url.startsWith(NOCORS_ORIGIN)).length).toBe(before);
  });

  test('saved XML file: goes into the feed with the same address, or a new one; wrong files are reported', async ({ page }) => {
    await mockFeeds(page);
    await page.goto(URL_);
    // New feed from the file: address from the channel link
    await page.setInputFiles('#fileIn', { name: 'rss.xml', mimeType: 'application/rss+xml', buffer: Buffer.from(RSS) });
    await expect(titles(page)).toHaveCount(3);
    await expect(page.locator('#feedSel option:checked')).toHaveText('Roadmap Test (3 ungelesen)');
    await expect(page.locator('#status')).toContainText('(aus Datei)');
    await page.locator('#manage > summary').click();
    await expect(page.locator('#feedList .f-url')).toHaveText([`${NOCORS_ORIGIN}/m365/rss`]);
    // Same file again with "All feeds": matched by address, no second feed
    await page.selectOption('#feedSel', 'all');
    await page.setInputFiles('#fileIn', { name: 'rss.xml', mimeType: 'application/rss+xml', buffer: Buffer.from(RSS) });
    await expect(page.locator('#feedList li')).toHaveCount(1);
    // Not a feed
    await page.setInputFiles('#fileIn', { name: 'seite.html', mimeType: 'text/html', buffer: Buffer.from('<!doctype html><title>x</title><p>Hallo') });
    await expect(page.locator('#feedError')).toHaveText('Datei „seite.html“: Die Antwort ist kein lesbares XML.');
    await page.setInputFiles('#fileIn', { name: 'x.xml', mimeType: 'text/xml', buffer: Buffer.from('<?xml version="1.0"?><note>x</note>') });
    await expect(page.locator('#feedError')).toHaveText('Datei „x.xml“: Das ist kein RSS- oder Atom-Feed.');
  });

  test('manage feeds: invalid, http and duplicate addresses rejected; edit and delete', async ({ page }) => {
    await mockFeeds(page);
    await page.goto(URL_);
    await addFeed(page, 'keine adresse');
    await expect(page.locator('#addError')).toHaveText('Bitte eine gültige Adresse mit https:// eingeben.');
    await addFeed(page, 'http://feeds.example.test/rss.xml');
    await expect(page.locator('#addError')).toHaveText(/nur über einen eigenen Proxy/);
    await addFeed(page, `${FEED_ORIGIN}/rss.xml`);
    await expect(titles(page)).toHaveCount(3);
    await addFeed(page, `${FEED_ORIGIN}/rss.xml/`);
    await expect(page.locator('#addError')).toHaveText('Dieser Feed ist schon in der Liste.');
    // Server answers with something else than a feed
    await addFeed(page, `${FEED_ORIGIN}/broken.xml`, 'Kaputt');
    await expect(page.locator('#feedError')).toHaveText('Kaputt: Die Antwort ist kein lesbares XML.');
    await addFeed(page, `${FEED_ORIGIN}/fehlt.xml`, 'Fehlt');
    await expect(page.locator('#feedError')).toHaveText('Fehlt: Der Server meldet Fehler 404.');

    // Edit: rename "Fehlt" and point it to the Atom feed
    await page.getByRole('button', { name: 'Bearbeiten: Fehlt' }).click();
    await expect(page.locator('#h-add')).toHaveText('Feed bearbeiten');
    await expect(page.locator('#feedUrl')).toHaveValue(`${FEED_ORIGIN}/fehlt.xml`);
    await page.fill('#feedUrl', `${FEED_ORIGIN}/atom.xml`);
    await page.fill('#feedName', 'Blog');
    await page.click('#btnAdd');
    await expect(page.locator('#feedList .f-name')).toHaveText(['Roadmap Test', 'Kaputt', 'Blog']);
    await expect(page.locator('#h-add')).toHaveText('Feed hinzufügen');

    // Delete after confirming
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Löschen: Kaputt' }).click();
    await expect(page.locator('#feedList .f-name')).toHaveText(['Roadmap Test', 'Blog']);
    page.once('dialog', d => d.dismiss());
    await page.getByRole('button', { name: 'Löschen: Blog' }).click();
    await expect(page.locator('#feedList .f-name')).toHaveText(['Roadmap Test', 'Blog']);
    await page.reload();
    await page.locator('#manage > summary').click();
    await expect(page.locator('#feedList .f-name')).toHaveText(['Roadmap Test', 'Blog']);
  });

  test('link shared to the installed app fills in the form', async ({ page }) => {
    await page.goto(`${URL_}?title=Mein%20Blog&text=Schau%20mal%20${encodeURIComponent(`${FEED_ORIGIN}/atom.xml`)}`);
    await expect(page.locator('#manage')).toHaveJSProperty('open', true);
    await expect(page.locator('#feedUrl')).toHaveValue(`${FEED_ORIGIN}/atom.xml`);
    await expect(page.locator('#feedName')).toHaveValue('Mein Blog');
    expect(new URL(page.url()).search).toBe('');
  });

  test('works offline with the entries loaded last', async ({ page, context }) => {
    await mockFeeds(page);
    await page.goto(URL_);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await addFeed(page, `${FEED_ORIGIN}/rss.xml`);
    await expect(titles(page)).toHaveCount(3);
    await page.reload();
    await context.unrouteAll();
    await context.setOffline(true);
    await page.reload();
    await expect(titles(page)).toHaveCount(3);
    await items(page).first().locator('summary').click();
    await expect(items(page).first().locator('.i-body')).toContainText('Eine neue Ansicht.');
    await page.click('#btnRefresh');
    await expect(page.locator('#feedError')).toHaveText('Roadmap Test: Keine Verbindung zum Internet.');
    await expect(titles(page)).toHaveCount(3);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, errors and dates in English', async ({ page }) => {
    await mockFeeds(page);
    await page.goto(URL_);
    await switchLang(page, 'en');
    await expect(page.locator('#items')).toContainText('Add a feed under “Manage feeds”.');
    await addFeed(page, `${FEED_ORIGIN}/rss.xml`);
    await expect(page.locator('#feedSel option:checked')).toHaveText('Roadmap Test (3 unread)');
    await expect(items(page).first().locator('.i-meta')).toContainText('14 Nov 2026');
    await expect(page.locator('#cat option').first()).toHaveText('All categories');
    await addFeed(page, `${NOCORS_ORIGIN}/m365/rss/`);
    await expect(page.locator('#feedError')).toContainText('does not allow browsers to fetch this feed directly (CORS)');
  });
});
