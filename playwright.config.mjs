// Browser tests for all pages – run with `npm test`. See tests/README.md.
import { defineConfig } from '@playwright/test';

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
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
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
    use: {
      browserName: 'chromium',
      // Optional: use an already installed Chromium (e.g. when the Playwright version and the
      // installed browser differ). CI installs the matching browser and does not set this.
      ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
    },
  }],
});
