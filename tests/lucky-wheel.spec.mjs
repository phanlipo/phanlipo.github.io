// Glücksrad: the pointer lands on the drawn entry, entries, removing winners, fairness, history, English.
import { test, expect, openMenu, closeMenu, switchLang } from './helpers.mjs';

const TAU = Math.PI * 2;
/** Entry under the pointer, worked out from the wheel's rotation (segment i starts at i·360°/n clockwise from the top) */
async function underPointer(page, onWheel) {
  const { rot, count } = await page.locator('#wheel').evaluate(c => ({ rot: Number(c.dataset.rot), count: Number(c.dataset.count) }));
  expect(count).toBe(onWheel.length);
  const a = (((-rot) % TAU) + TAU) % TAU;
  return onWheel[Math.floor(a / (TAU / count))];
}
const winner = async page => (await page.locator('#result').textContent()).replace(/^🎉 /, '');

async function setEntries(page, list) {
  await openMenu(page);
  await page.fill('#entries', list.join('\n'));
  await closeMenu(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/lucky-wheel/');
  await openMenu(page);
  for (const id of ['#optAnim', '#optSound', '#optVibrate']) await page.uncheck(id);
  await closeMenu(page);
});

test('example entries, the pointer shows the winner, history', async ({ page }) => {
  const list = ['Pizza', 'Nudeln', 'Sushi', 'Burger', 'Salat', 'Curry'];
  await expect(page.locator('#count')).toHaveText('6 Einträge auf dem Rad');
  for (let i = 0; i < 15; i++) {
    await page.click('#btnSpin');
    const w = await winner(page);
    expect(list).toContain(w);
    expect(await underPointer(page, list)).toBe(w);
  }
  await openMenu(page);
  await expect(page.locator('#histCount')).toHaveText('15');
  await expect(page.locator('#hist li')).toHaveCount(15);
});

test('own entries: empty lines ignored, kept after reload, tap on the wheel spins', async ({ page }) => {
  await setEntries(page, ['  Anna ', '', 'Ben', '   ', 'Cem']);
  await expect(page.locator('#count')).toHaveText('3 Einträge auf dem Rad');
  await page.reload();
  await expect(page.locator('#count')).toHaveText('3 Einträge auf dem Rad');
  await openMenu(page);
  await expect(page.locator('#entries')).toHaveValue('Anna\nBen\nCem');
  await closeMenu(page);
  await page.click('#wheel');
  expect(['Anna', 'Ben', 'Cem']).toContain(await winner(page));
});

test('fewer than two entries: spinning is not possible', async ({ page }) => {
  await setEntries(page, ['Allein']);
  await expect(page.locator('#btnSpin')).toBeDisabled();
  await expect(page.locator('#result')).toHaveText('Mindestens zwei Einträge nötig – Stift oben rechts');
});

test('take winners off the wheel: everyone once, then put all back', async ({ page }) => {
  const list = ['A', 'B', 'C', 'D'];
  await setEntries(page, list);
  await openMenu(page);
  await page.check('#optRemove');
  await closeMenu(page);
  const drawn = [];
  for (let i = 0; i < 4; i++) {
    await page.click('#btnSpin');
    const w = await winner(page);
    // The last winner stays visible until the next spin: the wheel holds the rest plus that one
    const onWheel = list.filter(x => !drawn.includes(x));
    expect(await underPointer(page, onWheel)).toBe(w);
    drawn.push(w);
  }
  expect([...drawn].sort()).toEqual(list);
  await expect(page.locator('#btnSpin')).toBeDisabled();
  await expect(page.locator('#count')).toHaveText('Alle Einträge wurden gezogen');
  // Round survives a reload
  await page.reload();
  await expect(page.locator('#btnSpin')).toBeDisabled();
  await page.click('#btnRestore');
  await expect(page.locator('#btnSpin')).toBeEnabled();
  await expect(page.locator('#count')).toHaveText('4 Einträge auf dem Rad');
  await expect(page.locator('#btnRestore')).toBeHidden();
});

test('in the remove mode, the count goes down', async ({ page }) => {
  await setEntries(page, ['A', 'B', 'C']);
  await openMenu(page);
  await page.check('#optRemove');
  await closeMenu(page);
  await page.click('#btnSpin');
  await expect(page.locator('#count')).toHaveText('2 von 3 Einträgen noch auf dem Rad');
});

test('fair: three entries come up about equally often', async ({ page }) => {
  await setEntries(page, ['X', 'Y', 'Z']);
  // 600 draws through the page's own spin (no animation); expected 200 each, σ ≈ 11.5
  const counts = await page.evaluate(() => {
    const c = {};
    for (let i = 0; i < 600; i++) {
      document.getElementById('btnSpin').click();
      const w = document.getElementById('result').textContent.replace(/^🎉 /, '');
      c[w] = (c[w] || 0) + 1;
    }
    return c;
  });
  expect(Object.keys(counts).sort()).toEqual(['X', 'Y', 'Z']);
  for (const n of Object.values(counts)) expect(n).toBeGreaterThan(140), expect(n).toBeLessThan(260);
});

test('animated spin: button disabled while spinning, lands on the winner', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openMenu(page);
  await page.check('#optAnim');
  await closeMenu(page);
  const list = ['Pizza', 'Nudeln', 'Sushi', 'Burger', 'Salat', 'Curry'];
  await page.click('#btnSpin');
  await expect(page.locator('#result')).toHaveText('Dreht …');
  await expect(page.locator('#btnSpin')).toBeDisabled();
  await expect(page.locator('#result')).toHaveText(/^🎉 /, { timeout: 10000 });
  await expect(page.locator('#btnSpin')).toBeEnabled();
  expect(await underPointer(page, list)).toBe(await winner(page));
});

test('pencil opens the entries in the menu', async ({ page }) => {
  await page.click('#btnEdit');
  await expect(page.locator('#appMenu')).toBeVisible();
  await expect(page.locator('#entries')).toBeFocused();
});

test('clear history', async ({ page }) => {
  await page.click('#btnSpin');
  await openMenu(page);
  await expect(page.locator('#histCount')).toHaveText('1');
  page.once('dialog', d => d.accept());
  await page.click('#btnClearHist');
  await expect(page.locator('#histCount')).toHaveText('0');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('example entries follow the language until edited', async ({ page }) => {
    await page.goto('/lucky-wheel/');
    await openMenu(page);
    await expect(page.locator('#entries')).toHaveValue('Pizza\nPasta\nSushi\nBurger\nSalad\nCurry');
    await closeMenu(page);
    await expect(page.locator('#btnSpin')).toHaveText('Spin');
    await expect(page.locator('#count')).toHaveText('6 entries on the wheel');
    await switchLang(page, 'de');
    await openMenu(page);
    await expect(page.locator('#entries')).toHaveValue('Pizza\nNudeln\nSushi\nBurger\nSalat\nCurry');
  });
});
