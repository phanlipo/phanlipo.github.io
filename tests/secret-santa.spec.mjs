// Wichteln: participants, rules, the draw (everyone gives to exactly one other person, rules kept),
// passing the phone around, secret links, English.
import { test, expect, clipboardText, switchLang } from './helpers.mjs';

async function addNames(page, names) {
  for (const n of names) {
    await page.fill('#nameIn', n);
    await page.press('#nameIn', 'Enter');
  }
}
/** Reveals every match by passing the phone around; returns { giver: receiver } */
async function revealAll(page) {
  const names = await page.locator('#people .person').allTextContents();
  const map = {};
  for (let i = 0; i < names.length; i++) {
    await page.locator('#people .person').nth(i).click();
    await expect(page.locator('#reveal')).toBeVisible();
    await page.click('#btnShow');
    map[names[i]] = await page.locator('#revealName').textContent();
    await page.click('#btnHide');
    await expect(page.locator('#reveal')).toBeHidden();
  }
  return map;
}
/** Everyone gives to exactly one other person and receives exactly one present */
function expectValid(map, names) {
  expect(Object.keys(map).sort()).toEqual([...names].sort());
  expect(Object.values(map).sort()).toEqual([...names].sort());
  for (const [a, b] of Object.entries(map)) expect(a).not.toBe(b);
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', d => d.accept());
  await page.goto('/secret-santa/');
});

test('participants: add, trim, duplicates rejected, remove, kept after reload', async ({ page }) => {
  await expect(page.locator('#btnDraw')).toBeDisabled();
  await expect(page.locator('#drawMsg')).toHaveText('Mindestens 3 Teilnehmer nötig');
  await addNames(page, ['  Anna  ', 'Ben', 'anna', '', 'Cem', 'Dora']);
  await expect(page.locator('#toast')).toHaveText('„anna“ ist schon dabei');
  await expect(page.locator('#names .who')).toHaveText(['Anna', 'Ben', 'Cem', 'Dora']);
  await expect(page.locator('#nameCount')).toHaveText('4');
  await page.click('[aria-label="Dora entfernen"]');
  await expect(page.locator('#names .who')).toHaveText(['Anna', 'Ben', 'Cem']);
  await expect(page.locator('#btnDraw')).toBeEnabled();
  await expect(page.locator('#drawMsg')).toHaveText('3 Teilnehmer – bereit zum Auslosen');
  await page.reload();
  await expect(page.locator('#names .who')).toHaveText(['Anna', 'Ben', 'Cem']);
});

test('pass the phone around: valid draw, everyone sees their match once, ✓ and warning', async ({ page }) => {
  const names = ['Anna', 'Ben', 'Cem', 'Dora', 'Emil', 'Fritz'];
  await addNames(page, names);
  await page.fill('#noteIn', 'Budget 20 €');
  await page.click('#btnDraw');
  await expect(page.locator('#setup')).toBeHidden();
  await expect(page.locator('#seenCount')).toHaveText('0 von 6 haben nachgesehen');
  // Step 1 does not show the match yet
  await page.locator('#people .person').first().click();
  await expect(page.locator('#revealH')).toHaveText('Gib das Handy an Anna');
  await expect(page.locator('#revealName')).toHaveText('');
  await expect(page.locator('#step2')).toBeHidden();
  await page.click('#btnCancel');
  await expect(page.locator('#seenCount')).toHaveText('0 von 6 haben nachgesehen');

  const map = await revealAll(page);
  expectValid(map, names);
  await expect(page.locator('#seenCount')).toHaveText('6 von 6 haben nachgesehen');
  await expect(page.locator('#people .person.seen')).toHaveCount(6);
  // Looking again: warning, same match, note shown; Escape hides it
  await page.reload();
  await page.locator('#people .person', { hasText: 'Cem' }).click();
  await expect(page.locator('#seenWarn')).toHaveText('Cem hat schon nachgesehen. Nur zeigen, wenn Cem es vergessen hat.');
  await page.click('#btnShow');
  await expect(page.locator('#revealName')).toHaveText(map.Cem);
  await expect(page.locator('#revealNote')).toHaveText('Budget 20 €');
  await page.keyboard.press('Escape');
  await expect(page.locator('#reveal')).toBeHidden();
  await expect(page.locator('#revealName')).toHaveText('');
});

