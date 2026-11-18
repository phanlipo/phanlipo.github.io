// Turnier: Mitspieler → Teams → Spielplan → Ergebnisse → Tabelle / K.-o.-Baum
import { test, expect, openMenu, onDialog, switchLang, clipboardText } from './helpers.mjs';

test.beforeEach(async ({ page }) => { await page.goto('/tournament/'); });

async function addPlayers(page, text) {
  await page.fill('#nameIn', text);
  await page.click('#addForm button[type=submit]');
}
/** Singles in the entered order (no draw), so the schedule is known in advance */
async function startFixed(page, names, mode) {
  await addPlayers(page, names.join(', '));
  await page.locator('#size [data-size="1"]').click();
  await page.uncheck('#optRandom');
  await page.locator(`input[name=mode][value="${mode}"]`).check();
  await page.click('#btnStart');
  await expect(page.locator('#play')).toBeVisible();
}
async function enter(page, no, a, b) {
  await page.locator(`#games button.game[data-no="${no}"]`).click();
  await page.fill('#scoreA', String(a));
  await page.fill('#scoreB', String(b));
  await page.click('#scoreForm button[type=submit]');
}
const gameRow = (page, no) => page.locator(`#games button.game[data-no="${no}"]`);

test('players: several at once, duplicates refused, remove with undo', async ({ page }) => {
  await expect(page.locator('#btnStart')).toBeDisabled();
  await expect(page.locator('#startNote')).toBeVisible();
  await addPlayers(page, 'Anna, Ben;  Cem ');
  await expect(page.locator('#players .name')).toHaveText(['Anna', 'Ben', 'Cem']);
  await expect(page.locator('#playerCount')).toHaveText('3');
  await addPlayers(page, 'anna');
  await expect(page.locator('#addError')).toHaveText('„anna“ ist schon eingetragen.');
  await expect(page.locator('#players .name')).toHaveCount(3);
  await page.getByRole('button', { name: 'Löschen: Ben' }).click();
  await expect(page.locator('#players .name')).toHaveText(['Anna', 'Cem']);
  await page.locator('#toast button').click();
  await expect(page.locator('#players .name')).toHaveText(['Anna', 'Ben', 'Cem']);
  await page.reload();
  await expect(page.locator('#players .name')).toHaveText(['Anna', 'Ben', 'Cem']);
});

test('teams of two are drawn from everyone, uneven numbers get a bigger team, the draw survives a reload', async ({ page }) => {
  const names = ['A1', 'B2', 'C3', 'D4', 'E5', 'F6', 'G7'];
  await addPlayers(page, names.join(','));
  await expect(page.locator('#teamPreview li')).toHaveCount(3);
  await expect(page.locator('#teamNote')).toHaveText('7 Personen ergeben 3 Teams – 1 davon mit einer Person mehr.');
  const teams = await page.locator('#teamPreview .name').allTextContents();
  const members = teams.flatMap(t => t.split(/, | & /)).sort();
  expect(members).toEqual(names);
  expect(teams.map(t => t.split(/, | & /).length).sort()).toEqual([2, 2, 3]);
  await page.reload();
  await expect(page.locator('#teamPreview .name')).toHaveText(teams);
  // Drawing again gives a different seed (and is saved)
  const seed = await page.evaluate(() => JSON.parse(localStorage.getItem('tournament.setup.v1')).seed);
  await page.click('#btnShuffle');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('tournament.setup.v1')).seed)).not.toBe(seed);
  // Without drawing: pairs in the entered order
  await page.uncheck('#optRandom');
  await expect(page.locator('#teamPreview .name')).toHaveText(['A1, B2 & G7', 'C3 & D4', 'E5 & F6']);
  await expect(page.locator('[data-mode-info="rr"]')).toHaveText('3 Spiele in 3 Runden');
  await expect(page.locator('[data-mode-info="rr2"]')).toHaveText('6 Spiele in 6 Runden');
  await expect(page.locator('[data-mode-info="ko"]')).toHaveText('2 Spiele, wer verliert, scheidet aus');
});

