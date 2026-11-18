/* Reihengeschäft – the VAT assessment without DOM (window.Chain). Architecture: chain-transaction/README.md.
   evaluate() takes the case (countries, VAT IDs, who transports, who clears customs) and returns plain facts:
   which supply is the moved one, where each supply takes place, how it is treated, whether the triangulation
   simplification applies and where each company has to register. All texts (German/English) are built on the
   page from these facts, so this file holds no wording except country names.
   Legal basis: German UStG and the EU VAT Directive (MwStSystRL) after the "quick fixes" of 1 January 2020. */
(function (root) {
  'use strict';

  // code (ISO 3166, GR for Greece), VAT ID prefix, standard VAT rate in % (2026), German and English name
  const EU = [
    ['AT', 'AT', 20, 'Österreich', 'Austria'], ['BE', 'BE', 21, 'Belgien', 'Belgium'], ['BG', 'BG', 20, 'Bulgarien', 'Bulgaria'],
    ['CY', 'CY', 19, 'Zypern', 'Cyprus'], ['CZ', 'CZ', 21, 'Tschechien', 'Czechia'], ['DE', 'DE', 19, 'Deutschland', 'Germany'],
    ['DK', 'DK', 25, 'Dänemark', 'Denmark'], ['EE', 'EE', 24, 'Estland', 'Estonia'], ['ES', 'ES', 21, 'Spanien', 'Spain'],
    ['FI', 'FI', 25.5, 'Finnland', 'Finland'], ['FR', 'FR', 20, 'Frankreich', 'France'], ['GR', 'EL', 24, 'Griechenland', 'Greece'],
    ['HR', 'HR', 25, 'Kroatien', 'Croatia'], ['HU', 'HU', 27, 'Ungarn', 'Hungary'], ['IE', 'IE', 23, 'Irland', 'Ireland'],
    ['IT', 'IT', 22, 'Italien', 'Italy'], ['LT', 'LT', 21, 'Litauen', 'Lithuania'], ['LU', 'LU', 17, 'Luxemburg', 'Luxembourg'],
    ['LV', 'LV', 21, 'Lettland', 'Latvia'], ['MT', 'MT', 18, 'Malta', 'Malta'], ['NL', 'NL', 21, 'Niederlande', 'Netherlands'],
    ['PL', 'PL', 23, 'Polen', 'Poland'], ['PT', 'PT', 23, 'Portugal', 'Portugal'], ['RO', 'RO', 21, 'Rumänien', 'Romania'],
    ['SE', 'SE', 25, 'Schweden', 'Sweden'], ['SI', 'SI', 22, 'Slowenien', 'Slovenia'], ['SK', 'SK', 23, 'Slowakei', 'Slovakia'],
    // Northern Ireland: for goods still treated like a member state (Windsor Framework), VAT ID prefix XI
    ['XI', 'XI', 20, 'Nordirland', 'Northern Ireland'],
  ];
  // Third countries: EU VAT does not apply there; the app only says so
  const THIRD = [
    ['CH', 'Schweiz', 'Switzerland'], ['LI', 'Liechtenstein', 'Liechtenstein'], ['NO', 'Norwegen', 'Norway'],
    ['GB', 'Großbritannien', 'Great Britain'], ['TR', 'Türkei', 'Türkiye'], ['US', 'USA', 'USA'], ['CN', 'China', 'China'],
    ['JP', 'Japan', 'Japan'], ['IN', 'Indien', 'India'], ['XX', 'anderes Drittland', 'other non-EU country'],
  ];
  const COUNTRIES = {};
  for (const [code, prefix, rate, de, en] of EU) COUNTRIES[code] = { code, eu: true, prefix, rate, de, en };
  for (const [code, de, en] of THIRD) COUNTRIES[code] = { code, eu: false, prefix: '', rate: null, de, en };
  const isEU = c => !!(COUNTRIES[c] && COUNTRIES[c].eu);

  /** Checks and completes a case. Returns { case } or { error: 'code' }.
      parties: [{ country, vat }] (3 or 4; vat = country code of the VAT ID used, '' = none),
      from/to: where the goods start/end ('' = country of the first/last company), transport: index of the company
      that transports or commissions the transport, importer: index of the company that declares the goods for
      release into free circulation (only for imports; null = the transporter), eug: accept a triangular transaction
      at the start of a 4-party chain (EU General Court T-646/24), b2c: the last customer is a private person
      (consumer without VAT ID; then its vat is always ''). */
  function normalize(input) {
    const src = input || {};
    const parties = Array.isArray(src.parties) ? src.parties : [];
    if (parties.length < 3 || parties.length > 4) return { error: 'parties' };
    const ps = [];
    for (const p of parties) {
      if (!p || !COUNTRIES[p.country]) return { error: 'country' };
      const vat = p.vat == null ? (isEU(p.country) ? p.country : '') : p.vat;
      if (vat !== '' && !isEU(vat)) return { error: 'vat' };
      ps.push({ country: p.country, vat });
    }
    const n = ps.length;
    const b2c = !!src.b2c;
    if (b2c) ps[n - 1].vat = '';
    const from = src.from || ps[0].country, to = src.to || ps[n - 1].country;
    if (!COUNTRIES[from] || !COUNTRIES[to]) return { error: 'country' };
    const transport = src.transport;
    if (!Number.isInteger(transport) || transport < 0 || transport >= n) return { error: 'transport' };
    let importer = src.importer == null ? transport : src.importer;
    if (!Number.isInteger(importer) || importer < 0 || importer >= n) return { error: 'importer' };
    return { case: { parties: ps, from, to, transport, importer, eug: !!src.eug, b2c } };
  }

  function kindOf(from, to) {
    if (isEU(from) && isEU(to)) return from === to ? 'domestic' : 'intra';
    if (isEU(from)) return 'export';
    if (isEU(to)) return 'import';
    return 'outside';
  }

  /** The full assessment of a normalized case (see normalize). */
  function evaluate(input) {
    const norm = normalize(input);
    if (norm.error) return norm;
    const c = norm.case, P = c.parties, n = P.length, { from, to, transport: t } = c;
    const kind = kindOf(from, to);
    const priv = c.b2c ? n - 1 : -1; // index of the private person, -1 = none

    /* 1. Moved supply (§ 3 Abs. 6a UStG, Art. 36a MwStSystRL). Supply i goes from company i to company i+1. */
    let m, rule, basis = null;
    if (t === 0) { m = 0; rule = 'first'; }
    else if (t === n - 1) { m = n - 2; rule = 'last'; }
    else {
      // Intermediary: the supply TO it is moved, unless it acts as supplier – shown by the VAT ID of the country of
      // departure (intra-EU, Satz 5; export: also a tax number, Satz 6) or by declaring the import itself (Satz 7)
      basis = kind === 'import' ? 'import' : kind === 'outside' ? null : 'vat';
      const asSupplier = basis === 'vat' ? P[t].vat === from : basis === 'import' ? c.importer === t : false;
      m = asSupplier ? t : t - 1;
      rule = asSupplier ? 'intermediary-supplier' : 'intermediary';
    }

    /* 2. Place and treatment of every supply */
    const supplies = [];
    const warnings = [];
    for (let i = 0; i < n - 1; i++) {
      const s = { i, supplier: i, customer: i + 1, moved: i === m, position: i < m ? 'before' : i === m ? 'moved' : 'after' };
      // Moved and earlier supplies: where the transport begins (§ 3 Abs. 6 S. 1, Abs. 7 S. 2 Nr. 1);
      // later ones: where it ends (§ 3 Abs. 7 S. 2 Nr. 2)
      s.place = i <= m ? from : to;
      s.shifted = false;
      if (kind === 'import' && i === m && c.importer === m) { s.place = to; s.shifted = true; } // § 3 Abs. 8 UStG
      s.taxDebtor = null;
      if (!isEU(s.place)) s.treatment = 'outside';
      else if (i === m && kind === 'intra' && i + 1 === priv) {
        // To a private person: the supplier ships → intra-Community distance sale, taxed where the goods arrive
        // (§ 3c Abs. 1 UStG, Art. 33 a MwStSystRL; OSS possible). The private person collects → no exemption, taxed
        // where the goods are handed over.
        if (t === i) { s.treatment = 'distance'; s.place = to; }
        else { s.treatment = 'taxable'; s.privatePickup = true; }
      } else if (i === m && kind === 'intra') {
        const v = P[i + 1].vat;
        if (v && v !== from) s.treatment = 'ic';
        else { s.treatment = 'ic-fail'; s.failReason = v ? 'sameVat' : 'noVat'; }
      } else if (i === m && kind === 'export') {
        // Customer transports: exempt only if it is a foreign customer (not established in the country of departure)
        if (t === i + 1 && P[i + 1].country === from) { s.treatment = 'export-fail'; s.failReason = 'resident'; }
        else s.treatment = 'export';
        s.exportCase = t === i ? 'supplier' : 'customer';
      } else s.treatment = 'taxable';
      if (['taxable', 'ic-fail', 'export-fail', 'distance'].includes(s.treatment)) s.taxDebtor = i;
      s.toPrivate = i + 1 === priv;
      s.rate = isEU(s.place) ? COUNTRIES[s.place].rate : null;
      supplies.push(s);
    }
    const moved = supplies[m];
    if (moved.treatment === 'ic-fail') warnings.push({ code: 'icFail', reason: moved.failReason, party: m + 1 });
    if (moved.treatment === 'export-fail') warnings.push({ code: 'exportFail', party: m + 1 });

    /* 3. Intra-Community acquisition by the customer of the moved supply (§ 1a, § 3d UStG / Art. 20, 40, 41) */
    let acquisition = null;
    if (moved.treatment === 'ic') {
      const v = P[m + 1].vat;
      acquisition = { party: m + 1, country: to, double: v !== to ? v : null, deemed: false };
    }

    /* 4. Triangular transaction (§ 25b UStG / Art. 141, 197 MwStSystRL): moved supply a→b plus the next supply b→c */
    let triangle = null;
    if (kind === 'intra' && m + 2 <= n - 1) {
      const a = m, b = m + 1, cc = m + 2;
      // Three different member states: the first supplier is identified in the country of departure anyway (it makes
      // the intra-Community supply from there), so midVat and lastVat cover the rest
      const checks = [
        { id: 'transport', ok: t === a || t === b },
        { id: 'midVat', ok: !!P[b].vat && P[b].vat !== from && P[b].vat !== to },
        { id: 'midNotEstablished', ok: P[b].country !== to },
        // Only between businesses: a private last customer cannot owe the tax (§ 25b Abs. 1 Nr. 1 UStG)
        cc === priv ? { id: 'lastBusiness', ok: false } : { id: 'lastVat', ok: P[cc].vat === to },
      ];
      const atEnd = cc === n - 1;
      // UStAE 25b.1 Abs. 2: only the last three of a longer chain; EuG T-646/24 (3 Dec 2025) also accepts the first three
      checks.push({ id: 'position', ok: atEnd || c.eug, atEnd, eug: c.eug });
      const applies = checks.every(x => x.ok);
      triangle = { a, b, c: cc, checks, applies, atEnd, longChain: n > 3 };
      if (applies) {
        const s = supplies[b];
        s.treatment = 'triangle';
        s.taxDebtor = cc;
        acquisition.deemed = true;
        acquisition.double = null;
      }
    }
    if (acquisition && acquisition.double) warnings.push({ code: 'doubleAcq', party: acquisition.party, country: acquisition.double });

    /* 5. Import VAT: owed by the declarant; deductible only for the company with the power of disposal at import */
    let imp = null;
    if (kind === 'import') {
      const holder = moved.shifted ? m : m + 1;
      const privateImporter = c.importer === priv;
      imp = { importer: c.importer, country: to, holder, deductible: c.importer === holder && !privateImporter, privateImporter };
      // A private person pays the import VAT as a final cost – that is how it should be, no warning
      if (!imp.deductible && !privateImporter) warnings.push({ code: 'eustNoDeduct', party: c.importer, holder });
    }

    /* 6. Where each company has to be registered for VAT, and why */
    const regs = P.map(() => new Map());
    const add = (p, country, reason) => {
      if (!isEU(country)) return;
      if (!regs[p].has(country)) regs[p].set(country, []);
      if (!regs[p].get(country).includes(reason)) regs[p].get(country).push(reason);
    };
    for (const s of supplies) {
      if (s.treatment === 'outside') continue;
      if (s.treatment === 'ic') add(s.supplier, s.place, 'icSupply');
      else if (s.treatment === 'distance') add(s.supplier, s.place, 'distanceSale');
      else if (s.treatment === 'export') add(s.supplier, s.place, 'export');
      else if (s.treatment === 'triangle') { add(s.supplier, P[s.supplier].vat, 'triangleReport'); add(s.taxDebtor, s.place, 'triangleTax'); }
      else add(s.supplier, s.place, 'sale');
    }
    if (acquisition && !acquisition.deemed) add(acquisition.party, acquisition.country, 'acquisition');
    if (imp && !imp.privateImporter) add(imp.importer, imp.country, 'import');
    // oss: everything there can be declared via the One-Stop-Shop of the home country instead of a registration
    const registrations = P.map((p, i) => i === priv ? [] : [...regs[i]].map(([country, reasons]) => ({
      country, reasons, home: country === p.country, has: p.vat === country, oss: reasons.every(x => x === 'distanceSale'),
    })));

    return {
      case: c, n, kind, from, to, transport: t, importer: kind === 'import' ? c.importer : null,
      b2c: c.b2c, private: priv, moved: m, rule, basis, supplies, acquisition, triangle, import: imp, registrations, warnings,
    };
  }

  /** Foreign registrations a company needs (outside its own country), for the summary and the comparison */
  const foreignRegistrations = r => r.registrations.flatMap((list, party) => list.filter(x => !x.home).map(x => ({ party, country: x.country, has: x.has, oss: x.oss })));

  /** What if: the same case with every other company transporting, plus for intermediaries the variant
      "acts as supplier" (VAT ID of the country of departure, or declares the import itself). */
  function alternatives(input) {
    const norm = normalize(input);
    if (norm.error) return [];
    const c = norm.case, n = c.parties.length, kind = kindOf(c.from, c.to);
    const rows = [];
    const push = (cs, transport, variant) => {
      const r = evaluate(cs);
      if (r.error) return;
      const regsF = foreignRegistrations(r);
      rows.push({
        transport, variant, moved: r.moved,
        exempt: ['ic', 'export'].includes(r.supplies[r.moved].treatment),
        triangle: !!(r.triangle && r.triangle.applies),
        newRegistrations: regsF.filter(x => !x.has && !x.oss),
        oss: regsF.filter(x => x.oss),
        current: cs === input, case: r.case,
      });
    };
    for (let t = 0; t < n; t++) {
      const base = { ...c, transport: t, importer: kind === 'import' && c.transport !== t ? t : c.importer };
      if (t === c.transport) push(input, t, 'current');
      else push(base, t, 'plain');
      if (t > 0 && t < n - 1 && (kind === 'intra' || kind === 'export')) {
        const p = c.parties[t];
        // The other side of the intermediary choice: departure VAT ID vs. its own (or none)
        const alt = p.vat === c.from ? (isEU(p.country) && p.country !== c.from ? p.country : null) : c.from;
        if (alt !== null && !(t === c.transport && alt === p.vat)) {
          const parties = c.parties.map((q, i) => i === t ? { ...q, vat: alt } : q);
          push({ ...base, parties }, t, alt === c.from ? 'asSupplier' : 'asCustomer');
        }
      }
      if (t > 0 && t < n - 1 && kind === 'import') {
        const imp = t === c.transport ? (c.importer === t ? t + 1 : t) : (base.importer === t ? t + 1 : t);
        push({ ...base, importer: imp }, t, imp === t ? 'asSupplier' : 'asCustomer');
      }
    }
    return rows;
  }

  root.Chain = { COUNTRIES, EU_CODES: EU.map(x => x[0]), THIRD_CODES: THIRD.map(x => x[0]), isEU, kindOf, normalize, evaluate, alternatives, foreignRegistrations };
})(typeof window !== 'undefined' ? window : globalThis);
