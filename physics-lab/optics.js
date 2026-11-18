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

  root.Optics = { radiusOf, mirrorFocal, lensFocal, image, describe, lensRays, setup, regime, FAR };
})(typeof window !== 'undefined' ? window : globalThis);
