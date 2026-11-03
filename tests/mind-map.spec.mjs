// Mindmap: add/edit/delete points, undo, fold, keyboard, drag & drop, several maps,
// text export/import, picture export, kept after reload.
import { test, expect, openMenu, closeMenu, clipboardText } from './helpers.mjs';

const item = (page, name) => page.getByRole('treeitem', { name, exact: true });

/** Adds a point with the button (child or sibling) and types its text */
async function add(page, kind, text) {
  await page.click(kind === 'child' ? '#btnChild' : '#btnSibling');
  await expect(page.locator('#txt')).toBeFocused();
  await page.fill('#txt', text);
  await page.press('#txt', 'Enter');
  await expect(page.locator('#editRow')).toBeHidden();
}
/** The outline the app copies (Als Text kopieren) */
async function outline(page) {
  await openMenu(page);
  await page.click('#btnCopy');
  await closeMenu(page);
  return clipboardText(page);
}
async function importOutline(page, text) {
  await openMenu(page);
  await page.fill('#importText', text);
  await page.click('#btnImport');
  await expect(page.locator('#appMenu')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/mind-map/');
});

test('starts with the central topic; naming it and adding points builds the map', async ({ page }) => {
  await expect(page.getByRole('tree')).toBeVisible();
  await expect(item(page, 'Zentrales Thema')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hint')).toBeVisible();
  await expect(page.locator('#btnDelete')).toBeDisabled();

  // Second tap on the selected topic opens it for editing
  await item(page, 'Zentrales Thema').click();
  await expect(page.locator('#txt')).toBeFocused();
  await page.fill('#txt', 'Projekt');
  await page.click('#btnOk');
  await expect(item(page, 'Projekt')).toBeVisible();

  await add(page, 'child', 'Ziele');
  await add(page, 'child', 'Umsatz');
  await add(page, 'sibling', 'Kunden');
  await item(page, 'Projekt').click();
  await add(page, 'child', 'Team');
  await expect(page.locator('#hint')).toBeHidden();
  await expect(page.getByRole('treeitem')).toHaveCount(5);
  await expect(item(page, 'Umsatz')).toHaveAttribute('aria-level', '3');
  expect(await outline(page)).toBe('Projekt\n- Ziele\n  - Umsatz\n  - Kunden\n- Team');

  // Kept after reload
  await page.reload();
  await expect(item(page, 'Kunden')).toBeVisible();
  await expect(page.getByRole('treeitem')).toHaveCount(5);
});

test('new level-1 branches alternate between the right and the left side', async ({ page }) => {
  for (const name of ['A', 'B', 'C', 'D']) {
    await item(page, 'Zentrales Thema').click();
    if (!(await page.locator('#editRow').isHidden())) await page.press('#txt', 'Escape');
    await add(page, 'child', name);
  }
  const x = async name => (await item(page, name).locator('rect.box').boundingBox()).x;
  const root = await x('Zentrales Thema');
  expect(await x('A')).toBeGreaterThan(root);
  expect(await x('B')).toBeLessThan(root);
  expect(await x('C')).toBeGreaterThan(root);
  expect(await x('D')).toBeLessThan(root);
  // Text export reads the right side first
  expect(await outline(page)).toBe('Zentrales Thema\n- A\n- C\n- B\n- D');
});

test('an empty new point disappears again; undo takes back changes step by step', async ({ page }) => {
  await add(page, 'child', 'Eins');
  await page.click('#btnChild');
  await page.press('#txt', 'Enter');
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  await expect(item(page, 'Eins')).toHaveAttribute('aria-selected', 'true');

  await page.click('#btnEdit');
  await page.fill('#txt', 'Eins!');
  await page.press('#txt', 'Enter');
  await add(page, 'sibling', 'Zwei');
  await expect(page.getByRole('treeitem')).toHaveCount(3);

  await page.click('#btnUndo');
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  await page.click('#btnUndo');
  await expect(item(page, 'Eins')).toBeVisible();
  await page.click('#btnUndo');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await expect(page.locator('#btnUndo')).toBeDisabled();
  // Escape while editing an existing point keeps its text
  await item(page, 'Zentrales Thema').click();
  await page.fill('#txt', 'Weg damit');
  await page.press('#txt', 'Escape');
  await expect(item(page, 'Zentrales Thema')).toBeVisible();
});

test('delete removes the point with its sub-points after asking; fold hides and counts them', async ({ page }) => {
  await importOutline(page, 'Thema\n- A\n  - A1\n  - A2\n    - A2a\n- B');
  await expect(page.getByRole('treeitem')).toHaveCount(6);

  // Fold A: its 3 sub-points are hidden, the circle shows 3
  await item(page, 'A').click();
  await page.locator('#svg [data-fold]').click();
  await expect(page.getByRole('treeitem')).toHaveCount(3);
  await expect(page.locator('#svg [data-id][aria-expanded="false"]')).toHaveAttribute('aria-label', 'A (eingeklappt, 3 Unterpunkte)');
  await expect(page.locator('#svg [data-fold] text')).toHaveText('3');
  await page.locator('#svg [data-fold]').click();
  await expect(page.getByRole('treeitem')).toHaveCount(6);

  // Declining the question keeps everything
  page.once('dialog', d => d.dismiss());
  await page.click('#btnDelete');
  await expect(page.getByRole('treeitem')).toHaveCount(6);
  page.once('dialog', d => { expect(d.message()).toBe('Diesen Punkt mit 3 Unterpunkten löschen?'); d.accept(); });
  await page.click('#btnDelete');
  await expect(page.getByRole('treeitem')).toHaveCount(2);
  // No other branch on that side: the topic is selected
  await expect(item(page, 'Thema')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#btnDelete')).toBeDisabled();
  // A leaf goes without asking
  await item(page, 'B').click();
  await page.click('#btnDelete');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await expect(item(page, 'Thema')).toHaveAttribute('aria-selected', 'true');
});

test('keyboard: Tab adds a sub-point, Enter a next point, arrows select, Alt+arrow moves, Delete removes', async ({ page }) => {
  await importOutline(page, 'Thema\n- A\n- B');
  await item(page, 'A').click();
  await expect(item(page, 'A')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.keyboard.type('A1');
  await page.keyboard.press('Enter');
  await expect(item(page, 'A1')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.type('A2');
  await page.keyboard.press('Enter');
  expect(await outline(page)).toBe('Thema\n- A\n  - A1\n  - A2\n- B');

  // A2 is selected (a click would open it for editing): focus it
  await item(page, 'A2').focus();
  await page.keyboard.press('ArrowUp');
  await expect(item(page, 'A1')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Alt+ArrowDown');
  await page.keyboard.press('ArrowRight');// A is on the right side: Right goes outward – A1 has no children
  await expect(item(page, 'A1')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(item(page, 'A')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('F2');
  await expect(page.locator('#txt')).toBeFocused();
  await page.keyboard.press('Escape');
  await item(page, 'A1').click();
  await page.keyboard.press('Delete');
  expect(await outline(page)).toBe('Thema\n- A\n  - A2\n- B');
  await expect(item(page, 'A2')).toHaveAttribute('aria-selected', 'true');
  await item(page, 'A2').focus();
  await page.keyboard.press('Control+z');
  expect(await outline(page)).toBe('Thema\n- A\n  - A2\n  - A1\n- B');
});

test('drag & drop: onto a point makes it a sub-point, onto its lower edge puts it after', async ({ page }) => {
  await importOutline(page, 'Thema\n- A\n  - A1\n- B\n- C');
  const center = async (name, fy = 0.5) => {
    const b = await item(page, name).locator('rect.box').boundingBox();
    return { x: b.x + b.width / 2, y: b.y + b.height * fy };
  };
  async function drag(from, to) {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
    await page.mouse.move(to.x, to.y, { steps: 8 });
    await page.mouse.up();
  }
  // A1 onto C → sub-point of C
  await drag(await center('A1'), await center('C'));
  await expect(page.locator('#toast')).toHaveText('Verschoben');
  expect(await outline(page)).toBe('Thema\n- A\n- B\n- C\n  - A1');
  // A onto the lower edge of A1 → next to A1 under C
  await drag(await center('A'), await center('A1', 0.92));
  expect(await outline(page)).toBe('Thema\n- B\n- C\n  - A1\n  - A');
  // A point cannot be dropped into its own sub-points
  await drag(await center('C'), await center('A1'));
  expect(await outline(page)).toBe('Thema\n- B\n- C\n  - A1\n  - A');
  // Undo takes back the last move
  await page.click('#btnUndo');
  expect(await outline(page)).toBe('Thema\n- A\n- B\n- C\n  - A1');
});

test('dragging the background pans the view; the wheel zooms; "Show all" fits the map', async ({ page }) => {
  await importOutline(page, 'Thema\n- A\n- B');
  const tf = () => page.locator('#view').getAttribute('transform');
  const before = await tf();
  const box = await page.locator('#board').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 5 });
  await page.mouse.up();
  expect(await tf()).not.toBe(before);
  const scale = async () => +(await tf()).match(/scale\(([\d.]+)\)/)[1];
  const k = await scale();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(scale).toBeGreaterThan(k);
  await page.click('#btnFit');
  // Fitted: the whole map lies inside the board
  for (const name of ['Thema', 'A', 'B']) {
    const b = await item(page, name).locator('rect.box').boundingBox();
    expect(b.x).toBeGreaterThanOrEqual(box.x);
    expect(b.x + b.width).toBeLessThanOrEqual(box.x + box.width);
  }
  // Panning does not select or change anything
  await expect(item(page, 'Thema')).toHaveAttribute('aria-selected', 'true');
});

test('import: indented outlines, bullets, numbers and Markdown headings', async ({ page }) => {
  await importOutline(page, '# Reise\n## Ziele\n- Berge\n- Meer\n\t- Strand\n## Kosten\n1. Flug\n2. Hotel');
  await expect(page.locator('#toast')).toHaveText('Neue Mindmap mit 8 Punkten angelegt');
  expect(await outline(page)).toBe('Reise\n- Ziele\n  - Berge\n  - Meer\n    - Strand\n- Kosten\n  - Flug\n  - Hotel');
  await expect(page.locator('#toast')).toHaveText('Als Text kopiert');
  // Several top lines: they hang off an unnamed topic
  await importOutline(page, 'Eins\nZwei\n  Zwei-a');
  expect(await outline(page)).toBe('Zentrales Thema\n- Eins\n- Zwei\n  - Zwei-a');
  // Empty text: nothing happens
  await openMenu(page);
  await page.fill('#importText', '  \n ');
  await page.click('#btnImport');
  await expect(page.locator('#toast')).toHaveText('Erst eine Gliederung einfügen');
});

test('several maps: list, switch, new, delete; an untouched empty map is not kept', async ({ page }) => {
  await importOutline(page, 'Erste\n- x');
  await importOutline(page, 'Zweite\n- y\n- z');
  await openMenu(page);
  // The untouched start map is gone, newest first
  await expect(page.locator('#mapList .map-item .ttl')).toHaveText(['Zweite', 'Erste']);
  await expect(page.locator('#mapList .map-item').first()).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#mapList .map-item .muted').first()).toContainText('3 Punkte');
  await page.locator('#mapList .map-item', { hasText: 'Erste' }).click();
  await expect(page.locator('#appMenu')).toBeHidden();
  await expect(item(page, 'x')).toBeVisible();

  await openMenu(page);
  await page.click('#btnNew');
  await expect(page.locator('#txt')).toBeFocused();
  await page.fill('#txt', 'Dritte');
  await page.press('#txt', 'Enter');
  await openMenu(page);
  await expect(page.locator('#mapList .map-item')).toHaveCount(3);

  page.once('dialog', d => { expect(d.message()).toBe('Die Mindmap „Dritte“ löschen?'); d.accept(); });
  await page.click('#btnDelMap');
  await expect(page.locator('#mapList .map-item')).toHaveCount(2);
  await closeMenu(page);
  await page.reload();
  await openMenu(page);
  await expect(page.locator('#mapList .map-item')).toHaveCount(2);
});

test('save as picture: a PNG of the whole map', async ({ page }) => {
  await importOutline(page, 'Bild & Test\n- Ast eins\n  - Blatt\n- Ast zwei');
  await openMenu(page);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btnPng')]);
  expect(download.suggestedFilename()).toMatch(/^bild-test-\d{4}-\d{2}-\d{2}\.png$/);
  const buf = await (await download.createReadStream()).toArray().then(c => Buffer.concat(c));
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  expect(w).toBeGreaterThan(h);
  expect(h).toBeGreaterThan(100);
  await expect(page.locator('#toast')).toHaveText('Bild gespeichert');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('labels and the default topic are English, saved data stays the same', async ({ page }) => {
    await expect(item(page, 'Central topic')).toBeVisible();
    await expect(page.locator('#btnChild')).toHaveText('Sub-point');
    await add(page, 'child', 'Idea');
    expect(await outline(page)).toBe('Central topic\n- Idea');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mind-map.maps.v1')));
    expect(stored.maps[0].root.t).toBe('');
  });
});
