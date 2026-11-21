/* Flipper – the tables as data, window.PinballTables. The engine (engine.js) knows no table; it plays whatever is
   described here. Units as in engine.js: 100 × 180, y down; playfield x 0…91, shooter lane x 91…100.

   A table: { id, name: {de, en}, walls, flippers, bumpers, banks, rollovers, spinners, saucers, ramps, kickbacks,
   lamps, multiball }. Every list may be empty. Elements:
   - walls: capsules { x0, y0, x1, y1, r, kind: 'wall' | 'sling' | 'gate', id, layer: 0 playfield | 1 ramp | 2 both }
   - flippers: { side: 0 left | 1 right, x, y (pivot), len, rest, up (radians, as for a left flipper) }
   - bumpers: { id, x, y, r, score }
   - banks (drop targets): { id, targets: [{ x0, y0, x1, y1 }], score, allScore, effect: 'save' | 'kickback' }
   - rollovers: { id, lanes: [{ x, y0, y1, w }], score, allScore, laneChange, effect: 'mult' }
   - spinners: { id, x0, y0, x1, y1, score } – score per turn; turns depend on the ball's speed
   - saucers: { id, x, y, score, out: { vx, vy } } – holds the ball briefly, then kicks it out with out
   - ramps: { id, path, width, rails (walls on layer 1, generated), enter, exit, score, lockEvery } – a second
     level: crossing enter (upwards) lifts the ball onto it, crossing exit drops it back; a weak ball rolls back out
   - kickbacks: { id, x0, y0, x1, y1, speed } – a lit kickback shoots a ball in the outlane back up
   - lamps: { kind: 'mult' (n) | 'save' | 'kickback' | 'lock' | 'jackpot' | 'mission' (n), x, y, r } – drawn by the page
   - multiball: { balls, jackpot, save } – a lit lock in a saucer (or the effect 'multiball') starts it
   - missions: [{ kind: 'ramp' | 'spinner' (turns) | 'bumper' | 'bankAll' | 'saucer' | 'lane', count, score }] – a
     chain, one after the other; missionsDone: { score, effect } after the last one (then it starts again)
   Effects (banks, rollovers, missionsDone): one name or a list – 'mult', 'save', 'kickback', 'multiball'.
   Sensor lines (enter, exit, kickbacks) count a crossing "forward" when the ball moves from the side where
   (x1−x0)(y−y0) − (y1−y0)(x−x0) > 0 to the other side. */
