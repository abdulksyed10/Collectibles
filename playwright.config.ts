import { defineConfig } from '@playwright/test';
const port = process.env.PLAYWRIGHT_PORT || '4174';
const baseURL = `http://127.0.0.1:${port}`;
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1, timeout: 30000,
  use: { baseURL, trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: { command: 'node scripts/serve-preview.mjs', url: baseURL, env: { PREVIEW_PORT: port }, reuseExistingServer: false },
});
