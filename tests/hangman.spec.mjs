// Galgenmännchen: rules and word lists (checked independently), winning and losing with a known word,
// drawing grows with the mistakes, statistics, tip, give up/other word, two players (secret word,
// validation, hint), physical keyboard, settings, reload, English.
import { test, expect, openMenu, closeMenu, onDialog, switchLang } from './helpers.mjs';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const LS = 'hangman.state.v1';
const ctx = {};
vm.runInNewContext(readFileSync(new URL('../hangman/game.js', import.meta.url), 'utf8'), ctx);
const H = ctx.Hangman;

const key = (page, l) => page.locator(`#keys .key[data-l="${l}"]`);
const tap = async (page, letters) => { for (const l of letters) await key(page, l).click(); };
const stored = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);
// Starts the page with a known word (as a word from the list, or an own word)
async function withWord(page, word, extra = {}, path = '/hangman/') {
  const game = { word, lang: 'de', cat: 'animals', source: 'list', lives: 8, guessed: [], hints: 0, ...extra.game };
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(s)); sessionStorage.setItem('seeded', '1'); } },
    [LS, { mode: 'solo', level: 'medium', cat: 'all', ...extra, game }]);
  await page.goto(path);
}
const visibleParts = page => page.locator('#drawing .part.on').count();
const shown = page => page.locator('#word .ch').evaluateAll(els => els.map(e => e.textContent || '_').join(''));

test.describe('rules', () => {
  test('every word in the lists can be played, is unique in its topic and fits the alphabet', () => {
    for (const lang of ['de', 'en']) {
      const allowed = lang === 'de' ? /^[A-ZÄÖÜ]+(?:[ -][A-ZÄÖÜ]+)*$/ : /^[A-Z]+(?:[ -][A-Z]+)*$/;
      for (const cat of H.CATEGORIES) {
        const words = [...H.WORDS[lang][cat]];
        expect(words.length, `${lang}/${cat}`).toBeGreaterThanOrEqual(30);
        expect(new Set(words).size, `${lang}/${cat} duplicates`).toBe(words.length);
        for (const w of words) {
          expect(w, `${lang}/${cat}`).toMatch(allowed);
          expect(H.check(w, lang), w).toBe('');
          expect(w.length).toBeLessThanOrEqual(30);
        }
      }
    }
  });

  test('check() and normalize() for typed words', () => {
    expect(H.normalize('  eis  -  bär ')).toBe('EIS-BÄR');
    expect(H.normalize('Straße')).toBe('STRASSE');
    expect(H.check('Eisbär', 'de')).toBe('');
    expect(H.check('Eisbär', 'en')).toBe('chars');
    expect(H.check('ice  cream', 'en')).toBe('');
    expect(H.check('', 'de')).toBe('empty');
    expect(H.check('   ', 'de')).toBe('empty');
    expect(H.check('AAA', 'de')).toBe('short');
    expect(H.check('R2D2', 'de')).toBe('chars');
    expect(H.check('café', 'en')).toBe('chars');
    expect(H.check('-ab', 'de')).toBe('chars');
    expect(H.check('a'.repeat(15) + 'b'.repeat(16), 'de')).toBe('long');
  });

  test('a game: hits, misses, mask, parts, win and loss as counted independently', () => {
    const g = H.create({ word: 'Ice cream', lang: 'en', lives: 6 });
    expect(H.mask(g).map(c => c ?? '_').join('')).toBe('___ _____');
    expect(H.parts(g)).toBe(11 - 6); // the gallows stands on hard
    expect(H.guess(g, 'e')).toBe(true);
    expect(H.mask(g).map(c => c ?? '_').join('')).toBe('__E __E__');
    expect(H.guess(g, 'Z')).toBe(false);
    expect(() => H.guess(g, 'E')).toThrow('guessed');
    expect(() => H.guess(g, 'Ä')).toThrow('letter');
    expect(() => H.guess(g, '1')).toThrow('letter');
    expect(H.mistakes(g)).toBe(1);
    expect(H.parts(g)).toBe(6);
    for (const l of 'ICRAM') H.guess(g, l);
    expect(H.status(g)).toBe('won');
    expect(() => H.guess(g, 'B')).toThrow('over');

    const l = H.create({ word: 'HUND', lang: 'de', lives: 8 });
    for (const x of 'QWXYZPV') H.guess(l, x);
    expect(H.status(l)).toBe('playing');
    H.guess(l, 'B');
    expect(H.status(l)).toBe('lost');
    expect(H.parts(l)).toBe(11);
    expect(H.mask(l).join('')).toBe('HUND');
  });

  test('tip uncovers a missing letter for one mistake, never the last life or the last letter', () => {
    const g = H.create({ word: 'KATZE', lang: 'de', lives: 6 });
    const l = H.tip(g, () => 0);
    expect('KATZE').toContain(l);
    expect(H.mistakes(g)).toBe(1);
    for (const x of 'QWXY') H.guess(g, x);
    expect(H.mistakes(g)).toBe(5);
    expect(H.canTip(g)).toBe(false); // one mistake left
    const h = H.create({ word: 'AB', lang: 'de', lives: 8 });
    H.guess(h, 'A');
    expect(H.canTip(h)).toBe(false); // only one letter missing
  });

  test('pick() keeps to the topic and avoids recent words while possible', () => {
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const recent = [];
    const words = H.WORDS.de.food;
    for (let i = 0; i < words.length; i++) {
      const p = H.pick('de', 'food', recent, rnd);
      expect(p.cat).toBe('food');
      expect(recent).not.toContain(p.word);
      recent.push(p.word);
    }
    expect(new Set(recent).size).toBe(words.length);
    expect(words).toContain(H.pick('de', 'food', recent, rnd).word); // all played: any again
    const cats = new Set(Array.from({ length: 300 }, () => H.pick('en', 'all', [], rnd).cat));
    expect(cats.size).toBe(H.CATEGORIES.length);
  });
});

