#!/usr/bin/env node
// Creates quartet/decks.js from the decks of the supertrumpf-creator repository (cards_data/*.json):
// names, groups, the numeric categories and the short German card texts – no images.
//   node scripts/quartet-decks.mjs ../supertrumpf-creator/cards_data
// Categories with text values (capital, district …) are left out; a card shows 4 to 6 values – decks with fewer
// numeric categories are not taken over, more than 6 are cut to the first 6.
// Countries get their ISO code (flag from the vendor package flag-icons, taken from the flag URL of the source).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib.mjs';

const SRC = process.argv[2];
if (!SRC) { console.error('usage: node scripts/quartet-decks.mjs <supertrumpf-creator>/cards_data'); process.exit(1); }

// File, emoji (picture of the deck), English title
const DECKS = [
  ['dinosaurs', '🦖', 'Dinosaurs'], ['tiere', '🐘', 'Animal Kingdom'], ['autos', '🚗', 'Cars'],
  ['grossstaedte', '🏙️', 'German Cities'], ['countries_continents', '🌍', 'Countries of the World'],
  ['einhoerner', '🦄', 'Unicorns'], ['prinzessinnen', '👑', 'Princesses'], ['pflanzen', '🌳', 'Plant Kingdom'],
  ['lebensmittel', '🍎', 'Food'], ['wolken', '☁️', 'Clouds'], ['seuchen', '🦠', 'Diseases'],
  ['teilchenzoo', '⚛️', 'Particle Zoo'], ['beschleuniger', '🧲', 'Particle Accelerators'],
  ['berlin_sehenswuerdigkeiten', '🐻', 'Berlin Sights'], ['bundesliga', '⚽', 'Bundesliga 2026/27'],
  ['bierstile', '🍺', 'Beer Styles'], ['hopfen', '🌿', 'Hop Varieties'],
  // Not taken over (only 3 numeric categories): arzneimittel, gewerkschaften, biblische_persoenlichkeiten
];
const MIN = 4, MAX = 6;
const CAT_EN = {
  'Größe': 'Size', 'Gewicht': 'Weight', 'Alter': 'Age', 'Intelligenz': 'Intelligence', 'Tempo': 'Speed',
  'Bisskraft': 'Bite force', 'Beine': 'Legs', 'Gefährdung': 'Endangered', 'Baujahr': 'Year built', 'Leistung': 'Power',
  'Länge': 'Length', 'Einwohner': 'Population', 'Fläche': 'Area', 'Dichte': 'Density', 'Großstadt seit': 'City since',
  'BIP': 'GDP', 'Erhebung': 'Highest point', 'Glitzer': 'Glitter', 'Beschleunigung': 'Acceleration', 'Hornlänge': 'Horn length',
  'Zauberkraft': 'Magic', 'Mut': 'Courage', 'Freundlichkeit': 'Kindness', 'Tanzkunst': 'Dancing', 'Kronenglanz': 'Crown shine',
  'Höhe': 'Height', 'Wuchstempo': 'Growth rate', 'Blütenblätter': 'Petals', 'Giftigkeit': 'Toxicity', 'Kalorien': 'Calories',
  'Eiweiß': 'Protein', 'Zucker': 'Sugar', 'Wasseranteil': 'Water', 'Fett': 'Fat', 'Ballaststoffe': 'Fibre',
  'Temperatur': 'Temperature', 'Wassergehalt': 'Water content', 'Niederschlag': 'Precipitation', 'Ansteckung': 'Contagion',
  'Letalität': 'Lethality', 'Inkubation': 'Incubation', 'Masse': 'Mass', 'Ladung': 'Charge', 'Spin': 'Spin', 'Entdeckt': 'Discovered',
  'Energie': 'Energy', 'Länder': 'Countries', 'Nutzer': 'Users', 'Besucher': 'Visitors', 'Eintritt': 'Admission', 'Bewertung': 'Rating',
  'Stadion': 'Stadium', 'Gründungsjahr': 'Founded', 'Mitglieder': 'Members', 'Titel': 'Titles', 'Zuschauer': 'Attendance',
  'Stammwürze': 'Original gravity', 'Alkohol': 'Alcohol', 'Bitterkeit': 'Bitterness', 'Farbe': 'Colour', 'Alphasäure': 'Alpha acid',
  'Betasäure': 'Beta acid', 'Hopfenöl': 'Hop oil', 'Myrcen': 'Myrcene', 'Zulassung': 'Approved', 'Halbwertszeit': 'Half-life',
  'Bioverfügbarkeit': 'Bioavailability', 'Frauenanteil': 'Women', 'Kinder': 'Children', 'Verfasste Bücher': 'Books written',
};
const UNIT_EN = { 'Mio. J.': 'M yrs', 'Jahre': 'yrs', 'Mio./Jahr': 'M/yr', '/Jahr': '/yr', 'Plätze': 'seats', 'Tsd.': 'k', 'Mio.': 'M',
  'Mrd. $': 'bn $', 'Tage': 'days', 'Pkt.': 'pts', 'cm/Jahr': 'cm/yr', '% vol.': '% ABV', 'Ø': 'avg' };
