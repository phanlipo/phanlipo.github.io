/* Funktionsplotter – expression engine without DOM.
   PlotExpr.compile(lines) → {
     items:  one entry per line: { kind: 'fn' | 'const' | 'empty', name, label, f(x, P), error, uses }
               fn     a curve: "sin x", "y = a x²", "f(x) = …", "g(t) = …" (own variable name)
               const  "g = 9.81" – a named value (no x) other lines can use; not drawn
     params: names that are neither variable, constant nor function → parameters (sliders), in order of appearance
   }
   f(x, P) evaluates a curve at x with the parameter values P = { a: 1, … } (NaN where it is not defined).
   Syntax (also in the help of index.html):
     + − * / ^ (also ·, ×, ÷, ², ³, √), implicit multiplication ("2x", "a sin x", "2(x+1)", "x y"),
     decimal point or comma ("1,5"), scientific notation "6.6e-34", arguments separated by ";"
     ("max(x; 0)" – also "," where it cannot be part of a number), |x| for the absolute value.
     A function name without brackets takes the following power term: "sin 2x" = sin(2x), "sin x^2" = sin(x²).
     Names: letters (also Greek), digits and _ after the first letter ("v0", "x_1", "ω"). "ax" is one name.
     User functions are called by name, f'(x) and f''(x) are derivatives (numerical).
   PlotExpr.points(f, x0, x1, n) → zeros and extrema of f in [x0, x1] (sampled with n steps, then refined). */
