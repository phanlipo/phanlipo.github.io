// Face accessories and distortions for Kamera-Effekte, from MediaPipe face landmarks (478 points, x/y 0…1).
// No DOM: window.FaceFx.geometry(), .warpParams() for the shader, .draw() paints an accessory on a 2D canvas.
// Accessories are drawn in a frame that moves, turns and scales with the face: origin = between the eyes,
// x axis = towards the right eye on screen, 1 unit = distance between the eyes of a face looking straight ahead
// (for a turned head the eyes come closer together, so the face height sets the minimum size).
(function () {
'use strict';
const ACCESSORIES = ['none', 'glasses', 'hearts', 'hat', 'crown', 'cat', 'dog', 'bunny', 'devil', 'mustache', 'clown', 'halo'];
const WARPS = ['none', 'bulge', 'eyes', 'mouth', 'pinch', 'swirl', 'wide', 'long', 'wobble'];
// Landmark numbers of the MediaPipe face mesh
const LM = { top: 10, chin: 152, nose: 1, underNose: 2, lipTop: 0, lipIn: 13, lipLow: 14, mouthL: 61, mouthR: 291,
  cheekL: 234, cheekR: 454, irisA: 468, irisB: 473, eyeA1: 33, eyeA2: 133, eyeB1: 362, eyeB2: 263 };
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// Points of one face in pixels (mirror: as shown on a mirrored screen)
function geometry(f, W, H, mirror) {
  const P = i => [(mirror ? 1 - f[2 * i] : f[2 * i]) * W, f[2 * i + 1] * H];
  const iris = f.length / 2 > LM.irisB;
  let a = iris ? P(LM.irisA) : mid(P(LM.eyeA1), P(LM.eyeA2));
  let b = iris ? P(LM.irisB) : mid(P(LM.eyeB1), P(LM.eyeB2));
  if (a[0] > b[0]) [a, b] = [b, a];
  const faceH = dist(P(LM.top), P(LM.chin));
  const ed = Math.max(dist(a, b), 1), u = Math.max(ed, faceH / 2.6), em = mid(a, b), mouth = mid(P(LM.lipIn), P(LM.lipLow));
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const cos = Math.cos(-ang), sin = Math.sin(-ang);
  // Point in the face frame (see above)
  const local = p => { const x = (p[0] - em[0]) / u, y = (p[1] - em[1]) / u; return [x * cos - y * sin, x * sin + y * cos]; };
  return {
    P, a, b, ed, u, ang, em, mouth, local, faceH,
    faceW: Math.max(dist(P(LM.cheekL), P(LM.cheekR)), faceH * 0.75),
    mouthW: dist(P(LM.mouthL), P(LM.mouthR)),
    mouthOpen: dist(P(LM.lipIn), P(LM.lipLow)) / u,
    center: mid(em, mouth),
  };
}

// Shader uniforms for up to 3 faces, in camera pixels (not mirrored):
// F = centre x, y, radius, roll angle · E = both eyes · Mo = mouth x, y, radius
function warpParams(faces, W, H) {
  const F = new Float32Array(12), E = new Float32Array(12), Mo = new Float32Array(9);
  const n = Math.min(3, faces.length);
  for (let i = 0; i < n; i++) {
    const g = geometry(faces[i], W, H, false);
    F.set([g.center[0], g.center[1], g.faceW * 0.62, g.ang], 4 * i);
    E.set([g.a[0], g.a[1], g.b[0], g.b[1]], 4 * i);
    Mo.set([g.mouth[0], g.mouth[1], g.mouthW * 0.8], 3 * i);
  }
  return { n, F, E, Mo };
}

function heart(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + 0.55 * s);
  c.bezierCurveTo(x - 1.15 * s, y - 0.2 * s, x - 0.55 * s, y - 1.05 * s, x, y - 0.45 * s);
  c.bezierCurveTo(x + 0.55 * s, y - 1.05 * s, x + 1.15 * s, y - 0.2 * s, x, y + 0.55 * s);
  c.closePath();
}
function ellipse(c, x, y, rx, ry, rot, fill, stroke, lw) {
  c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function poly(c, pts, fill, stroke, lw) {
  c.beginPath(); c.moveTo(...pts[0]); for (const p of pts.slice(1)) c.lineTo(...p); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
}

// Each accessory: (context in face frame, top of the forehead, nose tip, under the nose, upper lip, lower lip, geometry)
const DRAW = {
  glasses(c, t, nose, under, lipTop, lipLow, g) {
    const eyes = [g.local(g.a)[0], g.local(g.b)[0]];
    for (const x of eyes) {
      c.beginPath(); c.roundRect(x - 0.4, -0.27, 0.8, 0.55, 0.2);
      c.fillStyle = 'rgba(12,12,18,.92)'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 0.07; c.stroke();
      poly(c, [[x - 0.28, -0.18], [x - 0.12, -0.18], [x - 0.3, 0.12], [x - 0.36, 0.05]], 'rgba(255,255,255,.35)');
    }
    c.strokeStyle = '#000'; c.lineWidth = 0.08; c.lineCap = 'round';
    c.beginPath(); c.moveTo(eyes[0] + 0.4, -0.1); c.quadraticCurveTo((eyes[0] + eyes[1]) / 2, -0.18, eyes[1] - 0.4, -0.1); c.stroke();
    c.beginPath(); c.moveTo(eyes[0] - 0.4, -0.12); c.lineTo(eyes[0] - 0.65, -0.06); c.moveTo(eyes[1] + 0.4, -0.12); c.lineTo(eyes[1] + 0.65, -0.06); c.stroke();
  },
  hearts(c, t, nose, under, lipTop, lipLow, g) {
    const eyes = [g.local(g.a)[0], g.local(g.b)[0]];
    for (const x of eyes) {
      heart(c, x, 0.02, 0.5);
      c.fillStyle = 'rgba(255,45,117,.94)'; c.fill(); c.strokeStyle = '#9f1239'; c.lineWidth = 0.06; c.stroke();
      ellipse(c, x - 0.18, -0.12, 0.08, 0.05, -0.6, 'rgba(255,255,255,.55)');
    }
    c.strokeStyle = '#9f1239'; c.lineWidth = 0.07; c.lineCap = 'round';
    c.beginPath(); c.moveTo(eyes[0] + 0.38, -0.1); c.lineTo(eyes[1] - 0.38, -0.1); c.stroke();
  },
  hat(c, t) {
    const [x, y] = [t[0], t[1] + 0.12];
    c.save();
    poly(c, [[x - 0.62, y], [x + 0.62, y], [x, y - 1.6]]);
    c.clip();
    const colors = ['#7c3aed', '#facc15', '#06b6d4', '#f43f5e'];
    for (let i = -6; i < 8; i++) poly(c, [[x - 1, y - 0.25 * i], [x + 1, y - 0.25 * i - 0.5], [x + 1, y - 0.25 * i - 0.75], [x - 1, y - 0.25 * i - 0.25]], colors[(i + 8) % 4]);
    c.restore();
    poly(c, [[x - 0.62, y], [x + 0.62, y], [x, y - 1.6]], null, 'rgba(0,0,0,.45)', 0.04);
    ellipse(c, x, y - 1.6, 0.17, 0.17, 0, '#ef4444', '#991b1b', 0.03);
  },
  crown(c, t) {
    const [x, y] = [t[0], t[1] + 0.1];
    poly(c, [[x - 0.66, y], [x - 0.66, y - 0.5], [x - 0.4, y - 0.25], [x - 0.2, y - 0.78], [x, y - 0.32], [x + 0.2, y - 0.78],
      [x + 0.4, y - 0.25], [x + 0.66, y - 0.5], [x + 0.66, y]], '#f5c518', '#a16207', 0.05);
    for (const [dx, col] of [[-0.36, '#dc2626'], [0, '#2563eb'], [0.36, '#16a34a']]) ellipse(c, x + dx, y - 0.13, 0.075, 0.075, 0, col, '#fff7', 0.02);
    for (const [dx, dy] of [[-0.66, -0.5], [-0.2, -0.78], [0.2, -0.78], [0.66, -0.5]]) ellipse(c, x + dx, y + dy, 0.06, 0.06, 0, '#fde68a', '#a16207', 0.02);
  },
  cat(c, t, nose) {
    const [x, y] = t;
    for (const s of [-1, 1]) {
      const base = [[x + s * 0.3, y + 0.22], [x + s * 0.92, y + 0.3], [x + s * 0.75, y - 0.62]];
      poly(c, base, '#f59e0b', '#92400e', 0.05);
      const cx = (base[0][0] + base[1][0] + base[2][0]) / 3, cy = (base[0][1] + base[1][1] + base[2][1]) / 3;
      poly(c, base.map(([px, py]) => [cx + (px - cx) * 0.55, cy + (py - cy) * 0.55 + 0.04]), '#f9a8d4');
    }
    const [nx, ny] = nose;
    poly(c, [[nx - 0.12, ny - 0.05], [nx + 0.12, ny - 0.05], [nx, ny + 0.09]], '#f472b6', '#831843', 0.025);
    c.strokeStyle = 'rgba(20,20,20,.85)'; c.lineWidth = 0.025; c.lineCap = 'round';
    for (const s of [-1, 1]) for (const dy of [-0.08, 0.02, 0.12]) {
      c.beginPath(); c.moveTo(nx + s * 0.18, ny + 0.05); c.quadraticCurveTo(nx + s * 0.55, ny + dy, nx + s * 0.9, ny + dy * 1.8); c.stroke();
    }
  },
  dog(c, t, nose, under, lipTop, lipLow, g) {
    const [x, y] = t;
    for (const s of [-1, 1]) ellipse(c, x + s * 0.88, y + 0.72, 0.27, 0.62, -s * 0.35, '#7c4a1e', '#4a2c12', 0.04);
    const [nx, ny] = nose;
    ellipse(c, nx, ny, 0.2, 0.14, 0, '#111', null);
    ellipse(c, nx - 0.06, ny - 0.05, 0.06, 0.035, -0.3, 'rgba(255,255,255,.6)');
    if (g.mouthOpen > 0.12) {
      const [lx, ly] = lipLow;
      ellipse(c, lx, ly + 0.2, 0.19, 0.3, 0, '#fb7185', '#be123c', 0.03);
      c.strokeStyle = '#be123c'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(lx, ly + 0.02); c.lineTo(lx, ly + 0.3); c.stroke();
    }
  },
  bunny(c, t, nose) {
    const [x, y] = t;
    for (const s of [-1, 1]) {
      ellipse(c, x + s * 0.32, y - 0.75, 0.2, 0.75, s * 0.12, '#f8fafc', '#94a3b8', 0.04);
      ellipse(c, x + s * 0.32, y - 0.7, 0.1, 0.55, s * 0.12, '#f9a8d4');
    }
    ellipse(c, nose[0], nose[1], 0.09, 0.07, 0, '#f472b6', '#831843', 0.02);
  },
  devil(c, t) {
    const [x, y] = t;
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(x + s * 0.28, y + 0.12);
      c.quadraticCurveTo(x + s * 0.48, y - 0.3, x + s * 0.78, y - 0.62);
      c.quadraticCurveTo(x + s * 0.72, y - 0.12, x + s * 0.6, y + 0.18); c.closePath();
      c.fillStyle = '#dc2626'; c.fill(); c.strokeStyle = '#7f1d1d'; c.lineWidth = 0.04; c.stroke();
    }
  },
  mustache(c, t, nose, under, lipTop) {
    const [x, y] = [(under[0] + lipTop[0]) / 2, (under[1] + lipTop[1]) / 2];
    for (const s of [-1, 1]) {
      c.beginPath(); c.moveTo(x, y - 0.05);
      c.bezierCurveTo(x + s * 0.25, y - 0.14, x + s * 0.45, y + 0.12, x + s * 0.62, y - 0.06);
      c.bezierCurveTo(x + s * 0.66, y - 0.16, x + s * 0.56, y - 0.2, x + s * 0.52, y - 0.1);
      c.bezierCurveTo(x + s * 0.42, y + 0.02, x + s * 0.2, y + 0.06, x, y + 0.05); c.closePath();
      c.fillStyle = '#3b2314'; c.fill();
    }
  },
  clown(c, t, nose) {
    ellipse(c, nose[0], nose[1], 0.22, 0.22, 0, '#e11d2a', '#7f1d1d', 0.03);
    ellipse(c, nose[0] - 0.07, nose[1] - 0.08, 0.06, 0.05, 0, 'rgba(255,255,255,.65)');
  },
  halo(c, t) {
    c.save(); c.shadowColor = '#fde047'; c.shadowBlur = 12;
    ellipse(c, t[0], t[1] - 0.7, 0.72, 0.2, 0, null, '#fcd34d', 0.11);
    c.restore();
  },
};

// Paints the accessory on every face (screen coordinates; mirror = mirrored selfie picture)
function draw(c, faces, W, H, mirror, accessory) {
  const fn = DRAW[accessory];
  if (!fn) return;
  for (const f of faces) {
    const g = geometry(f, W, H, mirror);
    const L = i => g.local(g.P(i));
    c.save();
    c.translate(g.em[0], g.em[1]); c.rotate(g.ang); c.scale(g.u, g.u);
    // Landmark 10 is the top of the forehead – hats and ears sit a bit higher, on the head
    const top = L(LM.top); top[1] -= 0.3;
    fn(c, top, L(LM.nose), L(LM.underNose), L(LM.lipTop), L(LM.lipLow), g);
    c.restore();
  }
}

// Calms the jitter of the landmarks: moves towards the new position (same number of faces only)
function smooth(prev, next, k = 0.6) {
  if (!prev || prev.length !== next.length) return next;
  return next.map((f, i) => {
    const p = prev[i];
    if (!p || p.length !== f.length || Math.hypot(p[2] - f[2], p[3] - f[3]) > 0.15) return f;
    const o = new Float32Array(f.length);
    for (let j = 0; j < f.length; j++) o[j] = p[j] + (f[j] - p[j]) * k;
    return o;
  });
}

window.FaceFx = { ACCESSORIES, WARPS, LM, geometry, warpParams, draw, smooth };
})();
