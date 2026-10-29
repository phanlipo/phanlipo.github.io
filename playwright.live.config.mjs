// Tests against the published site – run with `npm run test:live`. See tests/README.md ("Live-Seite").
// LIVE_URL: other address (default https://phanlipo.github.io)
// LIVE_WAIT: seconds to wait until the deployment of the local state is live (default 0; the Action uses 600)
import { defineConfig } from '@playwright/test';

export const LIVE_URL = (process.env.LIVE_URL || 'https://phanlipo.github.io').replace(/\/+$/, '');
// Behind an HTTPS proxy (e.g. cloud sessions) browser and requests use it; GitHub Actions has none
export const PROXY = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;

export default defineConfig({
  testDir: 'tests/live',
  testMatch: '*.spec.mjs',
  globalSetup: './tests/live/wait-for-deploy.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Real network: one retry for a dropped connection (a real problem fails twice)
  retries: 1,
  workers: 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-live' }]] : 'list',
  use: {
    baseURL: LIVE_URL,
    serviceWorkers: 'allow',
    locale: 'de-DE',
    ...(PROXY ? { proxy: PROXY } : {}),
  },
  projects: [{
    name: 'chromium',
    use: {
      browserName: 'chromium',
      ...(process.env.PW_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } } : {}),
    },
  }],
});
