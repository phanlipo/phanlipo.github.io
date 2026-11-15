// Stand-in feed servers for the RSS reader tests (Playwright routes on *.example.test, nothing leaves the machine).
// One server allows CORS, one does not (like the Microsoft 365 Roadmap feed) – that one only works via a proxy or a file.

export const FEED_ORIGIN = 'https://feeds.example.test';
export const NOCORS_ORIGIN = 'https://nocors.example.test';
export const PROXY_ORIGIN = 'https://proxy.example.test';
/** For test.use({ allowedProblems }) – the page talks to the stand-in servers on purpose; the CORS block is logged by the browser */
export const FEED_PROBLEMS = /\.example\.test|Failed to load resource|CORS|Access-Control/;

// RSS 2.0 shaped like the Microsoft 365 Roadmap feed: several categories, escaped HTML, "Z" after a space in dates
export const RSS = `\uFEFF<?xml version="1.0" encoding="utf-8"?><rss xmlns:a10="http://www.w3.org/2005/Atom" version="2.0"><channel>
<title>Roadmap Test</title><link>${NOCORS_ORIGIN}/m365/rss</link><description>Test</description>
<item><guid isPermaLink="false">1001</guid><link>${FEED_ORIGIN}/roadmap?id=1001</link>
<category>In development</category><category>Teams</category><title>Teams: Neue Ansicht</title>
<description>&lt;p&gt;Eine &lt;strong&gt;neue&lt;/strong&gt; Ansicht.&lt;/p&gt;&lt;img src="https://tracker.example.test/x.png" alt="Bild" onerror="window.__xss=1"&gt;&lt;script&gt;window.__xss=2&lt;/script&gt;&lt;a href="javascript:window.__xss=3"&gt;böser Link&lt;/a&gt; &lt;a href="/details"&gt;Details&lt;/a&gt;</description>
<pubDate>Sat, 14 Nov 2026 10:00:00 Z</pubDate><a10:updated>2026-11-14T10:00:00Z</a10:updated></item>
<item><guid isPermaLink="false">1002</guid><link>${FEED_ORIGIN}/roadmap?id=1002</link>
<category>Rolling out</category><category>Outlook</category><title>Outlook: Ordner teilen</title>
<description>&lt;p&gt;Ordner lassen sich teilen.&lt;/p&gt;</description><pubDate>Fri, 13 Nov 2026 09:00:00 Z</pubDate></item>
<item><guid isPermaLink="false">1003</guid><link>${FEED_ORIGIN}/roadmap?id=1003</link>
<category>In development</category><category>Outlook</category><title>Outlook: Kalender drucken</title>
<description>Drucken von Kalendern &amp;amp; Listen</description><pubDate>Thu, 12 Nov 2026 08:00:00 Z</pubDate></item>
</channel></rss>`;

export const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom Blog</title>
<link rel="alternate" href="${FEED_ORIGIN}/blog/"/><link rel="self" href="${FEED_ORIGIN}/atom.xml"/>
<updated>2026-11-10T12:00:00Z</updated><id>urn:blog</id>
<entry><title type="html">Erster &amp;amp; bester Beitrag</title><id>urn:blog:1</id><link href="${FEED_ORIGIN}/blog/1"/>
<published>2026-11-10T12:00:00Z</published><category term="news" label="Neuigkeiten"/>
<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><h1>Überschrift</h1><p>Inhalt mit <em>Betonung</em>.</p><iframe src="https://evil.example.test/"></iframe></div></content></entry>
<entry><title>Zweiter Beitrag</title><id>urn:blog:2</id><link href="${FEED_ORIGIN}/blog/2"/>
<updated>2026-11-09T12:00:00Z</updated><summary>Nur eine Zusammenfassung</summary></entry>
</feed>`;

/** Serves the feeds: FEED_ORIGIN with CORS, NOCORS_ORIGIN without, PROXY_ORIGIN/?url=… fetches from either. Returns the requests. */
export async function mockFeeds(page, { rss = RSS, atom = ATOM } = {}) {
  const seen = [];
  const body = path => path.endsWith('/atom.xml') ? [atom, 'application/atom+xml'] : path.includes('/m365/rss') || path.endsWith('/rss.xml') ? [rss, 'application/rss+xml'] : null;
  await page.context().route(/^https:\/\/(feeds|nocors|proxy)\.example\.test\//, async route => {
    const req = route.request();
    const u = new URL(req.url());
    seen.push({ url: req.url(), cookie: await req.headerValue('cookie'), referer: await req.headerValue('referer') });
    // Fulfilled responses skip the browser's CORS check – a blocked request looks like a failed one to the page
    if (u.origin === NOCORS_ORIGIN) return route.abort('failed');
    let target = u;
    if (u.origin === PROXY_ORIGIN) target = new URL(u.searchParams.get('url'));
    const found = body(target.pathname);
    if (target.pathname === '/broken.xml')
      return route.fulfill({ status: 200, headers: { 'content-type': 'text/html', 'access-control-allow-origin': '*' }, body: '<!doctype html><p>Kein Feed' });
    if (!found) return route.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' }, body: 'not found' });
    return route.fulfill({ status: 200, headers: { 'content-type': found[1], 'access-control-allow-origin': '*' }, body: found[0] });
  });
  return seen;
}
