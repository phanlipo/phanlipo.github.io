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

// All pages: root index.html plus <folder>/index.html (incl. template and redirects)
export function allPages() {
  const pages = [{ folder: '', file: 'index.html' }];
  for (const e of readdirSync(ROOT, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (existsSync(join(ROOT, e.name, 'index.html'))) pages.push({ folder: e.name, file: `${e.name}/index.html` });
  }
  return pages;
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
