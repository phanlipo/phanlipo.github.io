// Kuscheltier-Puzzle: choose an animal, solution first, parts spread around the shadow, dragging snaps a
// part into its spot (blinks, then fixed), identical parts fit either spot, keyboard, confetti at the end,
// progress survives a reload, English.
import { test, expect, openMenu, closeMenu } from './helpers.mjs';

const LS = 'plush-puzzle.state.v1';
// Animations off: the parts jump to their places, so their boxes can be measured at once
test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: 'reduce' }); });

const box = loc => loc.evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
// A point that really lies on the part (its box centre may be empty, e.g. a curved tail)
const grabPoint = loc => loc.evaluate(el => {
  const r = el.getBoundingClientRect();
  for (let k = 0; k < 400; k++) {
    const x = r.x + r.width * (0.5 + ((k % 20) - 10) / 21), y = r.y + r.height * (0.5 + (Math.floor(k / 20) - 10) / 21);
    const hit = document.elementFromPoint(x, y);
    if (hit && hit.closest('.piece') === el) return { x, y };
  }
  return null;
});
/** Drags part i so that it lies dx/dy (pixels) away from spot j's shadow */
async function dragTo(page, i, j, dx = 0, dy = 0) {
  const piece = page.locator(`#loose .piece[data-i="${i}"]`);
  const from = await grabPoint(piece);
  expect(from, `part ${i} can be grabbed`).not.toBeNull();
  const a = await box(piece), b = await box(page.locator(`#shadow .slot[data-j="${j}"]`));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 20, from.y + 20, { steps: 3 });
  await page.mouse.move(from.x + b.cx - a.cx + dx, from.y + b.cy - a.cy + dy, { steps: 5 });
  await page.mouse.up();
}
async function startAnimal(page, id) {
  await page.click(`[data-animal="${id}"]`);
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'solution');
  await page.click('#btnGo');
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'play');
}

test('choose an animal: the solution comes first, then the parts lie around the shadow', async ({ page }) => {
  await page.goto('/plush-puzzle/');
  await expect(page.locator('.animal .name')).toHaveText(['Teddy', 'Hase', 'Panda', 'Delfin', 'Katze', 'Elefant', 'Löwe', 'Giraffe', 'Eule', 'Krake']);
  await expect(page.locator('.animal .parts')).toHaveText(['8 Teile', '9 Teile', '8 Teile', '5 Teile', '9 Teile', '7 Teile', '10 Teile', '11 Teile', '12 Teile', '9 Teile']);
  await expect(page.locator('#btnPeek')).toBeHidden();
  await page.click('[data-animal="teddy"]');
  await expect(page.locator('#status')).toHaveText('So sieht der Teddy aus. Schau gut hin!');
  await expect(page.locator('#btnGo')).toBeVisible();
  // Solution: every part sits on its own shadow
  for (let i = 0; i < 8; i++) {
    const a = await box(page.locator(`.piece[data-i="${i}"]`)), b = await box(page.locator(`.slot[data-j="${i}"]`));
    expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeLessThan(1);
  }
  await page.click('#btnGo');
  await expect(page.locator('#status')).toHaveText('Zieh die Teile auf den Schatten. Noch 8 Teile.');
  await expect(page.locator('#loose .piece')).toHaveCount(8);
  await expect(page.locator('#btnPeek')).toBeVisible();
  // Loose parts lie on the board, outside the shadow's box and not on top of each other
  const boardBox = await box(page.locator('#board'));
  const shadows = await Promise.all([...Array(8).keys()].map(j => box(page.locator(`.slot[data-j="${j}"]`))));
  const sx0 = Math.min(...shadows.map(s => s.x)), sx1 = Math.max(...shadows.map(s => s.x + s.w));
  const sy0 = Math.min(...shadows.map(s => s.y)), sy1 = Math.max(...shadows.map(s => s.y + s.h));
  const parts = await Promise.all([...Array(8).keys()].map(i => box(page.locator(`.piece[data-i="${i}"]`))));
  for (const p of parts) {
    expect(p.x).toBeGreaterThanOrEqual(boardBox.x - 1);
    expect(p.y).toBeGreaterThanOrEqual(boardBox.y - 1);
    expect(p.x + p.w).toBeLessThanOrEqual(boardBox.x + boardBox.w + 1);
    expect(p.y + p.h).toBeLessThanOrEqual(boardBox.y + boardBox.h + 1);
    const inside = p.x < sx1 && sx0 < p.x + p.w && p.y < sy1 && sy0 < p.y + p.h;
    expect(inside, 'part overlaps the shadow').toBe(false);
  }
  for (let i = 0; i < 8; i++) for (let k = i + 1; k < 8; k++) {
    const a = parts[i], b = parts[k];
    expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `parts ${i} and ${k} overlap`).toBe(false);
  }
});

