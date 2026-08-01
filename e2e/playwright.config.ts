import { defineConfig, devices } from '@playwright/test';

/**
 * Runs against the dev stack: Postgres (compose), API :3000, Vite :5173.
 * Locally, running servers are reused; CI boots them via the webServer
 * commands (the db must already be up + migrated — see ci.yml).
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 30_000,
  /**
   * Ten seconds rather than the default five, because the thing being waited on
   * is a Vite **dev** server: every test opens a fresh context, so nothing is
   * cached and a boot pulls ~270 unbundled modules. Measured on a loaded
   * machine, one batch of those took 3.5s and the first `expect` after
   * `goto('/')` lost the race — the flakiness this suite showed locally was
   * almost entirely that clock, spread across whichever specs happened to boot
   * while the box was busy. The waits themselves are still bounded, and the
   * 30s per-test timeout is unchanged, so a genuinely stuck UI still fails.
   */
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    locale: 'en-US',
    timezoneId: 'America/Fortaleza',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /(offline-pwa|share-target)\.spec\.ts/,
    },
    {
      // Production build behind `vite preview`: the service worker is active,
      // so the offline-reload flow and the share target (a POST only the
      // worker answers) can be exercised for real.
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
      testMatch: /(offline-pwa|share-target)\.spec\.ts/,
    },
  ],
  webServer: [
    {
      command: 'pnpm --filter @openkeep/server dev',
      url: 'http://localhost:3000/api/healthz',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @openkeep/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @openkeep/web build && pnpm --filter @openkeep/web preview',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      cwd: '..',
      timeout: 180_000,
    },
  ],
});
