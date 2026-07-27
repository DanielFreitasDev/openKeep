import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Integration tests (Testcontainers) manage their own long timeouts.
    testTimeout: 15_000,
    hookTimeout: 120_000,
  },
});
