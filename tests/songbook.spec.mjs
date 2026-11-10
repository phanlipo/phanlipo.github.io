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

test.describe('own songs', () => {
  const KUCKUCK = `X:1
T:Kuckuck
C:trad.
M:3/4
L:1/4
Q:1/4=120
K:F
C|A F2|A F2-|F G/A/ B|c2 z|]
w:Kuck-uck, Kuck-uck_ ruft's aus dem Wald
w:zwei-te Stro-phe, hier *
X:2
T:Noch eins
K:C
CDEF|
`;

  async function newSong(page) {
    await openMenu(page);
    await page.click('#btnNew');
    await expect(page.locator('#editor')).toBeVisible();
  }

  test('type in a song: checks while typing, saves, survives a reload, edit and delete', async ({ page }) => {
    await page.goto(URL_);
    await newSong(page);
    await expect(page.locator('#edHead')).toHaveText('Neues Lied');
    await expect(page.locator('#edDelete')).toBeHidden();
    await page.fill('#edName', 'Mein Lied');
    await page.fill('#edMelody', 'C4 D4 E4 | F4:2 G4:2');
    await expect(page.locator('#edCheck')).toHaveText('Takt 1 hat 3 Schläge, erwartet 4.');
    await page.fill('#edMelody', 'C4 D4 E4 F4:.5 X4');
    await expect(page.locator('#edCheck')).toHaveText(/Note 5 \(„X4“\) ist unbekannt/);
    await page.fill('#edMelody', 'C4 D4 E4 F4:2 G4:2');
    await expect(page.locator('#edCheck')).toHaveText('Note 4 reicht über das Ende von Takt 1 – teilen und mit ~ verbinden.');
    await page.fill('#edMelody', 'C4 D4 E4 F4:1~ | F4 G4:2 r | E4:2.5 r:.5');
    await page.fill('#edLyrics', 'Das ist _ mein Lied _ so\n\nzwei-te Stro-phe');
    await expect(page.locator('#edCheck')).toHaveText('✓ 3 Takte, 7 Noten\nStrophe 2: 4 Silben für 7 Noten');
    await page.fill('#edBy', 'Ich');
    await page.click('#edSave');
    await expect(page.locator('#editor')).toBeHidden();
    await expect(page.locator('#toast')).toHaveText('„Mein Lied“ gespeichert');
    await expect(page.locator('#songTitle')).toHaveText('Mein Lied');
    await expect(page.locator('#credits')).toHaveText('eigenes Lied · Melodie: Ich');
    await expect(score(page)).toHaveAttribute('data-notes', '9');
    await expect(page.locator('#song optgroup[label="Eigene Lieder"] option')).toHaveText(['Mein Lied']);
    await expect(page.locator('#btnEdit')).toHaveText('Bearbeiten');

    await page.reload();
    await expect(page.locator('#songTitle')).toHaveText('Mein Lied');
    await page.click('#btnEdit');
    await expect(page.locator('#edHead')).toHaveText('Lied bearbeiten');
    await expect(page.locator('#edMelody')).toHaveValue('C4 D4 E4 F4:1~ | F4 G4:2 r | E4:2.5 r:.5');
    await page.fill('#edName', 'Mein neues Lied');
    await page.click('#edSave');
    await expect(page.locator('#song option')).toHaveCount(await page.evaluate(() => Songs.list.length + 1));
    await expect(page.locator('#song')).toHaveValue(/^u-/);

    await page.click('#btnEdit');
    page.once('dialog', d => d.accept());
    await page.click('#edDelete');
    await expect(page.locator('#toast')).toHaveText('„Mein neues Lied“ gelöscht');
    await expect(page.locator('#songTitle')).toHaveText('Alle meine Entchen');
    await expect(page.locator('#song optgroup[label="Eigene Lieder"]')).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('songbook.songs.v1'))).toBe('[]');
  });

  test('a tied note sounds once, for both lengths', async ({ page }) => {
    await page.clock.install();
    await page.goto(URL_);
    await newSong(page);
    await page.fill('#edName', 'Haltebogen');
    await page.fill('#edBpm', '60');
    await page.fill('#edMelody', 'C4:4~ | C4 E4:3');
    await page.click('#edSave');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
    await page.click('#btnPlay');
    await page.clock.runFor(4500);                       // beat 4.5: the tied C is still on, E not yet
    await expect(score(page)).toHaveAttribute('data-cur', '1');
    await page.clock.runFor(4000);
    expect(await score(page).getAttribute('data-sounded')).toBe('2');
  });

  test('copy of a book song becomes an own song', async ({ page }) => {
    await page.goto(URL_);
    await expect(page.locator('#btnEdit')).toHaveText('Als eigenes Lied bearbeiten');
    await page.click('#btnEdit');
    await expect(page.locator('#edHead')).toHaveText('Kopie als eigenes Lied');
    await expect(page.locator('#edName')).toHaveValue('Alle meine Entchen (Kopie)');
    await expect(page.locator('#edBy')).toHaveValue('Volksweise');
    await expect(page.locator('#edCheck')).toHaveText('✓ 10 Takte, 27 Noten');
    await page.click('#edSave');
    await expect(page.locator('#songTitle')).toHaveText('Alle meine Entchen (Kopie)');
    await expect(score(page)).toHaveAttribute('data-notes', '27');
    expect(await page.evaluate(() => Songs.get('entchen').title.de)).toBe('Alle meine Entchen');
  });

  test('ABC file: key signature, ties, upbeat, lyrics and the first tune only', async ({ page }) => {
    await page.goto(URL_);
    await openMenu(page);
    await page.setInputFiles('#abcFile', { name: 'kuckuck.abc', mimeType: 'text/plain', buffer: Buffer.from(KUCKUCK) });
    await expect(page.locator('#editor')).toBeVisible();
    await expect(page.locator('#toast')).toContainText('ABC übernommen');
    await expect(page.locator('#toast')).toContainText('mehrere Lieder');
    await expect(page.locator('#edName')).toHaveValue('Kuckuck');
    await expect(page.locator('#edMeter')).toHaveValue('3/4');
    await expect(page.locator('#edUpbeat')).toHaveValue('1');
    await expect(page.locator('#edBpm')).toHaveValue('120');
    await expect(page.locator('#edBy')).toHaveValue('trad.');
    // B in F major is B flat; F2- ties into the next bar
    await expect(page.locator('#edMelody')).toHaveValue('C4 | A4 F4:2 | A4 F4:2~ | F4 G4:.5 A4:.5 Bb4 | C5:2 r');
    await expect(page.locator('#edLyrics')).toHaveValue("Kuck-uck, Kuck-uck _ ruft's aus dem Wald\n\nzwei-te Stro-phe, hier");
    await expect(page.locator('#edCheck')).toHaveText('✓ 5 Takte, 10 Noten\nStrophe 1: 9 Silben für 10 Noten\nStrophe 2: 5 Silben für 10 Noten');
    await page.click('#edSave');
    await expect(page.locator('#songTitle')).toHaveText('Kuckuck');
    await expect(score(page)).toHaveAttribute('data-notes', '11');
    await expect(labelsOf(page, 8)).toHaveText('♭7');

    // Pasted ABC text in the editor; a broken one gives a message
    await page.click('#btnEdit');
    await page.click('#edAbcBox summary');
    await page.fill('#edAbc', 'nur Text');
    await page.click('#edAbcApply');
    await expect(page.locator('#toast')).toHaveText('Im ABC-Text wurde kein Lied gefunden.');
    await page.fill('#edAbc', 'X:1\nT:Zwei Stimmen\nM:2/4\nL:1/8\nK:G\nV:1\nfg [ab]c|\nV:2\nDD DD|\n');
    await page.click('#edAbcApply');
    await expect(page.locator('#edMelody')).toHaveValue('F#5:.5 G5:.5 B5:.5 C5:.5');
    await expect(page.locator('#toast')).toContainText('oberste Stimme');
    await expect(page.locator('#toast')).toContainText('höchste Ton');
    await page.click('#edCancel');
  });

  test('own song in the Klavier app (via the address), also after a reload', async ({ page }) => {
    await page.goto(URL_);
    await newSong(page);
    await page.fill('#edName', 'Für das Klavier');
    await page.fill('#edMelody', 'C4 E4 G4 C5 | G4:2~ G4:2');
    await page.click('#edSave');
    await expect(page.locator('#toPiano')).toHaveAttribute('href', /^\.\.\/piano\/#song=[\w-]+$/);
    await page.click('#toPiano');
    await expect(page.locator('#songName')).toHaveText('Für das Klavier');
    await expect(page).toHaveURL(/\/piano\/$/);
    await openMenu(page);
    await expect(page.locator('#parts li')).toHaveText(['Melodie (5 Noten)']);   // the tied G sounds once
    await closeMenu(page);
    await page.reload();
    await expect(page.locator('#songName')).toHaveText('Für das Klavier');
    await page.goto('/piano/?link=1#song=kaputt');
    await expect(page.locator('#toast')).toHaveText('Das Lied aus dem Link lässt sich nicht öffnen.');
    await page.evaluate(() => localStorage.clear());
  });

  test('broken stored songs are left out, the backup contains the own songs', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('songbook.songs.v1', JSON.stringify([
        { id: 'u-ok', title: 'Gut', meter: '4/4', bpm: 90, upbeat: 0, melody: 'C4:4', lyrics: [], by: '', words: '' },
        { id: 'u-bad', title: 'Kaputt', meter: '4/4', bpm: 90, melody: 'C4:5' },
        { id: 'x', title: 'Falsche ID', meter: '4/4', bpm: 90, melody: 'C4:4' },
      ]));
      localStorage.setItem('songbook.settings.v1', JSON.stringify({ song: 'u-bad' }));
    });
    await page.goto(URL_);
    await expect(page.locator('#songTitle')).toHaveText('Alle meine Entchen');
    await expect(page.locator('#song optgroup[label="Eigene Lieder"] option')).toHaveText(['Gut']);
  });
});

test('link buttons look like the other buttons: text centred, no underline', async ({ page }) => {
  await page.goto(URL_);
  const [link, btn] = await Promise.all(['#toPiano', '#btnMidi'].map(sel => page.locator(sel).evaluate(el => {
    const r = el.getBoundingClientRect(), range = document.createRange();
    range.selectNodeContents(el);
    const tr = range.getBoundingClientRect();
    return { mid: (tr.top + tr.bottom) / 2 - (r.top + r.bottom) / 2, deco: getComputedStyle(el).textDecorationLine };
  })));
  expect(Math.abs(link.mid)).toBeLessThan(1.5);
  expect(Math.abs(btn.mid)).toBeLessThan(1.5);
  expect(link.deco).toBe('none');
});
