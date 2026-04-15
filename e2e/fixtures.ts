/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test as baseTest, expect, type Page, type APIRequestContext } from '@playwright/test';

type TestFixtures = {
  apiContext: APIRequestContext;
};

/**
 * Generate a worker-specific ID for test isolation.
 * Uses testInfo.workerIndex which is unique per worker process.
 */
function getWorkerId(workerIndex: number): string {
  return `worker-${workerIndex}`;
}

/**
 * Extended test fixture with worker-specific ignore file support.
 *
 * This fixture:
 * 1. Provides an API request context with X-Worker-Id header
 * 2. Automatically adds X-Worker-Id header to page requests
 * 3. Enables parallel test execution with isolated ignore files
 */
export const test = baseTest.extend<TestFixtures>({
  // Test-scoped fixture: provides API context with worker ID header
  apiContext: async ({ playwright, baseURL }, use, testInfo) => {
    const workerId = getWorkerId(testInfo.workerIndex);
    const apiContext = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        'X-Worker-Id': workerId,
      },
    });

    await use(apiContext);

    // Cleanup: close the context
    await apiContext.dispose();
  },

  // Override page fixture to add worker ID header
  page: async ({ page }, use, testInfo) => {
    const workerId = getWorkerId(testInfo.workerIndex);
    // Add X-Worker-Id header to all requests from the page
    await page.setExtraHTTPHeaders({
      'X-Worker-Id': workerId,
    });

    await use(page);
  },
});

export { expect };

/**
 * Default ignore list items for resetting the ignore list in tests.
 * Matches the default values from .concatenate-ignore file.
 */
export const DEFAULT_IGNORE_LIST = [
  '.concatenate-ignore',
  '.DS_Store', '.env', '.expo', '.git', '.gradle', '.next',
  '.secrets', '.terraform', '.vagrant', '.vscode',
  '/^\\.concatenate-ignore-worker-\\d+$/',
  '/\\.class$/', '/\\.exe$/',
  '/\\.jar$/', '/\\.log$/', '/\\.o$/', '/\\.obj$/', '/\\.swp$/', '/^__.*cache__$/',
  '/^\\..*_cache$/', 'bin', 'build', 'desktop.ini', 'dist', 'LICENSE', 'node_modules',
  'obj', 'package-lock.json', 'ruff_output.txt', 'target', 'Thumbs.db', 'vendor', 'venv'
];

/**
 * Helper to reset the ignore list via API using the worker-specific context.
 * Includes retry logic for connection issues under high parallelism.
 *
 * @param apiContext - The API request context with worker ID header
 */
export async function resetIgnoreList(apiContext: APIRequestContext): Promise<void> {
  const maxRetries = 3;
  const baseDelay = 100;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await apiContext.post('/api/ignore-list', {
        data: DEFAULT_IGNORE_LIST,
      });

      if (response.ok()) {
        return;
      }

      // If server error (5xx), retry
      if (response.status() >= 500 && attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, baseDelay * (attempt + 1)));
        continue;
      }

      throw new Error(`Failed to reset ignore list — HTTP ${response.status()}`);
    } catch (error) {
      // Retry on network errors
      if (attempt < maxRetries - 1 && (
        error instanceof Error &&
        (error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT'))
      )) {
        await new Promise(r => setTimeout(r, baseDelay * (attempt + 1)));
        continue;
      }
      throw error;
    }
  }
}
