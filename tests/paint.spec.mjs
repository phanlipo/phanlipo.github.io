// Malen: colours, tools, eraser, reset, picture kept after reload and rotation, WebMCP-free basics.
import { test, expect } from './helpers.mjs';

/** Colour of the canvas pixel at CSS position (x, y) */
const pixel = (page, x, y) => page.evaluate(([x, y]) => {
  const c = document.getElementById('paper'), r = c.width / c.clientWidth;
  const d = c.getContext('2d').getImageData(Math.round(x * r), Math.round(y * r), 1, 1).data;
  return [d[0], d[1], d[2]];
}, [x, y]);

/** Drags across the canvas from (x1, y1) to (x2, y2) in CSS px relative to the canvas */
async function stroke(page, x1, y1, x2, y2, { hold = 0 } = {}) {
  const box = await page.locator('#paper').boundingBox();
  await page.mouse.move(box.x + x1, box.y + y1);
  await page.mouse.down();
  if (hold) await page.waitForTimeout(hold);
  await page.mouse.move(box.x + x2, box.y + y2, { steps: 12 });
  await page.mouse.up();
}

const WHITE = [255, 255, 255];
const near = (a, b, tol = 6) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test.beforeEach(async ({ page }) => {
  await page.goto('/paint/');
});

test('starts as a white canvas with pencil and black', async ({ page }) => {
  expect(await pixel(page, 50, 50)).toEqual(WHITE);
  await expect(page.locator('[data-tool="pencil"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-color="black"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#colors .sw')).toHaveCount(6);
  // 4 painting tools + eraser
  await expect(page.locator('[data-tool]')).toHaveCount(5);
});

test('paints in the chosen colour, the pencil is thin and the brush thick', async ({ page }) => {
  await page.click('[data-color="red"]');
  await stroke(page, 20, 40, 220, 40);
  expect(near(await pixel(page, 120, 40), [0xe5, 0x39, 0x35])).toBe(true);
  // Pencil 3 px: 6 px away from the line stays white
  expect(await pixel(page, 120, 46)).toEqual(WHITE);

  await page.click('[data-tool="brush"]');
  await page.click('[data-color="blue"]');
  await stroke(page, 20, 120, 220, 120);
  // Brush 14 px: 5 px away is still painted, 10 px away not
  expect(near(await pixel(page, 120, 125), [0x1e, 0x88, 0xe5])).toBe(true);
  expect(await pixel(page, 120, 130)).toEqual(WHITE);
});

test('marker is see-through and evenly coloured where the stroke overlaps itself', async ({ page }) => {
  await page.click('[data-tool="marker"]');
  await page.click('[data-color="black"]');
  // Back and forth over the same spot within one stroke
  const box = await page.locator('#paper').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + 200, box.y + 60, { steps: 10 });
  await page.mouse.move(box.x + 20, box.y + 60, { steps: 10 });
  await page.mouse.up();
  const p = await pixel(page, 100, 60);
  // 45 % of #1b1b1b over white: 255 - 0.45 * (255 - 27) ≈ 152
  for (const v of p) expect(Math.abs(v - 152)).toBeLessThanOrEqual(3);
  // A second stroke on top is darker
  await stroke(page, 20, 60, 200, 60);
  const p2 = await pixel(page, 100, 60);
  expect(p2[0]).toBeLessThan(p[0] - 20);
});

test('spray scatters dots around the finger and gets denser when held', async ({ page }) => {
  await page.click('[data-tool="spray"]');
  await page.click('[data-color="green"]');
  const box = await page.locator('#paper').boundingBox();
  await page.mouse.move(box.x + 100, box.y + 100);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const stats = await page.evaluate(() => {
    const c = document.getElementById('paper'), r = c.width / c.clientWidth;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let inside = 0, outside = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      if (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255) continue;
      const dist = Math.hypot(x / r - 100, y / r - 100);
      if (dist <= 19.5) inside++; else outside++;
    }
    return { inside, outside, r };
  });
  // Dots only within the spray radius (18 px), many of them after holding
  expect(stats.outside).toBe(0);
  expect(stats.inside).toBeGreaterThan(200);
});

test('eraser paints white; a colour switches back to the last tool', async ({ page }) => {
  await page.click('[data-tool="brush"]');
  await stroke(page, 20, 80, 220, 80);
  expect(await pixel(page, 120, 80)).not.toEqual(WHITE);
  await page.click('[data-tool="eraser"]');
  await expect(page.locator('[data-tool="eraser"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#colors [aria-pressed="true"]')).toHaveCount(0);
  await stroke(page, 20, 80, 220, 80);
  expect(await pixel(page, 120, 80)).toEqual(WHITE);
  await page.click('[data-color="yellow"]');
  await expect(page.locator('[data-tool="brush"]')).toHaveAttribute('aria-pressed', 'true');
});

test('reset clears only after confirming', async ({ page }) => {
  await stroke(page, 20, 50, 220, 50);
  page.once('dialog', d => d.dismiss());
  await page.click('#btnReset');
  expect(await pixel(page, 120, 50)).not.toEqual(WHITE);
  page.once('dialog', d => d.accept());
  await page.click('#btnReset');
  expect(await pixel(page, 120, 50)).toEqual(WHITE);
  // Stays empty after reload
  await page.reload();
  expect(await pixel(page, 120, 50)).toEqual(WHITE);
});

test('picture, colour and tool are kept after reload', async ({ page }) => {
  await page.click('[data-tool="brush"]');
  await page.click('[data-color="purple"]');
  await stroke(page, 20, 70, 220, 70);
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('paint.drawing.v1'))).toBe(true);
  await page.reload();
  await expect.poll(() => pixel(page, 120, 70)).not.toEqual(WHITE);
  expect(near(await pixel(page, 120, 70), [0x8e, 0x24, 0xaa])).toBe(true);
  await expect(page.locator('[data-tool="brush"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-color="purple"]')).toHaveAttribute('aria-pressed', 'true');
});

test('rotating to a narrower screen keeps the picture', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 500 });
  await page.reload();
  await page.click('[data-tool="brush"]');
  await stroke(page, 500, 60, 700, 60);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(100);
  await page.setViewportSize({ width: 800, height: 500 });
  await page.waitForTimeout(100);
  expect(await pixel(page, 600, 60)).not.toEqual(WHITE);
});

test('the page does not scroll when painting on the canvas', async ({ page }) => {
  const style = await page.locator('#paper').evaluate(el => getComputedStyle(el).touchAction);
  expect(style).toBe('none');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('labels are English', async ({ page }) => {
    await expect(page.locator('[data-tool="eraser"]')).toHaveAttribute('aria-label', 'Eraser');
    await expect(page.locator('[data-color="purple"]')).toHaveAttribute('aria-label', 'Purple');
    await expect(page.locator('#btnReset')).toHaveAttribute('aria-label', 'Clear canvas');
  });
});
