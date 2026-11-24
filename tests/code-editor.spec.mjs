// Code-Editor: start screen, opening any text file (encodings, line endings, binary files refused), language
// detection and highlighting (also languages loaded on demand, offline), the coloured copy lying exactly under the
// textarea, view/edit, find & replace, go to line, indenting, JSON format, files (history), download in the
// file's own encoding, settings, English. Logic without DOM (text-files.js) is checked in the page.
import { readFileSync } from 'node:fs';
import { test, expect, openMenu, closeMenu, openSettings, onDialog, clipboardText, axe } from './helpers.mjs';

const code = page => page.locator('#code');
const hl = page => page.locator('#hlCode');
const tool = (page, k) => page.locator(`[data-tool="${k}"]`);
async function useTool(page, k) {
  if (await page.locator(`#toolbar [data-tool="${k}"]`).count() === 0 && await page.locator('#moreTools').isHidden()) await page.click('#btnMore');
  await tool(page, k).click();
}
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('code-editor.files.v1') || '[]'));
async function openFile(page, name, content, mimeType = 'text/plain') {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
  await page.setInputFiles('#fileInput', { name, mimeType, buffer });
}
// Opens a file from the start screen (the input lies in the dropzone) or, once a file is open, from the same input
async function blank(page) {
  await page.click('#btnBlank');
  await expect(code(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => { await page.goto('/code-editor/'); });

test('first start shows only the file choice; an empty file starts in edit mode', async ({ page }) => {
  await expect(page.locator('#start')).toBeVisible();
  await expect(page.locator('#work')).toBeHidden();
  await expect(page.locator('#drop')).toContainText('Datei öffnen');
  await blank(page);
  await expect(page.locator('#work')).toBeVisible();
  await expect(page.locator('#modes [data-m="edit"]')).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.type('echo hallo');
  await page.locator('#name').fill('run.sh');
  await expect(hl(page).locator('.hljs-built_in')).toHaveText('echo');
  await page.reload();
  await expect(page.locator('#work')).toBeVisible();
  await expect(code(page)).toHaveValue('echo hallo');
  await expect(page.locator('#name')).toHaveValue('run.sh');
});

test('opens a Python file: view mode, highlighting, line numbers, language from the extension', async ({ page }) => {
  await openFile(page, 'demo.py', 'import os\n\ndef hello(name):\n    # Gruß\n    return "Hallo " + name\n');
  await expect(page.locator('#toast')).toHaveText('Geöffnet: demo.py');
  await expect(page.locator('#work')).toBeVisible();
  await expect(page.locator('#name')).toHaveValue('demo.py');
  await expect(page.locator('#modes [data-m="view"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(code(page)).toHaveJSProperty('readOnly', true);
  await expect(hl(page)).toHaveClass(/language-python/);
  await expect(hl(page).locator('.hljs-keyword').first()).toHaveText('import');
  await expect(hl(page).locator('.hljs-comment')).toHaveText('# Gruß');
  await expect(hl(page).locator('.hljs-string')).toHaveText('"Hallo "');
  // 5 lines and the empty one after the last line break, like the textarea shows it
  await expect(page.locator('#gutter')).toHaveText('1\n2\n3\n4\n5\n6\n');
  await expect(tool(page, 'lang')).toHaveAttribute('aria-label', 'Sprache & Format: Python');
  // The coloured copy has exactly the same text as the textarea
  expect(await hl(page).textContent()).toBe(await code(page).inputValue() + '\n');
  await page.click('#modes [data-m="edit"]');
  await expect(code(page)).toHaveJSProperty('readOnly', false);
  await expect(code(page)).toBeFocused();
});

test('the coloured text lies exactly under the textarea (no own scrolling, same size), with and without wrapping', async ({ page }) => {
  const long = 'x = "' + 'sehr lang '.repeat(40) + '"';
  await openFile(page, 'a.py', `# Titel\n${long}\n\tif x:\n\t\tpass\n` + 'y = 1\n'.repeat(80));
  const metrics = () => page.evaluate(() => {
    const c = document.getElementById('code'), h = document.getElementById('hl');
    const cr = c.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const cs = getComputedStyle(c), hs = getComputedStyle(h);
    return { dw: Math.abs(cr.width - hr.width), dh: Math.abs(cr.height - hr.height), dx: Math.abs(cr.left - hr.left), dy: Math.abs(cr.top - hr.top),
      ownScrollY: c.scrollHeight - c.clientHeight, ownScrollX: c.scrollWidth - c.clientWidth,
      same: ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingLeft', 'whiteSpace', 'tabSize', 'letterSpacing'].filter(k => cs[k] !== hs[k]),
      page: document.documentElement.scrollWidth };
  });
  for (const wrap of [false, true]) {
    if (wrap) await useTool(page, 'wrap');
    const m = await metrics();
    expect(m.same, `wrap ${wrap}: different styles`).toEqual([]);
    expect(m.dw + m.dh + m.dx + m.dy, `wrap ${wrap}: position/size`).toBeLessThan(1.5);
    expect(m.ownScrollY, `wrap ${wrap}: textarea scrolls itself`).toBeLessThanOrEqual(1);
    expect(m.ownScrollX, `wrap ${wrap}: textarea scrolls itself`).toBeLessThanOrEqual(1);
    expect(m.page).toBeLessThanOrEqual(1280);
  }
  // Wrapping hides the line numbers (they would not match the wrapped lines)
  await expect(page.locator('#gutter')).toBeHidden();
  await expect(tool(page, 'wrap')).toHaveAttribute('aria-pressed', 'true');
});

test('typing in edit mode: colours follow every key, Tab/Shift+Tab, Enter keeps the indentation, undo', async ({ page }) => {
  await openFile(page, 'x.js', 'function f() {\n  return 1;\n}\n');
  await page.click('#modes [data-m="edit"]');
  // The file indents with 2 spaces
  await code(page).evaluate(el => el.setSelectionRange(14, 14));     // after "{"
  await page.keyboard.press('Enter');
  await page.keyboard.type('let a');
  await expect(code(page)).toHaveValue('function f() {\nlet a\n  return 1;\n}\n');
  await page.keyboard.press('Home');
  await page.keyboard.press('Tab');
  await expect(code(page)).toHaveValue('function f() {\n  let a\n  return 1;\n}\n');
  await expect(hl(page).locator('.hljs-keyword', { hasText: 'let' })).toHaveCount(1);
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('a++');
  await expect(code(page)).toHaveValue('function f() {\n  let a\n  a++\n  return 1;\n}\n');
  // Several lines
  await code(page).evaluate(el => el.setSelectionRange(0, el.value.length));
  await page.keyboard.press('Shift+Tab');
  await expect(code(page)).toHaveValue('function f() {\nlet a\na++\nreturn 1;\n}\n');
  await useTool(page, 'indent');
  await expect(code(page)).toHaveValue('  function f() {\n  let a\n  a++\n  return 1;\n  }\n');
  await useTool(page, 'outdent');
  await useTool(page, 'undo');
  await expect(code(page)).toHaveValue('  function f() {\n  let a\n  a++\n  return 1;\n  }\n');
  // Esc, then Tab leaves the text field
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await expect(code(page)).not.toBeFocused();
  await expect.poll(async () => (await stored(page))[0].text).toBe('  function f() {\n  let a\n  a++\n  return 1;\n  }\n');
});

test('language detection: file names, first line, content; chosen by hand; loaded on demand', async ({ page }) => {
  const lang = () => page.evaluate(() => (document.getElementById('hlCode').className.match(/language-(\S+)/) || [])[1] || null);
  await openFile(page, 'Makefile', 'all:\n\tcc -o app main.c\n');
  await expect.poll(lang).toBe('makefile');
  await openFile(page, 'deploy', '#!/usr/bin/env bash\nset -e\necho ok\n');
  await expect.poll(lang).toBe('bash');
  await openFile(page, 'daten', '{"a": [1, 2, {"b": null}]}');
  await expect.poll(lang).toBe('json');
  await openFile(page, 'notes.txt', 'Einfach nur Text.');
  await expect.poll(lang).toBe(null);
  await expect(hl(page)).toHaveText('Einfach nur Text.');
  // Dockerfile: grammar loaded from languages/ only now
  expect(await page.evaluate(() => !!hljs.getLanguage('dockerfile'))).toBe(false);
  await openFile(page, 'Dockerfile', 'FROM node:22\nRUN npm ci\n');
  await expect.poll(lang).toBe('dockerfile');
  await expect(hl(page).locator('.hljs-keyword').first()).toHaveText('FROM');
  // Renaming the file changes the colours
  await page.click('#modes [data-m="edit"]');
  await page.locator('#name').fill('main.c');
  await expect.poll(lang).toBe('c');
  // By hand in "Sprache & Format" – kept after a reload
  await tool(page, 'lang').click();
  await expect(page.locator('#fmtDlg')).toBeVisible();
  await expect(page.locator('#fmtLang option[value="auto"]')).toHaveText('Automatisch (C)');
  await page.locator('#fmtLang').selectOption('sql');
  await expect.poll(lang).toBe('sql');
  await expect(page.locator('#fmtInfo')).toContainText('2 Zeilen');
  await page.locator('#fmtDlg .btn.primary').click();
  await expect(page.locator('#fmtDlg')).toBeHidden();
  await page.reload();
  await expect.poll(lang).toBe('sql');
  await expect(tool(page, 'lang')).toHaveAttribute('aria-label', 'Sprache & Format: SQL');
});

test('TextFiles: detection, indentation, decoding and encoding (independent expectations)', async ({ page }) => {
  const r = await page.evaluate(() => {
    const T = window.TextFiles;
    const enc = (s, e, l) => Array.from(T.encode(s, e, l));
    const dec = a => { try { return T.decode(new Uint8Array(a)); } catch (e) { return e.message; } };
    return {
      detect: ['a.PY', 'x/y/CMakeLists.txt', 'Dockerfile.dev', 'docker-compose.yml', '.env.local', '.gitignore', 'a.tsx', 'b.hpp', 'web.config', 'x.unknown', '']
        .map(n => T.detect(n, '')),
      shebang: [T.detect('x', '#!/usr/bin/python3\n'), T.detect('', '#!/bin/sh'), T.detect('', '<?xml version="1.0"?>'), T.detect('', 'hallo')],
      indent: [T.indentUnit('a\n\tb\n\t\tc'), T.indentUnit('a:\n  b\n    c\n  d'), T.indentUnit('a\n    b\n        c'), T.indentUnit('')],
      utf8: dec([0x61, 0xC3, 0xA4, 0x0D, 0x0A, 0x62]),
      bom: dec([0xEF, 0xBB, 0xBF, 0x78]),
      u16: dec([0xFF, 0xFE, 0x61, 0x00, 0x0A, 0x00]),
      u16be: dec([0xFE, 0xFF, 0x00, 0x61]),
      latin: dec([0x47, 0x72, 0xFC, 0xDF, 0x80]),
      cr: dec([0x61, 0x0D, 0x62]),
      binary: dec([0x89, 0x50, 0x4E, 0x47, 0x00, 0x01]),
      control: dec([1, 2, 3, 4, 5, 6, 7, 8, 0x61]),
      outUtf8: enc('ä\nb', 'utf-8', 'crlf'),
      outBom: enc('x', 'utf-8-bom', 'lf'),
      outU16: enc('a\n', 'utf-16le', 'lf'),
      outU16be: enc('a', 'utf-16be', 'lf'),
      outLatin: enc('Grüß€\u4e2d', 'windows-1252', 'cr'),
      lossy: [T.lossy('Grüß€\u4e2d', 'windows-1252'), T.lossy('\u4e2d', 'utf-8')],
    };
  });
  expect(r.detect).toEqual(['python', 'cmake', 'dockerfile', 'yaml', 'ini', 'bash', 'typescript', 'cpp', 'xml', null, null]);
  expect(r.shebang).toEqual(['python', 'bash', 'xml', null]);
  expect(r.indent).toEqual(['\t', '  ', '    ', '    ']);
  expect(r.utf8).toEqual({ text: 'aä\nb', encoding: 'utf-8', eol: 'crlf' });
  expect(r.bom).toEqual({ text: 'x', encoding: 'utf-8-bom', eol: 'lf' });
  expect(r.u16).toEqual({ text: 'a\n', encoding: 'utf-16le', eol: 'lf' });
  expect(r.u16be).toEqual({ text: 'a', encoding: 'utf-16be', eol: 'lf' });
  expect(r.latin).toEqual({ text: 'Grüß€', encoding: 'windows-1252', eol: 'lf' });
  expect(r.cr).toEqual({ text: 'a\nb', encoding: 'utf-8', eol: 'cr' });
  expect(r.binary).toBe('binary');
  expect(r.control).toBe('binary');
  expect(r.outUtf8).toEqual([0xC3, 0xA4, 0x0D, 0x0A, 0x62]);
  expect(r.outBom).toEqual([0xEF, 0xBB, 0xBF, 0x78]);
  expect(r.outU16).toEqual([0xFF, 0xFE, 0x61, 0x00, 0x0A, 0x00]);
  expect(r.outU16be).toEqual([0xFE, 0xFF, 0x00, 0x61]);
  expect(r.outLatin).toEqual([0x47, 0x72, 0xFC, 0xDF, 0x80, 0x3F]);
  expect(r.lossy).toEqual([1, 0]);
});

test('binary and too big files are refused; several files at once', async ({ page }) => {
  await openFile(page, 'bild.png', Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0x0D]), 'image/png');
  await expect(page.locator('#toast')).toHaveText('bild.png: keine Textdatei (z. B. Bild, PDF oder Archiv).');
  await expect(page.locator('#start')).toBeVisible();
  await openFile(page, 'gross.log', Buffer.alloc(2 * 1024 * 1024 + 1, 0x61));
  await expect(page.locator('#toast')).toHaveText('gross.log: zu groß (höchstens 2 MB).');
  await page.setInputFiles('#fileInput', [
    { name: 'a.json', mimeType: 'application/json', buffer: Buffer.from('{}') },
    { name: 'b.yaml', mimeType: 'application/yaml', buffer: Buffer.from('a: 1') },
  ]);
  await expect(page.locator('#toast')).toHaveText('2 Dateien geöffnet');
  await expect(page.locator('#name')).toHaveValue('b.yaml');
  await openMenu(page);
  await expect(page.locator('#files li .name')).toHaveText(['b.yaml', 'a.json']);
  await expect(page.locator('#files li .meta').first()).toContainText('1 Zeile · YAML · geöffnet');
});

test('download keeps name, encoding and line endings; changed encoding is used', async ({ page }) => {
  const original = Buffer.from([0x47, 0x72, 0xFC, 0xDF, 0x65, 0x0D, 0x0A, 0x78, 0x0D, 0x0A]);   // "Grüße\r\nx\r\n" in Windows-1252
  await openFile(page, 'alt.ini', original);
  await expect(code(page)).toHaveValue('Grüße\nx\n');
  let dl = page.waitForEvent('download');
  await page.click('#btnDownload');
  let d = await dl;
  expect(d.suggestedFilename()).toBe('alt.ini');
  expect(readFileSync(await d.path())).toEqual(original);
  // Characters Windows-1252 cannot store: warned in the dialog, switched to UTF-8 with LF
  await page.click('#modes [data-m="edit"]');
  await code(page).evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
  await page.keyboard.type('中');
  await tool(page, 'lang').click();
  await expect(page.locator('#fmtEnc')).toHaveValue('windows-1252');
  await expect(page.locator('#fmtEol')).toHaveValue('crlf');
  await expect(page.locator('#fmtInfo')).toContainText('1 Zeichen passen nicht in Windows-1252');
  await page.locator('#fmtEnc').selectOption('utf-8');
  await page.locator('#fmtEol').selectOption('lf');
  await expect(page.locator('#fmtInfo')).not.toContainText('Windows-1252');
  await page.keyboard.press('Escape');
  dl = page.waitForEvent('download');
  await page.click('#btnDownload');
  d = await dl;
  expect(readFileSync(await d.path(), 'utf8')).toBe('Grüße\nx\n中');
});

test('find and replace: count, next/previous, replace one and all; read-only view only finds', async ({ page }) => {
  await openFile(page, 'n.txt', 'Apfel, Birne, apfel\nAPFEL und Kirsche');
  await tool(page, 'find').click();
  await expect(page.locator('#findText')).toBeFocused();
  await expect(page.locator('#replaceRow')).toBeHidden();
  await page.locator('#findText').fill('apfel');
  await expect(page.locator('#findCount')).toHaveText('1/3');
  await expect(page.locator('#hits i.cur')).toHaveCount(1);
  await expect(page.locator('#hits i')).toHaveCount(3);
  await page.keyboard.press('Enter');
  await expect(page.locator('#findCount')).toHaveText('2/3');
  expect(await code(page).evaluate(el => [el.selectionStart, el.selectionEnd])).toEqual([14, 19]);
  await page.click('#findNext');
  await expect(page.locator('#findCount')).toHaveText('3/3');
  await page.click('#findNext');
  await expect(page.locator('#findCount')).toHaveText('1/3');
  await page.click('#findPrev');
  await expect(page.locator('#findCount')).toHaveText('3/3');
  await page.locator('#findText').fill('Pflaume');
  await expect(page.locator('#findCount')).toHaveText('Kein Treffer');
  // Replace while editing
  await page.click('#modes [data-m="edit"]');
  await expect(page.locator('#replaceRow')).toBeVisible();
  await code(page).evaluate(el => el.setSelectionRange(0, 0));
  await page.locator('#findText').fill('apfel');
  await page.locator('#replText').fill('Pfirsich');
  await expect(page.locator('#findCount')).toHaveText('1/3');
  await page.click('#btnRepl');
  await expect(code(page)).toHaveValue('Pfirsich, Birne, apfel\nAPFEL und Kirsche');
  await expect(page.locator('#findCount')).toHaveText('1/2');
  await page.click('#btnReplAll');
  await expect(code(page)).toHaveValue('Pfirsich, Birne, Pfirsich\nPfirsich und Kirsche');
  await expect(page.locator('#toast')).toHaveText('2× ersetzt');
  await expect(page.locator('#findCount')).toHaveText('Kein Treffer');
  await page.keyboard.press('Control+z');
  await expect(code(page)).toHaveValue('Pfirsich, Birne, apfel\nAPFEL und Kirsche');
  await page.locator('#findClose').click();
  await expect(page.locator('#find')).toBeHidden();
  await expect(page.locator('#hits i')).toHaveCount(0);
  // Ctrl+F opens it with the selection
  await code(page).evaluate(el => { el.focus(); el.setSelectionRange(0, 8); });
  await page.keyboard.press('Control+f');
  await expect(page.locator('#findText')).toHaveValue('Pfirsich');
});

test('go to line scrolls the line into view; copy copies the whole file', async ({ page }) => {
  const text = Array.from({ length: 300 }, (_, i) => `Zeile ${i + 1}`).join('\n');
  await openFile(page, 'lang.txt', text);
  await onDialog(page, d => d.accept('250'));
  await tool(page, 'goto').click();
  await expect.poll(() => page.locator('#scroller').evaluate(el => el.scrollTop)).toBeGreaterThan(1000);
  const pos = await code(page).evaluate(el => el.selectionStart);
  expect(text.slice(pos, pos + 9)).toBe('Zeile 250');
  // The line is inside the visible part of the scroll box
  const vis = await page.evaluate(p => {
    const s = document.getElementById('scroller'), r = document.createRange(), t = document.getElementById('hlCode').firstChild;
    r.setStart(t, p); r.setEnd(t, p + 1);
    const a = r.getBoundingClientRect(), b = s.getBoundingClientRect();
    return a.top >= b.top && a.bottom <= b.bottom;
  }, pos);
  expect(vis).toBe(true);
  await tool(page, 'copy').click();
  await expect(page.locator('#toast')).toHaveText('Kopiert');
  expect(await clipboardText(page)).toBe(text);
});

test('JSON: "Formatieren" lays it out, invalid JSON is reported', async ({ page }) => {
  await openFile(page, 'd.json', '{"a":[1,2],"b":{"c":"ä"}}\n');
  await page.click('#modes [data-m="edit"]');
  await useTool(page, 'format');
  await expect(code(page)).toHaveValue('{\n    "a": [\n        1,\n        2\n    ],\n    "b": {\n        "c": "ä"\n    }\n}\n');
  await useTool(page, 'undo');
  await expect(code(page)).toHaveValue('{"a":[1,2],"b":{"c":"ä"}}\n');
  await code(page).fill('{"a":}');
  await useTool(page, 'format');
  await expect(page.locator('#toast')).toContainText('Kein gültiges JSON');
  await expect(code(page)).toHaveValue('{"a":}');
  // Only offered for JSON
  await page.locator('#name').fill('d.txt');
  await page.click('#btnMore');
  await expect(tool(page, 'format')).toHaveCount(0);
});

test('files in the menu: open, delete with undo, new file; settings stay', async ({ page }) => {
  await openFile(page, 'eins.md', '# Eins');
  await openFile(page, 'zwei.go', 'package main');
  await openMenu(page);
  await expect(page.locator('#files li .name')).toHaveText(['zwei.go', 'eins.md']);
  await page.locator('#files li', { hasText: 'eins.md' }).locator('.open').click();
  await expect(code(page)).toHaveValue('# Eins');
  await openMenu(page);
  await page.locator('#files li', { hasText: 'eins.md' }).locator('[data-act="delete"]').click();
  await expect(page.locator('#files li .name')).toHaveText(['zwei.go']);
  await expect(code(page)).toHaveValue('package main');
  await page.locator('#toast button').click();
  await expect(page.locator('#files li .name')).toHaveText(['zwei.go', 'eins.md']);
  await closeMenu(page);
  await expect(code(page)).toHaveValue('# Eins');
  await page.click('#btnNew');
  await expect(code(page)).toHaveValue('');
  await expect(page.locator('#modes [data-m="edit"]')).toHaveAttribute('aria-pressed', 'true');
  // Settings
  await openSettings(page);
  await page.locator('#optLines').uncheck();
  await page.locator('#optFont [data-v="xl"]').click();
  await page.locator('#optTab [data-v="2"]').click();
  await closeMenu(page);
  await page.reload();
  await expect(page.locator('body')).toHaveClass(/no-lines/);
  await expect(page.locator('body')).toHaveClass(/font-xl/);
  expect(await code(page).evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el).tabSize])).toEqual(['21px', '2']);
  // Deleting every file brings back the start screen
  await openMenu(page);
  for (let i = 0; i < 3 && await page.locator('#files [data-act="delete"]').count(); i++) await page.locator('#files [data-act="delete"]').first().click();
  await closeMenu(page);
  await expect(page.locator('#start')).toBeVisible();
});

