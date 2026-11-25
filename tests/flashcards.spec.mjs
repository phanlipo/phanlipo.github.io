// Karteikarten: Stapel anlegen, Karten verwalten, Lernkasten (Leitner) mit gesteuerter Uhr, JSON laden/speichern.
import { test, expect, openMenu, closeMenu, onDialog, switchLang, axe, expectNoHorizontalScroll } from './helpers.mjs';
import { readFile } from 'node:fs/promises';

test.use({ timezoneId: 'Europe/Berlin' });
const NOW = new Date('2026-11-25T10:00:00+01:00').getTime();
const DAY = 86400000;
const MIDNIGHT = new Date('2026-11-25T00:00:00+01:00').getTime();
const LS = 'flashcards.decks.v1';
const decks = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW - 1000 });
  await page.clock.pauseAt(NOW);
  await page.goto('/flashcards/');
});

async function createDeck(page, name = 'Englisch') {
  await page.fill('#setupName', name);
  await page.click('#setupForm button[type=submit]');
  await expect(page.locator('#deckName')).toHaveText(name);
}
async function addCard(page, front, back) {
  await page.fill('#addFront', front);
  await page.fill('#addBack', back);
  await page.click('#addForm button[type=submit]');
}
async function importJson(page, value, name = 'cards.json') {
  await page.setInputFiles('#fileSetup', { name, mimeType: 'application/json', buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)) });
}
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: dl.suggestedFilename(), json: JSON.parse(await readFile(await dl.path(), 'utf8')) };
}

test('first start shows only the setup; a deck with cards survives a reload', async ({ page }) => {
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#deckView')).toBeHidden();
  await page.click('#setupForm button[type=submit]');
  await expect(page.locator('#setupError')).toHaveText('Bitte einen Namen eingeben.');
  await createDeck(page);
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#noCardsHint')).toBeVisible();
  await addCard(page, 'Hund', 'dog');
  await addCard(page, 'Katze', 'cat');
  await addCard(page, 'Hund', 'dog');
  await expect(page.locator('#addError')).toHaveText('Diese Karte gibt es schon im Stapel.');
  await expect(page.locator('#cards li')).toHaveCount(2);
  await expect(page.locator('#stTotal')).toHaveText('2');
  await expect(page.locator('#stNew')).toHaveText('2');
  await expect(page.locator('#btnLearn')).toHaveText('Lernen (2 fällig)');
  await page.reload();
  await expect(page.locator('#cards .name')).toHaveText(['Hund', 'Katze']);
  await expect(page.locator('#cards .meta').first()).toHaveText('dog · neu');
});

test('learning moves cards through the boxes with the right due dates', async ({ page }) => {
  await createDeck(page);
  await addCard(page, 'Hund', 'dog');
  await addCard(page, 'Katze', 'cat');
  await openMenu(page);
  await page.locator('#appMenu summary', { hasText: 'Einstellungen' }).click();
  await page.uncheck('#optShuffle');
  await closeMenu(page);
  await page.click('#btnLearn');
  await expect(page.locator('#learnCount')).toHaveText('Karte 1 von 2');
  await expect(page.locator('#qText')).toHaveText('Hund');
  await expect(page.locator('#aText')).toBeHidden();
  await page.click('#flashcard');
  await expect(page.locator('#aText')).toHaveText('dog');
  await page.click('#btnRight');
  await expect(page.locator('#qText')).toHaveText('Katze');
  await page.click('#btnFlip');
  await page.click('#btnWrong');
  // Not known → comes again in the same round (default), counts only the first answer
  await expect(page.locator('#qText')).toHaveText('Katze');
  await page.click('#btnFlip');
  await page.click('#btnRight');
  await expect(page.locator('#resultText')).toHaveText('1 von 2 gewusst');
  let s = await decks(page);
  const [hund, katze] = s.decks[0].cards;
  // New counts as box 1: right → box 2, due tomorrow at midnight
  expect(hund).toMatchObject({ box: 2, due: MIDNIGHT + DAY });
  // Wrong → box 1, then right in the same round → box 2, due tomorrow
  expect(katze).toMatchObject({ box: 2, due: MIDNIGHT + DAY });
  await page.click('#btnStop');
  await expect(page.locator('#stDue')).toHaveText('0');
  await expect(page.locator('#boxes')).toHaveText('Fach 1: 0 · Fach 2: 2 · Fach 3: 0 · Fach 4: 0 · Fach 5: 0');
  await expect(page.locator('#noneDue')).toContainText('Nächste Karte: Donnerstag, 26. November.');
  await expect(page.locator('#btnLearn')).toBeHidden();
  await expect(page.locator('#btnPractice')).toBeVisible();
  // Tomorrow both are due again; right → box 3 (3 days), wrong → box 1 (due now)
  await page.clock.setSystemTime(NOW + DAY);
  await page.reload();
  await expect(page.locator('#btnLearn')).toHaveText('Lernen (2 fällig)');
  await page.click('#btnLearn');
  await page.click('#btnFlip');
  await page.click('#btnRight');
  await page.click('#btnFlip');
  await page.click('#btnWrong');
  s = await decks(page);
  expect(s.decks[0].cards[0]).toMatchObject({ box: 3, due: MIDNIGHT + DAY + 3 * DAY });
  expect(s.decks[0].cards[1]).toMatchObject({ box: 1, due: NOW + DAY });
});

