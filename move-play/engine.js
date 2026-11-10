// MovePlay – game engine (no DOM). Runs a game described as JSON (games/*.json, format in README.md).
//
//   MoveEngine.validate(def, check)   throws if the description is not valid (check = Tools.mcp.checkSchema)
//   const g = MoveEngine.create(def, { rng, sync })    sync: several players – each has its own game with the same seed;
//                                                     mechanics then keep a fixed rhythm (the next command, pose … comes
//                                                     at the same time for everybody, not as soon as one player is done)
//   g.update(t, motion)               every frame: t in ms, motion = Motion state (see motion.js)
//   g.event(ev, motion)               a movement from Motion.update ({ type, t })
//   g.pause() / g.resume() / g.stop()
//   g.take()                          what happened since the last call (sounds, voice): [{ type: 'tick'|'go'|'good'|'bad'|'prompt'|'end', … }]
//   g.phase, g.score, g.lives, g.count, g.timeLeft, g.countdown, g.prompt, g.objects, g.result
//
// Rules of a game come from its mechanic (MoveEngine.mechanics[name], mechanics.js) – a fixed contract:
//   { schema,                          JSON schema of def.params
//     start(g, p),                     set up its state in g.m
//     update(g, p, motion),            g.clock = play time in ms (stops while paused)
//     event(g, p, ev, motion) }        a movement
// They change the game only through g.hit(), g.miss(), g.say(prompt) and g.objects, so the engine
// keeps score, lives, streak, time and the end of the game.
(function (root) {
  'use strict';

  const mechanics = {};
  const COUNTDOWN = 3000;
  const text = { type: 'object', additionalProperties: false, required: ['de', 'en'],
    properties: { de: { type: 'string', minLength: 1, maxLength: 120 }, en: { type: 'string', minLength: 1, maxLength: 120 } } };
  const longText = { ...text, properties: { de: { type: 'string', minLength: 1, maxLength: 300 }, en: { type: 'string', minLength: 1, maxLength: 300 } } };
  // The description of a game (params are checked against the mechanic's own schema)
  const SCHEMA = {
    type: 'object', additionalProperties: false,
    required: ['format', 'version', 'id', 'title', 'description', 'emoji', 'mechanic', 'needs', 'space', 'duration', 'lives', 'scoring', 'params'],
    properties: {
      format: { type: 'string', enum: ['moveplay-game'] },
      version: { type: 'integer', minimum: 1, maximum: 1 },
      id: { type: 'string', minLength: 1, maxLength: 40 },
      title: text, description: longText,
      emoji: { type: 'string', minLength: 1, maxLength: 8 },
      players: { type: 'integer', minimum: 1, maximum: 2 },   // most players at once (default 2)
      mechanic: { type: 'string' },
      needs: { type: 'string', enum: ['full', 'upper'] },
      space: { type: 'string', enum: ['small', 'medium', 'large'] },
      duration: { type: 'integer', minimum: 10, maximum: 300 },
      lives: { type: 'integer', minimum: 0, maximum: 10 },
      scoring: { type: 'object', additionalProperties: false, required: ['hit'], properties: {
        hit: { type: 'integer', minimum: 1, maximum: 100 },
        streakBonus: { type: 'integer', minimum: 0, maximum: 50 },
        penalty: { type: 'integer', minimum: 0, maximum: 100 } } },
      params: { type: 'object' },
    },
  };

  function validate(def, check) {
    check(def, SCHEMA, 'game');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(def.id)) throw new Error('game.id must be lowercase letters, digits and -');
    const mech = mechanics[def.mechanic];
    if (!mech) throw new Error('game.mechanic must be one of: ' + Object.keys(mechanics).join(', '));
    check(def.params, mech.schema, 'game.params');
    if (mech.check) mech.check(def.params);
    return def;
  }

  // Small seeded random generator (tests and replays get the same game)
  function seeded(seed) {
    let s = seed >>> 0 || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  function create(def, opts) {
    const mech = mechanics[def.mechanic];
    if (!mech) throw new Error('unknown mechanic ' + def.mechanic);
    const rng = (opts && opts.rng) || Math.random;
    const sc = def.scoring;
    let last = null, paused = false, queue = [];
    const g = {
      def, rng, sync: !!(opts && opts.sync), phase: 'countdown', clock: 0, dt: 0, since: 0,
      score: 0, count: 0, hits: 0, misses: 0, streak: 0, bestStreak: 0,
      lives: def.lives, countdown: 3, timeLeft: def.duration, prompt: null, objects: [], m: {}, result: null,
      get duration() { return def.duration * 1000; },
      // 0 at the start, 1 at the end – for games that get faster
      get progress() { return Math.min(1, g.clock / g.duration); },
      hit(extra) {
        g.hits++; g.streak++; g.bestStreak = Math.max(g.bestStreak, g.streak);
        const pts = sc.hit + (sc.streakBonus || 0) * (g.streak - 1);
        g.score += pts; queue.push({ type: 'good', points: pts, ...extra });
      },
      miss(extra) {
        g.misses++; g.streak = 0;
        if (sc.penalty) g.score = Math.max(0, g.score - sc.penalty);
        if (def.lives) g.lives = Math.max(0, g.lives - 1);
        queue.push({ type: 'bad', ...extra });
        if (def.lives && !g.lives) end('lives');
      },
      say(prompt) { g.prompt = prompt; if (prompt) queue.push({ type: 'prompt', prompt }); },
      update(t, motion) {
        const dt = last == null ? 0 : Math.max(0, Math.min(100, t - last));
        last = t;
        if (paused || g.phase === 'done') return;
        if (g.phase === 'countdown') {
          g.since += dt;
          const n = Math.max(0, Math.ceil((COUNTDOWN - g.since) / 1000));
          if (n !== g.countdown) { g.countdown = n; queue.push(n ? { type: 'tick', n } : { type: 'go' }); }
          if (g.since >= COUNTDOWN) { g.phase = 'play'; mech.start(g, def.params); }
          return;
        }
        g.clock += dt; g.dt = dt;
        g.timeLeft = Math.max(0, Math.ceil((g.duration - g.clock) / 1000));
        mech.update(g, def.params, motion || {});
        if (g.phase === 'play' && g.clock >= g.duration) end('time');
      },
      event(ev, motion) {
        if (paused || g.phase !== 'play') return;
        mech.event(g, def.params, ev, motion || {});
      },
      pause() { paused = true; },
      resume() { paused = false; },
      get paused() { return paused; },
      stop() { if (g.phase !== 'done') end('stopped'); },
      take() { const q = queue; queue = []; return q; },
    };
    function end(why) {
      g.phase = 'done'; g.prompt = null; g.objects = [];
      g.result = { why, score: g.score, count: g.count, hits: g.hits, misses: g.misses, bestStreak: g.bestStreak, seconds: Math.round(g.clock / 1000) };
      queue.push({ type: 'end', why });
    }
    return g;
  }

  root.MoveEngine = { mechanics, validate, create, seeded, SCHEMA, COUNTDOWN };
})(typeof self !== 'undefined' ? self : globalThis);
