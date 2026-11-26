/* Physik verstehen – why X-ray light needs a particle accelerator, without DOM: window.Sync (see README.md).
   An electron of energy E (GeV) in a bending magnet of field B (T), relativistic (v ≈ c):
     γ = E / (m_e c²)                     Lorentz factor (m_e c² = 0.51099895 MeV)
     1 − v/c = 1 − √(1 − 1/γ²)            how far below the speed of light it is
     ρ = p/(e·B) ≈ E/(c·e·B)              bending radius: ρ[m] = 3.3356 · E[GeV] / B[T]
     θ ≈ 1/γ                              opening angle of the light cone (rad)
     λ_c = 4π·ρ / (3·γ³)                  critical wavelength (half of the power at shorter wavelengths)
     E_c = h·c/λ_c ≈ 0.665 · E² · B keV   critical photon energy
     U₀ = 88.46 keV · E⁴ / ρ[m]           energy radiated per turn (Sands), refilled by the cavities every turn
   A proton of the same energy has a γ 1836 times smaller: λ_c is 1836³ ≈ 6·10⁹ times longer. */
(function (root) {
  'use strict';

  const ME = 0.51099895e-3;       // electron rest energy in GeV
  const MP = 0.93827209;          // proton rest energy in GeV
  const C = 299792458;
  const HC = 1.23984198e-6;       // h·c in eV·m

  function ring(E, B, rest = ME) {
    const gamma = E / rest;
    const beta = Math.sqrt(1 - 1 / (gamma * gamma));
    const rho = E * 1e9 * beta / (C * B);                   // p·c = β·E (eV), ρ = p/(e·B)
    const lambda = 4 * Math.PI * rho / (3 * gamma ** 3);    // m
    const ec = HC / lambda;                                 // eV
    const u0 = 88.46e3 * E ** 4 / rho * (rest === ME ? 1 : (ME / rest) ** 4);   // eV per turn
    // 1 − β without cancellation: 1/(γ²·(1 + β))
    return { E, B, gamma, beta, slow: 1 / (gamma * gamma * (1 + beta)), rho, theta: 1 / gamma, lambda, ec, u0, turn: 2 * Math.PI * rho / (beta * C) };
  }

  // Kinds of light by wavelength (m) – the bands of the spectrum bar
  const BANDS = [
    { id: 'radio', lo: 1e-3 }, { id: 'ir', lo: 780e-9 }, { id: 'vis', lo: 380e-9 }, { id: 'uv', lo: 10e-9 },
    { id: 'soft', lo: 0.1e-9 }, { id: 'hard', lo: 0 },
  ];
  const band = lambda => BANDS.find(b => lambda >= b.lo).id;

  // Sizes to compare with (m): what light of that wavelength can still make out
  const SIZES = [
    { id: 'cell', s: 10e-6 }, { id: 'bacterium', s: 1e-6 }, { id: 'virus', s: 100e-9 },
    { id: 'protein', s: 5e-9 }, { id: 'atom', s: 0.15e-9 },
  ];

  root.Sync = { ME, MP, HC, ring, band, BANDS, SIZES };
})(typeof window !== 'undefined' ? window : globalThis);
