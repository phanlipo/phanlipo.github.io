// Small, independent readers for the audio files the video-to-audio and audio-studio apps write (MP4/M4A, Ogg, WAV, MP3).
// They do not use the app's library, so the tests check the files on their own.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const FIX = join(import.meta.dirname, 'fixtures');
// Test videos (see fixtures/README.md): what ffmpeg was told to write
export const CLIPS = {
  aac: { file: 'clip-aac.mp4', mime: 'video/mp4', hz: 440, rate: 44100, seconds: 2 },
  opus: { file: 'clip-opus.webm', mime: 'video/webm', hz: 880, rate: 48000, seconds: 2 },
  silent: { file: 'silent.mp4', mime: 'video/mp4' },
  tagged: { file: 'clip-tagged.mp4', mime: 'video/mp4' },
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

/** iTunes-style tags of an M4A (moov › udta › meta › ilst): { '©nam': 'text', covr: { mime, data } … } */
export function mp4Tags(buf) {
  const moov = find(boxes(buf), 'moov');
  const udta = find(moov.children, 'udta');
  const meta = (udta && find(udta.children, 'meta')) || find(moov.children, 'meta');
  if (!meta) return {};
  const metaKids = boxes(buf, meta.start + 12, meta.start + meta.size); // full box: version + flags
  const ilst = find(metaKids, 'ilst');
  if (!ilst) return {};
  const out = {};
  for (const item of boxes(buf, ilst.start + 8, ilst.start + ilst.size)) {
    const data = find(boxes(buf, item.start + 8, item.start + item.size), 'data');
    if (!data) continue;
    const type = data.data.readUInt32BE(0) & 0xffffff, value = data.data.subarray(8);
    out[item.type] = item.type === 'covr' ? { mime: type === 14 ? 'image/png' : type === 13 ? 'image/jpeg' : '?', data: value }
      : type === 1 ? value.toString('utf8') : value;
  }
  return out;
}

/* ---------- Ogg ---------- */
/** The packets of the first logical stream (pages joined, lacing resolved) */
function oggPackets(buf) {
  const packets = [];
  let o = 0, cur = [];
  while (o + 27 <= buf.length && buf.toString('latin1', o, o + 4) === 'OggS') {
    const segs = buf[o + 26];
    let p = o + 27 + segs;
    for (let i = 0; i < segs; i++) {
      const len = buf[o + 27 + i];
      cur.push(buf.subarray(p, p + len)); p += len;
      if (len < 255) { packets.push(Buffer.concat(cur)); cur = []; }
    }
    o = p;
  }
  return packets;
}
/** Vorbis comments of an Ogg Opus file: { TITLE: […], METADATA_BLOCK_PICTURE: […] }, picture decoded as { mime, type, data } */
export function oggTags(buf) {
  const pkt = oggPackets(buf).find(p => p.toString('latin1', 0, 8) === 'OpusTags');
  if (!pkt) return null;
  let o = 8;
  o += 4 + pkt.readUInt32LE(o); // vendor
  const n = pkt.readUInt32LE(o); o += 4;
  const out = {};
  for (let i = 0; i < n; i++) {
    const len = pkt.readUInt32LE(o), s = pkt.toString('utf8', o + 4, o + 4 + len); o += 4 + len;
    const eq = s.indexOf('='), key = s.slice(0, eq).toUpperCase();
    let value = s.slice(eq + 1);
    if (key === 'METADATA_BLOCK_PICTURE') value = flacPicture(Buffer.from(value, 'base64'));
    (out[key] ||= []).push(value);
  }
  return out;
}
// FLAC PICTURE block (also used base64-encoded in Vorbis comments)
function flacPicture(b) {
  let o = 0;
  const type = b.readUInt32BE(o); o += 4;
  const ml = b.readUInt32BE(o), mime = b.toString('latin1', o + 4, o + 4 + ml); o += 4 + ml;
  o += 4 + b.readUInt32BE(o); // description
  o += 16; // width, height, depth, colours
  const dl = b.readUInt32BE(o);
  return { type, mime, data: b.subarray(o + 4, o + 4 + dl) };
}

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

/* ---------- MP3 ---------- */
// MPEG audio frame headers (ISO 11172-3 / 13818-3): bitrate (kbit/s) by version and layer III, sample rates by version
const MP3_KBPS = { 1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], 2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160] };
const MP3_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
/** Walks all frames (after an optional ID3v2 tag): rate, channels, bitrate(s), frame count, duration.
 *  A Xing/Info frame (no audio) is not counted. complete = the frames fill the file exactly (ID3v1 at the end allowed). */
