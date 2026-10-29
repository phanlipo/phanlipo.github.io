// "Diagnose kopieren" (Tools.diag in assets/common.js): every app with the button in its help – the template
// included, so new apps start with it – copies a report with app, version, browser, storage size and the log,
// never stored content.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, apps } from './helpers.mjs';
import { ROOT } from '../scripts/lib.mjs';

const withDiag = apps().filter(a => readFileSync(join(ROOT, a.folder, 'index.html'), 'utf8').includes('data-diag="copy"'));

test('the template has the troubleshooting block', () => {
  expect(withDiag.map(a => a.folder)).toContain('template');
});

async function copyReport(page) {
  await page.locator('details.help summary').click();
  await page.click('[data-diag="copy"]');
  await expect(page.locator('#toast')).toHaveText(/Diagnose kopiert|Diagnostics copied/);
  return page.evaluate(() => navigator.clipboard.readText());
}

for (const app of withDiag) {
  test(`${app.folder}: copies the diagnostics report`, async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(`/${app.folder}/`);
    const version = (await page.locator('.footer-version').textContent()).replace('Version ', '');
    const text = await copyReport(page);
    expect(text).toContain(`app: ${app.folder}\n`);
    expect(text).toContain(`version: ${version}\n`);
    for (const key of ['time', 'userAgent', 'standalone', 'language', 'online', 'serviceWorker.controller', 'registration', 'storage'])
      expect(text, key).toMatch(new RegExp(`^${key.replace('.', '\\.')}: `, 'm'));
    expect(text).toMatch(/\n\nlog:\n/);
  });
}

test('log: steps, console warnings and rejections; storage only as size, page info added', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/template/');
  await page.evaluate(() => {
    localStorage.setItem('new-tool.secret.v1', JSON.stringify({ note: 'streng-geheim' }));
    Tools.diag.log('step', { n: 1 }, new TypeError('kaputt'));
    console.warn('Achtung', 42);
  });
  await page.click('#btnDemo'); // the template logs this click and reports its counter
  const text = await copyReport(page);
  expect(text).toMatch(/^\d\d:\d\d:\d\d\.\d{3} step \{"n":1\} TypeError: kaputt$/m);
  expect(text).toMatch(/console\.warn: Achtung 42$/m);
  expect(text).toMatch(/demo clicked \{"count":1\}$/m);
  expect(text).toMatch(/^count: 1$/m);
  expect(text).toMatch(/^storage: \{"keys":2,"bytes":\d+\}$/m);
  expect(text).not.toContain('streng-geheim');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('button and message in English', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/template/');
    await expect(page.locator('[data-diag="copy"]')).toHaveText('Copy diagnostics');
    const text = await copyReport(page);
    expect(text).toContain('language: en');
  });
});
