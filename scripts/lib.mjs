// Helpers shared by the build scripts.
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const decode = s => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

// Value of <meta name="..." content="...">; accepts both attribute orders
export function meta(html, name) {
  const re1 = new RegExp(`<meta\\s+name=(["'])${name}\\1\\s+content=(["'])(.*?)\\2`, 'i');
  const re2 = new RegExp(`<meta\\s+content=(["'])(.*?)\\1\\s+name=(["'])${name}\\3`, 'i');
  const m1 = html.match(re1), m2 = !m1 && html.match(re2);
  const v = m1 ? m1[3] : m2 ? m2[2] : null;
  return v == null ? null : decode(v.trim());
}

// All pages: root index.html plus <folder>/index.html (incl. template and redirects);
// folders starting with "_" (e.g. the _site output of scripts/site.mjs) are no pages
export function allPages() {
  const pages = [{ folder: '', file: 'index.html' }];
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name.startsWith('_') || ['node_modules', 'tests', 'test-results', 'playwright-report'].includes(e.name)) continue;
    if (existsSync(join(ROOT, e.name, 'index.html'))) pages.push({ folder: e.name, file: `${e.name}/index.html` });
  }
  return pages;
}

/* ---------- Vendor references of an app (checked by build.mjs) ----------
   How an app must reference vendor files so that they work offline (see AGENTS.md):
   - literally as ../assets/vendor/<name>/… with <name> from scripts/vendor.json. A path put together
     at runtime ('…/vendor/' + name) is invisible to build.mjs and would be missing from the offline cache.
   - a library's worker script is never started straight from assets/vendor/: a worker outside the app
     folder is not served by the app's service worker and fails offline. A small worker in the app folder
     loads it instead (import / importScripts on that line).
   files: [{ file, text }] (page and scripts of the app), folder: app folder, names: vendor names.
   Returns one message per problem ("file:line: …"). */
export function vendorProblems(files, folder, names) {
  const known = new Set(names);
  const problems = [];
  for (const { file, text } of files) {
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/assets\/vendor\/([^\s"'`)]*)/g)) {
        const at = `${file}:${i + 1}`;
        const name = line.slice(Math.max(0, m.index - 3), m.index) === '../' && /^([^/]+)\//.exec(m[1])?.[1];
        if (!name || !known.has(name)) {
          problems.push(`${at}: vendor path not written as ../assets/vendor/<name>/… with <name> from scripts/vendor.json` +
            ` – the offline cache would miss it: ${line.trim().slice(0, 100)}`);
        } else if (/worker/i.test(m[1].split('/').pop()) && !/^\s*(import\b|importScripts\s*\()/.test(line)) {
          problems.push(`${at}: worker ${m[1]} started from assets/vendor/ – outside ${folder}/ it bypasses the` +
            ` service worker and fails offline; start a small worker in ${folder}/ that imports it`);
        }
      }
    });
  }
  return problems;
}

/* ---------- npm packages (used by vendor.mjs and build-icons.mjs) ---------- */
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

const REGISTRY = 'https://registry.npmjs.org';

// Metadata of one published version (tarball URL + integrity hash)
export async function npmVersionInfo(pkg, version) {
  const res = await fetch(`${REGISTRY}/${pkg.replace('/', '%2F')}/${version}`);
  if (!res.ok) throw new Error(`${pkg}@${version}: registry ${res.status}`);
  return res.json();
}

export async function npmLatest(pkg) {
  return (await npmVersionInfo(pkg, 'latest')).version;
}

// Downloads the package tarball, verifies its integrity and returns Map(path -> Buffer)
// with paths relative to the package root (without the leading "package/").
export async function npmFiles(pkg, version) {
  const info = await npmVersionInfo(pkg, version);
  const res = await fetch(info.dist.tarball);
  if (!res.ok) throw new Error(`${pkg}@${version}: tarball ${res.status}`);
  const tgz = Buffer.from(await res.arrayBuffer());
  const [algo, expected] = info.dist.integrity.split('-');
  const actual = createHash(algo).update(tgz).digest('base64');
  if (actual !== expected) throw new Error(`${pkg}@${version}: integrity check failed`);
  return { files: untar(gunzipSync(tgz)), tarball: info.dist.tarball, integrity: info.dist.integrity };
}

// Minimal ustar reader: regular files only, supports the "prefix" field and pax long names
function untar(buf) {
  const out = new Map();
  let off = 0, paxPath = null;
  const str = (o, n) => buf.toString('utf8', o, o + n).replace(/\0.*$/s, '');
  while (off + 512 <= buf.length) {
    const name = str(off, 100);
    if (!name) break;
    const size = parseInt(str(off + 124, 12).trim() || '0', 8);
    const type = String.fromCharCode(buf[off + 156] || 48);
    const prefix = str(off + 345, 155);
    const data = buf.subarray(off + 512, off + 512 + size);
    if (type === 'x') {
      const m = data.toString('utf8').match(/\d+ path=([^\n]*)\n/);
      paxPath = m ? m[1] : null;
    } else if (type === '0' || type === '\0') {
      const full = paxPath || (prefix ? `${prefix}/${name}` : name);
      out.set(full.replace(/^[^/]+\//, ''), Buffer.from(data));
      paxPath = null;
    } else {
      paxPath = null;
    }
    off += 512 + Math.ceil(size / 512) * 512;
  }
  return out;
}

/* ---------- What GitHub Pages publishes (scripts/site.mjs, tests/server.mjs) ----------
   Only what the pages need: start page, robots.txt, root icons, assets/ and the page folders
   (tools and redirect pages). Never: Markdown files, dotfiles, _folders, scripts/, tests/, template/,
   package.json, LICENSE … – they stay on github.com. rel: repo-relative path with "/". */
export function isPublished(rel) {
  const parts = rel.split('/');
  if (parts.some(s => !s || s.startsWith('.')) || parts[0].startsWith('_') || rel.endsWith('.md')) return false;
  if (parts.length === 1) return rel === 'index.html' || rel === 'robots.txt' || /^icon[\w-]*\.(svg|png)$/.test(rel);
  const top = parts[0];
  if (top === 'assets') return true;
  return !['scripts', 'template', 'node_modules', 'tests', 'test-results', 'playwright-report'].includes(top)
    && existsSync(join(ROOT, top, 'index.html'));
}
