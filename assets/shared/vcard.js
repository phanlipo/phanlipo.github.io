/* Contact cards (vCard 3.0) for QR codes – used by Visitenkarten (business-card/) and the QR-Code-Generator (qr-code/).
   Phones that scan a code with a vCard offer to save the contact.
   Fields: { n (full name), org, title, tel, email, url, adr } – plain strings, empty ones are left out.
   VCard.build(fields)  → "BEGIN:VCARD\r\n…END:VCARD" (CRLF lines, \ , ; and line breaks escaped)
   VCard.parse(text)    → fields, or null if the text is no vCard (reads 2.1/3.0/4.0, takes the first value of each)
   VCard.empty(fields)  → true if no field has content
   Changing the output changes existing printed codes only for new prints – keep it stable. */
(function (root) {
'use strict';
const FIELDS = ['n', 'org', 'title', 'tel', 'email', 'url', 'adr'];
const esc = s => String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const clean = f => { const o = {}; for (const k of FIELDS) o[k] = String((f && f[k]) || '').trim(); return o; };

function build(fields) {
  const v = clean(fields);
  const parts = v.n.split(/\s+/), last = parts.length > 1 ? parts.pop() : v.n, first = parts.length && v.n !== last ? parts.join(' ') : '';
  const L = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(first)};;;`, `FN:${esc(v.n)}`];
  if (v.org) L.push('ORG:' + esc(v.org));
  if (v.title) L.push('TITLE:' + esc(v.title));
  if (v.tel) L.push('TEL;TYPE=WORK,VOICE:' + esc(v.tel));
  if (v.email) L.push('EMAIL;TYPE=INTERNET:' + esc(v.email));
  if (v.url) L.push('URL:' + esc(/^[a-z][a-z0-9+.-]*:/i.test(v.url) ? v.url : 'https://' + v.url));
  if (v.adr) L.push('ADR;TYPE=WORK:;;' + esc(v.adr) + ';;;;');
  L.push('END:VCARD');
  return L.join('\r\n');
}

// Splits at unescaped separators and removes the escapes
function split(value, sep) {
  const out = [];
  let cur = '';
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '\\' && i + 1 < value.length) { const nx = value[++i]; cur += /[nN]/.test(nx) ? '\n' : nx; continue; }
    if (ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}
function parse(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '');   // unfold continued lines
  if (!/^\s*BEGIN:VCARD\s*$/im.test(src) || !/^\s*END:VCARD\s*$/im.test(src)) return null;
  const v = clean({}), got = {};
  for (const line of src.split('\n')) {
    const i = line.indexOf(':');
    if (i < 1) continue;
    const name = line.slice(0, i).split(';')[0].replace(/^item\d+\./i, '').toUpperCase(), value = line.slice(i + 1);
    const take = (k, val) => { if (!got[k] && val.trim()) { v[k] = val.trim(); got[k] = true; } };
    if (name === 'FN') take('n', split(value, '\u0000')[0]);
    else if (name === 'N' && !got.n) {
      const [last = '', first = '', middle = '', prefix = '', suffix = ''] = split(value, ';');
      const n = [prefix, first, middle, last, suffix].map(s => s.trim()).filter(Boolean).join(' ');
      if (n) v.n = n;   // FN later still wins
    }
    else if (name === 'ORG') take('org', split(value, ';').map(s => s.trim()).filter(Boolean).join(', '));
    else if (name === 'TITLE') take('title', split(value, '\u0000')[0]);
    else if (name === 'TEL') take('tel', split(value, '\u0000')[0].replace(/^tel:/i, ''));
    else if (name === 'EMAIL') take('email', split(value, '\u0000')[0].replace(/^mailto:/i, ''));
    else if (name === 'URL') take('url', split(value, '\u0000')[0]);
    else if (name === 'ADR') take('adr', split(value, ';').map(s => s.trim()).filter(Boolean).join(', '));
  }
  return v;
}
const empty = f => FIELDS.every(k => !String((f && f[k]) || '').trim());

root.VCard = { FIELDS, build, parse, empty };
})(typeof self !== 'undefined' ? self : this);
