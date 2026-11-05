// File handling ("Open with" the installed app on Windows and other desktops) and the share target
// (Android, Edge on Windows): both come from tool:share-target. The manifest is checked for every app,
// the hand-over through window.launchQueue in assets/common.js here and per app in its own spec.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, apps, mockLaunchQueue } from './helpers.mjs';
import { ROOT, meta } from '../scripts/lib.mjs';

const withShare = apps().map(a => ({ ...a, accept: (meta(readFileSync(join(ROOT, a.folder, 'index.html'), 'utf8'), 'tool:share-target') || '')
  .split(',').map(s => s.trim()).filter(Boolean) })).filter(a => a.accept.length);

test('apps that take files are found', () => {
  expect(withShare.map(a => a.folder)).toEqual(expect.arrayContaining(['pdf-viewer', 'doc-scanner', 'securpharm-scanner', 'markdown-editor']));
});

for (const app of withShare) {
  test(`${app.folder}: manifest has share_target and file_handlers for the same extensions`, async ({ request }) => {
    const m = await (await request.get(`/${app.folder}/manifest.webmanifest`)).json();
    expect(m.share_target).toMatchObject({ action: './share-target', method: 'POST', enctype: 'multipart/form-data' });
    expect(m.share_target.params.files[0].accept).toEqual(app.accept);
    expect(m.file_handlers).toHaveLength(1);
    const h = m.file_handlers[0];
    expect(h.action).toBe('./?opened=1');
    expect(h.name).toBe(m.name);
    // Chrome: keys are MIME types without wildcards, values lists of extensions with a dot
    for (const [type, exts] of Object.entries(h.accept)) {
      expect(type).toMatch(/^[a-z]+\/[a-z0-9.+-]+$/);
      for (const e of exts) expect(e).toMatch(/^\.[a-z0-9]+$/);
    }
    const exts = Object.values(h.accept).flat().sort();
    expect(exts).toEqual(app.accept.filter(a => a.startsWith('.')).map(a => a.toLowerCase()).sort());
    expect(new Set(exts).size).toBe(exts.length);
    expect(m.launch_handler).toEqual({ client_mode: 'navigate-new' });
  });
}

test('apps without tool:share-target have neither', async ({ request }) => {
  for (const app of apps().filter(a => !withShare.some(w => w.folder === a.folder))) {
    const m = await (await request.get(`/${app.folder}/manifest.webmanifest`)).json();
    expect(m.file_handlers, app.folder).toBeUndefined();
    expect(m.launch_handler, app.folder).toBeUndefined();
  }
});

test('Tools.takeSharedFiles: files from launchQueue, once, in order; parameter removed', async ({ page }) => {
  // template has no share target – the common code is the same for every page
  await mockLaunchQueue(page, [
    { name: 'b.txt', mimeType: 'text/plain', buffer: Buffer.from('zwei') },
    { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('eins') },
  ]);
  await page.goto('/template/?opened=1#x');
  const got = await page.evaluate(async () => {
    const files = await Tools.takeSharedFiles();
    return { files: await Promise.all(files.map(async f => [f.name, f.type, await f.text()])), url: location.search + location.hash, again: (await Tools.takeSharedFiles()).length };
  });
  expect(got).toEqual({ files: [['b.txt', 'text/plain', 'zwei'], ['a.txt', 'text/plain', 'eins']], url: '#x', again: 0 });
  expect(await page.evaluate(() => window.__launchConsumers)).toBe(1);
  expect(await page.evaluate(() => Tools.diag.text())).toContain('opened with app: 2 file(s)');
});

test('Tools.takeSharedFiles: without ?opened=1 the launch queue is not used', async ({ page }) => {
  await mockLaunchQueue(page, [{ name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }]);
  await page.goto('/template/');
  expect(await page.evaluate(async () => (await Tools.takeSharedFiles()).length)).toBe(0);
  expect(await page.evaluate(() => window.__launchConsumers)).toBe(0);
});

test('Tools.takeSharedFiles: browser without launchQueue or launch without files gives none', async ({ page, context }) => {
  await page.addInitScript(() => { delete Window.prototype.launchQueue; delete window.launchQueue; });
  await page.goto('/template/?opened=1');
  expect(await page.evaluate(() => 'launchQueue' in window)).toBe(false);
  const t0 = Date.now();
  expect(await page.evaluate(async () => [(await Tools.takeSharedFiles()).length, location.search])).toEqual([0, '']);
  expect(Date.now() - t0).toBeLessThan(2000);   // no waiting for a queue that does not exist
  const p2 = await context.newPage();
  await mockLaunchQueue(p2, null);
  await p2.goto('/template/?opened=1');
  expect(await p2.evaluate(async () => (await Tools.takeSharedFiles()).length)).toBe(0);
});
