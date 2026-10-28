// Würfel & Münze: value ranges, modes, holding, persistence and a rough fairness check.
import { test, expect, openDetails } from './helpers.mjs';

/** Values of all dice in board order (null = not rolled yet) */
async function dice(page) {
  const labels = await page.locator('#board .die').evaluateAll(els => els.map(e => e.getAttribute('aria-label')));
  return labels.map(l => { const m = l.match(/: (\d+)/); return m ? Number(m[1]) : null; });
}

async function setStepper(page, key, value) {
  const input = page.locator(`[data-stepper="${key}"] input`);
  await input.fill(String(value));
  await input.press('Tab');
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dice-coin/');
  // Instant results: no animation, sound or vibration
  await openDetails(page, 'Effekte');
  for (const id of ['#optAnim', '#optSound', '#optVibrate']) await page.uncheck(id);
});

test('all values are within 1…sides', async ({ page }) => {
  await setStepper(page, 'dice.count', 5);
  for (const sides of [6, 20]) {
    await page.click(`#sideChips [data-s="${sides}"]`);
    for (let i = 0; i < 20; i++) {
      await page.click('#btnRoll');
      const v = await dice(page);
      expect(v).toHaveLength(5);
      for (const x of v) expect(x).toBeGreaterThanOrEqual(1), expect(x).toBeLessThanOrEqual(sides);
    }
  }
});

test('sum includes the bonus', async ({ page }) => {
  await setStepper(page, 'dice.count', 3);
  await setStepper(page, 'dice.mod', 4);
  await page.click('#btnRoll');
  const sum = (await dice(page)).reduce((a, b) => a + b, 0);
  await expect(page.locator('#summary .total')).toHaveText(String(sum + 4));
});

test('held dice keep their value', async ({ page }) => {
  await setStepper(page, 'dice.count', 5);
  await page.check('#optHold');
  await page.click('#btnRoll');
  const first = await dice(page);
  await page.locator('#board .die').nth(0).click();
  await page.locator('#board .die').nth(1).click();
  await expect(page.locator('#board .die.held')).toHaveCount(2);
  for (let i = 0; i < 10; i++) {
    await page.click('#btnRoll');
    const v = await dice(page);
    expect(v.slice(0, 2)).toEqual(first.slice(0, 2));
  }
});

test('single mode rolls only the tapped die', async ({ page }) => {
  await setStepper(page, 'dice.count', 3);
  await page.click('#segDiceMode [data-v="single"]');
  await page.click('#btnReset');
  await page.locator('#board .die').nth(1).click();
  const v = await dice(page);
  expect(v[0]).toBeNull();
  expect(v[1]).not.toBeNull();
  expect(v[2]).toBeNull();
  await expect(page.locator('#btnRoll')).toHaveText('Würfel 1 würfeln');
});

test('dice with different sides', async ({ page }) => {
  await setStepper(page, 'dice.count', 2);
  await page.check('#optMixed');
  await page.fill('#perDie input[data-i="0"]', '100');
  await page.locator('#perDie input[data-i="0"]').press('Tab');
  await expect(page.locator('#board .die').nth(0)).toHaveAttribute('aria-label', /W100/);
  await expect(page.locator('#board .die').nth(1)).toHaveAttribute('aria-label', /W6/);
});

test('keyboard: space rolls', async ({ page }) => {
  await page.locator('h1').click();
  await page.keyboard.press('Space');
  expect((await dice(page)).every(v => v != null)).toBe(true);
});

test('coins with custom labels', async ({ page }) => {
  await page.click('[data-tab=coin]');
  await setStepper(page, 'coin.count', 3);
  await page.fill('#coinHeads', 'Ja');
  await page.fill('#coinTails', 'Nein');
  await page.click('#btnRoll');
  const texts = await page.locator('#board .coin').allTextContents();
  expect(texts).toHaveLength(3);
  for (const t of texts) expect(['Ja', 'Nein']).toContain(t);
  const yes = texts.filter(t => t === 'Ja').length;
  await expect(page.locator('#summary')).toContainText(`Ja: ${yes} · Nein: ${3 - yes}`);
});

test('settings, last throw and history survive a reload', async ({ page }) => {
  await setStepper(page, 'dice.count', 4);
  await page.click('#btnRoll');
  const before = await dice(page);
  await page.reload();
  expect(await dice(page)).toEqual(before);
  await expect(page.locator('#histCount')).toHaveText('1');
});

test('presets: Kniffel loads 5 dice with holding', async ({ page }) => {
  await openDetails(page, 'Vorlagen');
  await page.locator('#presets .btn', { hasText: 'Kniffel' }).click();
  await expect(page.locator('#board .die')).toHaveCount(5);
  await expect(page.locator('#optHold')).toBeChecked();
});

test('W6 is roughly uniform (600 rolls)', async ({ page }) => {
  // Expected 100 per face, standard deviation ≈ 9 → 55…145 is a > 4.9σ margin (false alarm < 1e-5)
  await setStepper(page, 'dice.count', 1);
  const counts = await page.evaluate(async () => {
    const c = [0, 0, 0, 0, 0, 0, 0], btn = document.getElementById('btnRoll');
    for (let i = 0; i < 600; i++) {
      btn.click();
      const m = document.querySelector('#board .die').getAttribute('aria-label').match(/: (\d+)/);
      c[Number(m[1])]++;
    }
    return c.slice(1);
  });
  for (const n of counts) expect(n).toBeGreaterThan(55), expect(n).toBeLessThan(145);
});

test('backup round trip: roll, export, clear, import', async ({ page }) => {
  await setStepper(page, 'dice.count', 3);
  await page.click('#btnRoll');
  await page.click('#btnRoll');
  const rolled = await dice(page);
  await page.locator('details.data summary').click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('[data-data="export"]')]);
  const path = await download.path();

  page.once('dialog', d => d.accept());
  await page.click('[data-data="clear"]');
  await page.waitForEvent('load');
  await expect(page.locator('#board .die')).toHaveCount(2);          // back to defaults
  await expect(page.locator('#histCount')).toHaveText('0');

  await page.locator('details.data summary').click();
  page.once('dialog', d => d.accept());
  await page.setInputFiles('details.data input[type=file]', path);
  await page.waitForEvent('load');
  expect(await dice(page)).toEqual(rolled);
  await expect(page.locator('#histCount')).toHaveText('2');
});
