// Stand-ins for the podcast player tests (Playwright routes, nothing leaves the machine):
// the ARD Audiothek GraphQL API (GET ?query=…&variables=…), RSS podcast feeds with and without CORS,
// a CORS proxy, transcripts and the audio files (a quiet WAV of 60 seconds).
import { FEED_ORIGIN, NOCORS_ORIGIN, PROXY_ORIGIN } from './feed-mock.mjs';

export { FEED_ORIGIN, NOCORS_ORIGIN, PROXY_ORIGIN };
export const ARD_API = 'https://api.ardaudiothek.de/graphql';
export const AUDIO_ORIGIN = 'https://audio.example.test';
/** For test.use({ allowedProblems }) – stand-in servers on purpose; blocked CORS requests are logged by the browser */
export const PODCAST_PROBLEMS = /\.example\.test|api\.ardaudiothek\.de|Failed to load resource|CORS|Access-Control/;

export const SHOW_URN = 'urn:ard:show:1234abcd5678ef90';
export const SHOW_LINK = `https://www.ardsounds.de/sendung/test-podcast/${SHOW_URN}/`;
export const EPISODE_LINK = 'https://www.ardaudiothek.de/episode/urn:ard:episode:aaaa1111bbbb2222/';
export const SECONDS = 60;

// Three episodes, newest first; the middle one has a transcript, one has no https audio (left out)
export const ARD_SHOW = {
  id: '9001', title: 'Test-Podcast', synopsis: 'Ein Podcast <b>zum Testen</b>.', sharingUrl: SHOW_LINK,
  publicationService: { title: 'Testfunk' },
  items: { totalCount: 4, nodes: [
    { id: '501', title: 'Folge drei', publishDate: '2026-11-24T04:00:00+01:00', duration: SECONDS, summary: 'Die neueste Folge.',
      sharingUrl: 'https://www.ardsounds.de/episode/urn:ard:episode:0000000000000003/',
      audios: [{ url: `${AUDIO_ORIGIN}/drei.mp4`, mimeType: 'audio/aac' }, { url: `${AUDIO_ORIGIN}/drei.mp3`, mimeType: 'audio/mp3' }], transcript: null },
    { id: '502', title: 'Folge zwei', publishDate: '2026-11-17T04:00:00+01:00', duration: SECONDS, summary: 'Mit Skript.',
      sharingUrl: 'https://www.ardsounds.de/episode/urn:ard:episode:0000000000000002/',
      audios: [{ url: `${AUDIO_ORIGIN}/zwei.mp3`, mimeType: 'audio/mp3' }], transcript: { itemId: 502 } },
    { id: '503', title: 'Folge ohne Audio', publishDate: '2026-11-12T04:00:00+01:00', duration: 100, summary: '',
      sharingUrl: '', audios: [], transcript: null },
    { id: '504', title: 'Folge eins', publishDate: '2026-11-10T04:00:00+01:00', duration: SECONDS, summary: 'Die erste.',
      sharingUrl: '', audios: [{ url: `${AUDIO_ORIGIN}/eins.mp3`, mimeType: 'audio/mp3' }], transcript: null },
  ] },
};
export const ARD_TRANSCRIPT = [
  { start: '00:00:01.000', end: '00:00:09.000', text: 'Hallo und willkommen zum Test.', speaker: { id: '1', name: 'unknown' } },
  { start: '00:00:10.000', end: '00:00:19.500', text: 'Heute geht es um Quallen im Weltall.', speaker: { id: '1', name: 'unknown' } },
  { start: '00:00:20.000', end: '00:00:39.000', text: 'Und um Tintenfische, die <b>rechnen</b> können.', speaker: { id: '2', name: 'unknown' } },
  { start: '00:00:40.000', end: '00:00:59.000', text: 'Tschüss bis zum nächsten Mal.', speaker: { id: '1', name: 'unknown' } },
];

