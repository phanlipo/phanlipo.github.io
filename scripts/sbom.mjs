#!/usr/bin/env node
// Software Bill of Materials (CycloneDX 1.6, JSON) of everything the site ships from third parties:
// the libraries in assets/vendor/ (configured in scripts/vendor.json).
//
//   renderSbom(...)   used by build.mjs → sbom.cdx.json (generated, never edit by hand; not published on the site)
//   node scripts/sbom.mjs --submit
//                     sends the libraries to GitHub's dependency graph (Dependency Submission API), so
//                     Dependabot alerts cover them too. Runs in pages.yml; needs GITHUB_TOKEN with contents: write.
//
// The SBOM is deterministic (no timestamp; the serial number is derived from the content): the same
// libraries give the same file, so `build.mjs --check` can verify it. Per library it records package URL (purl), licence,
// npm tarball with its integrity hash, the SHA-256 of every shipped file and which apps use it.
// Test tooling (package.json) is not shipped; GitHub's dependency graph lists it.

import { readFileSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ROOT } from './lib.mjs';

export const SBOM_FILE = 'sbom.cdx.json';
const SITE = 'https://phanlipo.github.io/';
const REPO = 'https://github.com/phanlipo/phanlipo.github.io';

// "@cantoo/pdf-lib" → pkg:npm/%40cantoo/pdf-lib@2.11.1
export const purl = (pkg, version) => `pkg:npm/${pkg.replace(/^@/, '%40')}@${encodeURIComponent(version)}`;
export const tarballUrl = (pkg, version) => `https://registry.npmjs.org/${pkg}/-/${pkg.split('/').pop()}-${version}.tgz`;

// npm integrity "sha512-<base64>" → CycloneDX hash { alg: 'SHA-512', content: <hex> }
function integrityHash(integrity) {
  const [algo, b64] = integrity.split('-');
  return { alg: algo.toUpperCase().replace(/^SHA/, 'SHA-'), content: Buffer.from(b64, 'base64').toString('hex') };
}

function files(dir) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...files(rel));
    else out.push(rel);
  }
  return out.sort();
}

// vendor: scripts/vendor.json; apps: [{ folder, title, vendors: [names] }]
export function renderSbom(vendor, apps) {
  const ref = name => `vendor:${name}`;
  const used = new Set(apps.flatMap(a => a.vendors));
  const libs = Object.entries(vendor).map(([name, e]) => {
    if (!e.integrity) throw new Error(`scripts/vendor.json: "${name}" has no integrity – run node scripts/vendor.mjs`);
    const scope = e.package.startsWith('@') ? e.package.split('/')[0] : null;
    const dir = `assets/vendor/${name}`;
    const usedBy = apps.filter(a => a.vendors.includes(name)).map(a => a.folder);
    return {
      type: 'library',
      'bom-ref': ref(name),
      ...(scope ? { group: scope } : {}),
      name: scope ? e.package.slice(scope.length + 1) : e.package,
      version: e.version,
      description: e.purpose,
      licenses: [{ license: { id: e.license } }],
      purl: purl(e.package, e.version),
      externalReferences: [
        { type: 'website', url: e.homepage },
        { type: 'distribution', url: tarballUrl(e.package, e.version), hashes: [integrityHash(e.integrity)] },
      ],
      properties: [
        { name: 'phanlipo:folder', value: dir },
        { name: 'phanlipo:used-by', value: usedBy.join(', ') || (name === 'tabler-icons' ? '(icons of every app, built by scripts/build-icons.mjs)' : '') },
        { name: 'phanlipo:offline-cache', value: e.precache === false ? 'on first use' : 'on install' },
        ...(e.maintenanceException ? [{ name: 'phanlipo:maintenance-exception', value: `until ${e.maintenanceException.until}: ${e.maintenanceException.reason}` }] : []),
      ],
      components: files(dir).map(f => ({
        type: 'file',
        'bom-ref': `file:${f}`,
        name: f,
        hashes: [{ alg: 'SHA-256', content: createHash('sha256').update(readFileSync(join(ROOT, f))).digest('hex') }],
      })),
    };
  });
  const appComponents = apps.map(a => ({
    type: 'application',
    'bom-ref': `app:${a.folder}`,
    name: a.folder,
    description: a.title,
    externalReferences: [{ type: 'website', url: `${SITE}${a.folder}/` }],
  }));
  const body = {
    metadata: {
      lifecycles: [{ phase: 'build' }],
      tools: { components: [{ type: 'application', name: 'scripts/build.mjs', externalReferences: [{ type: 'vcs', url: REPO }] }] },
      component: {
        type: 'application',
        'bom-ref': 'site',
        name: 'phanlipo.github.io',
        description: 'Statische Web-Tools (PWA) – nur die mitgelieferten Fremdbibliotheken aus assets/vendor/',
        externalReferences: [{ type: 'website', url: SITE }, { type: 'vcs', url: REPO }],
      },
    },
    components: [...appComponents, ...libs],
    dependencies: [
      { ref: 'site', dependsOn: [...apps.map(a => `app:${a.folder}`), ...Object.keys(vendor).filter(n => !used.has(n)).map(ref)] },
      ...apps.map(a => ({ ref: `app:${a.folder}`, dependsOn: a.vendors.map(ref) })),
      ...Object.entries(vendor).map(([name]) => ({
        ref: ref(name),
        dependsOn: Object.entries(vendor).filter(([, d]) => d.versionFrom?.entry === name).map(([n]) => ref(n)),
      })),
    ],
  };
  // Serial number (required by actions/attest): a UUID from the SHA-256 of the content, so it only
  // changes when the libraries or their files change
  const h = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-8${h.slice(13, 16)}-${(8 | (parseInt(h[16], 16) & 3)).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  const bom = {
    $schema: 'http://cyclonedx.org/schema/bom-1.6.schema.json',
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${uuid}`,
    version: 1,
    ...body,
  };
  return JSON.stringify(bom, null, 2) + '\n';
}

// Libraries of the SBOM as a dependency-graph snapshot (GitHub Dependency Submission API)
export function snapshot(bom, env) {
  const resolved = {};
  for (const c of bom.components.filter(c => c.type === 'library')) {
    resolved[c.purl] = { package_url: c.purl, relationship: 'direct', scope: 'runtime' };
  }
  return {
    version: 0,
    sha: env.GITHUB_SHA,
    ref: env.GITHUB_REF,
    job: { correlator: 'vendor-sbom', id: String(env.GITHUB_RUN_ID) },
    detector: { name: 'phanlipo-sbom', version: '1', url: `${REPO}/blob/main/scripts/sbom.mjs` },
    scanned: new Date().toISOString(),
    manifests: {
      'scripts/vendor.json': { name: 'scripts/vendor.json', file: { source_location: 'scripts/vendor.json' }, resolved },
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv.includes('--submit')) {
  const env = process.env;
  for (const k of ['GITHUB_TOKEN', 'GITHUB_REPOSITORY', 'GITHUB_SHA', 'GITHUB_REF', 'GITHUB_RUN_ID']) {
    if (!env[k]) throw new Error(`${k} not set`);
  }
  const bom = JSON.parse(readFileSync(join(ROOT, SBOM_FILE), 'utf8'));
  const body = snapshot(bom, env);
  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/dependency-graph/snapshots`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: 'application/vnd.github+json', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`dependency submission: ${res.status} ${await res.text()}`);
  console.log(`Submitted ${Object.keys(body.manifests['scripts/vendor.json'].resolved).length} libraries to the dependency graph.`);
}
