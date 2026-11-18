/* Physik verstehen – optics without DOM: window.Optics (see README.md).
   Units: centimetres; the mirror or lens sits at x = 0, the object stands at x = -g (left), y points up.
   Sign convention as in German schools ("reell = positiv"):
     g > 0   object distance
     f > 0   concave mirror / converging lens, f < 0 convex mirror / diverging lens, f = Infinity plane mirror
     b > 0   real image (mirror: in front of it, lens: behind it), b < 0 virtual image
     m = B/G = -b/g   m < 0: upside down
   Ray diagrams use the paraxial approximation: rays change direction on the vertical line through the vertex. */
(function (root) {
  'use strict';

  const FAR = 400; // rays are drawn to here (cm); the SVG clips them

  // curvature 1/r in 1/m → radius in cm (positive = concave); 0 → plane
  const radiusOf = k => (k === 0 ? Infinity : 100 / k);
  // mirror: f = r/2; lens: f = 1/D (D in dioptres)
  const mirrorFocal = k => (k === 0 ? Infinity : 50 / k);
  const lensFocal = d => (d === 0 ? Infinity : 100 / d);

  // Imaging equation 1/f = 1/g + 1/b
  function image(f, g) {
    if (!Number.isFinite(f)) return { b: -g, m: 1, infinite: false };
    if (Math.abs(g - f) < 1e-9) return { b: Infinity, m: Infinity, infinite: true };
    const b = f * g / (g - f);
    return { b, m: -b / g, infinite: false };
  }

  // What kind of image: real/virtual, upright/inverted, enlarged/reduced/same size
  function describe(img) {
    if (img.infinite) return { real: null, upright: null, size: 'infinite' };
    const a = Math.abs(img.m);
    return {
      real: img.b > 0,
      upright: img.m > 0,
      size: Math.abs(a - 1) < 0.005 ? 'same' : a > 1 ? 'enlarged' : 'reduced',
    };
  }

  /* Principal rays from the tip of the object (height G) for a lens with focal length f.
     Each ray: { id, inc: [[x,y],[x,y]] (to the lens), out: [[x,y],[x,y]] (after it),
                back: [[x,y],[x,y]] | null (dashed backward extension to a virtual image),
                pre: [[x,y],[x,y]] | null (dashed: the incoming ray aims at / comes from a focal point) }
     A mirror is the lens folded at x = 0: the parts after the element are mirrored (x → -x), see fold(). */
  function lensRays(f, g, G) {
    const img = image(f, g);
    const virtual = !img.infinite && img.b < 0;
    const P = [-g, G];
    const rays = [];
    const add = (id, h, slope, pre) => {
      if (!Number.isFinite(h) || Math.abs(h) > FAR) return;
      const ray = { id, inc: [P, [0, h]], out: [[0, h], [FAR, h + slope * FAR]], back: null, pre: pre || null };
      if (virtual) ray.back = [[0, h], [img.b, h + slope * img.b]];
      rays.push(ray);
    };
    const plane = !Number.isFinite(f);
    // 1. parallel ray → through the focal point F' (x = f) behind the lens
    add('parallel', G, plane ? 0 : -G / f);
    // 2. focal ray: through (or towards) the focal point F (x = -f) in front → parallel afterwards
    if (!plane && Math.abs(g - f) > 1e-9) {
      const h = -G * f / (g - f);
      let pre = null;
      if (f > 0 && g < f) pre = [[-f, 0], P];   // the object stands between F and the lens: the ray comes from F
      if (f < 0) pre = [[0, h], [-f, 0]];        // diverging: the ray aims at F behind the lens
      add('focal', h, 0, pre);
    }
    // 3. central ray: through the centre (vertex) without changing direction
    add('central', 0, -G / g);
    return rays;
  }

  const flip = pts => pts && pts.map(([x, y]) => [-x, y]);
  function fold(rays) {
    return rays.map(r => ({
      id: r.id, inc: r.inc, out: flip(r.out), back: flip(r.back),
      // pre lines extend the incoming ray (also behind a convex mirror, towards its focal point): not folded
      pre: r.pre,
    }));
  }

  // Everything the page needs for one setup. kind: 'mirror' (value = curvature 1/m) or 'lens' (value = dioptres)
  function setup(kind, value, g, G) {
    const f = kind === 'mirror' ? mirrorFocal(value) : lensFocal(value);
    const img = image(f, g);
    const rays = lensRays(f, g, G);
    const side = kind === 'mirror' ? -1 : 1; // where a real image lies
    return {
      kind, value, g, G, f,
      r: kind === 'mirror' ? radiusOf(value) : null,
      b: img.b, m: img.m, infinite: img.infinite,
      info: describe(img),
      imageX: img.infinite ? null : side * img.b,
      imageH: img.infinite ? null : img.m * G,
      rays: kind === 'mirror' ? fold(rays) : rays,
      element: value === 0 ? 'plane' : kind === 'mirror' ? (value > 0 ? 'concave' : 'convex') : (value > 0 ? 'converging' : 'diverging'),
    };
  }

  // Which case of the imaging rules applies (for the explanation text)
  function regime(f, g) {
    if (!Number.isFinite(f)) return 'plane';
    if (f < 0) return 'negative';
    const d = g - f;
    if (Math.abs(d) < 1e-9) return 'atF';
    if (d < 0) return 'insideF';
    if (Math.abs(g - 2 * f) < 1e-9) return 'at2F';
    return g < 2 * f ? 'between' : 'beyond2F';
  }

  /* ---------- Refraction (angles in degrees from the normal) ---------- */
  // Snell: n1·sin α = n2·sin β; null = total internal reflection
  function snell(n1, n2, alpha) {
    const s = n1 * Math.sin(alpha * Math.PI / 180) / n2;
    return s > 1 ? null : Math.asin(s) * 180 / Math.PI;
  }
  const critical = (n1, n2) => (n1 > n2 ? Math.asin(n2 / n1) * 180 / Math.PI : null);
  // share of reflected light for unpolarised light (Fresnel); 1 at total internal reflection
  function reflectance(n1, n2, alpha) {
    const beta = snell(n1, n2, alpha);
    if (beta == null) return 1;
    const ci = Math.cos(alpha * Math.PI / 180), ct = Math.cos(beta * Math.PI / 180);
    const rs = (n1 * ci - n2 * ct) / (n1 * ci + n2 * ct), rp = (n2 * ci - n1 * ct) / (n2 * ci + n1 * ct);
    return (rs * rs + rp * rp) / 2;
  }
  /* Where light from a point P under water (y < 0) leaves the surface (y = 0) on its way to the eye E (y > 0):
     n·sin(angle in water) = sin(angle in air), solved by bisection. */
  function exitPoint(n, P, E) {
    const f = s => n * (s - P[0]) / Math.hypot(s - P[0], P[1]) - (E[0] - s) / Math.hypot(E[0] - s, E[1]);
    let lo = Math.min(P[0], E[0]), hi = Math.max(P[0], E[0]);
    for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
    return (lo + hi) / 2;
  }
  /* Where the eye sees P: the eye extends the rays it receives straight back. Two rays to the two edges of
     the pupil (±w/2 across the line of sight) meet in the apparent point. */
  function apparent(n, P, E, w = 0.4) {
    const s0 = exitPoint(n, P, E), dx = E[0] - s0, dy = E[1], l = Math.hypot(dx, dy);
    const off = [-dy / l * w / 2, dx / l * w / 2];
    const line = e => { const s = exitPoint(n, P, e); return { p: [s, 0], d: [s - e[0], -e[1]] }; };
    const a = line([E[0] + off[0], E[1] + off[1]]), b = line([E[0] - off[0], E[1] - off[1]]);
    const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    if (Math.abs(den) < 1e-12) return { exit: s0, point: P.slice() };
    const tt = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
    return { exit: s0, point: [a.p[0] + a.d[0] * tt, a.p[1] + a.d[1] * tt] };
  }

  /* ---------- Dispersion: prism and raindrop (lengths in arbitrary units, λ in nm) ---------- */
  // Cauchy: n = A + B/λ² (crown glass BK7 and water, good to about ±0.002 in the visible range)
  const nGlass = l => 1.5046 + 4200 / (l * l);
  const nWater = l => 1.3240 + 3046 / (l * l);
  const COLORS = [680, 620, 580, 540, 490, 450, 410];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  // vector form of Snell; nrm points to the side the light comes from; null = total internal reflection
  function refractVec(d, nrm, eta) {
    const ci = -dot(nrm, d), k = 1 - eta * eta * (1 - ci * ci);
    if (k < 0) return null;
    const f = eta * ci - Math.sqrt(k);
    return [eta * d[0] + f * nrm[0], eta * d[1] + f * nrm[1]];
  }
  const reflectVec = (d, nrm) => { const k = 2 * dot(d, nrm); return [d[0] - k * nrm[0], d[1] - k * nrm[1]]; };
  // ray from p along d against segment a–b: distance or Infinity
  function hitSeg(p, d, a, b) {
    const e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-12) return Infinity;
    const w = [a[0] - p[0], a[1] - p[1]], s = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    return s > 1e-9 && u >= 0 && u <= 1 ? s : Infinity;
  }
  /* Equilateral prism with side 10 (base on y = 0, apex up). White light hits the middle of the left face at the
     angle of incidence alpha (degrees). Per wavelength: points of the path, the direction it leaves, the deviation. */
  const PRISM = [[-5, 0], [0, 5 * Math.sqrt(3)], [5, 0]];
  function prism(alpha, lambda) {
    const n = nGlass(lambda), out = [0.5 * -Math.sqrt(3), 0.5]; // outward normal of the left face
    const a0 = Math.atan2(-out[1], -out[0]) + alpha * Math.PI / 180; // turn the inward normal by alpha
    const d0 = [Math.cos(a0), Math.sin(a0)], M = [-2.5, 2.5 * Math.sqrt(3)];
    const pts = [[M[0] - 9 * d0[0], M[1] - 9 * d0[1]], M];
    let d = refractVec(d0, out, 1 / n), p = M;
    const faces = [[PRISM[1], PRISM[2], [Math.sqrt(3) / 2, 0.5]], [PRISM[0], PRISM[2], [0, -1]], [PRISM[0], PRISM[1], out]];
    for (let bounce = 0; bounce < 3; bounce++) {
      let best = null;
      for (const f of faces) { const s = hitSeg(p, d, f[0], f[1]); if (s < Infinity && (!best || s < best.s)) best = { s, f }; }
      if (!best) break;
      p = [p[0] + best.s * d[0], p[1] + best.s * d[1]]; pts.push(p);
      const inward = [-best.f[2][0], -best.f[2][1]], o = refractVec(d, inward, n);
      if (o) {
        pts.push([p[0] + 12 * o[0], p[1] + 12 * o[1]]);
        const dev = Math.atan2(d0[0] * o[1] - d0[1] * o[0], dot(d0, o)) * 180 / Math.PI;
        return { lambda, n, pts, out: o, deviation: -dev, tir: false };
      }
      d = reflectVec(d, inward);
    }
    return { lambda, n, pts, out: null, deviation: null, tir: true };
  }
  /* Raindrop (radius 1, centre 0): sunlight comes from the left at height b (0…1), is refracted, reflected once
     inside and refracted out. theta = angle between the light leaving and the direction back to the sun –
     the angle at which an observer with the sun behind them sees this colour (primary rainbow). */
  function drop(b, lambda) {
    const n = nWater(lambda), P1 = [-Math.sqrt(1 - b * b), b], d0 = [1, 0];
    const t1 = refractVec(d0, P1, 1 / n);
    const P2 = [P1[0] - 2 * dot(P1, t1) * t1[0], P1[1] - 2 * dot(P1, t1) * t1[1]];
    const r = reflectVec(t1, [-P2[0], -P2[1]]);
    const P3 = [P2[0] - 2 * dot(P2, r) * r[0], P2[1] - 2 * dot(P2, r) * r[1]];
    const o = refractVec(r, [-P3[0], -P3[1]], n);
    const theta = Math.acos(Math.max(-1, Math.min(1, -o[0]))) * 180 / Math.PI;
    return { lambda, n, pts: [[-2.2, b], P1, P2, P3, [P3[0] + 2 * o[0], P3[1] + 2 * o[1]]], out: o, theta };
  }
  // the largest angle over all heights b: where the light piles up (the rainbow)
  function rainbowAngle(lambda) {
    let best = [0, 0];
    for (let i = 0; i <= 2000; i++) { const b = i / 2000 * 0.9999, th = drop(b, lambda).theta; if (th > best[1]) best = [b, th]; }
    return { b: best[0], theta: best[1] };
  }

  root.Optics = { nGlass, nWater, COLORS, refractVec, prism, PRISM, drop, rainbowAngle, radiusOf, mirrorFocal, lensFocal, image, describe, lensRays, setup, regime, FAR, snell, critical, reflectance, exitPoint, apparent };
})(typeof window !== 'undefined' ? window : globalThis);
