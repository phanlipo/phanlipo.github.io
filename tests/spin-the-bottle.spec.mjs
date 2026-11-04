// Flaschen drehen: the bottle stops on a random seat, the shown name matches the angle, fair mode,
// players in the menu, tap and swipe on the table, settings persist, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';

const LS = 'spin-the-bottle.state.v1';
const withState = (page, state) => page.addInitScript(([k, v]) => {
  if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); }
}, [LS, JSON.stringify(state)]);
const base = { players: [], fair: true, sound: false, vibrate: true, angle: 0, last: -1, spins: 0 };
const angle = async page => Number(await page.locator('#bottle').getAttribute('data-angle'));
// Seat the neck points at, worked out from the angle alone: seat i sits at i·360/n degrees clockwise from the top
const seatOf = (a, n) => Math.round(a / (360 / n)) % n;

// Full animation: at most 8 rounds in 5.6 s; with reduced motion 0.8 s
async function spinAndWait(page, ms = 6000) {
  await page.click('#btnSpin');
  await expect(page.locator('#table')).toHaveAttribute('data-spinning', 'true');
  await page.clock.runFor(ms);
  await expect(page.locator('#table')).toHaveAttribute('data-spinning', 'false');
}

test('free spin without names stops somewhere new and remembers the angle', async ({ page }) => {
  await page.clock.install();
  await page.goto('/spin-the-bottle/');
  await expect(page.locator('#status')).toHaveText('Tippen oder im Kreis wischen zum Drehen');
  await expect(page.locator('.name')).toHaveCount(0);
  const angles = new Set();
  for (let i = 0; i < 5; i++) {
    await spinAndWait(page);
    await expect(page.locator('#status')).toHaveText('🍾 Gestoppt – wen trifft’s?');
    const a = await angle(page);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
    angles.add(a);
  }
  expect(angles.size).toBeGreaterThanOrEqual(4);
  const last = await angle(page);
  await page.reload();
  expect(await angle(page)).toBeCloseTo(last, 1);
  await expect(page.locator('#status')).toHaveText('🍾 Gestoppt – wen trifft’s?');
});

test('the bottle keeps turning while spinning and the button is blocked', async ({ page }) => {
  await page.clock.install();
  await page.goto('/spin-the-bottle/');
  await page.click('#btnSpin');
  await expect(page.locator('#btnSpin')).toBeDisabled();
  await expect(page.locator('#status')).toHaveText('Dreht …');
  const seen = new Set();
  for (let i = 0; i < 5; i++) { await page.clock.runFor(200); seen.add(await angle(page)); }
  expect(seen.size).toBe(5);
  await page.clock.runFor(6000);
  await expect(page.locator('#btnSpin')).toBeEnabled();
});

test('players entered in the menu sit around the table; the named player matches the angle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.goto('/spin-the-bottle/');
  await page.click('#btnPlayers');
  await expect(page.locator('#appMenu')).toBeVisible();
  await expect(page.locator('#players')).toBeFocused();
  await page.fill('#players', 'Anna\n  Ben \n\nCem\nDora');
  await expect(page.locator('#playersInfo')).toHaveText('4 Spieler am Tisch.');
  await closeMenu(page);
  await expect(page.locator('.name')).toHaveText(['Anna', 'Ben', 'Cem', 'Dora']);
  const names = ['Anna', 'Ben', 'Cem', 'Dora'];
  const hits = new Set();
  let prev = null;
  for (let i = 0; i < 24; i++) {
    await spinAndWait(page, 1000);
    const who = names[seatOf(await angle(page), 4)];
    await expect(page.locator('#status')).toHaveText(`🍾 ${who} ist dran!`);
    await expect(page.locator('.name.hit')).toHaveText(who);
    // Fair mode (default): never the same player twice in a row
    expect(who).not.toBe(prev);
    prev = who;
    hits.add(who);
  }
  expect(hits.size).toBe(4);
  // Saved: names, last result
  await page.reload();
  await expect(page.locator('.name')).toHaveCount(4);
  await expect(page.locator('.name.hit')).toHaveText(prev);
  await openMenu(page);
  await expect(page.locator('#players')).toHaveValue('Anna\nBen\nCem\nDora');
});

