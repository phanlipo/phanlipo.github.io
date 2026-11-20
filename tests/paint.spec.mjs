// Malen: colours, tools, eraser, reset, picture kept after reload and rotation, WebMCP-free basics.
import { readFileSync } from 'node:fs';
import { test, expect, mockAndroidShare, onDialog, openMenu } from './helpers.mjs';

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
  // 7 fixed colours (white among them) and the button for own colours
  await expect(page.locator('#colors [data-color]')).toHaveCount(7);
  await expect(page.locator('[data-color="white"]')).toBeVisible();
  await expect(page.locator('#btnAddColor')).toHaveAttribute('aria-label', 'Farbe hinzufügen');
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
  await onDialog(page, d => d.dismiss(), { once: true });
  await page.click('#btnReset');
  await expect(page.locator('dialog.tools-ask')).toHaveCount(0);     // answered
  expect(await pixel(page, 120, 50)).not.toEqual(WHITE);
  await onDialog(page, d => d.accept(), { once: true });
  await page.click('#btnReset');
  await expect.poll(() => pixel(page, 120, 50)).toEqual(WHITE);
  // Stays empty after reload
  await page.reload();
  expect(await pixel(page, 120, 50)).toEqual(WHITE);
});

/** Colour at CSS position (x, y) of a PNG (buffer), decoded in the page */
const pngPixel = (page, buf, x, y, scale = 1) => page.evaluate(async ([b64, x, y, scale]) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + b64;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
  return { rgb: [d[0], d[1], d[2]], w: img.width, h: img.height };
}, [buf.toString('base64'), x, y, scale]);

test('colours look on screen as they are painted – no veil over the picture', async ({ page }) => {
  await page.click('[data-tool="marker"]');
  await stroke(page, 20, 200, 220, 200);
  await page.click('[data-tool="brush"]');
  await page.click('[data-color="black"]');
  await stroke(page, 20, 60, 220, 60);
  await page.click('[data-color="red"]');
  await stroke(page, 20, 120, 220, 120);
  const box = await page.locator('#paper').boundingBox();
  const shot = await page.screenshot({ clip: box });
  // What the eye sees (both canvases composited) must equal the paper's pixels
  expect(near((await pngPixel(page, shot, 120, 60)).rgb, [0x1b, 0x1b, 0x1b])).toBe(true);
  expect(near((await pngPixel(page, shot, 120, 120)).rgb, [0xe5, 0x39, 0x35])).toBe(true);
  expect((await pngPixel(page, shot, 120, 160)).rgb).toEqual(WHITE);
  expect(near((await pngPixel(page, shot, 120, 200)).rgb, await pixel(page, 120, 200))).toBe(true);
});

