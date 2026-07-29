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
      testIgnore: /offline-pwa\.spec\.ts/,
    },
    {
      // Production build behind `vite preview`: the service worker is active,
      // so the offline-reload flow can be exercised for real.
      name: 'pwa',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
      testMatch: /offline-pwa\.spec\.ts/,
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
