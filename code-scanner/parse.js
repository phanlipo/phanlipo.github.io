/* Code-Scanner: turns the text of a scanned code into structured fields – no DOM, no page texts.
   CodeParse.analyze(text, { format, contentType }) → {
     type:    'url' | 'gs1link' | 'wifi' | 'vcard' | 'mecard' | 'event' | 'geo' | 'tel' | 'sms' | 'email' | 'epc' | 'swissqr'
              | 'gs1' | 'ifa' | 'product' | 'pzn' | 'otp' | 'crypto' | 'boarding' | 'json' | 'uri' | 'text' | 'binary',
     fields:  [{ k, v, kind?, check?, secret?, name?, note?, cur?, unit? }]
              k     → label key 'f.<k>' on the page (k 'ai'/'di'/'param'/'prop': label is `name`, a string or { de, en })
              kind  'text' (default) | 'date' (ISO yyyy-mm-dd) | 'datetime' (ISO) | 'money' (number, cur = ISO code)
                    | 'number' (unit) | 'region' (ISO 3166 code) | 'enum' (page text 'v.<k>.<value>')
                    | 'multi' (several lines) | 'mono' (code font) | 'code' (pre-formatted block)
              check true/false = check digit / checksum ok (shown as a badge), secret = hide until tapped
     warn:    ['http', 'punycode', 'ip', 'userinfo', 'expired', 'check', …]   page texts 'w.<code>'
     links:   [{ k: 'open' | 'call' | 'sms' | 'mail' | 'map' | 'osm', href }]   only safe schemes
     file:    { k: 'vcard' | 'ics', name, type, text } | undefined          to save or share
     vcard:   { n, org, title, tel, email, url, adr } | undefined           MECARD → vCard via assets/shared/vcard.js
     summary: short plain text for the history list (never a password)
     agent:   the same fields for AI agents, secrets removed
   }
   CodeParse.gs1Hri(text) → "(01)…(10)…" for raw GS1 data (with <GS>), null if it is none.
   Everything here only reads the text; nothing is fetched. Tests: tests/code-scanner.spec.mjs ("parsing"). */
