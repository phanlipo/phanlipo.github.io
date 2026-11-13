/* Rechenzettel – calculation engine without DOM.
   CalcEngine.evaluate(text, dec, { deg }) → one entry per line: { value, plain, single, assign, error, solved, more, eq }
     dec       decimal separator of the UI language: ',' (German) or '.' (English)
     deg       angles in degrees (default) or radians (deg: false) for sin, cos, tan and their inverses
     value     result of the line (null = text line or not a complete calculation yet)
     plain     the line is only a single number (shown muted, still counts for sum/ans)
     single    only a single number, also for "name = 850" (copying the pad adds no "= result" there)
     error     'math' (division by zero, ln of a negative number …), 'contra' (system without solution),
               'noreal' (equation without real solution)
     eq        the line is an equation (does not count for sum/ans)
     solved    [{ name, value }] solutions shown on this line (value = the first of them)
     more      an equation has more solutions than shown (periodic functions)
   Rules (also in the help of index.html):
     - Words and symbols that are not part of a calculation are ignored ("Miete 850 + Strom 120" → 970).
       Two numbers next to each other without an operator are no calculation (dates, phone numbers …).
     - "Label: 20 + 5" – text before a colon is a label.
     - A line that starts with an operator continues from the last result ("+ 20", "× 2").
     - ans/erg = last result, sum/summe = sum of the results above, up to an empty line.
     - name = expression defines a variable for the lines below.
     - "200 + 10%" adds 10 % of 200; elsewhere 10% is 0.1.
     - Functions: sqrt/√, exp, ln, log (base 10), sin, cos, tan, asin, acos, atan, abs, round; constants pi/π, e;
       factorial "5!", x² and x³. derivative(f; a) and integral(f; a; b) numerically (German: ableitung, integral).
     - Text after "=" is ignored ("850 + 120 = 970" can be pasted back), text after "⇒" too.
     - Equations with unknown names are solved: linear ones exactly, also as a system (the equations of a block up
       to an empty line); others with a single unknown (quadratic, polynomials, e^x = 5, sin x = 0.5 …) give all
       real solutions (polynomials exactly via the roots of their derivatives, others by a numeric search).
       Solved names can be used below like variables – up to the next empty line.
       A number directly before a name multiplies it ("3a"); with a space between it is text ("850 Miete"). */
