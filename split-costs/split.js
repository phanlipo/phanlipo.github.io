/* Kosten teilen – data format and arithmetic without DOM (window.SplitCosts). Architecture: README.md.
   All amounts are whole cents, so sums never drift.

   Stored object (localStorage "split-costs.group.v1"):
     { currency: '€',
       people:  [{ id, name }],                     order = order in every list and for the extra cents
       entries: [{ id, kind: 'expense'|'transfer', title, amount, payer: personId, date: 'YYYY-MM-DD',
                   split: 'equal', with: [personId]        even split among these people
                   split: 'exact', parts: { personId: cents } shares typed in, they add up to amount }] }
   A transfer ("money given") is stored like an exact expense: payer gave the money, parts holds the one
   receiver with the full amount. So one formula covers both: balance = paid − share. */
(function () {
  'use strict';
  const MAX_AMOUNT = 100000000; // 1,000,000.00
  // 'YYYY-MM-DD' of a real calendar day (no 2026-02-30); checked in UTC, so the time zone does not matter
  const isDate = s => {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [y, m, d] = s.split('-').map(Number), x = new Date(Date.UTC(y, m - 1, d));
    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
  };
  const isCents = v => Number.isInteger(v) && v > 0 && v <= MAX_AMOUNT;

  // An entry from storage or a backup, or null if it cannot be used (unknown person, sums off …)
  function normalizeEntry(e, ids) {
    if (!e || typeof e !== 'object' || !isCents(e.amount) || !ids.has(e.payer)) return null;
    const kind = e.kind === 'transfer' ? 'transfer' : 'expense';
    const out = {
      id: typeof e.id === 'string' && e.id ? e.id : 'e' + Math.random().toString(36).slice(2),
      kind, title: kind === 'expense' ? String(e.title || '').slice(0, 40) : '',
      amount: e.amount, payer: e.payer, date: isDate(e.date) ? e.date : '1970-01-01',
    };
    if (kind === 'expense' && e.split === 'equal') {
      const w = [...new Set(Array.isArray(e.with) ? e.with : [])].filter(id => ids.has(id));
      if (!w.length) return null;
      return Object.assign(out, { split: 'equal', with: w });
    }
    const parts = {};
    let sum = 0;
    for (const [k, v] of Object.entries(e.parts && typeof e.parts === 'object' ? e.parts : {})) {
      if (ids.has(k) && Number.isInteger(v) && v > 0) { parts[k] = v; sum += v; }
    }
    if (sum !== e.amount) return null;
    if (kind === 'transfer' && (Object.keys(parts).length !== 1 || parts[e.payer])) return null;
    return Object.assign(out, { split: 'exact', parts });
  }

  function normalize(raw) {
    const o = raw && typeof raw === 'object' ? raw : {};
    const seen = new Set();
    const people = (Array.isArray(o.people) ? o.people : [])
      .filter(p => p && typeof p.id === 'string' && typeof p.name === 'string' && p.name.trim() && !seen.has(p.id) && seen.add(p.id))
      .map(p => ({ id: p.id, name: p.name.slice(0, 30) }));
    const ids = new Set(people.map(p => p.id));
    const entries = (Array.isArray(o.entries) ? o.entries : []).map(e => normalizeEntry(e, ids)).filter(Boolean);
    const currency = typeof o.currency === 'string' && o.currency.trim() ? o.currency.trim().slice(0, 4) : '€';
    return { currency, people, entries };
  }

  // Share of each person in one entry, in cents: { personId: cents } (only people with a share).
  // Even split: everyone gets the rounded-down part, the cents left over go one each to the first
  // people in group order – so the shares always add up to the amount.
  function shares(e, people) {
    if (e.split !== 'equal') return Object.assign({}, e.parts);
    const order = people.map(p => p.id).filter(id => e.with.includes(id));
    const n = order.length, out = {};
    if (!n) return out;
    const base = Math.floor(e.amount / n);
    let rest = e.amount - base * n;
    for (const id of order) { out[id] = base + (rest > 0 ? 1 : 0); if (rest > 0) rest--; }
    return out;
  }

  // Per person: paid and share for expenses, plus money given and received; balance > 0 = gets money back
  function accounts(data) {
    const acc = {};
    for (const p of data.people) acc[p.id] = { paid: 0, share: 0, given: 0, received: 0, balance: 0 };
    for (const e of data.entries) {
      const sh = shares(e, data.people);
      if (e.kind === 'transfer') {
        acc[e.payer].given += e.amount;
        for (const [id, c] of Object.entries(sh)) acc[id].received += c;
      } else {
        acc[e.payer].paid += e.amount;
        for (const [id, c] of Object.entries(sh)) acc[id].share += c;
      }
    }
    for (const a of Object.values(acc)) a.balance = a.paid + a.given - a.share - a.received;
    return acc;
  }

  const totalSpent = data => data.entries.reduce((s, e) => s + (e.kind === 'expense' ? e.amount : 0), 0);

  // Who pays whom: the largest debt goes to the largest credit until both are used up. That needs at most
  // (people − 1) transfers; ties keep the group order, so the suggestion stays the same on every render.
  function settle(data) {
    const acc = accounts(data), idx = new Map(data.people.map((p, i) => [p.id, i]));
    const byIdx = (a, b) => idx.get(a.id) - idx.get(b.id);
    const debt = data.people.map(p => ({ id: p.id, c: -acc[p.id].balance })).filter(x => x.c > 0).sort((a, b) => b.c - a.c || byIdx(a, b));
    const cred = data.people.map(p => ({ id: p.id, c: acc[p.id].balance })).filter(x => x.c > 0).sort((a, b) => b.c - a.c || byIdx(a, b));
    const out = [];
    let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const c = Math.min(debt[i].c, cred[j].c);
      out.push({ from: debt[i].id, to: cred[j].id, amount: c });
      debt[i].c -= c; cred[j].c -= c;
      if (!debt[i].c) i++;
      if (!cred[j].c) j++;
    }
    return out;
  }

  const involved = (data, id) => data.entries.some(e => e.payer === id || (e.split === 'equal' ? e.with.includes(id) : e.parts[id]));

  window.SplitCosts = { MAX_AMOUNT, isDate, normalize, normalizeEntry, shares, accounts, totalSpent, settle, involved };
})();
