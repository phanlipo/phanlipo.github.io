// Code breaker rules (no DOM). Colours are numbers 0…7 (index into COLORS); a code is an array of them.
// A game is a plain object (stored as is):
//   { secret: [n, …], level: 'easy'|'medium'|'hard', source: 'random'|'own', guesses: [{ code, black, white }], gaveUp, done }
// black = right colour in the right place, white = right colour in another place (each peg counts once).
(function (root) {
  'use strict';
  const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan', 'pink'];
  const LEVELS = {
    easy: { pegs: 4, colors: 6, repeat: false },
    medium: { pegs: 4, colors: 6, repeat: true },
    hard: { pegs: 5, colors: 8, repeat: true },
  };
  const TRIES = 10;
  const levelOf = name => LEVELS[name] || LEVELS.medium;

  function score(secret, code) {
    let black = 0;
    const restS = {}, restC = {};
    secret.forEach((s, i) => {
      if (code[i] === s) black++;
      else { restS[s] = (restS[s] || 0) + 1; restC[code[i]] = (restC[code[i]] || 0) + 1; }
    });
    let white = 0;
    for (const k of Object.keys(restC)) white += Math.min(restC[k], restS[k] || 0);
    return { black, white };
  }

  // Error code for a code in this level, or '' if it can be played
  function check(code, level) {
    const L = levelOf(level);
    if (!Array.isArray(code) || code.length !== L.pegs) return 'length';
    if (!code.every(c => Number.isInteger(c) && c >= 0 && c < L.colors)) return 'color';
    if (!L.repeat && new Set(code).size !== code.length) return 'repeat';
    return '';
  }

  function create({ secret, level = 'medium', source = 'random' }) {
    if (!LEVELS[level]) level = 'medium';
    if (check(secret, level)) throw new Error('secret');
    return { secret: [...secret], level, source: source === 'own' ? 'own' : 'random', guesses: [], gaveUp: false, done: false };
  }

  function status(g) {
    const last = g.guesses[g.guesses.length - 1];
    if (last && last.black === g.secret.length) return 'won';
    if (g.gaveUp || g.guesses.length >= TRIES) return 'lost';
    return 'playing';
  }

  function guess(g, code) {
    if (status(g) !== 'playing') throw new Error('over');
    const err = check(code, g.level);
    if (err) throw new Error(err);
    const r = { code: [...code], ...score(g.secret, code) };
    g.guesses.push(r);
    return r;
  }

  function random(level, rnd = Math.random) {
    const L = levelOf(level), pool = [...Array(L.colors).keys()], out = [];
    while (out.length < L.pegs) {
      const i = Math.floor(rnd() * pool.length);
      out.push(pool[i]);
      if (!L.repeat) pool.splice(i, 1);
    }
    return out;
  }

  // How many codes of the level still fit every answer so far (for the tip line; at most 8^5 = 32768 codes)
  function possible(g) {
    const L = levelOf(g.level);
    let n = 0;
    const code = new Array(L.pegs).fill(0);
    const total = L.colors ** L.pegs;
    for (let k = 0; k < total; k++) {
      let x = k;
      for (let i = 0; i < L.pegs; i++) { code[i] = x % L.colors; x = Math.floor(x / L.colors); }
      if (!L.repeat && new Set(code).size !== L.pegs) continue;
      if (g.guesses.every(r => { const s = score(code, r.code); return s.black === r.black && s.white === r.white; })) n++;
    }
    return n;
  }

  root.CodeBreaker = { COLORS, LEVELS, TRIES, levelOf, score, check, create, status, guess, random, possible };
})(typeof window !== 'undefined' ? window : globalThis);
