#!/usr/bin/env node
// Generates the parts of the site that must stay in sync across pages:
//   1. Tool list on the start page (index.html) and in README.md
//      – from the metadata in each tool folder's index.html
//   2. Shared footer line in every page – from scripts/partials/footer.html
//
// Usage:
//   node scripts/build-index.mjs          update files
//   node scripts/build-index.mjs --check  only check; exit code 1 if something is outdated
//   node scripts/build-index.mjs --print-changed  update and print changed files (for the git hook)
//
// A folder is listed when it has an index.html with <title> and <meta name="description">.
// Skipped: hidden folders, assets/, scripts/, template/ and pages with <meta name="tool:hidden" content="true">.
// Optional metadata: tool:tags ("a, b"), tool:order (number), tool:icon / tool:color (see build-icons.mjs).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, decode, meta, allPages } from './lib.mjs';

const SKIP = new Set(['assets', 'scripts', 'template', 'node_modules']);
const SITE = 'https://phanlipo.github.io/';

const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escMd = s => s.replace(/\|/g, '\\|');

function collectTools() {
  const tools = [];
  for (const { folder, file } of allPages()) {
    if (!folder || SKIP.has(folder)) continue;
    const html = readFileSync(join(ROOT, file), 'utf8');
    if (meta(html, 'tool:hidden') === 'true') continue;
    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decode(titleMatch[1].trim()) : null;
    const description = meta(html, 'description');
    if (!title || !description) {
      console.warn(`! ${file}: <title> or <meta name="description"> missing – skipped`);
      continue;
    }
    const tags = (meta(html, 'tool:tags') || '').split(',').map(t => t.trim()).filter(Boolean);
    const order = Number(meta(html, 'tool:order')) || 100;
    const icon = existsSync(join(ROOT, folder, 'icon.svg'));
    tools.push({ folder, title, description, tags, order, icon });
  }
  return tools.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'de'));
}

function renderCards(tools) {
  if (!tools.length) return '\n  <p class="muted">Noch keine Seiten.</p>\n  ';
  const cards = tools.map(t => `    <article class="card tool">
      <h2>${t.icon ? `<img src="${t.folder}/icon.svg" alt="" width="32" height="32">` : ''}${escHtml(t.title)}</h2>
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

// Replace the text between <!-- name:start --> and <!-- name:end -->; null if markers are missing.
function replaceBlock(text, name, content) {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const a = text.indexOf(start), b = text.indexOf(end);
  if (a < 0 || b < a) return null;
  return text.slice(0, a + start.length) + content + text.slice(b);
}

const check = process.argv.includes('--check');
const tools = collectTools();
const footer = readFileSync(join(ROOT, 'scripts/partials/footer.html'), 'utf8').trim();

// file -> list of [block name, content, required]
const jobs = new Map();
const add = (file, ...job) => jobs.set(file, [...(jobs.get(file) || []), job]);
add('index.html', 'tools', renderCards(tools), true);
add('README.md', 'tools', renderTable(tools), true);
for (const { file } of allPages()) add(file, 'footer', `\n  ${footer}\n  `, false);

const outdated = [];
for (const [file, list] of jobs) {
  const path = join(ROOT, file);
  const before = readFileSync(path, 'utf8');
  let text = before;
  for (const [name, content, required] of list) {
    const next = replaceBlock(text, name, content);
    if (next == null) {
      if (required) throw new Error(`${file}: markers <!-- ${name}:start --> … <!-- ${name}:end --> not found`);
      continue;
    }
    text = next;
  }
  if (text !== before) {
    outdated.push(file);
    if (!check) writeFileSync(path, text);
  }
}

if (check) {
  if (outdated.length) {
    console.error(`Outdated: ${outdated.join(', ')}. Run: node scripts/build-index.mjs`);
    process.exit(1);
  }
  console.log(`Up to date (${tools.length} tools).`);
} else if (process.argv.includes('--print-changed')) {
  // Used by the git hook: one changed file per line
  outdated.forEach(f => console.log(f));
} else {
  console.log(`${tools.length} tools: ${tools.map(t => t.folder).join(', ')}` +
    (outdated.length ? ` – updated ${outdated.join(', ')}` : ' – no changes'));
}
