// Malen: colours, tools, eraser, reset, picture kept after reload and rotation, WebMCP-free basics.
import { test, expect } from './helpers.mjs';

/** Colour of the canvas pixel at CSS position (x, y) */
const pixel = (page, x, y) => page.evaluate(([x, y]) => {
  const c = document.getElementById('paper'), r = c.width / c.clientWidth;
  const d = c.getContext('2d').getImageData(Math.round(x * r), Math.round(y * r), 1, 1).data;
  return [d[0], d[1], d[2]];
}, [x, y]);

/** After a viewport change: two animation frames – the page's ResizeObserver (fit) has run by then, however slow the machine */
const frames = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

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
  // 4 painting tools + paint bucket + eraser
  await expect(page.locator('[data-tool]')).toHaveCount(6);
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
  await frames(page);
  await page.setViewportSize({ width: 800, height: 500 });
  await frames(page);
  expect(await pixel(page, 600, 60)).not.toEqual(WHITE);
});

test('turning portrait → landscape → portrait shows the whole picture and keeps it unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.reload();
  await page.click('[data-tool="brush"]');
  const box = await page.locator('#paper').boundingBox();
  // A stroke near the bottom right corner – the part that used to be cut off in landscape
  const bx = box.width - 40, by = box.height - 30;
  await stroke(page, bx - 100, by, bx, by);
  const size = await page.evaluate(() => { const c = document.getElementById('paper'); return [c.width, c.height]; });

  await page.setViewportSize({ width: 800, height: 390 });
  await frames(page);
  // Same picture (no resize), shown whole inside the visible area
  expect(await page.evaluate(() => { const c = document.getElementById('paper'); return [c.width, c.height]; })).toEqual(size);
  const [wrap, paper] = await page.evaluate(() => ['wrap', 'paper'].map(id => {
    const r = document.getElementById(id).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom];
  }));
  expect(paper[0]).toBeGreaterThanOrEqual(wrap[0] - 0.5);
  expect(paper[1]).toBeGreaterThanOrEqual(wrap[1] - 0.5);
  expect(paper[2]).toBeLessThanOrEqual(wrap[2] + 0.5);
  expect(paper[3]).toBeLessThanOrEqual(wrap[3] + 0.5);

  // Painting on the smaller view lands at the right place of the picture
  const small = await page.locator('#paper').boundingBox();
  const k = small.width / box.width;
  await page.click('[data-color="red"]');
  await stroke(page, 60 * k, 60 * k, 160 * k, 60 * k);

  await page.setViewportSize({ width: 390, height: 800 });
  await frames(page);
  expect(await page.evaluate(() => { const c = document.getElementById('paper'); return [c.width, c.height]; })).toEqual(size);
  expect(near(await pixel(page, bx - 50, by), [0x1b, 0x1b, 0x1b])).toBe(true);
  expect(near(await pixel(page, 110, 60), [0xe5, 0x39, 0x35], 20)).toBe(true);
});

test('the page does not scroll when painting on the canvas', async ({ page }) => {
  const style = await page.locator('#paper').evaluate(el => getComputedStyle(el).touchAction);
  expect(style).toBe('none');
});

// ---------- Paint bucket ----------

/** One continuous stroke through the points (CSS px relative to the canvas) */
async function path(page, points) {
  const box = await page.locator('#paper').boundingBox();
  await page.mouse.move(box.x + points[0][0], box.y + points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) await page.mouse.move(box.x + x, box.y + y, { steps: 15 });
  await page.mouse.up();
}
async function tap(page, x, y) {
  const box = await page.locator('#paper').boundingBox();
  await page.mouse.click(box.x + x, box.y + y);
}
/** Counts pixels in a CSS rectangle: exactly the colour, near white, other */
const count = (page, [x1, y1, x2, y2], rgb) => page.evaluate(([x1, y1, x2, y2, rgb]) => {
  const c = document.getElementById('paper'), r = c.width / c.clientWidth;
  const X1 = Math.round(x1 * r), Y1 = Math.round(y1 * r), X2 = Math.round(x2 * r), Y2 = Math.round(y2 * r);
  const d = c.getContext('2d').getImageData(X1, Y1, X2 - X1, Y2 - Y1).data;
  const res = { color: 0, white: 0, other: 0, all: d.length / 4 };
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) res.color++;
    else if (d[i] > 230 && d[i + 1] > 230 && d[i + 2] > 230) res.white++;
    else res.other++;
  }
  return res;
}, [x1, y1, x2, y2, rgb]);
const RED = [0xe5, 0x39, 0x35], BLUE = [0x1e, 0x88, 0xe5];
const whole = page => page.evaluate(() => { const c = document.getElementById('paper'); return [0, 0, c.clientWidth, c.clientHeight]; });
// Rectangle 40…200 × 40…160, pencil line 3 px wide
const RECT = [[40, 40], [200, 40], [200, 160], [40, 160], [40, 40]];
const INSIDE = [44, 44, 196, 156], OUTSIDE_BAND = [210, 20, 280, 180];