(function (root) {
  'use strict';
  const L = 'A-Za-zÀ-ÖØ-öø-ÿΑ-Ωα-ωϑϕϵ_';
  const NAME = new RegExp(`^[${L}][${L}0-9]*`);
  const NUM = /^(?:\d+(?:[.,]\d+)?|\.\d+)(?:[eE][+-]?\d+)?/;

  // Lanczos approximation (g = 7)
  const LG = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  function gamma(x) {
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
    x -= 1;
    let a = LG[0];
    const t = x + 7.5;
    for (let i = 1; i < 9; i++) a += LG[i] / (x + i);
    return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
  }
  // Error function (Abramowitz & Stegun 7.1.26 is too coarse; series/continued fraction to ~1e-12)
  function erf(x) {
    const s = Math.sign(x), a = Math.abs(x);
    if (a < 2.5) {
      let sum = a, term = a;
      for (let n = 1; n < 80; n++) { term *= -a * a / n; const add = term / (2 * n + 1); sum += add; if (Math.abs(add) < 1e-16 * Math.abs(sum)) break; }
      return s * 2 / Math.sqrt(Math.PI) * sum;
    }
    // erfc by continued fraction (Lentz)
    let f = a, C = a, D = 0;
    for (let n = 1; n < 200; n++) {
      const an = n / 2;
      D = a + an * D; D = D ? 1 / D : 1e300;
      C = a + an / C; if (!C) C = 1e-300;
      const d = C * D; f *= d;
      if (Math.abs(d - 1) < 1e-15) break;
    }
    return s * (1 - Math.exp(-a * a) / Math.sqrt(Math.PI) / f);
  }
  const fact = n => (n >= 0 && Number.isInteger(n) && n <= 170) ? (() => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; })() : gamma(n + 1);

  // Built-in functions: [min args, max args, implementation]
  const FN = {
    sin: [1, 1, Math.sin], cos: [1, 1, Math.cos], tan: [1, 1, Math.tan], cot: [1, 1, x => 1 / Math.tan(x)],
    asin: [1, 1, Math.asin], acos: [1, 1, Math.acos], atan: [1, 2, (y, x) => x === undefined ? Math.atan(y) : Math.atan2(y, x)],
    sinh: [1, 1, Math.sinh], cosh: [1, 1, Math.cosh], tanh: [1, 1, Math.tanh],
    asinh: [1, 1, Math.asinh], acosh: [1, 1, Math.acosh], atanh: [1, 1, Math.atanh],
    exp: [1, 1, Math.exp], ln: [1, 1, Math.log], lg: [1, 1, Math.log10], log2: [1, 1, Math.log2],
    log: [1, 2, (a, b) => b === undefined ? Math.log10(a) : Math.log(b) / Math.log(a)],
    sqrt: [1, 1, Math.sqrt], cbrt: [1, 1, Math.cbrt], abs: [1, 1, Math.abs], sign: [1, 1, Math.sign], sgn: [1, 1, Math.sign],
    floor: [1, 1, Math.floor], ceil: [1, 1, Math.ceil], round: [1, 1, Math.round],
    min: [1, 9, Math.min], max: [1, 9, Math.max], mod: [2, 2, (a, b) => a - b * Math.floor(a / b)],
    step: [1, 1, x => x < 0 ? 0 : x > 0 ? 1 : 0.5], sinc: [1, 1, x => x === 0 ? 1 : Math.sin(x) / x],
    gamma: [1, 1, gamma], erf: [1, 1, erf], erfc: [1, 1, x => 1 - erf(x)],
  };
  const ALIAS = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', wurzel: 'sqrt', betrag: 'abs', heaviside: 'step' };
  const CONST = { pi: Math.PI, π: Math.PI, e: Math.E, inf: Infinity };
  const fnName = w => FN[w] ? w : (ALIAS[w] || null);

  class ParseError extends Error { constructor(code, arg) { super(code); this.code = code; this.arg = arg; } }

  function tokenize(src) {
    const toks = [];
    for (let i = 0; i < src.length;) {
      const c = src[i], rest = src.slice(i);
      let m;
      if (/\s/.test(c)) { i++; continue; }
      if ((m = NUM.exec(rest))) {
        toks.push({ t: 'num', v: Number(m[0].replace(',', '.').replace(/^\./, '0.')) });
        i += m[0].length; continue;
      }
      if ((m = NAME.exec(rest))) {
        i += m[0].length;
        let primes = 0;
        while (src[i] === "'" || src[i] === '′') { primes++; i++; }
        toks.push({ t: 'name', v: m[0], primes });
        continue;
      }
      const op = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '·': '*', '×': '*', '⋅': '*', '/': '/', '÷': '/', '^': '^' }[c];
      if (op) { toks.push({ t: 'op', v: op }); i++; continue; }
      if (c === '*' && src[i + 1] === '*') { toks.push({ t: 'op', v: '^' }); i += 2; continue; }
      if ('()|;,!²³√='.includes(c)) { toks.push({ t: c }); i++; continue; }
      if (c === '[' || c === '{') { toks.push({ t: '(' }); i++; continue; }
      if (c === ']' || c === '}') { toks.push({ t: ')' }); i++; continue; }
      throw new ParseError('symbol', c);
    }
    return toks;
  }

  // Syntax tree: {t:'n',v} {t:'v',name} {t:'neg',a} {t:'op',op,a,b} {t:'fn',name,args} {t:'call',name,primes,arg} {t:'fact',a}
  function parse(toks) {
    let p = 0;
    const peek = () => toks[p], at = t => toks[p] && toks[p].t === t;
    const isOp = v => at('op') && toks[p].v === v;
    let absDepth = 0;
    function expect(t) { if (!at(t)) throw new ParseError(t === ')' ? 'paren' : 'syntax'); p++; }
    function expr() {
      let a = term();
      while (isOp('+') || isOp('-')) { const op = toks[p++].v; a = { t: 'op', op, a, b: term() }; }
      return a;
    }
    // Can the next token start a factor (implicit multiplication)?
    function startsFactor() {
      const k = peek();
      if (!k) return false;
      if (k.t === '|') return absDepth === 0; // inside |…| a "|" closes
      return k.t === 'num' || k.t === 'name' || k.t === '(' || k.t === '√';
    }
    function term() {
      let a = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) { const op = toks[p++].v; a = { t: 'op', op, a, b: unary() }; }
        else if (startsFactor()) a = { t: 'op', op: '*', a, b: power() };
        else return a;
      }
    }
    function unary() {
      if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      return power();
    }
    function power() {
      const base = postfix();
      if (isOp('^')) { p++; return { t: 'op', op: '^', a: base, b: unary() }; }
      return base;
    }
    function postfix() {
      let a = primary();
      for (;;) {
        if (at('!')) { p++; a = { t: 'fact', a }; }
        else if (at('²') || at('³')) { const e = toks[p++].t === '²' ? 2 : 3; a = { t: 'op', op: '^', a, b: { t: 'n', v: e } }; }
        else return a;
      }
    }
    function args() {
      expect('(');
      const list = [expr()];
      while (at(';') || at(',')) { p++; list.push(expr()); }
      if (at(')')) p++; else if (peek()) throw new ParseError('paren');
      return list;
    }
    function primary() {
      const k = toks[p];
      if (!k) throw new ParseError('end');
      if (k.t === 'num') { p++; return { t: 'n', v: k.v }; }
      if (k.t === '(') {
        p++;
        const a = expr();
        if (at(')')) p++; else if (peek()) throw new ParseError('paren'); // missing ")" at the end is closed
        return a;
      }
      if (k.t === '|') {
        p++; absDepth++;
        const a = expr();
        absDepth--;
        expect('|');
        return { t: 'fn', name: 'abs', args: [a] };
      }
      if (k.t === '√') { p++; return { t: 'fn', name: 'sqrt', args: [postfixPow()] }; }
      if (k.t === 'name') {
        p++;
        const w = k.v, fn = fnName(w.toLowerCase());
        if (fn && !k.primes) {
          // sin(x), max(a; b) – or without brackets: sin 2x, sin x² (the following power term with implicit factors)
          const list = at('(') ? args() : [implicitArg()];
          const [lo, hi] = FN[fn];
          if (list.length < lo || list.length > hi) throw new ParseError('args', w);
          // "sin(x)^2" squares the result, as usual
          return { t: 'fn', name: fn, args: list };
        }
        if (at('(') || k.primes) {
          // user function call f(…) / f'(…) – decided against the definitions later; otherwise multiplication
          const list = at('(') ? args() : null;
          if (k.primes && !list) throw new ParseError('call', w);
          return { t: 'call', name: w, primes: k.primes, arg: list && list[0], argc: list ? list.length : 0 };
        }
        return { t: 'v', name: w };
      }
      throw new ParseError('syntax');
    }
    // Argument of a function without brackets: power term and directly following factors ("sin 2x" → sin(2x))
    function implicitArg() {
      let a = unary();
      while (startsFactor() && !(peek().t === 'name' && fnName(peek().v.toLowerCase()))) a = { t: 'op', op: '*', a, b: power() };
      return a;
    }
    function postfixPow() { const b = postfix(); if (isOp('^')) { p++; return { t: 'op', op: '^', a: b, b: unary() }; } return b; }
    const tree = expr();
    if (p < toks.length) throw new ParseError(toks[p].t === ')' ? 'paren' : 'syntax');
    return tree;
  }

  // Names used in a tree (variables and calls)
  function walk(n, fn) {
    fn(n);
    if (n.a) walk(n.a, fn);
    if (n.b) walk(n.b, fn);
    if (n.args) n.args.forEach(c => walk(c, fn));
    if (n.arg) walk(n.arg, fn);
  }

  // Line → { kind, name, variable, tree }
  function splitLine(src) {
    const text = src.replace(/#.*$/, '').trim();
    if (!text) return { kind: 'empty' };
    const eq = text.indexOf('=');
    if (eq < 0) return { kind: 'fn', variable: 'x', body: text };
    const lhs = text.slice(0, eq).trim(), body = text.slice(eq + 1).trim();
    if (body.includes('=')) throw new ParseError('equals');
    let m;
    if ((m = new RegExp(`^([${L}][${L}0-9]*)\\s*\\(\\s*([${L}][${L}0-9]*)\\s*\\)$`).exec(lhs))) {
      if (fnName(m[1].toLowerCase()) || m[1] in CONST) throw new ParseError('reserved', m[1]);
      return { kind: 'fn', name: m[1], variable: m[2], body };
    }
    if ((m = new RegExp(`^[${L}][${L}0-9]*$`).exec(lhs))) {
      if (lhs === 'y') return { kind: 'fn', variable: 'x', body };
      if (fnName(lhs.toLowerCase()) || lhs in CONST || lhs === 'x') throw new ParseError('reserved', lhs);
      return { kind: 'named', name: lhs, body }; // constant, or function of x if the body uses x
    }
    throw new ParseError('lhs');
  }

  function compile(lines) {
    const items = lines.map(src => {
      try {
        const s = splitLine(src);
        if (s.kind === 'empty') return { kind: 'empty' };
        if (!s.body) throw new ParseError('end');
        const tree = parse(tokenize(s.body));
        return Object.assign(s, { tree });
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        return { kind: 'error', error: e.code, arg: e.arg };
      }
    });
    // "name = …" with x in the body is a function of x, otherwise a constant
    for (const it of items) {
      if (it.kind !== 'named') continue;
      let usesX = false;
      walk(it.tree, n => { if (n.t === 'v' && n.name === 'x') usesX = true; });
      it.kind = usesX ? 'fn' : 'const';
      if (usesX) it.variable = 'x';
    }
    const funcs = Object.create(null), consts = Object.create(null);
    items.forEach((it, i) => {
      if (it.kind === 'fn' && it.name) {
        if (it.name in funcs || it.name in consts) { it.kind = 'error'; it.error = 'twice'; it.arg = it.name; } else funcs[it.name] = i;
      } else if (it.kind === 'const') {
        if (it.name in funcs || it.name in consts) { it.kind = 'error'; it.error = 'twice'; it.arg = it.name; } else consts[it.name] = i;
      }
    });
    // Unknown names → parameters; a call of a name that is no function is a product: a(x+1)
    const params = [];
    const resolve = (n, bound) => {
      if (n.t === 'call' && !(n.name in funcs)) {
        if (n.primes || n.argc !== 1) throw new ParseError('nofn', n.name);
        Object.assign(n, { t: 'op', op: '*', a: { t: 'v', name: n.name }, b: n.arg });
        delete n.arg; delete n.name; delete n.primes; delete n.argc;
      }
      if (n.t === 'call' && n.argc !== 1) throw new ParseError('args', n.name);
      if (n.t === 'v' && n.name !== bound && !(n.name in CONST) && !(n.name in consts) && !params.includes(n.name)) params.push(n.name);
    };
    items.forEach(it => {
      if (it.kind !== 'fn' && it.kind !== 'const') return;
      try {
        // walk() visits children after the node is rewritten, so the new children are seen as well
        walk(it.tree, n => resolve(n, it.kind === 'fn' ? it.variable : null));
      } catch (e) {
        if (!(e instanceof ParseError)) throw e;
        it.kind = 'error'; it.error = e.code; it.arg = e.arg;
      }
    });
    // Recursion (f(x) = f(x), a = b and b = a) ends in guard() and gives NaN
    const compiled = {};
    function build(n, bound) {
      switch (n.t) {
        case 'n': { const v = n.v; return () => v; }
        case 'v': {
          const name = n.name;
          if (name === bound) return x => x;
          if (name in CONST) { const v = CONST[name]; return () => v; }
          if (name in consts) return (x, P) => constValue(name, P);
          return (x, P) => (name in P ? P[name] : NaN);
        }
        case 'neg': { const a = build(n.a, bound); return (x, P) => -a(x, P); }
        case 'fact': { const a = build(n.a, bound); return (x, P) => fact(a(x, P)); }
        case 'op': {
          const a = build(n.a, bound), b = build(n.b, bound);
          switch (n.op) {
            case '+': return (x, P) => a(x, P) + b(x, P);
            case '-': return (x, P) => a(x, P) - b(x, P);
            case '*': return (x, P) => a(x, P) * b(x, P);
            case '/': return (x, P) => a(x, P) / b(x, P);
            default: return (x, P) => {
              const u = a(x, P), v = b(x, P);
              // odd roots of negative numbers: x^(1/3) is real
              if (u < 0 && !Number.isInteger(v)) {
                const inv = 1 / v, k = Math.round(inv);
                if (Math.abs(inv - k) < 1e-9 && k % 2) return -Math.pow(-u, v);
              }
              return Math.pow(u, v);
            };
          }
        }
        case 'fn': {
          const f = FN[n.name][2], args = n.args.map(c => build(c, bound));
          if (args.length === 1) { const a = args[0]; return (x, P) => f(a(x, P)); }
          return (x, P) => f(...args.map(a => a(x, P)));
        }
        case 'call': {
          const name = n.name, primes = n.primes, a = build(n.arg, bound);
          return (x, P) => callFn(name, primes, a(x, P), P);
        }
      }
      throw new Error('node ' + n.t);
    }
    let depth = 0;
    function guard(fn) {
      if (++depth > 60) { depth--; throw new ParseError('cycle'); }
      try { return fn(); } finally { depth--; }
    }
    function constValue(name, P) {
      const i = consts[name];
      return guard(() => compiledOf(i, items[i])(0, P));
    }
    function compiledOf(i, it) {
      if (!compiled[i]) compiled[i] = build(it.tree, it.kind === 'fn' ? it.variable : null);
      return compiled[i];
    }
    function callFn(name, primes, x, P) {
      const i = funcs[name], f = compiledOf(i, items[i]);
      if (!primes) return guard(() => f(x, P));
      return guard(() => derivative(t => f(t, P), x, primes));
    }
    const out = items.map((it, i) => {
      if (it.kind === 'fn' || it.kind === 'const') {
        let f;
        try { f = compiledOf(i, it); } catch (e) { return { kind: 'error', error: 'syntax' }; }
        const safe = (x, P) => {
          try { const v = f(x, P); return typeof v === 'number' ? v : NaN; }
          catch (e) { if (e instanceof ParseError) return NaN; throw e; }
        };
        return { kind: it.kind, name: it.name || null, variable: it.variable, f: safe };
      }
      return it.kind === 'empty' ? { kind: 'empty' } : { kind: 'error', error: it.error, arg: it.arg };
    });
    return { items: out, params };
  }

  // Central differences (Richardson-extrapolated) of order 1 or 2
  function derivative(f, x, order) {
    const h = 1e-3 * Math.max(1, Math.abs(x));
    if (order === 1) {
      const d = s => (f(x + s) - f(x - s)) / (2 * s);
      return (4 * d(h / 2) - d(h)) / 3;
    }
    if (order === 2) {
      const d = s => (f(x + s) - 2 * f(x) + f(x - s)) / (s * s);
      const k = h * 10;
      return (4 * d(k / 2) - d(k)) / 3;
    }
    return derivative(t => derivative(f, t, order - 1), x, 1);
  }

  // Zeros and extrema of f in [x0, x1]; poles (sign change with a huge jump) are skipped
  function points(f, x0, x1, n) {
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; xs.push(x); ys.push(f(x)); }
    const out = [];
    const ok = v => Number.isFinite(v);
    let span = 0;
    for (const v of ys) if (ok(v)) span = Math.max(span, Math.abs(v));
    for (let i = 0; i < n; i++) {
      const a = ys[i], b = ys[i + 1];
      if (!ok(a) || !ok(b)) continue;
      if (a === 0 && (i === 0 || ys[i - 1] !== 0)) { out.push({ type: 'zero', x: xs[i], y: 0 }); continue; }
      if (a * b < 0) {
        let lo = xs[i], hi = xs[i + 1], flo = a;
        for (let k = 0; k < 60; k++) {
          const m = (lo + hi) / 2, fm = f(m);
          if (!ok(fm)) break;
          if (flo * fm <= 0) hi = m; else { lo = m; flo = fm; }
        }
        const x = (lo + hi) / 2, y = f(x);
        // a pole (tan, 1/x) changes sign too – its value near the crossing is large
        if (ok(y) && Math.abs(y) <= 1e-6 * Math.max(1, span) + 1e-9) out.push({ type: 'zero', x, y: 0 });
      }
    }
    for (let i = 1; i < n; i++) {
      const a = ys[i - 1], b = ys[i], c = ys[i + 1];
      if (!ok(a) || !ok(b) || !ok(c)) continue;
      // b = c (sampled symmetrically around the extremum) counts if the curve then turns – not on a plateau (floor, step)
      const d = i + 2 <= n ? ys[i + 2] : NaN;
      const max = b > a && (b > c || (b === c && d < c)), min = b < a && (b < c || (b === c && d > c));
      if (!max && !min) continue;
      // golden-section search on [x(i-1), x(i+1)]
      const g = (Math.sqrt(5) - 1) / 2, sgn = max ? -1 : 1;
      let lo = xs[i - 1], hi = xs[i + 1];
      let c1 = hi - g * (hi - lo), c2 = lo + g * (hi - lo), f1 = sgn * f(c1), f2 = sgn * f(c2);
      for (let k = 0; k < 60; k++) {
        if (f1 < f2) { hi = c2; c2 = c1; f2 = f1; c1 = hi - g * (hi - lo); f1 = sgn * f(c1); }
        else { lo = c1; c1 = c2; f1 = f2; c2 = lo + g * (hi - lo); f2 = sgn * f(c2); }
      }
      const x = (lo + hi) / 2, y = f(x);
      // a tip next to a jump (floor, step) is no extremum: the neighbourhood must be continuous
      if (!ok(y) || Math.abs(y - b) > 0.5 * (Math.abs(a - b) + Math.abs(c - b)) + 1e-12) continue;
      if (!out.some(p => p.type !== 'zero' && Math.abs(p.x - x) < (x1 - x0) / n)) out.push({ type: max ? 'max' : 'min', x, y });
    }
    return out.sort((p, q) => p.x - q.x);
  }

  root.PlotExpr = { compile, derivative, points, gamma, erf, tokenize };
})(typeof window !== 'undefined' ? window : globalThis);