test('win a word: letters appear, wrong ones draw the figure, statistics count', async ({ page }) => {
  await withWord(page, 'KATZE');
  await expect(page.locator('#topic')).toHaveText('Thema: Tiere');
  await expect(page.locator('#lives')).toHaveText('Fehler 0 von 8');
  expect(await visibleParts(page)).toBe(3); // medium: hill, post and beam stand
  await expect(page.locator('#word')).toHaveAttribute('aria-label', 'Wort mit 5 Buchstaben: Lücke Lücke Lücke Lücke Lücke');
  await tap(page, 'A');
  expect(await shown(page)).toBe('_A___');
  await expect(key(page, 'A')).toHaveAttribute('data-state', 'hit');
  await expect(key(page, 'A')).toBeDisabled();
  await expect(key(page, 'A')).toHaveAccessibleName('A, richtig');
  await tap(page, 'OU');
  await expect(key(page, 'O')).toHaveAttribute('data-state', 'miss');
  await expect(page.locator('#lives')).toHaveText('Fehler 2 von 8');
  expect(await visibleParts(page)).toBe(5);
  await expect(page.locator('#status')).toHaveText('Noch 6 Fehler erlaubt');
  await tap(page, 'KTZE');
  await expect(page.locator('#status')).toHaveText('Gewonnen!');
  await expect(page.locator('#keys')).toBeHidden();
  await expect(page.locator('#btnNext')).toBeVisible();
  await expect(page.locator('#btnTip')).toBeHidden();
  expect((await stored(page)).stats).toEqual({ won: 1, lost: 0, streak: 1, best: 1 });
  await openMenu(page);
  await expect(page.locator('#stWon')).toHaveText('1');
  await expect(page.locator('#stStreak')).toHaveText('1');
  await closeMenu(page);
  // Next word comes from the list and is new
  await page.click('#btnNext');
  await expect(page.locator('#status')).toHaveText('Noch 8 Fehler erlaubt');
  const s = await stored(page);
  expect(s.game.word).not.toBe('KATZE');
  expect(s.recent).toContain(s.game.word);
  expect(Object.values(H.WORDS.de).flat()).toContain(s.game.word);
});

test('lose a word: the full figure, the word uncovered in red, the streak ends', async ({ page }) => {
  await withWord(page, 'HUND', { stats: { won: 3, lost: 0, streak: 3, best: 3 } });
  await tap(page, 'QWXYZPV');
  await expect(page.locator('#status')).toHaveText('Nur noch ein Fehler erlaubt!');
  await expect(page.locator('#lives')).toHaveAttribute('data-low', 'true');
  await tap(page, 'N');
  await tap(page, 'B');
  await expect(page.locator('#status')).toHaveText('Leider verloren – das war das Wort.');
  expect(await visibleParts(page)).toBe(11);
  await expect(page.locator('#drawing')).toHaveAttribute('data-result', 'lost');
  expect(await shown(page)).toBe('HUND');
  await expect(page.locator('#word .ch.missed')).toHaveCount(3);
  expect((await stored(page)).stats).toEqual({ won: 3, lost: 1, streak: 0, best: 3 });
  // Reload keeps the finished game and doesn't count it twice
  await page.reload();
  await expect(page.locator('#status')).toHaveText('Leider verloren – das war das Wort.');
  expect((await stored(page)).stats.lost).toBe(1);
});