const UNIT_FIX = { '$\\hbar$': 'ħ' };                       // LaTeX in the source
const LOW = new Set(['einhoerner/Beschleunigung']);         // smaller value wins (seconds to full speed)
const YEAR = new Set(['Baujahr', 'Großstadt seit', 'Entdeckt', 'Gründungsjahr', 'Zulassung', 'Geburtsjahr']);

/** Number from the source: 12.5, "1950", "357.588" (German thousands), "0,5", "2/3"; otherwise null */
function num(v) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  if (/^-?\d+$/.test(s) || /^-?\d+\.\d+$/.test(s)) return Number(s);
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'));
  const f = s.match(/^(-?\d+)\/(\d+)$/);
  return f ? Number(f[1]) / Number(f[2]) : null;
}
const decimals = x => Number.isInteger(x) ? 0 : Math.min(3, (x.toFixed(6).replace(/0+$/, '').split('.')[1] || '').length);

const out = DECKS.map(([file, emoji, en]) => {
  const d = JSON.parse(readFileSync(join(SRC, `${file}.json`), 'utf8'));
  let cats = d.categories;
  if (!cats) {   // several category sets: all of them
    const seen = new Map();
    for (const s of Object.values(d.category_sets)) for (const c of (Array.isArray(s) ? s : s.categories)) if (!seen.has(c.name)) seen.set(c.name, c);
    cats = [...seen.values()];
  }
  const use = cats.map(c => ({ c, vals: d.cards.map(x => num(x[c.name])) })).filter(u => u.vals.every(v => v !== null)).slice(0, MAX);
  if (use.length < MIN) throw new Error(`${file}: fewer than ${MIN} numeric categories`);
  const catOut = use.map(({ c, vals }) => {
    const u = UNIT_FIX[c.unit] ?? c.unit;
    if (!CAT_EN[c.name]) throw new Error(`${file}: no English name for "${c.name}"`);
    const o = { n: c.name, en: CAT_EN[c.name], u };
    if (UNIT_EN[u]) o.ue = UNIT_EN[u];
    if (LOW.has(`${file}/${c.name}`)) o.low = 1;
    if (YEAR.has(c.name)) o.y = 1; else o.d = Math.max(...vals.map(decimals));
    return o;
  });
  const counter = {};
  const cards = d.cards.map((x, i) => {
    const g = x.group || 'A';
    counter[g] = (counter[g] || 0) + 1;
    const card = { n: x.name, g, id: g + counter[g], v: use.map(u => Math.round(u.vals[i] * 1e6) / 1e6) };
    const shown = use.map(({ c }) => (typeof x[c.name] === 'string' && x[c.name].includes('/') ? x[c.name] : null));
    if (shown.some(Boolean)) card.s = shown;
    if (x.description) card.t = x.description;
    const flag = String(x.image_url || '').match(/^https:\/\/flagcdn\.com\/w\d+\/([a-z]{2}(?:-[a-z]+)?)\.png$/);
    if (flag) card.f = flag[1];
    return card;
  });
  return { id: d.deck_name, emoji, de: d.title.replace('Supertrumpf: ', ''), en, sub: d.subtitle || '', groups: d.groups, cats: catOut, cards };
});

const js = `/* Decks for Quartett – generated by scripts/quartet-decks.mjs from the supertrumpf-creator repository
   (cards_data/*.json): names, groups, numeric categories and the short German card texts. No images.
   Card: n = name, g = group, id = card number, v = values (same order as cats), s = shown text for a value
   (fractions), t = German text, f = ISO code of the flag (countries). Category: n/en = name, u/ue = unit (de/en), low = smaller wins, y = year,
   d = decimals. */
window.QuartetDecks = ${JSON.stringify(out)};
`;
writeFileSync(join(ROOT, 'quartet/decks.js'), js);
console.log(`${out.length} decks, ${out.reduce((n, d) => n + d.cards.length, 0)} cards, ${Buffer.byteLength(js)} bytes`);
