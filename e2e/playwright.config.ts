import { defineConfig, devices } from '@playwright/test';

/**
 * E2E suite. Runs against the dev stack:
 *   - API on :3000 (started with a dedicated test database)
 *   - Vite dev server on :5173 proxying /api
 * CI starts both via the webServer entries below.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
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
    },
  ],
});
