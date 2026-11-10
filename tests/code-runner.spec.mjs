// Code ausführen: Python (Pyodide) and JavaScript in workers – output, errors, input, stop, lockdown,
// editor helpers, saved scripts, files, offline. The WebMCP tools are tested in webmcp.spec.mjs.
import { test, expect, openMenu, closeMenu, clipboardText } from './helpers.mjs';

const code = page => page.locator('#code');
const out = page => page.locator('#out');
const status = page => page.locator('#status');
const lang = (page, l) => page.locator(`#langs [data-l="${l}"]`);
const stored = (page, key = 'code-runner.state.v1') => page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), key);

/** Writes a program, runs it and waits until it has ended (the button shows "Ausführen" again) */
async function run(page, language, source, { stdin } = {}) {
  await lang(page, language).click();
  await code(page).fill(source);
  if (stdin != null) { await openMenu(page); await page.locator('#stdin').fill(stdin); await closeMenu(page); }
  await page.locator('#btnRun').click();
  await expect(page.locator('#btnRun')).not.toHaveClass(/stop/, { timeout: 60000 });
  return (await out(page).textContent());
}

test.beforeEach(async ({ page }) => { await page.goto('/code-runner/'); });

test.describe('JavaScript', () => {
  test('prints values like a console and shows the value of the last line', async ({ page }) => {
    const text = await run(page, 'javascript', 'console.log("hi", 1.5, {a: 1, b: [1, "x"]}, new Map([[1, 2]]), null, undefined);\nconsole.warn("careful");\n6 * 7');
    expect(text).toBe('hi 1.5 { a: 1, b: [1, "x"] } Map(1) {1 => 2} null undefined\ncareful\n→ 42\n');
    await expect(out(page).locator('.o-err')).toHaveText('careful\n');
    await expect(out(page).locator('.o-res')).toHaveText('→ 42\n');
    await expect(status(page)).toHaveText(/^Fertig · \d+ ms$/);
    await expect(status(page)).not.toHaveClass(/err/);
  });

  test('errors are red and name the line', async ({ page }) => {
    const text = await run(page, 'javascript', 'const x = 1;\nconsole.log("before");\nfoo.bar();\nconsole.log("after");');
    expect(text).toBe('before\nReferenceError: foo is not defined (Zeile 3)\n');
    await expect(out(page).locator('.o-err')).toHaveText(/ReferenceError/);
    await expect(status(page)).toHaveText(/^Fehler · \d+ ms$/);
    await expect(status(page)).toHaveClass(/err/);
    expect(await run(page, 'javascript', 'let a = ;')).toMatch(/^SyntaxError: /);
  });

  test('top-level await, timers and return: the run ends when nothing is waiting any more', async ({ page }) => {
    const text = await run(page, 'javascript', 'const wait = ms => new Promise(r => setTimeout(r, ms));\nconsole.log("a");\nawait wait(150);\nconsole.log("b");\nreturn [1, 2].length');
    expect(text).toBe('a\nb\n→ 2\n');
    // A timer that fires after the last line still belongs to the run; its error is reported
    expect(await run(page, 'javascript', 'setTimeout(() => { console.log("timer"); throw new Error("boom"); }, 80);\n"sync"'))
      .toBe('timer\nError: boom (Zeile 1)\n→ "sync"\n');
    expect(await run(page, 'javascript', 'Promise.reject(new TypeError("nobody caught me"))')).toContain('TypeError: nobody caught me');
  });

  test('every run starts fresh', async ({ page }) => {
    expect(await run(page, 'javascript', 'const once = 1; globalThis.kept = 5; once')).toBe('→ 1\n');
    expect(await run(page, 'javascript', 'const once = 2; typeof kept')).toBe('→ "undefined"\n');
  });

  test('prompt() and readline() read the input lines from the menu', async ({ page }) => {
    const text = await run(page, 'javascript', 'const n = prompt("Name?");\nconsole.log("Hi " + n);\nconsole.log(readline(), prompt());', { stdin: 'Ada\n36\n' });
    expect(text).toBe('Name? Ada\nHi Ada\n36\n36 null\n');
    await expect(out(page).locator('.o-in').first()).toHaveText('Ada\n');
  });

  test('Stop ends an endless loop, long output is cut off', async ({ page }) => {
    await lang(page, 'javascript').click();
    await code(page).fill('let i = 0;\nwhile (true) console.log("line", i++);');
    await page.locator('#btnRun').click();
    await expect(page.locator('#btnRun')).toHaveText('Stopp');
    await expect(out(page)).toContainText('Ausgabe gekürzt', { timeout: 30000 });
    await expect(page.locator('#btnRun')).toHaveClass(/stop/);   // still running
    await page.locator('#btnRun').click();
    await expect(status(page)).toHaveText('Gestoppt');
    await expect(out(page)).toContainText('Programm gestoppt.');
    await expect(page.locator('#btnRun')).toHaveText('Ausführen');
    // The page keeps only the end of very long output
    expect((await out(page).textContent()).length).toBeLessThan(450000);
    await expect(out(page)).toContainText('Anfang der Ausgabe gekürzt');
    // and the next run works
    expect(await run(page, 'javascript', '1 + 1')).toBe('→ 2\n');
  });

  test('no network and no shared storage for the program', async ({ page }) => {
    const text = await run(page, 'javascript', [
      'console.log([typeof XMLHttpRequest, typeof WebSocket, typeof EventSource, typeof importScripts, typeof Worker, typeof caches, typeof indexedDB, typeof BroadcastChannel].join(" "));',
      'console.log(typeof navigator.sendBeacon, typeof navigator.serviceWorker, typeof navigator.storage);',
      // not reachable through the prototypes either
      'let found = [];',
      'for (let o = globalThis; o; o = Object.getPrototypeOf(o)) for (const k of ["XMLHttpRequest", "caches", "indexedDB", "importScripts"]) if (Object.getOwnPropertyDescriptor(o, k)?.value !== undefined || Object.getOwnPropertyDescriptor(o, k)?.get) found.push(k);',
      'console.log("found:", found.length);',
      'for (const url of ["/index.html", "../assets/common.js", "https://example.com/"]) await fetch(url).then(() => console.log("LOADED " + url), e => console.log(e.message));',
    ].join('\n'));
    expect(text).toBe('undefined undefined undefined undefined undefined undefined undefined undefined\nundefined undefined undefined\nfound: 0\n'
      + 'fetch is blocked: code in this app runs without network access\n'.repeat(3));
  });
});

