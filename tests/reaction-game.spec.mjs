// Reaktionsspiel with a controlled clock: countdown, moles appear and get away again, at most one/two
// at a time, lamps one at a time and never the same twice, points = hits − misses (not below 0),
// reaction times measured exactly, best scores per mode/length/size, stop and leaving the app
// abort without counting, keyboard and mouse count once, settings persist, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';

const LS = 'reaction-game.state.v1';
const COUNTDOWN = 2100; // 3 × 700 ms, then the game starts

// Fake clock that only moves with runFor – reaction times are then exact
async function openPaused(page) {
  await page.clock.install({ time: new Date('2026-05-01T09:00:00') });
  await page.goto('/reaction-game/');
  await page.clock.pauseAt(new Date('2026-05-01T09:00:05'));
}
const on = page => page.locator('#grid .cell.on');
const state = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)), LS);

async function choose(page, { dur, size }) {
  await openMenu(page);
  if (dur) await page.click(`#durations [data-dur="${dur}"]`);
  if (size) await page.click(`#sizes [data-size="${size}"]`);
  await closeMenu(page);
}

test('countdown, then moles: hits and misses give the points, best score is kept', async ({ page }) => {
  await openPaused(page);
  await expect(page.locator('#overlay')).toHaveText('Tippe auf Start und dann so schnell du kannst auf die Maulwürfe!');
  await choose(page, { dur: 15 });
  await expect(page.locator('#time')).toHaveText('15');
  await expect(page.locator('#bestNow')).toHaveText('–');
  await page.click('#btnStart');
  await expect(page.locator('#overlay [data-count]')).toHaveText('3');
  await expect(page.locator('#btnStart')).toHaveText('Stopp');
  await page.clock.runFor(700);
  await expect(page.locator('#overlay [data-count]')).toHaveText('2');
  await page.clock.runFor(700);
  await expect(page.locator('#overlay [data-count]')).toHaveText('1');
  await expect(on(page)).toHaveCount(0);
  await page.clock.runFor(700);
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'running');
  await expect(page.locator('#status')).toHaveText('Hau die Maulwürfe!');
  // Mode and settings are locked while playing
  await expect(page.locator('#modes [data-mode="lamp"]')).toBeDisabled();

  let hits = 0, wrong = 0, maxUp = 0;
  for (let step = 0; step < 150; step++) {
    const n = await on(page).count();
    maxUp = Math.max(maxUp, n);
    // 3 × 3: one mole at a time in the first half
    if (step < 70) expect(n).toBeLessThanOrEqual(1);
    if (n && step % 3 === 0) {
      await on(page).first().click();
      hits++;
    } else if (step % 25 === 10) {
      await page.locator('#grid .cell:not(.on)').first().click();
      wrong++;
    }
    await expect(page.locator('#score')).toHaveText(String(Math.max(0, hits - wrong)));
    await page.clock.runFor(100);
  }
  expect(maxUp).toBeLessThanOrEqual(2);
  expect(hits).toBeGreaterThan(5);
  await page.clock.runFor(500);
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'over');
  await expect(on(page)).toHaveCount(0);
  const points = Math.max(0, hits - wrong);
  await expect(page.locator('#resScore')).toHaveText(String(points));
  await expect(page.locator('#resRecord')).toHaveText('🏆 Neuer Rekord!');
  await expect(page.locator('#resList li').nth(0)).toHaveText(`Treffer: ${hits}`);
  await expect(page.locator('#resList li').nth(1)).toHaveText(`Daneben: ${wrong}`);
  await expect(page.locator('#resList li').nth(2)).toHaveText(/^Entwischt: \d+$/);
  await expect(page.locator('#btnStart')).toHaveText('Nochmal');
  await expect(page.locator('#bestNow')).toHaveText(String(points));
  const s = await state(page);
  expect(s.best['mole-15-3'].points).toBe(points);
  expect(s.rounds).toBe(1);
  expect(s.last).toMatchObject({ mode: 'mole', dur: 15, size: 3, hits, wrong, points });

  await page.reload();
  await expect(page.locator('#bestNow')).toHaveText(String(points));
  await openMenu(page);
  await expect(page.locator('#bestList tbody tr')).toHaveCount(1);
  await expect(page.locator('#bestList tbody td')).toHaveText(['Maulwurf', '15 s · 3 × 3', String(points), /^\d+$/]);
  await expect(page.locator('#bestList')).toContainText('Gespielte Runden: 1');
});

