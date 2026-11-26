// Sets the German names in anatomy/models/index.json again from names-de.mjs – without the Blender export.
// pack.mjs does the same when the models are rebuilt; use this after adding names (geometry stays untouched).
//   node scripts/anatomy/rename.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { germanName } from './names-de.mjs';

const FILE = join(dirname(fileURLToPath(import.meta.url)), '../../anatomy/models/index.json');
const index = JSON.parse(readFileSync(FILE, 'utf8'));
let changed = 0, missing = 0;
for (const p of index.parts) {           // [layer, English, side, Latin, German, …] – see pack.mjs
  const de = germanName(p[1]) || '';
  if (de !== p[4]) { p[4] = de; changed++; }
  if (!de) missing++;
}
writeFileSync(FILE, JSON.stringify(index) + '\n');
console.log(`${index.parts.length} parts; ${changed} German names changed, ${missing} without German name`);
