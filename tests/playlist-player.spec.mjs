// Playlist-Player: YouTube playlist as an audiobook – with a fake YouTube player (tests/fake-youtube.mjs)
// that speaks the real postMessage protocol. Nothing is loaded from YouTube before the user taps;
// progress, ticks with dates, resume point (also after a reload), parts jumping, manual ticks, speed,
// sleep timer, history, playlist link parsing, sharing from YouTube (Android), errors, English.
import { test, expect, openMenu, closeMenu, switchLang, axe, expectNoHorizontalScroll } from './helpers.mjs';
import { fakeYoutube, playerFrame, YT, LIST, LIST_TITLE, VIDEOS, LIST_BLOCKED } from './fake-youtube.mjs';

// Requests to the (routed) fake YouTube are expected; everything else still fails the test.
// Service worker blocked: requests it passes on would bypass page.route (and reach the real YouTube).
test.use({ serviceWorkers: 'block', allowedProblems: /^external request: https:\/\/www\.youtube-nocookie\.com\/(embed\/|oembed\?)|^console: Failed to load resource: the server responded with a status of 404/ });
// (404: oEmbed does not know the playlist – as YouTube answers for private or unknown lists)
test.use({ timezoneId: 'Europe/Berlin' });

const LINK = `https://youtube.com/playlist?list=${LIST}&si=OksE6KjQL7ka4DEE`;
const parts = page => page.locator('#tracks .track');
const part = (page, n) => parts(page).nth(n - 1);
const advance = (frame, sec) => frame.evaluate(s => window.fake.advance(s), sec);
const fakeState = frame => frame.evaluate(() => window.fake.state());
const commands = frame => frame.evaluate(() => window.commands);

async function openPlaylist(page, link = LINK) {
  await page.locator('#inUrl').fill(link);
  await page.getByRole('button', { name: 'Öffnen' }).click();
}
async function play(page) {
  await page.locator('#btnStart').click();
  const frame = await playerFrame(page);
  await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Pause');
  return frame;
}

test('nothing from YouTube before a tap; open, play, ticks with date, next part, resume after reload', async ({ page }) => {
  const seen = await fakeYoutube(page);
  await page.goto('/playlist-player/');
  await expect(page.locator('#cardPlayer')).toBeHidden();
  expect(seen.embed.length + seen.oembed.length).toBe(0);

  await openPlaylist(page);
  // Name from oEmbed after "Öffnen"; no player yet
  await expect(page.locator('#listName')).toHaveText(LIST_TITLE);
  expect(seen.embed).toEqual([]);
  expect(seen.oembed).toEqual([`https://www.youtube.com/playlist?list=${LIST}`]);
  await expect(page.locator('#startInfo')).toHaveText('Lädt die Playlist von YouTube.');

  const frame = await play(page);
  // The player starts with the playlist, from our origin, with the JS API
  const src = new URL(seen.embed[0]);
  expect(src.origin + src.pathname).toBe(`${YT}/embed/videoseries`);
  expect(src.searchParams.get('list')).toBe(LIST);
  expect(src.searchParams.get('enablejsapi')).toBe('1');
  expect(src.searchParams.get('origin')).toBe(new URL(page.url()).origin);
  // Parts from the player, titles of all parts from oEmbed
  await expect(parts(page)).toHaveCount(3);
  await expect(page.locator('#tracks .tt')).toHaveText(VIDEOS.map(v => v.title));
  await expect(part(page, 1)).toHaveClass(/current/);
  await expect(page.locator('#now')).toHaveText('Kapitel 1: Der Anfang');
  await expect(page.locator('#nowSub')).toHaveText('Teil 1 von 3 · Erzähler');

  // 50 s of 120 heard: position, not ticked
  await advance(frame, 50);
  await expect(page.locator('#tPos')).toHaveText('0:50');
  await expect(page.locator('#tDur')).toHaveText('2:00');
  await page.locator('#btnPlay').click(); // pause → position saved, history entry
  await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Abspielen');
  await expect(part(page, 1).locator('.meta')).toContainText('bis 0:50 / 2:00 gehört');
  await expect(part(page, 1).locator('input')).not.toBeChecked();

  // Play on to 112 s: less than 10 s left (credits) → counts as heard, with date
  await page.locator('#btnPlay').click();
  await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Pause');
  await advance(frame, 62);
  await expect(part(page, 1).locator('input')).toBeChecked();
  const today = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' });
  await expect(part(page, 1).locator('.meta')).toContainText(`gehört am ${today}`);
  await expect(page.locator('#sum')).toHaveText('1 von 3 Teilen gehört · 2:00 von 2:00 gehört (bekannte Teile)');
  // Part ends → the player moves on to part 2 by itself
  await advance(frame, 8);
  await expect(part(page, 2)).toHaveClass(/current/);
  await expect(page.locator('#now')).toHaveText('Kapitel 2: Die Mitte');
  await advance(frame, 30);
  await expect(page.locator('#tPos')).toHaveText('0:30');

  // Reload (phone ended the app): no player until a tap, resume point is part 2 at 0:30
  await page.reload();
  await expect(page.locator('#listName')).toHaveText(LIST_TITLE);
  await expect(page.locator('#startInfo')).toHaveText('Weiter mit Teil 2 ab 0:30');
  await expect(part(page, 1).locator('input')).toBeChecked();
  await expect(page.locator('#tracks .tt')).toHaveText(VIDEOS.map(v => v.title)); // titles kept
  const embeds = seen.embed.length;
  await expect(page.locator('#slot iframe')).toHaveCount(0);
  expect(seen.embed.length).toBe(embeds);
  const frame2 = await play(page);
  const src2 = new URL(seen.embed.at(-1));
  expect(src2.pathname).toBe(`/embed/${VIDEOS[1].id}`);
  expect(src2.searchParams.get('start')).toBe('30');
  expect((await fakeState(frame2)).idx).toBe(1);
  await expect(page.locator('#tPos')).toHaveText('0:30');

  // History: what was heard when (part 1 0:00–0:50, 0:50–2:00 merged, part 2 0:00–0:30)
  await openMenu(page);
  const hist = page.locator('#hist li');
  await expect(hist).toHaveCount(2);
  await expect(hist.nth(0)).toContainText('Teil 2 – Kapitel 2: Die Mitte: 0:00–0:30');
  await expect(hist.nth(1)).toContainText('Teil 1 – Kapitel 1: Der Anfang: 0:00–2:00');
  await expect(hist.nth(1).locator('.when')).toContainText(LIST_TITLE);
});

