/* Shared songs (public domain only) for the Liederbuch (songbook/) and the Klavier (piano/).
   Each song is one melody written as tokens "Note:beats" – e.g. "C4" (a quarter), "G4:2" (half),
   "E4:1.5" (dotted quarter), "D#5:.25" (sixteenth), "r:1" (rest). "|" marks a bar line and is checked
   against the meter (Songs.bars throws if a bar is too long or too short). Note names: C4 = middle C,
   "#" sharp, "b" flat (also "H" for the German B). Beats are quarter notes.
   lyrics: one string per verse, in ABC "w:" style – "-" between syllables, "_" holds the previous
   syllable over the next note, "*" leaves a note without text.
   credits: { melody, text } – "trad" = traditional; only songs whose melody and text are in the
   public domain (authors died more than 70 years ago, or traditional).
   piano: optional extras for the Klavier app – more parts (same token format) and their names. */
(function () {
'use strict';

// A canon voice: the same melody later (rest of `beats`) and shifted by `semis` semitones
function canon(melody, beats, semis) {
  return 'r:' + beats + ' ' + melody.replace(/\|/g, ' ').trim().split(/\s+/).map(tok => {
    const [nm, len] = tok.split(':');
    if (nm === 'r') return tok;
    const n = parseNote(nm);
    return NAMES[(n + semis) % 12] + (Math.floor((n + semis) / 12) - 1) + (len ? ':' + len : '');
  }).join(' ');
}
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const JAKOB = 'C4 D4 E4 C4 | C4 D4 E4 C4 | E4 F4 G4:2 | E4 F4 G4:2 | ' +
  'G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 | G4:.5 A4:.5 G4:.5 F4:.5 E4 C4 | C4 G3 C4:2 | C4 G3 C4:2';

const LIST = [
  {
    id: 'entchen', group: 'kids',
    title: { de: 'Alle meine Entchen', en: 'All My Little Ducklings' },
    meter: '4/4', bpm: 120,
    melody: 'C4 D4 E4 F4 | G4:2 G4:2 | A4 A4 A4 A4 | G4:4 | A4 A4 A4 A4 | G4:4 | ' +
      'F4 F4 F4 F4 | E4:2 E4:2 | D4 D4 D4 D4 | C4:4',
    lyrics: ['Al-le mei-ne Ent-chen schwim-men auf dem See, schwim-men auf dem See. ' +
      'Köpf-chen in das Was-ser, Schwänz-chen in die Höh.'],
    credits: { melody: 'trad', text: 'trad' },
    piano: { parts: { de: ['Melodie', 'Begleitung'], en: ['Melody', 'Accompaniment'] },
      voices: ['C3:4 C3:4 F3:4 C3:4 F3:4 C3:4 F3:4 C3:4 G3:4 C3:4'] }
  },
  {
    id: 'haenschen', group: 'kids',
    title: { de: 'Hänschen klein', en: 'Little Hans' },
    meter: '4/4', bpm: 112,
    melody: 'G4 E4 E4:2 | F4 D4 D4:2 | C4 D4 E4 F4 | G4 G4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4 | ' +
      'D4 D4 D4 D4 | D4 E4 F4:2 | E4 E4 E4 E4 | E4 F4 G4:2 | G4 E4 E4:2 | F4 D4 D4:2 | C4 E4 G4 G4 | C4:4',
    lyrics: ['Häns-chen klein ging al-lein in die wei-te Welt hin-ein. Stock und Hut steht ihm gut, ist gar wohl-ge-mut. ' +
      'A-ber Mut-ter wei-net sehr, hat ja nun kein Häns-chen mehr. „Wünsch dir Glück!“, sagt ihr Blick, „kehr nur bald zu-rück!“'],
    credits: { melody: 'trad', text: 'Franz Wiedemann (1860)' }
  },
  {
    id: 'jakob', group: 'kids',
    title: { de: 'Bruder Jakob', en: 'Brother John' },
    meter: '4/4', bpm: 108,
    melody: JAKOB,
    lyrics: ['Bru-der Ja-kob, Bru-der Ja-kob, schläfst du noch? Schläfst du noch? ' +
      'Hörst du nicht die Glo-cken? Hörst du nicht die Glo-cken? Ding, dang, dong! Ding, dang, dong!'],
    credits: { melody: 'trad', text: 'trad' },
    piano: { parts: { de: ['Stimme 1', 'Stimme 2 (Kanon)'], en: ['Voice 1', 'Voice 2 (round)'] },
      voices: [canon(JAKOB, 8, -12)] }
  },
  {
    id: 'stille-nacht', group: 'christmas',
    title: { de: 'Stille Nacht', en: 'Silent Night' },
    meter: '6/8', bpm: 84,
    melody: 'G4:1.5 A4:.5 G4 | E4:3 | G4:1.5 A4:.5 G4 | E4:3 | D5:2 D5 | B4:3 | C5:2 C5 | G4:3 | ' +
      'A4:2 A4 | C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 | E4:3 | A4:2 A4 | C5:1.5 B4:.5 A4 | G4:1.5 A4:.5 G4 | E4:3 | ' +
      'D5:2 D5 | F5:1.5 D5:.5 B4 | C5:3 | E5:3 | C5:1.5 G4:.5 E4 | G4:1.5 F4:.5 D4 | C4:3',
    lyrics: ['Stil-le Nacht, _ hei-li-ge Nacht! Al-les schläft, ein-sam wacht nur das trau-te hoch-hei-li-ge Paar. ' +
      'Hol-der Kna-be im lo-cki-gen Haar, schlaf in himm-li-scher Ruh, schlaf in himm-li-scher _ _ Ruh.'],
    credits: { melody: 'Franz Xaver Gruber (1818)', text: 'Joseph Mohr (1816)' }
  },
  {
    id: 'jingle-bells', group: 'christmas',
    title: { de: 'Jingle Bells', en: 'Jingle Bells' },
    meter: '4/4', bpm: 132,
    melody: 'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | ' +
      'E4 D4 D4 E4 | D4:2 G4:2 | E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:.5 | E4:4 | ' +
      'F4 F4 F4:1.5 F4:.5 | F4 E4 E4 E4:.5 E4:.5 | G4 G4 F4 D4 | C4:4',
    lyrics: ['Jin-gle bells, jin-gle bells, jin-gle all the way! Oh, what fun it is to ride in a one-horse o-pen sleigh! * ' +
      'Jin-gle bells, jin-gle bells, jin-gle all the way! Oh, what fun it is to ride in a one-horse o-pen sleigh!'],
    lyricsLang: 'en',
    credits: { melody: 'James Lord Pierpont (1857)', text: 'James Lord Pierpont (1857)' }
  },
  {
    id: 'ode', group: 'classical',
    title: { de: 'Ode an die Freude', en: 'Ode to Joy' },
    meter: '4/4', bpm: 100,
    melody: 'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:.5 D4:2 | ' +
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2 | ' +
      'D4 D4 E4 C4 | D4 E4:.5 F4:.5 E4 C4 | D4 E4:.5 F4:.5 E4 D4 | C4 D4 G3:2 | ' +
      'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:.5 C4:2',
    lyrics: ['Freu-de, schö-ner Göt-ter-fun-ken, Toch-ter aus E-ly-si-um, wir be-tre-ten feu-er-trun-ken, ' +
      'Himm-li-sche, dein Hei-lig-tum! Dei-ne Zau-ber bin-den _ wie-der, was die _ Mo-de streng ge-teilt; ' +
      'al-le Men-schen wer-den Brü-der, wo dein sanf-ter Flü-gel weilt.'],
    credits: { melody: 'Ludwig van Beethoven (1824)', text: 'Friedrich Schiller (1785/1803)' },
    piano: { parts: { de: ['Rechte Hand', 'Linke Hand'], en: ['Right hand', 'Left hand'] },
      voices: ['C3:4 G2:4 C3:4 G2:4 C3:4 G2:4 C3:4 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 G2:2 C3:2 C3:2 G2:2 C3:4 G2:4 C3:4 G2:2 C3:2'] }
  },
  {
    id: 'fuer-elise', group: 'classical',
    title: { de: 'Für Elise (Anfang)', en: 'Für Elise (opening)' },
    meter: '3/8', bpm: 66, upbeat: 0.5,
    melody: 'E5:.25 D#5:.25 | E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 | A4:.5 r:.25 C4:.25 E4:.25 A4:.25 | ' +
      'B4:.5 r:.25 E4:.25 G#4:.25 B4:.25 | C5:.5 r:.25 E4:.25 E5:.25 D#5:.25 | ' +
      'E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 | A4:.5 r:.25 C4:.25 E4:.25 A4:.25 | ' +
      'B4:.5 r:.25 E4:.25 C5:.25 B4:.25 | A4:.5 r:.5',
    lyrics: [],
    credits: { melody: 'Ludwig van Beethoven (1810)' },
    piano: { parts: { de: ['Rechte Hand', 'Linke Hand'], en: ['Right hand', 'Left hand'] },
      voices: ['r:.5 | r:1.5 | A2:.25 E3:.25 A3:.25 r:.75 | E2:.25 E3:.25 G#3:.25 r:.75 | A2:.25 E3:.25 A3:.25 r:.75 | ' +
        'r:1.5 | A2:.25 E3:.25 A3:.25 r:.75 | E2:.25 E3:.25 G#3:.25 r:.75 | A2:.25 E3:.25 A3:.25 r:.25'] }
  }
];

// "C4", "F#3", "Bb5", "H3" (German B) → MIDI number, or null
function parseNote(s) {
  const m = /^([A-Ha-h])([#b]?)(-?\d)$/.exec(String(s).trim());
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 }[m[1].toLowerCase()];
  return (Number(m[3]) + 1) * 12 + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// Tokens of one voice: [{ n (MIDI number, null = rest), letter ('C'…'B'), acc ('#', 'b', ''), oct, t, d, bar }]
// t and d in beats (quarter notes); bar = a "|" follows this note
function tokens(str) {
  const out = [];
  let t = 0;
  for (const tok of String(str).trim().split(/\s+/)) {
    if (!tok) continue;
    if (tok === '|') { if (out.length) out[out.length - 1].bar = true; continue; }
    const [nm, len] = tok.split(':');
    const d = len == null ? 1 : Number(len);
    if (!(d > 0) || Math.round(d * 4) !== d * 4) throw new Error(`Bad length in "${tok}"`);
    if (nm === 'r') { out.push({ n: null, t, d, bar: false }); t += d; continue; }
    const n = parseNote(nm);
    if (n == null) throw new Error(`Bad note "${tok}"`);
    const m = /^([A-Ha-h])([#b]?)/.exec(nm);
    let letter = m[1].toUpperCase();
    if (letter === 'H') letter = 'B';
    out.push({ n, letter, acc: m[2], oct: Number(nm.slice(m[0].length)), t, d, bar: false });
    t += d;
  }
  return out;
}

// Beats per bar (quarter notes): 4/4 → 4, 6/8 → 3, 3/8 → 1.5
const barBeats = meter => { const [a, b] = meter.split('/').map(Number); return a * 4 / b; };

// Splits the melody into bars and checks them against the meter: [[token, …], …]
// The first bar may be an upbeat (song.upbeat beats), the last one then is short by as much.
function bars(song) {
  const len = barBeats(song.meter), up = song.upbeat || 0;
  const list = tokens(song.melody), out = [];
  let cur = [], filled = 0, need = up || len;
  const close = () => { out.push(cur); cur = []; filled = 0; need = len; };
  list.forEach((tok, i) => {
    cur.push(tok);
    filled += tok.d;
    if (filled > need + 1e-9) throw new Error(`${song.id}: note ${i + 1} crosses the bar line`);
    const full = Math.abs(filled - need) < 1e-9;
    if (tok.bar && !full) throw new Error(`${song.id}: bar ${out.length + 1} has ${filled} beats, expected ${need}`);
    if (full) close();
  });
  if (cur.length) {
    // Last bar: completes the upbeat
    if (Math.abs(filled - (len - up)) > 1e-9) throw new Error(`${song.id}: last bar has ${filled} beats`);
    out.push(cur);
  }
  return out;
}

// Parts for the Klavier app: [{ name: {de, en}, notes: [{ n, t, d }] }] – t and d in beats, rests left out
function parts(song) {
  const names = song.piano && song.piano.parts || { de: ['Melodie'], en: ['Melody'] };
  const voices = [song.melody, ...(song.piano && song.piano.voices || [])];
  return voices.map((v, i) => ({
    name: { de: names.de[i] || '', en: names.en[i] || '' },
    notes: tokens(v).filter(x => x.n != null).map(x => ({ n: x.n, t: x.t, d: x.d }))
  }));
}

const byId = new Map(LIST.map(s => [s.id, s]));
window.Songs = {
  list: LIST,
  get: id => byId.get(id) || null,
  parseNote, tokens, bars, barBeats, parts
};
})();
