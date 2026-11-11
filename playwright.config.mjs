// Browser tests for all pages – run with `npm test`. See tests/README.md.
import { defineConfig, webkit, firefox } from '@playwright/test';
import { existsSync } from 'node:fs';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.spec.mjs',
  // Live tests against the published site: npm run test:live (playwright.live.config.mjs)
  testIgnore: 'live/**',
  fullyParallel: true,
  // GitHub runners have 4 cores; the tests mostly wait for the browser, so use all of them
  // (Playwright's default is half). Locally the default stays.
  workers: process.env.CI ? 4 : undefined,
  forbidOnly: !!process.env.CI,
  // CI: one retry, so a single hiccup of a shared runner (service worker install stalls, CPU starved by
  // a parallel OCR test) does not turn the whole run red. A test that passes only on the retry is
  // "flaky": tests/flaky-summary.mjs lists it as a warning on the pull request and in the job summary,
  // with the trace of the retry in the report – it must be fixed like a red test (AGENTS.md, "Tests").
  // A test that fails twice stays red. Locally no retry: every failure shows up at once.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/report.json' }]]
    : 'list',
  use: {
    // Trace (DOM snapshots, network, console) of the retry: shows what happened in the flaky attempt
    trace: process.env.CI ? 'on-first-retry' : 'off',
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: 'allow',
    locale: 'de-DE',
  },
  webServer: {
    command: `node tests/server.mjs ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{
    name: 'chromium',
    // browsers.spec.mjs is the basic check for the other engines
    testIgnore: ['live/**', 'browsers.spec.mjs'],
    use: {
      browserName: 'chromium',
      // Optional: use an already installed Chromium (e.g. when the Playwright version and the
      // installed browser differ). CI installs the matching browser and does not set this.
      ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
    },
  },
  // Basic check of every page in WebKit (Safari, iPhone) and Firefox: tests/browsers.spec.mjs.
  // Always in CI; locally only when the browser is installed (npx playwright install --with-deps webkit firefox).
  ...otherEngines()],
});

function otherEngines() {
  const engines = [['webkit', webkit], ['firefox', firefox]].filter(([name, type]) => {
    if (process.env.CI || existsSync(type.executablePath())) return true;
    console.warn(`playwright.config: ${name} is not installed – tests/browsers.spec.mjs skips it (npx playwright install --with-deps ${name})`);
    return false;
  });
  return engines.map(([name]) => ({ name, testMatch: 'browsers.spec.mjs', use: { browserName: name } }));
}
