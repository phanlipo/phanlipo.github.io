// Data logger: profiles, measurements, data points, charts and exports. Expected values worked out by hand.
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './helpers.mjs';

test.use({ timezoneId: 'Europe/Berlin' });
// Friday 30 Oct 2026, 12:00 CET
const NOW = new Date('2026-10-30T12:00:00+01:00');

const metric = (page, i) => page.locator('#metrics li').nth(i);
const entry = (page, i) => page.locator('#entryFields input').nth(i);
const rows = page => page.locator('#pointsTable tbody tr');
const cells = async (page, i) => (await rows(page).nth(i).locator('td').allTextContents()).slice(0, -1);

async function setup(page) {
  await page.click('#btnNewProfile');
  await page.fill('#profileName', 'Gesundheit');
  await metric(page, 0).locator('[data-key=name]').fill('Gewicht');
  await metric(page, 0).locator('[data-key=unit]').fill('kg');
  await page.click('#btnAddMetric');
  await metric(page, 1).locator('[data-key=name]').fill('Puls');
  await metric(page, 1).locator('[data-key=unit]').fill('/min');
}
async function point(page, values, time) {
  for (let i = 0; i < values.length; i++) await entry(page, i).fill(values[i]);
  if (time) await page.fill('#entryTime', time);
  await page.click('#btnSavePoint');
}
async function download(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  return { name: dl.suggestedFilename(), buf: Buffer.concat(chunks) };
}
/** Three data points: 28 Oct (weight only), 29 Oct (both), now (both) */
async function sample(page) {
  await setup(page);
  await point(page, ['80,5', ''], '2026-10-28T08:00');
  await point(page, ['80.1', '64'], '2026-10-29T08:30');
  await point(page, ['79,6', '70']);
}

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: NOW - 1000 });
  await page.clock.pauseAt(NOW);
  await page.goto('/data-logger/');
});

test('empty start: only the profile card, new profile comes with one measurement', async ({ page }) => {
  await expect(page.locator('#noProfile')).toBeVisible();
  await expect(page.locator('#entryCard')).toBeHidden();
  await page.click('#btnNewProfile');
  await expect(page.locator('#profileName')).toBeFocused();
  await expect(page.locator('#profileName')).toHaveAttribute('placeholder', 'Profil 1');
  await expect(page.locator('#metrics li')).toHaveCount(1);
  await expect(page.locator('#entryFields .lbl')).toHaveText(['Messwert 1']);
  await expect(page.locator('#noPoints')).toBeVisible();
});

test('records data points, shows table, statistics and curves; kept after reload', async ({ page }) => {
  await sample(page);
  await expect(page.locator('#entryFields .lbl')).toHaveText(['Gewicht (kg)', 'Puls (/min)']);
  await expect(entry(page, 0)).toHaveValue('');
  // Newest first; missing values as dash
  await expect(rows(page)).toHaveCount(3);
  expect(await cells(page, 0)).toEqual(['30.10.2026, 12:00', '79,6', '70']);
  expect(await cells(page, 1)).toEqual(['29.10.2026, 08:30', '80,1', '64']);
  expect(await cells(page, 2)).toEqual(['28.10.2026, 08:00', '80,5', '–']);
  await expect(page.locator('#pointsTable thead th')).toHaveText(['Zeitpunkt', 'Gewicht (kg)', 'Puls (/min)', 'Löschen']);
  // Weight: 80.5, 80.1, 79.6 → mean 240.2 / 3 = 80.0667; pulse: 64, 70 → mean 67
  const stats = page.locator('.chart .stats');
  await expect(stats.nth(0)).toHaveText('Letzter 79,6 kg · Min 79,6 · Max 80,5 · Ø 80,07 · 3 Werte');
  await expect(stats.nth(1)).toHaveText('Letzter 70 /min · Min 64 · Max 70 · Ø 67,0 · 2 Werte');
  await expect(page.locator('.chart canvas').first()).toHaveAttribute('aria-label',
    'Kurve Gewicht (kg): 3 Werte von 28.10.2026, 08:00 bis 30.10.2026, 12:00, kleinster 79,6, größter 80,5, letzter 79,6');
  // The curve is drawn in the measurement's colour (light series 1 = #2a78d6, series 2 = #eb6834)
  const has = (i, rgb) => page.locator('.chart canvas').nth(i).evaluate((c, rgb) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - rgb[0]) < 4 && Math.abs(d[i + 1] - rgb[1]) < 4 && Math.abs(d[i + 2] - rgb[2]) < 4) return true;
    return false;
  }, rgb);
  expect(await has(0, [0x2a, 0x78, 0xd6])).toBe(true);
  expect(await has(1, [0xeb, 0x68, 0x34])).toBe(true);
  expect(await has(0, [0xeb, 0x68, 0x34])).toBe(false);
  await page.reload();
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('#profileName')).toHaveValue('Gesundheit');
  await expect(page.locator('#metrics [data-key=unit]').nth(1)).toHaveValue('/min');
});

