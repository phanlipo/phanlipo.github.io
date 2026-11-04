// Markdown-Editor: formatting buttons (text and view), editing in both displays, files (history), download, share, open.
import { readFileSync } from 'node:fs';
import { test, expect, openMenu, closeMenu, mockAndroidShare } from './helpers.mjs';

const raw = page => page.locator('#raw');
const view = page => page.locator('#view');
const tool = (page, k) => page.locator(`#toolbar [data-tool="${k}"]`);
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('markdown-editor.files.v1') || '[]'));
const select = (page, from, to) => raw(page).evaluate((el, [a, b]) => { el.focus(); el.setSelectionRange(a, b); }, [from, to]);
// The view is converted back to Markdown shortly after typing; the text display then shows it
async function rawText(page) {
  await page.locator('#views [data-v="raw"]').click();
  return raw(page).inputValue();
}

test.beforeEach(async ({ page }) => { await page.goto('/markdown-editor/'); });

test('formatting buttons write Markdown in the text display', async ({ page }) => {
  await raw(page).fill('Hallo Welt');
  await select(page, 6, 10);
  await tool(page, 'bold').click();
  await expect(raw(page)).toHaveValue('Hallo **Welt**');
  // The selection stays on the word: a second tap removes the marks again
  await tool(page, 'bold').click();
  await expect(raw(page)).toHaveValue('Hallo Welt');
  await tool(page, 'italic').click();
  await expect(raw(page)).toHaveValue('Hallo *Welt*');
  // Heading cycles through levels 1–3 and off
  await tool(page, 'heading').click();
  await expect(raw(page)).toHaveValue('# Hallo *Welt*');
  await tool(page, 'heading').click();
  await expect(raw(page)).toHaveValue('## Hallo *Welt*');
  await tool(page, 'heading').click();
  await tool(page, 'heading').click();
  await expect(raw(page)).toHaveValue('Hallo *Welt*');
  // Lists over several lines, toggled off again
  await raw(page).fill('Eins\nZwei');
  await select(page, 0, 9);
  await tool(page, 'ol').click();
  await expect(raw(page)).toHaveValue('1. Eins\n2. Zwei');
  await tool(page, 'ul').click();
  await expect(raw(page)).toHaveValue('- Eins\n- Zwei');
  await tool(page, 'ul').click();
  await expect(raw(page)).toHaveValue('Eins\nZwei');
  await select(page, 0, 0);
  await tool(page, 'task').click();
  await expect(raw(page)).toHaveValue('- [ ] Eins\nZwei');
  // Link around the selected word, the address is selected for typing
  await raw(page).fill('siehe Doku');
  await select(page, 6, 10);
  await tool(page, 'link').click();
  await page.keyboard.type('https://example.org');
  await expect(raw(page)).toHaveValue('siehe [Doku](https://example.org)');
  // Divider and table on their own lines
  await raw(page).fill('Text');
  await select(page, 4, 4);
  await tool(page, 'hr').click();
  await expect(raw(page)).toHaveValue('Text\n\n---\n');
  await raw(page).fill('a');
  await select(page, 1, 1);
  await tool(page, 'code').click();
  await expect(raw(page)).toHaveValue('a`Code`');
  // Undo goes back step by step
  await tool(page, 'undo').click();
  await expect(raw(page)).toHaveValue('a');
});

test('Enter continues lists and ends them on an empty item', async ({ page }) => {
  await raw(page).click();
  await page.keyboard.type('- [x] Milch');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Brot');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(raw(page)).toHaveValue('- [x] Milch\n- [ ] Brot\n');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('b');
  await expect(raw(page)).toHaveValue('- [x] Milch\n- [ ] Brot\n\n1. a\n2. b');
});