test.describe('export', () => {
  test('saves the canvas as a PNG at full resolution', async ({ page }) => {
    await page.click('[data-tool="brush"]');
    await page.click('[data-color="blue"]');
    await stroke(page, 20, 80, 220, 80);
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    expect(dl.suggestedFilename()).toMatch(/^malen-\d{4}-\d{2}-\d{2}-\d{4}\.png$/);
    const buf = await (await import('node:fs/promises')).readFile(await dl.path());
    const size = await page.locator('#paper').evaluate(c => ({ w: c.width, h: c.height, k: c.width / c.clientWidth }));
    const px = await pngPixel(page, buf, 120, 80, size.k);
    expect([px.w, px.h]).toEqual([size.w, size.h]);
    expect(near(px.rgb, [0x1e, 0x88, 0xe5])).toBe(true);
    // The background is white, not transparent
    expect((await pngPixel(page, buf, 120, 160, size.k)).rgb).toEqual(WHITE);
    await expect(page.locator('.toast')).toHaveText('Bild gespeichert');
  });

  test('share button only where files can be shared; shares a PNG', async ({ page }) => {
    await expect(page.locator('#btnShare')).toBeHidden();
    await mockAndroidShare(page);
    await page.reload();
    await expect(page.locator('#btnShare')).toBeVisible();
    await stroke(page, 20, 80, 220, 80);
    await page.click('#btnShare');
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(1);
    const [f] = (await page.evaluate(() => window.__shared))[0];
    expect(f.type).toBe('image/png');
    expect(f.name).toMatch(/^malen-.*\.png$/);
    expect(f.size).toBeGreaterThan(100);
  });
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

test('white paints white over other paint', async ({ page }) => {
  await page.click('[data-tool="brush"]');
  await page.click('[data-color="blue"]');
  await stroke(page, 20, 60, 220, 60);
  await page.click('[data-tool="pencil"]');
  await page.click('[data-color="white"]');
  await expect(page.locator('[data-color="white"]')).toHaveAttribute('aria-pressed', 'true');
  await stroke(page, 120, 40, 120, 80);
  expect(await pixel(page, 120, 60)).toEqual(WHITE);
  expect(near(await pixel(page, 100, 60), [0x1e, 0x88, 0xe5])).toBe(true);
});

test.describe('own colours', () => {
  test('a colour code adds a colour, paints with it and is kept after reload', async ({ page }) => {
    await page.click('#btnAddColor');
    await expect(page.locator('#colorDlg')).toBeVisible();
    // Invalid code: message, nothing added
    await page.fill('#colorCode', 'xyz');
    await page.click('#colorForm [type="submit"]');
    await expect(page.locator('#colorErr')).not.toBeEmpty();
    await expect(page.locator('#colors [data-color]')).toHaveCount(7);
    // Short form is expanded; the picker follows the code
    await page.fill('#colorCode', '#F80');
    await expect(page.locator('#colorPick')).toHaveValue('#ff8800');
    await page.click('#colorForm [type="submit"]');
    await expect(page.locator('#colorDlg')).toBeHidden();
    const sw = page.locator('[data-color="#ff8800"]');
    await expect(sw).toHaveAttribute('aria-pressed', 'true');
    await expect(sw).toHaveAttribute('aria-label', 'Eigene Farbe #ff8800');
    await stroke(page, 20, 40, 220, 40);
    expect(near(await pixel(page, 120, 40), [0xff, 0x88, 0x00])).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('paint.colors.v1')))).toEqual(['#ff8800']);
    // Adding the same colour again does not duplicate it
    await page.click('#btnAddColor');
    await page.fill('#colorCode', 'ff8800');
    await page.click('#colorForm [type="submit"]');
    await expect(page.locator('#colors [data-color]')).toHaveCount(8);

    await page.reload();
    await expect(page.locator('[data-color="#ff8800"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the colour picker adds a colour', async ({ page }) => {
    await page.click('#btnAddColor');
    await page.locator('#colorPick').fill('#336699');
    await expect(page.locator('#colorCode')).toHaveValue('#336699');
    await page.click('#colorForm [type="submit"]');
    await expect(page.locator('[data-color="#336699"]')).toHaveAttribute('aria-pressed', 'true');
  });

  test('removing an own colour in the menu can be undone', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('paint.colors.v1', JSON.stringify(['#123456', '#abcdef', 'junk'])));
    await page.reload();
    // Invalid stored values are dropped
    await expect(page.locator('#colors [data-color]')).toHaveCount(9);
    await page.click('[data-color="#abcdef"]');
    await openMenu(page);
    await page.locator('#colorsPage > summary').click();
    await page.click('[data-del="#abcdef"]');
    await expect(page.locator('[data-color="#abcdef"]')).toHaveCount(0);
    await expect(page.locator('[data-color="black"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('paint.colors.v1')))).toEqual(['#123456']);
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.locator('[data-color="#abcdef"]')).toHaveAttribute('aria-pressed', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('paint.colors.v1')))).toEqual(['#123456', '#abcdef']);
  });

  test('many own colours scroll sideways instead of widening the page at 375 px', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.evaluate(() => localStorage.setItem('paint.colors.v1',
      JSON.stringify(Array.from({ length: 10 }, (_, i) => '#' + String(i).repeat(6)))));
    await page.reload();
    await expect(page.locator('#colors [data-color]')).toHaveCount(17);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    // The add button stays on screen
    const add = await page.locator('#btnAddColor').boundingBox();
    expect(add.x + add.width).toBeLessThanOrEqual(375);
    await page.click('#btnAddColor');
    await expect(page.locator('#colorDlg')).toBeVisible();
  });
});

// ---------- Inserting a picture ----------
/** PNG built in the page: w×h, left half red, right half blue; noise=true: top half random pixels (photo-like) */
const makePng = (page, w, h, { noise = false } = {}) => page.evaluate(async ([w, h, noise]) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = '#ff0000'; x.fillRect(0, 0, w / 2, h);
  x.fillStyle = '#0000ff'; x.fillRect(w / 2, 0, w / 2, h);
  if (noise) {
    const im = x.createImageData(w, h / 2);
    for (let i = 0; i < im.data.length; i++) im.data[i] = i % 4 === 3 ? 255 : Math.random() * 256 | 0;
    x.putImageData(im, 0, 0);
  }
  const b = await new Promise(r => c.toBlob(r, 'image/png'));
  return [...new Uint8Array(await b.arrayBuffer())];
}, [w, h, noise]).then(a => Buffer.from(a));
const canvasSize = page => page.locator('#paper').evaluate(c => [c.clientWidth, c.clientHeight]);
const PURE_RED = [255, 0, 0], PURE_BLUE = [0, 0, 255];

