/* Finanzrechner – the arithmetic without DOM (window.Finance). Architecture: finance-calculator/README.md.
   All rates are passed as percent (5 = 5 %), results are plain numbers (no rounding – the page formats them).
   Functions return { error: 'code' } for impossible input; the page translates the code. */
(function (root) {
  'use strict';

  const EPS = 1e-12;
  const fin = x => typeof x === 'number' && Number.isFinite(x);
  // ((1+i)^n − 1) / i, with the limit n for i → 0
  const growthSum = (i, n) => Math.abs(i) < EPS ? n : (Math.pow(1 + i, n) - 1) / i;

  /** Finds a root of f in [lo, hi]: scans the interval for sign changes, then bisects. Returns all roots found
      (at most max), sorted by distance to `prefer`. */
  function roots(f, lo, hi, { steps = 2000, prefer = 0, max = 5, log = false } = {}) {
    const xs = [];
    for (let k = 0; k <= steps; k++) {
      const u = k / steps;
      // log: denser near lo (rates from −99.99 % up to large values)
      xs.push(log ? lo + (hi - lo) * (Math.exp(u * Math.log(1 + 1000)) - 1) / 1000 : lo + (hi - lo) * u);
    }
    const found = [];
    let x0 = xs[0], f0 = f(x0);
    for (let k = 1; k < xs.length && found.length < max; k++) {
      const x1 = xs[k], f1 = f(x1);
      if (!fin(f0) || !fin(f1)) { x0 = x1; f0 = f1; continue; }
      if (f0 === 0) found.push(x0);
      else if (f0 * f1 < 0) {
        let a = x0, b = x1, fa = f0;
        for (let it = 0; it < 200; it++) {
          const m = (a + b) / 2, fm = f(m);
          if (fm === 0 || (b - a) / 2 < 1e-15 * Math.max(1, Math.abs(m))) { a = b = m; break; }
          if (fa * fm < 0) b = m; else { a = m; fa = fm; }
        }
        found.push((a + b) / 2);
      }
      x0 = x1; f0 = f1;
    }
    return found.sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer));
  }

  /* ---------- Time value of money (TVM, like the worksheet of a business calculator) ----------
     Sign convention: money you receive is positive, money you pay is negative.
     v = { n, iy, pv, pmt, fv, py, cy, bgn }  iy = nominal rate per year in %, py/cy = payments/compounding per year.
     Balance equation: pv·(1+i)^n + pmt·(1+i·k)·((1+i)^n − 1)/i + fv = 0, k = 1 for payments at the start. */
  const periodRate = (iy, py, cy) => Math.pow(1 + iy / 100 / cy, cy / py) - 1;
  const yearRate = (i, py, cy) => 100 * cy * (Math.pow(1 + i, py / cy) - 1);

  function tvmCheck(v, solveFor) {
    for (const k of ['n', 'iy', 'pv', 'pmt', 'fv']) if (k !== solveFor && !fin(v[k])) return 'missing';
    if (!(v.py > 0) || !(v.cy > 0)) return 'py';
    if (solveFor !== 'n' && !(v.n > 0)) return 'n';
    if (solveFor !== 'iy' && !(v.iy > -100 * v.cy)) return 'rate';
    return null;
  }

  function tvmSolve(v, solveFor) {
    const err = tvmCheck(v, solveFor);
    if (err) return { error: err };
    const k = v.bgn ? 1 : 0;
    let x;
    if (solveFor === 'iy') {
      const f = i => v.pv * Math.pow(1 + i, v.n) + v.pmt * (1 + i * k) * growthSum(i, v.n) + v.fv;
      const r = roots(f, -0.9999, 10, { log: true, steps: 4000 });
      if (!r.length) return { error: 'noRate' };
      x = yearRate(r[0], v.py, v.cy);
    } else {
      const i = periodRate(v.iy, v.py, v.cy);
      if (solveFor === 'fv') x = -(v.pv * Math.pow(1 + i, v.n) + v.pmt * (1 + i * k) * growthSum(i, v.n));
      else if (solveFor === 'pv') x = -(v.fv + v.pmt * (1 + i * k) * growthSum(i, v.n)) / Math.pow(1 + i, v.n);
      else if (solveFor === 'pmt') x = -(v.pv * Math.pow(1 + i, v.n) + v.fv) / ((1 + i * k) * growthSum(i, v.n));
      else if (solveFor === 'n') {
        if (Math.abs(i) < EPS) x = v.pmt ? -(v.pv + v.fv) / v.pmt : NaN;
        else {
          const a = v.pmt * (1 + i * k) / i;
          x = Math.log((a - v.fv) / (v.pv + a)) / Math.log(1 + i);
        }
        if (!(x > 0)) return { error: 'noN' };
      } else return { error: 'missing' };
    }
    return fin(x) ? { value: x } : { error: solveFor === 'n' ? 'noN' : 'missing' };
  }

  /** Balance after p periods (same sign as pv) and principal/interest for periods p1…p2 */
  function tvmAmort(v, p1, p2) {
    const i = periodRate(v.iy, v.py, v.cy), k = v.bgn ? 1 : 0;
    const bal = p => v.pv * Math.pow(1 + i, p) + v.pmt * (1 + i * k) * growthSum(i, p);
    const prn = bal(p2) - bal(p1 - 1);
    return { bal: bal(p2), prn, int: (p2 - p1 + 1) * v.pmt - prn };
  }

  /* ---------- Savings plan (stocks, funds, savings account) ----------
     p = { start, rate, ret, years, dyn, cost, infl, begin }  rate per month; ret/dyn/cost/infl in % per year.
     Monthly compounding with the conforming monthly rate (1 + r)^(1/12) − 1 of the net return r = ret − cost.
     The monthly rate rises by dyn % every 12 months. */
  function savingsRun(p, months) {
    const q = Math.pow(1 + (p.ret - p.cost) / 100, 1 / 12) - 1;
    let cap = p.start, paid = p.start, rate = p.rate, yearPaid = 0, yearStart = p.start;
    const years = [];
    for (let t = 1; t <= months; t++) {
      if (t > 1 && (t - 1) % 12 === 0) rate *= 1 + p.dyn / 100;
      if (p.begin) { cap += rate; cap *= 1 + q; } else { cap *= 1 + q; cap += rate; }
      paid += rate; yearPaid += rate;
      if (t % 12 === 0 || t === months) {
        years.push({ year: Math.ceil(t / 12), paid: yearPaid, gain: cap - yearStart - yearPaid, capital: cap, totalPaid: paid });
        yearPaid = 0; yearStart = cap;
      }
    }
    return { capital: cap, paid, gain: cap - paid, years, lastRate: rate };
  }

  function savingsCheck(p) {
    for (const k of ['start', 'ret', 'dyn', 'cost', 'infl']) if (!fin(p[k])) return 'missing';
    if (p.start < 0) return 'negative';
    if (p.ret - p.cost <= -100 || p.infl <= -100 || p.dyn <= -100) return 'rate';
    return null;
  }

  /** mode 'end': end capital; 'rate': monthly rate for target; 'years': time until target */
  function savings(p, mode = 'end') {
    let err = savingsCheck(p);
    if (err) return { error: err };
    const out = { mode };
    if (mode === 'years') {
      if (!fin(p.rate) || p.rate < 0) return { error: 'missing' };
      if (!(p.target > 0)) return { error: 'target' };
      if (p.start >= p.target) return { error: 'reached' };
      let months = 0, cap = p.start;
      const q = Math.pow(1 + (p.ret - p.cost) / 100, 1 / 12) - 1;
      let rate = p.rate;
      while (cap < p.target && months < 1200) {
        months++;
        if (months > 1 && (months - 1) % 12 === 0) rate *= 1 + p.dyn / 100;
        if (p.begin) { cap += rate; cap *= 1 + q; } else { cap *= 1 + q; cap += rate; }
      }
      if (cap < p.target) return { error: 'never' };
      out.months = months;
      Object.assign(out, savingsRun(p, months));
    } else {
      if (!(p.years > 0) || p.years > 100) return { error: 'years' };
      const months = Math.round(p.years * 12);
      out.months = months;
      if (mode === 'rate') {
        if (!(p.target > 0)) return { error: 'target' };
        const base = savingsRun(Object.assign({}, p, { rate: 0 }), months).capital;
        const unit = savingsRun(Object.assign({}, p, { start: 0, rate: 1 }), months).capital;
        if (base >= p.target) return { error: 'reached' };
        out.rate = (p.target - base) / unit;
        Object.assign(out, savingsRun(Object.assign({}, p, { rate: out.rate }), months));
      } else {
        if (!fin(p.rate) || p.rate < 0) return { error: 'missing' };
        Object.assign(out, savingsRun(p, months));
      }
    }
    out.real = out.capital / Math.pow(1 + p.infl / 100, out.months / 12);
    return out;
  }

  /* ---------- Annuity loan (Annuitätendarlehen) ----------
     l = { amount, rate, mode, tilgung, payment, years, fixed, extra }  rate/tilgung in % per year.
     Monthly payments, monthly interest rate/12 on the remaining debt; extra = special repayment at the end
     of every year (12th, 24th … payment); fixed = years of the fixed interest period (remaining debt after it). */
  function loan(l) {
    if (!(l.amount > 0)) return { error: 'amount' };
    if (!fin(l.rate) || l.rate < 0) return { error: 'rate' };
    const i = l.rate / 100 / 12;
    let pay;
    if (l.mode === 'payment') pay = l.payment;
    else if (l.mode === 'years') {
      if (!(l.years > 0) || l.years > 100) return { error: 'years' };
      const n = Math.round(l.years * 12);
      pay = l.amount / growthSum(i, n) * Math.pow(1 + i, n);
      if (Math.abs(i) < EPS) pay = l.amount / n;
    } else {
      if (!(l.tilgung > 0)) return { error: 'tilgung' };
      pay = l.amount * (l.rate + l.tilgung) / 100 / 12;
    }
    if (!(pay > 0)) return { error: 'payment' };
    if (pay <= l.amount * i + 1e-6 && !(l.extra > 0)) return { error: 'tooLow' };
    const extra = l.extra > 0 ? l.extra : 0, fixed = l.fixed > 0 ? Math.round(l.fixed * 12) : 0;
    let bal = l.amount, t = 0, interest = 0, paid = 0, extras = 0;
    let row = { year: 1, interest: 0, principal: 0, extra: 0, paid: 0, balance: 0 };
    const years = [];
    let atFixed = null;
    while (bal > 1e-6 && t < 1200) {
      t++;
      const zi = bal * i, p = Math.min(pay, bal + zi);
      bal += zi - p; interest += zi; paid += p;
      row.interest += zi; row.principal += p - zi; row.paid += p;
      if (t % 12 === 0 && extra && bal > 1e-6) {
        const s = Math.min(extra, bal);
        bal -= s; extras += s; paid += s; row.extra += s; row.paid += s;
      }
      if (t === fixed) atFixed = { balance: Math.max(bal, 0), interest, paid };
      if (t % 12 === 0 || bal <= 1e-6) {
        row.balance = Math.max(bal, 0); years.push(row);
        row = { year: years.length + 1, interest: 0, principal: 0, extra: 0, paid: 0, balance: 0 };
      }
    }
    if (bal > 1e-6) return { error: 'tooLong' };
    if (fixed && !atFixed) atFixed = { balance: 0, interest, paid };
    return {
      payment: pay, months: t, interest, paid, extras, years, atFixed,
      effective: (Math.pow(1 + i, 12) - 1) * 100,
      firstTilgung: (pay - l.amount * i) * 12 / l.amount * 100,
    };
  }

  /* ---------- Cash flows: NPV, IRR, NFV, payback ----------
     cf0 = flow now, rows = [{ cf, n }] (n = how many periods in a row with this flow), rate in % per period. */
  function expand(cf0, rows) {
    const flows = [cf0];
    for (const r of rows) for (let k = 0; k < r.n; k++) flows.push(r.cf);
    return flows;
  }
  const npvOf = (flows, r) => flows.reduce((s, c, t) => s + c / Math.pow(1 + r, t), 0);

  function payback(flows, r) {
    let cum = 0;
    for (let t = 0; t < flows.length; t++) {
      const c = flows[t] / Math.pow(1 + r, t), before = cum;
      cum += c;
      if (t > 0 && before < 0 && cum >= 0) return t - 1 + (-before) / c;
    }
    return null;
  }

  function cashflows(cf0, rows, rate) {
    if (!fin(cf0) || rows.some(r => !fin(r.cf) || !(r.n >= 1) || r.n > 999 || Math.round(r.n) !== r.n)) return { error: 'missing' };
    if (!rows.length) return { error: 'rows' };
    const flows = expand(cf0, rows);
    if (flows.length > 5000) return { error: 'rows' };
    const out = { periods: flows.length - 1 };
    const pos = flows.some(c => c > 0), neg = flows.some(c => c < 0);
    if (pos && neg) {
      const all = roots(r => npvOf(flows, r), -0.9999, 10, { log: true, steps: 4000, max: 4 });
      out.irr = all.length ? all[0] * 100 : null;
      out.irrCount = all.length;
    } else { out.irr = null; out.irrCount = 0; }
    if (fin(rate)) {
      if (rate <= -100) return { error: 'rate' };
      const r = rate / 100;
      out.npv = npvOf(flows, r);
      out.nfv = out.npv * Math.pow(1 + r, out.periods);
      out.dpb = payback(flows, r);
    }
    out.pb = payback(flows, 0);
    return out;
  }

  /* ---------- Small worksheets ---------- */
  /** Nominal rate with c compounding periods per year ↔ effective annual rate (both in %) */
  const effective = (nom, c) => (Math.pow(1 + nom / 100 / c, c) - 1) * 100;
  const nominal = (eff, c) => (Math.pow(1 + eff / 100, 1 / c) - 1) * c * 100;
  /** Years until money doubles at an effective rate in % */
  const doubling = eff => eff > 0 ? Math.log(2) / Math.log(1 + eff / 100) : null;

  /** Percent change and the yearly rate (CAGR) over a number of years */
  function change(oldV, newV, years) {
    if (!fin(oldV) || !fin(newV) || oldV === 0) return { error: 'missing' };
    const out = { diff: newV - oldV, pct: (newV - oldV) / Math.abs(oldV) * 100 };
    if (years > 0 && oldV > 0 && newV >= 0) out.cagr = (Math.pow(newV / oldV, 1 / years) - 1) * 100;
    return out;
  }

  /** Profit, margin (on the price) and markup (on the cost) */
  function profit(cost, price) {
    if (!fin(cost) || !fin(price)) return { error: 'missing' };
    const g = price - cost;
    return { profit: g, margin: price ? g / price * 100 : null, markup: cost ? g / cost * 100 : null };
  }

  /** Break-even quantity: fixed + target profit covered by the contribution per unit */
  function breakEven(fixed, varCost, price, target = 0) {
    if (!fin(fixed) || !fin(varCost) || !fin(price)) return { error: 'missing' };
    const unit = price - varCost;
    if (!(unit > 0)) return { error: 'contribution' };
    const q = (fixed + (fin(target) ? target : 0)) / unit;
    return { quantity: q, revenue: q * price, contribution: unit, ratio: unit / price * 100 };
  }

  /** Depreciation per year. method 'sl' straight-line, 'db' declining balance (dbRate % of the book value,
      switching to straight-line on the rest as soon as that is more), 'syd' sum of the years' digits */
  function depreciation(cost, salvage, life, method, dbRate) {
    if (!(cost > 0) || !fin(salvage) || salvage < 0 || salvage >= cost) return { error: 'missing' };
    if (!(life >= 1) || life > 100 || Math.round(life) !== life) return { error: 'life' };
    if (method === 'db' && !(dbRate > 0 && dbRate < 100)) return { error: 'dbRate' };
    const rows = [];
    let book = cost, total = cost - salvage;
    const sum = life * (life + 1) / 2;
    let switched = null;
    for (let y = 1; y <= life; y++) {
      let d;
      if (method === 'sl') d = total / life;
      else if (method === 'syd') d = total * (life - y + 1) / sum;
      else {
        const declining = book * dbRate / 100, straight = (book - salvage) / (life - y + 1);
        if (switched == null && straight > declining) switched = y;
        d = switched != null ? straight : declining;
      }
      d = Math.min(d, book - salvage);
      book -= d;
      rows.push({ year: y, dep: d, book });
    }
    return { rows, switched };
  }

  /** Days between two dates 'YYYY-MM-DD': actual days and 30E/360 (German interest method) */
  function days(a, b) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/;
    const pa = m.exec(a || ''), pb = m.exec(b || '');
    if (!pa || !pb) return { error: 'missing' };
    const [y1, m1, d1] = pa.slice(1).map(Number), [y2, m2, d2] = pb.slice(1).map(Number);
    const act = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
    const e360 = (y2 - y1) * 360 + (m2 - m1) * 30 + (Math.min(d2, 30) - Math.min(d1, 30));
    return { act, e360, years: act / 365.25 };
  }

  root.Finance = {
    roots, periodRate, yearRate, tvmSolve, tvmAmort, savings, loan, cashflows, expand, npvOf,
    effective, nominal, doubling, change, profit, breakEven, depreciation, days,
  };
})(typeof window !== 'undefined' ? window : globalThis);
