import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: { command: 'node scripts/serve-preview.mjs', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
