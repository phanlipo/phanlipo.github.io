/* Rechenzettel – calculation engine without DOM.
   CalcEngine.evaluate(text, dec) → one entry per line: { value, plain, single, assign, error, solved, eq }
     dec       decimal separator of the UI language: ',' (German) or '.' (English)
     value     result of the line (null = text line or not a complete calculation yet)
     plain     the line is only a single number (shown muted, still counts for sum/ans)
     single    only a single number, also for "name = 850" (copying the pad adds no "= result" there)
     error     'math' for division by zero, root of a negative number, overflow;
               'contra' for a system of equations without solution
     eq        the line is an equation (does not count for sum/ans)
     solved    [{ name, value }] unknowns solved on this line (value = the first of them)
   Rules (also in the help of index.html):
     - Words and symbols that are not part of a calculation are ignored ("Miete 850 + Strom 120" → 970).
       Two numbers next to each other without an operator are no calculation (dates, phone numbers …).
     - "Label: 20 + 5" – text before a colon is a label.
     - A line that starts with an operator continues from the last result ("+ 20", "× 2").
     - ans/erg = last result, sum/summe = sum of the results above, up to an empty line.
     - name = expression defines a variable for the lines below.
     - "200 + 10%" adds 10 % of 200; elsewhere 10% is 0.1.
     - Text after "=" is ignored ("850 + 120 = 970" can be pasted back), text after "⇒" too.
     - Linear equations with unknown names ("3a = 15", "3*b + 2*c = 0") are solved; the equations of a block
       (up to an empty line) form one system. Solved names can be used below like variables – up to the next
       empty line, then they are unknowns again (the next block can solve for x again).
       A number directly before a name multiplies it ("3a"); with a space between it is text ("850 Miete"). */
