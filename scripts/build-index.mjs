#!/usr/bin/env node
// Builds the tool list on the start page (index.html) and in README.md
// from the metadata in each tool folder's index.html.
//
// Usage:
//   node scripts/build-index.mjs          update both files
//   node scripts/build-index.mjs --check  only check; exit code 1 if they are outdated
//
// A folder is listed when it has an index.html with <title> and <meta name="description">.
// Skipped: hidden folders, assets/, scripts/, template/ and pages with <meta name="tool:hidden" content="true">.
// Optional metadata: <meta name="tool:tags" content="a, b">, <meta name="tool:order" content="10">.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SKIP = new Set(['assets', 'scripts', 'template', 'node_modules']);
const START = '<!-- tools:start -->';
const END = '<!-- tools:end -->';
const SITE = 'https://phanlipo.github.io/';

const decode = s => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');
const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escMd = s => s.replace(/\|/g, '\\|');

function meta(html, name) {
  // Accept both attribute orders: name/content and content/name
  const re1 = new RegExp(`<meta\\s+name=(["'])${name}\\1\\s+content=(["'])(.*?)\\2`, 'i');
  const re2 = new RegExp(`<meta\\s+content=(["'])(.*?)\\1\\s+name=(["'])${name}\\3`, 'i');
  const m1 = html.match(re1), m2 = !m1 && html.match(re2);
  const v = m1 ? m1[3] : m2 ? m2[2] : null;
  return v == null ? null : decode(v.trim());
}

function collectTools() {
  const tools = [];
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const file = join(ROOT, entry.name, 'index.html');
    if (!existsSync(file)) continue;
    const html = readFileSync(file, 'utf8');
    if (meta(html, 'tool:hidden') === 'true') continue;
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decode(titleMatch[1].trim()) : null;
    const description = meta(html, 'description');
    if (!title || !description) {
      console.warn(`! ${entry.name}/index.html: <title> or <meta name="description"> missing – skipped`);
      continue;
    }
    const tags = (meta(html, 'tool:tags') || '').split(',').map(t => t.trim()).filter(Boolean);
    const order = Number(meta(html, 'tool:order')) || 100;
    tools.push({ folder: entry.name, title, description, tags, order });
  }
  return tools.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'de'));
}

function renderCards(tools) {
  if (!tools.length) return '\n  <p class="muted">Noch keine Seiten.</p>\n  ';
  const cards = tools.map(t => `    <article class="card tool">
      <h2>${escHtml(t.title)}</h2>
      <p>${escHtml(t.description)}</p>
      <div class="tags">${t.tags.map(x => `<span class="tag">${escHtml(x)}</span>`).join('')}</div>
      <a class="btn primary" href="${t.folder}/">Öffnen</a>
    </article>`).join('\n');
  return `\n  <div class="grid">\n${cards}\n  </div>\n  `;
}

function renderTable(tools) {
  const rows = tools.map(t =>
    `| [${escMd(t.title)}](${SITE}${t.folder}/) | \`${t.folder}/\` | ${escMd(t.description)} |`);
  return '\n| Seite | Ordner | Beschreibung |\n|---|---|---|\n' + rows.join('\n') + '\n';
}

function replaceBlock(file, content) {
  const path = join(ROOT, file);
  const text = readFileSync(path, 'utf8');
  const a = text.indexOf(START), b = text.indexOf(END);
  if (a < 0 || b < a) throw new Error(`${file}: markers ${START} … ${END} not found`);
  const next = text.slice(0, a + START.length) + content + text.slice(b);
  return { path, file, changed: next !== text, next };
}

const check = process.argv.includes('--check');
const tools = collectTools();
const results = [
  replaceBlock('index.html', renderCards(tools)),
  replaceBlock('README.md', renderTable(tools)),
];

const outdated = results.filter(r => r.changed);
if (check) {
  if (outdated.length) {
    console.error(`Tool list outdated in: ${outdated.map(r => r.file).join(', ')}. Run: node scripts/build-index.mjs`);
    process.exit(1);
  }
  console.log(`Tool list up to date (${tools.length} tools).`);
} else {
  outdated.forEach(r => writeFileSync(r.path, r.next));
  console.log(`${tools.length} tools: ${tools.map(t => t.folder).join(', ')}` +
    (outdated.length ? ` – updated ${outdated.map(r => r.file).join(', ')}` : ' – no changes'));
}
