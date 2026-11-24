// Markdown-Editor: formatting buttons (text and view), editing in both displays, files (history), download, share, open,
// saving straight into the file (File System Access API, with a fake picker and file handles).
import { readFileSync } from 'node:fs';
import { test, expect, openMenu, closeMenu, mockAndroidShare } from './helpers.mjs';

const raw = page => page.locator('#raw');
const view = page => page.locator('#view');
const tool = (page, k) => page.locator(`[data-tool="${k}"]`);
// Taps a formatting tool like a user: the less used ones are behind "Mehr" (#moreTools), which closes again after use
async function useTool(page, k) {
  if (await page.locator(`#toolbar [data-tool="${k}"]`).count() === 0 && await page.locator('#moreTools').isHidden()) await page.click('#btnMore');
  await tool(page, k).click();
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('markdown-editor.files.v1') || '[]'));
const select = (page, from, to) => raw(page).evaluate((el, [a, b]) => { el.focus(); el.setSelectionRange(a, b); }, [from, to]);
// The view is converted back to Markdown shortly after typing; the text display then shows it
async function rawText(page) {
  await page.locator('#views [data-v="raw"]').click();
  return raw(page).inputValue();
}

test.beforeEach(async ({ page }) => { await page.goto('/markdown-editor/'); });

