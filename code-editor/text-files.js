/* Code-Editor: logic without DOM (window.TextFiles). Architecture: code-editor/README.md.
   - decode(bytes)   bytes of a file → {text, encoding, eol} or throws Error('binary')
   - encode(text, encoding, eol) → Uint8Array in the file's own encoding and line endings
   - LANGS / langById / detect(name, text) – languages of highlight.js and how a file is recognised
   - indentUnit(text) – the indentation a file uses (tab, 2 or 4 spaces) */
(function(){
'use strict';

/* ---------- Encodings ---------- */
// Supported: utf-8 (with or without BOM), utf-16le/be (with BOM), windows-1252 (old Windows/Latin-1 files)
const ENCODINGS = ['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16be', 'windows-1252'];
const ENC_NAMES = { 'utf-8': 'UTF-8', 'utf-8-bom': 'UTF-8 (BOM)', 'utf-16le': 'UTF-16 LE', 'utf-16be': 'UTF-16 BE', 'windows-1252': 'Windows-1252' };

function decode(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let encoding, text;
  if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) { encoding = 'utf-8-bom'; text = new TextDecoder('utf-8').decode(b.subarray(3)); }
  else if (b[0] === 0xFF && b[1] === 0xFE) { encoding = 'utf-16le'; text = new TextDecoder('utf-16le').decode(b.subarray(2)); }
  else if (b[0] === 0xFE && b[1] === 0xFF) { encoding = 'utf-16be'; text = new TextDecoder('utf-16be').decode(b.subarray(2)); }
  else {
    // Binary files (images, archives, programs) contain zero bytes; text files never do (same rule as git)
    const head = b.subarray(0, 8000);
    if (head.includes(0)) throw new Error('binary');
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(b); encoding = 'utf-8'; }
    catch (_) { text = new TextDecoder('windows-1252').decode(b); encoding = 'windows-1252'; }
  }
  // Mostly control characters: not a text file either
  const sample = text.slice(0, 8000);
  let ctrl = 0;
  for (let i = 0; i < sample.length; i++) { const c = sample.charCodeAt(i); if ((c < 32 && c !== 9 && c !== 10 && c !== 13 && c !== 12) || c === 0xFFFD) ctrl++; }
  if (sample.length && ctrl / sample.length > 0.1) throw new Error('binary');
  const crlf = (text.match(/\r\n/g) || []).length, lf = (text.match(/(^|[^\r])\n/g) || []).length;
  const eol = crlf > lf ? 'crlf' : (!crlf && !lf && /\r/.test(text)) ? 'cr' : 'lf';
  return { text: text.replace(/\r\n?/g, '\n'), encoding, eol };
}

// windows-1252: bytes 0x80–0x9F are printable characters, the rest is Latin-1
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ';
function encode(text, encoding, eol) {
  const nl = eol === 'crlf' ? '\r\n' : eol === 'cr' ? '\r' : '\n';
  const s = nl === '\n' ? text : text.replace(/\n/g, nl);
  if (encoding === 'utf-16le' || encoding === 'utf-16be') {
    const out = new Uint8Array(2 + s.length * 2), le = encoding === 'utf-16le';
    out[0] = le ? 0xFF : 0xFE; out[1] = le ? 0xFE : 0xFF;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      out[2 + 2 * i + (le ? 0 : 1)] = c & 0xFF; out[2 + 2 * i + (le ? 1 : 0)] = c >> 8;
    }
    return out;
  }
  if (encoding === 'windows-1252') {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i), k = CP1252.indexOf(s[i]);
      out[i] = k >= 0 && c > 0xFF ? 0x80 + k : c <= 0xFF ? c : 0x3F; // not representable → "?"
    }
    return out;
  }
  const u = new TextEncoder().encode(s);
  if (encoding !== 'utf-8-bom') return u;
  const out = new Uint8Array(u.length + 3);
  out.set([0xEF, 0xBB, 0xBF]); out.set(u, 3);
  return out;
}
// Characters the encoding cannot store (only windows-1252 can lose any)
function lossy(text, encoding) {
  if (encoding !== 'windows-1252') return 0;
  let n = 0;
  for (const ch of text) { const c = ch.codePointAt(0); if (c > 0xFF && !CP1252.includes(ch)) n++; }
  return n;
}