export function mp3Info(buf) {
  let o = 0;
  if (buf.toString('latin1', 0, 3) === 'ID3') o = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]);
  let frames = 0, rate = 0, channels = 0, layer = 0, xing = false;
  const kbps = new Set();
  while (o + 4 <= buf.length && buf[o] === 0xff && (buf[o + 1] & 0xe0) === 0xe0) {
    const ver = (buf[o + 1] >> 3) & 3, lay = (buf[o + 1] >> 1) & 3, bi = buf[o + 2] >> 4, ri = (buf[o + 2] >> 2) & 3, pad = (buf[o + 2] >> 1) & 1;
    if (ver === 1 || lay !== 1 || bi === 0 || bi === 15 || ri === 3) break; // only layer III, no "free" bitrate
    const r = MP3_RATES[ver][ri], b = MP3_KBPS[ver === 3 ? 1 : 2][bi], ch = (buf[o + 3] >> 6) === 3 ? 1 : 2;
    const perFrame = ver === 3 ? 1152 : 576, len = Math.floor(perFrame / 8 * b * 1000 / r) + pad;
    const sideInfo = ver === 3 ? (ch === 1 ? 17 : 32) : (ch === 1 ? 9 : 17), tag = buf.toString('latin1', o + 4 + sideInfo, o + 8 + sideInfo);
    if (frames === 0 && !xing && (tag === 'Xing' || tag === 'Info')) xing = true;
    else { frames++; kbps.add(b); }
    rate = r; channels = ch; layer = perFrame;
    o += len;
  }
  const end = buf.length - (buf.toString('latin1', buf.length - 128, buf.length - 125) === 'TAG' ? 128 : 0);
  return { rate, channels, kbps: [...kbps].sort((a, b) => a - b), frames, xing, complete: frames > 0 && o === end, seconds: rate ? frames * layer / rate : 0 };
}

/** ID3v2.3/2.4 frames at the start of an MP3: { TIT2: 'text', APIC: { mime, type, data } … }, size = tag bytes */
export function id3Tags(buf) {
  if (buf.toString('latin1', 0, 3) !== 'ID3') return null;
  const ver = buf[3], syncsafe = b => (b[0] << 21) | (b[1] << 14) | (b[2] << 7) | b[3];
  const size = 10 + syncsafe(buf.subarray(6, 10));
  const text = (enc, b) => enc === 3 ? b.toString('utf8') : enc === 1 || enc === 2 ? (enc === 1 && b[0] === 0xfe ? Buffer.from(b.subarray(2)).swap16().toString('utf16le') : b.subarray(enc === 1 ? 2 : 0).toString('utf16le')) : b.toString('latin1');
  const out = { size };
  let o = 10;
  while (o + 10 <= size && buf[o] !== 0) {
    const id = buf.toString('latin1', o, o + 4);
    const len = ver === 4 ? syncsafe(buf.subarray(o + 4, o + 8)) : buf.readUInt32BE(o + 4);
    const b = buf.subarray(o + 10, o + 10 + len), enc = b[0];
    if (id === 'APIC') {
      const mEnd = b.indexOf(0, 1), mime = b.toString('latin1', 1, mEnd), type = b[mEnd + 1];
      let d = mEnd + 2;
      if (enc === 1 || enc === 2) { while (d + 1 < b.length && (b[d] || b[d + 1])) d += 2; d += 2; } else { d = b.indexOf(0, d) + 1; }
      out.APIC = { mime, type, data: b.subarray(d) };
    } else if (id[0] === 'T') out[id] = text(enc, b.subarray(1)).replace(/\0+$/, '');
    o += 10 + len;
  }
  return out;
}

/* ---------- WAV ---------- */
/** Chunks of a WAV and its LIST/INFO texts (ISO 8859-1): { chunks: ['fmt ', 'LIST', 'data'], info: { INAM: 'text' … } } */
export function wavTags(buf) {
  const chunks = [], info = {};
  let o = 12;
  while (o + 8 <= buf.length) {
    const id = buf.toString('latin1', o, o + 4), size = buf.readUInt32LE(o + 4);
    chunks.push(id);
    if (id === 'LIST' && buf.toString('latin1', o + 8, o + 12) === 'INFO') {
      let p = o + 12;
      while (p + 8 <= o + 8 + size) {
        const k = buf.toString('latin1', p, p + 4), l = buf.readUInt32LE(p + 4);
        info[k] = buf.toString('latin1', p + 8, p + 8 + l).replace(/\0+$/, '');
        p += 8 + l + (l & 1);
      }
    }
    o += 8 + size + (size & 1);
  }
  return { chunks, info };
}

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
