/* Physik verstehen – why you fall more slowly on the Moon, without DOM: window.Fall (see README.md).
   Surface gravity from Newton's law of gravitation, g = G·M/R² (equatorial radius, without rotation). For the Earth the
   usual value 9.81 m/s² is used (mid latitudes, with rotation); the plain formula gives 9.80 at the equator.
   Free fall from rest without air: h(t) = h − ½·g·t², time t = √(2h/g), speed on landing v = g·t = √(2·g·h). */
(function (root) {
  'use strict';

  const G = 6.674e-11;
  // mass in kg, equatorial radius in m (NASA planetary fact sheets, rounded)
  const BODIES = {
    earth: { M: 5.972e24, R: 6.3781e6, g: 9.81 },
    moon: { M: 7.346e22, R: 1.7381e6 },
    mars: { M: 6.417e23, R: 3.3962e6 },
    jupiter: { M: 1.898e27, R: 7.1492e7 },
  };

  const newton = key => G * BODIES[key].M / BODIES[key].R ** 2;
  const gravity = key => BODIES[key].g ?? newton(key);
  const time = (h, g) => Math.sqrt(2 * h / g);
  const speed = (h, g) => Math.sqrt(2 * g * h);
  // height above the ground after t seconds (0 once landed)
  const height = (h, g, t) => Math.max(0, h - g * t * t / 2);

  // body compared with the Earth: mass and radius ratio, and what each does to g
  function compare(key) {
    const E = BODIES.earth, B = BODIES[key], mass = B.M / E.M, radius = B.R / E.R;
    return { mass, radius, closer: 1 / (radius * radius), g: mass / (radius * radius) };
  }

  root.Fall = { G, BODIES, newton, gravity, time, speed, height, compare };
})(typeof window !== 'undefined' ? window : globalThis);