test('a part dropped on its shadow snaps in, blinks and stays fixed; far away it stays loose', async ({ page }) => {
  await page.goto('/plush-puzzle/');
  await openMenu(page);
  await page.uncheck('#optEasy');
  await closeMenu(page);
  await startAnimal(page, 'teddy');
  // Head (part 7): dropped 60 px off it stays loose
  await dragTo(page, 7, 7, 60, 60);
  await expect(page.locator('.piece[data-i="7"]')).toHaveAttribute('data-slot', '-1');
  await expect(page.locator('#loose .piece')).toHaveCount(8);
  // A little off is still close enough
  await dragTo(page, 7, 7, 6, -5);
  const head = page.locator('.piece[data-i="7"]');
  await expect(head).toHaveAttribute('data-slot', '7');
  await expect(head).toHaveClass(/snap/);
  await expect(page.locator('#placed .piece')).toHaveCount(1);
  await expect(page.locator('#status')).toHaveText('Super! Noch 7 Teile.');
  // Exactly on the shadow now
  const a = await box(head), b = await box(page.locator('.slot[data-j="7"]'));
  expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeLessThan(1);
  // Fixed: it is no longer a button, and dragging it does nothing
  await expect(head).not.toHaveAttribute('role', 'button');
  await page.mouse.move(a.cx, a.cy); await page.mouse.down(); await page.mouse.move(a.cx + 80, a.cy + 80, { steps: 4 }); await page.mouse.up();
  const c = await box(head);
  expect(Math.hypot(c.cx - b.cx, c.cy - b.cy)).toBeLessThan(1);
  await expect(head).not.toHaveClass(/snap/, { timeout: 3000 });
});

test('a part only fits its own spot – identical parts fit either', async ({ page }) => {
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'teddy');
  // Ear (part 0) on the head's spot: stays loose
  await dragTo(page, 0, 7);
  await expect(page.locator('.piece[data-i="0"]')).toHaveAttribute('data-slot', '-1');
  // Left foot (3) into the right foot's spot (4), then the right foot into the left spot
  await dragTo(page, 3, 4);
  await expect(page.locator('.piece[data-i="3"]')).toHaveAttribute('data-slot', '4');
  await dragTo(page, 4, 3);
  await expect(page.locator('.piece[data-i="4"]')).toHaveAttribute('data-slot', '3');
  // Arms are mirrored, so the left arm (5) does not fit the right arm's spot (6)
  await dragTo(page, 5, 6);
  await expect(page.locator('.piece[data-i="5"]')).toHaveAttribute('data-slot', '-1');
});

test('the last part brings confetti; the animal counts as finished', async ({ page }) => {
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'dolphin');
  for (let i = 0; i < 5; i++) {
    await dragTo(page, i, i);
    await expect(page.locator(`.piece[data-i="${i}"]`)).toHaveAttribute('data-slot', String(i));
  }
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'done');
  await expect(page.locator('#status')).toHaveText('🎉 Geschafft! Der Delfin ist fertig!');
  await expect(page.locator('#confetti')).toBeVisible();
  await expect(page.locator('#confetti')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('#btnAgain')).toBeFocused();
  await expect(page.locator('#btnPeek')).toBeHidden();
  // The rain stops by itself
  await expect(page.locator('#confetti')).toBeHidden({ timeout: 15000 });
  await page.click('#btnOther');
  await expect(page.locator('[data-animal="dolphin"] .done')).toHaveText('⭐ 1× fertig');
  await openMenu(page);
  await expect(page.locator('#solvedInfo')).toHaveText('Schon 1× ein Tier fertig gebaut.');
  await closeMenu(page);
  // Again: same animal, solution first
  await startAnimal(page, 'dolphin');
  await expect(page.locator('#loose .piece')).toHaveCount(5);
});