test('hovering a curve shows the nearest value', async ({ page }) => {
  await sample(page);
  const c = page.locator('.chart canvas').first();
  const box = await c.boundingBox();
  await c.hover({ position: { x: box.width - 16, y: box.height / 2 } });
  const tip = page.locator('.chart .tip').first();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveText('79,6 kg30.10.2026, 12:00');
  await page.locator('#h-charts').hover();
  await expect(tip).toBeHidden();
});

test('invalid input is rejected and nothing is stored', async ({ page }) => {
  await setup(page);
  await page.click('#btnSavePoint');
  await expect(page.locator('#entryMsg')).toHaveText('Bitte mindestens einen Wert eintragen.');
  await point(page, ['80', 'viel']);
  await expect(page.locator('#entryMsg')).toHaveText('„Puls“ ist keine Zahl.');
  await expect(entry(page, 1)).toBeFocused();
  await expect(rows(page)).toHaveCount(0);
  await point(page, ['80', '']);
  await expect(page.locator('#entryMsg')).toBeHidden();
  await expect(rows(page)).toHaveCount(1);
});

test('period filter: older values drop out of the chart, not out of the table', async ({ page }) => {
  await setup(page);
  await point(page, ['82', ''], '2026-10-01T09:00');
  await point(page, ['81', '60'], '2026-10-25T09:00');
  await point(page, ['80', ''], '2026-10-30T09:00');
  await page.click('[data-range="7d"]');
  await expect(page.locator('.chart .stats').first()).toContainText('· 2 Werte');
  await expect(page.locator('.chart .stats').nth(1)).toHaveText('1 Wert: 60 /min');
  await page.click('[data-range="1d"]');
  await expect(page.locator('.chart').nth(1).locator('.empty')).toHaveText('Keine Werte im gewählten Zeitraum.');
  await expect(page.locator('.chart .stats').first()).toHaveText('1 Wert: 80 kg');
  await expect(rows(page)).toHaveCount(3);
  await page.reload();
  await expect(page.locator('[data-range="1d"]')).toHaveAttribute('aria-pressed', 'true');
});

test('delete data point, measurement and profile – only after confirming', async ({ page }) => {
  await sample(page);
  page.once('dialog', d => d.dismiss());
  await rows(page).nth(0).getByRole('button', { name: 'Datenpunkt vom 30.10.2026, 12:00 löschen' }).click();
  await expect(rows(page)).toHaveCount(3);
  page.once('dialog', d => { expect(d.message()).toBe('Datenpunkt vom 30.10.2026, 12:00 löschen?'); d.accept(); });
  await rows(page).nth(0).getByRole('button').click();
  await expect(rows(page)).toHaveCount(2);
  // Deleting weight removes its values; the point of 28 Oct had only weight and goes too
  page.once('dialog', d => { expect(d.message()).toBe('Messwert „Gewicht“ mit 2 Werten löschen?'); d.accept(); });
  await page.getByRole('button', { name: 'Messwert löschen: Gewicht' }).click();
  await expect(page.locator('#metrics li')).toHaveCount(1);
  await expect(rows(page)).toHaveCount(1);
  expect(await cells(page, 0)).toEqual(['29.10.2026, 08:30', '64']);
  // A second profile, then delete the first
  await page.click('#btnNewProfile');
  await page.fill('#profileName', 'Garten');
  await expect(page.locator('#profileSel option')).toHaveText(['Gesundheit', 'Garten']);
  await page.selectOption('#profileSel', { label: 'Gesundheit' });
  await expect(rows(page)).toHaveCount(1);
  page.once('dialog', d => { expect(d.message()).toBe('Profil „Gesundheit“ mit 1 Datenpunkten löschen?'); d.accept(); });
  await page.click('#btnDelProfile');
  await expect(page.locator('#profileSel option')).toHaveText(['Garten']);
  await expect(page.locator('#profileName')).toHaveValue('Garten');
  page.once('dialog', d => d.accept());
  await page.click('#btnDelProfile');
  await expect(page.locator('#noProfile')).toBeVisible();
  await page.reload();
  await expect(page.locator('#noProfile')).toBeVisible();
});

test('at most 8 measurements, each with its own colour', async ({ page }) => {
  await page.click('#btnNewProfile');
  for (let i = 1; i < 8; i++) await page.click('#btnAddMetric');
  await expect(page.locator('#btnAddMetric')).toBeDisabled();
  await expect(page.locator('#maxMetrics')).toBeVisible();
  const colours = await page.locator('#metrics .swatch').evaluateAll(s => s.map(x => getComputedStyle(x).backgroundColor));
  expect(new Set(colours).size).toBe(8);
  // A freed colour is reused by the next new measurement, the others keep theirs
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Messwert löschen: Messwert 3' }).click();
  await page.click('#btnAddMetric');
  const after = await page.locator('#metrics .swatch').evaluateAll(s => s.map(x => getComputedStyle(x).backgroundColor));
  expect(after).toEqual([...colours.slice(0, 2), ...colours.slice(3), colours[2]]);
});