test('round robin: everyone meets everyone once, results make the table and the winner', async ({ page }) => {
  await startFixed(page, ['Anna', 'Ben', 'Cem', 'Dora'], 'rr');
  // Circle method: round 1 A–D, B–C; round 2 C–A, D–B; round 3 A–B, C–D
  await expect(page.locator('#games h3')).toHaveText(['Runde 1', 'Runde 2', 'Runde 3']);
  await expect(page.locator('#games button.game .who')).toHaveText(['Anna – Dora', 'Ben – Cem', 'Cem – Anna', 'Dora – Ben', 'Anna – Ben', 'Cem – Dora']);
  await expect(page.locator('#gamesDone')).toHaveText('0 von 6');
  await expect(page.locator('#nextVs')).toContainText('Anna gegen Dora');
  await expect(page.locator('#nextLater')).toHaveText('Danach: Ben gegen Cem');

  await page.click('#btnNext');
  await expect(page.locator('#labelA')).toHaveText('Anna');
  // +/− buttons count goals
  for (let i = 0; i < 10; i++) await page.locator('[data-step="a"][data-d="1"]').click();
  await page.fill('#scoreB', '5');
  await page.click('#scoreForm button[type=submit]');
  await expect(gameRow(page, 1).locator('.res')).toHaveText('10 : 5');
  await expect(gameRow(page, 1).locator('.win')).toHaveText('Anna');
  await enter(page, 2, 10, 8);
  await enter(page, 3, 7, 10);
  await enter(page, 4, 10, 10);
  await enter(page, 5, 6, 10);
  await expect(page.locator('#champCard')).toBeHidden();
  await enter(page, 6, 10, 2);
  await expect(page.locator('#gamesDone')).toHaveText('6 von 6');
  await expect(page.locator('#nextCard')).toBeHidden();
  await expect(page.locator('#champName')).toHaveText('Ben');

  await page.locator('#view [data-view="table"]').click();
  // Ben 7 (30:24), Anna 6 (26:22), Cem 3 (25:22), Dora 1 (17:30)
  const rows = await page.locator('#standings tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(c => c.textContent)));
  expect(rows).toEqual([
    ['1', 'Ben', '3', '2', '1', '0', '30:24', '+6', '7'],
    ['2', 'Anna', '3', '2', '0', '1', '26:22', '+4', '6'],
    ['3', 'Cem', '3', '1', '0', '2', '25:22', '+3', '3'],
    ['4', 'Dora', '3', '0', '1', '2', '17:30', '-13', '1'],
  ]);
  // Survives a reload, view included
  await page.reload();
  await expect(page.locator('#tableCard')).toBeVisible();
  await expect(page.locator('#standings tr').first()).toContainText('Ben');
});

test('round robin with an odd number: one team sits out each round; home and away plays twice', async ({ page }) => {
  await startFixed(page, ['A', 'B', 'C'], 'rr2');
  await expect(page.locator('#games h3')).toHaveCount(6);
  await expect(page.locator('#games button.game')).toHaveCount(6);
  await expect(page.locator('#games li.muted')).toHaveText(['Spielfrei: A', 'Spielfrei: B', 'Spielfrei: C', 'Spielfrei: A', 'Spielfrei: B', 'Spielfrei: C']);
  const pairs = await page.locator('#games button.game .who').evaluateAll(els => els.map(e => e.textContent.replace(' – ', '-')));
  // Each pairing twice, with sides swapped in the second half
  expect(pairs.slice(3)).toEqual(pairs.slice(0, 3).map(p => p.split('-').reverse().join('-')));
  expect(new Set(pairs.slice(0, 3).map(p => p.split('-').sort().join('-')))).toEqual(new Set(['A-B', 'A-C', 'B-C']));
});

test('knockout with 6 teams: byes, winners move on, no draws, a changed result resets the branch', async ({ page }) => {
  await startFixed(page, ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'], 'ko');
  await expect(page.locator('#view')).toBeHidden();
  await expect(page.locator('#games h3')).toHaveText(['Viertelfinale', 'Halbfinale', 'Finale']);
  await expect(page.locator('#games li.muted')).toHaveText(['Freilos: P1', 'Freilos: P2']);
  await expect(page.locator('#games button.game .who')).toHaveText(['P4 – P5', 'P3 – P6', 'P1 – Sieger Spiel 1', 'P2 – Sieger Spiel 2', 'Sieger Spiel 3 – Sieger Spiel 4']);
  await expect(gameRow(page, 3)).toBeDisabled();

  await page.locator('#games button.game[data-no="1"]').click();
  await page.fill('#scoreA', '5');
  await page.fill('#scoreB', '5');
  await page.click('#scoreForm button[type=submit]');
  await expect(page.locator('#scoreError')).toHaveText('Im K.-o.-System braucht es einen Sieger – kein Unentschieden.');
  await page.fill('#scoreA', '10');
  await page.click('#scoreForm button[type=submit]');
  await expect(page.locator('#scoreDlg')).toBeHidden();
  await expect(gameRow(page, 3).locator('.who')).toHaveText('P1 – P4');
  await enter(page, 3, 10, 4);
  await expect(gameRow(page, 5).locator('.who')).toHaveText('P1 – Sieger Spiel 4');

  // P5 wins match 1 after all: match 3 loses its result
  await enter(page, 1, 3, 10);
  await expect(page.locator('#toast')).toHaveText('Spätere Spiele dieses Zweigs zurückgesetzt.');
  await expect(gameRow(page, 3).locator('.who')).toHaveText('P1 – P5');
  await expect(gameRow(page, 3).locator('.res')).toHaveText('offen');

  await enter(page, 2, 10, 0);
  await enter(page, 3, 10, 9);
  await enter(page, 4, 8, 10);
  await expect(gameRow(page, 5).locator('.who')).toHaveText('P1 – P3');
  await enter(page, 5, 7, 10);
  await expect(page.locator('#champName')).toHaveText('P3');

  // Deleting a result can be undone
  await gameRow(page, 5).click();
  await page.click('#btnClear');
  await expect(page.locator('#champCard')).toBeHidden();
  await page.locator('#toast button').click();
  await expect(page.locator('#champName')).toHaveText('P3');
});

test('menu: teams page, copy as text, new tournament asks and keeps the players', async ({ page }) => {
  await startFixed(page, ['Anna', 'Ben', 'Cem'], 'rr');
  await enter(page, 1, 10, 3);
  await openMenu(page);
  await expect(page.locator('#teamList .name')).toHaveText(['Anna', 'Ben', 'Cem']);
  await page.click('#btnCopy');
  const text = await clipboardText(page);
  expect(text).toContain('Tabelle\n1. ');
  expect(text).toContain('Spielplan\n\nRunde 1\n1. ');
  expect(text).toContain('10:3');

  await openMenu(page);
  await onDialog(page, d => d.dismiss(), { once: true });
  await page.click('#btnNew');
  await expect(page.locator('#play')).toBeVisible();
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnNew');
  await expect(page.locator('#appMenu')).toBeHidden();
  await expect(page.locator('#setup')).toBeVisible();
  await expect(page.locator('#players .name')).toHaveText(['Anna', 'Ben', 'Cem']);
  expect(await page.evaluate(() => localStorage.getItem('tournament.current.v1'))).toBeNull();
});

test('a broken stored tournament is discarded instead of breaking the app', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('tournament.current.v1', JSON.stringify({ mode: 'ko', teams: [{ members: [] }], results: {} })));
  await page.reload();
  await expect(page.locator('#setup')).toBeVisible();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts written by the script follow the language', async ({ page }) => {
    await startFixed(page, ['A', 'B', 'C', 'D', 'E'], 'ko');
    await expect(page.locator('#games h3')).toHaveText(['Quarter-finals', 'Semi-finals', 'Final']);
    await expect(page.locator('#games li.muted').first()).toHaveText('Bye: A');
    await expect(page.locator('#nextVs')).toContainText('D vs E');
    await switchLang(page, 'de');
    await expect(page.locator('#games h3').first()).toHaveText('Viertelfinale');
  });
});
