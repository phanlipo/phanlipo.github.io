/* Seasons without DOM: where the sun stands over the year, how long the day is and how much sunlight a square metre
   gets – with the real tilt of the Earth's axis (23.44°) or without it. Simple formulas (accurate to about 1°):
   declination δ = −ε·cos(2π·(N + 10)/365), Earth–Sun distance r = 1 − e·cos(2π·(N − 4)/365) AU (closest about 4 January).
   N = day of the year (1 = 1 January, no leap year). Angles in degrees. Used by index.html (window.Seasons) and the tests. */
(function (root) {
  'use strict';
  const TILT = 23.44, S0 = 1361, ECC = 0.0167, AU = 149.598e6; // °, W/m² (solar constant), –, km
  const RAD = Math.PI / 180;

  const declination = (N, tilt = TILT) => -tilt * Math.cos(2 * Math.PI * (N + 10) / 365);
  const distance = N => 1 - ECC * Math.cos(2 * Math.PI * (N - 4) / 365); // AU
  // height of the sun at noon (negative: it stays below the horizon)
  const noonAltitude = (lat, dec) => 90 - Math.abs(lat - dec);
  // hour angle of sunrise/sunset in degrees: 0 = polar night, 180 = polar day (sun as a point, no refraction)
  function sunsetHourAngle(lat, dec) {
    const x = -Math.tan(lat * RAD) * Math.tan(dec * RAD);
    if (x <= -1) return 180;
    if (x >= 1) return 0;
    return Math.acos(x) / RAD;
  }
  const dayLength = (lat, dec) => 2 * sunsetHourAngle(lat, dec) / 15; // hours
  // sunlight per m² of level ground at the top of the atmosphere, averaged over the whole day (W/m²)
  function insolation(lat, N, tilt = TILT) {
    const dec = declination(N, tilt), H = sunsetHourAngle(lat, dec) * RAD, r = distance(N), p = lat * RAD, d = dec * RAD;
    return Math.max(0, S0 / Math.PI / (r * r) * (H * Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.sin(H)));
  }
  const dayEnergy = (lat, N, tilt = TILT) => insolation(lat, N, tilt) * 24 / 1000; // kWh/m² per day
  // a beam of 1 m² cross-section spreads over 1/sin h m² of level ground
  const spread = h => h > 0 ? 1 / Math.sin(h * RAD) : Infinity;

  function state(lat, N, tilt = TILT) {
    const dec = declination(N, tilt), h = noonAltitude(lat, dec), r = distance(N);
    return { lat, N, tilt, dec, noon: h, day: dayLength(lat, dec), power: insolation(lat, N, tilt), energy: dayEnergy(lat, N, tilt),
      noonPower: h > 0 ? S0 / (r * r) * Math.sin(h * RAD) : 0, spread: spread(h), r, km: r * AU };
  }
  // the year for one latitude: [day, kWh/m²] every few days
  function year(lat, tilt = TILT, step = 2) {
    const out = [];
    for (let N = 1; N <= 365; N += step) out.push([N, dayEnergy(lat, N, tilt)]);
    out.push([365, dayEnergy(lat, 365, tilt)]);
    return out;
  }

  root.Seasons = { TILT, S0, ECC, AU, declination, distance, noonAltitude, sunsetHourAngle, dayLength, insolation, dayEnergy, spread, state, year };
})(typeof window !== 'undefined' ? window : globalThis);
