/* Physik verstehen – light behind N slits without DOM: window.Waves (see README.md).
   Fraunhofer approximation (screen far away). Units: wavelength in nm, slit spacing d and slit width a in µm,
   screen distance L in m, positions on the screen x in cm.
     δ  = 2π·d·sinθ/λ      phase difference between neighbouring slits (path difference Δs = d·sinθ)
     β  = π·a·sinθ/λ       half the phase difference across one slit
     I/I0 = (sin β / β)² · (sin(Nδ/2) / (N·sin(δ/2)))²     (1 in the centre)                                        */
(function (root) {
  'use strict';

  const L = 1;           // screen distance in m
  const SMAX = 0.95;     // largest sin θ shown

  // relative interference term of N slits for phase difference δ (limit 1 where sin(δ/2) = 0)
  function grating(n, delta) {
    if (n === 1) return 1;
    const s = Math.sin(delta / 2);
    if (Math.abs(s) < 1e-9) return 1;
    const q = Math.sin(n * delta / 2) / (n * s);
    return q * q;
  }
  function single(beta) {
    if (Math.abs(beta) < 1e-12) return 1;
    const q = Math.sin(beta) / beta;
    return q * q;
  }
  // p = { n, lambda (nm), d (µm), a (µm) }; s = sin θ
  function phases(p, s) {
    const lam = p.lambda * 1e-3; // µm
    return { delta: 2 * Math.PI * p.d * s / lam, beta: Math.PI * p.a * s / lam, ds: p.d * s / lam };
  }
  function intensity(p, s) {
    const { delta, beta } = phases(p, s);
    return single(beta) * grating(p.n, delta);
  }

  const xOfSin = s => L * 100 * Math.tan(Math.asin(s));       // cm on the screen
  const sinOfX = x => Math.sin(Math.atan(x / (L * 100)));
  // half width of the screen part shown: about 3.5 orders of the grating (same scale for every N)
  const range = p => xOfSin(Math.min(SMAX, 3.5 * p.lambda * 1e-3 / p.d));

  // principal maxima k = 0, ±1, … that lie on the screen part shown (sin θ = kλ/d)
  function orders(p) {
    const X = range(p), out = [];
    for (let k = 0; ; k++) {
      const s = k * p.lambda * 1e-3 / p.d;
      if (s > SMAX) break;
      const x = xOfSin(s);
      if (x > X + 1e-9) break;
      out.push({ k, sin: s, x, intensity: single(phases(p, s).beta) });
    }
    return out;
  }

  // phasor chain: one arrow of length 1 per slit, each turned by δ against the one before
  function phasors(n, delta) {
    const pts = [[0, 0]];
    let x = 0, y = 0;
    for (let k = 0; k < n; k++) { x += Math.cos(k * delta); y += Math.sin(k * delta); pts.push([x, y]); }
    return { pts, amplitude: Math.hypot(x, y) / n };
  }

  // colour of visible light (approximation after Dan Bruton), returns [r, g, b] 0…255
  function rgb(lambda) {
    let r = 0, g = 0, b = 0;
    const w = lambda;
    if (w < 440) { r = -(w - 440) / 60; b = 1; }
    else if (w < 490) { g = (w - 440) / 50; b = 1; }
    else if (w < 510) { g = 1; b = -(w - 510) / 20; }
    else if (w < 580) { r = (w - 510) / 70; g = 1; }
    else if (w < 645) { r = 1; g = -(w - 645) / 65; }
    else r = 1;
    const f = w < 420 ? 0.3 + 0.7 * (w - 380) / 40 : w > 700 ? 0.3 + 0.7 * (750 - w) / 50 : 1;
    return [r, g, b].map(c => Math.round(255 * Math.pow(Math.max(0, c) * f, 0.8)));
  }

  root.Waves = { L, SMAX, grating, single, phases, intensity, xOfSin, sinOfX, range, orders, phasors, rgb };
})(typeof window !== 'undefined' ? window : globalThis);
