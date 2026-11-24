#!/usr/bin/env node
// Packs the meshes exported from Z-Anatomy (scripts/anatomy/export.py, run inside Blender) into the files the
// anatomy app loads: anatomy/models/<layer>.bin (geometry) and anatomy/models/index.json (parts, names, colours).
// Usage (details in anatomy/README.md):
//   node scripts/anatomy/pack.mjs <export folder> <Z-Anatomy TA2.csv>
//
// <layer>.bin: Uint16 positions (x, y, z per vertex, quantised to the body's bounding box from index.json), then
// Uint16 indices, each relative to the first vertex of its part. A part is [v0, vertex count, i0, index count]
// in elements of these two arrays. Normals are computed in the browser (smaller files).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { germanName } from './names-de.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'anatomy/models');
const [src, ta2] = process.argv.slice(2);
if (!src || !ta2) { console.error('Usage: node scripts/anatomy/pack.mjs <export folder> <TA2.csv>'); process.exit(1); }

// Order = order of the layer chips in the app
const LAYERS = ['skin', 'muscles', 'skeleton', 'organs', 'vessels', 'nerves', 'lymph'];

// English → Latin (Terminologia Anatomica, as shipped with Z-Anatomy)
const latin = new Map();
for (const line of readFileSync(ta2, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
  const f = line.trim().replace(/^"|"$/g, '').split(';');
  if (f.length >= 3 && f[1] && !latin.has(f[1].trim().toLowerCase())) latin.set(f[1].trim().toLowerCase(), f[2].trim());
}

// Structures left out: duplicates of a whole organ (liver segments), inner linings, broken names in the source
const SKIP = /segment of liver|^Mucosa of stomach$|^Lat_|\?|^Central canal'$/;
const clean = name => name.replace(/\s*\(\/\/.*\)\s*/g, '').replace(/^\((.*)\)$/, '$1').replace(/\.$/, '').trim();

const hex = s => parseInt(s.slice(1), 16);
// Colours by layer and name (Z-Anatomy's own materials are mostly plain grey)
function colour(layer, en, src) {
  const n = en.toLowerCase();
  switch (layer) {
    case 'skin':
      if (/hair/.test(n)) return '#4a3528';
      if (/nail|perionyx/.test(n)) return '#efc9bb';
      return '#e2b293';
    case 'skeleton':
      if (/incisor|canine|molar/.test(n)) return '#faf6ec';
      if (/cartilage/.test(n)) return '#a9cbd6';
      if (/sinus|cells of ethmoid/.test(n)) return '#cfc6b0';
      return '#e8dcc0';
    case 'muscles':
      if (/tendon|tract|ligament|septum|linea alba|ring|arch|sheath|tarsus|trochlea/.test(n)) return '#e4dac5';
      return '#b9453e';
    case 'vessels':
      if (/leaflet/.test(n)) return '#ead9c4';
      if (/atrium|ventricle|papillary/.test(n)) return '#a63438';
      if (src[2] > src[0] + 0.2) return '#3d5fb8';   // Z-Anatomy: veins (and pulmonary arteries) are blue
      if (src[2] > 0.5 && src[0] < 0.5) return '#6a4cb0';
      return '#cc3a32';
    case 'nerves':
      if (/nerve|branch|plexus|trunk|ganglia|ganglion|root|cauda|chorda|division|cord of/.test(n) && !/nucleus/.test(n)) return '#efc843';
      if (/cornea|lens|vitreous|chamber|segment of eyeball|zonular/.test(n)) return '#bcd8ea';
      if (/sclera|retina|iris/.test(n)) return /iris/.test(n) ? '#5a7fa8' : '#f1ece4';
      if (/cochlea|vestibule|tympanic|auditory/.test(n)) return '#d9c1a8';
      if (/lacrimal|nasolacrimal/.test(n)) return '#9fc3d8';
      if (/ventricle|aqueduct|canal/.test(n)) return '#8fb5d8';
      if (/white matter|corpus callosum|fasciculus|tract|commissure|fornix/.test(n)) return '#f2e8dc';
      return '#e3a9a3';
    case 'organs':
      if (/lung/.test(n) && /lobe/.test(n)) return '#e99aa3';
      if (/bronch|trachea|epiglottis/.test(n)) return '#c3d5de';
      if (/liver/.test(n)) return '#8b3a2b';
      if (/gallbladder|bile/.test(n)) return '#4f8a3a';
      if (/stomach/.test(n)) return '#df7f68';
      if (/colon|jejunum|duodenum|appendix|taenia/.test(n)) return '#dfa07c';
      if (/kidney|renal/.test(n)) return '#a5433a';
      if (/ureter|bladder|urethra/.test(n)) return '#e2c35a';
      if (/thyroid|suprarenal|pineal|hypophysis/.test(n)) return '#c45a6f';
      if (/pancrea/.test(n)) return '#e6c07a';
      if (/parotid|sublingual|submandibular/.test(n)) return '#e8ae7a';
      if (/oesophagus|pharynx/.test(n)) return '#d88a88';
      if (/tongue|palate|uvula|gingiva/.test(n)) return '#d26a74';
      return '#c98a9a';                               // genital organs
    case 'lymph':
      if (/spleen/.test(n)) return '#7d2d4a';
      if (/thymus/.test(n)) return '#d9a0b0';
      if (/tonsil/.test(n)) return '#c06070';
      return '#86b552';
  }
  return '#cccccc';
}

const layers = [];
for (const id of LAYERS) {
  const meta = JSON.parse(readFileSync(join(src, `${id}.json`), 'utf8'));
  const pos = new Float32Array(readFileSync(join(src, `${id}.pos.f32`)).buffer.slice(0));
  const idx = new Uint32Array(readFileSync(join(src, `${id}.idx.u32`)).buffer.slice(0));
  layers.push({ id, meta, pos, idx });
}

// One bounding box for the whole body, so all layers line up
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (const { pos } of layers) for (let i = 0; i < pos.length; i++) {
  const a = i % 3; if (pos[i] < min[a]) min[a] = pos[i]; if (pos[i] > max[a]) max[a] = pos[i];
}
const round = v => Math.round(v * 1e5) / 1e5;
const bmin = min.map(v => round(v - 0.001)), bmax = max.map(v => round(v + 0.001));
const q = (v, a) => Math.round((v - bmin[a]) / (bmax[a] - bmin[a]) * 65535);

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
const parts = [], index = [];
const missing = { de: 0, la: 0 };
layers.forEach(({ id, meta, pos, idx }, li) => {
  const qpos = [], qidx = [];
  let vCount = 0, iCount = 0;
  for (const p of meta.parts) {
    const side = /\.l$/.test(p.name) ? 'l' : /\.r$/.test(p.name) ? 'r' : '';
    const en = clean(p.name.replace(/\.[lr]$/, ''));
    if (SKIP.test(p.name) || !en) continue;
    const [v0, vn] = p.v, [i0, inn] = p.i;
    if (vn > 65535) throw new Error(`${p.name}: too many vertices for Uint16 indices`);
    for (let k = v0 * 3; k < (v0 + vn) * 3; k++) qpos.push(q(pos[k], k % 3));
    for (let k = i0; k < i0 + inn; k++) qidx.push(idx[k]);
    const la = latin.get(en.toLowerCase()) || '';
    const de = germanName(en) || '';
    if (!de) missing.de++;
    if (!la) missing.la++;
    parts.push([li, en, side, la, de, hex(colour(id, en, p.color)), vCount, vn, iCount, inn]);
    vCount += vn; iCount += inn;
  }
  const buf = Buffer.alloc(qpos.length * 2 + qidx.length * 2);
  let o = 0;
  for (const v of qpos) { buf.writeUInt16LE(v, o); o += 2; }
  for (const v of qidx) { buf.writeUInt16LE(v, o); o += 2; }
  writeFileSync(join(OUT, `${id}.bin`), buf);
  index.push({ id, file: `${id}.bin`, verts: vCount, tris: iCount / 3, bytes: buf.length });
  console.log(`${id}: ${parts.filter(p => p[0] === li).length} parts, ${vCount} vertices, ${iCount / 3} triangles, ${(buf.length / 1048576).toFixed(2)} MB`);
});
const out = {
  format: 1,
  source: 'Z-Anatomy (CC BY-SA 4.0), based on BodyParts3D (DBCLS, CC BY-SA 2.1 JP) – reduced for the web',
  bounds: { min: bmin, max: bmax },
  layers: index,
  // [layer, English, side (l/r/''), Latin, German ('' = show Latin), colour, v0, vertex count, i0, index count]
  parts,
};
writeFileSync(join(OUT, 'index.json'), JSON.stringify(out) + '\n');
writeFileSync(join(OUT, 'LICENSE.txt'), `3D models of the anatomy app (anatomy/models/*.bin, index.json)

Derived from "Z-Anatomy - The libre 3D atlas of anatomy" (https://www.z-anatomy.com/,
https://github.com/Z-Anatomy/Models-of-human-anatomy), licence CC BY-SA 4.0
(https://creativecommons.org/licenses/by-sa/4.0/), which is based on
"BodyParts3D - The Database Center for Life Science" (https://dbarchive.biosciencedbc.jp/en/bodyparts3d/),
licence CC BY-SA 2.1 Japan. Latin names: Terminologia Anatomica as included in Z-Anatomy.

Changes: meshes simplified (fewer triangles), coordinates quantised to 16 bits, colours assigned per structure,
some structures left out (membranes, fasciae, duplicate liver segments), German names added.
These derived models are licensed under CC BY-SA 4.0 as well.
How they are made: scripts/anatomy/ and anatomy/README.md in https://github.com/phanlipo/phanlipo.github.io
`);
console.log(`${parts.length} parts; without German name: ${missing.de}, without Latin: ${missing.la}`);