(function (root) {
'use strict';

const GS = '\x1d', RS = '\x1e', EOT = '\x04';

/* ---------- Check digits ---------- */
function gtinCheck(d) {
  if (!/^\d{8,18}$/.test(d)) return false;
  let s = 0;
  for (let i = d.length - 2, w = 3; i >= 0; i--, w = 4 - w) s += Number(d[i]) * w;
  return (10 - s % 10) % 10 === Number(d[d.length - 1]);
}
function pznCheck(p) {
  if (!/^\d{8}$/.test(p)) return false;
  let s = 0; for (let i = 0; i < 7; i++) s += Number(p[i]) * (i + 1);
  return s % 11 !== 10 && s % 11 === Number(p[7]);
}
function ppnCheck(p) {
  if (!/^[0-9A-Z]{3,22}$/.test(p)) return false;
  const b = p.slice(0, -2); let s = 0;
  for (let i = 0; i < b.length; i++) s += b.charCodeAt(i) * (i + 2);
  return ('0' + (s % 97)).slice(-2) === p.slice(-2);
}
function ibanCheck(raw) {
  const s = String(raw).replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return false;
  const r = s.slice(4) + s.slice(0, 4);
  let m = 0;
  for (const ch of r) {
    const v = /\d/.test(ch) ? ch : String(ch.charCodeAt(0) - 55);
    for (const c of v) m = (m * 10 + Number(c)) % 97;
  }
  return m === 1;
}
const ibanFmt = s => String(s).replace(/\s+/g, '').toUpperCase().replace(/(.{4})(?=.)/g, '$1 ');
function isbn10(isbn13) {
  const b = isbn13.slice(3, 12); let s = 0;
  for (let i = 0; i < 9; i++) s += Number(b[i]) * (10 - i);
  const c = (11 - s % 11) % 11;
  return b + (c === 10 ? 'X' : String(c));
}
function issn(gtin13) {
  const b = gtin13.slice(3, 10); let s = 0;
  for (let i = 0; i < 7; i++) s += Number(b[i]) * (8 - i);
  const c = (11 - s % 11) % 11;
  return b.slice(0, 4) + '-' + b.slice(4) + (c === 10 ? 'X' : String(c));
}
// UPC-E (8 digits with number system and check digit) → UPC-A (12 digits)
function upcEtoA(e) {
  if (!/^[01]\d{7}$/.test(e)) return null;
  const ns = e[0], d = e.slice(1, 7), c = e[7], last = d[5];
  let m;
  if (last <= '2') m = d.slice(0, 2) + last + '0000' + d.slice(2, 5);
  else if (last === '3') m = d.slice(0, 3) + '00000' + d.slice(3, 5);
  else if (last === '4') m = d.slice(0, 4) + '00000' + d[4];
  else m = d.slice(0, 5) + '0000' + last;
  return ns + m + c;
}

/* ---------- Dates ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
// GS1 YYMMDD: century by the GS1 sliding window, day 00 = last day of the month
function yymmdd(v, now = new Date()) {
  if (!/^\d{6}$/.test(v)) return null;
  const yy = Number(v.slice(0, 2)), m = Number(v.slice(2, 4)), d = Number(v.slice(4, 6));
  if (m < 1 || m > 12) return null;
  const cur = now.getFullYear(), diff = yy - cur % 100;
  let y = cur - cur % 100 + yy;
  if (diff >= 51) y -= 100; else if (diff <= -50) y += 100;
  const last = new Date(y, m, 0).getDate();
  if (d > last) return null;
  return iso(y, m, d || last);
}
// iCalendar DATE / DATE-TIME: 20261231, 20261231T183000, 20261231T183000Z
function icsDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(String(v).trim());
  if (!m) return null;
  if (!m[4]) return { kind: 'date', v: `${m[1]}-${m[2]}-${m[3]}` };
  return { kind: 'datetime', v: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}${m[7] ? 'Z' : ''}` };
}

/* ---------- GS1 application identifiers ---------- */
const AI = {
  '00': ['SSCC (NVE)', 'SSCC'], '01': ['GTIN', 'GTIN'], '02': ['GTIN enthaltener Artikel', 'GTIN of contained items'],
  '03': ['GTIN (Made-to-Order)', 'GTIN (made-to-order)'], '10': ['Charge', 'Batch or lot'],
  '11': ['Herstelldatum', 'Production date'], '12': ['Fälligkeitsdatum', 'Due date'], '13': ['Verpackungsdatum', 'Packaging date'],
  '15': ['Mindestens haltbar bis', 'Best before'], '16': ['Verkaufen bis', 'Sell by'], '17': ['Verfalldatum', 'Expiry date'],
  '20': ['Produktvariante', 'Product variant'], '21': ['Seriennummer', 'Serial number'], '22': ['Verbraucherproduktvariante', 'Consumer product variant'],
  '235': ['Seriennummer (TPX)', 'Serial component (TPX)'], '240': ['Zusätzliche Produkt-ID', 'Additional product ID'],
  '241': ['Kundenteilenummer', 'Customer part number'], '242': ['Made-to-Order-Variante', 'Made-to-order variation'],
  '243': ['Verpackungskomponente', 'Packaging component number'], '250': ['Sekundäre Seriennummer', 'Secondary serial number'],
  '251': ['Referenz zur Quelleinheit', 'Reference to source entity'], '253': ['Dokumenttyp (GDTI)', 'Document type (GDTI)'],
  '254': ['GLN-Erweiterung', 'GLN extension'], '255': ['Coupon (GCN)', 'Coupon (GCN)'],
  '30': ['Menge', 'Variable count'], '37': ['Anzahl Einheiten', 'Count of trade items'],
  '400': ['Bestellnummer', 'Customer purchase order number'], '401': ['Sendungsnummer (GINC)', 'Consignment number (GINC)'],
  '402': ['Lieferungsnummer (GSIN)', 'Shipment number (GSIN)'], '403': ['Routing-Code', 'Routing code'],
  '410': ['Lieferort (GLN)', 'Ship to (GLN)'], '411': ['Rechnungsempfänger (GLN)', 'Bill to (GLN)'],
  '412': ['Bezogen von (GLN)', 'Purchased from (GLN)'], '413': ['Endempfänger (GLN)', 'Ship for (GLN)'],
  '414': ['Standort (GLN)', 'Physical location (GLN)'], '415': ['Rechnungssteller (GLN)', 'Invoicing party (GLN)'],
  '416': ['Produktionsort (GLN)', 'Production location (GLN)'], '417': ['Partei (GLN)', 'Party (GLN)'],
  '420': ['PLZ Lieferort', 'Ship-to postal code'], '421': ['PLZ Lieferort mit Land', 'Ship-to postal code with country'],
  '422': ['Ursprungsland', 'Country of origin'], '423': ['Land der Erstverarbeitung', 'Country of initial processing'],
  '424': ['Land der Verarbeitung', 'Country of processing'], '425': ['Land der Zerlegung', 'Country of disassembly'],
  '426': ['Land der gesamten Verarbeitung', 'Country of full process chain'],
  '7001': ['NATO-Versorgungsnummer', 'NATO stock number'], '7003': ['Ablaufdatum und -zeit', 'Expiration date and time'],
  '7006': ['Erstes Einfrieren', 'First freeze date'], '7007': ['Erntedatum', 'Harvest date'],
  '710': ['Arzneimittel-Nr. Deutschland (PZN)', 'National healthcare no. Germany (PZN)'],
  '711': ['Arzneimittel-Nr. Frankreich', 'National healthcare no. France'], '712': ['Arzneimittel-Nr. Spanien', 'National healthcare no. Spain'],
  '713': ['Arzneimittel-Nr. Brasilien', 'National healthcare no. Brazil'], '714': ['Arzneimittel-Nr. Portugal', 'National healthcare no. Portugal'],
  '8001': ['Rollenmaße', 'Roll dimensions'], '8002': ['Mobilfunk-ID', 'Cellular mobile ID'], '8003': ['Mehrweg-Behälter (GRAI)', 'Returnable asset (GRAI)'],
  '8004': ['Inventarnummer (GIAI)', 'Individual asset (GIAI)'], '8005': ['Preis je Einheit', 'Price per unit of measure'],
  '8006': ['Komponente (ITIP)', 'Trade item piece (ITIP)'], '8007': ['IBAN', 'IBAN'], '8008': ['Produktionszeitpunkt', 'Date and time of production'],
  '8012': ['Softwareversion', 'Software version'], '8017': ['Dienstleister (GSRN)', 'Service provider (GSRN)'],
  '8018': ['Dienstempfänger (GSRN)', 'Service recipient (GSRN)'], '8020': ['Zahlungsreferenz', 'Payment slip reference'],
  '8200': ['Produkt-URL', 'Extended packaging URL'], '90': ['Interne Vereinbarung', 'Mutually agreed information'],
};
// 31nn–36nn and 39nn: measures and amounts, n = decimal places
const MEASURE = {
  '310': ['Nettogewicht', 'Net weight', 'kg'], '311': ['Länge', 'Length', 'm'], '312': ['Breite', 'Width', 'm'],
  '313': ['Tiefe/Höhe', 'Depth/height', 'm'], '314': ['Fläche', 'Area', 'm²'], '315': ['Nettovolumen', 'Net volume', 'l'],
  '316': ['Nettovolumen', 'Net volume', 'm³'], '320': ['Nettogewicht', 'Net weight', 'lb'],
  '330': ['Bruttogewicht', 'Gross weight', 'kg'], '331': ['Länge (Logistik)', 'Length (logistics)', 'm'],
  '332': ['Breite (Logistik)', 'Width (logistics)', 'm'], '333': ['Tiefe (Logistik)', 'Depth (logistics)', 'm'],
  '334': ['Fläche (Logistik)', 'Area (logistics)', 'm²'], '335': ['Bruttovolumen', 'Gross volume', 'l'], '336': ['Bruttovolumen', 'Gross volume', 'm³'],
};
const AMOUNT = {
  '390': ['Zu zahlender Betrag', 'Amount payable'], '391': ['Zu zahlender Betrag', 'Amount payable'],
  '392': ['Preis', 'Price'], '393': ['Preis', 'Price'],
};
// Digits of an AI by its first two digits (GS1 General Specifications, figure 3.2-1)
function aiDigits(s) {
  const p = s.slice(0, 2);
  if (/^(0[0-4]|1\d|2[0-2]|30|37|9\d)$/.test(p)) return 2;
  if (/^(23|24|25|40|41|42|71)$/.test(p)) return 3;
  if (/^(3[1-69]|43|70|72|80|81|82)$/.test(p)) return 4;
  return 0;
}
// Fixed data lengths by the first two digits (the rest ends at <GS>)
const FIXED = { '00': 18, '01': 14, '02': 14, '03': 14, '04': 16, '11': 6, '12': 6, '13': 6, '14': 6, '15': 6, '16': 6, '17': 6, '18': 6, '19': 6, '20': 2, '31': 6, '32': 6, '33': 6, '34': 6, '35': 6, '36': 6, '41': 13 };

// "(01)04012345678901(10)AB1" or raw "0104012345678901" + "10AB1" + GS … → [{ id, v }] or null
function gs1Elements(text) {
  let s = String(text).replace(/^\](?:d2|C1|Q3|e0|J1)/, '');
  const out = [];
  if (/^\(\d{2,4}\)/.test(s)) {
    const re = /\((\d{2,4})\)([^(]*)/g; let m, pos = 0;
    while ((m = re.exec(s))) { if (m.index !== pos) return null; out.push({ id: m[1], v: m[2] }); pos = re.lastIndex; }
    return pos === s.length && out.length ? out : null;
  }
  s = s.replace(/^\x1d+/, '');
  let i = 0;
  while (i < s.length) {
    if (s[i] === GS) { i++; continue; }
    const n = aiDigits(s.slice(i));
    if (!n || !/^\d+$/.test(s.slice(i, i + n))) return null;
    const id = s.slice(i, i + n), fix = FIXED[id.slice(0, 2)];
    i += n;
    let end;
    if (fix) end = i + fix;
    else { end = s.indexOf(GS, i); if (end < 0) end = s.length; }
    if (end > s.length) return null;
    out.push({ id, v: s.slice(i, end) });
    i = end;
  }
  return out.length ? out : null;
}
// Human-readable form "(01)…(10)…" – what the barcode writer expects for GS1 codes
function gs1Hri(text) {
  const els = gs1Elements(text);
  return els ? els.map(e => `(${e.id})${e.v}`).join('') : null;
}
function gs1Field(id, v) {
  const f = { k: 'ai', id, v };
  if (AI[id]) f.name = { de: AI[id][0], en: AI[id][1] };
  const m3 = id.slice(0, 3);
  if (id.length === 4 && MEASURE[m3] && /^\d{6}$/.test(v)) {
    const n = Number(id[3]);
    Object.assign(f, { name: { de: MEASURE[m3][0], en: MEASURE[m3][1] }, kind: 'number', v: Number(v) / 10 ** n, digits: n, unit: MEASURE[m3][2], raw: v });
  } else if (id.length === 4 && AMOUNT[m3] && /^\d+$/.test(v)) {
    const n = Number(id[3]), withCur = m3 === '391' || m3 === '393';
    const amount = withCur ? v.slice(3) : v;
    Object.assign(f, { name: { de: AMOUNT[m3][0], en: AMOUNT[m3][1] }, kind: 'number', v: Number(amount) / 10 ** n, digits: n, raw: v });
    if (withCur) f.unit = 'ISO 4217 ' + v.slice(0, 3);
  } else if (/^1[1-7]$/.test(id)) {
    const d = yymmdd(v); if (d) Object.assign(f, { kind: 'date', v: d, raw: v });
  } else if (/^(00|01|02|03|41\d)$/.test(id)) {
    f.check = gtinCheck(v); f.kind = 'mono';
  } else if (/^42[2-6]$/.test(id) && /^\d{3}$/.test(v)) {
    f.note = 'ISO 3166 ' + v;
  } else if (id === '7003' && /^\d{10}$/.test(v)) {
    const d = yymmdd(v.slice(0, 6)); if (d) Object.assign(f, { kind: 'datetime', v: `${d}T${v.slice(6, 8)}:${v.slice(8, 10)}:00`, raw: v });
  } else if (id === '8007') {
    f.check = ibanCheck(v); f.v = ibanFmt(v);
  } else if (id === '710' && /^\d{8}$/.test(v)) {
    f.check = pznCheck(v);
  } else if (!AI[id] && /^9[1-9]$/.test(id)) {
    f.name = { de: 'Firmeninterne Angabe', en: 'Company internal information' };
  }
  return f;
}
function gs1Result(elements, type) {
  const fields = elements.map(e => gs1Field(e.id, e.v));
  const warn = [];
  const gtin = elements.find(e => e.id === '01');
  if (gtin && /^04150\d{9}$/.test(gtin.v)) {
    const pzn = gtin.v.slice(5, 13);
    fields.push({ k: 'pzn', v: pzn, check: pznCheck(pzn) });
  }
  const exp = fields.find(f => f.id === '17' && f.kind === 'date');
  if (exp && new Date(exp.v + 'T23:59:59') < new Date()) warn.push('expired');
  if (fields.some(f => f.check === false)) warn.push('check');
  return { type, fields, warn };
}

/* ---------- IFA / ISO 15434 (securPharm with PPN) ---------- */
const IFA_DI = [
  ['9N', { de: 'PPN', en: 'PPN' }], ['8P', { de: 'GTIN', en: 'GTIN' }], ['1T', { de: 'Charge', en: 'Batch or lot' }],
  ['16D', { de: 'Herstelldatum', en: 'Production date' }], ['D', { de: 'Verfalldatum', en: 'Expiry date' }], ['S', { de: 'Seriennummer', en: 'Serial number' }],
];
function parseIfa(text) {
  if (!text.startsWith('[)>')) return null;
  let body = text.slice(3).replace(/^\x1e?/, '').replace(/^06\x1d?/, '');
  const parts = body.split(/[\x1d\x1e\x04]+/).filter(Boolean);
  if (!parts.length) return null;
  const fields = [], warn = [];
  for (const p of parts) {
    const di = IFA_DI.find(([id]) => p.startsWith(id));
    if (!di) { fields.push({ k: 'di', id: '?', name: { de: 'Datenelement', en: 'Data element' }, v: p }); continue; }
    const v = p.slice(di[0].length), f = { k: 'di', id: di[0], name: di[1], v };
    if (di[0] === '9N') {
      f.check = ppnCheck(v); f.kind = 'mono';
      if (/^11\d{8}[0-9A-Z]{2}$/.test(v)) fields.push(f, { k: 'pzn', v: v.slice(2, 10), check: pznCheck(v.slice(2, 10)) });
      else fields.push(f);
      continue;
    }
    if (di[0] === '8P') { f.check = gtinCheck(v); f.kind = 'mono'; }
    if (di[0] === 'D') {
      const d = yymmdd(v);
      if (d) { Object.assign(f, { kind: 'date', v: d, raw: v }); if (new Date(d + 'T23:59:59') < new Date()) warn.push('expired'); }
    }
    if (di[0] === '16D' && /^\d{8}$/.test(v)) Object.assign(f, { kind: 'date', v: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, raw: v });
    fields.push(f);
  }
  if (fields.some(f => f.check === false)) warn.push('check');
  return { type: 'ifa', fields, warn };
}

/* ---------- GS1 company prefixes → country of the GS1 member organisation (not the country of origin) ---------- */
const PREFIX = [
  [0, 19, 'US'], [30, 39, 'US'], [60, 139, 'US'], [300, 379, 'FR'], [380, 380, 'BG'], [383, 383, 'SI'], [385, 385, 'HR'],
  [387, 387, 'BA'], [389, 389, 'ME'], [400, 440, 'DE'], [450, 459, 'JP'], [460, 469, 'RU'], [470, 470, 'KG'], [471, 471, 'TW'],
  [474, 474, 'EE'], [475, 475, 'LV'], [476, 476, 'AZ'], [477, 477, 'LT'], [478, 478, 'UZ'], [479, 479, 'LK'], [480, 480, 'PH'],
  [481, 481, 'BY'], [482, 482, 'UA'], [484, 484, 'MD'], [485, 485, 'AM'], [486, 486, 'GE'], [487, 487, 'KZ'], [488, 488, 'TJ'],
  [489, 489, 'HK'], [490, 499, 'JP'], [500, 509, 'GB'], [520, 521, 'GR'], [528, 528, 'LB'], [529, 529, 'CY'], [530, 530, 'AL'],
  [531, 531, 'MK'], [535, 535, 'MT'], [539, 539, 'IE'], [540, 549, 'BE'], [560, 560, 'PT'], [569, 569, 'IS'], [570, 579, 'DK'],
  [590, 590, 'PL'], [594, 594, 'RO'], [599, 599, 'HU'], [600, 601, 'ZA'], [608, 608, 'BH'], [609, 609, 'MU'], [611, 611, 'MA'],
  [613, 613, 'DZ'], [615, 615, 'NG'], [616, 616, 'KE'], [619, 619, 'TN'], [621, 621, 'SY'], [622, 622, 'EG'], [624, 624, 'LY'],
  [625, 625, 'JO'], [626, 626, 'IR'], [627, 627, 'KW'], [628, 628, 'SA'], [629, 629, 'AE'], [640, 649, 'FI'], [690, 699, 'CN'],
  [700, 709, 'NO'], [729, 729, 'IL'], [730, 739, 'SE'], [740, 740, 'GT'], [741, 741, 'SV'], [742, 742, 'HN'], [743, 743, 'NI'],
  [744, 744, 'CR'], [745, 745, 'PA'], [746, 746, 'DO'], [750, 750, 'MX'], [754, 755, 'CA'], [759, 759, 'VE'], [760, 769, 'CH'],
  [770, 771, 'CO'], [773, 773, 'UY'], [775, 775, 'PE'], [777, 777, 'BO'], [778, 779, 'AR'], [780, 780, 'CL'], [784, 784, 'PY'],
  [786, 786, 'EC'], [789, 790, 'BR'], [800, 839, 'IT'], [840, 849, 'ES'], [850, 850, 'CU'], [858, 858, 'SK'], [859, 859, 'CZ'],
  [860, 860, 'RS'], [865, 865, 'MN'], [867, 867, 'KP'], [868, 869, 'TR'], [870, 879, 'NL'], [880, 880, 'KR'], [884, 884, 'KH'],
  [885, 885, 'TH'], [888, 888, 'SG'], [890, 890, 'IN'], [893, 893, 'VN'], [896, 896, 'PK'], [899, 899, 'ID'], [900, 919, 'AT'],
  [930, 939, 'AU'], [940, 949, 'NZ'], [955, 955, 'MY'], [958, 958, 'MO'],
];
function productResult(digits, format) {
  const fields = [], warn = [];
  let gtin = digits;
  if (format === 'UPCE' && digits.length === 8) {
    const a = upcEtoA(digits);
    fields.push({ k: 'upce', v: digits, kind: 'mono' });
    if (a) gtin = a;
  }
  const ok = gtinCheck(gtin);
  fields.push({ k: 'gtin', v: gtin, kind: 'mono', check: ok });
  if (!ok) warn.push('check');
  const g13 = gtin.padStart(13, '0'), p = Number(g13.slice(0, 3));
  if (gtin.length === 14) fields.push({ k: 'packLevel', v: gtin[0] });
  if (gtin.length !== 8) {
    if (p >= 978 && p <= 979) {
      fields.push({ k: 'isbn', v: g13 });
      if (p === 978) fields.push({ k: 'isbn10', v: isbn10(g13) });
    } else if (p === 977) fields.push({ k: 'issn', v: issn(g13) });
    else if ((p >= 20 && p <= 29) || (p >= 40 && p <= 49) || (p >= 200 && p <= 299)) fields.push({ k: 'prefixUse', v: 'instore' });
    else if ((p >= 50 && p <= 59) || (p >= 981 && p <= 984) || p >= 990) fields.push({ k: 'prefixUse', v: 'coupon' });
    else if (p === 980) fields.push({ k: 'prefixUse', v: 'refund' });
    else {
      const r = PREFIX.find(([a, b]) => p >= a && p <= b);
      if (r) fields.push({ k: 'gs1Country', v: r[2], kind: 'region', note: g13.slice(0, 3) });
    }
  } else if (gtin[0] === '2') fields.push({ k: 'prefixUse', v: 'instore' });
  if (/^04150\d{9}$/.test(gtin.padStart(14, '0'))) {
    const pzn = gtin.padStart(14, '0').slice(5, 13);
    fields.push({ k: 'pzn', v: pzn, check: pznCheck(pzn) });
  }
  return { type: 'product', fields, warn };
}

/* ---------- Small text helpers ---------- */
// Splits at unescaped sep; removes backslash escapes
function splitEsc(s, sep) {
  const out = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) { cur += s[++i]; continue; }
    if (c === sep) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}
// "KEY:value;KEY:value;;" (WIFI:, MECARD:, MATMSG:) → [[key, value]]
function keyValues(body) {
  const pairs = [];
  for (const part of splitEsc(body, ';')) {
    const i = part.indexOf(':');
    if (i > 0) pairs.push([part.slice(0, i).toUpperCase(), part.slice(i + 1)]);
  }
  return pairs;
}
// plus: '+' means a space (query strings), not in paths, phone numbers or addresses
const decodeUri = (s, plus = true) => { try { return decodeURIComponent(plus ? s.replace(/\+/g, ' ') : s); } catch (_) { return s; } };
function queryParams(q) {
  const out = [];
  for (const part of String(q || '').replace(/^\?/, '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    out.push(i < 0 ? [decodeUri(part), ''] : [decodeUri(part.slice(0, i)), decodeUri(part.slice(i + 1))]);
  }
  return out;
}

/* ---------- Types ---------- */
function parseUrl(text) {
  let u;
  try { u = new URL(text); } catch (_) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const warn = [];
  if (u.protocol === 'http:') warn.push('http');
  if (/(^|\.)xn--/i.test(u.hostname)) warn.push('punycode');
  if (/^\d+\.\d+\.\d+\.\d+$|^\[/.test(u.hostname)) warn.push('ip');
  if (u.username || u.password) warn.push('userinfo');
  // GS1 Digital Link: https://example.com/01/09506000134352/10/ABC?17=281231
  const segs = u.pathname.split('/').filter(Boolean).map(x => decodeUri(x, false));
  const keyAt = segs.findIndex((s, i) => /^(01|00|253|255|401|402|414|417|8003|8004|8006|8010|8013|8017|8018)$/.test(s) && i + 1 < segs.length);
  if (keyAt >= 0) {
    const els = [];
    for (let i = keyAt; i + 1 < segs.length; i += 2) if (/^\d{2,4}$/.test(segs[i])) els.push({ id: segs[i], v: segs[i + 1] });
    for (const [k, v] of queryParams(u.search)) if (/^\d{2,4}$/.test(k)) els.push({ id: k, v });
    if (els.length && (els[0].id !== '01' || gtinCheck(els[0].v.padStart(14, '0')))) {
      const r = gs1Result(els, 'gs1link');
      r.fields.unshift({ k: 'host', v: u.hostname });
      r.warn.push(...warn);
      r.links = [{ k: 'open', href: u.href }];
      return r;
    }
  }
  const fields = [{ k: 'host', v: u.hostname }];
  if (u.port) fields.push({ k: 'port', v: u.port });
  if (u.pathname && u.pathname !== '/') fields.push({ k: 'path', v: decodeUri(u.pathname, false), kind: 'mono' });
  for (const [k, v] of queryParams(u.search)) fields.push({ k: 'param', name: k, v, kind: 'mono' });
  if (u.hash.length > 1) fields.push({ k: 'hash', v: decodeUri(u.hash.slice(1), false), kind: 'mono' });
  return { type: 'url', fields, warn, links: [{ k: 'open', href: u.href }] };
}

function parseWifi(text) {
  if (!/^WIFI:/i.test(text)) return null;
  const kv = Object.fromEntries(keyValues(text.slice(5)));
  const sec = (kv.T || '').toUpperCase() || 'nopass';
  const fields = [{ k: 'ssid', v: kv.S || '' }, { k: 'security', v: sec === 'NOPASS' ? 'nopass' : sec, kind: 'enum' }];
  if (kv.P) fields.push({ k: 'password', v: kv.P, secret: true, kind: 'mono' });
  if (kv.H) fields.push({ k: 'hiddenNet', v: /^true$/i.test(kv.H) ? 'yes' : 'no', kind: 'enum' });
  if (kv.E) fields.push({ k: 'eap', v: kv.E });
  if (kv.I) fields.push({ k: 'identity', v: kv.I });
  if (kv.A) fields.push({ k: 'anonId', v: kv.A });
  if (kv.PH2) fields.push({ k: 'phase2', v: kv.PH2 });
  return { type: 'wifi', fields, warn: [], summary: kv.S || '' };
}

// vCard 2.1/3.0/4.0: all common properties, several values each
function qpDecode(s, charset) {
  const bytes = [];
  const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-F]{2}$/i.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; } else bytes.push(t.charCodeAt(i) & 0xff);
  }
  try { return new TextDecoder(charset || 'utf-8').decode(new Uint8Array(bytes)); } catch (_) { return new TextDecoder().decode(new Uint8Array(bytes)); }
}
function contentLines(text) {
  const raw = text.replace(/\r\n?/g, '\n');
  // quoted-printable soft line breaks first, then folding (line starting with space/tab)
  const lines = raw.replace(/=\n/g, '=\r').split('\n');
  const out = [];
  for (const l of lines) {
    if (/^[ \t]/.test(l) && out.length) out[out.length - 1] += l.slice(1);
    else out.push(l);
  }
  return out.map(l => l.replace(/=\r/g, '=\n')).filter(l => l.trim());
}
function propLine(line) {
  const i = line.indexOf(':');
  if (i < 0) return null;
  const head = line.slice(0, i).split(';'), name = head[0].replace(/^[^.]+\./, '').toUpperCase(), params = {}, types = [];
  for (const p of head.slice(1)) {
    const j = p.indexOf('=');
    if (j < 0) { types.push(p); continue; }
    const k = p.slice(0, j).toUpperCase(), v = p.slice(j + 1).replace(/^"|"$/g, '');
    if (k === 'TYPE') types.push(...v.split(',')); else params[k] = v;
  }
  params.TYPE = types.join(',');
  let value = line.slice(i + 1);
  if (/quoted-printable/i.test(params.ENCODING || '')) value = qpDecode(value, params.CHARSET);
  return { name, params, value };
}
const unesc = v => v.replace(/\\n/gi, '\n').replace(/\\([,;:\\])/g, '$1');
function parseVcard(text) {
  if (!/^BEGIN:VCARD/im.test(text)) return null;
  const fields = []; let fn = '', n = '';
  const typeNote = p => (p.TYPE || '').toLowerCase().split(',').filter(x => x && !/^(internet|pref|voice|x400)$/.test(x)).join(', ');
  for (const line of contentLines(text)) {
    const p = propLine(line);
    if (!p) continue;
    const v = p.value;
    switch (p.name) {
      case 'FN': fn = unesc(v); break;
      case 'N': { const a = splitEsc(v, ';'); n = [a[3], a[1], a[2], a[0], a[4]].filter(Boolean).join(' '); break; }
      case 'ORG': fields.push({ k: 'org', v: splitEsc(v, ';').filter(Boolean).join(', ') }); break;
      case 'TITLE': fields.push({ k: 'jobTitle', v: unesc(v) }); break;
      case 'ROLE': fields.push({ k: 'role', v: unesc(v) }); break;
      case 'NICKNAME': fields.push({ k: 'nickname', v: unesc(v) }); break;
      case 'TEL': fields.push({ k: 'tel', v: unesc(v).replace(/^tel:/i, ''), note: typeNote(p.params) }); break;
      case 'EMAIL': fields.push({ k: 'email', v: unesc(v), note: typeNote(p.params) }); break;
      case 'URL': fields.push({ k: 'web', v: unesc(v), note: typeNote(p.params) }); break;
      case 'ADR': {
        const a = splitEsc(v, ';').map(x => x.trim());
        const lines = [a[0], a[1], a[2], [a[5], a[3]].filter(Boolean).join(' '), a[4], a[6]].filter(Boolean);
        fields.push({ k: 'address', v: lines.join('\n'), kind: 'multi', note: typeNote(p.params) }); break;
      }
      case 'BDAY': { const d = icsDate(v.replace(/-/g, '')); fields.push(d ? { k: 'birthday', v: d.v, kind: 'date' } : { k: 'birthday', v }); break; }
      case 'NOTE': fields.push({ k: 'note', v: unesc(v), kind: 'multi' }); break;
      case 'GEO': fields.push({ k: 'coords', v: v.replace(/^geo:/i, '').replace(';', ',') }); break;
      case 'X-SOCIALPROFILE': case 'IMPP': fields.push({ k: 'social', v: unesc(v), note: typeNote(p.params) }); break;
      default:
    }
  }
  const name = fn || n;
  if (name) fields.unshift({ k: 'name', v: name });
  return {
    type: 'vcard', fields, warn: [], summary: name || (fields[0] && fields[0].v) || '',
    file: { k: 'vcard', name: (name || 'kontakt').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 40) + '.vcf', type: 'text/vcard', text: text.replace(/\r?\n/g, '\r\n') },
  };
}
function parseMecard(text) {
  if (!/^MECARD:/i.test(text)) return null;
  const fields = [], vc = {};
  for (const [k, v] of keyValues(text.slice(7))) {
    if (k === 'N') {
      const [last, first] = v.split(',');
      const name = [first, last].filter(Boolean).map(s => s.trim()).join(' ');
      fields.unshift({ k: 'name', v: name }); vc.n = name;
    } else if (k === 'SOUND') fields.push({ k: 'reading', v: v.replace(',', ' ') });
    else if (k === 'TEL' || k === 'TEL-AV') { fields.push({ k: 'tel', v }); vc.tel = vc.tel || v; }
    else if (k === 'EMAIL') { fields.push({ k: 'email', v }); vc.email = vc.email || v; }
    else if (k === 'URL') { fields.push({ k: 'web', v }); vc.url = vc.url || v; }
    else if (k === 'ADR') { fields.push({ k: 'address', v: v.split(',').map(s => s.trim()).filter(Boolean).join('\n'), kind: 'multi' }); vc.adr = vc.adr || v; }
    else if (k === 'ORG') { fields.push({ k: 'org', v }); vc.org = v; }
    else if (k === 'NOTE' || k === 'MEMO') fields.push({ k: 'note', v, kind: 'multi' });
    else if (k === 'BDAY') { const d = icsDate(v); fields.push(d ? { k: 'birthday', v: d.v, kind: 'date' } : { k: 'birthday', v }); }
    else if (k === 'NICKNAME') fields.push({ k: 'nickname', v });
  }
  return { type: 'mecard', fields, warn: [], vcard: vc, summary: vc.n || '' };
}