test('editing and deleting a card, with undo', async ({ page }) => {
  await createDeck(page);
  await addCard(page, 'Hund', 'dgo');
  await page.click('#cards .open');
  await expect(page.locator('#editDlg')).toBeVisible();
  await page.fill('#editBack', 'dog');
  await page.click('#editForm button[type=submit]');
  await expect(page.locator('#cards .meta')).toHaveText('dog · neu');
  await page.click('#cards .btn.icon');
  await expect(page.locator('#cards li.muted')).toHaveText('Noch keine Karten.');
  await page.locator('.toast-action').click();
  await expect(page.locator('#cards .name')).toHaveText('Hund');
  expect((await decks(page)).decks[0].cards).toHaveLength(1);
});

test('decks are managed in the menu and switched with chips', async ({ page }) => {
  await createDeck(page, 'Englisch');
  await onDialog(page, d => d.accept('Latein'), { once: true });
  await openMenu(page);
  await page.locator('#appMenu summary', { hasText: 'Stapel verwalten' }).click();
  await page.click('#btnNewDeck');
  await expect(page.locator('#deckName')).toHaveText('Latein');
  await expect(page.locator('#deckChips button')).toHaveText(['Englisch', 'Latein']);
  await page.locator('#deckChips button', { hasText: 'Englisch' }).click();
  await expect(page.locator('#deckName')).toHaveText('Englisch');
  await openMenu(page);
  await page.locator('#appMenu summary', { hasText: 'Stapel verwalten' }).click();
  await page.getByRole('button', { name: 'Löschen: Latein' }).click();
  await expect(page.locator('#deckList li')).toHaveCount(1);
  await closeMenu(page);
  await expect(page.locator('#deckChips')).toBeHidden();
});

