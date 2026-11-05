// Shared test helpers.
import { test as base, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, allPages, meta } from '../scripts/lib.mjs';

/**
 * `page` fixture that fails the test on JavaScript errors, console errors
 * and any request to another origin (the pages must work without CDNs/trackers),
 * and on localStorage keys outside the prefixes in <meta name="tool:storage">.
 * Tests that provoke errors on purpose can allow them with one RegExp:
 *   test.use({ allowedProblems: /zxing-wasm/ });
 * Every page gets its own clipboard (see privateClipboard) – read it with clipboardText(page).
 */
export const test = base.extend({
  allowedProblems: [null, { option: true }],
  page: async ({ page, baseURL, allowedProblems }, use) => {
    await privateClipboard(page);
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

/**
 * Replaces navigator.clipboard with an in-memory clipboard for this page. The real one is shared by
 * all test workers running in parallel, so tests would read each other's text. Kept for the life of
 * the document (a reload empties it). Never grant 'clipboard-read'/'clipboard-write' in tests.
 */
export async function privateClipboard(page) {
  await page.addInitScript(() => {
    let text = '', items = [];
    const clipboard = {
      writeText: async t => { text = String(t); items = []; },
      readText: async () => text,
      write: async list => {
        items = [...list]; text = '';
        for (const it of items) if (it.types.includes('text/plain')) text = await (await it.getType('text/plain')).text();
      },
      read: async () => items.length ? items : [new ClipboardItem({ 'text/plain': new Blob([text], { type: 'text/plain' }) })],
      addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    };
    Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => clipboard, configurable: true });
  });
}
/** Text in the page's private clipboard */
export const clipboardText = page => page.evaluate(() => navigator.clipboard.readText());

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

/** Apps with the stage layout (<body class="stage">): help, data backup, footer and data-menu sections are in the menu */
export function stageApps() {
  // The body tag itself at the start of a line (not the hint in a comment, e.g. in the template)
  return apps().filter(a => /^<body class="[^"]*\bstage\b/m.test(readFileSync(join(ROOT, a.folder, 'index.html'), 'utf8')));
}

/** Opens the app menu (☰), so its sections (help, data backup, footer, data-menu) can be used; does nothing on pages without it */
export async function openMenu(page) {
  const btn = page.locator('.menu-btn');
  if (!(await btn.count())) return;
  if (await page.locator('#appMenu').evaluate(d => d.open)) return;
  await btn.click();
  await expect(page.locator('#appMenu')).toBeVisible();
}

/** Closes the menu again (close button), so the stage can be used */
export async function closeMenu(page) {
  if (!(await page.locator('#appMenu[open]').count())) return;
  await page.locator('#appMenu .menu-close').click();
  await expect(page.locator('#appMenu')).toBeHidden();
  // Closing goes back over the menu's history entry (asynchronous) – wait for it before navigating
  await expect.poll(() => page.evaluate(() => !(history.state && history.state.toolsMenu))).toBe(true);
}

/** Switches the language with the switch in the app menu ('de' | 'en') and closes the menu again */
export async function switchLang(page, lang) {
  await openMenu(page);
  await page.locator(`[data-set-lang="${lang}"]`).click();
  await closeMenu(page);
}

/** Web Share like Chrome on Android: share() only accepts files with a MIME type from Chrome's list
 *  (components/browser_ui/webshare, e.g. .m4a only as "audio/x-m4a") and fails otherwise with
 *  NotAllowedError – canShare() does not check the type. window.__shared collects what was shared. */
export async function mockAndroidShare(page) {
  await page.addInitScript(() => {
    const OK = ['application/pdf', 'audio/flac', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
      'audio/x-m4a', 'image/avif', 'image/bmp', 'image/gif', 'image/jpeg', 'image/png', 'image/svg+xml', 'image/tiff',
      'image/webp', 'image/x-icon', 'image/x-ms-bmp', 'image/x-xbitmap', 'text/comma-separated-values', 'text/css',
      'text/csv', 'text/html', 'text/plain', 'text/x-csv', 'video/mp4', 'video/mpeg', 'video/ogg', 'video/webm'];
    window.__shared = [];
    navigator.canShare = data => !!data && (!data.files || data.files.length > 0);
    navigator.share = async data => {
      for (const f of data.files || []) {
        if (!OK.includes(f.type)) throw new DOMException('Permission denied', 'NotAllowedError');
      }
      window.__shared.push((data.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })));
    };
  });
}

/** File handling like Chrome/Edge on the desktop ("Open with" an installed app, manifest file_handlers):
 *  the page opens as ./?opened=1 and gets the files through window.launchQueue. files: [{ name, mimeType,
 *  buffer }]; null = a launch without files. Call before page.goto(). window.__launchConsumers counts
 *  setConsumer() calls. */
export async function mockLaunchQueue(page, files) {
  const list = files && files.map(f => ({ name: f.name, type: f.mimeType, b64: Buffer.from(f.buffer).toString('base64') }));
  await page.addInitScript(list => {
    window.__launchConsumers = 0;
    const handles = (list || []).map(f => ({
      kind: 'file', name: f.name,
      getFile: async () => new File([Uint8Array.from(atob(f.b64), c => c.charCodeAt(0))], f.name, { type: f.type }),
    }));
    // Chromium has its own window.launchQueue (calls nothing outside an installed app) – replace it
    Object.defineProperty(window, 'launchQueue', { configurable: true, value: {
      setConsumer(fn) { window.__launchConsumers++; setTimeout(() => fn({ files: handles, targetURL: location.href })); },
    } });
  }, list);
}

/**
 * Accessibility check with axe-core (WCAG 2.1 A/AA): `await axe(page).analyze()`, can be narrowed
 * with `.exclude(…)`. Legacy mode runs axe directly in the page instead of opening an extra page
 * to merge results from iframes – same results, 2–3 × faster. The pages have no iframes.
 */
export const axe = page => new AxeBuilder({ page })
  .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
  .setLegacyMode(true);