(function (root) {
  'use strict';
  const OPS = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '^': '^' };
  const L = 'A-Za-zÀ-ÖØ-öø-ÿ';
  const WORD = new RegExp(`^[${L}_][${L}0-9_]*`);
  const FUNCS = {
    sqrt: 'sqrt', wurzel: 'sqrt', exp: 'exp', ln: 'ln', log: 'log', lg: 'log', sin: 'sin', cos: 'cos', tan: 'tan',
    asin: 'asin', arcsin: 'asin', acos: 'acos', arccos: 'acos', atan: 'atan', arctan: 'atan',
    abs: 'abs', betrag: 'abs', round: 'round', runden: 'round',
  };
  const SPECIAL = { ableitung: 'deriv', derivative: 'deriv', diff: 'deriv', integral: 'integ' };
  const CONSTS = { pi: Math.PI, e: Math.E };
  const RESERVED = new Set(['ans', 'erg', 'sum', 'summe', ...Object.keys(FUNCS), ...Object.keys(SPECIAL), ...Object.keys(CONSTS)]);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // "1.234,5" (German) / "1,234.5" (English); the other separator is accepted as decimal point when it is
  // not a group of three digits ("1.5" is 1,5 in German, "1.500" is 1500)
  function parseNumber(s, dec) {
    if (/^\d+$/.test(s)) return Number(s);
    const th = dec === ',' ? '.' : ',';
    const q = c => '\\' + c;
    if (new RegExp(`^\\d{1,3}(${q(th)}\\d{3})+(${q(dec)}\\d+)?$`).test(s)) return Number(s.split(th).join('').replace(dec, '.'));
    if (new RegExp(`^\\d+${q(dec)}\\d+$`).test(s)) return Number(s.replace(dec, '.'));
    if (/^\d+[.,]\d+$/.test(s)) return Number(s.replace(',', '.'));
    return NaN;
  }

  class Syntax extends Error {}
  class MathErr extends Error {}
  class NonLin extends Error {}

  /* Tokens. unknowns: names that are no variable become unknowns (equations) instead of being skipped as text;
     other symbols then make the line no equation. Inside derivative(…)/integral(…) names are always kept. */
  function tokenize(src, dec, vars, unknowns) {
    const toks = [], stack = [];
    let words = 0, pendingSpecial = false;
    const tightAt = i => i > 0 && !/\s/.test(src[i - 1]);
    for (let i = 0; i < src.length;) {
      const c = src[i], rest = src.slice(i);
      let m;
      if (/\s/.test(c)) { i++; continue; }
      if (pendingSpecial && c !== '(') pendingSpecial = false;
      if ((m = /^\d+(?:[.,]\d+)*/.exec(rest)) || (m = /^[.,]\d+/.exec(rest))) {
        let s = m[0];
        if (/^[.,]/.test(s)) s = '0' + s;
        const v = parseNumber(s, dec);
        if (Number.isNaN(v)) throw new Syntax('number');
        toks.push({ t: 'num', v });
        i += m[0].length; continue;
      }
      if (has(OPS, c)) { toks.push({ t: 'op', v: OPS[c] }); i++; continue; }
      if (c === '(') { stack.push(pendingSpecial ? 'S' : 'P'); pendingSpecial = false; toks.push({ t: '(' }); i++; continue; }
      if (c === ')') { stack.pop(); toks.push({ t: ')' }); i++; continue; }
      if (c === '%') { toks.push({ t: '%' }); i++; continue; }
      if (c === ';' && stack.length) { toks.push({ t: ';' }); i++; continue; }
      const last = toks[toks.length - 1];
      if (c === '!' && last && (last.t === 'num' || last.t === ')') && tightAt(i)) { toks.push({ t: '!' }); i++; continue; }
      if (c === '√') { toks.push({ t: 'fn', name: 'sqrt' }); i++; continue; }
      if (c === '²' || c === '³') { toks.push({ t: 'op', v: '^' }, { t: 'num', v: c === '²' ? 2 : 3 }); i++; continue; }
      if (c === 'π') { toks.push({ t: 'num', v: Math.PI, ref: true, tight: tightAt(i) }); i++; continue; }
      if ((m = WORD.exec(rest))) {
        const w = m[0].toLowerCase(), tight = tightAt(i);
        i += m[0].length;
        // "3 x 4": x between a number and a number/bracket multiplies
        if (w === 'x' && last && (last.t === 'num' || last.t === ')') && /^\s*[\d(.,]/.test(src.slice(i))) toks.push({ t: 'op', v: '*' });
        else if (has(vars, w)) toks.push({ t: 'num', v: vars[w], ref: true, tight });
        else if (w === 'ans' || w === 'erg') toks.push({ t: 'ans' });
        else if (w === 'sum' || w === 'summe') toks.push({ t: 'sum' });
        else if (has(FUNCS, w)) toks.push({ t: 'fn', name: FUNCS[w] });
        else if (has(SPECIAL, w)) { toks.push({ t: 'sp', name: SPECIAL[w] }); pendingSpecial = true; }
        else if (has(CONSTS, w)) toks.push({ t: 'num', v: CONSTS[w], ref: true, tight });
        else if (unknowns || stack.includes('S')) toks.push({ t: 'unk', name: w, label: m[0], tight });
        else words++;
        continue;
      }
      if (unknowns) throw new Syntax('symbol');
      i++; // other symbols (€, $, :, ! …) are text
    }
    return { toks, words };
  }

  /* ---------- Parser → syntax tree ---------- */
  function parse(toks, ctx) {
    let p = 0;
    const peek = () => toks[p];
    const isOp = v => peek() && peek().t === 'op' && peek().v === v;
    function args() {
      if (!peek() || peek().t !== '(') throw new Syntax('(');
      p++;
      const list = [add()];
      while (peek() && peek().t === ';') { p++; list.push(add()); }
      if (peek() && peek().t === ')') p++;
      else if (peek()) throw new Syntax(')');
      return list;
    }
    function primary() {
      const tk = toks[p++];
      if (!tk) throw new Syntax('end');
      if (tk.t === 'num') return { t: 'n', v: tk.v };
      if (tk.t === 'unk') return { t: 'u', name: tk.name };
      if (tk.t === 'ans') { if (ctx.ans == null) throw new Syntax('ans'); return { t: 'n', v: ctx.ans }; }
      if (tk.t === 'sum') return { t: 'n', v: ctx.sum };
      if (tk.t === 'fn') return { t: 'fn', name: tk.name, a: unary() };
      if (tk.t === 'sp') {
        const list = args();
        if (list.length !== (tk.name === 'deriv' ? 2 : 3)) throw new Syntax('args');
        // The variable of f is its one unknown name (x if f is constant)
        const names = unknownNames(list[0]);
        if (names.size > 1) throw new Syntax('vars');
        return { t: tk.name, body: list[0], v: [...names][0] || 'x', args: list.slice(1) };
      }
      if (tk.t === '(') {
        const v = add();
        if (peek() && peek().t === ')') p++;
        else if (peek()) throw new Syntax(')');
        return { t: 'grp', a: v }; // a missing ")" at the end is closed automatically
      }
      throw new Syntax('token');
    }
    function postfix() {
      let r = primary();
      while (peek() && (peek().t === '%' || peek().t === '!')) r = { t: toks[p++].t === '%' ? 'pct' : 'fact', a: r };
      return r;
    }
    function pow() {
      const b = postfix();
      if (isOp('^')) { p++; return { t: 'bin', op: '^', l: b, r: unary() }; }
      return b;
    }
    function unary() {
      if (isOp('-')) { p++; return { t: 'neg', a: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      return pow();
    }
    // Implicit multiplication only before brackets, functions, ans and sum ("2(3+4)", "2√9", "2sin 30") and before
    // a name written right after a number ("3a", "2pi") – never between two plain numbers or with a space before a
    // name ("850 Miete"), so dates, lists and notes stay text
    const implicit = () => {
      const tk = peek();
      return tk && (tk.t === '(' || tk.t === 'fn' || tk.t === 'sp' || tk.t === 'ans' || tk.t === 'sum' ||
        (((tk.t === 'num' && tk.ref) || tk.t === 'unk') && tk.tight));
    };
    function mul() {
      let l = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const op = toks[p++].v;
          l = { t: 'bin', op, l, r: unary() };
        } else if (implicit()) {
          if (peek().t === 'unk' && toks[p - 1].t !== 'num') throw new Syntax('implicit');
          l = { t: 'bin', op: '*', l, r: unary() };
        } else return l;
      }
    }
    function add() {
      let l = mul();
      while (isOp('+') || isOp('-')) l = { t: 'bin', op: toks[p++].v, l, r: mul() };
      return l;
    }
    const r = add();
    if (p < toks.length) throw new Syntax('rest');
    return r;
  }

  // Unknown names in a tree (the variable of derivative/integral is bound inside f)
  function unknownNames(n, bound, out) {
    const set = out || new Set(), b = bound || new Set();
    if (!n) return set;
    if (n.t === 'u') { if (!b.has(n.name)) set.add(n.name); }
    else if (n.t === 'deriv' || n.t === 'integ') {
      unknownNames(n.body, new Set([...b, n.v]), set);
      n.args.forEach(a => unknownNames(a, b, set));
    } else ['a', 'l', 'r'].forEach(k => unknownNames(n[k], b, set));
    return set;
  }
  const hasUnknown = n => unknownNames(n).size > 0;
  const isPct = n => n.t === 'pct' || (n.t === 'neg' && n.a.t === 'pct');

  /* ---------- Numbers ---------- */
  function fact(x) {
    if (!Number.isInteger(x) || x < 0 || x > 170) throw new MathErr('fact');
    let r = 1;
    for (let i = 2; i <= x; i++) r *= i;
    return r;
  }
  function fn(name, x, ctx) {
    const toRad = v => (ctx.deg ? v * Math.PI / 180 : v), fromRad = v => (ctx.deg ? v * 180 / Math.PI : v);
    switch (name) {
      case 'sqrt': if (x < 0) throw new MathErr('sqrt'); return Math.sqrt(x);
      case 'exp': return Math.exp(x);
      case 'ln': if (x <= 0) throw new MathErr('ln'); return Math.log(x);
      case 'log': if (x <= 0) throw new MathErr('log'); return Math.log10(x);
      // Exact zeros at multiples of 180° (sin) and 90° (cos) – no 1e-16 noise
      case 'sin': return ctx.deg && x % 180 === 0 ? 0 : Math.sin(toRad(x));
      case 'cos': return ctx.deg && (x - 90) % 180 === 0 ? 0 : Math.cos(toRad(x));
      case 'tan':
        if (ctx.deg && (((x % 180) + 180) % 180) === 90) throw new MathErr('tan');
        return ctx.deg && x % 180 === 0 ? 0 : Math.tan(toRad(x));
      case 'asin': if (x < -1 || x > 1) throw new MathErr('asin'); return fromRad(Math.asin(x));
      case 'acos': if (x < -1 || x > 1) throw new MathErr('acos'); return fromRad(Math.acos(x));
      case 'atan': return fromRad(Math.atan(x));
      case 'abs': return Math.abs(x);
      case 'round': return Math.round(x);
    }
    throw new Syntax('fn');
  }
  const numeric = v => (Math.abs(v) < 1e-9 ? 0 : Number(v.toPrecision(10)));

  function num(n, env, ctx) {
    let v;
    switch (n.t) {
      case 'n': return n.v;
      case 'u': if (env && has(env, n.name)) return env[n.name]; throw new Syntax('unknown');
      case 'grp': return num(n.a, env, ctx);
      case 'neg': return -num(n.a, env, ctx);
      case 'pct': return num(n.a, env, ctx) / 100;
      case 'fact': return fact(num(n.a, env, ctx));
      case 'fn': v = fn(n.name, num(n.a, env, ctx), ctx); break;
      case 'bin': {
        const l = num(n.l, env, ctx), r = num(n.r, env, ctx);
        if (n.op === '+' || n.op === '-') {
          const d = isPct(n.r) ? l * r : r; // 200 + 10% = 220
          v = n.op === '+' ? l + d : l - d;
        } else if (n.op === '*') v = l * r;
        else if (n.op === '/') { if (r === 0) throw new MathErr('div0'); v = l / r; }
        else v = Math.pow(l, r);
        break;
      }
      case 'deriv': v = derivative(n, env, ctx); break;
      case 'integ': v = integral(n, env, ctx); break;
      default: throw new Syntax('node');
    }
    if (!Number.isFinite(v)) throw new MathErr('range');
    return v;
  }
  const bodyFn = (n, env, ctx) => t => num(n.body, Object.assign({}, env, { [n.v]: t }), ctx);

  // Central differences with Richardson extrapolation
  function derivative(n, env, ctx) {
    const a = num(n.args[0], env, ctx), f = bodyFn(n, env, ctx);
    const h0 = 0.01 * Math.max(1, Math.abs(a)), T = [];
    for (let i = 0; i < 5; i++) {
      const h = h0 / Math.pow(2, i);
      T[i] = [(f(a + h) - f(a - h)) / (2 * h)];
      for (let j = 1; j <= i; j++) T[i][j] = T[i][j - 1] + (T[i][j - 1] - T[i - 1][j - 1]) / (Math.pow(4, j) - 1);
    }
    return numeric(T[4][4]);
  }
  // Adaptive Simpson rule
  function integral(n, env, ctx) {
    const a = num(n.args[0], env, ctx), b = num(n.args[1], env, ctx), f = bodyFn(n, env, ctx);
    if (a === b) return 0;
    let budget = 200000;
    const F = t => { if (--budget < 0) throw new MathErr('integral'); return f(t); };
    function step(a, b, fa, fm, fb, whole, eps, depth) {
      const m = (a + b) / 2, lm = (a + m) / 2, rm = (m + b) / 2, flm = F(lm), frm = F(rm);
      const left = (m - a) / 6 * (fa + 4 * flm + fm), right = (b - m) / 6 * (fm + 4 * frm + fb), d = left + right - whole;
      if (depth > 4 && (depth > 60 || Math.abs(d) <= 15 * eps)) return left + right + d / 15;
      return step(a, m, fa, flm, fm, left, eps / 2, depth + 1) + step(m, b, fm, frm, fb, right, eps / 2, depth + 1);
    }
    const fa = F(a), fb = F(b), fm = F((a + b) / 2), whole = (b - a) / 6 * (fa + 4 * fm + fb);
    return numeric(step(a, b, fa, fm, fb, whole, 1e-11 * (1 + Math.abs(whole)), 0));
  }

  /* ---------- Linear forms c + Σ k·name (systems of linear equations) ---------- */
  const lin = (c, k) => ({ c, k: k || {} });
  const scale = (a, f) => { const k = {}; for (const n in a.k) k[n] = a.k[n] * f; return lin(a.c * f, k); };
  const isConst = a => !Object.keys(a.k).length;
  function plus(a, b, sign) {
    const k = Object.assign({}, a.k);
    for (const n in b.k) k[n] = (k[n] || 0) + sign * b.k[n];
    return lin(a.c + sign * b.c, k);
  }
  function linear(n, ctx) {
    if (!hasUnknown(n)) return lin(num(n, null, ctx));
    switch (n.t) {
      case 'u': return lin(0, { [n.name]: 1 });
      case 'grp': return linear(n.a, ctx);
      case 'neg': return scale(linear(n.a, ctx), -1);
      case 'bin': {
        const sign = n.op === '-' ? -1 : 1;
        if ((n.op === '+' || n.op === '-') && isPct(n.r) && !hasUnknown(n.r)) return scale(linear(n.l, ctx), 1 + sign * num(n.r, null, ctx));
        if (n.op === '+' || n.op === '-') return plus(linear(n.l, ctx), linear(n.r, ctx), sign);
        if (n.op === '*') {
          const l = linear(n.l, ctx), r = linear(n.r, ctx);
          if (isConst(l)) return scale(r, l.c);
          if (isConst(r)) return scale(l, r.c);
          throw new NonLin();
        }
        if (n.op === '/' && !hasUnknown(n.r)) {
          const d = num(n.r, null, ctx);
          if (d === 0) throw new MathErr('div0');
          return scale(linear(n.l, ctx), 1 / d);
        }
        throw new NonLin();
      }
    }
    throw new NonLin();
  }

  /* ---------- Polynomials in one unknown: coefficients from x^0 upwards ---------- */
  function polyAdd(a, b, s) { const r = []; for (let i = 0; i < Math.max(a.length, b.length); i++) r[i] = (a[i] || 0) + s * (b[i] || 0); return r; }
  function polyMul(a, b) { const r = new Array(a.length + b.length - 1).fill(0); a.forEach((x, i) => b.forEach((y, j) => { r[i + j] += x * y; })); return r; }
  function poly(n, ctx) {
    if (!hasUnknown(n)) return [num(n, null, ctx)];
    switch (n.t) {
      case 'u': return [0, 1];
      case 'grp': return poly(n.a, ctx);
      case 'neg': return poly(n.a, ctx).map(c => -c);
      case 'bin': {
        const sign = n.op === '-' ? -1 : 1;
        if ((n.op === '+' || n.op === '-') && isPct(n.r) && !hasUnknown(n.r)) return poly(n.l, ctx).map(c => c * (1 + sign * num(n.r, null, ctx)));
        if (n.op === '+' || n.op === '-') return polyAdd(poly(n.l, ctx), poly(n.r, ctx), sign);
        if (n.op === '*') return polyMul(poly(n.l, ctx), poly(n.r, ctx));
        if (n.op === '/' && !hasUnknown(n.r)) {
          const d = num(n.r, null, ctx);
          if (d === 0) throw new MathErr('div0');
          return poly(n.l, ctx).map(c => c / d);
        }
        if (n.op === '^' && !hasUnknown(n.r)) {
          const e = num(n.r, null, ctx);
          if (!Number.isInteger(e) || e < 0 || e > 40) throw new NonLin();
          const b = poly(n.l, ctx);
          let r = [1];
          for (let i = 0; i < e; i++) r = polyMul(r, b);
          return r;
        }
        throw new NonLin();
      }
    }
    throw new NonLin();
  }
  const horner = (c, x) => c.reduceRight((s, a) => s * x + a, 0);
  function bisect(f, a, b, fa) {
    for (let i = 0; i < 300; i++) {
      const m = (a + b) / 2;
      if (m === a || m === b) break;
      const fm = f(m);
      if (fm === 0) return m;
      if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m;
    }
    return (a + b) / 2;
  }
  function dedupe(xs, tol) {
    const out = [];
    xs.slice().sort((a, b) => a - b).forEach(x => { if (!out.length || Math.abs(x - out[out.length - 1]) > tol * Math.max(1, Math.abs(x))) out.push(x); });
    return out;
  }
  /* Real roots: between two neighbouring roots of the derivative (critical points) the polynomial is monotonic,
     so it has at most one root there (bisection); a multiple root is a critical point with value 0. */
  function polyRoots(c) {
    c = c.slice();
    const big = Math.max(...c.map(Math.abs));
    while (c.length > 1 && Math.abs(c[c.length - 1]) <= 1e-13 * big) c.pop();
    const deg = c.length - 1;
    if (deg < 1) return null;
    if (deg === 1) return [-c[0] / c[1]];
    const crit = polyRoots(c.slice(1).map((a, i) => a * (i + 1))) || [];
    const P = x => horner(c, x), size = x => c.reduce((s, a, i) => s + Math.abs(a) * Math.pow(Math.abs(x), i), 0);
    const B = 1 + Math.max(...c.slice(0, -1).map(a => Math.abs(a / c[deg])));
    const roots = crit.filter(x => Math.abs(P(x)) <= 1e-10 * size(x));
    const pts = [-B, ...crit, B];
    for (let i = 0; i + 1 < pts.length; i++) {
      const pa = P(pts[i]), pb = P(pts[i + 1]);
      if (pa * pb < 0) roots.push(bisect(P, pts[i], pts[i + 1], pa));
    }
    return dedupe(roots, 1e-9);
  }
  /* Other equations with one unknown: sign changes and touching points on a grid from −1e9 to 1e9 */
  function searchRoots(f) {
    const F = t => { try { const v = f(t); return Number.isFinite(v) ? v : NaN; } catch (e) { return NaN; } };
    const xs = [];
    for (let i = -400; i <= 400; i++) xs.push(i / 20);
    for (let k = Math.log10(20); k <= 9; k += 0.01) xs.push(Math.pow(10, k), -Math.pow(10, k));
    xs.sort((a, b) => a - b);
    const ys = xs.map(F), roots = [];
    const ok = i => !Number.isNaN(ys[i]);
    // Where f only fades towards 0 (e^x for x → −∞) every value is tiny – no roots there
    const big = i => ok(i) && Math.abs(ys[i]) > 1e-100;
    for (let i = 0; i < xs.length; i++) {
      if (ys[i] === 0) { if (big(i - 1) || big(i + 1)) roots.push(xs[i]); continue; }
      if (i + 1 < xs.length && ok(i) && ok(i + 1) && ys[i] * ys[i + 1] < 0) {
        const r = bisect(F, xs[i], xs[i + 1], ys[i]), fr = F(r);
        // A sign change at a pole (1/x) is no root
        if (Math.abs(fr) <= 1e-6 * (Math.abs(ys[i]) + Math.abs(ys[i + 1]))) roots.push(r);
      }
      if (i > 0 && i + 1 < xs.length && ok(i - 1) && ok(i) && ok(i + 1) && ys[i - 1] * ys[i] > 0 && ys[i] * ys[i + 1] > 0 &&
          Math.abs(ys[i]) < Math.abs(ys[i - 1]) && Math.abs(ys[i]) <= Math.abs(ys[i + 1])) {
        // Touching zero (sin x = 1): the slope changes sign there – bisect the symmetric difference
        const G = t => { const h = 1e-4 * (1 + Math.abs(t)); return F(t + h) - F(t - h); };
        const ga = G(xs[i - 1]), gb = G(xs[i + 1]);
        if (!(ga * gb < 0)) continue;
        const r = bisect(G, xs[i - 1], xs[i + 1], ga);
        const scale = Math.max(Math.abs(ys[i - 1]), Math.abs(ys[i + 1]));
        if (scale > 1e-100 && Math.abs(F(r)) <= 1e-12 * (1 + scale)) roots.push(r);
      }
    }
    return dedupe(roots.map(numeric), 1e-8);
  }

  const round = v => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12)));
  const MAX_SHOWN = 4;

  /* An equation: { kind: 'lin', k, c, labels, order } (k·x + c = 0), { kind: 'roots', name, label, roots, more },
     { kind: 'none' } (cannot be solved here) – or null if the line is no equation */
  // Solving can take a while (numeric search): the pad is evaluated on every key press, so keep the results
  const cache = new Map();
  function parseEquation(src, ctx) {
    const key = [src, ctx.dec, ctx.deg, JSON.stringify(ctx.vars), (ctx.solved || []).join()].join('\u0000');
    if (cache.has(key)) return cache.get(key);
    const r = solveEquation(src, ctx);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    cache.set(key, r);
    return r;
  }
  function solveEquation(src, ctx) {
    const eq = src.indexOf('=');
    if (eq < 0 || src.indexOf('=', eq + 1) >= 0) return null;
    const left = src.slice(0, eq), right = src.slice(eq + 1);
    if (!left.trim() || !right.trim()) return null;
    let A, B, labels = {};
    // Names solved by equations above count as values in calculations, but in a new equation they are unknown
    // again ("x^2 = 4" below "x^3 = 8" is solved on its own); the linear system of the block still has them
    const vars = {};
    for (const n in ctx.vars) if (!(ctx.solved && ctx.solved.includes(n))) vars[n] = ctx.vars[n];
    try {
      const a = tokenize(left, ctx.dec, vars, true), b = tokenize(right, ctx.dec, vars, true);
      if (!a.toks.length || !b.toks.length) return null;
      A = parse(a.toks, ctx); B = parse(b.toks, ctx);
      for (const tk of a.toks.concat(b.toks)) if (tk.t === 'unk' && !labels[tk.name]) labels[tk.name] = tk.label;
    } catch (e) {
      return null;
    }
    const diff = { t: 'bin', op: '-', l: { t: 'grp', a: A }, r: { t: 'grp', a: B } };
    const names = [...unknownNames(diff)];
    if (!names.length) return null;
    try {
      const f = linear(diff, ctx), k = {};
      for (const n in f.k) if (f.k[n] !== 0) k[n] = f.k[n];
      if (!Object.keys(k).length) return { kind: 'none', error: Math.abs(f.c) > 1e-12 ? 'contra' : undefined };
      return { kind: 'lin', k, c: f.c, labels, order: names.filter(n => n in k) };
    } catch (e) {
      if (e instanceof MathErr) return { kind: 'none', error: 'math' };
      if (!(e instanceof NonLin)) return null;
    }
    if (names.length !== 1) return { kind: 'none' };
    const x = names[0];
    let roots;
    try {
      roots = polyRoots(poly(diff, ctx));
      if (!roots) return { kind: 'none' };
      roots = roots.map(round);
    } catch (e) {
      if (e instanceof MathErr) return { kind: 'none', error: 'math' };
      roots = searchRoots(t => num(diff, { [x]: t }, ctx));
    }
    let more = false;
    if (roots.length > MAX_SHOWN) { // periodic: the smallest solutions from 0 upwards (sin x = 0.5 → 30, 150, 390 …)
      roots = roots.filter(r => r >= 0).concat(roots.filter(r => r < 0).reverse()).slice(0, MAX_SHOWN).sort((a, b) => a - b);
      more = true;
    }
    return { kind: 'roots', name: x, label: labels[x] || x, roots, more };
  }

  /* Gauss-Jordan elimination over all linear equations of a block → { values: {name: number}, contra } */
  function solve(eqs, names) {
    const rows = eqs.map(e => names.map(n => e.k[n] || 0).concat(-e.c));
    const n = names.length, pivots = [];
    let r = 0;
    for (let col = 0; col < n && r < rows.length; col++) {
      let best = r;
      for (let i = r + 1; i < rows.length; i++) if (Math.abs(rows[i][col]) > Math.abs(rows[best][col])) best = i;
      const size = Math.max(1, ...rows.map(row => Math.abs(row[col])));
      if (Math.abs(rows[best][col]) < 1e-10 * size) continue;
      [rows[r], rows[best]] = [rows[best], rows[r]];
      const pv = rows[r][col];
      rows[r] = rows[r].map(x => x / pv);
      for (let i = 0; i < rows.length; i++) {
        if (i === r || rows[i][col] === 0) continue;
        const f = rows[i][col];
        rows[i] = rows[i].map((x, j) => x - f * rows[r][j]);
      }
      pivots.push([r, col]);
      r++;
    }
    const zero = x => Math.abs(x) < 1e-9;
    const contra = rows.some(row => row.slice(0, n).every(zero) && !zero(row[n]));
    const values = {};
    if (!contra) {
      for (const [ri, col] of pivots) {
        if (rows[ri].slice(0, n).every((x, j) => j === col || zero(x))) values[names[col]] = round(rows[ri][n]);
      }
    }
    return { values, contra };
  }

  /** One line; ctx = { dec, deg, vars, ans, sum }. Returns { value, plain, single, error, assign } or { equation } */
  function evalLine(line, ctx) {
    let src = line.replace(/⇒.*$/, '');
    const colon = src.indexOf(':');
    if (colon > 0 && new RegExp(`[${L}]`).test(src.slice(0, colon))) src = src.slice(colon + 1);
    let assign = null;
    const a = new RegExp(`^\\s*([${L}_][${L}0-9_]*)\\s*=\\s*(\\S.*)$`).exec(src);
    if (a && !RESERVED.has(a[1].toLowerCase())) {
      // "name = 850" assigns – unless the right side has unknown names: "a = b + 2" is an equation
      const equation = parseEquation(src, ctx);
      if (equation && !(equation.kind === 'lin' && Object.keys(equation.k).every(n => n === a[1].toLowerCase()))) return { equation };
      assign = a[1].toLowerCase(); src = a[2];
    } else if (ctx.equations !== false) {
      const equation = parseEquation(src, ctx);
      if (equation) return { equation };
    }
    const eq = src.indexOf('=');
    if (eq >= 0) src = src.slice(0, eq);
    try {
      const { toks, words } = tokenize(src, ctx.dec, ctx.vars, false);
      if (!toks.length) return { value: null };
      let cont = false;
      if (toks[0].t === 'op') {
        // "+ 20" continues from the last result – but not in text like "- 2 Eier" (a list)
        if (ctx.ans != null && words === 0) { toks.unshift({ t: 'num', v: ctx.ans }); cont = true; }
        else if (toks[0].v !== '-' && toks[0].v !== '+') return { value: null };
      }
      const v = num(parse(toks, ctx), null, ctx);
      const nums = toks.filter(tk => !(tk.t === 'op' && (tk.v === '-' || tk.v === '+')));
      const single = !cont && nums.length === 1 && nums[0].t === 'num' && !nums[0].ref;
      return { value: round(v), plain: single && !assign, single, assign };
    } catch (e) {
      return e instanceof MathErr ? { value: null, error: 'math' } : { value: null };
    }
  }

  function evaluate(text, dec, opts) {
    const ctx = { dec: dec === '.' ? '.' : ',', deg: !(opts && opts.deg === false), vars: {}, ans: null, sum: 0 };
    const fresh = () => ({ eqs: [], lines: [], names: [], labels: {}, solved: [] });
    let block = fresh();
    const out = [];
    const remember = (name, value) => { ctx.vars[name] = value; if (!block.solved.includes(name)) block.solved.push(name); ctx.solved = block.solved; };
    String(text).split('\n').forEach((line, i) => {
      if (!line.trim()) {
        // Solutions of equations only hold in their block: below an empty line the names are unknowns again
        for (const n of block.solved) delete ctx.vars[n];
        ctx.sum = 0; block = fresh(); ctx.solved = block.solved;
        out.push({ value: null }); return;
      }
      const r = evalLine(line, ctx);
      const e = r.equation;
      if (e && e.kind === 'lin') {
        block.eqs.push(e); block.lines.push(i);
        for (const n of e.order) if (!block.names.includes(n)) { block.names.push(n); block.labels[n] = e.labels[n]; }
        out.push({ value: null, eq: true });
        const { values, contra } = solve(block.eqs, block.names);
        // Solutions are shown on the equation lines of the block: one name per line, the rest on the last line
        const found = block.names.filter(n => n in values);
        block.lines.forEach((li, j) => {
          const mine = j === block.lines.length - 1 ? found.slice(j) : found.slice(j, j + 1);
          out[li] = mine.length
            ? { value: values[mine[0]], eq: true, solved: mine.map(n => ({ name: block.labels[n], value: values[n] })) }
            : { value: null, eq: true };
        });
        if (contra) out[i] = { value: null, eq: true, error: 'contra' };
        for (const n of found) remember(n, values[n]);
        return;
      }
      if (e && e.kind === 'roots') {
        if (!e.roots.length) { out.push({ value: null, eq: true, error: 'noreal' }); return; }
        out.push({ value: e.roots[0], eq: true, more: e.more, solved: e.roots.map(v => ({ name: e.label, value: v })) });
        if (e.roots.length === 1) remember(e.name, e.roots[0]);
        return;
      }
      if (e) { out.push({ value: null, eq: true, error: e.error }); return; }
      if (r.value != null) {
        if (r.assign) ctx.vars[r.assign] = r.value;
        ctx.ans = r.value;
        ctx.sum = round(ctx.sum + r.value);
      }
      out.push(r);
    });
    return out;
  }

  /** A single expression (no pad context) – for agents; value null if it is not a calculation */
  function calc(expr, dec, opts) {
    return evalLine(String(expr), { dec: dec === ',' ? ',' : '.', deg: !(opts && opts.deg === false), vars: {}, ans: null, sum: 0, equations: false });
  }

  /** Display: grouped digits; copy: no grouping (pastes into other apps and forms) */
  function format(v, locale, grouping) {
    const a = Math.abs(v);
    const dec = (1.5).toLocaleString(locale).charAt(1);
    if (v !== 0 && (a >= 1e15 || a < 1e-7)) return v.toExponential(8).replace(/\.?0+e/, 'e').replace('.', dec).replace('e+', 'e');
    return v.toLocaleString(locale, { maximumFractionDigits: 10, useGrouping: grouping !== false });
  }

  root.CalcEngine = { evaluate, calc, format, parseNumber };
})(typeof window !== 'undefined' ? window : globalThis);
