#!/usr/bin/env node
// Manages third-party libraries in assets/vendor/ (no CDN at runtime → works offline as PWA).
// Configuration: scripts/vendor.json (package, pinned version, licence, which files).
//
// Usage:
//   node scripts/vendor.mjs                  download every library whose folder is missing or outdated
//   node scripts/vendor.mjs --force          download everything again
//   node scripts/vendor.mjs --check          list libraries with a newer version on npm (no changes)
//   node scripts/vendor.mjs --check --markdown <file>   same, write a Markdown report (used by the GitHub Action)
//   node scripts/vendor.mjs --update <name>  set <name> (or "all") to the latest version and download it
//
// Each library folder gets LICENSE (from the package) and SOURCE.md (origin, version, integrity).
// assets/vendor/README.md lists all libraries.
// Files come from the npm registry tarball; its integrity hash is verified before anything is written.

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT, npmFiles, npmLatest } from './lib.mjs';

const CONFIG = join(ROOT, 'scripts/vendor.json');
const VENDOR = join(ROOT, 'assets/vendor');
const LICENSE_NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md', 'LICENCE'];

const args = process.argv.slice(2);
const flag = f => args.includes(f);
const arg = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

const config = JSON.parse(readFileSync(CONFIG, 'utf8'));
const today = new Date().toISOString().slice(0, 10);

// "dist/fonts/*.woff2" -> RegExp; only "*" inside the last path segment is supported
const globRe = g => new RegExp('^' + g.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*') + '$');

function installedVersion(name) {
  const f = join(VENDOR, name, 'SOURCE.md');
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(/^- Version: (.+)$/m);
  return m ? m[1].trim() : null;
}

async function download(name, entry) {
  const { files, tarball, integrity } = await npmFiles(entry.package, entry.version);
  const dir = join(VENDOR, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const written = [];
  for (const pattern of entry.files) {
    const re = globRe(pattern);
    const hits = [...files.keys()].filter(p => re.test(p)).sort();
    if (!hits.length) throw new Error(`${name}: no file matches "${pattern}" in ${entry.package}@${entry.version}`);
    for (const p of hits) {
      const rel = entry.strip && p.startsWith(entry.strip) ? p.slice(entry.strip.length) : p;
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), files.get(p));
      written.push(rel);
    }
  }
  const lic = LICENSE_NAMES.find(n => files.has(n));
  if (!lic) throw new Error(`${name}: no licence file in package`);
  writeFileSync(join(dir, 'LICENSE'), files.get(lic));

  writeFileSync(join(dir, 'SOURCE.md'), `# ${name}

Automatisch erzeugt von \`scripts/vendor.mjs\` – nicht von Hand ändern.

- Paket: \`${entry.package}\`
- Version: ${entry.version}
- Lizenz: ${entry.license} (siehe \`LICENSE\`)
- Projekt: ${entry.homepage}
- Herkunft: ${tarball}
- Integrität: \`${integrity}\`
- Heruntergeladen: ${today}
- Zweck: ${entry.purpose}

Dateien:
${written.length ? written.map(f => `- \`${f}\``).join('\n') : '- (keine – nur Lizenz)'}
`);
  console.log(`✓ ${name} ${entry.version} (${written.length} Dateien)`);
}

function writeIndex() {
  const rows = Object.entries(config).map(([name, e]) =>
    `| [${name}](${name}/SOURCE.md) | \`${e.package}\` | ${e.version} | [${e.license}](${name}/LICENSE) | ${e.purpose} |`);
  writeFileSync(join(VENDOR, 'README.md'), `# Fremdbibliotheken (vendor)

Automatisch erzeugt von \`scripts/vendor.mjs\` aus \`scripts/vendor.json\` – nicht von Hand ändern.

Die Bibliotheken liegen lokal im Repository, damit die Seiten ohne CDN und offline (PWA) funktionieren.
Jeder Ordner enthält die Original-Lizenz (\`LICENSE\`) und die Herkunft (\`SOURCE.md\`).

| Name | npm-Paket | Version | Lizenz | Zweck |
|---|---|---|---|---|
${rows.join('\n')}

## Aktualisieren

- Prüfen: \`node scripts/vendor.mjs --check\` (läuft monatlich als GitHub Action und öffnet bei Bedarf ein Issue)
- Aktualisieren: \`node scripts/vendor.mjs --update <name>\`, danach die betroffenen Seiten testen
`);
}

async function check() {
  const outdated = [];
  for (const [name, e] of Object.entries(config)) {
    const latest = await npmLatest(e.package);
    // Breaking per semver: major changed, or minor changed while major is 0 (0.x)
    const [a1, a2] = e.version.split('.').map(Number), [b1, b2] = latest.split('.').map(Number);
    const breaking = b1 !== a1 || (a1 === 0 && b2 !== a2);
    if (latest !== e.version) outdated.push({ name, pkg: e.package, current: e.version, latest, major: breaking });
    console.log(`${latest === e.version ? '✓' : '↑'} ${name}: ${e.version}${latest === e.version ? '' : ` → ${latest}`}`);
  }
  const md = arg('--markdown');
  if (md) {
    writeFileSync(md, outdated.length ? `Für folgende Bibliotheken in \`assets/vendor/\` gibt es neuere Versionen:

| Name | Paket | Aktuell | Neu | Hinweis |
|---|---|---|---|---|
${outdated.map(o => `| ${o.name} | [\`${o.pkg}\`](https://www.npmjs.com/package/${o.pkg}?activeTab=versions) | ${o.current} | ${o.latest} | ${o.major ? '⚠️ kann inkompatibel sein – Changelog prüfen' : ''} |`).join('\n')}

**Aktualisieren:** \`node scripts/vendor.mjs --update <name>\`, dann die betroffenen Seiten testen (Zweck siehe \`assets/vendor/README.md\`).
` : '');
  }
  return outdated;
}

if (flag('--check')) {
  const o = await check();
  console.log(o.length ? `${o.length} Update(s) verfügbar.` : 'Alles aktuell.');
} else {
  const upd = arg('--update');
  if (upd) {
    const names = upd === 'all' ? Object.keys(config) : [upd];
    for (const n of names) {
      if (!config[n]) throw new Error(`Unbekannt: ${n}`);
      config[n].version = await npmLatest(config[n].package);
    }
    writeFileSync(CONFIG, JSON.stringify(config, null, 2) + '\n');
  }
  for (const [name, e] of Object.entries(config)) {
    if (flag('--force') || installedVersion(name) !== e.version) await download(name, e);
    else console.log(`= ${name} ${e.version}`);
  }
  writeIndex();
}
