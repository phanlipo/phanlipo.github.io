/* Physik verstehen – an ideal gas in a box without DOM: window.Thermo (see README.md).
   2D model in simulation units: particles of mass 1 move freely and bounce off the walls (no collisions with
   each other – ideal gas). Temperature: k·T = m·<v²>/2 (two degrees of freedom), so <v²> = 2·T_sim.
   Pressure = momentum the particles hand to the walls per time and per length of wall; 2D gas law p·A = N·T_sim. */
(function (root) {
  'use strict';

  const T_REF = 300;   // K that correspond to T_sim = 1
  // speeds from the 2D Maxwell distribution (Rayleigh), σ² = T_sim
  function box(n, Tk, w, h, rand) {
    const ts = Tk / T_REF, s = Math.sqrt(ts), ps = [];
    for (let i = 0; i < n; i++) {
      const sp = s * Math.sqrt(-2 * Math.log(1 - rand())), a = 2 * Math.PI * rand();
      ps.push({ x: rand() * w, y: rand() * h, vx: sp * Math.cos(a), vy: sp * Math.sin(a) });
    }
    // scale so that this sample has exactly the temperature asked for (<v²> = 2·T_sim)
    const v2 = ps.reduce((q, p) => q + p.vx * p.vx + p.vy * p.vy, 0) / n, f = Math.sqrt(2 * ts / v2);
    for (const p of ps) { p.vx *= f; p.vy *= f; }
    return { ps, w, h, T: Tk, impulse: [], time: 0 };
  }
  // move on by dt; record the momentum given to the walls (for the pressure)
  function step(b, dt) {
    let imp = 0;
    for (const p of b.ps) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.x < 0) { p.x = -p.x; p.vx = -p.vx; imp += 2 * Math.abs(p.vx); }
      else if (p.x > b.w) { p.x = 2 * b.w - p.x; p.vx = -p.vx; imp += 2 * Math.abs(p.vx); }
      if (p.y < 0) { p.y = -p.y; p.vy = -p.vy; imp += 2 * Math.abs(p.vy); }
      else if (p.y > b.h) { p.y = 2 * b.h - p.y; p.vy = -p.vy; imp += 2 * Math.abs(p.vy); }
    }
    b.time += dt;
    b.impulse.push([b.time, imp]);
    while (b.impulse.length && b.impulse[0][0] < b.time - WINDOW) b.impulse.shift();
  }
  const WINDOW = 8; // simulation time the measured pressure is averaged over
  function measured(b) {
    if (!b.impulse.length) return 0;
    const span = Math.min(WINDOW, b.time);
    const sum = b.impulse.reduce((s, q) => s + q[1], 0);
    return span > 0 ? sum / span / (2 * (b.w + b.h)) : 0;
  }
  const theory = (n, Tk, w, h) => n * (Tk / T_REF) / (w * h);
  // heat or cool: all speeds scale with √(T_new/T_old)
  function setT(b, Tk) { const f = Math.sqrt(Tk / b.T); for (const p of b.ps) { p.vx *= f; p.vy *= f; } b.T = Tk; b.impulse = []; b.time = 0; }
  // move the right wall (piston); particles behind it are put back inside
  function setW(b, w) { b.w = w; for (const p of b.ps) if (p.x > w) p.x = w - (p.x - w) % w; b.impulse = []; b.time = 0; }
  const meanSpeed = b => b.ps.reduce((s, p) => s + Math.hypot(p.vx, p.vy), 0) / b.ps.length;

  root.Thermo = { T_REF, WINDOW, box, step, measured, theory, setT, setW, meanSpeed };
})(typeof window !== 'undefined' ? window : globalThis);
