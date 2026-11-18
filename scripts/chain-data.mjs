#!/usr/bin/env node
// Checks the data of the app "Reihengeschäft" (chain-transaction/chain.js) and reports only what needs a look:
//   - standard VAT rates against the EU "Taxes in Europe" database (TEDB, the request its own web page sends)
//   - from 15 December: the German VAT return form of the next year (box numbers, Intrastat thresholds),
//     which the Federal Ministry of Finance publishes only as PDF – checked by hand
//   - the database cannot be read (changed or down) – then the rates could not be checked
// Nothing is changed automatically. Used by .github/workflows/chain-data.yml (monthly issue).
//   node scripts/chain-data.mjs [--markdown report.md] [--today YYYY-MM-DD]
// Exit code 0 in any case; an empty report means nothing to do.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(import.meta.url), '../..');
const TEDB = 'https://ec.europa.eu/taxation_customs/tedb/rest-api/vatSearch';
// TEDB uses EL for Greece; Chain uses the ISO code GR
const TEDB_CODE = { GR: 'EL' };

/** window.Chain from chain-transaction/chain.js (runs the browser script in a sandbox) */
export function loadChain(root = ROOT) {
  const sandbox = { globalThis: {} };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(join(root, 'chain-transaction/chain.js'), 'utf8'), sandbox);
  return sandbox.Chain;
}

/** Standard rates per TEDB country code from a TEDB vatSearch answer: { AT: [{ value, situationOn }], … } */
export function standardRates(answer) {
  const out = {};
  for (const e of (answer && answer.result) || []) {
    if (e.type !== 'STANDARD') continue;
    for (const r of e.rates || []) (out[e.isoCode] ||= []).push({ value: r.value, situationOn: (r.situationOn || '').replace(/\//g, '-') });
  }
  return out;
}

/** Differences between the app and TEDB: [{ code, app, official: [values], situationOn }]. A country matches
    when one of its standard rates equals the app's (several entries exist, e.g. Spain with the Canary Islands). */
export function compareRates(countries, official) {
  const diffs = [];
  for (const c of Object.values(countries)) {
    if (!c.eu) continue;
    const list = official[TEDB_CODE[c.code] || c.code];
    if (!list || !list.length) { diffs.push({ code: c.code, app: c.rate, official: [], situationOn: '' }); continue; }
    if (!list.some(r => r.value === c.rate)) {
      diffs.push({ code: c.code, app: c.rate, official: [...new Set(list.map(r => r.value))], situationOn: list.map(r => r.situationOn).sort().pop() });
    }
  }
  return diffs;
}

/** The form of the next year is due from 15 December of formYear on */
export const formDue = (data, today) => today >= `${data.formYear}-12-15`;

/** Markdown report; '' when nothing needs to be done */
export function report({ data, diffs, error, today }) {
  const parts = [];
  if (error) {
    parts.push(`### Steuersätze nicht prüfbar\n\nDie EU-Datenbank „Taxes in Europe“ ließ sich nicht abfragen (${error}). Vielleicht ist sie nur kurz nicht erreichbar, vielleicht hat sich die Schnittstelle geändert – dann \`scripts/chain-data.mjs\` anpassen.`);
  } else if (diffs.length) {
    const rows = diffs.map(d => `| ${d.code} | ${d.app} % | ${d.official.length ? d.official.map(v => v + ' %').join(', ') : 'kein Eintrag'} | ${d.situationOn || '–'} |`);
    parts.push(`### Steuersätze weichen ab\n\nDie Normalsätze in \`chain-transaction/chain.js\` stimmen nicht mit der EU-Datenbank „Taxes in Europe“ überein:\n\n| Land | App | EU-Datenbank | Stand |\n|---|---|---|---|\n${rows.join('\n')}\n\nPrüfen, Sätze anpassen und \`DATA.ratesAsOf\`/\`DATA.ratesChecked\` aktualisieren (beides zeigt die App als Datenstand an).`);
  }
  if (formDue(data, today)) {
    const y = data.formYear + 1;
    parts.push(`### Vordruck ${y} prüfen\n\nDas BMF veröffentlicht um den Jahreswechsel das Vordruckmuster der Umsatzsteuer-Voranmeldung ${y} (USt 1 A). Die Kennzahlen in der App folgen dem Vordruck ${data.formYear}:\n\n- Kennzahlen 41, 42, 43, 45, 61, 62, 66, 69, 81, 89 mit Vordruck und Anleitung ${y} vergleichen\n- Intrastat-Meldeschwellen (Statistisches Bundesamt) prüfen\n- danach \`DATA.formYear\` auf ${y} setzen (die App zeigt es als Datenstand an)`);
  }
  if (!parts.length) return '';
  return `Automatische Prüfung vom ${today} (\`scripts/chain-data.mjs\`). Die App **Reihengeschäft** zeigt den Datenstand unter dem Ergebnis an.\n\n${parts.join('\n\n')}\n`;
}

async function fetchOfficial(chain, today) {
  // Member state ids of TEDB: read from its configuration, so new or renumbered countries need no change here
  const conf = await (await fetch(TEDB.replace('vatSearch', 'configurations'))).json();
  const ids = (conf.countries || []).filter(c => c && c.id != null).map(c => c.id);
  if (!ids.length) throw new Error('keine Länder in der Konfiguration');
  const res = await fetch(TEDB, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ searchForm: { selectedMemberStates: ids, dateFrom: null, dateTo: today.replace(/-/g, '/'), selectedCategories: null, selectedCnCodes: [], selectedCpaCodes: [] }, availableFacets: null, selectedFacets: null }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rates = standardRates(await res.json());
  if (!Object.keys(rates).length) throw new Error('Antwort ohne Normalsätze');
  return rates;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
  const today = opt('--today') || new Date().toISOString().slice(0, 10);
  const chain = loadChain();
  let diffs = [], error = null;
  try { diffs = compareRates(chain.COUNTRIES, await fetchOfficial(chain, today)); }
  catch (e) { error = e.message; }
  const md = report({ data: chain.DATA, diffs, error, today });
  if (opt('--markdown')) writeFileSync(opt('--markdown'), md);
  console.log(md || 'Nothing to do: rates match the EU database, no new form due.');
}
