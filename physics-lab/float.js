/* Physik verstehen – why an iron ship floats, without DOM: window.Float (see README.md).
   10 kg of iron (density 7870 kg/m³, 1.27 L), either as a solid cube ("lump") or rolled into a 1 mm sheet and bent into an
   open box with a square base ("hull"): base a² + walls 4·a·H = sheet area (walls thin, outer = inner size).
   Archimedes: buoyancy F_A = ρ_liquid · g · V_displaced. The object floats if it can displace its own weight before the
   water reaches its rim:  draft d = M / (ρ_liquid · a²) ≤ H  (M = iron + load). Otherwise a hull fills with water and
   sinks; then only the volume of the iron itself gives buoyancy (the load counts as small and dense). */
(function (root) {
  'use strict';

  const G = 9.81, RHO_FE = 7870, M_FE = 10, SHEET = 0.001;
  const V_FE = M_FE / RHO_FE, AREA = V_FE / SHEET, CUBE = Math.cbrt(V_FE);
  const LIQUIDS = { fresh: 1000, sea: 1025, mercury: 13534 };

  // side of the square base of an open box of height H (m) made from the whole sheet
  const hullSide = H => (-4 * H + Math.sqrt(16 * H * H + 4 * AREA)) / 2;

  /* shape 'lump' | 'hull', H wall height in m, load in kg, liquid key. Returns size, draft, forces and whether it
     floats; maxLoad = the largest load that still floats. */
  function state(shape, H, load, liquid) {
    const rho = LIQUIDS[liquid], M = M_FE + load;
    const a = shape === 'lump' ? CUBE : hullSide(H), h = shape === 'lump' ? CUBE : H;
    const vOuter = a * a * h, draft = M / (rho * a * a), floats = draft <= h;
    const vDisp = floats ? a * a * draft : V_FE; // sunk: the water fills the hull, only the iron displaces water
    return {
      shape, a, h, M, rho, draft: floats ? draft : h, floats,
      weight: M * G, buoyancy: rho * G * vDisp, vDisp,
      meanDensity: M / vOuter, maxLoad: Math.max(0, rho * vOuter - M_FE),
    };
  }

  // wall height with the largest load: open box of given area holds most for a = 2H, i.e. 12·H² = area
  const bestH = Math.sqrt(AREA / 12);

  root.Float = { G, RHO_FE, M_FE, SHEET, V_FE, AREA, CUBE, LIQUIDS, hullSide, state, bestH };
})(typeof window !== 'undefined' ? window : globalThis);