test.describe('insert a picture', () => {
  test.use({ viewport: { width: 375, height: 700 } });

  test('a picture fills the canvas whole and centred, can be painted on and is kept after reload', async ({ page }) => {
    await expect(page.locator('#btnImage')).toHaveAttribute('aria-label', 'Bild einfügen');
    await page.setInputFiles('#imgPick', { name: 'bild.png', mimeType: 'image/png', buffer: await makePng(page, 200, 100) });
    const [w, h] = await canvasSize(page);
    // 200×100 into w×h (wider than tall relative to the canvas): full width, height w/2, centred vertically
    const ih = w / 2, top = (h - ih) / 2;
    await expect.poll(() => pixel(page, w / 4, h / 2)).toEqual(PURE_RED);
    expect(await pixel(page, w * 3 / 4, h / 2)).toEqual(PURE_BLUE);
    expect(await pixel(page, w / 2, top - 8)).toEqual(WHITE);
    expect(await pixel(page, w / 2, top + ih + 8)).toEqual(WHITE);
    // Paint over it with black
    await stroke(page, 20, h / 2, w - 20, h / 2);
    expect(near(await pixel(page, w / 4, h / 2), [0x1b, 0x1b, 0x1b])).toBe(true);
    expect(await pixel(page, w / 4, h / 2 + 20)).toEqual(PURE_RED);
    await expect.poll(() => page.evaluate(() => (JSON.parse(localStorage.getItem('paint.drawing.v1')) || {}).strokes)).toBe(2);
    await page.reload();
    await expect.poll(() => pixel(page, w / 4, h / 2 + 20)).toEqual(PURE_RED);
    expect(near(await pixel(page, w / 4, h / 2), [0x1b, 0x1b, 0x1b])).toBe(true);
    expect(await pixel(page, w * 3 / 4, h / 2 + 20)).toEqual(PURE_BLUE);
  });

  test('a tall picture is centred horizontally', async ({ page }) => {
    const [w, h] = await canvasSize(page);
    // 100×400: full height, width h/4
    await page.setInputFiles('#imgPick', { name: 'hoch.png', mimeType: 'image/png', buffer: await makePng(page, 100, 400) });
    const iw = h / 4, left = (w - iw) / 2;
    await expect.poll(() => pixel(page, left + iw / 4, h / 2)).toEqual(PURE_RED);
    expect(await pixel(page, left + iw * 3 / 4, h / 2)).toEqual(PURE_BLUE);
    expect(await pixel(page, left - 8, h / 2)).toEqual(WHITE);
    expect(await pixel(page, left + iw + 8, h / 2)).toEqual(WHITE);
  });

  test('replacing a painted canvas asks first', async ({ page }) => {
    await stroke(page, 20, 40, 220, 40);
    const png = await makePng(page, 200, 100);
    let asked = '';
    await onDialog(page, d => { asked = d.message(); return d.dismiss(); });
    await page.setInputFiles('#imgPick', { name: 'a.png', mimeType: 'image/png', buffer: png });
    await expect.poll(() => asked).toContain('ersetzt die aktuelle Leinwand');
    const [w, h] = await canvasSize(page);
    expect(await pixel(page, w / 4, h / 2)).toEqual(WHITE);
    expect(near(await pixel(page, 120, 40), [0x1b, 0x1b, 0x1b])).toBe(true);
  });

  test('replacing a painted canvas after confirming', async ({ page }) => {
    await stroke(page, 20, 40, 220, 40);
    await onDialog(page, d => d.accept());
    await page.setInputFiles('#imgPick', { name: 'a.png', mimeType: 'image/png', buffer: await makePng(page, 200, 100) });
    const [w, h] = await canvasSize(page);
    await expect.poll(() => pixel(page, w / 4, h / 2)).toEqual(PURE_RED);
    expect(await pixel(page, 120, 40)).toEqual(WHITE);
  });

  test('a picture pasted with Ctrl+V is inserted', async ({ page }) => {
    const png = await makePng(page, 200, 100);
    await page.evaluate(b64 => {
      const dt = new DataTransfer();
      dt.items.add(new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'image.png', { type: 'image/png' }));
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true }));
    }, png.toString('base64'));
    const [w, h] = await canvasSize(page);
    await expect.poll(() => pixel(page, w / 4, h / 2)).toEqual(PURE_RED);
  });

  test('a file that is no picture shows a message and leaves the canvas', async ({ page }) => {
    await page.setInputFiles('#imgPick', { name: 'kaputt.png', mimeType: 'image/png', buffer: Buffer.from('kein Bild') });
    await expect(page.locator('#toast')).toContainText('Das Bild ließ sich nicht öffnen.');
    expect(await pixel(page, 50, 50)).toEqual(WHITE);
  });

  test('HEIC photo (iPhone) is read, also offline after the first time', async ({ page, context }) => {
    // 64×48: red | green over blue | white
    const heic = { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: readFileSync(new URL('./fixtures/photo.heic', import.meta.url)) };
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();                                 // controlled by the service worker → the decoder is cached
    const [w, h] = await canvasSize(page);
    const ih = w * 48 / 64, top = (h - ih) / 2;
    const check = async () => {
      await expect.poll(async () => near(await pixel(page, w / 4, top + ih / 4), PURE_RED, 40), { timeout: 15000 }).toBe(true);
      expect(near(await pixel(page, w * 3 / 4, top + ih * 3 / 4), WHITE, 40)).toBe(true);
    };
    await page.setInputFiles('#imgPick', heic);
    await check();
    expect(await page.evaluate(() => Heic.info())).toEqual({ native: false, worker: true });
    await context.setOffline(true);
    await page.evaluate(() => localStorage.removeItem('paint.drawing.v1'));
    await page.reload();
    expect(await pixel(page, w / 4, top + ih / 4)).toEqual(WHITE);
    await page.setInputFiles('#imgPick', heic);
    await check();
    await context.setOffline(false);
  });

  test('share target: a picture shared to the installed app is inserted', async ({ page, request }) => {
    const manifest = await (await request.get('/paint/manifest.webmanifest')).json();
    expect(manifest.share_target.params.files[0].accept).toContain('image/*');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const png = await makePng(page, 200, 100);
    expect(await page.evaluate(async b64 => {
      const fd = new FormData();
      fd.append('file', new File([Uint8Array.from(atob(b64), c => c.charCodeAt(0))], 'geteilt.png', { type: 'image/png' }));
      return (await fetch('share-target', { method: 'POST', body: fd })).ok;
    }, png.toString('base64'))).toBe(true);
    await page.goto('/paint/?shared=1');
    await expect(page).toHaveURL(/\/paint\/$/);
    const [w, h] = await canvasSize(page);
    await expect.poll(() => pixel(page, w / 4, h / 2)).toEqual(PURE_RED);
  });
});