test.describe('Python', () => {
  test('runs real Python: output, errors with traceback, input, fresh variables, standard library', async ({ page }) => {
    // First run loads the interpreter from the site's own files
    let text = await run(page, 'python', 'import sys\nprint("hello", 2 ** 100)\nprint("oops", file=sys.stderr)\n[n * n for n in range(5)]');
    expect(text).toBe('hello 1267650600228229401496703205376\noops\n→ [0, 1, 4, 9, 16]\n');
    await expect(out(page).locator('.o-err')).toHaveText('oops\n');
    await expect(status(page)).toHaveText(/^Fertig · \d+ ms$/);

    text = await run(page, 'python', 'kept = 1\ndef f():\n    return 1 / 0\nprint("before")\nf()');
    expect(text).toContain('before\nTraceback (most recent call last):\n  File "main.py", line 5, in <module>');
    expect(text).toContain('  File "main.py", line 3, in f');
    expect(text).toMatch(/ZeroDivisionError: division by zero\n$/);
    expect(text).not.toContain('_pyodide');   // no frames of the engine itself
    await expect(status(page)).toHaveClass(/err/);

    expect(await run(page, 'python', '"kept" in globals()')).toBe('→ False\n');
    expect(await run(page, 'python', 'x = (')).toMatch(/^ {2}File "main.py", line 1\n[\s\S]*SyntaxError: /);

    text = await run(page, 'python', 'name = input("Name? ")\nage = int(input())\nprint(f"{name} is {age + 1}")', { stdin: 'Ada\n36' });
    expect(text).toBe('Name? Ada\n36\nAda is 37\n');

    // More input() calls than lines: Python's own error plus a hint where to enter input
    text = await run(page, 'python', 'input()\ninput()', { stdin: 'only one' });
    expect(text).toContain('EOFError');
    expect(text).toContain('Eingabe für das Programm');

    text = await run(page, 'python', [
      'import math, json, re, random, statistics, itertools, datetime, fractions, asyncio',
      'await asyncio.sleep(0.05)',
      'print(math.comb(10, 3), statistics.median([5, 1, 9]), fractions.Fraction(1, 3) + fractions.Fraction(1, 6))',
      'print(json.dumps({"ä": [1, None]}, ensure_ascii=False), re.sub(r"\\d+", "#", "a1b22"))',
      'import sys; sys.exit(0)',
    ].join('\n'));
    expect(text).toBe('120 5 1/2\n{"ä": [1, null]} a#b#\n');
    await expect(status(page)).toHaveText(/^Fertig/);
  });

  test('Stop ends an endless loop; no network and no shared storage', async ({ page }) => {
    const text = await run(page, 'python', [
      'import js',
      'print([hasattr(js, n) for n in ("XMLHttpRequest", "WebSocket", "caches", "indexedDB", "importScripts", "Worker")])',
      'for url in ("/index.html", "../assets/common.js", "https://example.com/"):',
      '    try:',
      '        await js.fetch(url)',
      '        print("LOADED", url)',
      '    except Exception as e:',
      '        print("blocked" if "fetch is blocked" in str(e) else e)',
    ].join('\n'));
    expect(text).toBe('[False, False, False, False, False, False]\nblocked\nblocked\nblocked\n');

    await code(page).fill('import itertools\nfor i in itertools.count():\n    pass');
    await page.locator('#btnRun').click();
    await expect(status(page)).toHaveText('Läuft …');
    await page.waitForTimeout(300);
    await page.locator('#btnRun').click();
    await expect(status(page)).toHaveText('Gestoppt');
    // The interpreter is loaded again for the next run
    expect(await run(page, 'python', 'print("again")')).toBe('again\n');
  });

  test('works offline once Python was used', async ({ page, context }) => {
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await run(page, 'python', 'print(6 * 7)')).toBe('42\n');
    await context.setOffline(true);
    await page.reload();
    expect(await run(page, 'python', 'import math\nprint(math.factorial(10))')).toBe('3628800\n');
    expect(await run(page, 'javascript', 'console.log(2 ** 10)')).toBe('1024\n');
  });

  test.describe('first use without a connection', () => {
    // Without the service worker, so that the blocked files cannot come from its cache
    test.use({ serviceWorkers: 'block', allowedProblems: /pyodide|ERR_|Failed to load resource|net::/i });
    test('explains that Python needs to be loaded once', async ({ page, context }) => {
      await context.route('**/assets/vendor/pyodide/**', r => r.abort());
      await page.reload();
      const text = await run(page, 'python', 'print(1)');
      expect(text).toContain('Python konnte nicht geladen werden');
      await expect(status(page)).toHaveText('Python nicht geladen');
      // JavaScript does not need it
      expect(await run(page, 'javascript', 'console.log(1)')).toBe('1\n');
    });
  });
});