function parseEvent(text) {
  if (!/BEGIN:VEVENT/i.test(text)) return null;
  const fields = []; let summary = '';
  const body = text.slice(text.search(/BEGIN:VEVENT/i));
  for (const line of contentLines(body)) {
    const p = propLine(line);
    if (!p) continue;
    if (p.name === 'END' && /VEVENT/i.test(p.value)) break;
    const map = { SUMMARY: 'summary', LOCATION: 'location', DESCRIPTION: 'description', URL: 'web', ORGANIZER: 'organizer' };
    if (map[p.name]) {
      const v = unesc(p.value).replace(/^mailto:/i, '');
      if (p.name === 'SUMMARY') summary = v;
      fields.push({ k: map[p.name], v, kind: p.name === 'DESCRIPTION' ? 'multi' : undefined });
    } else if (p.name === 'DTSTART' || p.name === 'DTEND') {
      const d = icsDate(p.value);
      fields.push(Object.assign({ k: p.name === 'DTSTART' ? 'start' : 'end', v: p.value }, d || {}));
    }
  }
  const ev = text.replace(/\r?\n/g, '\r\n').trim();
  const ics = /BEGIN:VCALENDAR/i.test(ev) ? ev : 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//phanlipo//Code-Scanner//EN\r\n' + ev + '\r\nEND:VCALENDAR';
  return {
    type: 'event', fields, warn: [], summary,
    file: { k: 'ics', name: (summary || 'termin').replace(/[^\p{L}\p{N} _-]+/gu, '').trim().slice(0, 40) + '.ics', type: 'text/calendar', text: ics + '\r\n' },
  };
}