(function (root) {
  'use strict';
  const W = 100, H = 180, SEP_X = 91, CX = 45.5, BALL_R = 2.6;
  const LANE_REST = 172.4;
  const mirror = x => 2 * CX - x;

  function builder() {
    const walls = [];
    const wall = (x0, y0, x1, y1, r = 0, kind = 'wall', id, layer = 0) => { walls.push({ x0, y0, x1, y1, r, kind, id, layer }); };
    return { walls, wall };
  }
  // Cabinet: side walls, the round top (arc around (50, 50), radius 50), shooter lane with its one-way gate and the plunger tip
  function cabinet({ wall }) {
    wall(0, 50, 0, H + 10); wall(W, 50, W, H + 10);
    const N = 24;
    for (let k = 0; k < N; k++) {
      const a0 = Math.PI + Math.PI * k / N, a1 = Math.PI + Math.PI * (k + 1) / N;
      wall(50 + 50 * Math.cos(a0), 50 + 50 * Math.sin(a0), 50 + 50 * Math.cos(a1), 50 + 50 * Math.sin(a1));
    }
    wall(SEP_X, 62, SEP_X, H + 10, 0.6);
    wall(SEP_X, 62, W, 55, 0.4, 'gate');   // sloping left: a ball on it rolls into the playfield
    wall(SEP_X, LANE_REST + BALL_R + 0.5, W, LANE_REST + BALL_R + 0.5);
  }
  // Lower playfield: inlane guides with outlanes beside them, slingshots above the inlanes (the long side facing the
  // middle kicks), a short wall narrowing each outlane; mirrored on the right
  function lower({ wall }) {
    for (const m of [x => x, mirror]) {
      wall(m(7.5), 124, m(7.5), 145, 0.8);
      wall(m(7.5), 145, m(27), 156.6, 0.8);
      wall(m(15.5), 120, m(15.5), 137, 0.8);
      wall(m(15.5), 137, m(25), 144, 0.8);
      wall(m(15.5), 120, m(25), 144, 0.8, 'sling', m === mirror ? 'slingR' : 'slingL');
      wall(m(0), 146, m(3), 150, 0.6);
    }
  }
  const flippers = () => [{ side: 0, x: 28, y: 158, len: 13, rest: 0.5, up: -0.42 }, { side: 1, x: mirror(28), y: 158, len: 13, rest: 0.5, up: -0.42 }];
  // Three rollover lanes at the top between four posts
  function topLanes({ wall }, posts) {
    for (const x of posts) wall(x, 15, x, 25, 1);
    return posts.slice(1).map((x, i) => ({ x: (posts[i] + x) / 2, y0: 16, y1: 24, w: x - posts[i] - 2 }));
  }
  const multLamps = y => [2, 3, 4, 5].map(n => ({ kind: 'mult', n, x: CX + (n - 3.5) * 9, y, r: 3.2 }));
  // Ramp rails: the path offset to both sides (mitred at the corners) as walls on layer 1; the first `solid`
  // segments also block the playfield below them (layer 2), so a ball can only get in through the mouth
  function rails({ wall }, path, width, solid) {
    const h = width / 2, off = [[], []];
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[i], c = path[Math.min(path.length - 1, i + 1)];
      const n1 = i > 0 ? norm(b.x - a.x, b.y - a.y) : null, n2 = i < path.length - 1 ? norm(c.x - b.x, c.y - b.y) : null;
      let nx = (n1 ? n1.x : 0) + (n2 ? n2.x : 0), ny = (n1 ? n1.y : 0) + (n2 ? n2.y : 0);
      const l = Math.hypot(nx, ny); nx /= l; ny /= l;
      const k = h / (nx * (n1 || n2).x + ny * (n1 || n2).y);
      off[0].push({ x: b.x + nx * k, y: b.y + ny * k }); off[1].push({ x: b.x - nx * k, y: b.y - ny * k });
    }
    for (const side of off) for (let i = 0; i + 1 < side.length; i++) wall(side[i].x, side[i].y, side[i + 1].x, side[i + 1].y, 0.6, 'rail', undefined, i < solid ? 2 : 1);
    return off;
  }
  function norm(dx, dy) { const l = Math.hypot(dx, dy); return { x: -dy / l, y: dx / l }; }   // left normal of a direction
  function arc(cx, cy, r, a0, a1, n) {
    const pts = [];
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n; pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }); }
    return pts;
  }

  // A U-shaped ramp: up from a mouth at y = 98 (x 26.5…35.5), a U-turn at the top, down the side; it drops the ball
  // inside the inlane (below the tops of the inlane guide and the slingshot). m mirrors it to the right side; the
  // sensor lines then run the other way round, so "forward" stays up the mouth and down the exit.
  function uRamp(b, id, m, extra) {
    const flip = m(0) !== 0, line = (x0, y0, x1, y1) => flip ? { x0: m(x1), y0: y1, x1: m(x0), y1: y0 } : { x0, y0, x1, y1 };
    const path = [{ x: 31, y: 99 }, { x: 31, y: 42 }, ...arc(21.25, 42, 9.75, 0, -Math.PI, 10).slice(1), { x: 11.5, y: 128 }].map(p => ({ x: m(p.x), y: p.y }));
    const ramp = { id, path, width: 9, enter: line(26.5, 98, 35.5, 98), exit: line(16, 126, 7, 126), ...extra };
    ramp.rails = rails(b, path, 9, 1);
    return ramp;
  }

  /* ---------- Komet: the first table – three bumpers, top lanes, drop targets on the right ---------- */
  function komet() {
    const b = builder();
    cabinet(b); lower(b);
    const lanes = topLanes(b, [21, 37, 53, 69]);
    b.wall(0, 54, 10, 64, 0.8);   // upper left: balls falling down the left side go back into the middle
    // Drop targets in front of the separator; short walls above and below sloping towards the middle
    const TX = 86.8;
    b.wall(TX, 77, SEP_X - 0.6, 74, 0.8); b.wall(SEP_X - 0.6, 100, TX, 105, 0.8);
    return {
      id: 'komet', name: { de: 'Komet', en: 'Comet' },
      walls: b.walls, flippers: flippers(),
      bumpers: [{ x: 28, y: 46 }, { x: 60, y: 44 }, { x: 44, y: 66 }].map((p, i) => ({ id: 'b' + i, r: 5.5, score: 100, ...p })),
      banks: [{ id: 'right', targets: [[80, 86], [88, 94], [96, 102]].map(([y0, y1]) => ({ x0: TX, y0, x1: TX, y1 })), score: 250, allScore: 3000, effect: 'save' }],
      rollovers: [{ id: 'top', lanes, score: 500, allScore: 2000, laneChange: true, effect: 'mult' }],
      spinners: [], saucers: [], ramps: [], kickbacks: [],
      lamps: [...multLamps(112), { kind: 'save', x: CX, y: 140, r: 2.4 }],
      multiball: null,
    };
  }

  /* ---------- Tiefsee: ramp on the left (two ramps light the lock), a saucer in the middle (with the lock lit it
     starts a two-ball multiball, ramps then score the jackpot), an orbit with a spinner on the right, drop targets
     that light the kickback in the left outlane ---------- */
  function tiefsee() {
    const b = builder();
    cabinet(b); lower(b);
    const lanes = topLanes(b, [30, 44, 58, 72]);
    // Ramp on the left, into the left inlane
    const ramp = uRamp(b, 'current', x => x, { score: 1000, lockEvery: 2 });
    // Under the ramp: balls falling down the left side are guided towards the left inlane
    b.wall(0, 62, 9, 72, 0.8);
    // Orbit on the right: inner wall, a deflector at the bottom that sends the ball back towards the middle
    b.wall(81.5, 48, 81.5, 92, 0.8);
    b.wall(SEP_X - 0.6, 96, 78, 108, 0.8);
    const BX = 79.2;
    return {
      id: 'tiefsee', name: { de: 'Tiefsee', en: 'Deep Sea' },
      walls: b.walls, flippers: flippers(),
      bumpers: [{ x: 52, y: 42 }, { x: 68, y: 40 }, { x: 61, y: 57 }].map((p, i) => ({ id: 'b' + i, r: 5.2, score: 100, ...p })),
      banks: [{ id: 'shells', targets: [[56, 62], [64, 70], [72, 78]].map(([y0, y1]) => ({ x0: BX, y0, x1: BX, y1 })), score: 250, allScore: 2500, effect: 'kickback' }],
      rollovers: [{ id: 'top', lanes, score: 500, allScore: 2000, laneChange: true, effect: 'mult' }],
      spinners: [{ id: 'orbit', x0: 82.3, y0: 82, x1: SEP_X - 0.6, y1: 82, score: 30 }],
      saucers: [{ id: 'chest', x: 47, y: 74, score: 750, out: { vx: -32, vy: 120 } }],
      ramps: [ramp],
      kickbacks: [{ id: 'left', x0: 6.7, y0: 138, x1: 0, y1: 138, speed: 250 }],
      lamps: [...multLamps(112), { kind: 'save', x: CX, y: 140, r: 2.4 }, { kind: 'kickback', x: 3.6, y: 131, r: 1.8 },
        { kind: 'lock', x: 47, y: 83, r: 2.2 }, { kind: 'jackpot', x: 21, y: 102, r: 2.2 }],
      multiball: { balls: 2, jackpot: 5000, save: 6 },
    };
  }

  /* ---------- Uhrwerk: two ramps (left into the left inlane, right into the right inlane, with a spinner at its
     mouth), between them a tower open at the bottom with the clock saucer at the top, a third flipper on its right wall
     and drop targets on its left wall;
     a chain of five missions starts a three-ball multiball; the top lanes also light the kickback ---------- */
  function uhrwerk() {
    const b = builder();
    cabinet(b); lower(b);
    const lanes = topLanes(b, [30, 44, 58, 72]);
    const left = uRamp(b, 'pendulum', x => x, { score: 1000 }), right = uRamp(b, 'spring', mirror, { score: 1000 });
    // Under the ramps: balls falling down either side are guided towards the inlanes
    b.wall(0, 62, 9, 72, 0.8); b.wall(SEP_X - 0.6, 62, 82, 72, 0.8);
    const TX = 37.7;
    return {
      id: 'uhrwerk', name: { de: 'Uhrwerk', en: 'Clockwork' },
      walls: b.walls,
      // The third flipper hangs in the tower on its right wall (right button) and shoots up to the saucer
      flippers: [...flippers(), { side: 1, x: 53.5, y: 74, len: 8, rest: 0.5, up: -0.42 }],
      bumpers: [{ x: 38.5, y: 36 }, { x: 52.5, y: 36 }].map((p, i) => ({ id: 'b' + i, r: 4, score: 100, ...p })),
      banks: [{ id: 'gears', targets: [[82, 87], [88, 93], [94, 99]].map(([y0, y1]) => ({ x0: TX, y0, x1: TX, y1 })), score: 250, allScore: 2000, effect: 'save' }],
      rollovers: [{ id: 'top', lanes, score: 500, allScore: 2000, laneChange: true, effect: ['mult', 'kickback'] }],
      spinners: [{ id: 'balance', x0: mirror(35.5), y0: 102, x1: mirror(26.5), y1: 102, score: 30 }],
      saucers: [{ id: 'clock', x: CX, y: 50, score: 1000, out: { vx: 4, vy: 40 } }],
      ramps: [left, right],
      kickbacks: [{ id: 'left', x0: 6.7, y0: 138, x1: 0, y1: 138, speed: 250 }],
      lamps: [...multLamps(112), { kind: 'save', x: CX, y: 140, r: 2.4 }, { kind: 'kickback', x: 3.6, y: 131, r: 1.8 },
        { kind: 'jackpot', x: 21, y: 102, r: 2.2 }, { kind: 'jackpot', x: mirror(21), y: 102, r: 2.2 },
        ...[0, 1, 2, 3, 4].map(n => ({ kind: 'mission', n, x: CX + (n - 2) * 4, y: 106, r: 1.4 }))],
      multiball: { balls: 3, jackpot: 5000, save: 8 },
      missions: [{ kind: 'ramp', count: 2, score: 3000 }, { kind: 'spinner', count: 12, score: 3000 }, { kind: 'bumper', count: 15, score: 3000 },
        { kind: 'bankAll', count: 1, score: 4000 }, { kind: 'saucer', count: 1, score: 5000 }],
      missionsDone: { score: 20000, effect: 'multiball' },
    };
  }

  const list = [komet(), tiefsee(), uhrwerk()];
  root.PinballTables = { list, byId: Object.fromEntries(list.map(t => [t.id, t])) };
})(typeof self !== 'undefined' ? self : globalThis);