test('untouched moles get away after at most 1.1 s; no points, no record', async ({ page }) => {
  await openPaused(page);
  await choose(page, { dur: 15 });
  await page.click('#btnStart');
  await page.clock.runFor(COUNTDOWN);
  await expect(on(page)).toHaveCount(1);
  const first = await on(page).getAttribute('data-i');
  await page.clock.runFor(1150);
  await expect(page.locator(`#grid .cell[data-i="${first}"]`)).not.toHaveClass(/\bon\b/);
  await page.clock.runFor(15000);
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'over');
  await expect(page.locator('#resScore')).toHaveText('0');
  await expect(page.locator('#resRecord')).toHaveCount(0);
  const s = await state(page);
  // 15 s with a new mole roughly every 0.3–1.1 s
  expect(s.last.missed).toBeGreaterThanOrEqual(10);
  expect(s.last.hits).toBe(0);
  expect(s.best).toEqual({});
  await expect(page.locator('#bestNow')).toHaveText('–');
});

test('lamps: one at a time, never the same twice, reaction times measured exactly', async ({ page }) => {
  await openPaused(page);
  await page.click('#modes [data-mode="lamp"]');
  await expect(page.locator('#board')).toHaveAttribute('data-mode', 'lamp');
  await expect(page.locator('#overlay')).toHaveText('Tippe auf Start und dann so schnell du kannst auf die Lampe, die leuchtet!');
  await choose(page, { dur: 15 });
  await page.click('#btnStart');
  await page.clock.runFor(COUNTDOWN);
  await expect(page.locator('#status')).toHaveText('Tipp die leuchtende Lampe!');
  const waits = [200, 300, 400, 250, 350, 500];
  let prev = null;
  for (const ms of waits) {
    await expect(on(page)).toHaveCount(1);
    const i = await on(page).getAttribute('data-i');
    expect(i).not.toBe(prev);
    prev = i;
    // The lamp stays lit until tapped
    await page.clock.runFor(ms);
    await expect(on(page)).toHaveCount(1);
    await on(page).click();
    await expect(on(page)).toHaveCount(0);
    await page.clock.runFor(120);
  }
  // One tap on a dark lamp: −1
  await page.locator('#grid .cell:not(.on)').first().click();
  await expect(page.locator('#score')).toHaveText(String(waits.length - 1));
  await page.clock.runFor(15000);
  const avg = Math.round(waits.reduce((a, b) => a + b, 0) / waits.length);
  await expect(page.locator('#resScore')).toHaveText(String(waits.length - 1));
  await expect(page.locator('#resList li')).toHaveText([
    `Treffer: ${waits.length}`, 'Daneben: 1', `Ø Reaktion: ${avg} ms`, 'Schnellste: 200 ms']);
  const s = await state(page);
  expect(s.best['lamp-15-3']).toMatchObject({ points: waits.length - 1, avg });
});

test('equal points: the faster average reaction wins the record', async ({ page }) => {
  const best = { 'lamp-15-3': { points: 2, avg: 300, at: '2026-01-01T00:00:00.000Z' } };
  await page.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } },
    [LS, JSON.stringify({ mode: 'lamp', dur: 15, size: 3, sound: false, vibrate: false, best, rounds: 3 })]);
  await openPaused(page);
  await expect(page.locator('#bestNow')).toHaveText('2');
  for (const [ms, record] of [[400, false], [200, true]]) {
    await page.click('#btnStart');
    await page.clock.runFor(COUNTDOWN);
    for (let k = 0; k < 2; k++) { await page.clock.runFor(ms); await on(page).click(); await page.clock.runFor(120); }
    await page.clock.runFor(15000);
    await expect(page.locator('#resScore')).toHaveText('2');
    if (record) await expect(page.locator('#resRecord')).toBeVisible();
    else await expect(page.locator('#overlay')).toContainText('Rekord: 2');
  }
  expect((await state(page)).best['lamp-15-3'].avg).toBe(200);
});