export const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:podcast="https://podcastindex.org/namespace/1.0">
<channel><title>RSS-Testcast</title><link>${FEED_ORIGIN}/cast/</link><description>Gespräche &amp; mehr</description><itunes:author>Test Studio</itunes:author>
<item><title>Zweite RSS-Folge</title><guid isPermaLink="false">rss-2</guid><pubDate>Tue, 24 Nov 2026 06:00:00 GMT</pubDate>
<description>&lt;p&gt;Notizen mit &lt;b&gt;HTML&lt;/b&gt;&lt;/p&gt;&lt;script&gt;window.__xss=1&lt;/script&gt;</description>
<enclosure url="${AUDIO_ORIGIN}/rss2.mp3" type="audio/mpeg" length="123"/><itunes:duration>01:00</itunes:duration>
<podcast:transcript url="${FEED_ORIGIN}/rss2.txt" type="text/plain"/>
<podcast:transcript url="${FEED_ORIGIN}/rss2.vtt" type="text/vtt"/></item>
<item><title>Erste RSS-Folge</title><guid>rss-1</guid><pubDate>Tue, 17 Nov 2026 06:00:00 GMT</pubDate>
<enclosure url="${AUDIO_ORIGIN}/rss1.mp3" type="audio/mpeg" length="123"/><itunes:duration>3600</itunes:duration></item>
<item><title>Nur Text</title><guid>rss-0</guid></item>
</channel></rss>`;
export const VTT = `WEBVTT

00:00:02.000 --> 00:00:05.000
<v Anna>Guten Morgen.

00:00:05.000 --> 00:00:08.000
<v Anna>Schön, dass ihr da seid.

00:00:30.000 --> 00:00:35.000
<v Ben>Danke, Anna!
`;

/** A quiet mono WAV (8 kHz, 8 bit) */
export function wav(seconds = SECONDS) {
  const rate = 8000, n = rate * seconds, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  b.fill(128, 44);
  return b;
}

/**
 * Routes the ARD API, the feed servers, the proxy and the audio files. Returns the log of requests:
 * { ard: [{ query, variables, method, cookie, referer }], feeds: [url], audio: [url] }.
 * show: the ARD show answer (null = unknown show), transcript: the ARD transcript data.
 */
export async function mockPodcasts(page, { show = ARD_SHOW, transcript = ARD_TRANSCRIPT, rss = RSS } = {}) {
  const seen = { ard: [], feeds: [], audio: [] };
  const audio = wav();
  const cors = { 'access-control-allow-origin': '*' };
  await page.context().route(u => u.href.startsWith(ARD_API), async route => {
    const req = route.request(), u = new URL(req.url());
    const query = u.searchParams.get('query') || '', variables = JSON.parse(u.searchParams.get('variables') || '{}');
    seen.ard.push({ query, variables, method: req.method(), cookie: await req.headerValue('cookie'), referer: await req.headerValue('referer') });
    let data;
    if (/transcript\{ data/.test(query)) data = { item: { id: variables.id, transcript: variables.id === '502' ? { data: transcript, text: null } : null } };
    else if (/showId/.test(query)) data = { item: variables.id === 'urn:ard:episode:aaaa1111bbbb2222' ? { id: '777', showId: SHOW_URN, show: { id: '9001' } } : null };
    else if (/show\(id/.test(query)) data = { show: show && [SHOW_URN, '9001'].includes(variables.id) ? show : null };
    else return route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: '{"errors":[{"message":"bad"}]}' });
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ data }) });
  });
  await page.context().route(/^https:\/\/(feeds|nocors|proxy)\.example\.test\//, async route => {
    const u = new URL(route.request().url());
    seen.feeds.push(u.href);
    if (u.origin === NOCORS_ORIGIN) return route.abort('failed');
    const target = u.origin === PROXY_ORIGIN ? new URL(u.searchParams.get('url')) : u;
    const path = target.pathname;
    if (path === '/cast.xml') return route.fulfill({ status: 200, headers: cors, contentType: 'application/rss+xml', body: rss });
    if (path === '/rss2.vtt') return route.fulfill({ status: 200, headers: cors, contentType: 'text/vtt', body: VTT });
    if (path === '/rss2.txt') return route.fulfill({ status: 200, headers: cors, contentType: 'text/plain', body: 'Nur Text ohne Zeiten.' });
    if (path === '/page.html') return route.fulfill({ status: 200, headers: cors, contentType: 'text/html', body: '<!doctype html><title>Kein Feed</title>' });
    return route.fulfill({ status: 404, headers: cors, body: 'not found' });
  });
  await page.context().route(u => u.href.startsWith(AUDIO_ORIGIN + '/'), async route => {
    seen.audio.push(route.request().url());
    if (route.request().url().endsWith('/kaputt.mp3')) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'audio/wav', 'accept-ranges': 'bytes' }, body: audio });
  });
  return seen;
}
