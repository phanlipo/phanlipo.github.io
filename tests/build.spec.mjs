// Build checks that protect offline use: vendor references an app writes in a way the offline cache
// cannot see. The examples are the two mistakes that once broke "PDF zu Word" offline.
import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { vendorProblems } from '../scripts/lib.mjs';

const NAMES = ['pdfjs', 'docx', 'tesseract'];
const check = (text, file = 'app/convert.mjs') => vendorProblems([{ file, text }], 'app', NAMES);

test('the repository passes the build check', () => {
  // exits with code 1 (and throws here) on outdated files or vendor problems
  const out = execFileSync('node', ['scripts/build.mjs', '--check'], { encoding: 'utf8' });
  expect(out).toContain('Up to date');
});

test('accepts literal vendor paths and workers started from the app folder', () => {
  expect(check([
    "import * as pdfjs from '../assets/vendor/pdfjs/pdf.min.mjs';",
    "await loadScript(url('../assets/vendor/docx/index.iife.js'));",
    "pdfjs.GlobalWorkerOptions.workerSrc = url('./pdf-worker.mjs');",
  ].join('\n'))).toEqual([]);
  expect(check("import '../assets/vendor/pdfjs/pdf.worker.min.mjs';", 'app/pdf-worker.mjs')).toEqual([]);
  expect(check("importScripts('../assets/vendor/tesseract/worker.min.js');", 'app/ocr-worker.js')).toEqual([]);
  expect(check('<script src="../assets/vendor/docx/index.iife.js"></script>', 'app/index.html')).toEqual([]);
});

test('flags vendor paths put together at runtime', () => {
  const problems = check([
    "const VENDOR = new URL('../assets/vendor/', import.meta.url).href;",   // line 1
    "await loadScript(VENDOR + 'docx/index.iife.js');",                     // not visible – but line 1 is flagged
    'const lib = `../assets/vendor/${name}/lib.js`;',                       // line 3
    "const abs = '/assets/vendor/docx/index.iife.js';",                     // line 4: not relative
    "const typo = '../assets/vendor/docks/index.iife.js';",                 // line 5: unknown library
  ].join('\n'));
  expect(problems.map(p => p.split(':').slice(0, 2).join(':'))).toEqual(
    ['app/convert.mjs:1', 'app/convert.mjs:3', 'app/convert.mjs:4', 'app/convert.mjs:5']);
  expect(problems[0]).toContain('offline cache would miss it');
});

test('flags library workers started straight from assets/vendor', () => {
  const problems = check([
    "pdfjs.GlobalWorkerOptions.workerSrc = url('../assets/vendor/pdfjs/pdf.worker.min.mjs');",
    "  workerPath: url('../assets/vendor/tesseract/worker.min.js'),",
    "new Worker('../assets/vendor/tesseract/worker.min.js');",
  ].join('\n'));
  expect(problems).toHaveLength(3);
  for (const p of problems) expect(p).toContain('bypasses the service worker');
  expect(problems[0]).toMatch(/^app\/convert\.mjs:1: worker pdfjs\/pdf\.worker\.min\.mjs/);
});