test('stop and leaving the app abort the game without counting it', async ({ page }) => {
  await openPaused(page);
  await page.click('#btnStart');
  await page.clock.runFor(COUNTDOWN + 1000);
  await page.click('#btnStart');
  await expect(page.locator('#status')).toHaveText('Abgebrochen – das Spiel zählt nicht.');
  await expect(page.locator('#btnStart')).toHaveText('Start');
  await expect(page.locator('#modes [data-mode="lamp"]')).toBeEnabled();
  await page.clock.runFor(5000);
  await expect(on(page)).toHaveCount(0);
  // Abort during the countdown, too – the game must not start afterwards
  await page.click('#btnStart');
  await page.clock.runFor(800);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'idle');
  await page.clock.runFor(5000);
  await expect(on(page)).toHaveCount(0);
  const s = await state(page);
  expect(s === null || s.rounds === 0).toBe(true);
});

test('keyboard and mouse: each press counts exactly once', async ({ page }) => {
  await openPaused(page);
  await page.click('#modes [data-mode="lamp"]');
  await page.click('#btnStart');
  await page.clock.runFor(COUNTDOWN);
  await on(page).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#score')).toHaveText('1');
  await page.clock.runFor(120);
  await on(page).click();
  await expect(page.locator('#score')).toHaveText('2');
  await page.clock.runFor(120);
  await on(page).dispatchEvent('pointerdown', { pointerType: 'touch', button: 0 });
  await expect(page.locator('#score')).toHaveText('3');
});

test('settings in the menu: length and 4 × 4 field persist; up to three moles on 4 × 4', async ({ page }) => {
  await openPaused(page);
  await expect(page.locator('#grid .cell')).toHaveCount(9);
  await choose(page, { dur: 60, size: 4 });
  await expect(page.locator('#grid .cell')).toHaveCount(16);
  await expect(page.locator('#time')).toHaveText('60');
  await openMenu(page);
  await page.uncheck('#optSound');
  await closeMenu(page);
  await page.reload();
  await expect(page.locator('#grid .cell')).toHaveCount(16);
  await expect(page.locator('#sizes [data-size="4"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#durations [data-dur="60"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#optSound')).not.toBeChecked();
  await page.clock.install({ time: new Date('2026-05-01T09:00:00') });
  await page.reload();
  await page.clock.pauseAt(new Date('2026-05-01T09:00:05'));
  await page.click('#btnStart');
  await page.clock.runFor(COUNTDOWN);
  let max = 0;
  for (let step = 0; step < 600; step += 5) {
    const n = await on(page).count();
    if (step < 290) expect(n).toBeLessThanOrEqual(2);
    max = Math.max(max, n);
    await page.clock.runFor(500);
  }
  expect(max).toBeLessThanOrEqual(3);
  expect(max).toBeGreaterThanOrEqual(2);
});

test('trophy button opens the best scores in the menu', async ({ page }) => {
  await page.goto('/reaction-game/');
  await page.click('#btnBest');
  await expect(page.locator('#appMenu')).toBeVisible();
  await expect(page.locator('#bestList')).toHaveText('Noch keine Bestwerte – spiel eine Runde!');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, result and best scores in English', async ({ page }) => {
    await openPaused(page);
    await expect(page.locator('#btnStart')).toHaveText('Start');
    await page.click('#modes [data-mode="lamp"]');
    await choose(page, { dur: 15 });
    await page.click('#btnStart');
    await page.clock.runFor(COUNTDOWN);
    await expect(page.locator('#status')).toHaveText('Tap the lamp that lights up!');
    await page.clock.runFor(1234);
    await on(page).click();
    await page.clock.runFor(15000);
    await expect(page.locator('#status')).toHaveText('Time’s up!');
    await expect(page.locator('#resList li')).toHaveText(['Hits: 1', 'Misses: 0', 'Avg. reaction: 1,234 ms', 'Fastest: 1,234 ms']);
    await expect(page.locator('#btnStart')).toHaveText('Play again');
    await openMenu(page);
    await expect(page.locator('#bestList tbody td')).toHaveText(['Lamps', '15 s · 3 × 3', '1', '1,234']);
  });
});
