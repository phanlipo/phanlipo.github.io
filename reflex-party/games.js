/* Reflex-Party: the mini-games – window.ReflexGames. No DOM here: every game makes a plain JSON
   state for one step and can say on its own whether that state is a "hit now!" moment.
   Architecture and timing: reflex-party/README.md */
(function () {
  'use strict';
  const DIFFS = ['easy', 'normal', 'hard'];
  // Milliseconds one picture stays on screen
  const STEP = { easy: 1600, normal: 1200, hard: 850 };

  // Colours of the game content (names are ids; the page maps them to tokens and words)
  const INKS = ['red', 'blue', 'green', 'purple'];
  const SHAPES = ['circle', 'square', 'triangle', 'star', 'hexagon', 'diamond'];
  const LAMP = ['red', 'amber', 'blue', 'green'];

  /* Every game: make(rnd, want, diff) → state with `g` = id; ok(state) → true when a tap now scores.
     rnd(n) = whole number 0 … n-1. make() must return a state where ok(state) === want. */
  const pick = (rnd, arr) => arr[rnd(arr.length)];
  const range = (rnd, lo, hi) => lo + rnd(hi - lo + 1);   // lo … hi, both included
  const sign = rnd => (rnd(2) ? 1 : -1);
  function shuffle(rnd, arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = rnd(i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  const sortedAsc = a => a.every((v, i) => i === 0 || a[i - 1] < v);

  const GAMES = {
    /* Colour word: the word names a colour and is printed in a colour */
    color: {
      make(rnd, want) {
        const word = pick(rnd, INKS);
        const ink = want ? word : pick(rnd, INKS.filter(c => c !== word));
        return { g: 'color', word, ink };
      },
      ok: s => s.word === s.ink,
    },
    /* Sum: a + b = c (hard also a × b = c); wrong results are close to the right one */
    sum: {
      make(rnd, want, diff) {
        const op = diff === 'hard' && rnd(2) ? '*' : '+';
        const max = diff === 'easy' ? 9 : diff === 'normal' ? 20 : 12;
        const a = range(rnd, op === '*' ? 2 : 1, max), b = range(rnd, op === '*' ? 2 : 1, max);
        const right = op === '*' ? a * b : a + b;
        let c = right;
        if (!want) {
          const off = op === '*' && rnd(2) ? (rnd(2) ? a : b) : range(rnd, 1, diff === 'easy' ? 3 : 2);
          c = right + sign(rnd) * off;
          if (c < 0) c = right + off;
        }
        return { g: 'sum', a, b, op, c };
      },
      ok: s => (s.op === '*' ? s.a * s.b : s.a + s.b) === s.c,
    },
    /* Bars: two bars (length in % of the track); hard: both centred, so the ends don't line up */
    bars: {
      make(rnd, want, diff) {
        const gap = diff === 'easy' ? [14, 25] : diff === 'normal' ? [7, 13] : [4, 7];
        const a = range(rnd, 35, 95);
        let b = a;
        if (!want) {
          const d = range(rnd, gap[0], gap[1]);
          b = a + d <= 98 ? (a - d >= 20 && rnd(2) ? a - d : a + d) : a - d;
        }
        return { g: 'bars', a, b, centred: diff === 'hard' };
      },
      ok: s => s.a === s.b,
    },
    /* Counting: dots in the field and a number; positions in % (centres), at least 16 apart */
    count: {
      make(rnd, want, diff) {
        const [lo, hi] = diff === 'easy' ? [3, 6] : diff === 'normal' ? [4, 9] : [6, 12];
        const n = range(rnd, lo, hi);
        const dots = [];
        for (let tries = 0; dots.length < n && tries < 2000; tries++) {
          const p = { x: range(rnd, 10, 90), y: range(rnd, 10, 90) };
          if (dots.every(o => Math.hypot(o.x - p.x, o.y - p.y) >= 16)) dots.push(p);
        }
        let shown = dots.length;
        if (!want) shown = dots.length + (dots.length <= 1 ? 1 : sign(rnd)) * range(rnd, 1, diff === 'easy' ? 2 : 1);
        return { g: 'count', dots, n: shown };
      },
      ok: s => s.dots.length === s.n,
    },
    /* Pair: a row of shapes; a hit when two are exactly alike (shape and colour) */
    pair: {
      make(rnd, want, diff) {
        const n = diff === 'easy' ? 4 : diff === 'normal' ? 5 : 7;
        const all = [];
        for (const shape of SHAPES) for (const ink of INKS) all.push({ shape, ink });
        let items;
        if (diff === 'hard') {
          // Near misses: a few shapes share their form, but not their colour
          const forms = shuffle(rnd, SHAPES.slice()).slice(0, 3);
          items = shuffle(rnd, all.filter(i => forms.includes(i.shape))).slice(0, n);
        } else items = shuffle(rnd, all).slice(0, n);
        if (want) {
          const from = rnd(n);
          let to = rnd(n - 1); if (to >= from) to++;
          items[to] = { ...items[from] };
        }
        return { g: 'pair', items };
      },
      ok: s => s.items.some((a, i) => s.items.some((b, j) => j > i && a.shape === b.shape && a.ink === b.ink)),
    },
    /* Double: two dice */
    dice: {
      make(rnd, want) {
        const a = range(rnd, 1, 6);
        let b = a;
        if (!want) { b = range(rnd, 1, 5); if (b >= a) b++; }
        return { g: 'dice', d: [a, b] };
      },
      ok: s => s.d[0] === s.d[1],
    },
    /* Clock: an analog clock and a digital time (h 1–12, minutes in steps of 5) */
    clock: {
      make(rnd, want, diff) {
        const step = diff === 'easy' ? 15 : 5;
        const h = range(rnd, 1, 12), m = rnd(60 / step) * step;
        let dh = h, dm = m;
        if (!want) {
          if (diff === 'easy' || rnd(2)) dh = ((h - 1 + sign(rnd) * range(rnd, 1, diff === 'hard' ? 1 : 3) + 12) % 12) + 1;
          else dm = (m + sign(rnd) * step * range(rnd, 1, 2) + 60) % 60;
        }
        return { g: 'clock', h, m, dh, dm };
      },
      ok: s => s.h === s.dh && s.m === s.dm,
    },
    /* Order: numbers in a row; a hit when they go up from left to right */
    order: {
      make(rnd, want, diff) {
        const n = diff === 'hard' ? 5 : 4, max = diff === 'easy' ? 20 : 99;
        const set = new Set();
        while (set.size < n) set.add(range(rnd, 1, max));
        const nums = [...set].sort((a, b) => a - b);
        if (!want) {
          if (diff === 'easy') { do shuffle(rnd, nums); while (sortedAsc(nums)); }
          else { const i = rnd(n - 1); [nums[i], nums[i + 1]] = [nums[i + 1], nums[i]]; }   // only one neighbour pair swapped
        }
        return { g: 'order', nums };
      },
      ok: s => sortedAsc(s.nums),
    },
    /* Lamp: one light that changes colour */
    green: {
      make(rnd, want) {
        return { g: 'green', lamp: want ? 'green' : pick(rnd, LAMP.filter(c => c !== 'green')) };
      },
      ok: s => s.lamp === 'green',
    },
    /* Blind countdown: special timing, see countdownPlan(); `shown` is the number on screen (null = hidden) */
    countdown: {
      make: () => ({ g: 'countdown', shown: 3 }),
      ok: () => false,
      special: true,
    },
  };
  const IDS = Object.keys(GAMES);

  /** Blind countdown: counts down from 3 (one number per `tick` ms) and hides after `visible` numbers.
      A tap scores from `zero` ms on (3 ticks after the start) for `window` ms; before that it is wrong. */
  function countdownPlan(diff) {
    const tick = { easy: 900, normal: 800, hard: 700 }[diff];
    const visible = { easy: 2, normal: 1, hard: 1 }[diff];
    return { tick, visible, zero: 3 * tick, window: { easy: 1200, normal: 800, hard: 500 }[diff] };
  }

  /** Plan for the "hit now!" steps of one round: index of the first hit step (never step 0),
      later hit steps follow at random, so waiting doesn't pay off. */
  function wantAt(rnd, i, sinceLast) {
    if (i === 0) return false;
    if (sinceLast >= 5) return true;          // at the latest every 6th picture
    return rnd(100) < 28;
  }

  /** Next state of a game; asks again if it looks the same as the one before (players must see a change). */
  function make(id, rnd, want, diff, prev) {
    const game = GAMES[id];
    let s;
    for (let tries = 0; tries < 20; tries++) {
      s = game.make(rnd, want, diff);
      if (!prev || JSON.stringify(s) !== JSON.stringify(prev)) break;
    }
    if (game.ok(s) !== want) throw new Error(`game ${id} made a wrong state`);
    return s;
  }
  const ok = s => !!(s && GAMES[s.g] && GAMES[s.g].ok(s));

  window.ReflexGames = { IDS, DIFFS, STEP, INKS, SHAPES, GAMES, make, ok, wantAt, countdownPlan };
})();
