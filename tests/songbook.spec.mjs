// Liederbuch: shared song data (bars, lyrics), sheet music with scale numbers and note names, playback with
// the highlighted note, tempo, tapping a note, MIDI file, the link to the Klavier app and back, persistence.
import { test, expect, openMenu, closeMenu, switchLang, VIEWPORTS } from './helpers.mjs';

const URL_ = '/songbook/';
test.use({ viewport: VIEWPORTS.mobile });
const score = page => page.locator('#score');
const labelsOf = (page, i) => page.locator(`#score [data-i="${i}"] .abcjs-annotation`);

async function pick(page, id) {
  await page.selectOption('#song', id);
  await expect(score(page)).toHaveAttribute('data-song', id);
}

test('every song: bars fit the meter, each note is drawn, each verse has one syllable per note', async ({ page }) => {
  await page.goto(URL_);
  const ids = await page.evaluate(() => Songs.list.map(s => s.id));
  expect(ids.length).toBeGreaterThanOrEqual(7);
  for (const id of ids) {
    await pick(page, id);
    const info = await page.evaluate(id => {
      const s = Songs.get(id);
      const bars = Songs.bars(s);   // throws if a bar is too long or too short
      const toks = Songs.tokens(s.melody);
      const sung = toks.filter(x => x.n != null).length;
      // Syllables, "_" (held) and "*" (no text) each take one note
      const verses = s.lyrics.map(v => v.trim().split(/\s+/).flatMap(w => w.split('-')).length);
      // A canon or accompaniment for the Klavier app must be as long as the melody (or shorter)
      const len = Songs.parts(s).map(p => p.notes.reduce((m, x) => Math.max(m, x.t + x.d), 0));
      return { bars: bars.length, tokens: toks.length, sung, verses, len, credits: s.credits };
    }, id);
    await expect(score(page), id).toHaveAttribute('data-notes', String(info.tokens));
    for (const n of info.verses) expect(n, id).toBe(info.sung);
    expect(Math.max(...info.len.slice(1), 0), id).toBeLessThanOrEqual(info.len[0] + 8.01);
    expect(info.credits.melody, id).toBeTruthy();
    await expect(page.locator('#where')).toHaveText(`Takt 1 / ${info.bars}`);
  }
});

test('lyrics and numbers never overlap on a phone', async ({ page }) => {
  await page.goto(URL_);
  const ids = await page.evaluate(() => Songs.list.map(s => s.id));
  for (const id of ids) {
    await pick(page, id);
    const clash = await page.evaluate(() => {
      const rows = new Map();
      for (const tx of document.querySelectorAll('#score .abcjs-lyric, #score .abcjs-annotation')) {
        const r = tx.getBoundingClientRect();
        const key = Math.round(r.top / 3);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push({ r, text: tx.textContent });
      }
      for (const list of rows.values()) {
        list.sort((a, b) => a.r.left - b.r.left);
        for (let i = 1; i < list.length; i++) if (list[i].r.left < list[i - 1].r.right) return `${list[i - 1].text} / ${list[i].text}`;
      }
      return null;
    });
    expect(clash, id).toBeNull();
    // The score fills the card without being shrunk below the card width
    const w = await page.evaluate(() => [document.querySelector('#score svg').getBoundingClientRect().width, document.querySelector('#score').clientWidth]);
    expect(Math.abs(w[0] - w[1])).toBeLessThan(2);
  }
});