test('jump to a part continues where it was left; manual ticks; skip buttons and ±30 s', async ({ page }) => {
  await fakeYoutube(page);
  await page.goto('/playlist-player/');
  await openPlaylist(page);
  const frame = await play(page);
  await expect(parts(page)).toHaveCount(3);
  // Part 3, 20 s in, then back to part 1
  await part(page, 3).locator('.track-go').click();
  await expect(part(page, 3)).toHaveClass(/current/);
  await advance(frame, 20);
  await expect(page.locator('#tPos')).toHaveText('0:20');
  await page.getByRole('button', { name: 'Vorheriger Teil' }).click();
  await expect(part(page, 2)).toHaveClass(/current/);
  await part(page, 3).locator('.track-go').click();
  // The app asks the player to go to the remembered position
  await expect.poll(async () => (await fakeState(frame)).time).toBe(20);
  expect(await commands(frame)).toContainEqual(['playVideoAt', 2]);
  expect(await commands(frame)).toContainEqual(['seekTo', 20, true]);
  await page.getByRole('button', { name: '30 Sekunden vor' }).click();
  await expect.poll(async () => (await fakeState(frame)).time).toBe(50);
  await page.getByRole('button', { name: '30 Sekunden zurück' }).click();
  await expect.poll(async () => (await fakeState(frame)).time).toBe(20);
  await expect(page.getByRole('button', { name: 'Nächster Teil' })).toBeDisabled();

  // Tick part 2 by hand (skipped), untick it again
  const box = page.getByRole('checkbox', { name: 'gehört: Kapitel 2: Die Mitte' });
  await box.check();
  await expect(part(page, 2)).toHaveClass(/done/);
  await expect(page.locator('#sum')).toContainText('1 von 3 Teilen gehört');
  await box.uncheck();
  await expect(page.locator('#sum')).toContainText('0 von 3 Teilen gehört');
  // Resume point skips ticked parts: tick 1 and 2 → after a reload, continue with part 3 at 0:20
  await page.getByRole('checkbox', { name: 'gehört: Kapitel 1: Der Anfang' }).check();
  await box.check();
  await page.locator('#btnPlay').click();
  await page.reload();
  await expect(page.locator('#startInfo')).toHaveText('Weiter mit Teil 3 ab 0:20');
});

