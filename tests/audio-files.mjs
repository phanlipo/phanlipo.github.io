// Small, independent readers for the audio files the video-to-audio app writes (MP4/M4A, Ogg, WAV).
// They do not use the app's library, so the tests check the files on their own.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIX = join(import.meta.dirname, 'fixtures');
// Test videos (see fixtures/README.md): what ffmpeg was told to write
export const CLIPS = {
  aac: { file: 'clip-aac.mp4', mime: 'video/mp4', hz: 440, rate: 44100, seconds: 2 },
  opus: { file: 'clip-opus.webm', mime: 'video/webm', hz: 880, rate: 48000, seconds: 2 },
  silent: { file: 'silent.mp4', mime: 'video/mp4' },
};
export const clip = key => ({ name: CLIPS[key].file, mimeType: CLIPS[key].mime, buffer: readFileSync(join(FIX, CLIPS[key].file)) });

/* ---------- ISO BMFF (MP4/M4A) ---------- */
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf', 'udta']);
/** Boxes as a tree: [{ type, start, size, data (payload Buffer), children }] */
export function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = buf.readUInt32BE(o), head = 8;
    const type = buf.toString('latin1', o + 4, o + 8);
    if (size === 1) { size = Number(buf.readBigUInt64BE(o + 8)); head = 16; }
    else if (size === 0) size = end - o;
    if (size < head || o + size > end) break;
    const box = { type, start: o, size, data: buf.subarray(o + head, o + size), children: [] };
    if (CONTAINERS.has(type)) box.children = boxes(buf, o + head, o + size);
    out.push(box);
    o += size;
  }
  return out;
}
const find = (list, type) => list.find(b => b.type === type);
/** Tracks of an MP4: handler ('soun'/'vide'), sample entry ('mp4a', 'avc1' …), sample count, duration in s */
export function mp4Info(buf) {
  const top = boxes(buf);
  const ftyp = find(top, 'ftyp');
  const moov = find(top, 'moov');
  const tracks = moov.children.filter(b => b.type === 'trak').map(trak => {
    const mdia = find(trak.children, 'mdia');
    const mdhd = find(mdia.children, 'mdhd').data;
    const v1 = mdhd[0] === 1;
    const timescale = mdhd.readUInt32BE(v1 ? 20 : 12);
    const dur = v1 ? Number(mdhd.readBigUInt64BE(24)) : mdhd.readUInt32BE(16);
    const handler = find(mdia.children, 'hdlr').data.toString('latin1', 8, 12);
    const stbl = find(find(mdia.children, 'minf').children, 'stbl');
    const stsd = find(stbl.children, 'stsd').data;
    const entry = stsd.toString('latin1', 12, 16);
    const stsz = find(stbl.children, 'stsz').data;
    const samples = stsz.readUInt32BE(8);
    const fixed = stsz.readUInt32BE(4);
    let bytes = 0;
    for (let i = 0; i < samples; i++) bytes += fixed || stsz.readUInt32BE(12 + i * 4);
    return { handler, entry, samples, bytes, seconds: dur / timescale };
  });
  return { brand: ftyp ? ftyp.data.toString('latin1', 0, 4) : null, tracks };
}

/* ---------- Ogg ---------- */
/** Codec from the first packet and the duration from the last granule position (Opus: 48 kHz minus pre-skip) */
export function oggInfo(buf) {
  if (buf.toString('latin1', 0, 4) !== 'OggS') return null;
  const codec = buf.includes(Buffer.from('OpusHead')) ? 'opus' : buf.includes(Buffer.from('\x01vorbis', 'latin1')) ? 'vorbis' : '?';
  let o = 0, granule = 0n, pages = 0;
  while (o + 27 <= buf.length && buf.toString('latin1', o, o + 4) === 'OggS') {
    granule = buf.readBigUInt64LE(o + 6);
    const segs = buf[o + 26];
    let len = 0;
    for (let i = 0; i < segs; i++) len += buf[o + 27 + i];
    o += 27 + segs + len;
    pages++;
  }
  const head = buf.indexOf(Buffer.from('OpusHead'));
  const preSkip = codec === 'opus' ? buf.readUInt16LE(head + 10) : 0;
  return { codec, pages, complete: o === buf.length, seconds: codec === 'opus' ? (Number(granule) - preSkip) / 48000 : null };
}

/* ---------- WAV ---------- */
/** Header fields and the samples of the first channel (as -1…1) */
export function wavInfo(buf) {
  if (buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WAVE') return null;
  let o = 12, fmt = null, data = null;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4), size = buf.readUInt32LE(o + 4);
    if (id === 'fmt ') fmt = { format: buf.readUInt16LE(o + 8), channels: buf.readUInt16LE(o + 10), rate: buf.readUInt32LE(o + 12), bits: buf.readUInt16LE(o + 22) };
    if (id === 'data') { data = buf.subarray(o + 8, o + 8 + size); break; }
    o += 8 + size + (size & 1);
  }
  const frames = data.length / (fmt.channels * fmt.bits / 8);
  const first = new Float32Array(frames);
  for (let i = 0; i < frames; i++) first[i] = data.readInt16LE(i * fmt.channels * 2) / 32768;
  return { ...fmt, frames, seconds: frames / fmt.rate, samples: first };
}
/** Frequency of a sine from its rising zero crossings (middle half of the signal, away from fades) */
export function toneHz(samples, rate) {
  const a = Math.floor(samples.length / 4), b = Math.floor(samples.length * 3 / 4);
  const ups = [];
  for (let i = a + 1; i < b; i++) if (samples[i - 1] < 0 && samples[i] >= 0) ups.push(i);
  return (ups.length - 1) / ((ups[ups.length - 1] - ups[0]) / rate);
}
export const peak = samples => samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