test('JSON export and import as a new profile', async ({ page }) => {
  await sample(page);
  const { name, buf } = await download(page, () => page.click('#btnJson'));
  expect(name).toBe('gesundheit-2026-10-30.json');
  const j = JSON.parse(buf.toString());
  expect(j).toMatchObject({ format: 'phanlipo-data-logger', formatVersion: 1, app: 'data-logger' });
  expect(j.profile.name).toBe('Gesundheit');
  expect(j.profile.metrics.map(m => [m.name, m.unit])).toEqual([['Gewicht', 'kg'], ['Puls', '/min']]);
  const [w, p] = j.profile.metrics.map(m => m.id);
  expect(j.profile.points).toEqual([
    { time: '2026-10-28T07:00:00.000Z', values: { [w]: 80.5 } },
    { time: '2026-10-29T07:30:00.000Z', values: { [w]: 80.1, [p]: 64 } },
    { time: '2026-10-30T11:00:00.000Z', values: { [w]: 79.6, [p]: 70 } },
  ]);
  j.profile.name = 'Kopie';
  await page.setInputFiles('#fileImport', { name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(j)) });
  await expect(page.locator('#profileSel option')).toHaveText(['Gesundheit', 'Kopie']);
  await expect(page.locator('#profileSel')).toHaveValue(await page.locator('#profileSel option').nth(1).getAttribute('value'));
  await expect(rows(page)).toHaveCount(3);
  expect(await cells(page, 1)).toEqual(['29.10.2026, 08:30', '80,1', '64']);
  // Not a profile file: refused, nothing added
  await page.setInputFiles('#fileImport', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"format":"other"}') });
  await expect(page.locator('.toast')).toContainText('kein Profil');
  await expect(page.locator('#profileSel option')).toHaveCount(2);
});

test('CSV: German with semicolon and decimal comma', async ({ page }) => {
  await sample(page);
  const { name, buf } = await download(page, () => page.click('#btnCsv'));
  expect(name).toBe('gesundheit-2026-10-30.csv');
  expect(buf.toString()).toBe('﻿Zeit;Gewicht (kg);Puls (/min)\r\n2026-10-28 08:00:00;80,5;\r\n2026-10-29 08:30:00;80,1;64\r\n2026-10-30 12:00:00;79,6;70\r\n');
});

test('PNG: all curves in one light image', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await sample(page);
  const { name, buf } = await download(page, () => page.click('#btnPng'));
  expect(name).toBe('gesundheit-2026-10-30.png');
  expect(buf.subarray(1, 4).toString()).toBe('PNG');
  // Size from the header: 1800 wide, 2 × (52 + 260 + 24) + 78 = 750 CSS px × 2
  expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([1800, 1500]);
  const px = await page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const count = rgb => { let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === rgb[0] && d[i + 1] === rgb[1] && d[i + 2] === rgb[2]) n++; return n; };
    return { corner: [...ctx.getImageData(0, 0, 1, 1).data], blue: count([0x2a, 0x78, 0xd6]), orange: count([0xeb, 0x68, 0x34]) };
  }, buf.toString('base64'));
  expect(px.corner).toEqual([255, 255, 255, 255]); // light even in dark mode
  expect(px.blue).toBeGreaterThan(200);
  expect(px.orange).toBeGreaterThan(200);
});

test('accessible with data, light and dark', async ({ page }) => {
  await sample(page);
  await page.clock.resume(); // axe-core needs running timers
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  }
});

test('mobile: no horizontal scrolling with 8 measurements, the table scrolls by itself', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.click('#btnNewProfile');
  for (let i = 1; i < 8; i++) await page.click('#btnAddMetric');
  await entry(page, 0).fill('1');
  await page.click('#btnSavePoint');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  expect(await page.locator('#pointsWrap').evaluate(e => e.scrollWidth > e.clientWidth)).toBe(true);
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, number format and CSV follow the language', async ({ page }) => {
    await sample(page);
    await expect(page.locator('#entryFields .lbl')).toHaveText(['Gewicht (kg)', 'Puls (/min)']);
    expect(await cells(page, 1)).toEqual(['29/10/2026, 08:30', '80.1', '64']);
    await expect(page.locator('.chart .stats').nth(0)).toHaveText('Latest 79.6 kg · Min 79.6 · Max 80.5 · Avg 80.07 · 3 values');
    const { buf } = await download(page, () => page.getByRole('button', { name: 'Save CSV' }).click());
    expect(buf.toString()).toBe('﻿Time,Gewicht (kg),Puls (/min)\r\n2026-10-28 08:00:00,80.5,\r\n2026-10-29 08:30:00,80.1,64\r\n2026-10-30 12:00:00,79.6,70\r\n');
    await page.click('#btnNewProfile');
    await expect(page.locator('#profileName')).toHaveAttribute('placeholder', 'Profile 2');
    await expect(page.locator('#entryFields .lbl')).toHaveText(['Measurement 1']);
  });
});
