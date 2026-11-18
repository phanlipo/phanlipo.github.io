// scripts/chain-data.mjs: the monthly data check of "Reihengeschäft" – without network, with a TEDB answer in the
// form its web page receives. Only differences and due checks make a report (and so an issue).
import { test, expect } from '@playwright/test';
import { loadChain, standardRates, compareRates, formDue, report } from '../scripts/chain-data.mjs';

const answer = list => ({ result: list.map(([isoCode, type, value, situationOn]) => ({ isoCode, type, rates: [{ value, situationOn }] })) });

test('reads the app data from chain.js', () => {
  const chain = loadChain();
  expect(chain.DATA).toEqual({ ratesAsOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), ratesChecked: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), formYear: expect.any(Number) });
  expect(chain.COUNTRIES.DE).toMatchObject({ eu: true, rate: 19 });
});

test('compares standard rates; reduced rates, the Canary Islands entry and non-EU countries do not matter', () => {
  const countries = {
    DE: { code: 'DE', eu: true, rate: 19 }, GR: { code: 'GR', eu: true, rate: 24 }, ES: { code: 'ES', eu: true, rate: 21 },
    FI: { code: 'FI', eu: true, rate: 25.5 }, CH: { code: 'CH', eu: false, rate: null }, MT: { code: 'MT', eu: true, rate: 18 },
  };
  const official = standardRates(answer([
    ['DE', 'STANDARD', 19, '2026/07/01'], ['DE', 'REDUCED', 7, '2026/07/01'], ['EL', 'STANDARD', 24, '2026/01/01'],
    ['ES', 'STANDARD', 7, '2026/07/01'], ['ES', 'STANDARD', 21, '2026/07/01'], ['FI', 'STANDARD', 26, '2027/01/01'],
  ]));
  expect(official.DE).toEqual([{ value: 19, situationOn: '2026-07-01' }]);
  expect(compareRates(countries, official)).toEqual([
    { code: 'FI', app: 25.5, official: [26], situationOn: '2027-01-01' },
    { code: 'MT', app: 18, official: [], situationOn: '' },
  ]);
});

test('report: empty when nothing is to do; rates, form year and unreachable database each make one', () => {
  const data = { ratesAsOf: '2026-07-01', ratesChecked: '2026-11-18', formYear: 2026 };
  expect(report({ data, diffs: [], error: null, today: '2026-12-14' })).toBe('');
  expect(formDue(data, '2026-12-15')).toBe(true);
  const form = report({ data, diffs: [], error: null, today: '2026-12-15' });
  expect(form).toContain('### Vordruck 2027 prüfen');
  expect(form).not.toContain('Steuersätze');
  const rates = report({ data, diffs: [{ code: 'FI', app: 25.5, official: [26], situationOn: '2027-01-01' }], error: null, today: '2027-02-05' });
  expect(rates).toContain('| FI | 25.5 % | 26 % | 2027-01-01 |');
  expect(rates).toContain('### Vordruck 2027 prüfen');
  expect(report({ data: { ...data, formYear: 2027 }, diffs: [], error: 'HTTP 500', today: '2027-02-05' })).toContain('### Steuersätze nicht prüfbar');
});