test('toolbar: four tools with words and "Mehr" for the rest; the keyboard focus stays in the editor', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await page.reload();
  const main = page.locator('#toolbar > button');
  await expect(main).toHaveCount(5);
  expect(await main.evaluateAll(bs => bs.map(b => b.dataset.tool || b.id))).toEqual(['undo', 'bold', 'heading', 'ul', 'btnMore']);
  // One row, every word visible
  const ys = await main.evaluateAll(bs => bs.map(b => Math.round(b.getBoundingClientRect().y)));
  expect(new Set(ys).size).toBe(1);
  for (const l of await page.locator('#toolbar .tb-label').all()) await expect(l).toBeVisible();
  await expect(page.locator('#btnMore')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#moreTools')).toBeHidden();
  await raw(page).fill('Hallo');
  await select(page, 0, 5);
  await page.click('#btnMore');
  await expect(page.locator('#btnMore')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#moreTools [data-tool]')).toHaveCount(10);
  await expect(raw(page)).toBeFocused();                       // tapping "Mehr" keeps the keyboard open
  await page.locator('#moreTools [data-tool="italic"]').click();
  await expect(raw(page)).toHaveValue('*Hallo*');
  await expect(page.locator('#moreTools')).toBeHidden();       // closes after use
  await expect(page.locator('#btnMore')).toHaveAttribute('aria-expanded', 'false');
  await page.click('#btnMore');
  await page.keyboard.press('Escape');
  await expect(page.locator('#moreTools')).toBeHidden();
  await page.click('#btnMore');
  await page.click('#btnMore');                                // second tap closes
  await expect(page.locator('#moreTools')).toBeHidden();
});

test('formatting buttons write Markdown in the text display', async ({ page }) => {
  await raw(page).fill('Hallo Welt');
  await select(page, 6, 10);
  await useTool(page, 'bold');
  await expect(raw(page)).toHaveValue('Hallo **Welt**');
  // The selection stays on the word: a second tap removes the marks again
  await useTool(page, 'bold');
  await expect(raw(page)).toHaveValue('Hallo Welt');
  await useTool(page, 'italic');
  await expect(raw(page)).toHaveValue('Hallo *Welt*');
  // Heading cycles through levels 1–3 and off
  await useTool(page, 'heading');
  await expect(raw(page)).toHaveValue('# Hallo *Welt*');
  await useTool(page, 'heading');
  await expect(raw(page)).toHaveValue('## Hallo *Welt*');
  await useTool(page, 'heading');
  await useTool(page, 'heading');
  await expect(raw(page)).toHaveValue('Hallo *Welt*');
  // Lists over several lines, toggled off again
  await raw(page).fill('Eins\nZwei');
  await select(page, 0, 9);
  await useTool(page, 'ol');
  await expect(raw(page)).toHaveValue('1. Eins\n2. Zwei');
  await useTool(page, 'ul');
  await expect(raw(page)).toHaveValue('- Eins\n- Zwei');
  await useTool(page, 'ul');
  await expect(raw(page)).toHaveValue('Eins\nZwei');
  await select(page, 0, 0);
  await useTool(page, 'task');
  await expect(raw(page)).toHaveValue('- [ ] Eins\nZwei');
  // Link around the selected word, the address is selected for typing
  await raw(page).fill('siehe Doku');
  await select(page, 6, 10);
  await useTool(page, 'link');
  await page.keyboard.type('https://example.org');
  await expect(raw(page)).toHaveValue('siehe [Doku](https://example.org)');
  // Divider and table on their own lines
  await raw(page).fill('Text');
  await select(page, 4, 4);
  await useTool(page, 'hr');
  await expect(raw(page)).toHaveValue('Text\n\n---\n');
  await raw(page).fill('a');
  await select(page, 1, 1);
  await useTool(page, 'code');
  await expect(raw(page)).toHaveValue('a`Code`');
  // Undo goes back step by step
  await useTool(page, 'undo');
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
  await useTool(page, 'heading');
  await useTool(page, 'heading');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await useTool(page, 'bold');
  await page.keyboard.type('stark');
  await useTool(page, 'bold');
  await page.keyboard.press('Enter');
  await useTool(page, 'ul');
  await page.keyboard.type('Punkt');
  await useTool(page, 'task');
  await expect(view(page).locator('h2')).toHaveText('Titel');
  expect(await rawText(page)).toBe('## Titel\n\n**stark**\n\n- [ ] Punkt');
});

test('scripts and images from servers are not run or loaded, image addresses are kept', async ({ page }) => {
  const requests = [];
  page.on('request', r => { const u = r.url(); if ((!u.startsWith('http://localhost') && !u.startsWith('data:')) || /\/(x|bild\.png)$/.test(u)) requests.push(u); });
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
  // No HTML parser ever sees an event handler: raw HTML is defanged before parsing
  expect(await page.evaluate(() => marked.parse('<img src=x onerror="a()"><div/onclick=b() title="x"onmouseover=c()>t</div> und <b onload=d()>x</b>')))
    .not.toMatch(/<[a-z][^<>]*[\s\/"']on[a-z]+\s*=/i);
  expect(requests).toEqual([]);
});

test('pasting HTML into the view keeps formatting, drops scripts and handlers', async ({ page }) => {
  await page.locator('#views [data-v="render"]').click();
  await view(page).click();
  await view(page).evaluate(el => {
    const dt = new DataTransfer();
    dt.setData('text/html', '<h2>Kopiert</h2><p><b>fett</b> <img src="https://example.org/a.png" alt="A" onerror="window.__pwned=1"><script>window.__pwned=2</script></p>');
    dt.setData('text/plain', 'Kopiert fett');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(view(page).locator('h2')).toHaveText('Kopiert');
  await expect(view(page).locator('b, strong')).toHaveText('fett');
  expect(await view(page).evaluate(el => el.innerHTML)).not.toMatch(/onerror|<script|\ssrc=/);
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  expect(await rawText(page)).toBe('## Kopiert\n\n**fett** ![A](https://example.org/a.png)');
});

test('pasted image: backslash, brackets and quotes in alt/title are escaped', async ({ page }) => {
  await page.locator('#views [data-v="render"]').click();
  await view(page).click();
  await view(page).evaluate(el => {
    const dt = new DataTransfer();
    dt.setData('text/html', String.raw`<p><img src="https://example.org/a.png" alt="C:\x [1]" title='a\"b'></p>`);
    dt.setData('text/plain', 'Bild');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  // Each \ [ ] " gets its own backslash, so alt and title survive a round trip through Markdown
  await expect.poll(() => rawText(page)).toBe(String.raw`![C:\\x \[1\]](https://example.org/a.png "a\\\"b")`);
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

test('print / PDF: only the formatted document, named like the file; Ctrl+P fills it too', async ({ page }) => {
  await page.evaluate(() => { window.__printed = []; window.print = () => { window.__printed.push(document.title); }; });
  const title = await page.title();
  await raw(page).fill('# Bericht: Q3/2026\n\nText mit **fett**\n\n- [x] erledigt\n- [ ] offen\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<img src=x onerror="window.__bad=1">');
  await openMenu(page);
  await page.click('#btnPrint');
  // The menu is closed, the browser's print dialog was asked for with the document's name as title (PDF file name)
  expect(await page.evaluate(() => window.__printed)).toEqual(['Bericht- Q3-2026']);
  await expect(page.locator('#printDoc h1')).toHaveText('Bericht: Q3/2026');
  await expect(page.locator('#printDoc strong')).toHaveText('fett');
  await expect(page.locator('#printDoc input[type=checkbox]')).toHaveCount(2);
  await expect(page.locator('#printDoc input[type=checkbox]').first()).toBeChecked();
  await expect(page.locator('#printDoc td')).toHaveText(['1', '2']);
  await expect(page.locator('#printDoc img')).not.toHaveAttribute('src', /.+/);
  expect(await page.evaluate(() => window.__bad)).toBeUndefined();
  // Hidden on screen, alone when printing
  await expect(page.locator('#printDoc')).toBeHidden();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#printDoc')).toBeVisible();
  for (const sel of ['header', 'main', '#toolbar', 'details.help', 'footer']) await expect(page.locator(sel).first()).toBeHidden();
  // Black text also in dark mode
  await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
  expect(await page.locator('#printDoc h1').evaluate(el => getComputedStyle(el).color)).toBe('rgb(0, 0, 0)');
  const pdf = await page.pdf({ format: 'A4' });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  // After printing: title back, nothing left over
  await page.evaluate(() => dispatchEvent(new Event('afterprint')));
  expect(await page.title()).toBe(title);
  await expect(page.locator('#printDoc')).toBeEmpty();
  // Ctrl+P / browser menu: beforeprint fills it with the current text (also from the view)
  await page.emulateMedia({ media: 'screen', colorScheme: 'light' });
  await page.locator('#views [data-v="render"]').click();
  await view(page).locator('h1').evaluate(el => { el.textContent = 'Neu'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.evaluate(() => dispatchEvent(new Event('beforeprint')));
  await expect(page.locator('#printDoc h1')).toHaveText('Neu');
  expect(await page.title()).toBe('Neu');
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

test('open a file from the device (without File System Access: file input)', async ({ page }) => {
  // Firefox, Safari, iPhone: no showOpenFilePicker – the app uses <input type=file>
  await page.addInitScript(() => { delete window.showOpenFilePicker; delete window.showSaveFilePicker; });
  await page.goto('/markdown-editor/');
  await expect(page.locator('#btnSaveAs')).toBeHidden();
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

/* Fake File System Access API: files on the "disk" are handles in window.__handles; written contents land
   in window.__written. Handles from the open picker start without write permission, like in Chrome. */
async function mockFileAccess(page, { files = {}, saveName = 'Neu.md', permission = 'granted' } = {}) {
  await page.addInitScript(([files, saveName, permission]) => {
    window.__written = [];
    window.__asked = 0;
    const handle = (name, text, perm) => {
      const h = {
        kind: 'file', name, text, perm,
        getFile: async () => new File([h.text], name, { type: 'text/markdown' }),
        queryPermission: async () => h.perm,
        requestPermission: async () => { window.__asked++; return (h.perm = permission); },
        isSameEntry: async o => o === h,
        createWritable: async () => {
          if (h.perm !== 'granted') throw new DOMException('no permission', 'NotAllowedError');
          let buf = '';
          return { write: async d => { buf += d; }, close: async () => { h.text = buf; window.__written.push({ name, text: buf }); }, abort: async () => {} };
        },
      };
      return h;
    };
    window.__handles = Object.fromEntries(Object.entries(files).map(([n, t]) => [n, handle(n, t, 'prompt')]));
    window.showOpenFilePicker = async () => {
      const h = window.__handles[window.__pick];
      if (!h) throw new DOMException('cancelled', 'AbortError');
      return [h];
    };
    window.showSaveFilePicker = async o => {
      window.__suggested = o.suggestedName;
      if (!saveName) throw new DOMException('cancelled', 'AbortError');
      return (window.__handles[saveName] = handle(saveName, '', 'granted'));
    };
  }, [files, saveName, permission]);
}
const written = page => page.evaluate(() => window.__written);
const saveBtn = page => page.locator('#btnDownload');

test.describe('save into the file (File System Access)', () => {
  test('opened file is linked: the button saves back into it, a dot shows unsaved changes', async ({ page }) => {
    await mockFileAccess(page, { files: { 'Plan.md': '# Plan\r\n\r\n- eins\r\n' } });
    await page.goto('/markdown-editor/');
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Herunterladen');
    await page.evaluate(() => { window.__pick = 'Plan.md'; });
    await openMenu(page);
    await page.click('#btnOpen');
    await expect(raw(page)).toHaveValue('# Plan\n\n- eins\n');
    await expect(page.locator('#name')).toHaveValue('Plan');
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Speichern in Plan.md');
    await expect(saveBtn(page)).not.toHaveClass(/unsaved/);
    await raw(page).fill('# Plan\n\n- eins\n- zwei\n');
    await expect(saveBtn(page)).toHaveClass(/unsaved/);
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Speichern in Plan.md (ungespeicherte Änderungen)');
    // No download: the text goes into the same file, after asking for permission once
    let downloads = 0;
    page.on('download', () => downloads++);
    await saveBtn(page).click();
    await expect.poll(() => written(page)).toEqual([{ name: 'Plan.md', text: '# Plan\n\n- eins\n- zwei\n' }]);
    await expect(page.locator('.toast').last()).toContainText('Gespeichert: Plan.md');
    await expect(saveBtn(page)).not.toHaveClass(/unsaved/);
    expect(await page.evaluate(() => window.__asked)).toBe(1);
    // Edits in the view are saved as Markdown, too
    await page.locator('#views [data-v="render"]').click();
    await view(page).locator('li').last().click();
    await page.keyboard.press('End');
    await page.keyboard.type(' drei');
    await expect(saveBtn(page)).toHaveClass(/unsaved/);
    await saveBtn(page).click();
    await expect.poll(async () => (await written(page)).length).toBe(2);
    expect((await written(page))[1].text).toBe('# Plan\n\n- eins\n- zwei drei');
    expect(await page.evaluate(() => window.__asked)).toBe(1);
    expect(downloads).toBe(0);
    // Another document is not linked: the button downloads again
    await page.click('#btnNew');
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Herunterladen');
  });

  test('opening the same file again switches to its document', async ({ page }) => {
    await mockFileAccess(page, { files: { 'Plan.md': 'eins' } });
    await page.goto('/markdown-editor/');
    await page.evaluate(() => { window.__pick = 'Plan.md'; });
    await openMenu(page);
    await page.click('#btnOpen');
    await expect(raw(page)).toHaveValue('eins');
    await page.click('#btnNew');
    await raw(page).fill('andere');
    // Changed on the disk in the meantime: the document takes the new text (nothing unsaved)
    await page.evaluate(() => { window.__handles['Plan.md'].text = 'eins, geändert'; });
    await openMenu(page);
    await page.click('#btnOpen');
    await expect(raw(page)).toHaveValue('eins, geändert');
    await openMenu(page);
    await expect(page.locator('#files li .name')).toHaveText(['Plan', 'andere']);
  });

  test('save as: picks a new file, the document takes its name and stays linked; Ctrl+S saves', async ({ page }) => {
    await mockFileAccess(page, { saveName: 'Bericht final.md' });
    await page.goto('/markdown-editor/');
    await raw(page).fill('# Bericht\n\nText');
    await openMenu(page);
    await expect(page.locator('#btnSaveAs')).toBeVisible();
    await page.click('#btnSaveAs');
    await expect.poll(() => written(page)).toEqual([{ name: 'Bericht final.md', text: '# Bericht\n\nText' }]);
    expect(await page.evaluate(() => window.__suggested)).toBe('Bericht.md');
    await expect(page.locator('#name')).toHaveValue('Bericht final');
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Speichern in Bericht final.md');
    expect(await page.evaluate(() => window.__asked)).toBe(0);
    await raw(page).fill('# Bericht\n\nText 2');
    await page.keyboard.press('Control+s');
    await expect.poll(async () => (await written(page)).at(-1)).toEqual({ name: 'Bericht final.md', text: '# Bericht\n\nText 2' });
    await openMenu(page);
    await expect(page.locator('#files li .name')).toHaveText(['Bericht final']);
  });

  test('Ctrl+S on an unlinked document asks where to save; cancelling changes nothing', async ({ page }) => {
    await mockFileAccess(page, { saveName: '' });
    await page.goto('/markdown-editor/');
    await raw(page).fill('Notiz');
    await raw(page).press('Control+s');
    await expect.poll(() => page.evaluate(() => window.__suggested)).toBe('Notiz.md');
    expect(await written(page)).toEqual([]);
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Herunterladen');
    await expect(page.locator('.toast')).toHaveCount(0);
  });

  test('permission refused: a message, nothing written, the file stays linked', async ({ page }) => {
    await mockFileAccess(page, { files: { 'a.md': 'x' }, permission: 'denied' });
    await page.goto('/markdown-editor/');
    await page.evaluate(() => { window.__pick = 'a.md'; });
    await openMenu(page);
    await page.click('#btnOpen');
    await expect(raw(page)).toHaveValue('x');
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Speichern in a.md');
    await raw(page).fill('y');
    await expect(saveBtn(page)).toHaveClass(/unsaved/);
    await saveBtn(page).click();
    await expect(page.locator('.toast').last()).toContainText('nicht erlaubt');
    expect(await written(page)).toEqual([]);
    await expect(saveBtn(page)).toHaveClass(/unsaved/);
  });

  test('a file opened with the installed app ("Open with") is saved back into it', async ({ page }) => {
    await mockFileAccess(page, { files: { 'Brief.md': 'Hallo' } });
    await page.addInitScript(() => {
      Object.defineProperty(window, 'launchQueue', { configurable: true, value: {
        setConsumer(fn) { setTimeout(() => fn({ files: [window.__handles['Brief.md']], targetURL: location.href })); },
      } });
    });
    await page.goto('/markdown-editor/?opened=1');
    await expect(raw(page)).toHaveValue('Hallo');
    await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Speichern in Brief.md');
    await raw(page).fill('Hallo Welt');
    await saveBtn(page).click();
    await expect.poll(() => written(page)).toEqual([{ name: 'Brief.md', text: 'Hallo Welt' }]);
  });

  test.describe('English', () => {
    test.use({ locale: 'en-US' });
    test('labels and messages are English', async ({ page }) => {
      await mockFileAccess(page, { saveName: 'notes.md' });
      await page.goto('/markdown-editor/');
      await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Download');
      await raw(page).fill('x');
      await openMenu(page);
      await expect(page.locator('#btnSaveAs')).toHaveText('Save as …');
      await page.click('#btnSaveAs');
      await expect(page.locator('.toast').last()).toContainText('Saved: notes.md');
      await expect(saveBtn(page)).toHaveAttribute('aria-label', 'Save to notes.md');
    });
  });
});

test.describe('Mermaid diagrams', () => {
  const FLOW = 'flowchart LR\n  A[Start] --> B{Prüfen}\n  B -->|ja| C[Fertig]\n  B -->|nein| A';
  const SEQ = 'sequenceDiagram\n  Alice->>Bob: Hallo';
  const DOC = `# Ablauf\n\n\`\`\`mermaid\n${FLOW}\n\`\`\`\n\nText danach\n\n\`\`\`mermaid\n${SEQ}\n\`\`\`\n\n\`\`\`mermaid\nflowchart LR\n  A -->\n\`\`\`\n`;
  const lib = '/assets/vendor/mermaid/mermaid.min.js';

  test('drawn in the view, errors shown with the text; the library loads only for diagrams', async ({ page }) => {
    const loads = [];
    page.on('request', r => { if (r.url().endsWith(lib)) loads.push(r.url()); });
    await raw(page).fill('# Ohne Diagramm\n\n```js\nconst a = 1;\n```');
    await page.locator('#views [data-v="render"]').click();
    await expect(view(page).locator('pre code')).toHaveText('const a = 1;');
    expect(loads).toEqual([]);
    await page.locator('#views [data-v="raw"]').click();
    await raw(page).fill(DOC);
    await page.locator('#views [data-v="render"]').click();
    const blocks = view(page).locator('.mermaid-block');
    await expect(blocks.nth(0).locator('svg[role="img"]')).toHaveAttribute('aria-label', 'Diagramm');
    await expect(blocks.nth(0).locator('svg')).toContainText('Prüfen');
    await expect(blocks.nth(1).locator('svg')).toContainText('Hallo');
    await expect(blocks.nth(2).locator('.mermaid-error')).toHaveText('Das Diagramm enthält einen Fehler – hier sein Text.');
    await expect(blocks.nth(2).locator('pre code')).toHaveText('flowchart LR\n  A -->');
    for (let i = 0; i < 3; i++) await expect(blocks.nth(i)).toHaveAttribute('contenteditable', 'false');
    expect(loads).toHaveLength(1);
    // Mermaid leaves nothing behind outside the view
    expect(await page.evaluate(() => [...document.body.children].filter(e => /mmd/.test(e.id) || e.querySelector?.('[id^="mmd-"]') && !e.closest('main')).length)).toBe(0);
    // Diagram text from the file is no part of the diagnosis
    expect(await page.evaluate(() => Tools.diag.text())).not.toContain('Prüfen');
  });

  test('editing the view around a diagram keeps its Markdown exactly', async ({ page }) => {
    await raw(page).fill(DOC);
    await page.locator('#views [data-v="render"]').click();
    await expect(view(page).locator('.mermaid-block svg')).toHaveCount(2);
    await view(page).locator('h1').evaluate(el => { el.textContent = 'Neuer Ablauf'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    const md = await rawText(page);
    expect(md).toContain('# Neuer Ablauf');
    expect(md).toContain('```mermaid\n' + FLOW + '\n```');
    expect(md).toContain('```mermaid\n' + SEQ + '\n```');
    expect(md).toContain('```mermaid\nflowchart LR\n  A -->\n```');
  });

  test('dark theme draws dark diagrams; print / PDF draws them light', async ({ page }) => {
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.emulateMedia({ colorScheme: 'dark' });
    await raw(page).fill(DOC);
    await page.locator('#views [data-v="render"]').click();
    await expect(view(page).locator('.mermaid-block[data-theme="dark"] svg')).toHaveCount(2);
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(view(page).locator('.mermaid-block[data-theme="default"] svg')).toHaveCount(2);
    await page.emulateMedia({ colorScheme: 'dark' });
    await openMenu(page);
    await page.click('#btnPrint');
    await expect.poll(() => page.evaluate(() => window.__printed)).toBe(1);
    await expect(page.locator('#printDoc .mermaid-block[data-theme="default"] svg')).toHaveCount(2);
    await expect(page.locator('#printDoc .mermaid-error')).toHaveCount(1);
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await expect(page.locator('#printDoc .mermaid-block svg').first()).toBeVisible();
    const pdf = await page.pdf({ format: 'A4' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  test('works offline after it was used once', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await raw(page).fill(DOC);
    await page.locator('#views [data-v="render"]').click();
    await expect(view(page).locator('.mermaid-block svg')).toHaveCount(2);
    await context.setOffline(true);
    await page.reload();
    await expect(view(page).locator('.mermaid-block svg')).toHaveCount(2);
    await expect(view(page).locator('.mermaid-block svg').first()).toContainText('Prüfen');
    await context.setOffline(false);
  });

  test.describe('offline before the first use', () => {
    // The browser reports the failed download of the library
    test.use({ allowedProblems: /^console: Failed to load resource: net::ERR_FAILED$/ });
    test('the text with a note; drawn once the network is back', async ({ page, context }) => {
      await page.evaluate(() => navigator.serviceWorker.ready);
      await context.setOffline(true);
      await raw(page).fill('```mermaid\n' + SEQ + '\n```');
      await page.locator('#views [data-v="render"]').click();
      await expect(view(page).locator('.mermaid-error')).toHaveText('Diagramme lassen sich gerade nicht anzeigen – beim ersten Mal ist Internet nötig.');
      await expect(view(page).locator('pre code')).toHaveText(SEQ);
      expect(await rawText(page)).toBe('```mermaid\n' + SEQ + '\n```');
      await context.setOffline(false);
      await page.locator('#views [data-v="render"]').click();
      await expect(view(page).locator('.mermaid-block svg')).toContainText('Hallo');
    });
  });
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
