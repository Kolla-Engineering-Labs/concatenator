/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig, devices } from '@playwright/test'
import * as os from 'os'

/**
 * Playwright configuration for E2E testing the Concatenator app.
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Base URL for all navigation */
  use: {
    baseURL: 'http://localhost:3000',
  },

  /* Enable fully parallel for faster test execution with worker-specific ignore files */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Workers: use 1 on CI for stability, max 4 locally to prevent server overload
   * Worker-specific ignore files prevent race conditions in parallel tests.
   */
  workers: process.env.CI ? 1 : Math.min(4, os.cpus().length),

  /* Unified reporter for CI and local use */
  reporter: process.env.CI ? [['github'], ['html']] : 'html',

  /* Global setup to clean test results before run */
  globalSetup: './e2e/global-setup.ts',

  /* Configure projects for major browsers - each gets unique download directory */
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
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        /* Firefox-specific settings for better reliability */
        actionTimeout: 15000,
        navigationTimeout: 60000,
        launchOptions: {
          downloadsPath: './test-results/downloads/firefox',
          firefoxUserPrefs: {
            'network.dns.disableIPv6': true,
            'network.http.connection-timeout': 30,
            'dom.max_chrome_script_run_time': 60,
            'dom.max_script_run_time': 60,
            'browser.download.startDownloads_inPrivateBrowsing': true,
            'browser.download.folderList': 2,
          },
        },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        /* WebKit-specific timeouts for stability - higher for directory uploads */
        actionTimeout: 30000,
        navigationTimeout: 60000,
        launchOptions: {
          downloadsPath: './test-results/downloads/webkit',
        },
      },
    },
    /* Test against mobile viewports */
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
        /* Mobile Chrome needs higher timeouts for parallel stability */
        actionTimeout: 15000,
        navigationTimeout: 60000,
        launchOptions: {
          downloadsPath: './test-results/downloads/mobile-chrome',
        },
      },
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 12'],
        /* Mobile Safari needs higher timeouts for stability - higher for directory uploads */
        actionTimeout: 30000,
        navigationTimeout: 60000,
        launchOptions: {
          downloadsPath: './test-results/downloads/mobile-safari',
        },
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