/* ---------- Languages ----------
   Built into highlight.min.js (common set) or loaded on demand from languages/ (src, written out literally so the
   offline cache finds them). ext: file extensions, files: whole file names (lower case). */
const LANGS = [
  { id: 'plaintext', name: 'Text', ext: ['txt', 'log', 'text', 'csv', 'tsv', 'out'], files: ['license', 'readme', 'authors', 'changelog', 'notice', 'copying'] },
  { id: 'bash', name: 'Bash / Shell', ext: ['sh', 'bash', 'zsh', 'ksh', 'command'], files: ['.bashrc', '.bash_profile', '.zshrc', '.profile', '.bash_aliases', '.zprofile', 'pkgbuild'] },
  { id: 'c', name: 'C', ext: ['c', 'h'] },
  { id: 'cpp', name: 'C++', ext: ['cpp', 'cc', 'cxx', 'c++', 'hpp', 'hh', 'hxx', 'h++', 'ipp', 'tpp'] },
  { id: 'csharp', name: 'C#', ext: ['cs', 'csx'] },
  { id: 'css', name: 'CSS', ext: ['css'] },
  { id: 'diff', name: 'Diff / Patch', ext: ['diff', 'patch', 'rej'] },
  { id: 'go', name: 'Go', ext: ['go'], files: ['go.mod', 'go.sum', 'go.work'] },
  { id: 'graphql', name: 'GraphQL', ext: ['graphql', 'gql', 'graphqls'] },
  { id: 'ini', name: 'INI / TOML', ext: ['ini', 'toml', 'cfg', 'conf', 'cnf', 'desktop', 'reg', 'inf', 'service', 'editorconfig', 'gitconfig', 'npmrc'], files: ['.editorconfig', '.gitconfig', '.npmrc', '.env', 'pipfile', 'cargo.lock', 'poetry.lock'] },
  { id: 'java', name: 'Java', ext: ['java'] },
  { id: 'javascript', name: 'JavaScript', ext: ['js', 'mjs', 'cjs', 'jsx', 'es6'] },
  { id: 'json', name: 'JSON', ext: ['json', 'jsonc', 'json5', 'geojson', 'webmanifest', 'har', 'ipynb', 'jsonl', 'ndjson', 'babelrc', 'eslintrc', 'prettierrc'], files: ['.babelrc', '.eslintrc', '.prettierrc', 'composer.lock', 'package-lock.json'] },
  { id: 'kotlin', name: 'Kotlin', ext: ['kt', 'kts'] },
  { id: 'less', name: 'Less', ext: ['less'] },
  { id: 'lua', name: 'Lua', ext: ['lua'] },
  { id: 'makefile', name: 'Makefile', ext: ['mk', 'mak', 'make'], files: ['makefile', 'gnumakefile', 'bsdmakefile'] },
  { id: 'markdown', name: 'Markdown', ext: ['md', 'markdown', 'mdown', 'mkd', 'mdx', 'rmd'] },
  { id: 'objectivec', name: 'Objective-C', ext: ['m', 'mm'] },
  { id: 'perl', name: 'Perl', ext: ['pl', 'pm', 't', 'pod'] },
  { id: 'php', name: 'PHP', ext: ['php', 'phtml', 'php3', 'php4', 'php5', 'phps'] },
  { id: 'python', name: 'Python', ext: ['py', 'pyw', 'pyi', 'pyx', 'gyp', 'bzl', 'star'], files: ['sconstruct', 'sconscript', 'build', 'workspace'] },
  { id: 'r', name: 'R', ext: ['r'] },
  { id: 'ruby', name: 'Ruby', ext: ['rb', 'rake', 'gemspec', 'ru', 'erb', 'podspec'], files: ['gemfile', 'rakefile', 'podfile', 'vagrantfile', 'brewfile', 'fastfile'] },
  { id: 'rust', name: 'Rust', ext: ['rs'] },
  { id: 'scss', name: 'SCSS / Sass', ext: ['scss', 'sass'] },
  { id: 'sql', name: 'SQL', ext: ['sql', 'ddl', 'dml', 'psql', 'mysql', 'pgsql'] },
  { id: 'swift', name: 'Swift', ext: ['swift'] },
  { id: 'typescript', name: 'TypeScript', ext: ['ts', 'tsx', 'mts', 'cts'] },
  { id: 'vbnet', name: 'Visual Basic .NET', ext: ['vb'] },
  { id: 'wasm', name: 'WebAssembly (Text)', ext: ['wat', 'wast'] },
  { id: 'xml', name: 'XML / HTML', ext: ['xml', 'html', 'htm', 'xhtml', 'svg', 'xsd', 'xsl', 'xslt', 'plist', 'rss', 'atom', 'kml', 'gpx', 'csproj', 'vbproj', 'fsproj', 'props', 'targets', 'resx', 'xaml', 'vue', 'svelte', 'storyboard', 'xib', 'wsdl', 'pom', 'opf', 'nuspec', 'config', 'manifest', 'iml', 'tmx', 'xliff', 'xlf', 'drawio', 'dae', 'mxml', 'jsp', 'ui'] },
  { id: 'yaml', name: 'YAML', ext: ['yaml', 'yml'], files: ['.clang-format', '.gitlab-ci.yml', '.yamllint'] },
  // Loaded on demand
  { id: 'apache', name: 'Apache-Konfiguration', ext: ['htaccess'], files: ['.htaccess', 'httpd.conf', 'apache2.conf'], src: '../assets/vendor/highlight/languages/apache.min.js' },
  { id: 'arduino', name: 'Arduino', ext: ['ino', 'pde'], src: '../assets/vendor/highlight/languages/arduino.min.js' },
  { id: 'armasm', name: 'ARM Assembler', ext: [], src: '../assets/vendor/highlight/languages/armasm.min.js' },
  { id: 'awk', name: 'AWK', ext: ['awk'], src: '../assets/vendor/highlight/languages/awk.min.js' },
  { id: 'clojure', name: 'Clojure', ext: ['clj', 'cljs', 'cljc', 'edn'], src: '../assets/vendor/highlight/languages/clojure.min.js' },
  { id: 'cmake', name: 'CMake', ext: ['cmake'], files: ['cmakelists.txt'], src: '../assets/vendor/highlight/languages/cmake.min.js' },
  { id: 'dart', name: 'Dart', ext: ['dart'], src: '../assets/vendor/highlight/languages/dart.min.js' },
  { id: 'delphi', name: 'Delphi / Pascal', ext: ['pas', 'dpr', 'dfm', 'lpr', 'pp'], src: '../assets/vendor/highlight/languages/delphi.min.js' },
  { id: 'dockerfile', name: 'Dockerfile', ext: ['dockerfile', 'containerfile'], files: ['dockerfile', 'containerfile'], src: '../assets/vendor/highlight/languages/dockerfile.min.js' },
  { id: 'dos', name: 'Batch (Windows)', ext: ['bat', 'cmd', 'btm'], src: '../assets/vendor/highlight/languages/dos.min.js' },
  { id: 'elixir', name: 'Elixir', ext: ['ex', 'exs'], src: '../assets/vendor/highlight/languages/elixir.min.js' },
  { id: 'erlang', name: 'Erlang', ext: ['erl', 'hrl'], src: '../assets/vendor/highlight/languages/erlang.min.js' },
  { id: 'fortran', name: 'Fortran', ext: ['f', 'for', 'f77', 'f90', 'f95', 'f03', 'f08'], src: '../assets/vendor/highlight/languages/fortran.min.js' },
  { id: 'fsharp', name: 'F#', ext: ['fs', 'fsx', 'fsi'], src: '../assets/vendor/highlight/languages/fsharp.min.js' },
  { id: 'gcode', name: 'G-Code', ext: ['gcode', 'gco', 'nc', 'ngc', 'tap'], src: '../assets/vendor/highlight/languages/gcode.min.js' },
  { id: 'glsl', name: 'GLSL (Shader)', ext: ['glsl', 'vert', 'frag', 'geom', 'comp', 'vs', 'shader'], src: '../assets/vendor/highlight/languages/glsl.min.js' },
  { id: 'gradle', name: 'Gradle', ext: ['gradle'], src: '../assets/vendor/highlight/languages/gradle.min.js' },
  { id: 'groovy', name: 'Groovy', ext: ['groovy', 'gvy', 'gy', 'gsh'], files: ['jenkinsfile'], src: '../assets/vendor/highlight/languages/groovy.min.js' },
  { id: 'haskell', name: 'Haskell', ext: ['hs', 'lhs'], src: '../assets/vendor/highlight/languages/haskell.min.js' },
  { id: 'http', name: 'HTTP', ext: ['http', 'rest'], src: '../assets/vendor/highlight/languages/http.min.js' },
  { id: 'julia', name: 'Julia', ext: ['jl'], src: '../assets/vendor/highlight/languages/julia.min.js' },
  { id: 'latex', name: 'LaTeX', ext: ['tex', 'sty', 'cls', 'ltx', 'bib', 'dtx', 'ins'], src: '../assets/vendor/highlight/languages/latex.min.js' },
  { id: 'lisp', name: 'Lisp', ext: ['lisp', 'lsp', 'cl', 'el', 'asd'], src: '../assets/vendor/highlight/languages/lisp.min.js' },
  { id: 'matlab', name: 'MATLAB / Octave', ext: [], src: '../assets/vendor/highlight/languages/matlab.min.js' },
  { id: 'nginx', name: 'Nginx-Konfiguration', ext: ['nginx', 'nginxconf'], files: ['nginx.conf'], src: '../assets/vendor/highlight/languages/nginx.min.js' },
  { id: 'nix', name: 'Nix', ext: ['nix'], src: '../assets/vendor/highlight/languages/nix.min.js' },
  { id: 'ocaml', name: 'OCaml', ext: ['ml', 'mli'], src: '../assets/vendor/highlight/languages/ocaml.min.js' },
  { id: 'powershell', name: 'PowerShell', ext: ['ps1', 'psm1', 'psd1', 'ps1xml'], src: '../assets/vendor/highlight/languages/powershell.min.js' },
  { id: 'properties', name: 'Java-Properties', ext: ['properties'], files: ['gradle.properties'], src: '../assets/vendor/highlight/languages/properties.min.js' },
  { id: 'protobuf', name: 'Protocol Buffers', ext: ['proto'], src: '../assets/vendor/highlight/languages/protobuf.min.js' },
  { id: 'scala', name: 'Scala', ext: ['scala', 'sc', 'sbt'], src: '../assets/vendor/highlight/languages/scala.min.js' },
  { id: 'scheme', name: 'Scheme', ext: ['scm', 'ss', 'rkt', 'sld'], src: '../assets/vendor/highlight/languages/scheme.min.js' },
  { id: 'tcl', name: 'Tcl', ext: ['tcl', 'tk'], src: '../assets/vendor/highlight/languages/tcl.min.js' },
  { id: 'vbscript', name: 'VBScript / VBA', ext: ['vbs', 'vba', 'bas'], src: '../assets/vendor/highlight/languages/vbscript.min.js' },
  { id: 'verilog', name: 'Verilog', ext: ['v', 'sv', 'svh', 'vh'], src: '../assets/vendor/highlight/languages/verilog.min.js' },
  { id: 'vhdl', name: 'VHDL', ext: ['vhd', 'vhdl'], src: '../assets/vendor/highlight/languages/vhdl.min.js' },
  { id: 'vim', name: 'Vim Script', ext: ['vim'], files: ['.vimrc', '_vimrc', '.gvimrc'], src: '../assets/vendor/highlight/languages/vim.min.js' },
  { id: 'x86asm', name: 'x86 Assembler', ext: ['asm', 's', 'nasm'], src: '../assets/vendor/highlight/languages/x86asm.min.js' },
];
const BY_ID = new Map(LANGS.map(l => [l.id, l]));
const BY_EXT = new Map(), BY_FILE = new Map();
for (const l of LANGS) {
  for (const e of l.ext) if (!BY_EXT.has(e)) BY_EXT.set(e, l.id);
  for (const f of l.files || []) BY_FILE.set(f, l.id);
}
const langById = id => BY_ID.get(id) || null;

