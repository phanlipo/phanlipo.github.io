// Copies the files GitHub Pages publishes (rule: isPublished in lib.mjs) into a folder.
// Used by .github/workflows/pages.yml:  node scripts/site.mjs _site
import { mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname, resolve, posix } from 'node:path';
import { ROOT, publishedFiles } from './lib.mjs';

const out = resolve(process.argv[2] || '_site');
const outRel = posix.relative(ROOT, out);
// Inside the repository and starting with "_", so it is never taken for a page or published itself
if (!outRel || outRel.startsWith('..') || !outRel.startsWith('_')) throw new Error(`Zielordner muss im Repository liegen und mit _ beginnen: ${out}`);
rmSync(out, { recursive: true, force: true });

const files = publishedFiles();
for (const rel of files) {
  mkdirSync(dirname(join(out, rel)), { recursive: true });
  copyFileSync(join(ROOT, rel), join(out, rel));
}
console.log(`${files.length} Dateien nach ${outRel}/`);
