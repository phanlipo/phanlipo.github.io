// Static check of our own code (npm run lint, also in CI) – finds misspelled names, unused variables,
// duplicate keys and dead code before the browser tests run. Only ESLint's recommended rules, no style
// rules (formatting stays as it is). Libraries in assets/vendor/ and the generated sw.js files are skipped.
import js from '@eslint/js';
import globals from 'globals';
import html from 'eslint-plugin-html';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Names our own classic scripts put on the page (window.Songs = …, root.MoveEngine = …) and the libraries
// from assets/vendor that pages load with <script src> – read from the files, so the list stays current.
// A typo (Song instead of Songs) is still reported; a page that uses Songs without loading songs.js is not –
// the browser tests catch that.
const ownGlobals = (() => {
  const names = {};
  const files = ['assets/common.js', ...readdirSync('assets/shared').map(f => join('assets/shared', f))];
  for (const d of readdirSync('.')) {
    if (d.startsWith('.') || d.startsWith('_') || ['assets', 'node_modules', 'tests', 'scripts'].includes(d)) continue;
    try { if (!statSync(d).isDirectory()) continue; } catch { continue; }
    for (const f of readdirSync(d)) if (f.endsWith('.js') && f !== 'sw.js') files.push(join(d, f));
  }
  for (const f of files.filter(f => f.endsWith('.js'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\b(?:window|root|self|globalThis)\.([A-Z][\w$]*)\s*=(?!=)/g)) names[m[1]] = 'readonly';
  }
  return names;
})();
// Globals of the libraries in assets/vendor that pages load as classic scripts
const vendorGlobals = Object.fromEntries(['qrcode', 'ZXingWASM', 'ABCJS', 'marked', 'DOMPurify', 'katex',
  'TurndownService', 'libheif', 'pdfjsLib', 'Tesseract', 'JSZip'].map(n => [n, 'readonly']));

export default [
  {
    ignores: ['assets/vendor/**', 'node_modules/**', '_site/**', 'playwright-report/**', 'playwright-report-live/**',
      'test-results/**', '*/sw.js'],
  },
  js.configs.recommended,
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Unused function parameters and caught errors are fine (handlers with a fixed signature, catch (_) {}),
      // so is leaving out keys with a rest pattern ({ $schema, ...body })
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }],
      // Style only: a start value that every branch overwrites (let ok = false; try { ok = … }), \/ in a regex.
      // Changing that in an app would only give it a new version (cache) without any effect.
      'no-useless-assignment': 'off',
      'no-useless-escape': 'off',
      // A byte order mark written as the character itself in a regex (strips it from the start of a file) is on purpose
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
      // Empty catch blocks are used on purpose for optional browser features
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Barcode, QR and file parsers match control characters on purpose (GS1 separator \x1d …)
      'no-control-regex': 'off',
      // New in ESLint 10: asks for { cause } on every error thrown in a catch block – a style choice, our
      // messages are written for the user and the original error goes to Tools.diag
      'preserve-caught-error': 'off',
    },
  },
  // Pages: inline <script> blocks, classic scripts in the app folders and the shared scripts
  {
    files: ['**/*.html', '**/*.js'],
    plugins: { html },
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.browser, ...ownGlobals, ...vendorGlobals },
    },
  },
  // Pages with <script type="module"> and module workers written as .js
  {
    files: ['audio-studio/index.html', 'video-to-audio/index.html', 'ai-chat/worker.js', 'text-to-speech/kokoro-worker.js',
      'voice-transcriber/worker.js'],
    languageOptions: { sourceType: 'module' },
  },
  // Workers (importScripts, self.onmessage); the shared scripts that are also loaded by workers
  {
    files: ['**/*worker*.js', '**/*worker*.mjs', 'assets/shared/heic-decode.js', 'assets/shared/onnx-tts.js'],
    languageOptions: { globals: { ...globals.worker } },
  },
  // Audio worklet (runs in the AudioWorkletGlobalScope)
  {
    files: ['loop-station/recorder.js'],
    languageOptions: { globals: { ...globals.audioWorklet } },
  },
  // Google Cast SDK (sender in cast.js, loaded only when the user taps "stream"; receiver on the TV page)
  {
    files: ['assets/shared/cast.js', 'assets/shared/cast-receiver.js'],
    languageOptions: { globals: { cast: 'readonly', chrome: 'readonly' } },
  },
  // ES modules (module workers, imported helpers)
  {
    files: ['**/*.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.browser, ...globals.worker, Tools: 'readonly' } },
  },
  // Node: build scripts, test helpers, configs
  {
    files: ['scripts/**', 'tests/**', '*.config.mjs'],
    languageOptions: { sourceType: 'module', globals: { ...globals.node } },
  },
  // Tests: code inside page.evaluate(() => …) runs in the page and uses its globals (Tools, the app's
  // functions, helpers the test put on window) – no-undef cannot tell those apart, so it is off here.
  // A misspelled name in the Node part fails the test right away.
  {
    files: ['tests/**'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'off' },
  },
];