test('speed is kept and sent to the player; sleep timer pauses at the end of the part', async ({ page }) => {
  await fakeYoutube(page);
  await page.goto('/playlist-player/');
  await openPlaylist(page);
  await page.locator('#selRate').selectOption('1.5');
  await expect(page.locator('#selRate option:checked')).toHaveText('1,5×');
  const frame = await play(page);
  await expect.poll(async () => (await fakeState(frame)).rate).toBe(1.5);
  await page.locator('#selRate').selectOption('1.25');
  await expect.poll(async () => (await fakeState(frame)).rate).toBe(1.25);

  await page.locator('#selSleep').selectOption('end');
  await expect(page.locator('#sleepLeft')).toHaveText('Schlaf-Timer: hält am Ende des Teils an');
  await advance(frame, 120);
  // Part 1 over, the player moved on – and was paused
  await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Abspielen');
  await expect.poll(async () => (await fakeState(frame)).state).toBe(2);
  await expect(page.locator('#selSleep')).toHaveValue('off');
  await expect(part(page, 1).locator('input')).toBeChecked();

  await page.reload();
  await expect(page.locator('#selRate')).toHaveValue('1.25');
});

test('playlist links: watch links, youtu.be, music, bare ID; no playlist → message; several playlists', async ({ page }) => {
  await fakeYoutube(page);
  await page.goto('/playlist-player/');
  for (const bad of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'hallo', 'https://example.com/?list=PLxxxxxxxxxxxxxxxx', 'https://notyoutube.com/playlist?list=PLxxxxxxxxxxxxxxxx']) {
    await openPlaylist(page, bad);
    await expect(page.locator('#addErr')).toContainText('Darin steckt keine Playlist');
    await expect(page.locator('#cardPlayer')).toBeHidden();
  }
  await openPlaylist(page, `https://www.youtube.com/watch?v=${VIDEOS[0].id}&list=${LIST}&index=2`);
  await expect(page.locator('#addErr')).toHaveText('');
  await expect(page.locator('#listName')).toHaveText(LIST_TITLE);
  // Same list again (other link form) → selected, not doubled
  await openPlaylist(page, `music.youtube.com/playlist?list=${LIST}`);
  await expect(page.locator('#pickRow')).toBeHidden();
  // A second list (bare ID; oEmbed does not know it → short ID as name)
  await openPlaylist(page, 'PLsecondsecondsecond22');
  await expect(page.locator('#listName')).toHaveText('Playlist PLsecondse…');
  await expect(page.locator('#pickRow')).toBeVisible();
  await expect(page.locator('#selList option')).toHaveText([LIST_TITLE, 'Playlist PLsecondse…']);
  await page.locator('#selList').selectOption(LIST);
  await expect(page.locator('#listName')).toHaveText(LIST_TITLE);
  // Own name in the menu
  await openMenu(page);
  await page.locator('#inName').fill('Gute-Nacht-Geschichten');
  await closeMenu(page);
  await expect(page.locator('#listName')).toHaveText('Gute-Nacht-Geschichten');
  // Remove (with confirmation) → the other one is left
  page.once('dialog', d => d.accept());
  await openMenu(page);
  await page.getByRole('button', { name: 'Playlist entfernen' }).click();
  await expect(page.locator('#listName')).toHaveText('Playlist PLsecondse…');
  await expect(page.locator('#pickRow')).toBeHidden();
});

test('shared from the YouTube app (Android share sheet): opens the playlist and loads the player at once', async ({ page }) => {
  const seen = await fakeYoutube(page);
  await page.goto(`/playlist-player/?text=${encodeURIComponent('Schau dir das an: ' + LINK)}`);
  await expect(page.locator('#listName')).toHaveText(LIST_TITLE);
  await expect(page).toHaveURL(/\/playlist-player\/$/);
  await playerFrame(page);
  await expect(page.locator('#tracks .tt')).toHaveText(VIDEOS.map(v => v.title));
  await expect(part(page, 1)).toHaveClass(/current/);
  expect(new URL(seen.embed[0]).pathname).toBe('/embed/videoseries');
});

