// Logic of Gesichter-Zeitraffer without DOM: picture formats, eyes from face landmarks, the transform that puts
// the eyes of every photo on the same spot, the frame schedule of the animation and the date from the EXIF data.
// window.Timelapse = { FORMATS, SIZES, EYE_Y, dims, eyesFromLandmarks, largestFace, transform, schedule, exifDate, draw }
(function () {
'use strict';
// Width : height of the result
const FORMATS = { square: 1, portrait: 5 / 4, story: 16 / 9 };
// Width of the result in pixels
const SIZES = [480, 720, 1080];
// The eyes sit at this height (share of the picture height from the top)
const EYE_Y = 0.4;
// Face width ≈ 2.5 × the distance between the eye centres (MediaPipe face mesh, face looking ahead)
const FACE_PER_EYES = 2.5;

const even = v => Math.max(2, Math.round(v / 2) * 2);
// Pixel size of the result (even numbers: video encoders need them)
function dims(format, width) {
  const w = even(width), r = FORMATS[format] || 1;
  return { w, h: even(w * r) };
}

// MediaPipe face mesh: 478 points (x, y 0…1); 468/473 = iris centres, else the mid of the eye corners.
// Returns { l, r } as [x, y] (0…1), l = the eye further left in the picture.
function eyesFromLandmarks(f) {
  const P = i => [f[2 * i], f[2 * i + 1]];
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  let a, b;
  if (f.length / 2 > 473) { a = P(468); b = P(473); }
  else { a = mid(P(33), P(133)); b = mid(P(362), P(263)); }
  return a[0] <= b[0] ? { l: a, r: b } : { l: b, r: a };
}
// Index of the biggest face (widest eye distance in pixels), -1 if there is none
function largestFace(faces, w = 1, h = 1) {
  let best = -1, top = 0;
  faces.forEach((e, i) => { const d = Math.hypot((e.r[0] - e.l[0]) * w, (e.r[1] - e.l[1]) * h); if (d > top) { top = d; best = i; } });
  return best;
}

// Canvas transform (a, b, c, d, e, f as for setTransform) that draws a source of srcW × srcH pixels so that
// the eyes are level, `face` (share of the width, 0…1) wide and centred at EYE_Y.
function transform(eyes, srcW, srcH, W, H, face) {
  const lx = eyes.l[0] * srcW, ly = eyes.l[1] * srcH, rx = eyes.r[0] * srcW, ry = eyes.r[1] * srcH;
  const dist = Math.max(1e-6, Math.hypot(rx - lx, ry - ly));
  const s = (face * W / FACE_PER_EYES) / dist;
  const cos = (rx - lx) / dist, sin = (ry - ly) / dist;
  const a = s * cos, b = -s * sin, c = s * sin, d = s * cos;
  const mx = (lx + rx) / 2, my = (ly + ry) / 2;
  return [a, b, c, d, W / 2 - (a * mx + c * my), EYE_Y * H - (b * mx + d * my)];
}

// Frames of the animation for n photos: [{ i, j, t, dur }] – photo i, faded towards photo j by t (0…1), shown dur
// seconds. secs = time per photo; fade: the last half of that time blends into the next photo in steps of 1/fps.
// The last photo stays a little longer (at least one second), so the loop is easy to follow.
// All times are whole frames of 1/fps.
function schedule(n, secs, fade, fps = 30) {
  const out = [], frame = 1 / fps;
  const q = v => Math.max(1, Math.round(v * fps)) * frame;
  for (let i = 0; i < n; i++) {
    const last = i === n - 1;
    if (last) { out.push({ i, j: i, t: 0, dur: q(Math.max(secs, 1)) }); break; }
    const steps = fade ? Math.max(2, Math.round(secs / 2 * fps)) : 0;
    const hold = fade ? q(secs - steps * frame) : q(secs);
    out.push({ i, j: i, t: 0, dur: hold });
    for (let k = 1; k <= steps; k++) out.push({ i, j: i + 1, t: k / (steps + 1), dur: frame });
  }
  return out;
}

// Date and time the photo was taken (EXIF DateTimeOriginal, else DateTime) from the start of a JPEG file,
// as milliseconds (local time) – null if there is none.
function exifDate(buf) {
  const v = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let o = 2;
  while (o + 4 <= v.byteLength) {
    const marker = v.getUint16(o), len = v.getUint16(o + 2);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
    if (marker === 0xffe1 && o + 10 <= v.byteLength && v.getUint32(o + 4) === 0x45786966) return tiffDate(v, o + 10, Math.min(v.byteLength, o + 2 + len));
    o += 2 + len;
  }
  return null;
}
function tiffDate(v, start, end) {
  if (start + 8 > end) return null;
  const le = v.getUint16(start) === 0x4949;
  const u16 = p => v.getUint16(p, le), u32 = p => v.getUint32(p, le);
  const ifd = off => {
    const p = start + off, tags = {};
    if (off <= 0 || p + 2 > end) return tags;
    const n = u16(p);
    for (let i = 0; i < n; i++) {
      const e = p + 2 + 12 * i;
      if (e + 12 > end) break;
      tags[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return tags;
  };
  const text = tag => {
    if (!tag || tag.type !== 2 || tag.count < 19) return null;
    const p = tag.count > 4 ? start + u32(tag.at) : tag.at;
    if (p + 19 > end) return null;
    let s = '';
    for (let i = 0; i < 19; i++) s += String.fromCharCode(v.getUint8(p + i));
    const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(s);
    if (!m || m[1] === '0000') return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    return Number.isFinite(d) ? d : null;
  };
  const ifd0 = ifd(u32(start + 4));
  const exif = ifd0[0x8769] ? ifd(u32(ifd0[0x8769].at)) : {};
  return text(exif[0x9003]) ?? text(exif[0x9004]) ?? text(ifd0[0x0132]);
}

// Draws one aligned photo: background, then the picture (any size – eyes are 0…1 of it), optional label at the bottom
function draw(ctx, src, eyes, W, H, opts) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = opts.bg || '#000';
  ctx.fillRect(0, 0, W, H);
  if (src && eyes) {
    const sw = src.naturalWidth || src.videoWidth || src.width, sh = src.naturalHeight || src.videoHeight || src.height;
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(...transform(eyes, sw, sh, W, H, opts.face));
    ctx.drawImage(src, 0, 0, sw, sh);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  if (opts.label) {
    const fs = Math.max(10, Math.round(Math.min(W, H) * 0.055));
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, fs / 6); ctx.strokeStyle = 'rgba(0,0,0,.75)';
    const x = Math.round(fs * 0.7), y = Math.round(H - fs * 0.6);
    ctx.strokeText(opts.label, x, y);
    ctx.fillStyle = '#fff'; ctx.fillText(opts.label, x, y);
  }
}

window.Timelapse = { FORMATS, SIZES, EYE_Y, FACE_PER_EYES, dims, eyesFromLandmarks, largestFace, transform, schedule, exifDate, draw };
})();
