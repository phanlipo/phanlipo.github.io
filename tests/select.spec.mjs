// Test selection for pull requests (tests/select.mjs, .github/workflows/test.yml): which tests run for
// which changed files. Titles below are written like the ones Playwright matches --grep against
// (spec file name, describe blocks, test name).
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { select, grepFor } from './select.mjs';

const matches = (sel, title) => new RegExp(grepFor(sel)).test(title);

test('documentation and generated lists need no tests', () => {
  const sel = select(['IDEAS.md', 'tests/README.md', 'NOTICE.md', 'sbom.cdx.json', '.github/workflows/zizmor.yml', 'tests/live/site.spec.mjs']);
  expect(sel.all).toBeFalsy();
  expect([sel.apps, sel.specs, sel.partial]).toEqual([[], [], []]);
});

test('shared basics, build scripts, test setup and unknown or removed folders run everything', () => {
  for (const f of ['assets/common.js', 'assets/base.css', 'scripts/build.mjs', 'scripts/vendor.json', 'tests/helpers.mjs',
    'tests/server.mjs', 'playwright.config.mjs', 'package-lock.json', '.github/workflows/test.yml', 'robots.txt',
    'removed-app/index.html', 'assets/shared/cast-receiver.html']) {
    expect(select([f]).all, f).toBe(true);
  }
  expect(select(['sea-battle/index.html', 'assets/common.js']).all).toBe(true);
});

test('an app runs its own tests, the general tests named after it, the start page and the build check', () => {
  const sel = select(['sea-battle/index.html', 'sea-battle/sw.js', 'index.html', 'tests/sea-battle.spec.mjs']);
  expect(sel.apps).toEqual(['sea-battle']);
  expect(sel.specs).toEqual([]);
  expect(matches(sel, 'sea-battle.spec.mjs two players place their ships')).toBe(true);
  expect(matches(sel, 'a11y.spec.mjs sea-battle has no accessibility violations (light)')).toBe(true);
  expect(matches(sel, 'a11y.spec.mjs start page has no accessibility violations (light)')).toBe(true);
  expect(matches(sel, 'build.spec.mjs the repository passes the build check')).toBe(true);
  expect(matches(sel, 'a11y.spec.mjs dice-coin has no accessibility violations (light)')).toBe(false);
  // whole words only: pdf-edit does not pick up pdf-edit-x or match inside another name
  const pdf = select(['pdf-edit/index.html']);
  expect(matches(pdf, 'site.spec.mjs pdf-edit-x loads cleanly')).toBe(false);
  expect(matches(pdf, 'site.spec.mjs pdf-edit loads cleanly')).toBe(true);
});

test('a general spec that uses an app as its example runs without the tests of other apps', () => {
  // menu.spec.mjs opens /dice-coin/ for the menu tests, webmcp.spec.mjs has general and per-app tests
  const sel = select(['dice-coin/index.html']);
  expect(sel.partial).toEqual(expect.arrayContaining(['menu.spec.mjs', 'webmcp.spec.mjs']));
  expect(sel.others).toContain('sea-battle');
  expect(sel.others).not.toContain('dice-coin');
  expect(matches(sel, 'menu.spec.mjs closes with Escape and the back button')).toBe(true);
  expect(matches(sel, 'webmcp.spec.mjs without WebMCP the page works and registers nothing')).toBe(true);
  expect(matches(sel, 'webmcp.spec.mjs sea-battle: registers exactly the tools in tool:webmcp')).toBe(false);
  expect(matches(sel, 'webmcp.spec.mjs dice-coin: registers exactly the tools in tool:webmcp')).toBe(true);
  expect(matches(sel, 'sea-battle.spec.mjs two players place their ships')).toBe(false);
});

test('shared scripts and libraries run the apps that cache them', () => {
  const p2p = select(['assets/shared/p2p-connect.js']);
  expect(p2p.apps).toContain('sea-battle');
  expect(p2p.apps).not.toContain('dice-coin');
  expect(p2p.specs).toEqual(['p2p-connect.spec.mjs']);
  expect(matches(p2p, 'p2p-connect.spec.mjs codes survive copying')).toBe(true);
  const pdfjs = select(['assets/vendor/pdfjs/pdf.min.mjs']);
  expect(pdfjs.apps).toEqual(expect.arrayContaining(['pdf-viewer', 'pdf-edit', 'pdf2word']));
  expect(pdfjs.apps).not.toContain('dice-coin');
});

test('test helpers and fixtures run the specs that use them', () => {
  const sel = select(['tests/pdf-tools.mjs']);
  expect(sel.apps).toEqual(expect.arrayContaining(['pdf-viewer', 'pdf-edit']));
  expect(sel.partial).toContain('webmcp.spec.mjs');
  expect(select(['tests/fixtures/photo.heic']).apps).toContain('image-converter');
  // a changed general spec runs whole
  const ui = select(['tests/ui.spec.mjs']);
  expect(ui.specs).toEqual(['ui.spec.mjs']);
  expect(matches(ui, 'ui.spec.mjs sea-battle icon buttons have a name')).toBe(true);
});

test('what build.mjs generates in every app does not select the apps', () => {
  // a new icon in the sprite changes the cache version of every app: sw.js and the footer of index.html
  const page = readFileSync(new URL('../sea-battle/index.html', import.meta.url), 'utf8');
  const before = page.replace(/(<p class="footer-version">Version )\w+/, '$1000000000000');
  expect(before).not.toBe(page);
  const files = ['sea-battle/sw.js', 'sea-battle/manifest.webmanifest', 'sea-battle/icon-192.png', 'sea-battle/index.html', 'assets/icons.svg'];
  const sel = select(files, { baseText: f => f === 'sea-battle/index.html' ? before : null });
  expect(sel.all).toBeFalsy();
  expect(sel.apps).toEqual([]);
  // a change outside the generated parts selects the app, as does a page without a previous version
  const edited = before.replace('</main>', '<p>neu</p></main>');
  expect(edited).not.toBe(before);
  expect(select(['sea-battle/index.html'], { baseText: () => edited }).apps).toEqual(['sea-battle']);
  expect(select(['sea-battle/index.html']).apps).toEqual(['sea-battle']);
});

test('with every app selected, general specs that use an app as example run whole', () => {
  const sel = select(['dice-coin/app.js']);
  const every = { ...sel, apps: [...sel.apps, ...sel.others].sort(), others: [] };
  expect(matches(every, 'menu.spec.mjs closes with Escape and the back button')).toBe(true);
});
