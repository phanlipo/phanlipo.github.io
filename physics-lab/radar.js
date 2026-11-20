/* Physik verstehen – radar and stealth without DOM: window.Radar (see README.md).
   Shape: front view of an aircraft (cross-section, metres, x to the right, y up). The radar is far away in the
   direction u = (cos β, sin β), so its waves arrive as parallel rays. Every ray is reflected like light at a mirror
   (d' = d − 2(d·n)n) until it leaves; it counts as an echo when it leaves within ±TOL of the direction back to the
   radar. Echo share = width of returning rays / width of rays that hit, each reflection weighted with the
   reflectivity of the surface (metal 1, absorbing coating COAT).
   Range: radar equation P ∝ σ / R⁴, so the detection range is R_max = R_REF · (σ / 1 m²)^¼. */
(function (root) {
  'use strict';

  const TOL = 5;        // degrees: leaves at most this far beside the direction back to the radar
  const COAT = 0.1;     // share of the power one coated surface still reflects (−10 dB)
  const MAX_BOUNCES = 10;

  const seg = (a, b) => ({ a, b });
  const sym = (a, b) => [seg(a, b), seg([-a[0], a[1]], [-b[0], b[1]])];

  /* plain: round fuselage, flat wings, an upright fin (90° to the wings) and engines on pylons under the wings.
     stealth: flat facets that are all tilted, sharp side edges (chines), fins canted by 27°, no right angles. */
  const SHAPES = {
    plain: {
      segs: [
        ...sym([0.954, -0.3], [7, -0.3]),       // wings
        seg([0, 1], [0, 4]),                    // fin
        ...sym([3.2, -0.3], [3.2, -0.8]),       // pylons
      ],
      circles: [{ x: 0, y: 0, r: 1 }, { x: 3.2, y: -1.3, r: 0.5 }, { x: -3.2, y: -1.3, r: 0.5 }],
    },
    stealth: {
      // body: hexagon with chines (sharp side edges) at ±3.2 m
      body: [[0.9, 0.8], [3.2, 0], [1.1, -0.5], [-1.1, -0.5], [-3.2, 0], [-0.9, 0.8]],
      segs: [
        ...sym([3.2, 0], [7, 0]),               // wings continue the chine
        ...sym([0.9, 0.8], [0.9 + 3 * Math.sin(27 * Math.PI / 180), 0.8 + 3 * Math.cos(27 * Math.PI / 180)]), // canted fins
      ],
      circles: [],
    },
  };
  for (const k in SHAPES) {
    const S = SHAPES[k];
    if (S.body) S.segs.push(...S.body.map((p, i) => seg(p, S.body[(i + 1) % S.body.length])));
    let r = 0;
    for (const s of S.segs) for (const p of [s.a, s.b]) r = Math.max(r, Math.hypot(p[0], p[1]));
    for (const c of S.circles) r = Math.max(r, Math.hypot(c.x, c.y) + c.r);
    S.radius = r;
  }

  // nearest hit of the ray p + t·d (t > eps): { t, n } with the normal n facing the ray, or null
  function hit(S, p, d) {
    let best = null;
    for (const s of S.segs) {
      const ex = s.b[0] - s.a[0], ey = s.b[1] - s.a[1];
      const den = d[0] * ey - d[1] * ex;
      if (Math.abs(den) < 1e-12) continue;
      const qx = s.a[0] - p[0], qy = s.a[1] - p[1];
      const t = (qx * ey - qy * ex) / den, u = (qx * d[1] - qy * d[0]) / den;
      if (t > 1e-7 && u >= 0 && u <= 1 && (!best || t < best.t)) {
        const L = Math.hypot(ex, ey); let n = [ey / L, -ex / L];
        if (n[0] * d[0] + n[1] * d[1] > 0) n = [-n[0], -n[1]];
        best = { t, n };
      }
    }
    for (const c of S.circles) {
      const ox = p[0] - c.x, oy = p[1] - c.y, b = ox * d[0] + oy * d[1], cc = ox * ox + oy * oy - c.r * c.r;
      const disc = b * b - cc;
      if (disc < 0 || cc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 1e-7 && (!best || t < best.t)) {
        const hx = p[0] + t * d[0] - c.x, hy = p[1] + t * d[1] - c.y;
        best = { t, n: [hx / c.r, hy / c.r] };
      }
    }
    return best;
  }

  /* One ray at offset s (metres, across the direction of the radar). Returns the points of its path (from far
     away to the last hit, then the outgoing direction), the number of reflections and whether it returns. */
  function ray(shape, betaDeg, s) {
    const S = SHAPES[shape], b = betaDeg * Math.PI / 180, u = [Math.cos(b), Math.sin(b)], q = [-u[1], u[0]];
    const far = S.radius + 2;
    let p = [s * q[0] + far * u[0], s * q[1] + far * u[1]], d = [-u[0], -u[1]];
    const pts = [p];
    let n = 0;
    for (; n < MAX_BOUNCES; n++) {
      const h = hit(S, p, d);
      if (!h) break;
      p = [p[0] + h.t * d[0], p[1] + h.t * d[1]];
      const k = 2 * (d[0] * h.n[0] + d[1] * h.n[1]);
      d = [d[0] - k * h.n[0], d[1] - k * h.n[1]];
      pts.push(p);
    }
    const dev = Math.acos(Math.max(-1, Math.min(1, d[0] * u[0] + d[1] * u[1]))) * 180 / Math.PI;
    return { pts, dir: d, bounces: n, back: n > 0 && dev <= TOL, dev };
  }

  /* Echo for the radar in direction β (degrees above the horizon, radar on the right), N rays across the shape.
     share = returning width / hit width (each reflection weighted with refl); single and multiple: parts of share
     by one reflection and by two or more (corners). */
  function echo(shape, betaDeg, coated, N = 2000) {
    const S = SHAPES[shape], R = S.radius, ds = 2 * R / N, refl = coated ? COAT : 1;
    let hitW = 0, single = 0, multi = 0;
    for (let i = 0; i < N; i++) {
      const r = ray(shape, betaDeg, -R + (i + 0.5) * ds);
      if (!r.bounces) continue;
      hitW += ds;
      if (r.back) { const w = ds * refl ** r.bounces; if (r.bounces === 1) single += w; else multi += w; }
    }
    return { share: hitW ? (single + multi) / hitW : 0, single: hitW ? single / hitW : 0, multi: hitW ? multi / hitW : 0, hitWidth: hitW };
  }

  // echo share for every whole degree from lo to hi
  function lobes(shape, coated, lo = -80, hi = 80, N = 800) {
    const out = [];
    for (let b = lo; b <= hi; b++) out.push([b, echo(shape, b, coated, N).share]);
    return out;
  }

  /* Radar equation. Reference radar: sees σ = 1 m² up to R_REF km. σ in m², R in km. */
  const R_REF = 150;
  // radar cross-sections in m², rough public estimates for a microwave radar (about 3 cm) seen from the front
  const OBJECTS = { airliner: 100, jet: 10, human: 1, bird: 0.01, stealth: 0.001, insect: 0.00001 };
  const range = sigma => R_REF * Math.pow(sigma, 0.25);
  // received power compared with the weakest echo the radar still detects
  const margin = (sigma, R) => sigma * Math.pow(R_REF / R, 4);

  root.Radar = { TOL, COAT, SHAPES, ray, echo, lobes, R_REF, OBJECTS, range, margin };
})(typeof window !== 'undefined' ? window : globalThis);