// Interpreter in the first line ("#!/usr/bin/env python3")
const SHEBANG = [[/python/, 'python'], [/\b(ba|z|k|da)?sh\b/, 'bash'], [/\bnode\b|\bdeno\b|\bbun\b/, 'javascript'], [/perl/, 'perl'],
  [/ruby/, 'ruby'], [/php/, 'php'], [/lua/, 'lua'], [/Rscript/, 'r'], [/pwsh|powershell/, 'powershell'], [/awk/, 'awk'], [/tclsh|wish/, 'tcl']];

// Language from the file name, else from the first line; null = unknown (the page may guess from the content)
function detect(name, text) {
  const n = String(name || '').trim().toLowerCase().split(/[\\/]/).pop();
  if (n) {
    if (BY_FILE.has(n)) return BY_FILE.get(n);
    if (/^dockerfile[.-]/.test(n)) return 'dockerfile';
    if (/^(docker-)?compose.*\.ya?ml$/.test(n)) return 'yaml';
    if (/^\.env(\.|$)/.test(n)) return 'ini';
    if (/^\.?(git|docker|npm|eslint|prettier)ignore$/.test(n)) return 'bash';
    const parts = n.split('.');
    if (parts.length > 1) {
      // two-part endings first ("cmakelists.txt" is handled above)
      const two = parts.slice(-2).join('.'), one = parts[parts.length - 1];
      if (BY_EXT.has(two)) return BY_EXT.get(two);
      if (BY_EXT.has(one)) return BY_EXT.get(one);
    }
  }
  const first = String(text || '').slice(0, 200).split('\n')[0];
  if (first.startsWith('#!')) for (const [re, id] of SHEBANG) if (re.test(first)) return id;
  if (/^<\?xml\b/.test(first) || /^<!doctype html/i.test(first)) return 'xml';
  if (/^<\?php/.test(first)) return 'php';
  return null;
}

/* ---------- Indentation ---------- */
// Tab, 2 or 4 spaces – whatever most indented lines of the file use; default 4 spaces
function indentUnit(text) {
  let tabs = 0, spaces = 0;
  const widths = new Map();
  const lines = String(text || '').split('\n', 5000);
  let prev = 0;
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = l.match(/^[ \t]*/)[0];
    if (m.startsWith('\t')) { tabs++; continue; }
    const w = m.length;
    if (w > prev) { spaces++; const d = w - prev; widths.set(d, (widths.get(d) || 0) + 1); }
    prev = w;
  }
  if (tabs > spaces) return '\t';
  const two = widths.get(2) || 0, four = widths.get(4) || 0;
  return two > four ? '  ' : '    ';
}

window.TextFiles = { ENCODINGS, ENC_NAMES, decode, encode, lossy, LANGS, langById, detect, indentUnit };
})();
