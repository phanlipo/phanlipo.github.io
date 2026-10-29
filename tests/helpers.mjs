// Shared test helpers.
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, allPages, meta } from '../scripts/lib.mjs';

/**
 * `page` fixture that fails the test on JavaScript errors, console errors
 * and any request to another origin (the pages must work without CDNs/trackers),
 * and on localStorage keys outside the prefixes in <meta name="tool:storage">.
 * Tests that provoke errors on purpose can allow them with one RegExp:
 *   test.use({ allowedProblems: /zxing-wasm/ });
 */
export const test = base.extend({
  allowedProblems: [null, { option: true }],
  page: async ({ page, baseURL, allowedProblems }, use) => {
    const problems = [];
    page.on('pageerror', e => problems.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('request', r => {
      const u = r.url();
      if (!u.startsWith(baseURL) && !/^(data|blob):/.test(u)) problems.push(`external request: ${u}`);
    });
    await use(page);
    // Every localStorage key must belong to a prefix the page declares in <meta name="tool:storage">,
    // otherwise the data backup would silently miss it.
    if (!page.isClosed() && page.url().startsWith(baseURL)) {
      const undeclared = await page.evaluate(() => {
        const m = document.querySelector('meta[name="tool:storage"]');
        if (!m) return [];
        const prefixes = m.content.split(',').map(s => s.trim()).filter(Boolean);
        // Shared by all apps on purpose (language choice, see AGENTS.md) – not part of any app's backup
        const shared = ['tools.lang.v1'];
        return Object.keys(localStorage).filter(k => !shared.includes(k) && !prefixes.some(p => k.startsWith(p)));
      }).catch(() => []);
      problems.push(...undeclared.map(k => `undeclared localStorage key: ${k}`));
    }
    const unexpected = problems.filter(p => !(allowedProblems && allowedProblems.test(p)));
    expect(unexpected, 'JS errors, console errors or external requests').toEqual([]);
  },
});
export { expect };

const SKIP = new Set(['assets', 'scripts', 'template', 'node_modules', 'tests']);

/** Listed tools (same rules as scripts/build.mjs) */
export function tools() {
  return allPages()
    .filter(p => p.folder && !SKIP.has(p.folder))
    .map(p => ({ ...p, html: readFileSync(join(ROOT, p.file), 'utf8') }))
    .filter(p => meta(p.html, 'tool:hidden') !== 'true' && meta(p.html, 'description'))
    .map(p => ({
      folder: p.folder,
      title: p.html.match(/<title>([\s\S]*?)<\/title>/i)[1].replace(/&amp;/g, '&'),
      titleEn: meta(p.html, 'tool:title-en'),
      descriptionEn: meta(p.html, 'tool:description-en'),
      tags: (meta(p.html, 'tool:tags') || '').split(',').map(t => t.trim()).filter(Boolean),
      features: (meta(p.html, 'tool:features') || '').split(',').map(t => t.trim()).filter(Boolean),
      webmcp: (meta(p.html, 'tool:webmcp') || '').split(',').map(t => t.trim()).filter(Boolean),
    }));
}

/** Apps that are translated (call Tools.i18n) – they show the language switch */
export function translatedApps() {
  return apps().filter(a => readFileSync(join(ROOT, a.folder, 'index.html'), 'utf8').includes('Tools.i18n('));
}

/** Installable apps: every tool plus the template */
export function apps() {
  return [...tools(), { folder: 'template', title: 'Neues Tool' }];
}

export const VIEWPORTS = {
  mobile: { width: 375, height: 800 },
  desktop: { width: 1280, height: 900 },
};

/** Page has no horizontal scrolling */
export async function expectNoHorizontalScroll(page) {
  const [scrollWidth, innerWidth] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scrollWidth, 'horizontal scrolling').toBeLessThanOrEqual(innerWidth);
}

/** Opens a <details> by its summary text (e.g. "Effekte"); scope = page or a locator */
export async function openDetails(scope, summaryText) {
  const page = typeof scope.page === 'function' ? scope.page() : scope;
  const d = scope.locator('details').filter({ has: page.locator('summary', { hasText: summaryText }) }).first();
  if (!(await d.evaluate(el => el.open))) await d.locator('summary').click();
}
