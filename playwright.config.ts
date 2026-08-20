/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright configuration for E2E testing the Concatenator app.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  /* Base URL for all navigation */
  use: {
    baseURL: 'http://127.0.0.1:5173',
  },
  timeout: 60000, // Increase global test timeout
  expect: {
    timeout: 10000, // Increase global expect timeout for slower CI runners
  },

  /* Enable fully parallel for faster test execution with worker-specific ignore files */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Workers: use 1 on CI for stability, max 4 locally to prevent server overload */
  workers: process.env.CI ? 1 : 2,

  /* Unified reporter for CI and local use */
  reporter: process.env.CI ? [['github'], ['html']] : 'html',

  /* Configure projects strictly for local Chromium */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          downloadsPath: './test-results/downloads/chromium',
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      KEL_TEST_TOKEN: 'kel-test-token-001',
      NODE_ENV: 'test',
    },
  },
})
