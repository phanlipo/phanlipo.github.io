// MovePlay – game mechanics (no DOM). Contract: see engine.js. A new mechanic = one more entry here
// (with schema, start, update, event) plus its texts and drawing on the page; games then use it via JSON.
//
// Objects for drawing (g.objects): { kind, … } – kinds the page knows:
//   'high' | 'low'    obstacle of "dodge": dist = time until it reaches the player (1 = just appeared, 0 = at the player,
//                     < 0 = passed), state 'come' | 'ok' | 'bad'
//   prompt.pose       "pose": the pose to copy ({ id, name, left, right, legs }); g.m.held 0…1 = held long enough
//   'bubble' | 'bomb' target of "targets": x, y, r in picture coordinates (r in picture heights), age 0…1, pop: 'ok' | 'bad' | undefined
(function (root) {
  'use strict';
  const E = root.MoveEngine, M = E.mechanics;
  const EVENTS = root.Motion.EVENTS;
  const lerp = (range, k) => Math.round(range[0] + (range[1] - range[0]) * k);
  const pair = (min, max) => ({ type: 'array', maxItems: 2, items: { type: 'integer', minimum: min, maximum: max } });
  const two = (a, name) => { if (a.length !== 2) throw new Error(`game.params.${name} must have 2 items (start, end)`); };
  const text = { type: 'object', additionalProperties: false, required: ['de', 'en'],
    properties: { de: { type: 'string', minLength: 1, maxLength: 40 }, en: { type: 'string', minLength: 1, maxLength: 40 } } };

  // "Simon says": a movement is called out and must follow in time. Tricks (without "Simon says") must NOT be done.
  M.command = {
    schema: { type: 'object', additionalProperties: false, required: ['commands', 'window', 'pause', 'trick', 'prefix'], properties: {
      commands: { type: 'array', maxItems: 8, items: { type: 'string', enum: EVENTS } },
      window: pair(800, 10000),        // time to react in ms: at the start, at the end
      pause: { type: 'integer', minimum: 300, maximum: 5000 },
      trick: { type: 'number', minimum: 0, maximum: 0.5 },   // share of tricks
      prefix: text } },
    check(p) { if (!p.commands.length) throw new Error('game.params.commands must not be empty'); two(p.window, 'window'); },
    start(g, p) { g.m = { state: 'gap', until: g.clock + p.pause, cmd: null, n: 0, answered: false }; },
    update(g, p) {
      const m = g.m;
      if (m.state === 'gap' && g.clock >= m.until) {
        const choice = p.commands.length > 1 ? p.commands.filter(c => c !== m.cmd) : p.commands;
        m.cmd = choice[Math.floor(g.rng() * choice.length)];
        m.trick = m.n > 0 && g.rng() < p.trick;
        m.n++;
        m.state = 'ask'; m.answered = false; m.from = g.clock; m.deadline = g.clock + lerp(p.window, g.progress);
        g.say({ cmd: m.cmd, trick: m.trick, prefix: p.prefix, from: m.from, until: m.deadline });
      } else if (m.state === 'ask' && g.clock >= m.deadline) {
        if (!m.answered) { if (m.trick) g.hit({ trick: true }); else g.miss({ late: true }); }
        gap(g, p);
      }
    },
    event(g, p, ev) {
      const m = g.m;
      if (m.state !== 'ask' || m.answered || ev.type !== m.cmd) return;
      if (m.trick) g.miss({ trick: true }); else g.hit();
      // Several players: the next command comes for everybody at the same time
      if (g.sync) m.answered = true; else gap(g, p);
    },
  };
  function gap(g, p) { if (g.phase !== 'play') return; g.m.state = 'gap'; g.m.until = g.clock + p.pause; g.say(null); }

  // Count one movement as often as possible (jumping jacks, squats …)
  M.count = {
    schema: { type: 'object', additionalProperties: false, required: ['event'], properties: {
      event: { type: 'string', enum: EVENTS } } },
    start(g, p) { g.say({ cmd: p.event, count: true }); },
    update() {},
    event(g, p, ev) { if (ev.type === p.event) { g.count++; g.hit(); } },
  };

  // Obstacles come from the side: high ones → duck, low ones → jump (while they pass the player)
  M.dodge = {
    schema: { type: 'object', additionalProperties: false, required: ['kinds', 'interval', 'travel', 'window'], properties: {
      kinds: { type: 'array', maxItems: 2, items: { type: 'string', enum: ['high', 'low'] } },
      interval: pair(800, 10000),      // time between obstacles: at the start, at the end
      travel: { type: 'integer', minimum: 800, maximum: 6000 },   // from appearing to reaching the player
      window: { type: 'integer', minimum: 150, maximum: 1500 } } },   // ± ms around reaching the player
    check(p) {
      if (!p.kinds.length) throw new Error('game.params.kinds must not be empty');
      two(p.interval, 'interval');
      if (Math.min(...p.interval) < 2 * p.window + 200) throw new Error('game.params.interval must be at least 2 × window + 200');
    },
    start(g) { g.m = { next: g.clock + 1000, list: [], id: 0, say: null }; },
    update(g, p, motion) {
      const m = g.m;
      if (g.clock >= m.next && g.clock + p.travel + p.window < g.duration) {
        m.list.push({ id: ++m.id, kind: p.kinds[Math.floor(g.rng() * p.kinds.length)], at: g.clock + p.travel, ok: false, done: false });
        m.next = g.clock + lerp(p.interval, g.progress);
      }
      for (const o of m.list) {
        if (o.done) continue;
        if (Math.abs(g.clock - o.at) <= p.window && (o.kind === 'high' ? motion.ducking : motion.airborne)) o.ok = true;
        if (g.clock > o.at + p.window) {
          o.done = true;
          if (o.ok) g.hit({ kind: o.kind }); else g.miss({ kind: o.kind });
          if (g.phase !== 'play') return;
        }
      }
      m.list = m.list.filter(o => g.clock < o.at + 1000);
      g.objects = m.list.map(o => ({ kind: o.kind, dist: (o.at - g.clock) / p.travel, state: o.done ? (o.ok ? 'ok' : 'bad') : 'come' }));
      const next = m.list.find(o => !o.done && o.at - g.clock < p.travel * 0.75);
      const say = next ? next.kind : null;
      if (say !== m.say) { m.say = say; g.say(say && { cmd: say === 'high' ? 'duck' : 'jump' }); }
    },
    event(g, p, ev) {
      // Short jumps between two frames still count
      for (const o of g.m.list) if (!o.done && Math.abs(g.clock - o.at) <= p.window
        && (o.kind === 'high' ? ev.type === 'duck' : ev.type === 'jump')) o.ok = true;
    },
  };

  // Targets appear around the player: touch them with a hand. Bombs must not be touched.
  M.targets = {
    schema: { type: 'object', additionalProperties: false, required: ['interval', 'life', 'size', 'bombs', 'maxAlive', 'reach'], properties: {
      interval: pair(300, 5000),
      life: { type: 'integer', minimum: 800, maximum: 8000 },
      size: { type: 'number', minimum: 0.1, maximum: 1 },        // radius in torso lengths
      bombs: { type: 'number', minimum: 0, maximum: 0.6 },
      maxAlive: { type: 'integer', minimum: 1, maximum: 8 },
      reach: { type: 'number', minimum: 0.5, maximum: 3 } } },  // how far from the shoulders, in torso lengths
    check(p) { two(p.interval, 'interval'); },
    start(g) { g.m = { next: g.clock + 500, list: [], id: 0 }; },
    update(g, p, motion) {
      const m = g.m, b = motion.body, aspect = motion.aspect || 1;
      const alive = m.list.filter(o => !o.pop);
      if (b && g.clock >= m.next && alive.length < p.maxAlive) {
        const clamp = v => Math.min(0.94, Math.max(0.06, v));
        m.list.push({ id: ++m.id, x: clamp(b.x + (g.rng() * 2 - 1) * p.reach * b.ux), y: clamp(b.shoulderY + (g.rng() * 1.7 - 1.1) * b.u),
          r: p.size * b.u, bomb: m.id > 1 && g.rng() < p.bombs, born: g.clock });
        m.next = g.clock + lerp(p.interval, g.progress);
      }
      for (const o of m.list) {
        if (o.pop) continue;
        const touched = (motion.hands || []).some(h => Math.hypot((h.x - o.x) * aspect, h.y - o.y) < o.r + 0.02);
        if (touched) {
          o.pop = o.bomb ? 'bad' : 'ok'; o.popAt = g.clock;
          if (o.bomb) g.miss({ bomb: true }); else g.hit();
          if (g.phase !== 'play') return;
        } else if (g.clock - o.born > p.life) {
          o.pop = 'gone'; o.popAt = g.clock;
          if (!o.bomb) g.streak = 0;
        }
      }
      m.list = m.list.filter(o => !o.pop || g.clock - o.popAt < 350);
      g.objects = m.list.filter(o => o.pop !== 'gone').map(o => ({ kind: o.bomb ? 'bomb' : 'bubble', x: o.x, y: o.y, r: o.r,
        age: Math.min(1, (g.clock - o.born) / p.life), pop: o.pop }));
    },
    event() {},
  };

  // Freeze dance: dance while the music plays, freeze when it stops. Durations are random (same seed = same music for all).
  M.freeze = {
    schema: { type: 'object', additionalProperties: false, required: ['dance', 'freeze', 'grace', 'still', 'moving', 'active'], properties: {
      dance: pair(1000, 20000),        // dancing lasts between … and … ms (random)
      freeze: pair(1000, 10000),       // freezing lasts between … and … ms (random)
      grace: { type: 'integer', minimum: 0, maximum: 2000 },     // time to stop after the music stops
      still: { type: 'number', minimum: 0.2, maximum: 5 },       // more movement than this while frozen = caught (Motion energy)
      moving: { type: 'number', minimum: 0.2, maximum: 10 },     // this much movement counts as dancing …
      active: { type: 'number', minimum: 0, maximum: 1 } } },    // … for at least this share of the dance, else "dance!" (a miss)
    check(p) { two(p.dance, 'dance'); two(p.freeze, 'freeze'); if (p.moving <= p.still) throw new Error('game.params.moving must be more than still'); },
    start(g, p) { g.m = {}; phase(g, p, 'dance'); },
    update(g, p, motion) {
      const m = g.m, e = motion.energy || 0;
      const still = p.still * (motion.easy ? 1.5 : 1);
      if (m.phase === 'dance') {
        m.total += g.dt; if (e > p.moving) m.active += g.dt;
        if (g.clock >= m.until) {
          if (m.total && m.active / m.total < p.active) g.miss({ lazy: true });
          if (g.phase === 'play') phase(g, p, 'freeze');
        }
      } else {
        if (!m.caught && g.clock - m.from > p.grace && e > still) { m.caught = true; g.miss({ moved: true }); }
        if (g.phase === 'play' && g.clock >= m.until) { if (!m.caught) g.hit(); phase(g, p, 'dance'); }
      }
    },
    event() {},
  };
  function phase(g, p, name) {
    const range = name === 'dance' ? p.dance : p.freeze;
    g.m = { phase: name, from: g.clock, until: g.clock + Math.round(range[0] + g.rng() * (range[1] - range[0])), total: 0, active: 0, caught: false };
    g.say({ cmd: name === 'dance' ? 'dance' : 'freeze' });
  }

  // Copy the pose: shown one after another, hold it for a moment. Poses as arm angles (0° down, 90° sideways, 180° up)
  // and legs (any, together, apart, oneUp), compared with Motion.matchPose.
  M.pose = {
    schema: { type: 'object', additionalProperties: false, required: ['poses', 'time', 'hold', 'pause', 'tolerance'], properties: {
      poses: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false, required: ['id', 'name', 'left', 'right'], properties: {
        id: { type: 'string', minLength: 1, maxLength: 30 }, name: text, emoji: { type: 'string', maxLength: 8 },
        left: { type: 'integer', minimum: 0, maximum: 180 }, right: { type: 'integer', minimum: 0, maximum: 180 },
        legs: { type: 'string', enum: ['any', 'together', 'apart', 'oneUp'] } } } },
      time: pair(1500, 20000),         // time per pose: at the start, at the end
      hold: { type: 'integer', minimum: 200, maximum: 5000 },
      pause: { type: 'integer', minimum: 300, maximum: 5000 },
      tolerance: { type: 'integer', minimum: 10, maximum: 60 } } },
    check(p) { if (p.poses.length < 2) throw new Error('game.params.poses must have at least 2 items'); two(p.time, 'time'); },
    start(g, p) { g.m = { state: 'gap', until: g.clock + p.pause, last: null, held: 0, done: false }; },
    update(g, p, motion) {
      const m = g.m;
      if (m.state === 'gap' && g.clock >= m.until) {
        const choice = p.poses.filter(x => x.id !== m.last);
        const pose = choice[Math.floor(g.rng() * choice.length)];
        Object.assign(m, { state: 'show', pose, last: pose.id, held: 0, done: false, from: g.clock, until: g.clock + lerp(p.time, g.progress) });
        g.say({ pose, from: m.from, until: m.until });
      } else if (m.state === 'show') {
        if (!m.done) {
          const r = root.Motion.matchPose(m.pose, motion.pose, p.tolerance);
          m.score = r.score;
          m.heldMs = r.ok ? (m.heldMs || 0) + g.dt : Math.max(0, (m.heldMs || 0) - g.dt * 2);
          m.held = Math.min(1, m.heldMs / p.hold);
          if (m.held >= 1) { m.done = true; g.hit({ pose: m.pose.id }); if (!g.sync) return next(g, p); }
        }
        if (g.clock >= m.until) { if (!m.done) g.miss({ pose: m.pose.id }); next(g, p); }
      }
    },
    event() {},
  };
  function next(g, p) { if (g.phase !== 'play') return; Object.assign(g.m, { state: 'gap', until: g.clock + p.pause, held: 0, heldMs: 0 }); g.say(null); }
})(typeof self !== 'undefined' ? self : globalThis);