test('scale numbers: coloured, dots for other octaves, sharps; note names in German and English', async ({ page }) => {
  await page.goto(URL_);
  await pick(page, 'entchen');
  // C D E F G … → 1 2 3 4 5, each in its own colour
  for (const [i, n] of [[0, '1'], [1, '2'], [2, '3'], [3, '4'], [4, '5']]) {
    await expect(labelsOf(page, i)).toHaveText(n);
    await expect(labelsOf(page, i)).toHaveClass(new RegExp(`deg-${n}`));
  }
  await pick(page, 'fuer-elise');
  // E5 = 3 with a dot above, D#5 = ♯2 with a dot above, C4 (token 10) = 1 without a dot
  const stacked = i => labelsOf(page, i).evaluateAll(els => els.map(e => [e.textContent, e.getBoundingClientRect().top])
    .sort((a, b) => a[1] - b[1]).map(x => x[0]));
  expect(await stacked(0)).toEqual(['•', '3']);
  expect(await stacked(1)).toEqual(['•', '♯2']);
  expect(await stacked(10)).toEqual(['1']);
  // Ode an die Freude ends a phrase on G3: dot below the 5
  await pick(page, 'ode');
  const g3 = await page.evaluate(() => Songs.tokens(Songs.get('ode').melody).findIndex(x => x.n === 55));
  expect(await stacked(g3)).toEqual(['5', '•']);
  await pick(page, 'fuer-elise');
  // A rest has no label
  await expect(page.locator('#score [data-i="9"]')).toHaveClass(/abcjs-rest/);

  await openMenu(page);
  await page.click('#labels [data-l="names"]');
  await closeMenu(page);
  await expect(labelsOf(page, 1)).toHaveText('Dis');
  await expect(labelsOf(page, 5)).toHaveText('H');
  await openMenu(page);
  await switchLang(page, 'en');
  await closeMenu(page);
  await expect(labelsOf(page, 1)).toHaveText('D♯');
  await expect(labelsOf(page, 5)).toHaveText('B');
  await expect(page.locator('#songTitle')).toHaveText('Für Elise (opening)');
  await openMenu(page);
  await page.click('#labels [data-l="none"]');
  await closeMenu(page);
  await expect(page.locator('#score .abcjs-annotation')).toHaveCount(0);
});

test('playback highlights the note being played, shows the bar and follows the tempo', async ({ page }) => {
  await page.clock.install();
  await page.goto(URL_);
  await pick(page, 'entchen');                           // 120 bpm: one quarter = 0.5 s
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.click('#btnPlay');
  await expect(page.locator('#btnPlay')).toHaveAttribute('data-state', 'playing');
  await page.clock.runFor(250);
  await expect(score(page)).toHaveAttribute('data-cur', '0');
  await expect(page.locator('#score [data-i="0"]')).toHaveClass(/\bcur\b/);
  await page.clock.runFor(1000);                         // 1.25 s = beat 2.5: E4 (token 2)
  await expect(score(page)).toHaveAttribute('data-cur', '2');
  await page.clock.runFor(1000);                         // 2.25 s = beat 4.5: G4 half note, bar 2
  await expect(score(page)).toHaveAttribute('data-cur', '4');
  await expect(page.locator('#where')).toHaveText('Takt 2 / 10');
  await page.click('#btnPlay');
  await expect(page.locator('#btnPlay')).toHaveAttribute('data-state', 'paused');
  expect(Number(await score(page).getAttribute('data-sounded'))).toBeGreaterThanOrEqual(5);

  // Slower: 50 % → one quarter = 1 s
  for (let i = 0; i < 5; i++) await page.click('#btnSlower');
  await expect(page.locator('#tempo')).toHaveText('50 %');
  await expect(page.locator('#btnSlower')).toBeDisabled();
  await page.click('#btnRestart');
  await expect(score(page)).toHaveAttribute('data-cur', '-1');
  await page.click('#btnPlay');
  await page.clock.runFor(1500);                         // beat 1.5: D4 (token 1)
  await expect(score(page)).toHaveAttribute('data-cur', '1');
  await page.click('#btnPlay');
  await page.reload();
  await expect(page.locator('#tempo')).toHaveText('50 %');
  await expect(score(page)).toHaveAttribute('data-song', 'entchen');
});

test('tap a note: playback jumps there', async ({ page }) => {
  await page.goto(URL_);
  await pick(page, 'haenschen');
  await page.locator('#score [data-i="8"] .abcjs-notehead').click();   // bar 3
  await expect(score(page)).toHaveAttribute('data-cur', '8');
  await expect(page.locator('#where')).toHaveText('Takt 3 / 16');
});