test('accessible with an open file, search and dialog, light and dark (syntax colours with enough contrast)', async ({ page }) => {
  await openFile(page, 'a.py', '#!/usr/bin/env python3\n@dataclass\nclass A(B):\n    """Doc"""\n    x: int = 0x1F  # comment\n    def f(self, n=None):\n        return f"{n!r}" + str(True)\n');
  await tool(page, 'find').click();
  await page.locator('#findText').fill('n');
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    expect((await axe(page).analyze()).violations, scheme).toEqual([]);
  }
  // Contrast of every syntax colour against the editor background, computed independently (WCAG formula)
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    const worst = await page.evaluate(() => {
      const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
      const lum = c => { const [r, g, b] = rgb(c).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const bg = getComputedStyle(document.querySelector('.code-box')).backgroundColor;
      let min = 99;
      for (const el of document.querySelectorAll('#hlCode span')) {
        const a = lum(getComputedStyle(el).color), b = lum(bg);
        min = Math.min(min, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
      }
      return min;
    });
    expect(worst, scheme).toBeGreaterThanOrEqual(4.5);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await page.keyboard.press('Escape');
  await tool(page, 'lang').click();
  expect((await axe(page).analyze()).violations).toEqual([]);
});

test('works offline after the first visit, also for languages loaded on demand', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await openFile(page, 'build.gradle', 'plugins { id "java" }\n');
  await expect(hl(page)).toHaveClass(/language-gradle/);
  await openFile(page, 'x.ps1', 'Write-Host "Hallo"\n');
  await expect(hl(page)).toHaveClass(/language-powershell/);
  await expect(hl(page).locator('.hljs-built_in')).toHaveText('Write-Host');
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts are English', async ({ page }) => {
    await expect(page.locator('#drop strong')).toHaveText('Open file');
    await openFile(page, 'a.rs', 'fn main() {}\n');
    await expect(page.locator('#modes [data-m="view"]')).toHaveText('View');
    await expect(tool(page, 'lang')).toHaveAttribute('aria-label', 'Language & format: Rust');
    await expect(tool(page, 'goto')).toHaveText('Line');
    await openMenu(page);
    await expect(page.locator('#files li .meta').first()).toContainText('1 line · Rust · open');
  });
});