function parseGeo(text) {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(-?\d+(?:\.\d+)?))?([^?]*)(?:\?(.*))?$/i.exec(text.trim());
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const fields = [{ k: 'lat', v: m[1] }, { k: 'lon', v: m[2] }];
  if (m[3]) fields.push({ k: 'alt', v: m[3], unit: 'm' });
  for (const [k, v] of queryParams(m[5])) fields.push(k === 'q' ? { k: 'query', v } : { k: 'param', name: k, v });
  return {
    type: 'geo', fields, warn: [], summary: `${m[1]}, ${m[2]}`,
    links: [{ k: 'map', href: `geo:${m[1]},${m[2]}` }, { k: 'osm', href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}` }],
  };
}

function parseTel(text) {
  const m = /^tel:(.+)$/i.exec(text.trim());
  if (!m) return null;
  const num = decodeUri(m[1], false);
  return { type: 'tel', fields: [{ k: 'tel', v: num }], warn: [], links: [{ k: 'call', href: 'tel:' + num.replace(/[^\d+*#,;]/g, '') }], summary: num };
}
function parseSms(text) {
  let num, body = '';
  let m = /^(?:smsto|mmsto):([^:]*)(?::([\s\S]*))?$/i.exec(text);
  if (m) { num = m[1]; body = m[2] || ''; } else {
    m = /^(?:sms|mms):([^?]*)(?:\?([\s\S]*))?$/i.exec(text);
    if (!m) return null;
    num = decodeUri(m[1], false);
    const b = queryParams(m[2]).find(([k]) => k.toLowerCase() === 'body');
    body = b ? b[1] : '';
  }
  const fields = [{ k: 'tel', v: num }];
  if (body) fields.push({ k: 'message', v: body, kind: 'multi' });
  return { type: 'sms', fields, warn: [], summary: num, links: [{ k: 'sms', href: 'sms:' + num.replace(/[^\d+]/g, '') + (body ? '?body=' + encodeURIComponent(body) : '') }] };
}
function parseMail(text) {
  let to = '', cc = '', bcc = '', subject = '', body = '';
  let m = /^mailto:([^?]*)(?:\?([\s\S]*))?$/i.exec(text.trim());
  if (m) {
    to = decodeUri(m[1], false);
    for (const [k, v] of queryParams(m[2])) {
      const key = k.toLowerCase();
      if (key === 'subject') subject = v; else if (key === 'body') body = v; else if (key === 'cc') cc = v; else if (key === 'bcc') bcc = v; else if (key === 'to') to = [to, v].filter(Boolean).join(', ');
    }
  } else if (/^MATMSG:/i.test(text)) {
    const kv = Object.fromEntries(keyValues(text.slice(7)));
    to = kv.TO || ''; subject = kv.SUB || ''; body = kv.BODY || '';
  } else if (/^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i.test(text.trim())) to = text.trim();
  else return null;
  const fields = [{ k: 'to', v: to }];
  if (cc) fields.push({ k: 'cc', v: cc });
  if (bcc) fields.push({ k: 'bcc', v: bcc });
  if (subject) fields.push({ k: 'subject', v: subject });
  if (body) fields.push({ k: 'message', v: body, kind: 'multi' });
  const q = [subject && 'subject=' + encodeURIComponent(subject), body && 'body=' + encodeURIComponent(body), cc && 'cc=' + encodeURIComponent(cc)].filter(Boolean).join('&');
  return { type: 'email', fields, warn: [], summary: to, links: [{ k: 'mail', href: 'mailto:' + to.replace(/[?#&\s]/g, '') + (q ? '?' + q : '') }] };
}

// EPC QR code ("GiroCode"): SEPA credit transfer
function parseEpc(text) {
  const L = text.replace(/\r\n?/g, '\n').split('\n');
  if (L[0].trim() !== 'BCD' || !/^00[12]$/.test((L[1] || '').trim()) || !/^(SCT|INST)$/.test((L[3] || '').trim())) return null;
  const f = i => (L[i] || '').trim();
  const fields = [{ k: 'payee', v: f(5) }, { k: 'iban', v: ibanFmt(f(6)), check: ibanCheck(f(6)), kind: 'mono' }];
  if (f(4)) fields.push({ k: 'bic', v: f(4), kind: 'mono' });
  const am = /^([A-Z]{3})(\d+(?:\.\d{1,2})?)$/.exec(f(7));
  if (am) fields.push({ k: 'amount', v: Number(am[2]), kind: 'money', cur: am[1] });
  if (f(8)) fields.push({ k: 'purpose', v: f(8) });
  if (f(9)) fields.push({ k: 'reference', v: f(9), kind: 'mono' });
  if (f(10)) fields.push({ k: 'remittance', v: f(10) });
  if (f(11)) fields.push({ k: 'info', v: f(11) });
  if (f(3) === 'INST') fields.push({ k: 'instant', v: 'yes', kind: 'enum' });
  return { type: 'epc', fields, warn: ibanCheck(f(6)) ? [] : ['check'], summary: f(5) };
}
// Swiss QR bill (QR-Rechnung)
function parseSwissQr(text) {
  const L = text.replace(/\r\n?/g, '\n').split('\n').map(s => s.trim());
  if (L[0] !== 'SPC' || !/^02\d\d$/.test(L[1] || '')) return null;
  const addr = i => {
    const t = L[i], name = L[i + 1];
    if (!name) return '';
    const rest = t === 'K' ? [L[i + 2], L[i + 3]] : [[L[i + 2], L[i + 3]].filter(Boolean).join(' '), [L[i + 4], L[i + 5]].filter(Boolean).join(' ')];
    return [name, ...rest, L[i + 6]].filter(Boolean).join('\n');
  };
  const fields = [{ k: 'iban', v: ibanFmt(L[3]), check: ibanCheck(L[3]), kind: 'mono' }, { k: 'payee', v: addr(4), kind: 'multi' }];
  const ult = addr(11); if (ult) fields.push({ k: 'ultimatePayee', v: ult, kind: 'multi' });
  if (L[18]) fields.push({ k: 'amount', v: Number(L[18]), kind: 'money', cur: L[19] || 'CHF' });
  else fields.push({ k: 'currency', v: L[19] || '' });
  const debtor = addr(20); if (debtor) fields.push({ k: 'payer', v: debtor, kind: 'multi' });
  if (L[28]) fields.push({ k: 'reference', v: L[28], note: L[27], kind: 'mono' });
  if (L[29]) fields.push({ k: 'remittance', v: L[29] });
  if (L[31]) fields.push({ k: 'billInfo', v: L[31], kind: 'mono' });
  return { type: 'swissqr', fields, warn: ibanCheck(L[3]) ? [] : ['check'], summary: L[5] || '' };
}

function parseOtp(text) {
  if (!/^otpauth:\/\//i.test(text)) return null;
  const m = /^otpauth:\/\/([a-z]+)\/([^?]*)(?:\?(.*))?$/i.exec(text);
  if (!m) return null;
  const label = decodeUri(m[2]), params = Object.fromEntries(queryParams(m[3]).map(([k, v]) => [k.toLowerCase(), v]));
  const i = label.indexOf(':'), account = i >= 0 ? label.slice(i + 1).trim() : label, issuer = params.issuer || (i >= 0 ? label.slice(0, i) : '');
  const fields = [];
  if (issuer) fields.push({ k: 'issuer', v: issuer });
  fields.push({ k: 'account', v: account }, { k: 'otpType', v: m[1].toUpperCase() });
  if (params.secret) fields.push({ k: 'secret', v: params.secret, secret: true, kind: 'mono' });
  fields.push({ k: 'algorithm', v: (params.algorithm || 'SHA1').toUpperCase() }, { k: 'digits', v: params.digits || '6' });
  if (m[1].toLowerCase() === 'totp') fields.push({ k: 'period', v: params.period || '30', unit: 's' });
  if (params.counter) fields.push({ k: 'counter', v: params.counter });
  return { type: 'otp', fields, warn: ['secretCode'], summary: [issuer, account].filter(Boolean).join(' – ') };
}

const COINS = { bitcoin: 'Bitcoin', bitcoincash: 'Bitcoin Cash', litecoin: 'Litecoin', ethereum: 'Ethereum', dogecoin: 'Dogecoin', monero: 'Monero', dash: 'Dash', zcash: 'Zcash', lightning: 'Lightning' };
function parseCrypto(text) {
  const m = /^([a-z]+):(?:\/\/)?([^?]+)(?:\?(.*))?$/i.exec(text.trim());
  if (!m || !COINS[m[1].toLowerCase()]) return null;
  const fields = [{ k: 'currencyName', v: COINS[m[1].toLowerCase()] }, { k: 'address', v: m[2], kind: 'mono' }];
  for (const [k, v] of queryParams(m[3])) {
    const key = k.toLowerCase();
    if (key === 'amount' || key === 'value') fields.push({ k: 'amount', v });
    else if (key === 'label') fields.push({ k: 'label', v });
    else if (key === 'message') fields.push({ k: 'message', v });
    else fields.push({ k: 'param', name: k, v, kind: 'mono' });
  }
  return { type: 'crypto', fields, warn: [], summary: m[2].slice(0, 20) };
}

// IATA boarding pass (BCBP), first leg
function parseBoarding(text, now = new Date()) {
  const m = /^M([1-4])(.{20})([E ])(.{7})([A-Z]{3})([A-Z]{3})(.{3})(.{5})(\d{3})(.)(.{4})(.{5})(.)/.exec(text);
  if (!m) return null;
  const doy = Number(m[9]);
  if (doy < 1 || doy > 366) return null;
  // Julian day without a year: the date nearest to today
  let best = null;
  for (const y of [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1]) {
    const d = new Date(y, 0, doy);
    if (!best || Math.abs(d - now) < Math.abs(best - now)) best = d;
  }
  const name = m[2].trim().replace('/', ' / ');
  const fields = [
    { k: 'passenger', v: name }, { k: 'pnr', v: m[4].trim(), kind: 'mono' }, { k: 'depart', v: m[5], kind: 'mono' }, { k: 'arrive', v: m[6], kind: 'mono' },
    { k: 'flight', v: m[7].trim() + ' ' + m[8].trim().replace(/^0+(?=\d)/, ''), kind: 'mono' },
    { k: 'flightDate', v: iso(best.getFullYear(), best.getMonth() + 1, best.getDate()), kind: 'date' },
    { k: 'cabin', v: m[10] }, { k: 'seat', v: m[11].trim().replace(/^0+(?=\d)/, ''), kind: 'mono' }, { k: 'sequence', v: m[12].trim().replace(/^0+(?=\d)/, '') },
  ];
  if (m[1] !== '1') fields.push({ k: 'legs', v: m[1] });
  return { type: 'boarding', fields, warn: [], summary: `${m[5]} → ${m[6]} ${m[7].trim()}${m[8].trim().replace(/^0+/, '')}` };
}

function parseJson(text) {
  const t = text.trim();
  if (!/^[{[]/.test(t)) return null;
  let j;
  try { j = JSON.parse(t); } catch (_) { return null; }
  const fields = [{ k: 'json', v: JSON.stringify(j, null, 2), kind: 'code' }];
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    for (const [k, v] of Object.entries(j).slice(0, 40)) fields.push({ k: 'prop', name: k, v: typeof v === 'string' ? v : JSON.stringify(v), kind: 'mono' });
  }
  return { type: 'json', fields, warn: [] };
}

function parseUri(text) {
  const m = /^([a-z][a-z0-9+.-]{1,30}):([^\s]+)$/i.exec(text.trim());
  if (!m || /^(https?|wifi|mecard|matmsg)$/i.test(m[1])) return null;
  const q = m[2].indexOf('?'), path = q >= 0 ? m[2].slice(0, q) : m[2];
  const fields = [{ k: 'scheme', v: m[1].toLowerCase() }, { k: 'target', v: decodeUri(path, false), kind: 'mono' }];
  if (q >= 0) for (const [k, v] of queryParams(m[2].slice(q + 1))) fields.push({ k: 'param', name: k, v, kind: 'mono' });
  return { type: 'uri', fields, warn: /^(javascript|data|vbscript|file|intent)$/i.test(m[1]) ? ['scheme'] : [] };
}

function parseText(text) {
  const words = (text.match(/\S+/g) || []).length;
  const lines = text.split(/\r\n|\r|\n/).length;
  const fields = [{ k: 'chars', v: String([...text].length) }, { k: 'words', v: String(words) }];
  if (lines > 1) fields.push({ k: 'lines', v: String(lines) });
  const ctl = [...text].filter(c => c < ' ' && !'\n\r\t'.includes(c)).length;
  if (ctl) fields.push({ k: 'controlChars', v: String(ctl) });
  return { type: 'text', fields, warn: [] };
}

const RETAIL = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'ISBN', 'EANUPC', 'ITF14'];
function detect(text, meta) {
  const fmt = meta.format || '', ct = meta.contentType || '';
  if (ct === 'Binary') return { type: 'binary', fields: [{ k: 'bytes', v: String(meta.byteLength || 0) }], warn: [] };
  if (fmt === 'PZN' && /^\d{7,8}$/.test(text)) { const p = text.padStart(8, '0'); return { type: 'pzn', fields: [{ k: 'pzn', v: p, check: pznCheck(p) }], warn: pznCheck(p) ? [] : ['check'] }; }
  if (RETAIL.includes(fmt) && /^\d{8,14}$/.test(text)) return productResult(text, fmt);
  if (ct === 'ISO15434' || text.startsWith('[)>')) { const r = parseIfa(text); if (r) return r; }
  if (ct === 'GS1' || /^\(\d{2,4}\)/.test(text) || /^\](?:d2|C1|Q3|e0)/.test(text) || (text.includes(GS) && /^\d{2}/.test(text))) {
    const els = gs1Elements(text);
    if (els && (ct === 'GS1' || els.every(e => AI[e.id] || MEASURE[e.id.slice(0, 3)] || AMOUNT[e.id.slice(0, 3)] || /^9\d$/.test(e.id)))) return gs1Result(els, 'gs1');
  }
  for (const p of [parseWifi, parseVcard, parseMecard, parseEvent, parseEpc, parseSwissQr, parseOtp, parseUrl, parseGeo, parseTel, parseSms, parseMail, parseCrypto, parseBoarding, parseJson]) {
    const r = p(text);
    if (r) return r;
  }
  // bare product number typed or pasted (no format known): only with a valid check digit
  if (!fmt && /^(\d{8}|\d{12,14})$/.test(text) && gtinCheck(text)) return productResult(text, '');
  return parseUri(text) || parseText(text);
}

function analyze(text, meta = {}) {
  text = String(text == null ? '' : text);
  const r = detect(text, meta);
  r.warn = [...new Set(r.warn || [])];
  r.links = (r.links || []).filter(l => /^(https?|tel|sms|mailto|geo):/i.test(l.href));
  if (!r.summary) {
    const first = text.replace(/[\x00-\x1f]+/g, ' ').trim();
    r.summary = first.length > 80 ? first.slice(0, 79) + '…' : first;
  }
  if (r.type === 'wifi' || r.type === 'otp') r.summary = r.summary || r.type;
  r.agent = r.fields.filter(f => !f.secret).map(f => {
    const o = { field: f.k === 'ai' ? 'AI ' + f.id : f.k === 'di' ? 'DI ' + f.id : f.k, value: f.v };
    if (f.name) o.name = typeof f.name === 'string' ? f.name : f.name.en;
    if (f.cur) o.currency = f.cur;
    if (f.unit) o.unit = f.unit;
    if (typeof f.check === 'boolean') o.check_ok = f.check;
    return o;
  });
  return r;
}

root.CodeParse = { analyze, gs1Hri, gtinCheck, pznCheck, ppnCheck, ibanCheck, gs1Elements, yymmdd, upcEtoA, isbn10, issn, GS, RS, EOT };
})(typeof window !== 'undefined' ? window : globalThis);
