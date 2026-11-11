// Runs only the tests of one app: its own tests/<app>.spec.mjs and every general check that names the
// app (site, menu, a11y, i18n, diag, webmcp, install, update …) – a quick check before pushing, instead of
// the whole suite. CI still runs everything.
//   npm run test:app -- pdf-viewer               (Chromium)
//   npm run test:app -- pdf-viewer --repeat-each=5 --workers=4   (extra arguments go to Playwright)
//   npm run test:app -- pdf-viewer --project=webkit             (basic check in WebKit, if installed)
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, allPages } from '../scripts/lib.mjs';

const [folder, ...rest] = process.argv.slice(2);
const folders = allPages().map(p => p.folder).filter(Boolean);
if (!folder || !folders.includes(folder)) {
  console.error(`Usage: npm run test:app -- <app folder> [playwright options]\n${folder ? `Unknown app "${folder}". ` : ''}Apps: ${folders.join(', ')}`);
  process.exit(2);
}

// The folder name as a whole word in the test title ("pdf-edit" must not pick up "pdf-edit-x" or match
// inside "pdf2word"); the title includes the file name, so the app's own spec file matches as well
const esc = folder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const grep = `(?<![\\w-])${esc}(?![\\w-])`;
const project = rest.some(a => a.startsWith('--project')) ? [] : ['--project=chromium'];
if (!existsSync(join(ROOT, 'tests', `${folder}.spec.mjs`))) console.warn(`Note: tests/${folder}.spec.mjs does not exist – only the general checks run.`);

const r = spawnSync('npx', ['playwright', 'test', ...project, '--grep', grep, ...rest], { stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