test('rules: excluded pairs and mutual pairs never happen, both 3-person cycles occur', async ({ page }) => {
  test.setTimeout(90_000);
  await addNames(page, ['Anna', 'Ben', 'Cem', 'Dora', 'Emil']);
  await page.selectOption('#exA', 'Anna');
  await page.selectOption('#exB', 'Ben');
  await page.click('#btnExAdd');
  await page.selectOption('#exA', 'Ben');
  await page.selectOption('#exB', 'Anna');
  await page.click('#btnExAdd');
  await expect(page.locator('#toast')).toHaveText('Diesen Ausschluss gibt es schon');
  await page.selectOption('#exA', 'Cem');
  await page.selectOption('#exB', 'Dora');
  await page.click('#btnExAdd');
  await expect(page.locator('#excl .who')).toHaveText(['Anna ↔ Ben', 'Cem ↔ Dora']);
  await page.check('#optMutual');
  await page.click('#btnDraw');
  for (let round = 0; round < 8; round++) {
    const map = await revealAll(page);
    expectValid(map, ['Anna', 'Ben', 'Cem', 'Dora', 'Emil']);
    for (const [a, b] of [['Anna', 'Ben'], ['Cem', 'Dora']]) {
      expect(map[a]).not.toBe(b);
      expect(map[b]).not.toBe(a);
    }
    for (const [a, b] of Object.entries(map)) expect(map[b]).not.toBe(a);
    await page.click('#btnRedraw');
  }
  // 3 people have exactly two possible draws (A→B→C→A and A→C→B→A): both must come up
  await page.click('#btnEdit');
  await expect(page.locator('#setup')).toBeVisible();
  for (const n of ['Emil', 'Dora']) await page.click(`[aria-label="${n} entfernen"]`);
  await page.uncheck('#optMutual');
  await page.click('[aria-label="Ausschluss Anna ↔ Ben entfernen"]');
  await expect(page.locator('#excl li')).toHaveText(['Keine Ausschlüsse.']);
  await page.click('#btnDraw');
  const seen = new Set();
  for (let i = 0; i < 12 && seen.size < 2; i++) {
    seen.add((await revealAll(page)).Anna);
    await page.click('#btnRedraw');
  }
  expect([...seen].sort()).toEqual(['Ben', 'Cem']);
});

test('impossible rules: clear message, no draw', async ({ page }) => {
  await addNames(page, ['Anna', 'Ben', 'Cem']);
  for (const other of ['Ben', 'Cem']) {
    await page.selectOption('#exA', 'Anna');
    await page.selectOption('#exB', other);
    await page.click('#btnExAdd');
  }
  await page.click('#btnDraw');
  await expect(page.locator('#drawMsg')).toHaveText('Mit diesen Regeln ist keine Auslosung möglich – bitte Ausschlüsse lockern.');
  await expect(page.locator('#result')).toBeHidden();
  // 3 people and no mutual pairs: only the two cycles, still possible
  await page.click('[aria-label="Ausschluss Anna ↔ Ben entfernen"]');
  await page.click('[aria-label="Ausschluss Anna ↔ Cem entfernen"]');
  await page.check('#optMutual');
  await page.click('#btnDraw');
  await expect(page.locator('#result')).toBeVisible();
});

test('secret links: open shows the match, nothing stored; damaged link; own draw', async ({ page }) => {
  await addNames(page, ['Anna', 'Ben', 'Cem', 'Dora']);
  await page.fill('#noteIn', 'Feier am 20.12.');
  await page.click('#btnDraw');
  const map = await revealAll(page);
  await page.locator('#links li', { hasText: 'Ben' }).getByRole('button', { name: 'Kopieren: Ben' }).click();
  await expect(page.locator('#toast')).toHaveText('Link kopiert');
  await expect(page.locator('#links li', { hasText: 'Ben' }).locator('.badge')).toHaveText('verschickt');
  const text = await clipboardText(page);
  expect(text).toMatch(/^Hallo Ben, hier ist dein Wichtel-Los – nur du darfst es öffnen: http.*\/secret-santa\/#g=[A-Za-z0-9_-]+$/);
  const url = text.split(' ').pop();
  // The names are not readable in the link
  expect(url).not.toMatch(/Ben|Anna|Cem|Dora|Feier/);

  // Open it in a fresh browser (like the recipient)
  const other = await page.context().browser().newPage();
  await other.goto(url);
  await expect(other.locator('#linkView')).toBeVisible();
  await expect(other.locator('#setup')).toBeHidden();
  await expect(other.locator('#linkHello')).toHaveText('Hallo Ben!');
  await expect(other.locator('#linkTarget')).toBeHidden();
  await other.click('#btnLinkShow');
  await expect(other.locator('#linkTarget')).toHaveText(map.Ben);
  await expect(other.locator('#linkNote')).toHaveText('Feier am 20.12.');
  expect(await other.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('secret-santa.')))).toEqual([]);
  await other.click('#btnOwn');
  await expect(other.locator('#linkView')).toBeHidden();
  await expect(other.locator('#setup')).toBeVisible();
  expect(new URL(other.url()).hash).toBe('');
  // Damaged link
  await other.goto(url.slice(0, -6) + '@@');
  await expect(other.locator('#linkError')).toBeVisible();
  await other.goto(url.slice(0, url.length - 5));
  await expect(other.locator('#linkError')).toBeVisible();
  await expect(other.locator('#btnLinkShow')).toBeHidden();
  await other.close();
});

test('changing participants discards the draw after asking', async ({ page }) => {
  await addNames(page, ['Anna', 'Ben', 'Cem']);
  await page.click('#btnDraw');
  await page.click('#btnEdit');
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#names .who')).toHaveText(['Anna', 'Ben', 'Cem']);
  await page.reload();
  await expect(page.locator('#result')).toBeHidden();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('draw and reveal in English', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Secret Santa');
    await addNames(page, ['Ann', 'Bob']);
    await expect(page.locator('#drawMsg')).toHaveText('At least 3 participants needed');
    await addNames(page, ['Cy']);
    await page.click('#btnDraw');
    await expect(page.locator('#seenCount')).toHaveText('0 of 3 have looked');
    await page.locator('#people .person').first().click();
    await expect(page.locator('#btnShow')).toHaveText('I am Ann – show');
    await page.click('#btnShow');
    await expect(page.locator('#step2')).toContainText('You give a present to');
    await page.click('#btnHide');
    await switchLang(page, 'de');
    await expect(page.locator('#seenCount')).toHaveText('1 von 3 haben nachgesehen');
  });
});