test.describe('large picture on a sharp screen', () => {
  test.use({ viewport: { width: 375, height: 700 }, deviceScaleFactor: 2 });
  test('is stored as JPEG so it fits and comes back after reload', async ({ page }) => {
    const [w, h] = await canvasSize(page);
    // Photo-like: random pixels at full resolution, PNG would be several MB
    await page.setInputFiles('#imgPick', { name: 'foto.png', mimeType: 'image/png', buffer: await makePng(page, w * 2, h * 2, { noise: true }) });
    await expect.poll(() => page.evaluate(() => (localStorage.getItem('paint.drawing.v1') || '').includes('data:image/jpeg'))).toBe(true);
    await page.reload();
    // Bottom half (solid colours) survives the JPEG closely
    await expect.poll(async () => near(await pixel(page, w / 4, h * 3 / 4), PURE_RED, 12)).toBe(true);
    expect(near(await pixel(page, w * 3 / 4, h * 3 / 4), PURE_BLUE, 12)).toBe(true);
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('labels are English', async ({ page }) => {
    await expect(page.locator('[data-tool="eraser"]')).toHaveAttribute('aria-label', 'Eraser');
    await expect(page.locator('[data-tool="fill"]')).toHaveAttribute('aria-label', 'Paint bucket');
    await expect(page.locator('[data-color="purple"]')).toHaveAttribute('aria-label', 'Purple');
    await expect(page.locator('#btnReset')).toHaveAttribute('aria-label', 'Clear canvas');
    await expect(page.locator('#btnSave')).toHaveAttribute('aria-label', 'Save as image');
  });
  test('the exported file has an English name', async ({ page }) => {
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnSave')]);
    expect(dl.suggestedFilename()).toMatch(/^paint-.*\.png$/);
  });
});
