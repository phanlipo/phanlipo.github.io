// Tests against the published site (https://phanlipo.github.io/ or LIVE_URL) – `npm run test:live`.
// Compares with the local checkout, so run it on the current main after `node scripts/build.mjs`.
// The Action .github/workflows/live-test.yml runs it after every deployment and on demand.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, tools, VIEWPORTS, expectNoHorizontalScroll } from '../helpers.mjs';
import { ROOT, publishedFiles } from '../../scripts/lib.mjs';

// Query parameter bypasses the CDN cache (GitHub Pages caches up to 10 minutes)
const fresh = path => `${path}?live=${Date.now()}`;
const local = f => readFileSync(join(ROOT, f));

test('every published file is live and identical to the repository', async ({ request }) => {
  test.setTimeout(300_000);
  const files = publishedFiles();
  const wrong = [];
  for (let i = 0; i < files.length; i += 8) {
    await Promise.all(files.slice(i, i + 8).map(async f => {
      const res = await request.get(fresh(`/${f}`));
      if (res.status() !== 200) wrong.push(`${f}: HTTP ${res.status()}`);
      else if (!(await res.body()).equals(local(f))) wrong.push(`${f}: content differs from the repository`);
    }));
  }
  expect(wrong, `${files.length} files checked`).toEqual([]);
});

test('repository files and the template are not published', async ({ request }) => {
  for (const path of ['/README.md', '/AGENTS.md', '/NOTICE.md', '/LICENSE', '/package.json', '/package-lock.json',
    '/playwright.config.mjs', '/scripts/build.mjs', '/scripts/vendor.json', '/tests/server.mjs', '/template/',
    '/assets/vendor/README.md', '/assets/vendor/katex/SOURCE.md', '/.nojekyll', '/.github/workflows/pages.yml']) {
    expect((await request.get(fresh(path))).status(), path).toBe(404);
  }
});

test('served over HTTPS with the right content types', async ({ request }) => {
  const types = { '/': 'text/html', '/robots.txt': 'text/plain', '/assets/base.css': 'text/css',
    '/assets/common.js': 'javascript', '/dice-coin/manifest.webmanifest': 'manifest+json', '/icon.svg': 'image/svg+xml' };
  for (const [path, type] of Object.entries(types)) {
    const res = await request.get(fresh(path));
    expect(res.url(), path).toMatch(/^https:/);
    expect(res.headers()['content-type'], path).toContain(type);
  }
});

test.describe('start page', () => {
  test('loads cleanly, not indexed, lists every tool', async ({ page }) => {
    await page.setViewportSize(VIEWPORTS.mobile);
    await page.goto('/');
    await expect(page.locator('h1')).toHaveText('App-Regal');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    await expect(page.locator('.tool')).toHaveCount(tools().length);
    await expectNoHorizontalScroll(page);
  });
});

for (const app of tools()) {
  test.describe(app.folder, () => {
    const url = `/${app.folder}/`;
    const version = local(`${app.folder}/sw.js`).toString().match(/const VERSION = '([0-9a-f]+)'/)[1];

    test('loads cleanly on a phone, not indexed, strict CSP, current version', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.mobile);
      await page.goto(url);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page).toHaveTitle(app.title);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /default-src 'self'/);
      await expect(page.locator('footer .footer-version')).toHaveText(`Version ${version}`);
      await expectNoHorizontalScroll(page);
    });

    test('installable and works offline', async ({ page, context }) => {
      await page.goto(url);
      await page.evaluate(() => navigator.serviceWorker.ready);
      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors.map(e => e.errorId)).toEqual([]);
      await page.reload();
      expect(await page.evaluate(() => !!navigator.serviceWorker.controller), 'controlled by its service worker').toBe(true);
      await context.setOffline(true);
      await page.reload();
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.locator('footer .footer-version')).toHaveText(`Version ${version}`);
      await context.setOffline(false);
    });
  });
}
