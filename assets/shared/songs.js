/* Shared songs (public domain only) for the Liederbuch (songbook/) and the Klavier (piano/).
   Each song is one melody written as tokens "Note:beats" – e.g. "C4" (a quarter), "G4:2" (half),
   "E4:1.5" (dotted quarter), "D#5:.25" (sixteenth), "r:1" (rest), "G4:2~" (tied to the next note, which has
   the same pitch – also over a bar line). "|" marks a bar line and is checked
   against the meter (Songs.bars throws if a bar is too long or too short). Note names: C4 = middle C,
   "#" sharp, "b" flat (also "H" for the German B). Beats are quarter notes.
   lyrics: one string per verse, in ABC "w:" style – "-" between syllables, "_" holds the previous
   syllable over the next note, "*" leaves a note without text.
   credits: { melody, text } – "trad" = traditional; only songs whose melody and text are in the
   public domain (authors died more than 70 years ago, or traditional).
   group: one of GROUPS (below). Melodies are written in C major (the scale numbers count from C).
   Sources for checking melodies: de.wikibooks.org Liederbuch, Mutopia Project (public domain editions).
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

// Flohwalzer (G♭ major, 2/4): bass note (left hand), then a chord (right hand) twice, then the upbeat E♭–D♭.
// Three voices: right hand top (melody), right hand lower chord note, left hand. Section on G♭, then on D♭ (A♭+C♭).
const FLOH = (() => {
  const v = { top: ['Eb5:.25 Db5:.25 |'], low: ['r:.5 |'], bass: ['r:.5 |'] };
  const bar = (top, low, bass) => { v.top.push(top + ' |'); v.low.push(low + ' |'); v.bass.push(bass + ' |'); };
  const T = { top: 'Db5', low: 'Bb4', bass: 'Gb3' }, D = { top: 'Cb5', low: 'Ab4', bass: 'Db3' };
  const plain = c => bar(`r:.5 ${c.top}:.5 ${c.top}:.5 Eb5:.25 Db5:.25`, `r:.5 ${c.low}:.5 ${c.low}:.5 r:.5`, `${c.bass}:.5 r:1.5`);
  const turn = (a, b) => bar(`r:.5 ${a.top}:.5 r:.5 ${b.top}:.5`, `r:.5 ${a.low}:.5 r:.5 ${b.low}:.5`, `${a.bass}:.5 r:.5 ${b.bass}:.5 r:.5`);
  for (let r = 0; r < 2; r++) {
    plain(T); plain(T); turn(T, D); plain(T);
    plain(D); plain(D); turn(D, T); plain(D);
  }
  bar('Db5:2', 'Bb4:2', 'Gb3:2');
  const join = a => a.join(' ').replace(/ \|$/, '');
  return { top: join(v.top), low: join(v.low), bass: join(v.bass) };
})();

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
    id: 'haensel-gretel', group: 'kids',
    title: { de: 'Hänsel und Gretel', en: 'Hansel and Gretel' },
    meter: '4/4', bpm: 120,
    melody: 'G4:2 E4 F4 | G4:2 E4 C4 | D4 C4 D4 E4 | C4:3 r | G4:2 E4 F4 | G4:2 E4 C4 | D4 C4 D4 E4 | C4:2 r C4 | ' +
      'D4 D4 D4 E4 | F4:2 D4 D4 | E4 D4 E4 F4 | G4:3 r | G4:2 E4 F4 | G4:2 E4 C4 | D4 C4 D4 E4 | C4:3 r',
    lyrics: ['Hän-sel und Gre-tel ver-lie-fen sich im Wald. Es war so fins-ter und auch so bit-ter kalt. ' +
      'Sie ka-men an ein Häus-chen von Pfef-fer-ku-chen fein. Wer mag der Herr wohl von die-sem Häus-chen sein?'],
    credits: { melody: 'trad', text: 'trad' }
  },
  {
    id: 'kuckuck-esel', group: 'kids',
    title: { de: 'Der Kuckuck und der Esel', en: 'The Cuckoo and the Donkey' },
    meter: '4/4', bpm: 116, upbeat: 1,
    melody: 'G4 | E4 G4 E4 G4 | F4 F4 r F4 | D4 F4 D4 F4 | E4:2 r G4:.5 F4:.5 | E4 E4 E4 E4 | F4 F4 r F4:.5 E4:.5 | ' +
      'D4 D4 D4 D4 | E4 E4 r C4 | C4 D4 E4 F4 | G4:1.5 A4:.5 G4 F4 | E4 E4 D4 D4 | C4:3',
    lyrics: ['Der Kuck-uck und der E-sel, die hat-ten ei-nen Streit: wer _ wohl am bes-ten sän-ge, wer _ wohl am bes-ten sän-ge ' +
      'zur schö-nen Mai-en-zeit, _ _ zur schö-nen Mai-en-zeit.'],
    credits: { melody: 'Carl Friedrich Zelter (1810)', text: 'Hoffmann von Fallersleben (1835)' }
  },
  {
    id: 'maennlein', group: 'kids',
    title: { de: 'Ein Männlein steht im Walde', en: 'A Little Man Stands in the Forest' },
    meter: '4/4', bpm: 112, upbeat: 1,
    melody: 'G3 | C4 D4 E4 F4 | G4:2 A4 F4 | E4:2 D4:2 | C4:2 r G3 | C4 D4 E4 F4 | G4:2 A4 F4 | E4:2 D4:2 | C4:2 r:2 | ' +
      'G4:1.5 F4:.5 E4 G4 | F4 E4 D4:2 | G4:1.5 F4:.5 E4 G4 | F4 E4 D4:2 | C4 D4 E4 F4 | G4:2 A4 F4 | E4:2 D4:2 | C4:2',
    lyrics: ['Ein Männ-lein steht im Wal-de ganz still und stumm, es hat von lau-ter Pur-pur ein Mänt-lein um. ' +
      'Sagt, wer mag das Männ-lein sein, das da steht im Wald al-lein mit dem pur-pur-ro-ten _ Män-te-lein?'],
    credits: { melody: 'trad', text: 'Hoffmann von Fallersleben (1843)' }
  },
  {
    id: 'alle-voegel', group: 'kids',
    title: { de: 'Alle Vögel sind schon da', en: 'All the Birds Are Here Again' },
    meter: '4/4', bpm: 112,
    melody: 'C4:1.5 E4:.5 G4 C5 | A4 C5:.5 A4:.5 G4:2 | F4:1.5 A4:.5 E4 C4 | D4:2 C4:2 | G4 G4 F4 F4 | E4 G4:.5 E4:.5 D4:2 | ' +
      'G4 G4 F4 F4 | E4 G4:.5 E4:.5 D4:2 | C4:1.5 E4:.5 G4 C5 | A4 C5:.5 A4:.5 G4:2 | F4:1.5 G4:.5 E4 C4 | D4:2 C4:2',
    lyrics: ['Al-le Vö-gel sind schon _ da, al-le Vö-gel, al-le! Welch ein Sin-gen, Mu-si-_-ziern, Pfei-fen, Zwit-schern, Ti-ri-_-liern! ' +
      'Früh-ling will nun ein-mar-_-schiern, kommt mit Sang und Schal-le.',
      'Wie sie al-le lus-tig _ sind, flink und froh sich re-gen! Am-sel, Dros-sel, Fink und _ Star und die gan-ze Vo-gel-_-schar ' +
      'wün-schen dir ein fro-hes _ Jahr, lau-ter Heil und Se-gen.'],
    credits: { melody: 'trad', text: 'Hoffmann von Fallersleben (1835)' }
  },
  {
    id: 'vogel', group: 'kids',
    title: { de: 'Kommt ein Vogel geflogen', en: 'A Bird Comes Flying' },
    meter: '3/4', bpm: 120, upbeat: 1,
    melody: 'E4:.5 F4:.5 | G4 E4 E4 | E4 D4 D4:.5 E4:.5 | F4 D4 D4:.5 A4:.5 | G4:2 E4:.5 F4:.5 | ' +
      'G4 E4 E4 | E4 D4 D4:.5 E4:.5 | F4 B3 B3 | C4:2',
    lyrics: ['Kommt ein Vo-gel ge-flo-gen, setzt sich nie-der auf mein’ Fuß, hat ein’ Zet-tel im Schna-bel, von der Mut-ter ein’ Gruß.'],
    credits: { melody: 'trad', text: 'trad' }
  },
  {
    id: 'abc-katze', group: 'kids',
    title: { de: 'ABC, die Katze lief im Schnee', en: 'ABC, the Cat Ran Through the Snow' },
    meter: '4/4', bpm: 108,
    melody: 'C4 E4 G4 r:.5 C5:.5 | G4:.75 F4:.25 E4:.5 D4:.5 C4 r:.5 G4:.5 | F4:.5 E4:.5 D4:.5 C4:.5 B3:.5 C4:.5 D4:.5 G4:.5 | ' +
      'F4:.5 E4:.5 D4:.5 C4:.5 B3:.5 C4:.5 D4:.5 C4:.5 | F4:.75 F4:.25 E4:.5 C4:.5 A4:.75 A4:.25 G4:.5 C5:.5 | ' +
      'G4:.75 F4:.25 E4:.5 D4:.5 C4 r',
    lyrics: ['A, B, C, die Kat-ze lief im Schnee, und als sie dann nach Hau-se kam, da hatt’ sie wei-ße Stie-fel an. ' +
      'O je-mi-ne, o je-mi-ne, die Kat-ze lief im Schnee.'],
    credits: { melody: 'trad', text: 'trad' }
  },
  {
    id: 'hoppe-reiter', group: 'kids',
    title: { de: 'Hoppe, hoppe Reiter', en: 'Ride a Horse, Little Rider' },
    meter: '4/4', bpm: 120,
    melody: 'G4 G4 A4 A4 | G4:2 E4:2 | G4 G4 A4 A4 | G4:2 E4:2 | G4 G4 A4 A4 | G4:2 E4:2 | G4 G4 A4 A4 | G4:2 E4:2 | ' +
      'C4 D4 E4 F4 | G4:2 r:2 | G4 F4 E4 D4 | C4:2 r:2',
    lyrics: ['Hop-pe, hop-pe Rei-ter, wenn er fällt, dann schreit er. Fällt er in den Gra-ben, fres-sen ihn die Ra-ben. ' +
      'Fällt er in den Sumpf, macht der Rei-ter plumps!'],
    credits: { melody: 'trad', text: 'trad' }
  },
  {
    id: 'pferdchen', group: 'kids',
    title: { de: 'Hopp, hopp, hopp, Pferdchen lauf Galopp', en: 'Hop, Hop, Hop, Little Horse, Gallop' },
    meter: '2/4', bpm: 120,
    melody: 'C4 E4 | G4 r | G4:.5 F4:.5 E4:.5 D4:.5 | C4 r | D4:.5 D4:.5 B3:.5 G3:.5 | G4:.5 G4:.5 E4:.5 C4:.5 | ' +
      'D4:.5 D4:.5 B3:.5 G3:.5 | G4:.5 G4:.5 E4:.5 C4:.5 | C4:.5 D4:.5 E4:.5 F4:.5 | G4 r | G4:.5 F4:.5 E4:.5 D4:.5 | C4 r',
    lyrics: ['Hopp, hopp, hopp! Pferd-chen, lauf Ga-lopp! Ü-ber Stock und ü-ber Stei-ne, a-ber brich dir nicht die Bei-ne! ' +
      'Im-mer im Ga-lopp! Hopp, hopp, hopp, hopp, hopp!'],
    credits: { melody: 'Carl Gottlieb Hering (1807)', text: 'Carl Hahn' }
  },
  {
    id: 'laterne', group: 'lantern',
    title: { de: 'Laterne, Laterne', en: 'Lantern, Lantern' },
    meter: '4/4', bpm: 112, upbeat: 1,
    melody: 'A4 | G4:2 E4 A4 | G4:2 E4:2 | G4 G4 E4 A4 | G4:2 E4 C4:.5 E4:.5 | G4 G4 E4 C4:.5 E4:.5 | ' +
      'G4 G4 E4 C4:.5 E4:.5 | G4 G4:.5 G4:.5 A4 A4:.5 A4:.5 | G4 G4 E4',
    lyrics: ['La-ter-ne, La-ter-ne, Son-ne, Mond und Ster-ne. Bren-ne auf, mein Licht, bren-ne auf, mein Licht, ' +
      'a-ber nur mei-ne lie-be La-ter-ne nicht!'],
    credits: { melody: 'trad', text: 'trad' }
  },
  {
    id: 'laterne-gehen', group: 'lantern',
    title: { de: 'Ich geh mit meiner Laterne', en: 'I Walk with My Lantern' },
    meter: '6/8', bpm: 100, upbeat: 0.5,
    melody: 'G3:.5 | C4 C4:.5 E4:.5 C4:.5 E4:.5 | G4:1.5 E4 C4:.5 | D4:.75 D4:.25 D4:.5 D4:.5 E4:.5 D4:.5 | C4:1.5 r G3:.5 | ' +
      'C4 C4:.5 E4:.5 C4:.5 E4:.5 | G4:1.5 E4 C4:.5 | D4:.75 D4:.25 D4:.5 D4:.5 E4:.5 D4:.5 | C4:1.5 r E4:.5 | ' +
      'G4 E4:.5 C4 E4:.5 | G4 E4:.5 C4 C4:.5 | D4:.5 D4:.5 D4:.5 D4:.5 E4:.5 D4:.5 | C4:1.5 r E4:.5 | ' +
      'G4 E4:.5 C4 E4:.5 | G4 E4:.5 C4 C4:.5 | D4:.5 D4:.5 D4:.5 D4:.5 E4:.5 D4:.5 | C4:1.5 r',
    lyrics: ['Ich geh mit mei-ner La-ter-ne und mei-ne La-ter-ne mit mir. Dort o-ben leuch-ten die Ster-ne und un-ten, da leuch-_-ten wir. ' +
      'La-ter-nen-licht, ver-lösch mir nicht! Ra-bim-mel, ra-bam-mel, ra-bumm. La-ter-nen-licht, ver-lösch mir nicht! Ra-bim-mel, ra-bam-mel, ra-bumm.'],
    credits: { melody: 'trad', text: 'trad' }
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
    id: 'alle-jahre', group: 'christmas',
    title: { de: 'Alle Jahre wieder', en: 'Every Year Again' },
    meter: '4/4', bpm: 96,
    melody: 'G4:1.5 A4:.5 G4 F4 | E4:2 D4:2 | C4 D4:.5 E4:.5 F4 E4 | D4:3 r | E4 G4 A4 G4 | C5:2 B4 A4 | G4 F4:.5 E4:.5 F4 G4 | E4:3 r',
    lyrics: ['Al-le Jah-re wie-der kommt das _ Chris-tus-kind auf die Er-de nie-der, _ wo wir _ Men-schen sind.',
      'Kehrt mit sei-nem Se-gen ein in _ je-des Haus, geht auf al-len We-gen _ mit uns _ ein und aus.'],
    credits: { melody: 'Friedrich Silcher (1842)', text: 'Wilhelm Hey (1837)' }
  },
  {
    id: 'kinderlein', group: 'christmas',
    title: { de: 'Ihr Kinderlein, kommet', en: 'O Come, Little Children' },
    meter: '4/4', bpm: 100, upbeat: 1,
    melody: 'G4 | G4 E4:.5 G4:.5 G4 E4:.5 G4:.5 | F4 D4:.5 F4:.5 E4 r:.5 G4:.5 | G4 E4:.5 G4:.5 G4 E4:.5 G4:.5 | ' +
      'F4 D4:.5 F4:.5 E4 r:.5 E4:.5 | D4 D4:.5 D4:.5 F4 F4:.5 F4:.5 | E4 E4:.5 E4:.5 A4 r:.5 A4:.5 | ' +
      'G4 G4:.5 G4:.5 C5 G4:.5 E4:.5 | F4 D4:.5 B3:.5 C4:1.5',
    lyrics: ['Ihr Kin-der-lein, kom-met, o kom-met doch all! Zur Krip-pe her kom-met in Beth-le-hems Stall ' +
      'und seht, was in die-ser hoch-hei-li-gen Nacht der Va-ter im Him-mel für Freu-de uns macht!'],
    credits: { melody: 'Johann Abraham Peter Schulz (1794)', text: 'Christoph von Schmid (1798)' }
  },
  {
    id: 'tannenbaum', group: 'christmas',
    title: { de: 'O Tannenbaum', en: 'O Christmas Tree' },
    meter: '3/4', bpm: 96, upbeat: 1,
    melody: 'G3 | C4:.75 C4:.25 C4:1.5 D4:.5 | E4:.75 E4:.25 E4:1.5 E4:.5 | D4:.5 E4:.5 F4 B3 | D4 C4 r:.5 G4:.5 | ' +
      'G4:.5 E4:.5 A4:1.5 G4:.5 | G4:.5 F4:.5 F4:1.5 F4:.5 | F4:.5 D4:.5 G4:1.5 F4:.5 | F4:.5 E4:.5 E4 r:.5 G3:.5 | ' +
      'C4:.75 C4:.25 C4:1.5 D4:.5 | E4:.75 E4:.25 E4:1.5 E4:.5 | D4:.5 E4:.5 F4 B3 | D4 C4',
    lyrics: ['O Tan-nen-baum, o Tan-nen-baum, wie treu sind dei-ne Blät-ter! Du grünst nicht nur zur Som-mer-zeit, ' +
      'nein, auch im Win-ter, wenn es schneit. O Tan-nen-baum, o Tan-nen-baum, wie treu sind dei-ne Blät-ter!'],
    credits: { melody: 'trad', text: 'Ernst Anschütz (1824)' }
  },
  {
    id: 'froh-munter', group: 'christmas',
    title: { de: 'Lasst uns froh und munter sein', en: 'Let Us All Be Glad and Gay' },
    meter: '4/4', bpm: 132,
    melody: 'G4 G4 G4:.5 A4:.5 G4:.5 F4:.5 | E4 E4 E4:2 | F4 F4 F4:.5 G4:.5 F4:.5 E4:.5 | D4 D4 D4:2 | ' +
      'C4 D4 E4 F4 | G4:.5 A4:.5 G4:.5 A4:.5 G4:2 | C5 G4 G4:.5 A4:.5 G4:.5 F4:.5 | E4 D4 G4:2 | ' +
      'C5 G4 G4:.5 A4:.5 G4:.5 F4:.5 | E4 D4 C4:2',
    lyrics: ['Lasst uns froh _ und _ mun-ter sein und uns recht _ von _ Her-zen freun! Lus-tig, lus-tig, tra-la-la-la-la, ' +
      'bald ist Ni-ko-laus-_-a-bend da, bald ist Ni-ko-laus-_-a-bend da!'],
    credits: { melody: 'trad', text: 'trad' }
  },
  {
    id: 'leise-rieselt', group: 'christmas',
    title: { de: 'Leise rieselt der Schnee', en: 'Softly Falls the Snow' },
    meter: '3/4', bpm: 100,
    melody: 'E4:2 E4 | D4 E4 D4 | C4:3~ | C4:2 r | C4:2 A3 | C4 B3 A3 | G3:3~ | G3:2 r | ' +
      'D4 C#4 D4 | F4 E4 D4 | C4:3~ | C4:2 r | D4:1.5 A3:.5 A3 | B3 A3 B3 | C4:3~ | C4:2 r',
    lyrics: ['Lei-se rie-selt der Schnee, _ still und starr ruht der See, _ weih-nacht-lich glän-zet der Wald. _ Freu-e dich, Christ-kind kommt bald! _'],
    credits: { melody: 'Eduard Ebel (1895)', text: 'Eduard Ebel (1895)' }
  },
  {
    id: 'morgen-kinder', group: 'christmas',
    title: { de: 'Morgen, Kinder, wird’s was geben', en: 'Tomorrow, Children, There’ll Be Presents' },
    meter: '2/4', bpm: 120,
    melody: 'C4 G3 | A3 G3 | A3:.5 C4:.5 B3:.5 D4:.5 | C4 G3 | E4 E4:.5 F4:.5 | G4 E4 | F4 E4 | D4:2 | ' +
      'C4 G3 | A3 G3 | A3:.5 C4:.5 B3:.5 D4:.5 | C4 G3 | E4 E4:.5 F4:.5 | G4 E4 | F4 E4 | D4:2 | ' +
      'F4 F4 | A4 A4 | D4 D4 | G4:2 | C4 C4 | F4 F4 | E4:.5 D4:.5 C4:.5 B3:.5 | C4:2',
    lyrics: ['Mor-gen, Kin-der, wird’s _ was _ ge-ben, mor-gen _ wer-den wir uns freun! Welch ein Ju-bel, welch _ ein _ Le-ben ' +
      'wird in _ un-serm Hau-se sein! Ein-mal wer-den wir noch wach, hei-ßa, dann ist Weih-_-nachts-_-tag!'],
    credits: { melody: 'Carl Gottlieb Hering (1809)', text: 'Karl Friedrich Splittegarb (1795)' }
  },
  {
    id: 'ros', group: 'christmas',
    title: { de: 'Es ist ein Ros entsprungen', en: 'Lo, How a Rose E’er Blooming' },
    meter: '4/4', bpm: 84, upbeat: 2,
    melody: 'G4:2 | G4 G4 A4 G4 | G4:2 E4:2 | F4:2 E4 D4~ | D4 C4:2 B3 | C4:2 G4:2 | G4 G4 A4 G4 | G4:2 E4:2 | ' +
      'F4:2 E4 D4~ | D4 C4:2 B3 | C4:2 r E4 | D4 B3 C4 A3 | G3:2 r G4 | G4 G4 A4 G4 | G4:2 E4:2 | F4:2 E4 D4~ | ' +
      'D4 C4:2 B3 | C4:4',
    lyrics: ['Es ist ein Ros ent-sprun-gen aus ei-ner _ Wur-zel zart, wie uns die Al-ten sun-gen, von Jes-se _ kam die Art ' +
      'und hat ein Blüm-lein bracht mit-ten im kal-ten Win-ter wohl zu der _ hal-ben Nacht.'],
    credits: { melody: 'Köln (1599)', text: 'Speyer (1599)' }
  },
  {
    id: 'macht-hoch', group: 'church',
    title: { de: 'Macht hoch die Tür', en: 'Lift Up Your Heads, Ye Mighty Gates' },
    meter: '6/4', bpm: 132, upbeat: 1,
    melody: 'E4 | G4:2 F4 E4:2 D4 | C4 D4 E4 D4:2 G4 | F4:2 F4 E4:2 E4 | D4 C4 D4 C4:2 E4 | D4:2 D4 E4 F#4 G4 | ' +
      'G4 A4 F#4 G4:2 D4 | E4:2 D4 E4 F#4 G4 | G4 A4 F#4 G4:2 G4 | A4:2 G4 A4:2 G4 | A4 G4 F4 E4:2 G4 | ' +
      'A4:2 G4 A4:2 G4 | A4 G4 F4 E4:2 G4 | C4:2 C4 F4:2 E4 | D4:3~ D4:2 G4 | F4:2 E4 D4 C4 D4 | C4:3',
    lyrics: ['Macht hoch die Tür, die Tor _ macht weit; es kommt der Herr der Herr-_-lich-keit, ein Kö-nig al-_-ler Kö-_-nig-reich, ' +
      'ein Hei-land al-_-ler Welt _ zu-gleich, der Heil und Le-ben mit _ sich bringt; der-hal-ben jauchzt, mit Freu-_-den singt: ' +
      'Ge-lo-bet sei mein Gott, _ mein Schöp-fer reich _ von Rat.'],
    credits: { melody: 'Halle (1704)', text: 'Georg Weissel (1623)' }
  },
  {
    id: 'lobe-den-herren', group: 'church',
    title: { de: 'Lobe den Herren', en: 'Praise to the Lord, the Almighty' },
    meter: '3/4', bpm: 120,
    melody: 'C4 C4 G4 | E4:1.5 D4:.5 C4 | B3 A3 G3 | A3 B3 C4 | D4:3 | C4:3 | ' +
      'C4 C4 G4 | E4:1.5 D4:.5 C4 | B3 A3 G3 | A3 B3 C4 | D4:3 | C4:3 | ' +
      'G4 G4 G4 | A4:3 | E4 F4 G4 | G4:1.5 F4:.5 E4 | D4:3 | G3 A3 B3 | C4 D4 E4 | D4:3 | C4:3',
    lyrics: ['Lo-be den Her-ren, den mäch-ti-gen Kö-nig der Eh-ren; lob ihn, o See-le, ver-eint mit den himm-li-schen Chö-ren. ' +
      'Kom-met zu Hauf, Psal-ter und Har-fe, wacht auf, las-set den Lob-ge-sang hö-ren!'],
    credits: { melody: 'Stralsund (1665)', text: 'Joachim Neander (1680)' }
  },
  {
    id: 'lasst-uns-erfreuen', group: 'church',
    title: { de: 'Lasst uns erfreuen', en: 'Let Us Rejoice' },
    meter: '4/4', bpm: 120,
    melody: 'C4:2 C4 D4 | E4 C4 E4 F4 | G4:2 C5 B4 | A4:2 G4:2 | C4:2 C4 D4 | E4 C4 E4 F4 | G4:2 C5 B4 | A4:2 G4:2 | ' +
      'r C5 C5 G4 | G4 F4 E4 F4 | G4:2 F4 E4 | D4:2 C4:2 | r C5 C5 G4 | G4 F4 E4 F4 | G4:2 F4 E4 | D4:2 C4:2 | ' +
      'C5 B4 A4:2 | G4:2 C5 B4 | A4:2 G4:2 | F4 E4 D4:2 | C4:2',
    lyrics: ['Lasst uns er-freu-en herz-lich sehr: Hal-le-lu-ja! Ma-ri-a seufzt und weint nicht mehr: Hal-le-lu-ja! ' +
      'Ver-schwun-den sind die Ne-bel all: Hal-le-lu-ja! Jetzt glänzt der lie-ben Son-ne Strahl: Hal-le-lu-ja! ' +
      'Hal-le-lu-ja, Hal-le-lu-ja, Hal-le-lu-ja!'],
    credits: { melody: 'Köln (1623)', text: 'Friedrich Spee (1623)' }
  },
  {
    id: 'mond', group: 'church',
    title: { de: 'Der Mond ist aufgegangen', en: 'The Moon Has Risen' },
    meter: '4/4', bpm: 100, upbeat: 1,
    melody: 'C4 | D4 C4 F4 E4 | D4:2 C4 E4 | E4 E4 A4 G4 | F4:2 E4 E4 | E4 E4 F4 E4 | D4:3 C4 | ' +
      'D4 C4 F4 E4 | D4:2 C4 E4 | E4 E4 A4 G4 | F4:2 E4 E4 | E4 E4 F4 E4 | D4 D4 C4',
    lyrics: ['Der Mond ist auf-ge-gan-gen, die gold-nen Stern-lein pran-gen am Him-mel hell und klar. ' +
      'Der Wald steht schwarz und schwei-get, und aus den Wie-sen stei-get der wei-ße Ne-bel wun-der-bar.'],
    credits: { melody: 'Johann Abraham Peter Schulz (1790)', text: 'Matthias Claudius (1779)' }
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
  },
  {
    id: 'flohwalzer', group: 'piano',
    title: { de: 'Flohwalzer', en: 'Flea Waltz' },
    meter: '2/4', bpm: 132, upbeat: 0.5,
    melody: FLOH.top,
    lyrics: [],
    credits: { melody: 'trad' },
    piano: { parts: { de: ['Rechte Hand', 'Rechte Hand (Akkord)', 'Linke Hand'], en: ['Right hand', 'Right hand (chord)', 'Left hand'] },
      voices: [FLOH.low, FLOH.bass] }
  }
];

// "C4", "F#3", "Bb5", "H3" (German B) → MIDI number, or null
function parseNote(s) {
  const m = /^([A-Ha-h])([#b]?)(-?\d)$/.exec(String(s).trim());
  if (!m) return null;
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11, h: 11 }[m[1].toLowerCase()];
  return (Number(m[3]) + 1) * 12 + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// Errors with a code and values, so that pages can show them in their language
class SongError extends Error {
  constructor(code, params, text) { super(text); this.code = code; this.params = params; }
}

// Tokens of one voice: [{ n (MIDI number, null = rest), letter ('C'…'B'), acc ('#', 'b', ''), oct, t, d, bar, tie }]
// t and d in beats (quarter notes); bar = a "|" follows this note; tie = held into the next note
function tokens(str) {
  const out = [];
  let t = 0, i = 0;
  for (const raw of String(str).trim().split(/\s+/)) {
    if (!raw) continue;
    if (raw === '|') { if (out.length) out[out.length - 1].bar = true; continue; }
    i++;
    const tie = raw.endsWith('~'), tok = tie ? raw.slice(0, -1) : raw;
    const [nm, len, extra] = tok.split(':');
    const d = len == null || len === '' ? 1 : Number(len);
    if (extra != null || !(d > 0) || d > 64 || Math.round(d * 4) !== d * 4)
      throw new SongError('length', { token: raw, n: i }, `Bad length in "${raw}"`);
    if (nm === 'r' || nm === 'R') {
      if (tie) throw new SongError('note', { token: raw, n: i }, `A rest cannot be tied: "${raw}"`);
      out.push({ n: null, t, d, bar: false, tie: false }); t += d; continue;
    }
    const n = parseNote(nm);
    if (n == null || n < 21 || n > 108) throw new SongError('note', { token: raw, n: i }, `Bad note "${raw}"`);
    const m = /^([A-Ha-h])([#b]?)/.exec(nm);
    let letter = m[1].toUpperCase();
    if (letter === 'H') letter = 'B';
    out.push({ n, letter, acc: m[2], oct: Number(nm.slice(m[0].length)), t, d, bar: false, tie });
    t += d;
  }
  out.forEach((x, k) => {
    if (x.tie && !(out[k + 1] && out[k + 1].n === x.n))
      throw new SongError('tie', { n: k + 1 }, `Note ${k + 1} is tied to a different note`);
  });
  return out;
}

// Beats per bar (quarter notes): 4/4 → 4, 6/8 → 3, 3/8 → 1.5
const barBeats = meter => { const [a, b] = meter.split('/').map(Number); return a * 4 / b; };

// Splits the melody into bars and checks them against the meter: [[token, …], …]
// The first bar may be an upbeat (song.upbeat beats); the last one may be short (by as much, or more).
function bars(song) {
  const len = barBeats(song.meter), up = song.upbeat || 0;
  const list = tokens(song.melody), out = [];
  let cur = [], filled = 0, need = up || len;
  const close = () => { out.push(cur); cur = []; filled = 0; need = len; };
  list.forEach((tok, i) => {
    cur.push(tok);
    filled += tok.d;
    if (filled > need + 1e-9) throw new SongError('cross', { n: i + 1, bar: out.length + 1 }, `${song.id}: note ${i + 1} crosses the bar line`);
    const full = Math.abs(filled - need) < 1e-9;
    if (tok.bar && !full) throw new SongError('bar', { bar: out.length + 1, beats: filled, need }, `${song.id}: bar ${out.length + 1} has ${filled} beats, expected ${need}`);
    if (full) close();
  });
  if (cur.length) {
    // Last bar: usually completes the upbeat, may also be shorter (it never crosses the bar line, see above)
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
    notes: sounding(tokens(v))
  }));
}
// Notes as they sound: rests left out, tied notes joined – [{ n, t, d, i (index of the first token) }]
function sounding(list) {
  const out = [];
  list.forEach((x, i) => {
    if (x.n == null) return;
    const prev = list[i - 1];
    if (prev && prev.tie && out.length) { out[out.length - 1].d += x.d; return; }
    out.push({ n: x.n, t: x.t, d: x.d, i });
  });
  return out;
}

// Number of lyric units (syllables, "_", "*") of a verse – one per note, rests excluded
const syllables = verse => String(verse).trim() ? String(verse).trim().split(/\s+/).flatMap(w => w === '_' || w === '*' ? [w] : w.split('-')).length : 0;

// Groups in the order the apps show them
const GROUPS = [
  { id: 'kids', title: { de: 'Kinderlieder', en: 'Children’s songs' } },
  { id: 'lantern', title: { de: 'Laternenlieder', en: 'Lantern songs' } },
  { id: 'christmas', title: { de: 'Advent & Weihnachten', en: 'Advent & Christmas' } },
  { id: 'church', title: { de: 'Kirchenlieder', en: 'Hymns' } },
  { id: 'classical', title: { de: 'Klassik', en: 'Classical' } },
  { id: 'piano', title: { de: 'Klavierstücke', en: 'Piano pieces' } }
];

const byId = new Map(LIST.map(s => [s.id, s]));
window.Songs = {
  list: LIST,
  groups: GROUPS,
  get: id => byId.get(id) || null,
  parseNote, tokens, bars, barBeats, parts, sounding, syllables, SongError
};
})();