test('JSON export holds cards and progress; importing it again adds nothing twice', async ({ page }) => {
  await createDeck(page, 'Englisch Vokabeln');
  await addCard(page, 'Hund', 'dog');
  await addCard(page, 'Katze', 'cat');
  await page.click('#btnLearn');
  await page.click('#btnFlip');
  await page.click('#btnWrong');
  await page.click('#btnStop');
  await openMenu(page);
  const { name, json } = await download(page, () => page.click('#btnExport'));
  expect(name).toBe('Englisch-Vokabeln.json');
  expect(json).toMatchObject({ format: 'flashcards', formatVersion: 1 });
  const cards = json.decks[0].cards;
  expect(json.decks[0].name).toBe('Englisch Vokabeln');
  expect(cards).toHaveLength(2);
  expect(cards.filter(c => c.box === 1)).toHaveLength(1);
  expect(cards.find(c => c.box === 1).due).toBe(new Date(NOW).toISOString());
  expect(cards.find(c => !c.box)).toEqual({ front: expect.any(String), back: expect.any(String) });

  // The same file plus one new card: merged into the deck of the same name
  json.decks[0].cards.push({ front: 'Maus', back: 'mouse' });
  await page.setInputFiles('#fileMenu', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await expect(page.locator('.toast')).toHaveText('1 Stapel, 1 Karten geladen (2 schon vorhanden)');
  await expect(page.locator('#stTotal')).toHaveText('3');
  expect((await decks(page)).decks).toHaveLength(1);
});

test('simple JSON shapes are accepted, wrong files are refused', async ({ page }) => {
  await importJson(page, '{ nope');
  await expect(page.locator('.toast')).toHaveText('Die Datei ist keine passende JSON-Datei mit Karteikarten.');
  await expect(page.locator('#setup')).toBeVisible();
  await importJson(page, { format: 'flashcards', formatVersion: 99, decks: [] });
  await expect(page.locator('.toast')).toHaveText('Die Datei ist keine passende JSON-Datei mit Karteikarten.');
  // Plain list: deck named after the file, several field names and pairs
  await importJson(page, [{ question: '2+2', answer: '4' }, { q: '3·3', a: '9' }, ['Rom', 'Italien'], { term: 'H2O', definition: 'Wasser' }, { front: '', back: 'x' }], 'Mathe.json');
  await expect(page.locator('#deckName')).toHaveText('Mathe');
  await expect(page.locator('#stTotal')).toHaveText('4');
  // Box and due date are taken over
  await importJson(page, { name: 'Geo', cards: [{ front: 'A', back: 'B', box: 3, due: '2026-12-01T00:00:00.000Z' }] });
  const s = await decks(page);
  expect(s.decks.map(d => d.name)).toEqual(['Mathe', 'Geo']);
  expect(s.decks[1].cards[0]).toMatchObject({ box: 3, due: Date.parse('2026-12-01T00:00:00.000Z') });
});

test('example deck and English texts', async ({ page }) => {
  await switchLang(page, 'en');
  await page.click('#btnExample');
  await expect(page.locator('#deckName')).toHaveText('Example: capitals');
  await expect(page.locator('#btnLearn')).toHaveText('Learn (8 due)');
  await expect(page.locator('#cards .meta').first()).toHaveText('Berlin · new');
  await switchLang(page, 'de');
  await expect(page.locator('#btnLearn')).toHaveText('Lernen (8 fällig)');
});

test('resetting the progress asks first', async ({ page }) => {
  await page.click('#btnExample');
  await page.click('#btnLearn');
  await page.click('#btnFlip');
  await page.click('#btnRight');
  await page.click('#btnStop');
  await expect(page.locator('#stNew')).toHaveText('7');
  await onDialog(page, d => d.accept(), { once: true });
  await openMenu(page);
  await page.click('#btnResetProgress');
  await expect(page.locator('#stNew')).toHaveText('8');
});

test('deck and learning views: accessible, no sideways scrolling at 375 px', async ({ page }) => {
  await page.clock.resume(); // axe needs running timers
  await page.setViewportSize({ width: 375, height: 740 });
  await page.click('#btnExample');
  await onDialog(page, d => d.accept('Zweiter Stapel mit langem Namen'), { once: true });
  await openMenu(page);
  await page.locator('#appMenu summary', { hasText: 'Stapel verwalten' }).click();
  await page.click('#btnNewDeck');
  await page.locator('#deckChips button').first().click();
  await expectNoHorizontalScroll(page);
  expect((await axe(page).analyze()).violations).toEqual([]);
  await page.click('#btnLearn');
  await expectNoHorizontalScroll(page);
  expect((await axe(page).analyze()).violations).toEqual([]);
  await page.click('#flashcard');
  await expect(page.locator('#answerRow')).toBeVisible();
  expect((await axe(page).analyze()).violations).toEqual([]);
});