(function (root) {
  'use strict';
  const OPS = { '+': '+', '-': '-', '−': '-', '–': '-', '*': '*', '×': '*', '·': '*', '/': '/', '÷': '/', '^': '^' };
  const L = 'A-Za-zÀ-ÖØ-öø-ÿ';
  const WORD = new RegExp(`^[${L}_][${L}0-9_]*`);
  const RESERVED = new Set(['ans', 'erg', 'sum', 'summe', 'sqrt', 'wurzel', 'pi']);

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

  /* Tokens. unknowns: names that are no variable become unknowns (equations) instead of being skipped as text;
     other symbols then make the line no equation. */
  function tokenize(src, dec, vars, unknowns) {
    const toks = [];
    let words = 0;
    for (let i = 0; i < src.length;) {
      const c = src[i], rest = src.slice(i);
      let m;
      if (/\s/.test(c)) { i++; continue; }
      if ((m = /^\d+(?:[.,]\d+)*/.exec(rest)) || (m = /^[.,]\d+/.exec(rest))) {
        let s = m[0];
        if (/^[.,]/.test(s)) s = '0' + s;
        const v = parseNumber(s, dec);
        if (Number.isNaN(v)) throw new Syntax('number');
        toks.push({ t: 'num', v });
        i += m[0].length; continue;
      }
      if (c in OPS) { toks.push({ t: 'op', v: OPS[c] }); i++; continue; }
      if (c === '(' || c === ')' || c === '%') { toks.push({ t: c }); i++; continue; }
      if (c === '√') { toks.push({ t: 'fn' }); i++; continue; }
      if (c === 'π') { toks.push({ t: 'num', v: Math.PI, ref: true, tight: i > 0 && !/\s/.test(src[i - 1]) }); i++; continue; }
      if ((m = WORD.exec(rest))) {
        const w = m[0].toLowerCase(), last = toks[toks.length - 1];
        const tight = i > 0 && !/\s/.test(src[i - 1]);
        i += m[0].length;
        // "3 x 4": x between a number and a number/bracket multiplies
        if (w === 'x' && last && (last.t === 'num' || last.t === ')') && /^\s*[\d(.,]/.test(src.slice(i))) toks.push({ t: 'op', v: '*' });
        else if (Object.prototype.hasOwnProperty.call(vars, w)) toks.push({ t: 'num', v: vars[w], ref: true, tight });
        else if (w === 'ans' || w === 'erg') toks.push({ t: 'ans' });
        else if (w === 'sum' || w === 'summe') toks.push({ t: 'sum' });
        else if (w === 'sqrt' || w === 'wurzel') toks.push({ t: 'fn' });
        else if (w === 'pi') toks.push({ t: 'num', v: Math.PI, ref: true, tight });
        else if (unknowns) toks.push({ t: 'unk', name: w, label: m[0], tight });
        else words++;
        continue;
      }
      if (unknowns) throw new Syntax('symbol');
      i++; // other symbols (€, $, :, ! …) are text
    }
    return { toks, words };
  }

  /* Values are linear forms c + Σ k[name]·name, so equations can be solved; plain calculations have no names. */
  const lin = (c, k) => ({ c, k: k || {}, pct: false });
  const isConst = a => !Object.keys(a.k).length;
  const scale = (a, f) => { const k = {}; for (const n in a.k) k[n] = a.k[n] * f; return lin(a.c * f, k); };
  function plus(a, b, sign) {
    const k = Object.assign({}, a.k);
    for (const n in b.k) k[n] = (k[n] || 0) + sign * b.k[n];
    return lin(a.c + sign * b.c, k);
  }
  function konst(a) { if (!isConst(a)) throw new Syntax('nonlinear'); return a.c; }

  function parse(toks, ctx) {
    let p = 0;
    const peek = () => toks[p];
    const isOp = v => peek() && peek().t === 'op' && peek().v === v;
    function primary() {
      const tk = toks[p++];
      if (!tk) throw new Syntax('end');
      if (tk.t === 'num') return lin(tk.v);
      if (tk.t === 'unk') { const o = {}; o[tk.name] = 1; return lin(0, o); }
      if (tk.t === 'ans') { if (ctx.ans == null) throw new Syntax('ans'); return lin(ctx.ans); }
      if (tk.t === 'sum') return lin(ctx.sum);
      if (tk.t === 'fn') {
        const a = konst(unary());
        if (a < 0) throw new MathErr('sqrt');
        return lin(Math.sqrt(a));
      }
      if (tk.t === '(') {
        const v = add();
        if (peek() && peek().t === ')') p++;
        else if (peek()) throw new Syntax(')');
        return lin(v.c, v.k); // a missing ")" at the end is closed automatically
      }
      throw new Syntax('token');
    }
    function postfix() {
      let r = primary();
      while (peek() && peek().t === '%') { p++; r = scale(r, 1 / 100); r.pct = true; }
      return r;
    }
    function pow() {
      const b = postfix();
      if (isOp('^')) { p++; const e = konst(unary()); return lin(Math.pow(konst(b), e)); }
      return b;
    }
    function unary() {
      if (isOp('-')) { p++; const r = unary(); const n = scale(r, -1); n.pct = r.pct; return n; }
      if (isOp('+')) { p++; return unary(); }
      return pow();
    }
    // Implicit multiplication only before brackets, roots, ans and sum ("2(3+4)", "2√9") and before a name
    // written right after the number ("3a", "2pi") – never between two plain numbers or with a space before a
    // name ("850 Miete"), so dates, lists and notes stay text
    const implicit = () => {
      const tk = peek();
      return tk && (tk.t === '(' || tk.t === 'fn' || tk.t === 'ans' || tk.t === 'sum' || ((tk.t === 'num' && tk.ref) || tk.t === 'unk') && tk.tight);
    };
    function times(l, r) {
      if (isConst(l)) return scale(r, l.c);
      if (isConst(r)) return scale(l, r.c);
      throw new Syntax('nonlinear');
    }
    function mul() {
      let l = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) {
          const op = toks[p++].v, r = unary();
          if (op === '*') l = times(l, r);
          else { const d = konst(r); if (d === 0) throw new MathErr('div0'); l = scale(l, 1 / d); }
        } else if (implicit()) {
          if (peek().t === 'unk' && !(isConst(l) && toks[p - 1].t === 'num')) throw new Syntax('implicit');
          l = times(l, unary());
        } else return l;
      }
    }
    function add() {
      let l = mul();
      while (isOp('+') || isOp('-')) {
        const sign = toks[p++].v === '+' ? 1 : -1, r = mul();
        // 200 + 10% = 220
        l = r.pct && isConst(r) && isConst(l) ? lin(l.c + sign * l.c * r.c) : plus(l, r, sign);
      }
      return l;
    }
    const r = add();
    if (p < toks.length) throw new Syntax('rest');
    return r;
  }

  const round = v => (Math.abs(v) < 1e-12 ? 0 : Number(v.toPrecision(12)));

  /* "3a + 2 = 8" → { k: { a: 3 }, c: -6, labels } (k·x + c = 0), or null if the line is no linear equation */
  function parseEquation(src, ctx) {
    const eq = src.indexOf('=');
    if (eq < 0 || src.indexOf('=', eq + 1) >= 0) return null;
    const left = src.slice(0, eq), right = src.slice(eq + 1);
    if (!left.trim() || !right.trim()) return null;
    try {
      const a = tokenize(left, ctx.dec, ctx.vars, true), b = tokenize(right, ctx.dec, ctx.vars, true);
      if (!a.toks.length || !b.toks.length) return null;
      const f = plus(parse(a.toks, ctx), parse(b.toks, ctx), -1);
      const k = {};
      for (const n in f.k) if (f.k[n] !== 0) k[n] = f.k[n];
      if (!Object.keys(k).length) return null;
      const labels = {};
      for (const tk of a.toks.concat(b.toks)) if (tk.t === 'unk' && !labels[tk.name]) labels[tk.name] = tk.label;
      return { k, c: f.c, labels, order: Object.keys(labels) };
    } catch (e) {
      return null;
    }
  }

  /* Gauss-Jordan elimination over all equations of a block → { values: {name: number}, contra } */
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
        if (row_free(rows[ri], col, n, zero)) values[names[col]] = round(rows[ri][n]);
      }
    }
    return { values, contra };
  }
  function row_free(row, col, n, zero) {
    for (let j = 0; j < n; j++) if (j !== col && !zero(row[j])) return false;
    return true;
  }

  /** One line; ctx = { dec, vars, ans, sum }. Returns { value, plain, single, error, assign } or { equation } */
  function evalLine(line, ctx) {
    let src = line.replace(/⇒.*$/, '');
    const colon = src.indexOf(':');
    if (colon > 0 && new RegExp(`[${L}]`).test(src.slice(0, colon))) src = src.slice(colon + 1);
    let assign = null;
    const a = new RegExp(`^\\s*([${L}_][${L}0-9_]*)\\s*=\\s*(\\S.*)$`).exec(src);
    if (a && !RESERVED.has(a[1].toLowerCase())) {
      // "name = 850" assigns – unless the right side has unknown names: "a = b + 2" is an equation
      const equation = parseEquation(src, ctx);
      if (equation && Object.keys(equation.k).some(n => n !== a[1].toLowerCase())) return { equation };
      assign = a[1].toLowerCase(); src = a[2];
    } else {
      const equation = ctx.equations === false ? null : parseEquation(src, ctx);
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
      const v = konst(parse(toks, ctx));
      if (!Number.isFinite(v)) return { value: null, error: 'math' };
      const nums = toks.filter(tk => !(tk.t === 'op' && (tk.v === '-' || tk.v === '+')));
      const single = !cont && nums.length === 1 && nums[0].t === 'num' && !nums[0].ref;
      return { value: round(v), plain: single && !assign, single, assign };
    } catch (e) {
      return e instanceof MathErr ? { value: null, error: 'math' } : { value: null };
    }
  }

  function evaluate(text, dec) {
    const ctx = { dec: dec === '.' ? '.' : ',', vars: {}, ans: null, sum: 0 };
    let block = { eqs: [], lines: [], names: [], labels: {}, solved: [] };
    const out = [];
    String(text).split('\n').forEach((line, i) => {
      if (!line.trim()) {
        // Solutions of equations only hold in their block: below an empty line the names are unknowns again
        for (const n of block.names) if (block.solved.includes(n)) delete ctx.vars[n];
        ctx.sum = 0; block = { eqs: [], lines: [], names: [], labels: {}, solved: [] };
        out.push({ value: null }); return;
      }
      const r = evalLine(line, ctx);
      if (r.equation) {
        const e = r.equation;
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
        for (const n of found) { ctx.vars[n] = values[n]; if (!block.solved.includes(n)) block.solved.push(n); }
        return;
      }
      if (r.value != null) {
        if (r.assign) ctx.vars[r.assign] = r.value;
        ctx.ans = r.value;
        ctx.sum = round(ctx.sum + r.value);
      }
      out.push(r);
    });
    return out;
  }

  /** A single expression (no pad context) – for agents; null if it is not a calculation */
  function calc(expr, dec) {
    return evalLine(String(expr), { dec: dec === ',' ? ',' : '.', vars: {}, ans: null, sum: 0, equations: false });
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
