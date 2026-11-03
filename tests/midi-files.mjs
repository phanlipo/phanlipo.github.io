// Builds small Standard MIDI Files for the piano tests (written by hand, independent of the page's parser).
const vlq = n => { const out = [n & 0x7f]; while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80); return out; };
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const ascii = s => [...s].map(c => c.charCodeAt(0));
/** One track chunk from [delta, ...bytes] events; end of track is added */
export function track(events) {
  const body = events.flatMap(([d, ...b]) => [...vlq(d), ...b]).concat([0, 0xff, 0x2f, 0]);
  return [...ascii('MTrk'), ...u32(body.length), ...body];
}
export const name = s => [0xff, 0x03, s.length, ...ascii(s)];
export const tempo = us => [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255];
/** Whole file: format, ticks per quarter, track chunks */
export function midi(format, division, tracks) {
  return Buffer.from([...ascii('MThd'), 0, 0, 0, 6, 0, format, 0, tracks.length, (division >> 8) & 255, division & 255, ...tracks.flat()]);
}

/**
 * Test song, 480 ticks per quarter. Tempo 120 bpm (0.5 s per quarter), from tick 960 on 60 bpm (1 s per quarter).
 *   "Rechts": C4 0–0.5 s, E4 0.5–1 s (running status, note-on with velocity 0 as note-off), G4 1–2 s (after the tempo change)
 *   "Links":  C3 struck at 0, released at 0.25 s but the sustain pedal holds it until 0.5 s; a drum note on channel 10 (skipped)
 * So: 4 notes, 2 parts (the tempo track has no notes), length 2 s, range C3…G4.
 */
export function testSong() {
  return midi(1, 480, [
    track([[0, ...name('Tempo')], [0, ...tempo(500000)], [960, ...tempo(1000000)]]),
    track([[0, ...name('Rechts')], [0, 0x90, 60, 100], [480, 0x80, 60, 0], [0, 0x90, 64, 90], [480, 64, 0], [0, 67, 80], [480, 0x80, 67, 0]]),
    track([[0, ...name('Links')], [0, 0xb1, 64, 127], [0, 0x91, 48, 70], [0, 0x99, 36, 100], [60, 0x89, 36, 0], [180, 0x81, 48, 0], [240, 0xb1, 64, 0]]),
  ]);
}
