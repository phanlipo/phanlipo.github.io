// Lists the tests that passed only on the retry (CI: retries 1, playwright.config.mjs) – so a flaky test
// is never silently green. Reads the JSON report and writes
//   - a warning annotation per test (shown on the pull request),
//   - a table in the job summary ($GITHUB_STEP_SUMMARY) with the error of the first attempt.
// A flaky test is a bug like a red one: find the cause and fix it (AGENTS.md, "Tests").
// Usage: node tests/flaky-summary.mjs [report.json]   (default: test-results/report.json)
import { readFileSync, appendFileSync, existsSync } from 'node:fs';

const file = process.argv[2] || 'test-results/report.json';
if (!existsSync(file)) {
  console.log(`flaky-summary: ${file} not found – nothing to report`);
  process.exit(0);
}
const report = JSON.parse(readFileSync(file, 'utf8'));

// Strips ANSI colours and keeps the first meaningful line of an error message
const firstLine = s => (s || '').replace(/\u001b\[[0-9;]*m/g, '').split('\n').map(l => l.trim()).find(Boolean) || '';

const flaky = [];
(function walk(suite, titles) {
  for (const child of suite.suites || []) walk(child, child.title ? [...titles, child.title] : titles);
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      if (t.status !== 'flaky') continue;
      const failed = (t.results || []).find(r => r.status !== 'passed' && r.status !== 'skipped');
      flaky.push({
        project: t.projectName,
        file: spec.file,
        line: spec.line,
        // the first title is the file name – already in `file`
        title: [...titles.slice(1), spec.title].join(' › '),
        error: firstLine(failed?.error?.message || failed?.errors?.[0]?.message),
      });
    }
  }
})(report, []);

if (!flaky.length) {
  console.log('flaky-summary: no flaky tests');
  process.exit(0);
}

const esc = s => s.replace(/\|/g, '\\|').replace(/</g, '&lt;');
for (const f of flaky) {
  // Workflow command: shown as a warning on the run and the pull request
  const msg = `Flaky (passed only on retry): [${f.project}] ${f.title} – ${f.error}`.replace(/\r?\n/g, ' ');
  console.log(`::warning file=tests/${f.file},line=${f.line},title=Flaky test::${msg}`);
}
const md = [
  `### ⚠️ ${flaky.length} flaky test${flaky.length > 1 ? 's' : ''} (passed only on retry)`,
  '',
  'Find the cause and fix it like a red test – see AGENTS.md, „Tests“. The trace of the first retry is in the report artifact.',
  '',
  '| Project | Test | Error of the first attempt |',
  '|---|---|---|',
  ...flaky.map(f => `| ${f.project} | \`${f.file}:${f.line}\` ${esc(f.title)} | ${esc(f.error).slice(0, 300)} |`),
  '',
].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
else console.log(md);
// test.yml then uploads the report (with the trace) although the run is green
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'flaky=true\n');