test.describe('paint bucket', () => {
  test('on an empty canvas it fills the whole canvas', async ({ page }) => {
    await page.click('[data-tool="fill"]');
    await page.click('[data-color="red"]');
    await expect(page.locator('[data-tool="fill"]')).toHaveAttribute('aria-pressed', 'true');
    await tap(page, 100, 100);
    const c = await count(page, await whole(page), RED);
    expect(c.color).toBe(c.all);
  });

  test('fills the inside of a closed shape completely – no light seam at the line', async ({ page }) => {
    await path(page, RECT);
    await page.click('[data-tool="fill"]');
    await page.click('[data-color="red"]');
    await tap(page, 120, 100);
    const inside = await count(page, INSIDE, RED);
    expect(inside.white).toBe(0);
    // Inside the line only red (plus the line's own smoothed edge, which is dark, not white)
    expect(inside.color).toBeGreaterThan(inside.all * 0.97);
    // Outside the shape stays white, the line is still there
    const out = await count(page, OUTSIDE_BAND, RED);
    expect(out.white).toBe(out.all);
    const line = await pixel(page, 120, 40);
    expect(line[0]).toBeLessThan(100);
  });

  test('outside a closed shape it fills up to the canvas edge and leaves the inside', async ({ page }) => {
    await path(page, RECT);
    await page.click('[data-tool="fill"]');
    await page.click('[data-color="blue"]');
    await tap(page, 250, 250);
    expect(near(await pixel(page, 0, 0), BLUE, 0)).toBe(true);
    const [, , w, h] = await whole(page);
    expect(near(await pixel(page, w - 1, h - 1), BLUE, 0)).toBe(true);
    const inside = await count(page, INSIDE, BLUE);
    expect(inside.white).toBe(inside.all);
  });

  test('a gap in the shape lets the paint run out', async ({ page }) => {
    await path(page, [[40, 40], [200, 40], [200, 160], [40, 160], [40, 70]]);// left side open from 40…70
    await page.click('[data-tool="fill"]');
    await page.click('[data-color="red"]');
    await tap(page, 120, 100);
    expect(near(await pixel(page, 120, 100), RED, 0)).toBe(true);
    expect(near(await pixel(page, 300, 300), RED, 0)).toBe(true);
  });

  test('fills a marker area with solid colour; same colour again changes nothing', async ({ page }) => {
    await page.click('[data-tool="marker"]');
    await stroke(page, 20, 100, 260, 100);
    await page.click('[data-tool="fill"]');
    await page.click('[data-color="blue"]');
    await tap(page, 140, 100);
    expect(near(await pixel(page, 140, 100), BLUE, 0)).toBe(true);
    expect(near(await pixel(page, 140, 112), BLUE, 0)).toBe(true);
    // The white around the marker stroke is a different area
    expect(await pixel(page, 140, 160)).toEqual(WHITE);
    const before = await page.evaluate(() => document.getElementById('paper').toDataURL());
    await tap(page, 140, 100);
    expect(await page.evaluate(() => document.getElementById('paper').toDataURL())).toBe(before);
  });

  test('stays after reload; eraser then colour goes back to the paint bucket', async ({ page }) => {
    await path(page, RECT);
    await page.click('[data-tool="fill"]');
    await page.click('[data-color="red"]');
    await tap(page, 120, 100);
    await page.click('[data-tool="eraser"]');
    await page.click('[data-color="green"]');
    await expect(page.locator('[data-tool="fill"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem('paint.drawing.v1'))).toBe(true);
    await page.reload();
    await expect.poll(async () => near(await pixel(page, 120, 100), RED, 0)).toBe(true);
    expect(await pixel(page, 250, 250)).toEqual(WHITE);
    await expect(page.locator('[data-tool="fill"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('toolbar still fits at 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    const right = await page.locator('#btnReset').evaluate(el => el.getBoundingClientRect().right);
    expect(right).toBeLessThanOrEqual(375);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('labels are English', async ({ page }) => {
    await expect(page.locator('[data-tool="eraser"]')).toHaveAttribute('aria-label', 'Eraser');
    await expect(page.locator('[data-tool="fill"]')).toHaveAttribute('aria-label', 'Paint bucket');
    await expect(page.locator('[data-color="purple"]')).toHaveAttribute('aria-label', 'Purple');
    await expect(page.locator('#btnReset')).toHaveAttribute('aria-label', 'Clear canvas');
  });
});
