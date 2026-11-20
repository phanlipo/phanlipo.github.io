/* Doppler effect without DOM: a siren drives along a straight road (y = 0, in +x direction) at speed v and passes the
   listener, who stands at distance d from the road (at x = 0, y = −d), at time t = 0. Still air, speed of sound c.
   Units: m, s, Hz. Used by index.html (window.Doppler) and the tests. */
(function (root) {
  'use strict';
  const C = 343; // speed of sound in air at 20 °C, m/s

  // the sound heard at time tr was sent at te: c·(tr − te) = √((v·te)² + d²), the smaller root (te < tr; v < c)
  function emissionTime(v, d, tr, c = C) {
    const k = c * c - v * v;
    return (c * c * tr - Math.sqrt(v * v * c * c * tr * tr + k * d * d)) / k;
  }
  // frequency of the sound sent at te: f' = f / (1 − v·cos θ / c), θ between the velocity and the line to the listener
  function heardFrom(f, v, d, te, c = C) {
    const x = v * te, r = Math.hypot(x, d), cos = r > 0 ? -x / r : 0;
    return f / (1 - v * cos / c);
  }
  const heard = (f, v, d, tr, c = C) => heardFrom(f, v, d, emissionTime(v, d, tr, c), c);
  // loudness relative to 1 m (sound pressure ∝ 1/r), for the time tr at the listener
  const distanceAt = (v, d, tr, c = C) => { const te = emissionTime(v, d, tr, c); return Math.hypot(v * te, d); };

  function summary(f, v, d, c = C) {
    const up = f * c / (c - v), down = f * c / (c + v);
    return {
      approach: up, recede: down,
      semitones: 12 * Math.log2(up / down),
      // the listener hears exactly f from the moment the siren is right in front (te = 0) – then it is already past
      lagTime: d / c, lagDistance: v * d / c,
      // half of the change happens within ± this time around the passing (|cos θ| ≤ 1/√2, i.e. |x| ≤ d)
      changeTime: 2 * d / v,
      wavelengthFront: (c - v) / f, wavelengthBack: (c + v) / f, wavelength: c / f,
    };
  }
  // curve of the heard frequency over the time at the listener, tr from −T to T
  function curve(f, v, d, T, n = 200, c = C) {
    const out = [];
    for (let i = 0; i <= n; i++) { const tr = -T + 2 * T * i / n; out.push([tr, heard(f, v, d, tr, c)]); }
    return out;
  }

  root.Doppler = { C, emissionTime, heardFrom, heard, distanceAt, summary, curve };
})(typeof window !== 'undefined' ? window : globalThis);