test.describe('editor', () => {
  test('starts with an example, remembers the code per language over a reload', async ({ page }) => {
    await expect(lang(page, 'python')).toHaveAttribute('aria-pressed', 'true');
    await expect(code(page)).toHaveValue(/print\(f"Hallo \{name\}!"\)/);
    await code(page).fill('print("py")');
    await lang(page, 'javascript').click();
    await expect(code(page)).toHaveValue(/console\.log\(`Hallo \$\{name\}!`\)/);
    await code(page).fill('console.log("js")');
    await page.reload();
    await expect(lang(page, 'javascript')).toHaveAttribute('aria-pressed', 'true');
    await expect(code(page)).toHaveValue('console.log("js")');
    await lang(page, 'python').click();
    await expect(code(page)).toHaveValue('print("py")');
  });

  test('Enter keeps the indentation, Tab indents, Esc + Tab leaves the field', async ({ page }) => {
    await lang(page, 'python').click();
    await code(page).fill('');
    await code(page).pressSequentially('for i in range(3):');
    await code(page).press('Enter');
    await code(page).pressSequentially('if i:');
    await code(page).press('Enter');
    await code(page).pressSequentially('print(i)');
    await expect(code(page)).toHaveValue('for i in range(3):\n    if i:\n        print(i)');
    await code(page).press('Shift+Tab');
    await expect(code(page)).toHaveValue('for i in range(3):\n    if i:\n    print(i)');
    await code(page).press('Tab');
    await expect(code(page)).toHaveValue('for i in range(3):\n    if i:\n    print(i)    ');
    // Several lines selected: all of them move
    await code(page).evaluate(el => el.setSelectionRange(0, el.value.length));
    await code(page).press('Tab');
    await expect(code(page)).toHaveValue('    for i in range(3):\n        if i:\n        print(i)    ');
    await page.locator('#keys [data-k="outdent"]').click();
    await expect(code(page)).toHaveValue('for i in range(3):\n    if i:\n    print(i)    ');
    await code(page).press('Escape');
    await code(page).press('Tab');
    await expect(code(page)).not.toBeFocused();
    // JavaScript: two spaces, deeper after an opening bracket
    await lang(page, 'javascript').click();
    await code(page).fill('');
    await code(page).pressSequentially('if (x) {');
    await code(page).press('Enter');
    await code(page).pressSequentially('y();');
    await expect(code(page)).toHaveValue('if (x) {\n  y();');
  });

  test('key bar inserts characters and pairs around the selection, Ctrl+Enter runs', async ({ page }) => {
    await lang(page, 'javascript').click();
    await code(page).fill('console.log');
    await code(page).evaluate(el => el.setSelectionRange(el.value.length, el.value.length));
    await page.locator('#keys [data-p="()"]').click();
    await expect(code(page)).toBeFocused();
    await page.keyboard.type('1');
    await page.locator('#keys [data-p="_"]').click();
    await expect(code(page)).toHaveValue('console.log(1_)');
    await code(page).fill('abc');
    await code(page).evaluate(el => el.setSelectionRange(0, 3));
    await page.locator('#keys [data-p=\'""\']').click();
    await expect(code(page)).toHaveValue('"abc"');
    await code(page).press('Control+Enter');
    await expect(out(page)).toHaveText('→ "abc"\n');
  });

  test('copy and clear the output', async ({ page }) => {
    await run(page, 'javascript', 'console.log("to copy")');
    await page.locator('#btnCopy').click();
    expect(await clipboardText(page)).toBe('to copy\n');
    await page.locator('#btnClear').click();
    await expect(out(page)).toBeEmpty();
    await expect(status(page)).toBeEmpty();
  });
});