test('a running game survives a reload; difficulty sets the drawing', async ({ page }) => {
  await withWord(page, 'ELEFANT', { level: 'easy', game: { lives: 11 } });
  expect(await visibleParts(page)).toBe(0);
  await tap(page, 'EQ');
  expect(await visibleParts(page)).toBe(1);
  await page.reload();
  expect(await shown(page)).toBe('E_E____');
  await expect(key(page, 'Q')).toHaveAttribute('data-state', 'miss');
  await expect(page.locator('#lives')).toHaveText('Fehler 1 von 11');
  // Changing the difficulty while guessing applies to the next word
  await openMenu(page);
  await page.locator('#levels [data-v="hard"]').click();
  await expect(page.locator('.toast').last()).toContainText('Gilt ab dem nächsten Wort');
  await closeMenu(page);
  await expect(page.locator('#lives')).toHaveText('Fehler 1 von 11');
});

test('an untouched word takes a new difficulty and topic right away', async ({ page }) => {
  await withWord(page, 'KATZE');
  await openMenu(page);
  await page.locator('#levels [data-v="hard"]').click();
  await expect(page.locator('#levels [data-v="hard"]')).toHaveAttribute('aria-pressed', 'true');
  await closeMenu(page);
  await expect(page.locator('#lives')).toHaveText('Fehler 0 von 6');
  expect(await visibleParts(page)).toBe(5);
  expect((await stored(page)).game.word).toBe('KATZE');
  await openMenu(page);
  await page.locator('#cats [data-v="vehicles"]').click();
  await closeMenu(page);
  await expect(page.locator('#topic')).toHaveText('Thema: Fahrzeuge');
  const s = await stored(page);
  expect(H.WORDS.de.vehicles).toContain(s.game.word);
  expect(s.cat).toBe('vehicles');
  expect(s.game.lives).toBe(6);
});

test('tip uncovers a letter and costs a mistake', async ({ page }) => {
  await withWord(page, 'BANANE');
  await page.click('#btnTip');
  await expect(page.locator('#lives')).toHaveText('Fehler 1 von 8');
  const g = (await stored(page)).game;
  expect(g.hints).toBe(1);
  expect(g.guessed).toHaveLength(1);
  expect('BANANE').toContain(g.guessed[0]);
  await expect(key(page, g.guessed[0])).toHaveAttribute('data-state', 'hit');
  expect((await shown(page)).replace(/_/g, '')).toMatch(new RegExp(`^${g.guessed[0]}+$`));
  // No tip with one mistake left
  await tap(page, 'QWXYZP');
  await expect(page.locator('#lives')).toHaveText('Fehler 7 von 8');
  await expect(page.locator('#btnTip')).toBeHidden();
});

test('menu: other word before guessing, give up afterwards (counts as lost)', async ({ page }) => {
  await withWord(page, 'KATZE');
  await openMenu(page);
  await expect(page.locator('#btnGiveUp')).toBeHidden();
  await page.click('#btnSkip');
  await expect(page.locator('#status')).toHaveText('Noch 8 Fehler erlaubt');
  let s = await stored(page);
  expect(s.game.word).not.toBe('KATZE');
  expect(s.stats.lost).toBe(0);
  await page.locator('#keys .key').first().click();
  await openMenu(page);
  await expect(page.locator('#btnSkip')).toBeHidden();
  await page.click('#btnGiveUp');
  await expect(page.locator('#status')).toHaveText('Leider verloren – das war das Wort.');
  s = await stored(page);
  expect(await shown(page)).toBe(s.game.word);
  expect(s.stats.lost).toBe(1);
});

test('physical keyboard guesses letters (also umlauts) and Enter starts the next word', async ({ page }) => {
  await withWord(page, 'KÄSE');
  await page.keyboard.press('k');
  // A German keyboard sends the umlaut as its own key
  await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ä', bubbles: true })));
  await page.keyboard.press('x');
  expect(await shown(page)).toBe('KÄ__');
  await expect(page.locator('#lives')).toHaveText('Fehler 1 von 8');
  await page.keyboard.press('S');
  await page.keyboard.press('e');
  await expect(page.locator('#status')).toHaveText('Gewonnen!');
  await page.keyboard.press('Enter');
  await expect(page.locator('#keys')).toBeVisible();
  expect((await stored(page)).game.word).not.toBe('KÄSE');
});

