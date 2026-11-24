/* Planeten – positions, brightness, visibility and events of the planets, window.PlanetEphemeris.
   No DOM here: the page and the tests use the same calculation. Architecture: planets/README.md

   Orbits: Keplerian elements and their rates per century from E. M. Standish, "Keplerian Elements for
   Approximate Positions of the Major Planets" (JPL Solar System Dynamics, Table 1, valid 1800–2050,
   J2000 ecliptic and equinox). Error compared with the full JPL ephemeris: a few arcminutes at most.
   Earth = Earth–Moon barycentre (≤ 4 700 km off, negligible here).
   Brightness: formulas of the Astronomical Almanac (J. L. Hilton 2005), Saturn with the tilt of its rings
   (Meeus, Astronomical Algorithms, ch. 45).
   Time: a JS Date (UTC); the difference TT − UT (about 69 s) is ignored.
   Angles are degrees, distances astronomical units (AU). */
(function (root) {
  'use strict';
  const DEG = Math.PI / 180;
  const MIN_YEAR = 1800, MAX_YEAR = 2050;
  const MIN_TIME = Date.UTC(MIN_YEAR, 0, 1), MAX_TIME = Date.UTC(MAX_YEAR, 11, 31, 23, 59);

  // a, e, I, L, long. perihelion, long. ascending node – value at J2000 and change per Julian century
  const ELEMENTS = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
      [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus: [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
      [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth: [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
      [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars: [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
      [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
      [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn: [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
      [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus: [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
      [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
      [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  };
  const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const INNER = new Set(['mercury', 'venus']);
  const BODIES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

  const wrap360 = a => ((a % 360) + 360) % 360;
  const wrap180 = a => { const w = wrap360(a); return w > 180 ? w - 360 : w; };
  const centuries = time => (time / 86400000 + 2440587.5 - 2451545.0) / 36525;
  const clampTime = time => Math.min(MAX_TIME, Math.max(MIN_TIME, time));

  /** Orbital elements of a body at T (centuries since J2000) */
  function elements(body, T) {
    const [v, r] = ELEMENTS[body];
    const [a, e, I, L, peri, node] = v.map((x, i) => x + r[i] * T);
    return { a, e, I, L, peri, node };
  }

  /** Position in the orbit plane → heliocentric ecliptic x, y, z (AU) for eccentric anomaly E (radians) */
  function orbitPoint({ a, e, I, peri, node }, E) {
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const w = (peri - node) * DEG, O = node * DEG, i = I * DEG;
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), ci = Math.cos(i), si = Math.sin(i);
    return {
      x: (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp,
      y: (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp,
    };
  }

  /** Heliocentric ecliptic position (J2000) of a body at a time (ms) */
  function helio(body, time) {
    const el = elements(body, centuries(time));
    const M = wrap180(el.L - el.peri) * DEG;
    let E = M + el.e * Math.sin(M);
    for (let k = 0; k < 20; k++) {        // Newton's method for Kepler's equation M = E − e sin E
      const dE = (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-12) break;
    }
    const p = orbitPoint(el, E);
    p.r = Math.hypot(p.x, p.y, p.z);
    return p;
  }

  /** Points of the current orbit of a body (closed polygon in the ecliptic plane), for drawing */
  function orbit(body, time, n = 180) {
    const el = elements(body, centuries(time));
    const out = [];
    for (let k = 0; k <= n; k++) out.push(orbitPoint(el, (k / n) * 2 * Math.PI));
    return out;
  }

  // Ecliptic coordinates (J2000) → equatorial of date: precession in longitude, mean obliquity of date
  function toEquatorial(lon, lat, T) {
    const l = (lon + 1.396971 * T) * DEG, b = lat * DEG;
    const eps = (23.439291 - 0.0130042 * T) * DEG;
    const ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l));
    const dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));
    return { ra: wrap360(ra / DEG), dec: dec / DEG };
  }

  /** Magnitude from distances and phase angle i (Hilton 2005, Astronomical Almanac; x = i / 100°) */
  function magnitude(body, r, delta, i, ringTilt) {
    const d = 5 * Math.log10(r * delta), x = i / 100;
    switch (body) {
      case 'mercury': return -0.60 + d + x * (4.98 + x * (-4.88 + x * 3.02));
      case 'venus': return i < 163.6 ? -4.47 + d + x * (1.03 + x * (0.57 + x * 0.13)) : 0.98 + d - 1.02 * x;
      case 'mars': return -1.52 + d + 1.60 * x;
      case 'jupiter': return -9.40 + d + 0.50 * x;
      case 'saturn': { const s = Math.sin(Math.abs(ringTilt) * DEG); return -8.88 + d + 4.4 * x - 2.60 * s + 1.25 * s * s; }
      case 'uranus': return -7.19 + d + 0.28 * x;
      case 'neptune': return -6.87 + d;
    }
    return NaN;
  }

  /* ---------- The Moon: Meeus, Astronomical Algorithms, ch. 47, the larger periodic terms (about 0.1° accurate).
     Each term: multiples of D, M, M', F and the coefficient (longitude/latitude 1e-6 °, distance 1e-3 km). */
  const MOON_LR = [ // D, M, M', F, Σl, Σr
    [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
    [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
    [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
    [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
    [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  ];
  const MOON_B = [ // D, M, M', F, Σb
    [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
    [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
    [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324], [2, 0, 1, 1, 4200],
  ];
  const AU_KM = 149597870.7, EARTH_RADIUS_KM = 6378.14;
  /** Geocentric ecliptic longitude/latitude (J2000, like the planets) and distance (km) of the Moon */
  function moonPosition(time) {
    const T = centuries(time);
    const L = 218.3164477 + 481267.88123421 * T, D = (297.8501921 + 445267.1114034 * T) * DEG;
    const M = (357.5291092 + 35999.0502909 * T) * DEG, Mp = (134.9633964 + 477198.8675055 * T) * DEG;
    const F = (93.2720950 + 483202.0175233 * T) * DEG, Ecc = 1 - 0.002516 * T;
    let l = 0, r = 0, b = 0;
    for (const [d, m, mp, f, cl, cr] of MOON_LR) {
      const a = d * D + m * M + mp * Mp + f * F, e = m ? Ecc ** Math.abs(m) : 1;
      l += cl * e * Math.sin(a); r += cr * e * Math.cos(a);
    }
    for (const [d, m, mp, f, cb] of MOON_B) b += cb * (m ? Ecc : 1) * Math.sin(d * D + m * M + mp * Mp + f * F);
    // Meeus gives the equinox of date; back to J2000 so the rest of the pipeline treats it like the planets
    return { lon: wrap360(L + l / 1e6 - 1.396971 * T), lat: b / 1e6, km: 385000.56 + r / 1000 };
  }
  const MOON_PHASES = ['newMoon', 'firstQuarter', 'fullMoon', 'lastQuarter'];
  /** Phase of the Moon from its angle east of the Sun (0–360°): name and growing/waning */
  function moonPhaseName(age) {
    const a = wrap360(age);
    if (a < 6.5 || a >= 353.5) return 'newMoon';
    if (a < 83.5) return 'waxingCrescent';
    if (a < 96.5) return 'firstQuarter';
    if (a < 173.5) return 'waxingGibbous';
    if (a < 186.5) return 'fullMoon';
    if (a < 263.5) return 'waningGibbous';
    if (a < 276.5) return 'lastQuarter';
    return 'waningCrescent';
  }

  /* ---------- Jupiter's four large moons: Meeus ch. 44, low-accuracy method (good to a few hundredths of
     Jupiter's radius). x, y in Jupiter radii as seen from the Earth: x positive towards the west, y towards
     the north. behind: the moon is on the far side of Jupiter. */
  const GALILEAN = ['io', 'europa', 'ganymede', 'callisto'];
  function jupiterMoons(time) {
    const d = time / 86400000 + 2440587.5 - 2451545.0;
    const V = (172.74 + 0.00111588 * d) * DEG, M = (357.529 + 0.9856003 * d) * DEG;
    const N = (20.020 + 0.0830853 * d + 0.329 * Math.sin(V)) * DEG;
    const J = 66.115 + 0.9025179 * d - 0.329 * Math.sin(V);
    const A = 1.915 * Math.sin(M) + 0.020 * Math.sin(2 * M), B = 5.555 * Math.sin(N) + 0.168 * Math.sin(2 * N);
    const K = (J + A - B) * DEG;
    const R = 1.00014 - 0.01671 * Math.cos(M) - 0.00014 * Math.cos(2 * M);
    const r = 5.20872 - 0.25208 * Math.cos(N) - 0.00611 * Math.cos(2 * N);
    const delta = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(K));
    const psi = Math.asin(R / delta * Math.sin(K)) / DEG;
    const t = d - delta / 173, base = psi - B;
    const u = [163.8069 + 203.4058646 * t, 358.4140 + 101.2916335 * t, 5.7176 + 50.2345180 * t, 224.8092 + 21.4879800 * t].map(x => x + base);
    const G = (331.18 + 50.310482 * t) * DEG, H = (87.45 + 21.569231 * t) * DEG;
    const c1 = 0.473 * Math.sin(2 * (u[0] - u[1]) * DEG), c2 = 1.065 * Math.sin(2 * (u[1] - u[2]) * DEG);
    const c3 = 0.165 * Math.sin(G), c4 = 0.843 * Math.sin(H);
    const rr = [5.9057 - 0.0244 * Math.cos(2 * (u[0] - u[1]) * DEG), 9.3966 - 0.0882 * Math.cos(2 * (u[1] - u[2]) * DEG),
      14.9883 - 0.0216 * Math.cos(G), 26.3627 - 0.1939 * Math.cos(H)];
    const uu = [u[0] + c1, u[1] + c2, u[2] + c3, u[3] + c4].map(x => x * DEG);
    const De = 3.12 * Math.sin((J + 42.8) * DEG) * DEG;
    return GALILEAN.map((name, k) => ({
      name, x: rr[k] * Math.sin(uu[k]), y: -rr[k] * Math.cos(uu[k]) * Math.sin(De), behind: Math.cos(uu[k]) < 0,
    }));
  }

  /** Everything about a planet (or the Sun) seen from the Earth's centre at a time:
      lon/lat (geocentric ecliptic J2000), ra/dec (of date), r (from Sun), delta (from Earth),
      elongation (angle to the Sun), side ('east' = evening sky, 'west' = morning sky), phase angle,
      illuminated fraction, magnitude */
  function geo(body, time) {
    const T = centuries(time);
    const earth = helio('earth', time);
    if (body === 'moon') {
      const m = moonPosition(time), delta = m.km / AU_KM, b = m.lat * DEG, l = m.lon * DEG;
      const sun = geo('sun', time), age = wrap360(m.lon - sun.lon);
      const cosE = Math.cos(b) * Math.cos(l - sun.lon * DEG);
      const elongation = Math.acos(Math.max(-1, Math.min(1, cosE))) / DEG;
      const phaseAngle = Math.atan2(sun.delta * Math.sin(elongation * DEG), delta - sun.delta * Math.cos(elongation * DEG)) / DEG;
      const ia = Math.abs(phaseAngle);
      return {
        body, lon: m.lon, lat: m.lat, r: sun.delta, delta, km: m.km, ...toEquatorial(m.lon, m.lat, T),
        sunDistance: sun.delta, elongation, side: age < 180 ? 'east' : 'west', age, phase: moonPhaseName(age),
        phaseAngle: ia, illuminated: (1 + Math.cos(ia * DEG)) / 2, parallax: Math.asin(EARTH_RADIUS_KM / m.km) / DEG,
        mag: -12.73 + 0.026 * ia + 4e-9 * ia ** 4,
      };
    }
    if (body === 'sun') {
      const x = -earth.x, y = -earth.y, z = -earth.z, delta = earth.r;
      const lon = wrap360(Math.atan2(y, x) / DEG), lat = Math.asin(z / delta) / DEG;
      return { body, lon, lat, delta, r: 0, ...toEquatorial(lon, lat, T), mag: -26.7 };
    }
    let p = helio(body, time), dx, dy, dz, delta;
    for (let k = 0; k < 2; k++) {          // light time: where the planet was when the light left it
      dx = p.x - earth.x; dy = p.y - earth.y; dz = p.z - earth.z;
      delta = Math.hypot(dx, dy, dz);
      p = helio(body, time - delta * 0.0057755183 * 86400000);
    }
    dx = p.x - earth.x; dy = p.y - earth.y; dz = p.z - earth.z;
    delta = Math.hypot(dx, dy, dz);
    const lon = wrap360(Math.atan2(dy, dx) / DEG), lat = Math.asin(dz / delta) / DEG;
    const R = earth.r, r = p.r;
    const sunLon = wrap360(Math.atan2(-earth.y, -earth.x) / DEG);
    const cosE = (-earth.x * dx - earth.y * dy - earth.z * dz) / (R * delta);
    const elongation = Math.acos(Math.max(-1, Math.min(1, cosE))) / DEG;
    const cosI = (r * r + delta * delta - R * R) / (2 * r * delta);
    const phaseAngle = Math.acos(Math.max(-1, Math.min(1, cosI))) / DEG;
    let ringTilt = 0;
    if (body === 'saturn') {               // tilt of the rings towards the Earth (Meeus 45.3)
      const inc = (28.075216 - 0.012998 * T) * DEG, node = (169.508470 + 1.394681 * T) * DEG;
      const l = (lon + 1.396971 * T) * DEG, b = lat * DEG;
      ringTilt = Math.asin(Math.sin(inc) * Math.cos(b) * Math.sin(l - node) - Math.cos(inc) * Math.sin(b)) / DEG;
    }
    return {
      body, lon, lat, r, delta, ...toEquatorial(lon, lat, T),
      sunDistance: R, elongation, side: wrap180(lon - sunLon) >= 0 ? 'east' : 'west',
      phaseAngle, illuminated: (1 + Math.cos(phaseAngle * DEG)) / 2, ringTilt,
      mag: magnitude(body, r, delta, phaseAngle, ringTilt),
    };
  }

  /** Altitude and azimuth (from north over east) for an observer at lat/lon (degrees, east positive) */
  function horizon(ra, dec, time, lat, lon) {
    const d = time / 86400000 + 2440587.5 - 2451545.0, T = d / 36525;
    const gmst = 280.46061837 + 360.98564736629 * d + 0.000387933 * T * T;
    const H = (gmst + lon - ra) * DEG, phi = lat * DEG, de = dec * DEG;
    const alt = Math.asin(Math.sin(phi) * Math.sin(de) + Math.cos(phi) * Math.cos(de) * Math.cos(H));
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(de) * Math.cos(phi));
    return { alt: alt / DEG, az: wrap360(az / DEG + 180) };
  }

  const altitude = (body, time, lat, lon) => { const g = geo(body, time); return horizon(g.ra, g.dec, time, lat, lon); };

  // Rising and setting: altitude of the centre at the horizon (refraction, and the Sun's radius)
  const H0 = { sun: -0.833 };
  const STEP = 10 * 60000;

  /** Rising and setting within [from, to] (ms): { rise, set } as times or null; also always up/down */
  function riseSet(body, from, to, lat, lon) {
    // The Moon: its radius and its parallax (it is seen from the surface, not the Earth's centre)
    const h0 = body === 'moon' ? 0.7275 * geo('moon', from).parallax - 0.567 : H0[body] ?? -0.567;
    const f = t => altitude(body, t, lat, lon).alt - h0;
    let rise = null, set = null, t0 = from, v0 = f(from), anyUp = v0 > 0;
    for (let t1 = from + STEP; t0 < to; t1 = Math.min(to, t1 + STEP)) {
      const v1 = f(t1);
      if (v1 > 0) anyUp = true;
      if ((v0 <= 0) !== (v1 <= 0)) {
        let a = t0, b = t1, va = v0;
        for (let k = 0; k < 20 && b - a > 1000; k++) {   // bisection to about a second
          const m = (a + b) / 2, vm = f(m);
          if ((vm <= 0) === (va <= 0)) { a = m; va = vm; } else b = m;
        }
        const t = Math.round((a + b) / 2);
        if (v0 <= 0) { if (rise === null) rise = t; } else if (set === null) set = t;
      }
      t0 = t1; v0 = v1;
      if (t1 >= to) break;
    }
    return { rise, set, alwaysUp: rise === null && set === null && anyUp, alwaysDown: rise === null && set === null && !anyUp };
  }

  // Darkness for seeing planets: Sun at least 6° below the horizon (end of civil twilight)
  const DARK = -6;
  // A planet counts as visible this high above the horizon
  const MIN_ALT = 5;
  // Brighter than this: easy to see with the naked eye (Uranus ≈ 5.7 needs a dark sky or binoculars)
  const NAKED_EYE = 5;

  /** The dark period that contains the time, or else the next one (within 30 h); null when it never gets dark */
  function nightAround(time, lat, lon) {
    const from = time - 14 * 3600000, to = time + 30 * 3600000;
    const spans = [];
    let start = null;
    for (let t = from; t <= to; t += STEP) {
      const dark = altitude('sun', t, lat, lon).alt < DARK;
      if (dark && start === null) start = t;
      if (!dark && start !== null) { spans.push([start, t - STEP]); start = null; }
    }
    if (start !== null) spans.push([start, to]);
    const span = spans.find(([a, b]) => a <= time && time <= b) || spans.find(([a]) => a > time);
    if (!span) return null;
    // Polar night: one dark span over the whole window – take the 24 hours around the time
    if (span[0] === from && span[1] === to) return { start: time - 12 * 3600000, end: time + 12 * 3600000, polar: true };
    return { start: span[0], end: span[1], polar: false };
  }

  /** When a planet can be seen in the night around a time.
      kind: 'evening' (after dusk), 'morning' (before dawn), 'allNight', 'night' (in between),
      'eveningMorning', or none: 'nearSun' (lost in the Sun's glare), 'belowHorizon', 'noNight' */
  function visibility(body, time, lat, lon, night = nightAround(time, lat, lon)) {
    const g = geo(body, time);
    const base = { body, mag: g.mag, nakedEye: g.mag < NAKED_EYE, elongation: g.elongation, side: g.side };
    if (!night) return { ...base, kind: 'noNight' };
    const samples = [];
    for (let t = night.start; t <= night.end; t += STEP) samples.push({ t, ...altitude(body, t, lat, lon) });
    const up = samples.map(s => s.alt > MIN_ALT);
    const n = up.filter(Boolean).length;
    if (!n) return { ...base, kind: g.elongation < 20 ? 'nearSun' : 'belowHorizon', night };
    const first = up.indexOf(true), last = up.lastIndexOf(true);
    let best = samples[first];
    for (const s of samples) if (s.alt > best.alt) best = s;
    const atDusk = up[0], atDawn = up[up.length - 1];
    let gap = false;
    for (let k = first; k <= last; k++) if (!up[k]) { gap = true; break; }
    let kind;
    if (night.polar) kind = 'night';
    else if (n >= 0.9 * samples.length) kind = 'allNight';
    else if (atDusk && atDawn) kind = gap ? 'eveningMorning' : 'allNight';
    else if (atDusk) kind = 'evening';
    else if (atDawn) kind = 'morning';
    else kind = 'night';
    return { ...base, kind, night, from: samples[first].t, to: samples[last].t, best: { t: best.t, alt: best.alt, az: best.az } };
  }

  /* ---------- Events: conjunctions, oppositions, greatest elongation and brilliancy ----------
     Found by stepping one day at a time and refining by bisection (crossings) or ternary search (extremes). */
  const DAY = 86400000;
  const diffLon = (body, t) => { const g = geo(body, t), s = geo('sun', t); return wrap180(g.lon - s.lon); };

  function refineCrossing(fn, a, b) {
    let fa = fn(a);
    for (let k = 0; k < 30 && b - a > 60000; k++) {
      const m = (a + b) / 2, fm = fn(m);
      if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
    }
    return Math.round((a + b) / 2);
  }
  function refineExtreme(fn, a, b, max) {
    const s = max ? -1 : 1;
    for (let k = 0; k < 40 && b - a > 60000; k++) {
      const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
      if (s * fn(m1) < s * fn(m2)) b = m2; else a = m1;
    }
    return Math.round((a + b) / 2);
  }

  /** Events of a planet between two times, sorted: { type, time, ... }
      types: 'inferiorConjunction', 'superiorConjunction', 'conjunction', 'opposition',
      'greatestElongation' (with side and elongation), 'greatestBrilliancy' (Venus, with mag) */
  function events(body, from, to) {
    from = clampTime(from); to = clampTime(to);
    if (body === 'moon') return moonPhases(from, to);
    const out = [];
    const inner = INNER.has(body);
    const conj = t => diffLon(body, t), opp = t => wrap180(diffLon(body, t) - 180);
    const elong = t => geo(body, t).elongation, mag = t => geo(body, t).mag;
    let prev = null;
    for (let t = from; t <= to; t += DAY) {
      const g = geo(body, t), s = geo('sun', t);
      const cur = { t, c: wrap180(g.lon - s.lon), e: g.elongation, m: g.mag };
      cur.o = wrap180(cur.c - 180);
      if (prev) {
        if (Math.sign(prev.c) !== Math.sign(cur.c) && Math.abs(prev.c) < 90) {
          const time = refineCrossing(conj, prev.t, t);
          const type = inner ? (geo(body, time).delta < geo('sun', time).delta ? 'inferiorConjunction' : 'superiorConjunction') : 'conjunction';
          out.push({ type, time });
        }
        if (!inner && Math.sign(prev.o) !== Math.sign(cur.o) && Math.abs(prev.o) < 90) out.push({ type: 'opposition', time: refineCrossing(opp, prev.t, t) });
        if (prev.prev && inner) {
          const p = prev.prev;
          if (prev.e > p.e && prev.e >= cur.e) {
            const time = refineExtreme(elong, p.t, t, true), g2 = geo(body, time);
            out.push({ type: 'greatestElongation', time, side: g2.side, elongation: g2.elongation });
          }
          // Venus is brightest about five weeks before and after inferior conjunction (in the night sky)
          if (body === 'venus' && prev.m < p.m && prev.m <= cur.m && prev.e > 20) {
            const time = refineExtreme(mag, p.t, t, false), g2 = geo(body, time);
            out.push({ type: 'greatestBrilliancy', time, side: g2.side, mag: g2.mag });
          }
        }
      }
      cur.prev = prev ? { t: prev.t, e: prev.e, m: prev.m } : null;
      prev = cur;
    }
    return out.sort((a, b) => a.time - b.time);
  }

  /** Main phases of the Moon between two times: { type: 'newMoon'|'firstQuarter'|'fullMoon'|'lastQuarter', time } */
  function moonPhases(from, to) {
    const out = [], age = t => geo('moon', t).age, step = DAY / 4;
    let a0 = age(from);
    for (let t = from + step; t <= to; t += step) {
      const a1 = age(t);
      for (let k = 0; k < 4; k++) {
        const target = k * 90, d0 = wrap180(a0 - target), d1 = wrap180(a1 - target);
        if (d0 < 0 && d1 >= 0 && d1 - d0 < 90) out.push({ type: MOON_PHASES[k], time: refineCrossing(x => wrap180(age(x) - target), t - step, t) });
      }
      a0 = a1;
    }
    return out.sort((a, b) => a.time - b.time);
  }

  root.PlanetEphemeris = {
    GALILEAN, moonPosition, moonPhaseName, jupiterMoons,
    PLANETS, BODIES, INNER, MIN_YEAR, MAX_YEAR, MIN_TIME, MAX_TIME, DARK, MIN_ALT, NAKED_EYE,
    centuries, clampTime, elements, helio, orbit, geo, horizon, altitude, riseSet, nightAround, visibility, events,
  };
})(typeof self !== 'undefined' ? self : globalThis);
