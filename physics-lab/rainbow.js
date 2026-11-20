/* Physik verstehen – where the rainbow is in the sky, without DOM: window.Rainbow (see README.md).
   Water after Cauchy n = 1.3240 + 3046/λ² (λ in nm, as in optics.js). After k reflections inside the drop the light is
   turned by D = 2(α − β) + k(π − 2β), sin β = sin α / n; light piles up at the extreme of D, where
   cos²α = (n² − 1) / (k(k + 2)). Seen from the observer the bow is a circle of angular radius
     primary (k = 1):   θ₁ = 4β − 2α          (about 42°)
     secondary (k = 2): θ₂ = π + 2α − 6β      (about 51°)
   around the point opposite the sun (the antisolar point), which lies h below the horizon when the sun is h high.
   Sky picture: azimuth (from the antisolar direction) to the right, elevation up, in degrees. */
(function (root) {
  'use strict';

  const D2R = Math.PI / 180;
  const COLORS = [680, 620, 580, 540, 490, 450, 410];
  const nWater = l => 1.3240 + 3046 / (l * l);

  function radius(lambda, k = 1) {
    const n = nWater(lambda), a = Math.acos(Math.sqrt((n * n - 1) / (k * (k + 2)))), b = Math.asin(Math.sin(a) / n);
    return (k === 1 ? 4 * b - 2 * a : Math.PI + 2 * a - 6 * b) / D2R;
  }

  /* Points of the circle with angular radius theta (deg) around the antisolar point, sun h (deg) high, as
     [azimuth, elevation] in degrees; n points, starting at the top. */
  function circle(theta, h, n = 180) {
    const t = theta * D2R, s = h * D2R, out = [];
    const A = [Math.cos(s), 0, -Math.sin(s)], U = [Math.sin(s), 0, Math.cos(s)], E = [0, 1, 0];
    for (let i = 0; i <= n; i++) {
      const p = 2 * Math.PI * i / n, c = Math.cos(t), sn = Math.sin(t);
      const P = [0, 1, 2].map(j => c * A[j] + sn * (Math.cos(p) * U[j] + Math.sin(p) * E[j]));
      out.push([Math.atan2(P[1], P[0]) / D2R, Math.asin(Math.max(-1, Math.min(1, P[2]))) / D2R]);
    }
    return out;
  }

  // share of the circle above the horizon (0 … 1); top of the bow above the horizon in degrees
  function visible(theta, h) {
    const x = Math.tan(h * D2R) / Math.tan(theta * D2R);
    return x >= 1 ? 0 : x <= -1 ? 1 : Math.acos(x) / Math.PI;
  }
  const top = (theta, h) => theta - h;

  root.Rainbow = { COLORS, nWater, radius, circle, visible, top };
})(typeof window !== 'undefined' ? window : globalThis);
