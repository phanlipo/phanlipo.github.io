/* Physik verstehen – colour of the sky without DOM: window.Sky (see README.md).
   Sunlight (black body 5778 K) passes through a flat, uniform layer of air and is scattered once:
     optical depth of the air at sea level (Hansen & Travis 1974, λ in µm):
       τ(λ) = 0.008569·λ⁻⁴·(1 + 0.0113·λ⁻² + 0.00013·λ⁻⁴)          ("air":   ∝ 1/λ⁴, Rayleigh)
       τ(λ) = τ(550 nm)                                               ("drops": the same for every colour)
     air mass (path length compared with the sun overhead, Kasten & Young 1989):
       m(h) = 1 / (sin h + 0.50572·(h + 6.07995°)^−1.6364)
     direct sunlight on the ground: S·e^{−τ·m_sun}
     sky light from elevation e at an angle θ from the sun (single scattering, Rayleigh phase function):
       L = S · 3/(16π)·(1 + cos²θ) · m_v·(e^{−τ·m_s} − e^{−τ·m_v}) / (m_v − m_s)   (limit m_v = m_s: τ·m·e^{−τ·m})
   Colour: spectrum × CIE 1931 colour matching functions (multi-lobe Gaussian fit of Wyman, Sloan & Shirley 2013)
   → XYZ → linear sRGB → gamma. No multiple scattering, no ozone, no dust. */
(function (root) {
  'use strict';

  const D2R = Math.PI / 180;
  const LAMBDAS = [];
  for (let l = 380; l <= 780; l += 10) LAMBDAS.push(l);

  // black body, relative (peak of the visible range not normalised; only ratios matter)
  function planck(nm, T = 5778) {
    const l = nm * 1e-9, h = 6.62607015e-34, c = 2.99792458e8, k = 1.380649e-23;
    return 1 / (l ** 5 * (Math.exp(h * c / (l * k * T)) - 1));
  }
  const SUN = LAMBDAS.map(l => planck(l));
  const sunMax = Math.max(...SUN);
  for (let i = 0; i < SUN.length; i++) SUN[i] /= sunMax;

  function tauAir(nm) { const l = nm / 1000; return 0.008569 * l ** -4 * (1 + 0.0113 * l ** -2 + 0.00013 * l ** -4); }
  const TAU = {
    air: LAMBDAS.map(tauAir),
    drops: LAMBDAS.map(() => tauAir(550)),
    none: LAMBDAS.map(() => 0),
  };
  const airMass = hDeg => 1 / (Math.sin(Math.max(0, hDeg) * D2R) + 0.50572 * (Math.max(0, hDeg) + 6.07995) ** -1.6364);

  // CIE 1931 2° colour matching functions, piecewise Gaussian fit
  const g = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
  const CMF = LAMBDAS.map(l => [
    1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
    0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
    1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
  ]);
  function xyz(spec) {
    let X = 0, Y = 0, Z = 0;
    for (let i = 0; i < LAMBDAS.length; i++) { X += spec[i] * CMF[i][0]; Y += spec[i] * CMF[i][1]; Z += spec[i] * CMF[i][2]; }
    return [X, Y, Z];
  }
  const gamma = v => v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  /* XYZ → sRGB 0…255. exposure scales Y; colours brighter than white are toned down (Reinhard on Y) so that the hue
     stays. */
  function rgb([X, Y, Z], exposure = 1) {
    X *= exposure; Y *= exposure; Z *= exposure;
    if (Y > 0) { const f = 1 / (1 + Y); X *= f * 1.6; Y *= f * 1.6; Z *= f * 1.6; }
    let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, gg = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
    const m = Math.max(r, gg, b, 1); r /= m; gg /= m; b /= m; // keep the hue when a channel is too bright
    return [r, gg, b].map(v => Math.round(255 * gamma(Math.max(0, Math.min(1, v)))));
  }
  // white reference: the sun's own light (outside the air) has Y = Y_SUN
  const Y_SUN = xyz(SUN)[1];

  // transmission e^{−τ·m} of direct sunlight at the sun elevation h, per wavelength
  const transmission = (mode, h) => TAU[mode].map(t => Math.exp(-t * airMass(h)));
  const direct = (mode, h) => SUN.map((s, i) => s * transmission(mode, h)[i]);

  /* Sky light (relative to the sunlight outside the air) seen at elevation e (deg) and azimuth a from the sun (deg),
     sun at elevation h. */
  function skySpectrum(mode, h, e, a) {
    const hs = h * D2R, ev = e * D2R, az = a * D2R;
    const cosT = Math.sin(hs) * Math.sin(ev) + Math.cos(hs) * Math.cos(ev) * Math.cos(az);
    const P = 3 / (16 * Math.PI) * (1 + cosT * cosT), ms = airMass(h), mv = airMass(e);
    return TAU[mode].map((t, i) => {
      if (t === 0) return 0;
      const f = Math.abs(mv - ms) < 1e-6 ? t * ms * Math.exp(-t * ms) : mv * (Math.exp(-t * ms) - Math.exp(-t * mv)) / (mv - ms);
      return SUN[i] * P * f;
    });
  }

  // exposure: the blue sky overhead at noon (sun 60° high, air) is shown as a bright, not glaring blue
  const EXPOSURE = 0.9 / xyz(skySpectrum('air', 60, 90, 0))[1];
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  const skyColor = (mode, h, e, a) => rgb(xyz(skySpectrum(mode, h, e, a)), EXPOSURE);
  // the sun disc itself: far brighter than the sky, so it is shown as its colour at full brightness
  const sunColor = (mode, h) => { const s = xyz(direct(mode, h)); return rgb(s, 3 / Math.max(1e-12, s[1])); };

  const ratio = (l1, l2) => (l2 / l1) ** 4; // how much more light of wavelength l1 is scattered than of l2 (Rayleigh)

  root.Sky = { LAMBDAS, SUN, TAU, tauAir, airMass, transmission, direct, skySpectrum, skyColor, sunColor, xyz, rgb, hex, ratio, Y_SUN, EXPOSURE };
})(typeof window !== 'undefined' ? window : globalThis);
