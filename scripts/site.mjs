// Copies the files GitHub Pages publishes (rule: isPublished in lib.mjs) into a folder.
// Used by .github/workflows/pages.yml:  node scripts/site.mjs _site
import { readdirSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, posix, dirname, resolve } from 'node:path';
import { ROOT, isPublished } from './lib.mjs';

const out = resolve(process.argv[2] || '_site');
if (out === resolve(ROOT) || !out.startsWith(resolve(ROOT) + '/')) throw new Error(`Zielordner muss im Repository liegen: ${out}`);
rmSync(out, { recursive: true, force: true });
const outRel = posix.relative(ROOT, out);

let n = 0;
function walk(dir) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? posix.join(dir, e.name) : e.name;
    if (rel === outRel || e.name.startsWith('.') || e.name === 'node_modules') continue;
    if (e.isDirectory()) walk(rel);
    else if (isPublished(rel)) {
      mkdirSync(dirname(join(out, rel)), { recursive: true });
      copyFileSync(join(ROOT, rel), join(out, rel));
      n++;
    }
  }
}
walk('');
console.log(`${n} Dateien nach ${outRel}/`);