test('view shows the formatted text and edits there come back as Markdown', async ({ page }) => {
  const md = '# Einkauf\n\nText mit **fett**, *kursiv* und ~~weg~~.\n\n- [ ] Milch\n- [x] Brot\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nlet x = 1;\n```';
  await raw(page).fill(md);
  await page.locator('#views [data-v="render"]').click();
  await expect(raw(page)).toBeHidden();
  await expect(view(page).locator('h1')).toHaveText('Einkauf');
  await expect(view(page).locator('strong')).toHaveText('fett');
  await expect(view(page).locator('em')).toHaveText('kursiv');
  await expect(view(page).locator('del')).toHaveText('weg');
  await expect(view(page).locator('td')).toHaveText(['1', '2']);
  await expect(view(page).locator('pre code')).toHaveText('let x = 1;');
  // Ticking a task
  await view(page).locator('input[type=checkbox]').first().click();
  await expect.poll(async () => (await stored(page))[0].text).toContain('- [x] Milch');
  // Typing in the view
  await view(page).locator('h1').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' heute');
  const back = await rawText(page);
  expect(back).toBe('# Einkauf heute\n\nText mit **fett**, *kursiv* und ~~weg~~.\n\n- [x] Milch\n- [x] Brot\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```js\nlet x = 1;\n```');
  // The choice of display is kept
  await page.locator('#views [data-v="render"]').click();
  await page.reload();
  await expect(view(page)).toBeVisible();
  await expect(view(page).locator('h1')).toHaveText('Einkauf heute');
});

test('formatting buttons work in the view', async ({ page }) => {
  await page.locator('#views [data-v="render"]').click();
  await view(page).click();
  await page.keyboard.type('Titel');
  await tool(page, 'heading').click();
  await tool(page, 'heading').click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await tool(page, 'bold').click();
  await page.keyboard.type('stark');
  await tool(page, 'bold').click();
  await page.keyboard.press('Enter');
  await tool(page, 'ul').click();
  await page.keyboard.type('Punkt');
  await tool(page, 'task').click();
  await expect(view(page).locator('h2')).toHaveText('Titel');
  expect(await rawText(page)).toBe('## Titel\n\n**stark**\n\n- [ ] Punkt');
});

