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

  /** Everything about a planet (or the Sun) seen from the Earth's centre at a time:
      lon/lat (geocentric ecliptic J2000), ra/dec (of date), r (from Sun), delta (from Earth),
      elongation (angle to the Sun), side ('east' = evening sky, 'west' = morning sky), phase angle,
      illuminated fraction, magnitude */
  function geo(body, time) {
    const T = centuries(time);
    const earth = helio('earth', time);
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
    const h0 = H0[body] ?? -0.567;
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

  root.PlanetEphemeris = {
    PLANETS, BODIES, INNER, MIN_YEAR, MAX_YEAR, MIN_TIME, MAX_TIME, DARK, MIN_ALT, NAKED_EYE,
    centuries, clampTime, elements, helio, orbit, geo, horizon, altitude, riseSet, nightAround, visibility, events,
  };
})(typeof self !== 'undefined' ? self : globalThis);