test('a shared video of the playlist starts with that part – before and after the parts are known', async ({ page }) => {
  const seen = await fakeYoutube(page);
  // Not known yet: the player starts with that video, the list follows from the player
  await page.goto(`/playlist-player/?url=${encodeURIComponent(`https://youtu.be/${VIDEOS[1].id}?list=${LIST}&si=abc`)}`);
  const frame = await playerFrame(page);
  expect(new URL(seen.embed[0]).pathname).toBe(`/embed/${VIDEOS[1].id}`);
  await expect(part(page, 2)).toHaveClass(/current/);
  await advance(frame, 40);
  // Known: shared part 3 → starts there; part 2 again later → continues at 0:40
  await page.goto(`/playlist-player/?url=${encodeURIComponent(`https://m.youtube.com/watch?v=${VIDEOS[2].id}&list=${LIST}&index=3`)}`);
  await playerFrame(page);
  await expect(part(page, 3)).toHaveClass(/current/);
  await page.goto(`/playlist-player/?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${VIDEOS[1].id}&list=${LIST}`)}`);
  const frame3 = await playerFrame(page);
  expect(new URL(seen.embed.at(-1)).searchParams.get('start')).toBe('40');
  await expect.poll(async () => (await fakeState(frame3)).idx).toBe(1);
  await expect(page.locator('#tPos')).toHaveText('0:40');
});

test('paste link & play: from the clipboard, nothing usable → hint', async ({ page }) => {
  const seen = await fakeYoutube(page);
  await page.goto('/playlist-player/');
  const paste = page.getByRole('button', { name: 'Link einfügen & abspielen' });
  await page.evaluate(() => navigator.clipboard.writeText('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  await paste.click();
  await expect(page.locator('#addErr')).toContainText('In der Zwischenablage ist kein Playlist-Link');
  expect(seen.embed).toEqual([]);
  await page.evaluate(l => navigator.clipboard.writeText(l), LINK);
  await paste.click();
  await expect(page.locator('#addErr')).toHaveText('');
  await expect(page.locator('#listName')).toHaveText(LIST_TITLE);
  await playerFrame(page);
  await expect(page.locator('#btnPlay')).toHaveAttribute('aria-label', 'Pause');
});

test('YouTube refuses the playlist → understandable message', async ({ page }) => {
  await fakeYoutube(page);
  await page.goto('/playlist-player/');
  await openPlaylist(page, LIST_BLOCKED);
  await page.locator('#btnStart').click();
  await expect(page.locator('#status')).toHaveText('Dieser Teil darf nicht eingebettet abgespielt werden – nur in der YouTube-App.');
  await expect(page.locator('#status')).toHaveClass(/err/);
  expect(await page.evaluate(() => Tools.diag.text())).toContain('player: error 150');
});

for (const scheme of ['light', 'dark']) {
  test(`accessible with a loaded playlist, parts and ticks (${scheme}), fits a 375 px phone`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.emulateMedia({ colorScheme: scheme });
    await fakeYoutube(page);
    await page.goto('/playlist-player/');
    await openPlaylist(page);
    await openPlaylist(page, 'PLsecondsecondsecond22');
    await page.locator('#selList').selectOption(LIST);
    const frame = await play(page);
    await advance(frame, 130);
    await expect(part(page, 1)).toHaveClass(/done/);
    await page.locator('#selSleep').selectOption('30');
    await expectNoHorizontalScroll(page);
    // The player frame is YouTube's content, not ours
    const { violations } = await axe(page).exclude('#slot').analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`)).toEqual([]);
  });
}

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, speed and ticks in English', async ({ page }) => {
    await fakeYoutube(page);
    await page.goto('/playlist-player/');
    await page.locator('#inUrl').fill(LINK);
    await page.getByRole('button', { name: 'Open' }).click();
    await expect(page.locator('#startInfo')).toHaveText('Loads the playlist from YouTube.');
    await page.locator('#btnStart').click();
    const frame = await playerFrame(page);
    await expect(parts(page)).toHaveCount(3);
    await advance(frame, 120);
    await expect(page.locator('#sum')).toContainText('1 of 3 parts heard');
    await expect(page.locator('#selRate option').nth(4)).toHaveText('1.5×');
    await expect(page.getByRole('checkbox', { name: 'heard: Kapitel 1: Der Anfang' })).toBeChecked();
    await switchLang(page, 'de');
    await expect(page.locator('#sum')).toContainText('1 von 3 Teilen gehört');
  });
});

// Wake lock recorded instead of the real API (not available headless)
async function mockWakeLock(page) {
  await page.addInitScript(() => {
    window.__wake = { requested: 0, released: 0 };
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
      __wake.requested++;
      const s = new EventTarget(); s.release = async () => { __wake.released++; s.dispatchEvent(new Event('release')); };
      return s;
    } } });
  });
}

