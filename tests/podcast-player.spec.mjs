// Podcast player: ARD Audiothek API, RSS feeds, audio and transcripts from stand-in servers (tests/podcast-mock.mjs).
import { test, expect, openMenu, closeMenu, switchLang, switchTheme, clipboardText, axe } from './helpers.mjs';
import { ARD_API, AUDIO_ORIGIN, FEED_ORIGIN, NOCORS_ORIGIN, PROXY_ORIGIN, PODCAST_PROBLEMS, SHOW_LINK, SHOW_URN, EPISODE_LINK,
  mockPodcasts } from './podcast-mock.mjs';

const URL_ = '/podcast-player/';
const rows = page => page.locator('#eps > li');
const names = page => page.locator('#eps .name');
const audioState = page => page.evaluate(() => { const a = document.getElementById('audio'); return { t: a.currentTime, paused: a.paused, src: a.getAttribute('src') }; });

async function add(page, url) {
  if (!(await page.locator('#setupCard').isVisible())) {
    await openMenu(page);
    await page.click('#btnNew');
  }
  await page.fill('#podUrl', url);
  await page.click('#btnAdd');
}

test.use({ allowedProblems: PODCAST_PROBLEMS });

test.describe('podcast-player', () => {
  test('ARD show by link: episodes newest first, without the one lacking audio – one GET without cookies', async ({ page }) => {
    const seen = await mockPodcasts(page);
    await page.goto(URL_);
    await expect(page.locator('#setupCard')).toBeVisible();
    await expect(page.locator('#listCard')).toBeHidden();
    await add(page, SHOW_LINK);
    await expect(page.locator('#podTitle')).toHaveText('Test-Podcast');
    await expect(names(page)).toHaveText(['Folge drei', 'Folge zwei', 'Folge eins']);
    await expect(page.locator('#status')).toContainText('3 von 4 Folgen');
    // Plain text of the synopsis, never markup
    await expect(page.locator('#podText')).toHaveText('Ein Podcast zum Testen.');
    await expect(rows(page).nth(0).locator('.meta')).toHaveText('24.11.2026 · 1 min');
    // Only the episode with a transcript has the mark and the button
    await expect(rows(page).nth(1).locator('.tag')).toHaveText('Skript');
    await expect(page.locator('#eps .btn.icon')).toHaveCount(1);
    await expect(page.locator('#eps .btn.icon')).toHaveAttribute('aria-label', 'Skript: Folge zwei');
    expect(seen.ard).toHaveLength(1);
    expect(seen.ard[0]).toMatchObject({ method: 'GET', variables: { id: SHOW_URN, n: 300 }, cookie: null, referer: null });
    expect(seen.audio).toEqual([]);
    // Same show again: refused, nothing added
    await add(page, `urn:ard:show:${SHOW_URN.split(':').pop()}`);
    await expect(page.locator('#addError')).toHaveText('Dieser Podcast ist schon in der Liste.');
  });

  test('a link to an episode adds its show; unknown shows and wrong links give a message', async ({ page }) => {
    const seen = await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, 'keine adresse');
    await expect(page.locator('#addError')).toHaveText('Bitte einen Link (https://…) oder eine ARD-URN eintragen.');
    await add(page, 'https://www.ardaudiothek.de/rubrik/wissen/');
    await expect(page.locator('#addError')).toContainText('keine Sendung');
    await add(page, 'https://www.ardsounds.de/sendung/weg/urn:ard:show:ffffffffffffffff/');
    await expect(page.locator('#addError')).toHaveText('Die ARD Audiothek kennt diese Sendung nicht (mehr).');
    await expect(page.locator('#setupCard')).toBeVisible();
    await add(page, EPISODE_LINK);
    await expect(page.locator('#podTitle')).toHaveText('Test-Podcast');
    expect(seen.ard.map(r => r.variables.id)).toEqual(['urn:ard:show:ffffffffffffffff', 'urn:ard:episode:aaaa1111bbbb2222', SHOW_URN]);
  });

  test('play, skip, speed and resume after a reload – audio only after a tap', async ({ page }) => {
    const seen = await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await expect(page.locator('#playerCard')).toBeHidden();
    await rows(page).nth(0).locator('.open').click();
    await expect(page.locator('#playerCard')).toBeVisible();
    await expect(page.locator('#nowTitle')).toHaveText('Folge drei');
    await expect(page.locator('#nowPod')).toHaveText('Test-Podcast');
    // MP3 preferred over AAC
    expect(seen.audio).toEqual([`${AUDIO_ORIGIN}/drei.mp3`]);
    await expect.poll(async () => (await audioState(page)).paused).toBe(false);
    await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Pause');
    await expect(rows(page).nth(0)).toHaveAttribute('aria-current', 'true');
    await page.click('#btnFwd');
    await expect.poll(async () => (await audioState(page)).t).toBeGreaterThanOrEqual(30);
    await page.click('#btnBack');
    await expect.poll(async () => (await audioState(page)).t).toBeLessThan(25);
    // Speed: tap to cycle 1× → 1,25× (saved)
    await expect(page.locator('#rateLabel')).toHaveText('1×');
    await page.click('#btnRate');
    await expect(page.locator('#rateLabel')).toHaveText('1,25×');
    expect(await page.evaluate(() => document.getElementById('audio').playbackRate)).toBe(1.25);
    // Jump to 40 s with the slider, pause: the position is saved
    await page.locator('#seek').fill('40');
    await page.click('#btnPlay');
    await expect.poll(async () => (await audioState(page)).paused).toBe(true);
    const at = (await audioState(page)).t;
    expect(at).toBeGreaterThanOrEqual(40);
    await expect(rows(page).nth(0).locator('.meta')).toContainText('noch 1 min');
    await expect(rows(page).nth(0).locator('.ep-bar i')).toHaveCount(1);

    await page.reload();
    // Player restored, no request before a tap
    await expect(page.locator('#nowTitle')).toHaveText('Folge drei');
    await expect(page.locator('#tNow')).toHaveText(`0:${String(Math.floor(at)).padStart(2, '0')}`);
    await expect(page.locator('#rateLabel')).toHaveText('1,25×');
    expect((await audioState(page)).src).toBeNull();
    expect(seen.audio).toHaveLength(1);
    await page.click('#btnPlay');
    await expect.poll(async () => (await audioState(page)).paused).toBe(false);
    // Playing starts paused=false at once; the saved position is applied as soon as the file's length is known
    await expect.poll(async () => (await audioState(page)).t).toBeGreaterThanOrEqual(Math.floor(at));
    expect(seen.audio).toHaveLength(2);
    expect(seen.ard).toHaveLength(1); // the list comes from storage
  });

  test('an episode heard to the end is marked played; the mark can be switched by hand', async ({ page }) => {
    await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await rows(page).nth(2).locator('.open').click();
    await expect.poll(async () => (await audioState(page)).paused).toBe(false);
    await page.locator('#seek').fill('58');
    await expect(page.locator('#btnDone')).toHaveAttribute('aria-pressed', 'true', { timeout: 10000 });
    await expect(rows(page).nth(2)).toHaveClass(/done/);
    await expect(rows(page).nth(2).locator('.meta')).toHaveText('10.11.2026 · Gehört');
    await page.click('#btnDone');
    await expect(page.locator('#btnDone')).toHaveAttribute('aria-pressed', 'false');
    await expect(rows(page).nth(2).locator('.meta')).toHaveText('10.11.2026 · 1 min');
  });

  test('ARD transcript: voices, time marks jump, the spoken part is highlighted, search, copy and save', async ({ page }) => {
    const seen = await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await rows(page).nth(1).locator('.btn.icon').click();
    await expect(page.locator('#trCard')).toBeVisible();
    await expect(page.locator('#trTitle')).toHaveText('Folge zwei');
    await expect(page.locator('#trStatus')).toHaveText('4 Abschnitte');
    expect(seen.ard.at(-1)).toMatchObject({ variables: { id: '502' } });
    expect(seen.audio).toEqual([]); // reading needs no audio
    const segs = page.locator('#trBody .seg');
    await expect(segs.locator('.ts')).toHaveText(['0:01', '0:10', '0:20', '0:40']);
    // Speaker shown when it changes; markup in the text is not taken over
    await expect(segs.locator('.who')).toHaveText(['Stimme 1', 'Stimme 2', 'Stimme 1']);
    await expect(segs.nth(2).locator('p')).toHaveText('Stimme 2Und um Tintenfische, die rechnen können.');
    await expect(segs.nth(2).locator('b')).toHaveCount(0);
    // Time mark: plays this episode from there, the part is highlighted
    await segs.nth(2).locator('.ts').click();
    await expect(page.locator('#nowTitle')).toHaveText('Folge zwei');
    await expect.poll(async () => (await audioState(page)).t).toBeGreaterThanOrEqual(20);
    await expect(segs.nth(2)).toHaveClass(/\bon\b/);
    await expect(segs.nth(2)).toHaveAttribute('aria-current', 'true');
    await page.click('#btnPlay');
    await segs.nth(3).locator('.ts').click();
    await expect(segs.nth(3)).toHaveClass(/\bon\b/);
    await expect(page.locator('#trBody .seg.on')).toHaveCount(1);
    // Search: only matching parts, hits marked
    await page.fill('#trQ', 'quallen');
    await expect(segs).toHaveCount(1);
    await expect(segs.locator('mark')).toHaveText('Quallen');
    await expect(page.locator('#trStatus')).toHaveText('1 von 4 Abschnitten passen');
    await page.fill('#trQ', '');
    await page.click('#btnTrCopy');
    const text = await clipboardText(page);
    expect(text).toBe('Folge zwei\nTest-Podcast\n\n[0:01] Stimme 1: Hallo und willkommen zum Test.\n\n[0:10] Heute geht es um Quallen im Weltall.\n\n'
      + '[0:20] Stimme 2: Und um Tintenfische, die rechnen können.\n\n[0:40] Stimme 1: Tschüss bis zum nächsten Mal.\n');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnTrSave')]);
    expect(dl.suggestedFilename()).toBe('Folge zwei.txt');
    await page.click('#btnTrClose');
    await expect(page.locator('#trCard')).toBeHidden();
    // From the player as well
    await page.click('#btnNowTr');
    await expect(page.locator('#trStatus')).toHaveText('4 Abschnitte');
  });

  test('accessible with episodes, player and transcript open – light and dark', async ({ page }) => {
    await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await rows(page).nth(1).locator('.btn.icon').click();
    await page.locator('#trBody .seg .ts').nth(1).click();
    await expect(page.locator('#trBody .seg.on')).toHaveCount(1);
    await page.click('#btnPlay');
    for (const theme of ['light', 'dark']) {
      await switchTheme(page, theme);
      const { violations } = await axe(page).analyze();
      expect(violations.map(v => `${theme}: ${v.id} ${v.nodes.map(n => n.target).join(' ')}`)).toEqual([]);
    }
  });

  test('a transcript the ARD has no text for says so', async ({ page }) => {
    await mockPodcasts(page, { transcript: null });
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await rows(page).nth(1).locator('.btn.icon').click();
    await expect(page.locator('#trStatus')).toHaveText('Für diese Folge gibt es kein Skript.');
    await expect(page.locator('#trTools')).toBeHidden();
  });

  test('RSS feed: episodes with audio, durations, plain show notes and a WebVTT transcript', async ({ page }) => {
    const seen = await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, `${FEED_ORIGIN}/cast.xml`);
    await expect(page.locator('#podTitle')).toHaveText('RSS-Testcast');
    await expect(names(page)).toHaveText(['Zweite RSS-Folge', 'Erste RSS-Folge']);
    await expect(rows(page).locator('.meta')).toHaveText(['24.11.2026 · 1 minSkript', '17.11.2026 · 60 min']);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await rows(page).nth(0).locator('.btn.icon').click();
    // VTT preferred over plain text; cues of one speaker within 20 s joined
    await expect(page.locator('#trStatus')).toHaveText('2 Abschnitte');
    await expect(page.locator('#trBody .seg .ts')).toHaveText(['0:02', '0:30']);
    await expect(page.locator('#trBody .seg p')).toHaveText(['AnnaGuten Morgen. Schön, dass ihr da seid.', 'BenDanke, Anna!']);
    expect(seen.feeds).toEqual([`${FEED_ORIGIN}/cast.xml`, `${FEED_ORIGIN}/rss2.vtt`]);
    await rows(page).nth(0).locator('.open').click();
    await expect.poll(() => seen.audio).toEqual([`${AUDIO_ORIGIN}/rss2.mp3`]);
  });

  test('a feed without CORS needs the own proxy, which is then remembered; no feed: message', async ({ page }) => {
    const seen = await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, `${NOCORS_ORIGIN}/cast.xml`);
    await expect(page.locator('#addError')).toContainText('CORS');
    await add(page, `${FEED_ORIGIN}/page.html`);
    await expect(page.locator('#addError')).toHaveText('Die Adresse liefert keinen Feed (kein XML).');
    await openMenu(page);
    await page.fill('#proxy', `${PROXY_ORIGIN}/?url={url}`);
    await page.click('#btnProxy');
    await closeMenu(page);
    await add(page, `${NOCORS_ORIGIN}/cast.xml`);
    await expect(page.locator('#podTitle')).toHaveText('RSS-Testcast');
    const proxied = `${PROXY_ORIGIN}/?url=${encodeURIComponent(`${NOCORS_ORIGIN}/cast.xml`)}`;
    expect(seen.feeds.slice(-2)).toEqual([`${NOCORS_ORIGIN}/cast.xml`, proxied]);
    // Refresh goes straight to the proxy
    await page.click('#btnRefresh');
    await expect(page.locator('#status')).toContainText('2 Folgen');
    expect(seen.feeds.at(-1)).toBe(proxied);
  });

  test('several podcasts: choose one; save as RSS feed; delete with undo', async ({ page }) => {
    await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await expect(page.locator('#podTitle')).toHaveText('Test-Podcast');
    await add(page, `${FEED_ORIGIN}/cast.xml`);
    await expect(page.locator('#podTitle')).toHaveText('RSS-Testcast');
    await expect(page.locator('#podSel option')).toHaveText(['Test-Podcast', 'RSS-Testcast']);
    await page.selectOption('#podSel', { label: 'Test-Podcast' });
    await expect(names(page)).toHaveText(['Folge drei', 'Folge zwei', 'Folge eins']);
    await page.fill('#q', 'erste');
    await expect(names(page)).toHaveText(['Folge eins']);
    await page.fill('#q', 'nichts');
    await expect(page.locator('#epsEmpty')).toHaveText('Keine Folge passt zur Suche.');
    await page.fill('#q', '');

    await openMenu(page);
    await expect(page.locator('#podRows .name')).toHaveText(['Test-Podcast', 'RSS-Testcast']);
    await expect(page.locator('#podRows .meta')).toHaveText(['3 Folgen · ARD', '2 Folgen · RSS']);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'RSS-Feed von „Test-Podcast“ herunterladen' }).click()]);
    expect(dl.suggestedFilename()).toBe('Test-Podcast.xml');
    const xml = await (await dl.createReadStream()).toArray().then(c => Buffer.concat(c).toString('utf8'));
    expect(xml).toContain('<title>Test-Podcast</title>');
    expect(xml).toContain('<itunes:author>Testfunk</itunes:author>');
    expect(xml).toContain(`<enclosure url="${AUDIO_ORIGIN}/drei.mp3" type="audio/mp3" length="0"/>`);
    expect(xml).toContain('<pubDate>Tue, 24 Nov 2026 03:00:00 GMT</pubDate>');
    expect((xml.match(/<item>/g) || []).length).toBe(3);
    // The file is a valid feed the app itself reads
    const back = await page.evaluate(x => window.Podcast.parseRss(x).episodes.map(e => [e.title, e.dur]), xml);
    expect(back).toEqual([['Folge drei', 60], ['Folge zwei', 60], ['Folge eins', 60]]);

    await page.getByRole('button', { name: '„Test-Podcast“ löschen' }).click();
    await expect(page.locator('#podRows .name')).toHaveText(['RSS-Testcast']);
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.locator('#podRows .name')).toHaveText(['Test-Podcast', 'RSS-Testcast']);
    await page.getByRole('button', { name: '„RSS-Testcast“ löschen' }).click();
    await page.getByRole('button', { name: '„Test-Podcast“ löschen' }).click();
    await closeMenu(page);
    await expect(page.locator('#setupCard')).toBeVisible();
    await page.reload();
    await expect(page.locator('#setupCard')).toBeVisible();
  });

  test('a link shared to the app fills in the form', async ({ page }) => {
    await mockPodcasts(page);
    await page.goto(`${URL_}?title=${encodeURIComponent('Test')}&text=${encodeURIComponent('Hör mal: ' + SHOW_LINK)}`);
    await expect(page.locator('#podUrl')).toHaveValue(SHOW_LINK);
    await expect(page).toHaveURL(/podcast-player\/$/);
  });

  test('audio that cannot be loaded shows a message', async ({ page }) => {
    const show = structuredClone((await import('./podcast-mock.mjs')).ARD_SHOW);
    show.items.nodes[0].audios = [{ url: `${AUDIO_ORIGIN}/kaputt.mp3`, mimeType: 'audio/mp3' }];
    await mockPodcasts(page, { show });
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await rows(page).nth(0).locator('.open').click();
    await expect(page.locator('#playError')).toHaveText('Die Folge lässt sich nicht abspielen. Ist der Server erreichbar?');
  });

  test('parsing: inputs, durations and transcript formats', async ({ page }) => {
    await page.goto(URL_);
    const r = await page.evaluate(() => {
      const P = window.Podcast;
      return {
        inputs: [
          'urn:ard:show:65505255C703E51E', 'https://www.ardsounds.de/sendung/der-ki-podcast/urn:ard:show:65505255c703e51e/',
          'https://www.ardaudiothek.de/sendung/kalk-und-welk/10777871/', 'https://www.ardaudiothek.de/episode/x/12345678/',
          'https://example.org/feed.xml', 'http://example.org/feed', 'ftp://x', '',
        ].map(P.parseInput),
        dur: ['3600', '01:00', '1:02:03', '', 'x'].map(P.duration),
        srt: P.parseTranscript('1\n00:00:01,500 --> 00:00:03,000\nErste Zeile\n\n2\n00:01:00,000 --> 00:01:02,000\nZweite\n', 'application/x-subrip'),
        json: P.parseTranscript(JSON.stringify({ version: '1.0.0', segments: [{ speaker: 'Eva', startTime: 0.5, endTime: 2, body: 'Hi' }] }), 'application/json'),
        html: P.parseTranscript('<html><body><p>Eins</p><p>Zwei <b>fett</b></p><script>x</script></body></html>', 'text/html'),
        clock: [0, 59, 61, 3600, 3725].map(P.clock),
      };
    });
    expect(r.inputs).toEqual([
      { kind: 'ard', id: 'urn:ard:show:65505255c703e51e' }, { kind: 'ard', id: 'urn:ard:show:65505255c703e51e' },
      { kind: 'ard', id: '10777871', episode: false }, { kind: 'ard', id: '12345678', episode: true },
      { kind: 'rss', url: 'https://example.org/feed.xml' }, { kind: 'rss', url: 'http://example.org/feed', http: true },
      { error: 'errUrl' }, { error: 'errUrl' },
    ]);
    expect(r.dur).toEqual([3600, 60, 3723, null, null]);
    expect(r.srt).toEqual([{ start: 1.5, end: 3, text: 'Erste Zeile', speaker: '' }, { start: 60, end: 62, text: 'Zweite', speaker: '' }]);
    expect(r.json).toEqual([{ start: 0.5, end: 2, text: 'Hi', speaker: 'Eva' }]);
    expect(r.html.map(s => s.text)).toEqual(['Eins', 'Zwei fett']);
    expect(r.clock).toEqual(['0:00', '0:59', '1:01', '1:00:00', '1:02:05']);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('texts, voices and dates in English', async ({ page }) => {
      await mockPodcasts(page);
      await page.goto(URL_);
      await expect(page.locator('#h-setup')).toHaveText('Add your first podcast');
      await add(page, SHOW_LINK);
      await expect(page.locator('#status')).toContainText('3 of 4 episodes');
      await expect(rows(page).nth(0).locator('.meta')).toHaveText('24 Nov 2026 · 1 min');
      await rows(page).nth(1).locator('.btn.icon').click();
      await expect(page.locator('#trBody .who').first()).toHaveText('Voice 1');
      await expect(page.locator('#trStatus')).toHaveText('4 sections');
      await switchLang(page, 'de');
      await expect(page.locator('#trBody .who').first()).toHaveText('Stimme 1');
      await expect(page.locator('#trStatus')).toHaveText('4 Abschnitte');
    });
  });

  test('no request to the ARD API or audio servers on start', async ({ page }) => {
    const seen = await mockPodcasts(page);
    await page.goto(URL_);
    await add(page, SHOW_LINK);
    await expect(names(page)).toHaveCount(3);
    const before = seen.ard.length;
    await page.reload();
    await expect(names(page)).toHaveCount(3);
    expect(seen.ard.length).toBe(before);
    expect(seen.audio).toEqual([]);
    expect(ARD_API).toBe('https://api.ardaudiothek.de/graphql');
  });
});
