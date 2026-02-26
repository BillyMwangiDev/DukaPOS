import { defineConfig } from 'playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: process.env.CI ? 60000 : 30000,
  expect: {
    timeout: 5000
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    // Use system Chrome via channel; remove hardcoded executablePath for cross-machine compatibility
    channel: 'chrome',
  },
});