test('listening mode: black full screen with big buttons, keeps the screen on, player plays on, back gesture closes', async ({ page }) => {
  await mockWakeLock(page);
  await fakeYoutube(page);
  await page.goto('/playlist-player/');
  await openPlaylist(page);
  const frame = await play(page);
  await expect(parts(page)).toHaveCount(3);
  await advance(frame, 20);
  await page.locator('#selSleep').selectOption('30');
  await page.getByRole('button', { name: 'Hörmodus' }).click();
  await expect(page.getByRole('dialog', { name: 'Kapitel 1: Der Anfang' })).toBeVisible();
  const dlg = page.locator('#listen');
  await expect(dlg.locator('#lSub')).toHaveText('Teil 1 von 3');
  await expect(dlg.locator('.l-time')).toHaveText('0:20 / 2:00');
  await expect(dlg.locator('#lSleep')).toHaveText('Schlaf-Timer: noch 30 min');
  await expect(dlg.locator('#lClock')).toHaveText(/^\d\d:\d\d$/);
  // Nearly black, whole screen, also in light mode
  expect(await dlg.evaluate(d => getComputedStyle(d).backgroundColor)).toBe('rgb(0, 0, 0)');
  const box = await dlg.boundingBox();
  expect(box.width).toBe(page.viewportSize().width);
  expect(box.height).toBe(page.viewportSize().height);
  // Screen stays on while it is open – even with the setting off (playing alone does not take it)
  await expect.poll(() => page.evaluate(() => __wake.requested)).toBe(1);
  // Big buttons control the player underneath, which keeps playing
  await dlg.getByRole('button', { name: '30 Sekunden vor' }).click();
  await expect.poll(async () => (await fakeState(frame)).time).toBe(50);
  await advance(frame, 5);
  await expect(dlg.locator('.l-time')).toHaveText('0:55 / 2:00');
  await dlg.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(async () => (await fakeState(frame)).state).toBe(2);
  await expect(dlg.getByRole('button', { name: 'Abspielen' })).toBeVisible();
  expect(await page.evaluate(() => __wake.released)).toBe(0); // paused: still on while the mode is open
  await dlg.getByRole('button', { name: 'Abspielen' }).click();
  await dlg.getByRole('button', { name: 'Nächster Teil' }).click();
  await expect(dlg.locator('h2')).toHaveText('Kapitel 2: Die Mitte');
  await expect(dlg.getByRole('button', { name: 'Vorheriger Teil' })).toBeEnabled();
  // Back gesture closes it (not the app), screen may go off again
  await page.goBack();
  await expect(dlg).toBeHidden();
  await expect(page).toHaveURL(/\/playlist-player\/$/);
  await expect.poll(() => page.evaluate(() => __wake.released)).toBe(1);
  await expect(page.getByRole('button', { name: 'Hörmodus' })).toBeFocused();
  expect((await fakeState(frame)).state).toBe(1);
  // Exit button, and the history entry is taken back (one back step leaves nothing behind)
  await page.getByRole('button', { name: 'Hörmodus' }).click();
  await expect(dlg).toBeVisible();
  await dlg.getByRole('button', { name: 'Beenden' }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(() => page.evaluate(() => !(history.state && history.state.listenMode))).toBe(true);
});

for (const scheme of ['light', 'dark']) {
  test(`listening mode is accessible (${scheme}) and fits a small phone`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await page.emulateMedia({ colorScheme: scheme });
    await mockWakeLock(page);
    await fakeYoutube(page);
    await page.goto('/playlist-player/');
    await openPlaylist(page);
    await play(page);
    await expect(parts(page)).toHaveCount(3);
    await page.locator('#selSleep').selectOption('end');
    await page.getByRole('button', { name: 'Hörmodus' }).click();
    await expect(page.locator('#listen')).toBeVisible();
    // All buttons on screen, at least 44 px
    for (const b of await page.locator('#listen button').all()) {
      const r = await b.boundingBox();
      expect(r.y + r.height).toBeLessThanOrEqual(640);
      expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
    }
    await expectNoHorizontalScroll(page);
    const { violations } = await axe(page).include('#listen').analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target).join(', ')}`)).toEqual([]);
  });
}

test.describe('English listening mode', () => {
  test.use({ locale: 'en-US' });
  test('texts in English', async ({ page }) => {
    await mockWakeLock(page);
    await fakeYoutube(page);
    await page.goto('/playlist-player/');
    await page.locator('#inUrl').fill(LINK);
    await page.getByRole('button', { name: 'Open' }).click();
    await page.locator('#btnStart').click();
    await playerFrame(page);
    await expect(parts(page)).toHaveCount(3);
    await page.getByRole('button', { name: 'Listening mode' }).click();
    const dlg = page.locator('#listen');
    await expect(dlg.locator('#lSub')).toHaveText('Part 1 of 3');
    await expect(dlg.getByRole('button', { name: 'Exit' })).toBeVisible();
    await expect(dlg.getByRole('button', { name: 'Forward 30 seconds' })).toBeVisible();
  });
});