test('two players: secret word hidden, checked, with hint; statistics stay untouched', async ({ page }) => {
  await page.goto('/hangman/');
  await openMenu(page);
  await page.locator('#mode [data-v="duo"]').click();
  await expect(page.locator('#catBox')).toBeHidden();
  await closeMenu(page);
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#play')).toBeHidden();
  await expect(page.locator('#secret')).toHaveAttribute('type', 'password');
  await page.click('#btnStart');
  await expect(page.locator('#setupErr')).toHaveText('Bitte ein Wort eingeben.');
  await page.fill('#secret', 'R2D2');
  await page.click('#btnStart');
  await expect(page.locator('#setupErr')).toContainText('Nur Buchstaben');
  await page.fill('#secret', 'Eis-bär');
  await page.click('#btnShow');
  await expect(page.locator('#secret')).toHaveAttribute('type', 'text');
  await expect(page.locator('#btnShow')).toHaveAccessibleName('Wort verbergen');
  await expect(page.locator('#setupErr')).toBeHidden();
  await page.fill('#hintIn', 'ein Tier');
  await page.click('#btnStart');
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#topic')).toHaveText('Hinweis: ein Tier');
  expect(await shown(page)).toBe('___-___');
  await expect(page.locator('#secret')).toHaveValue('');
  await expect(page.locator('#secret')).toHaveAttribute('type', 'password');
  await tap(page, 'EISBÄR');
  await expect(page.locator('#status')).toHaveText('Gewonnen – ganz ohne Fehler!');
  expect((await stored(page)).stats).toEqual({ won: 0, lost: 0, streak: 0, best: 0 });
  await page.click('#btnNext');
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#secret')).toBeFocused();
  // Back to alone: a word from the list right away
  await openMenu(page);
  await page.locator('#mode [data-v="solo"]').click();
  await closeMenu(page);
  await expect(page.locator('#play')).toBeVisible();
  expect((await stored(page)).game.source).toBe('list');
});

test('statistics reset asks first', async ({ page }) => {
  await withWord(page, 'HUND', { stats: { won: 2, lost: 1, streak: 0, best: 2 } });
  await openMenu(page);
  await onDialog(page, d => d.dismiss(), { once: true });
  await page.click('#btnResetStats');
  await expect(page.locator('#stWon')).toHaveText('2');
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnResetStats');
  await expect(page.locator('#stWon')).toHaveText('0');
  expect((await stored(page)).stats).toEqual({ won: 0, lost: 0, streak: 0, best: 0 });
});

test('a broken or tampered stored game is dropped or repaired', async ({ page }) => {
  await withWord(page, 'HUND', { game: { guessed: ['H', 'H', 'x', '1', 'Q'], lives: 99 } });
  const g = (await stored(page)).game;
  expect(g.word).toBe('HUND');
  expect(g.guessed).toEqual(['H', 'X', 'Q']);
  expect(g.lives).toBe(8);
  await page.evaluate(k => localStorage.setItem(k, JSON.stringify({ mode: 'solo', game: { word: '<b>1</b>' } })), LS);
  await page.reload();
  expect((await stored(page)).game.word).not.toBe('<b>1</b>');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('words, keys and texts in English; switching language swaps an untouched word', async ({ page }) => {
    await page.goto('/hangman/');
    let s = await stored(page);
    expect(s.game.lang).toBe('en');
    expect(Object.values(H.WORDS.en).flat()).toContain(s.game.word);
    await expect(page.locator('#keys .key')).toHaveCount(26);
    await expect(page.locator('#status')).toHaveText('8 mistakes left');
    await switchLang(page, 'de');
    s = await stored(page);
    expect(s.game.lang).toBe('de');
    await expect(page.locator('#keys .key')).toHaveCount(29);
    await expect(page.locator('#status')).toHaveText('Noch 8 Fehler erlaubt');
    // A touched word stays in its language
    await page.locator('#keys .key').first().click();
    await switchLang(page, 'en');
    expect((await stored(page)).game.lang).toBe('de');
    await expect(page.locator('#lives')).toContainText('Mistakes');
  });
});