test('keyboard: arrow keys move a part until it snaps in', async ({ page }) => {
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'panda');
  const piece = page.locator('.piece[data-i="2"]');   // body
  await piece.focus();
  await expect(piece).toHaveAttribute('aria-label', 'Körper – ziehen oder mit den Pfeiltasten verschieben');
  const a = await box(piece), b = await box(page.locator('.slot[data-j="2"]'));
  const kx = b.cx > a.cx ? 'ArrowRight' : 'ArrowLeft', ky = b.cy > a.cy ? 'ArrowDown' : 'ArrowUp';
  for (let n = 0; n < Math.round(Math.abs(b.cx - a.cx) / 10); n++) await page.keyboard.press(kx);
  for (let n = 0; n < Math.round(Math.abs(b.cy - a.cy) / 10) && await piece.getAttribute('data-slot') === '-1'; n++) await page.keyboard.press(ky);
  await expect(piece).toHaveAttribute('data-slot', '2');
  // Focus moves on to the next loose part
  await expect(page.locator('#loose .piece').first()).toBeFocused();
});

test('peek shows the solution in colour for a few seconds', async ({ page }) => {
  await page.clock.install();
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'cat');
  const fill = () => page.locator('.slot[data-j="6"] circle').first().evaluate(e => getComputedStyle(e).fill);
  const dark = await fill();
  await page.click('#btnPeek');
  await expect(page.locator('#btnPeek')).toHaveAttribute('aria-pressed', 'true');
  expect(await fill()).not.toBe(dark);
  await page.clock.runFor(3500);
  await expect(page.locator('#btnPeek')).toHaveAttribute('aria-pressed', 'false');
  expect(await fill()).toBe(dark);
});

test('the open puzzle survives a reload; back to the choice', async ({ page }) => {
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'elephant');
  await dragTo(page, 2, 2);
  await dragTo(page, 3, 4);
  await page.reload();
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'play');
  await expect(page.locator('#board')).toHaveAttribute('data-animal', 'elephant');
  await expect(page.locator('.piece[data-i="2"]')).toHaveAttribute('data-slot', '2');
  await expect(page.locator('.piece[data-i="3"]')).toHaveAttribute('data-slot', '4');
  await expect(page.locator('#loose .piece')).toHaveCount(5);
  await expect(page.locator('#status')).toHaveText('Zieh die Teile auf den Schatten. Noch 5 Teile.');
  await page.click('#btnAnimals');
  await expect(page.locator('#pick')).toBeVisible();
  await page.reload();
  await expect(page.locator('#pick')).toBeVisible();
  expect(JSON.parse(await page.evaluate(k => localStorage.getItem(k), LS)).game).toBeNull();
});

test('broken saved state is ignored', async ({ page }) => {
  await page.addInitScript(k => localStorage.setItem(k, JSON.stringify({ easy: 'x', solved: { teddy: -1, nope: 3 }, game: { animal: 'unicorn', phase: 'play', slots: [] } })), LS);
  await page.goto('/plush-puzzle/');
  await expect(page.locator('#pick')).toBeVisible();
  await expect(page.locator('.animal .done')).toHaveCount(0);
});

test('turning the phone keeps snapped parts and spreads the loose ones on the new board', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'bunny');
  await dragTo(page, 8, 8);
  await page.setViewportSize({ width: 780, height: 390 });
  await expect.poll(async () => (await box(page.locator('#board'))).w).toBeGreaterThan(600);
  await expect(page.locator('.piece[data-i="8"]')).toHaveAttribute('data-slot', '8');
  await expect.poll(async () => { const a = await box(page.locator('.piece[data-i="8"]')), b = await box(page.locator('.slot[data-j="8"]')); return Math.hypot(a.cx - b.cx, a.cy - b.cy); }).toBeLessThan(1);
  const boardBox = await box(page.locator('#board'));
  for (let i = 0; i < 8; i++) {
    const p = await box(page.locator(`.piece[data-i="${i}"]`));
    expect(p.x + p.w).toBeLessThanOrEqual(boardBox.x + boardBox.w + 1);
    expect(p.y + p.h).toBeLessThanOrEqual(boardBox.y + boardBox.h + 1);
  }
  // Still solvable after the new layout
  await dragTo(page, 0, 0);
  await expect(page.locator('.piece[data-i="0"]')).toHaveAttribute('data-slot', '0');
});

// Size of the whole shadow (all spots together)
const shadowSize = page => page.locator('#shadow').evaluate(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });

test('the shadow keeps its size while parts are added (no zooming in)', async ({ page }) => {
  // Phone width: the first status text needs two lines, "Super! …" only one – the board must not grow
  await page.setViewportSize({ width: 375, height: 700 });
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'teddy');
  const s0 = await shadowSize(page), status0 = await box(page.locator('#status')), board0 = await box(page.locator('#board'));
  for (const i of [7, 2, 0, 1]) {
    await dragTo(page, i, i);
    await expect(page.locator(`.piece[data-i="${i}"]`)).toHaveAttribute('data-slot', String(i));
    const s = await shadowSize(page);
    expect(Math.abs(s.w - s0.w), `shadow width after part ${i}`).toBeLessThan(1);
    expect(Math.abs(s.h - s0.h), `shadow height after part ${i}`).toBeLessThan(1);
  }
  expect((await box(page.locator('#status'))).h).toBeCloseTo(status0.h, 0);
  expect((await box(page.locator('#board'))).h).toBeCloseTo(board0.h, 0);
  // A small change of the board (e.g. the browser bar) keeps the size too and keeps the parts on the board
  await page.setViewportSize({ width: 375, height: 660 });
  await expect.poll(async () => (await box(page.locator('#board'))).h).toBeLessThan(board0.h - 30);
  const s1 = await shadowSize(page);
  expect(Math.abs(s1.w - s0.w)).toBeLessThan(1);
  const boardBox = await box(page.locator('#board'));
  for (let i = 0; i < 8; i++) {
    const p = await box(page.locator(`.piece[data-i="${i}"]`));
    expect(p.y).toBeGreaterThanOrEqual(boardBox.y - 1);
    expect(p.y + p.h).toBeLessThanOrEqual(boardBox.y + boardBox.h + 1);
  }
  await expect.poll(async () => { const a = await box(page.locator('.piece[data-i="7"]')), b = await box(page.locator('.slot[data-j="7"]')); return Math.hypot(a.cx - b.cx, a.cy - b.cy); }).toBeLessThan(1);
  // After a reload the shadow has the same size again
  await page.setViewportSize({ width: 375, height: 700 });
  await page.reload();
  await expect(page.locator('#board')).toHaveAttribute('data-phase', 'play');
  const s2 = await shadowSize(page);
  expect(Math.abs(s2.w - s0.w) / s0.w).toBeLessThan(0.1);
});

for (const [id, n] of [['lion', 10], ['giraffe', 11], ['owl', 12], ['octopus', 9]]) {
  test(`harder animal ${id}: ${n} parts, all fit on a phone and the puzzle can be solved`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto('/plush-puzzle/');
    await startAnimal(page, id);
    await expect(page.locator('#loose .piece')).toHaveCount(n);
    const boardBox = await box(page.locator('#board'));
    const parts = await Promise.all([...Array(n).keys()].map(i => box(page.locator(`.piece[data-i="${i}"]`))));
    for (const p of parts) {
      expect(p.x).toBeGreaterThanOrEqual(boardBox.x - 1);
      expect(p.x + p.w).toBeLessThanOrEqual(boardBox.x + boardBox.w + 1);
      expect(p.y + p.h).toBeLessThanOrEqual(boardBox.y + boardBox.h + 1);
    }
    for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) {
      const a = parts[i], b = parts[k];
      expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `parts ${i} and ${k} overlap`).toBe(false);
    }
    // Back to front, as a child would: big parts first
    for (let i = 0; i < n; i++) {
      await dragTo(page, i, i);
      await expect(page.locator(`.piece[data-i="${i}"]`)).toHaveAttribute('data-slot', String(i));
    }
    await expect(page.locator('#board')).toHaveAttribute('data-phase', 'done');
  });
}

test('octopus: every tentacle fits only its own spot', async ({ page }) => {
  await page.goto('/plush-puzzle/');
  await startAnimal(page, 'octopus');
  await dragTo(page, 0, 7);
  await expect(page.locator('.piece[data-i="0"]')).toHaveAttribute('data-slot', '-1');
  await dragTo(page, 3, 4);
  await expect(page.locator('.piece[data-i="3"]')).toHaveAttribute('data-slot', '-1');
  await dragTo(page, 3, 3);
  await expect(page.locator('.piece[data-i="3"]')).toHaveAttribute('data-slot', '3');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts follow the language', async ({ page }) => {
    await page.goto('/plush-puzzle/');
    await expect(page.locator('.animal .name')).toHaveText(['Teddy', 'Bunny', 'Panda', 'Dolphin', 'Cat', 'Elephant', 'Lion', 'Giraffe', 'Owl', 'Octopus']);
    await expect(page.locator('[data-animal="owl"] .parts')).toHaveText('12 parts');
    await page.click('[data-animal="cat"]');
    await expect(page.locator('#status')).toHaveText('This is what the Cat looks like. Look closely!');
    await page.click('#btnGo');
    await expect(page.locator('#status')).toHaveText('Drag the parts onto the shadow. 9 parts to go.');
    await expect(page.locator('.piece[data-i="0"]')).toHaveAttribute('aria-label', 'Tail – drag it or move it with the arrow keys');
  });
});
