// Picks the tests a pull request needs from the files it changes, so a PR that touches one app does not
// wait for all ~4500 tests (.github/workflows/test.yml). Pushes to main still run everything, so anything
// this misses shows up there right after the merge.
//
//   node tests/select.mjs                     changes of this branch against origin/main
//   node tests/select.mjs --base <commit>     changes against another commit (CI: the PR's base)
//   node tests/select.mjs a/index.html b.css  these files
//   node tests/select.mjs --all               everything (CI: pushes to main, manual runs)
//
// Prints what it chose and why. With GITHUB_OUTPUT set (CI) it also writes
//   mode = all | some | none,  grep = Playwright --grep for "some" (empty otherwise),
//   total = number of Chromium runners, shards = [1, …, total]
//
// Rules – a file that matches none of them runs everything (better too much than too little):
//   - nothing:       *.md, LICENSE, other workflows, .githooks/, .claude/, eslint.config.mjs (ESLint runs
//                    anyway), tests/live/ and tests/manual/ (not part of this suite), assets/icons.svg
//                    (build.mjs stops in CI when the sprite does not match the pages), the generated
//                    NOTICE.md and sbom.cdx.json
//   - one app:       <app>/… (also template/), tests/<app>.spec.mjs → the tests named after the app (same
//                    --grep as npm run test:app) plus every spec that uses the app's page as its example
//                    (e.g. menu.spec.mjs opens dice-coin) – a spec that opens many apps names them in its titles
//   - shared code:   assets/shared/<f>, assets/vendor/<lib>/… → every app whose sw.js caches that file or
//                    library, plus tests/<f>.spec.mjs if it exists (p2p-connect.spec.mjs …)
//   - test helpers:  tests/<x>.mjs, tests/fixtures/<f> → the spec files that import or name them
//   - start page:    index.html, manifest.webmanifest, icon* at the top → the start page tests, which run
//                    with every selection anyway (the tool list changes with almost every app PR)
//   - everything:    assets/base.css, assets/common.js, scripts/, tests/helpers.mjs, tests/server.mjs,
//                    playwright.config.mjs, package.json, package-lock.json, test.yml, robots.txt, a deleted
//                    app folder, unknown files
// Every selection also runs build.spec.mjs (build check, vendor rules), select.spec.mjs and the start
// page tests.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { ROOT, allPages } from '../scripts/lib.mjs';

// Cheap checks that run with every selection: build check and vendor rules, this selection itself
const ALWAYS = ['build.spec.mjs', 'select.spec.mjs'];

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const read = f => readFileSync(join(ROOT, f), 'utf8');