test.describe('menu', () => {
  test('examples: load, run, ask before unsaved code is replaced', async ({ page }) => {
    await lang(page, 'python').click();
    await openMenu(page);
    await expect(page.locator('#examples option')).toHaveCount(6);
    await page.locator('#examples').selectOption({ label: 'Python: Eingabe lesen' });
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect(code(page)).toHaveValue(/input\("Wie heißt du\? "\)/);
    // The example brings its input along
    expect((await stored(page)).stdin).toBe('Ada\n36\n');
    await page.locator('#btnRun').click();
    await expect(out(page)).toContainText('Hallo Ada! In 10 Jahren bist du 46.', { timeout: 60000 });

    await code(page).fill('my_own = 1');
    let asked = 0;
    page.once('dialog', d => { asked++; d.dismiss(); });
    await openMenu(page);
    await page.locator('#examples').selectOption({ index: 1 });
    expect(asked).toBe(1);
    await expect(code(page)).toHaveValue('my_own = 1');
    page.once('dialog', d => { asked++; d.accept(); });
    await page.locator('#examples').selectOption({ index: 1 });
    expect(asked).toBe(2);
    await expect(code(page)).toHaveValue(/print\(f"Hallo \{name\}!"\)/);
  });

  test('every example runs without an error', async ({ page }) => {
    test.setTimeout(120000);
    for (const [l, n] of [['javascript', 5], ['python', 5]]) {
      await lang(page, l).click();
      for (let i = 1; i <= n; i++) {
        await openMenu(page);
        await page.locator('#examples').selectOption({ index: i });
        await page.locator('#btnRun').click();
        await expect(status(page), `${l} example ${i}`).toHaveText(/^Fertig/, { timeout: 60000 });
        expect((await out(page).textContent()).length).toBeGreaterThan(3);
        await expect(out(page).locator('.o-err')).toHaveCount(0);
      }
    }
  });

  test('scripts: save, update, open, delete', async ({ page }) => {
    await lang(page, 'javascript').click();
    await code(page).fill('console.log("one")');
    await openMenu(page);
    await expect(page.locator('#scripts')).toContainText('Noch keine Skripte gespeichert.');
    await page.locator('#btnSave').click();
    await expect(page.locator('.toast')).toContainText('Bitte einen Namen eingeben.');
    await page.locator('#scriptName').fill('Erstes');
    await page.locator('#btnSave').click();
    await expect(page.locator('#scripts li')).toHaveCount(1);
    await expect(page.locator('#scripts .name')).toHaveText('Erstes');
    await expect(page.locator('#scripts .meta')).toContainText('JavaScript');
    await expect(page.locator('#scripts .meta')).toContainText('18 Zeichen');
    await closeMenu(page);
    // Same name: updated, not added
    await code(page).fill('console.log("two")');
    await openMenu(page);
    await expect(page.locator('#scriptName')).toHaveValue('Erstes');
    await page.locator('#btnSave').click();
    await expect(page.locator('#scripts li')).toHaveCount(1);
    expect((await stored(page, 'code-runner.scripts.v1')).map(s => [s.name, s.lang, s.code])).toEqual([['Erstes', 'javascript', 'console.log("two")']]);
    await closeMenu(page);
    // Saved code is replaced without a question; opening switches the language
    await lang(page, 'python').click();
    await openMenu(page);
    await page.locator('#scripts .open').click();
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect(lang(page, 'javascript')).toHaveAttribute('aria-pressed', 'true');
    await expect(code(page)).toHaveValue('console.log("two")');
    await openMenu(page);
    page.once('dialog', d => { expect(d.message()).toBe('„Erstes“ löschen?'); d.accept(); });
    await page.getByRole('button', { name: 'Löschen: Erstes' }).click();
    await expect(page.locator('#scripts')).toContainText('Noch keine Skripte gespeichert.');
    expect(await stored(page, 'code-runner.scripts.v1')).toEqual([]);
  });

  test('open a file (language by its ending) and download the code', async ({ page }) => {
    await openMenu(page);
    await page.locator('#fileInput').setInputFiles({ name: 'rechnen.js', mimeType: 'text/javascript', buffer: Buffer.from('console.log(3 * 4)\r\n') });
    await expect(page.locator('#appMenu')).toBeHidden();
    await expect(lang(page, 'javascript')).toHaveAttribute('aria-pressed', 'true');
    await expect(code(page)).toHaveValue('console.log(3 * 4)\n');
    await openMenu(page);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#btnDownload').click()]);
    expect(download.suggestedFilename()).toBe('rechnen.js');
    const chunks = [];
    for await (const c of await download.createReadStream()) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toBe('console.log(3 * 4)\n');
    // Python file; binary files are refused
    await page.locator('#fileInput').setInputFiles({ name: 'a.py', mimeType: 'text/x-python', buffer: Buffer.from('print(1)') });
    await expect(lang(page, 'python')).toHaveAttribute('aria-pressed', 'true');
    await expect(code(page)).toHaveValue('print(1)');
    await openMenu(page);
    await page.locator('#fileInput').setInputFiles({ name: 'bild.txt', mimeType: 'text/plain', buffer: Buffer.from([80, 75, 0, 0, 1, 2]) });
    await expect(page.locator('.toast')).toContainText('keine Textdatei');
    await expect(code(page)).toHaveValue('print(1)');
  });

  test('settings: font size and wrapping are applied and remembered', async ({ page }) => {
    const size = () => code(page).evaluate(el => getComputedStyle(el).fontSize);
    expect(await size()).toBe('16px');
    await openMenu(page);
    await page.locator('#font').selectOption('xl');
    await page.locator('#wrap').uncheck();
    await closeMenu(page);
    expect(await size()).toBe('21px');
    expect(await out(page).evaluate(el => getComputedStyle(el).whiteSpace)).toBe('pre');
    await page.reload();
    expect(await size()).toBe('21px');
    await expect(code(page)).toHaveAttribute('wrap', 'off');
  });
});

test.describe('English', () => {
  test.use({ locale: 'en-US' });
  test('texts, examples and messages are English', async ({ page }) => {
    await expect(page.locator('#btnRun')).toHaveText('Run');
    await expect(code(page)).toHaveValue(/print\(f"Hello, \{name\}!"\)/);
    expect(await run(page, 'javascript', 'null.x')).toMatch(/^TypeError: .*\(line 1\)\n$/);
    await expect(status(page)).toHaveText(/^Error · \d+ ms$/);
    await openMenu(page);
    await expect(page.locator('#examples option').nth(3)).toHaveText('JavaScript: Reading input');
  });
});
