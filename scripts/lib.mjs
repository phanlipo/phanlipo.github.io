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