test('scripts and images from servers are not run or loaded, image addresses are kept', async ({ page }) => {
  const requests = [];
  page.on('request', r => { if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:')) requests.push(r.url()); });
  await page.route('**/bild.png', r => { requests.push(r.request().url()); return r.abort(); });
  await raw(page).fill('Bild: ![Katze](https://example.org/katze.png) ![x](bild.png)\n\n<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>\n\n[böse](javascript:window.__pwned=3)');
  await page.locator('#views [data-v="render"]').click();
  await expect(view(page).locator('img')).toHaveCount(3);
  await expect(view(page).locator('img').first()).not.toHaveAttribute('src', /.*/);
  await expect(view(page).locator('script')).toHaveCount(0);
  await view(page).locator('a').click({ modifiers: [] });
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await view(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' ok');
  const md = await rawText(page);
  expect(md).toContain('![Katze](https://example.org/katze.png)');
  expect(md).toContain('![x](bild.png)');
  expect(md).not.toContain('onerror');
  expect(requests).toEqual([]);
});

test('files: new, list in the menu, open, delete – kept after reload', async ({ page }) => {
  await raw(page).fill('# Erste\n\nHallo');
  await expect(page.locator('#name')).toHaveAttribute('placeholder', 'Erste');
  await page.click('#btnNew');
  await expect(raw(page)).toHaveValue('');
  await raw(page).fill('Zweite Notiz');
  await page.locator('#name').fill('Notiz');
  await expect.poll(async () => (await stored(page)).length).toBe(2);
  await page.reload();
  await expect(raw(page)).toHaveValue('Zweite Notiz');
  await expect(page.locator('#name')).toHaveValue('Notiz');
  await openMenu(page);
  const items = page.locator('#files li');
  await expect(items.locator('.name')).toHaveText(['Notiz', 'Erste']);
  await expect(items.first()).toHaveClass(/current/);
  await expect(items.nth(1).locator('.meta')).toContainText('14 Zeichen');
  await items.nth(1).locator('.open').click();
  await expect(page.locator('dialog.menu')).toBeHidden();
  await expect(raw(page)).toHaveValue('# Erste\n\nHallo');
  // Delete the open file: the other one opens
  await openMenu(page);
  page.once('dialog', d => d.accept());
  await page.locator('#files li', { hasText: 'Erste' }).locator('[data-act="delete"]').click();
  await expect(page.locator('#files li .name')).toHaveText(['Notiz']);
  await closeMenu(page);
  await expect(raw(page)).toHaveValue('Zweite Notiz');
  // An empty new file is not kept in the list once you leave it
  await page.click('#btnNew');
  await page.click('#btnNew');
  await openMenu(page);
  await expect(page.locator('#files li .name')).toHaveText(['Unbenannt', 'Notiz']);
  await page.locator('#files li', { hasText: 'Notiz' }).locator('.open').click();
  await openMenu(page);
  await expect(page.locator('#files li .name')).toHaveText(['Notiz']);
});

test('download saves the file as .md with its text', async ({ page }) => {
  await raw(page).fill('# Bericht: Q3/2026\n\nInhalt äöü');
  const dl = page.waitForEvent('download');
  await page.click('#btnDownload');
  const d = await dl;
  expect(d.suggestedFilename()).toBe('Bericht- Q3-2026.md');
  expect(readFileSync(await d.path(), 'utf8')).toBe('# Bericht: Q3/2026\n\nInhalt äöü');
  // From the file list, with the given name
  await page.locator('#name').fill('notizen.txt');
  await openMenu(page);
  const dl2 = page.waitForEvent('download');
  await page.locator('#files li').first().locator('[data-act="download"]').click();
  expect((await dl2).suggestedFilename()).toBe('notizen.txt');
});

test.describe('share', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 800 } });
  test('shares the file as text/plain .md (Chrome on Android)', async ({ page }) => {
    await mockAndroidShare(page);
    await page.goto('/markdown-editor/');
    await raw(page).fill('# Liste\n\n- a');
    await expect(page.locator('#btnShare')).toBeVisible();
    await page.click('#btnShare');
    await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([[{ name: 'Liste.md', type: 'text/plain', size: 12 }]]);
    await openMenu(page);
    await page.locator('#files li').first().locator('[data-act="share"]').click();
    await expect.poll(() => page.evaluate(() => window.__shared.length)).toBe(2);
  });
  test('without file sharing the text itself is shared', async ({ page }) => {
    await page.addInitScript(() => {
      window.__shared = [];
      navigator.canShare = () => false;
      navigator.share = async d => { window.__shared.push(d); };
    });
    await page.goto('/markdown-editor/');
    await raw(page).fill('Nur Text');
    await page.click('#btnShare');
    await expect.poll(() => page.evaluate(() => window.__shared)).toEqual([{ title: 'Nur Text', text: 'Nur Text' }]);
  });
});

test('no share button without Web Share', async ({ page }) => {
  await page.addInitScript(() => { delete Navigator.prototype.share; });
  await page.goto('/markdown-editor/');
  await expect(page.locator('#btnShare')).toBeHidden();
});

test('open a file from the device', async ({ page }) => {
  await raw(page).fill('vorher');
  await openMenu(page);
  const chooser = page.waitForEvent('filechooser');
  await page.click('#btnOpen');
  await (await chooser).setFiles({ name: 'Plan.md', mimeType: 'text/markdown', buffer: Buffer.from('﻿# Plan\r\n\r\n- eins\r\n') });
  await expect(raw(page)).toHaveValue('# Plan\n\n- eins\n');
  await expect(page.locator('#name')).toHaveValue('Plan');
  await openMenu(page);
  await expect(page.locator('#files li .name')).toHaveText(['Plan', 'vorher']);
});

test('works offline after the first visit', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await raw(page).fill('**offline**');
  await page.locator('#views [data-v="render"]').click();
  await expect(view(page).locator('strong')).toHaveText('offline');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts and generated names are English', async ({ page }) => {
    await expect(page.locator('#views [data-v="render"]')).toHaveText('View');
    await expect(tool(page, 'bold')).toHaveAttribute('aria-label', 'Bold');
    await expect(page.locator('#name')).toHaveAttribute('placeholder', 'Untitled');
    await raw(page).fill('x');
    await openMenu(page);
    await expect(page.locator('#files li .meta').first()).toContainText('1 character');
  });
});