test('without fair mode the same player can come twice in a row', async ({ page }) => {
  await page.clock.install();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withState(page, { ...base, players: ['A', 'B', 'C'], fair: false });
  await page.goto('/spin-the-bottle/');
  let prev = null, repeat = false;
  for (let i = 0; i < 25 && !repeat; i++) {
    await spinAndWait(page, 1000);
    const who = await page.locator('.name.hit').textContent();
    expect(who).toBe(['A', 'B', 'C'][seatOf(await angle(page), 3)]);
    repeat = who === prev;
    prev = who;
  }
  // P(no repeat in 25 spins) = (2/3)^24 ≈ 0.00006 %
  expect(repeat).toBe(true);
});

test('one name spins freely; more than 12 names are cut to 12', async ({ page }) => {
  await page.goto('/spin-the-bottle/');
  await openMenu(page);
  await page.fill('#players', 'Solo');
  await expect(page.locator('#playersInfo')).toHaveText('Mindestens 2 Namen eintragen – sonst dreht die Flasche frei.');
  await expect(page.locator('.name')).toHaveCount(0);
  const many = Array.from({ length: 14 }, (_, i) => `P${i + 1}`);
  await page.fill('#players', many.join('\n'));
  await expect(page.locator('#playersInfo')).toHaveText('Höchstens 12 Spieler – weitere Namen werden ignoriert.');
  await expect(page.locator('.name')).toHaveCount(12);
  await expect(page.locator('.name').last()).toHaveText('P12');
  await page.fill('#players', 'Eine-sehr-lange-Spielerin-mit-Namen\nB');
  await expect(page.locator('.name').first()).toHaveText('Eine-sehr-lange-Spie');
  await page.fill('#players', '');
  await expect(page.locator('#playersInfo')).toHaveText('Keine Namen – die Flasche dreht frei.');
});

test('tapping the table spins; a fast swipe spins in its direction; a slow drag only turns the bottle', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/spin-the-bottle/');
  const box = await page.locator('#ring').boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2, r = box.width * 0.35;
  const at = deg => [cx + r * Math.sin(deg * Math.PI / 180), cy - r * Math.cos(deg * Math.PI / 180)];
  const table = page.locator('#table');

  // Tap
  await page.mouse.click(...at(0));
  await expect(table).toHaveAttribute('data-spinning', 'true');
  await expect(table).toHaveAttribute('data-spinning', 'false', { timeout: 3000 });
  await expect(page.locator('#status')).toHaveText('🍾 Gestoppt – wen trifft’s?');

  // Fast swipes, clockwise and counter-clockwise (screen: top → right is clockwise)
  for (const [dir, sign] of [['cw', 1], ['ccw', -1]]) {
    await page.mouse.move(...at(0));
    await page.mouse.down();
    for (let d = 10; d <= 120; d += 10) await page.mouse.move(...at(sign * d));
    await page.mouse.up();
    await expect(table).toHaveAttribute('data-spinning', 'true');
    await expect(table).toHaveAttribute('data-dir', dir);
    await expect(table).toHaveAttribute('data-spinning', 'false', { timeout: 3000 });
  }

  // Slow drag by 90°: no spin, the bottle follows the finger
  const before = await angle(page);
  await page.mouse.move(...at(0));
  await page.mouse.down();
  for (let d = 5; d <= 90; d += 5) { await page.mouse.move(...at(d)); await page.waitForTimeout(40); }
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect(page.locator('#status')).toHaveText('Mit mehr Schwung wischen!');
  await expect(table).toHaveAttribute('data-spinning', 'false');
  const turned = ((await angle(page)) - before + 360) % 360;
  expect(turned).toBeGreaterThan(80);
  expect(turned).toBeLessThan(100);
});

test('settings persist', async ({ page }) => {
  await page.goto('/spin-the-bottle/');
  await openMenu(page);
  for (const id of ['#optFair', '#optSound', '#optVibrate']) {
    await expect(page.locator(id)).toBeChecked();
    await page.locator(id).uncheck();
  }
  await page.reload();
  await openMenu(page);
  for (const id of ['#optFair', '#optSound', '#optVibrate']) await expect(page.locator(id)).not.toBeChecked();
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('result and hints in English', async ({ page }) => {
    await page.clock.install();
    await withState(page, { ...base, players: ['Anna', 'Ben'] });
    await page.goto('/spin-the-bottle/');
    await expect(page.locator('#btnSpin')).toHaveText('🍾 Spin');
    await expect(page.locator('#status')).toHaveText('Tap or swipe around to spin');
    await spinAndWait(page);
    const who = ['Anna', 'Ben'][seatOf(await angle(page), 2)];
    await expect(page.locator('#status')).toHaveText(`🍾 ${who}’s turn!`);
    await openMenu(page);
    await expect(page.locator('#playersInfo')).toHaveText('2 players at the table.');
  });
});