test('MIDI file: the song with its extra parts, which the Klavier app opens', async ({ page }) => {
  await page.goto(URL_);
  await pick(page, 'jakob');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnMidi')]);
  expect(download.suggestedFilename()).toBe('jakob.mid');
  const bytes = await (await download.createReadStream()).toArray().then(c => Buffer.concat(c));
  expect(bytes.subarray(0, 4).toString()).toBe('MThd');
  expect(bytes.readUInt16BE(10)).toBe(3);                // tempo track + melody + canon voice
  await page.goto('/piano/');
  await page.setInputFiles('#file', { name: 'jakob.mid', mimeType: 'audio/midi', buffer: bytes });
  await openMenu(page);
  // 32 notes per voice; 16 bars (8 + 2 later for the canon … ) at 108 bpm
  await expect(page.locator('#songInfo')).toHaveText('0:22 · 64 Noten · 2 Spuren');
  await expect(page.locator('#parts li')).toHaveText(['Spur 1 · Stimme 1 (32 Noten)', 'Spur 2 · Stimme 2 (Kanon) (32 Noten)']);
  await page.evaluate(() => localStorage.clear());
});

test('Im Klavier üben: opens the song in the Klavier app, which links back to its notes', async ({ page }) => {
  await page.goto(URL_);
  await pick(page, 'jakob');
  await expect(page.locator('#toPiano')).toHaveAttribute('href', '../piano/?song=jakob');
  await page.click('#toPiano');
  await expect(page.locator('#songName')).toHaveText('Bruder Jakob');
  await expect(page).toHaveURL(/\/piano\/$/);            // the parameter is removed again
  await openMenu(page);
  await expect(page.locator('#parts li')).toHaveText(['Stimme 1 (32 Noten)', 'Stimme 2 (Kanon) (32 Noten)']);
  // All songbook songs are in the menu, the open one is marked
  await expect(page.locator('#songList [data-demo]')).toHaveCount(await page.evaluate(() => Songs.list.length));
  await expect(page.locator('#songList [aria-pressed="true"]')).toHaveText('Bruder Jakob');
  await page.click('#songList [data-demo="stille-nacht"]');
  await expect(page.locator('#songName')).toHaveText('Stille Nacht');
  await openMenu(page);
  await expect(page.locator('#toSongbook')).toHaveAttribute('href', '../songbook/?song=stille-nacht');
  await page.click('#toSongbook');
  await expect(page.locator('#songTitle')).toHaveText('Stille Nacht');
  await expect(page.locator('#credits')).toHaveText('Melodie: Franz Xaver Gruber (1818) · Text: Joseph Mohr (1816) · gemeinfrei');
  await expect(page.locator('#song')).toHaveValue('stille-nacht');
  await page.evaluate(() => localStorage.clear());
});

test('credits: folk songs, one author for both, songs without lyrics', async ({ page }) => {
  await page.goto(URL_);
  await expect(page.locator('#credits')).toHaveText('Volkslied · gemeinfrei');
  await pick(page, 'jingle-bells');
  await expect(page.locator('#credits')).toHaveText('Melodie und Text: James Lord Pierpont (1857) · gemeinfrei');
  await pick(page, 'haenschen');
  await expect(page.locator('#credits')).toHaveText('Melodie: Volksweise · Text: Franz Wiedemann (1860) · gemeinfrei');
  await pick(page, 'fuer-elise');
  await expect(page.locator('#credits')).toHaveText('Melodie: Ludwig van Beethoven (1810) · ohne Text · gemeinfrei');
  await expect(page.locator('#score .abcjs-lyric')).toHaveCount(0);
});

test('wide screen: several bars per line, the layout follows the width', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop || { width: 1280, height: 800 });
  await page.goto(URL_);
  await pick(page, 'haenschen');
  const wide = Number(await score(page).getAttribute('data-lines'));
  expect(wide).toBeLessThanOrEqual(5);
  await page.setViewportSize({ width: 375, height: 740 });
  await expect.poll(async () => Number(await score(page).getAttribute('data-lines'))).toBeGreaterThan(wide);
});