export function changedFiles(base = 'origin/main') {
  const out = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

// Returns { all: true, reasons } or { apps, specs, partial, others, reasons } (sorted arrays):
// apps = run the tests named after them, specs = run these spec files whole, partial = run these spec
// files without the tests named after an app that is not selected (others)
export function select(files) {
  const folders = new Set(allPages().map(p => p.folder).filter(Boolean));
  const testFiles = readdirSync(join(ROOT, 'tests')).filter(f => f.endsWith('.mjs'));
  const specs = testFiles.filter(f => f.endsWith('.spec.mjs'));
  const swOf = Object.fromEntries([...folders].map(a => [a, existsSync(join(ROOT, a, 'sw.js')) ? read(`${a}/sw.js`) : '']));
  const apps = new Set(), pickedSpecs = new Set(), partial = new Set(), reasons = [];
  let all = false;
  const everything = (f, why) => { all = true; reasons.push(`${f}: ${why} → all tests`); };
  const addApps = (f, list, why) => {
    list.forEach(a => apps.add(a));
    reasons.push(`${f}: ${why} → ${list.length ? list.join(', ') : 'no app'}`);
  };
  const addSpecs = (f, list) => {
    list.forEach(s => pickedSpecs.add(s));
    reasons.push(`${f}: changed → ${list.join(', ')}`);
  };
  // Specs that use a helper or fixture: an app's own spec stands for the app, a general spec runs
  // without the tests of other apps (webmcp.spec.mjs imports pdf-tools.mjs for the PDF apps)
  const addUsers = (f, list) => {
    const own = list.map(s => basename(s, '.spec.mjs')).filter(a => folders.has(a));
    own.forEach(a => apps.add(a));
    const general = list.filter(s => !folders.has(basename(s, '.spec.mjs')));
    general.forEach(s => partial.add(s));
    reasons.push(`${f}: used by → ${[...own, ...general.map(s => `${s} (partly)`)].join(', ')}`);
  };
  // Test files (specs or helpers) that import or name a file, following helpers up to the specs
  const importers = name => {
    const found = new Set(), todo = [name];
    while (todo.length) {
      const n = todo.pop();
      const re = new RegExp(`['"\`/]${esc(n)}['"\`]`);
      for (const t of testFiles) {
        if (found.has(t) || t === n || !re.test(read(`tests/${t}`))) continue;
        found.add(t);
        if (!t.endsWith('.spec.mjs')) todo.push(t);
      }
    }
    return [...found].filter(t => t.endsWith('.spec.mjs'));
  };

  for (const f of files) {
    const parts = f.split('/');
    const top = parts[0];
    if (f.endsWith('.md') || f === 'LICENSE' || f === 'NOTICE.md' || f === 'sbom.cdx.json' || f === 'eslint.config.mjs'
      || f === 'assets/icons.svg' || ['.githooks', '.claude'].includes(top)
      || (top === '.github' && f !== '.github/workflows/test.yml')
      || (top === 'tests' && ['live', 'manual'].includes(parts[1]))) {
      reasons.push(`${f}: not needed by the tests`);
    } else if (parts.length === 1 && /^(index\.html|manifest\.webmanifest|icon[\w-]*\.(svg|png))$/.test(f)) {
      reasons.push(`${f}: start page tests`);
    } else if (top === 'assets' && (parts[1] === 'shared' || parts[1] === 'vendor') && parts.length > 2) {
      const path = parts[1] === 'shared' ? `../${f}` : `../assets/vendor/${parts[2]}/`;
      const users = [...folders].filter(a => swOf[a].includes(`"${path}`));
      const spec = `${basename(f).replace(/\.[^.]+$/, '')}.spec.mjs`;
      const own = parts[1] === 'shared' && specs.includes(spec);
      if (own) pickedSpecs.add(spec);
      if (!users.length && !own) everything(f, 'no app caches it');
      else addApps(f, users, `cached by${own ? ` (and ${spec})` : ''}`);
    } else if (folders.has(top)) {
      addApps(f, [top], 'app');
    } else if (top === 'tests' && parts.length === 2 && f.endsWith('.spec.mjs')) {
      const app = basename(f, '.spec.mjs');
      if (folders.has(app)) addApps(f, [app], 'tests of');
      else if (existsSync(join(ROOT, f))) addSpecs(f, [parts[1]]);
      else everything(f, 'removed spec');
    } else if (top === 'tests' && (parts[1] === 'fixtures' || (parts.length === 2 && f.endsWith('.mjs')))
      && !['tests/helpers.mjs', 'tests/server.mjs'].includes(f)) {
      const users = importers(parts.at(-1));
      if (users.length) addUsers(f, users);
      else if (/^tests\/(app|flaky-summary)\.mjs$/.test(f)) reasons.push(`${f}: not needed by the tests`);
      else everything(f, 'used by no spec file');
    } else {
      everything(f, existsSync(join(ROOT, f)) ? 'shared by all' : 'removed or unknown');
    }
  }
  if (all) return { all: true, reasons };

  // General specs that open a selected app's page by its path, e.g. menu.spec.mjs tests the menu on
  // dice-coin: they run without the tests named after other apps
  for (const s of specs) {
    if (pickedSpecs.has(s) || partial.has(s) || folders.has(basename(s, '.spec.mjs'))) continue;
    const text = read(`tests/${s}`);
    const hit = [...apps].filter(a => new RegExp(`['"\`]/${esc(a)}/`).test(text));
    if (hit.length) {
      partial.add(s);
      reasons.push(`${s}: opens ${hit.join(', ')} → ${s} (partly)`);
    }
  }
  const sorted = set => [...set].sort();
  return { apps: sorted(apps), specs: sorted(pickedSpecs), partial: sorted([...partial].filter(s => !pickedSpecs.has(s))),
    others: [...folders].filter(a => !apps.has(a)).sort(), reasons };
}

// Playwright --grep for a selection. The title it matches starts with the spec file name. Parts:
// the app names as whole words (like tests/app.mjs) and "start page", the whole spec files plus
// ALWAYS, the partial spec files without any test that names an app that is not selected
export function grepFor({ apps, specs, partial, others }) {
  const word = list => `(?<![\\w-])(${list.map(esc).join('|')})(?![\\w-])`;
  const files = list => `(${list.map(esc).join('|')})`;
  const parts = [word([...apps, 'start page']), files([...new Set([...specs, ...ALWAYS])])];
  if (partial.length) parts.push(`^(?=.*${files(partial)})(?!.*${word(others)})`);
  return parts.join('|');
}

// Runners for the Chromium tests: the whole suite (~4500 tests) on 3, one app (~100) fits on one
export function runners(sel) {
  if (sel.all) return 3;
  const n = sel.apps.length + sel.specs.length + sel.partial.length;
  return n < 8 ? 1 : n < 20 ? 2 : 3;
}

if (process.argv[1] === import.meta.filename) {
  const args = process.argv.slice(2);
  const b = args.indexOf('--base');
  const sel = args.includes('--all') ? { all: true, reasons: ['push or manual run → all tests'] }
    : select(b >= 0 ? changedFiles(args[b + 1]) : args.length ? args : changedFiles());
  const touched = !sel.all && (sel.apps.length || sel.specs.length || sel.partial.length || sel.reasons.some(r => r.endsWith('start page tests')));
  const mode = sel.all ? 'all' : touched ? 'some' : 'none';
  const grep = mode === 'some' ? grepFor(sel) : '';
  const total = runners(sel);
  console.log(sel.reasons.join('\n') || 'no changed files');
  console.log(`\nmode: ${mode}, runners: ${mode === 'none' ? 0 : total}` +
    (grep ? `\ngrep: ${grep}\nlocally: npx playwright test --project=chromium --grep '${grep}'` : ''));
  if (process.env.GITHUB_OUTPUT) {
    const shards = JSON.stringify(Array.from({ length: total }, (_, i) => i + 1));
    appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\ngrep=${grep}\ntotal=${total}\nshards=${shards}\n`);
  }
}
