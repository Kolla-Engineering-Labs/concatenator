/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  test as baseTest,
  expect,
  type APIRequestContext,
} from '@playwright/test'
import { DEFAULT_IGNORE_LIST as CORE_IGNORE_LIST } from '../src/core/constants'
import 'dotenv/config'

type TestFixtures = {
  apiContext: APIRequestContext
}

/**
 * Generate a worker-specific ID for test isolation.
 * Uses testInfo.workerIndex which is unique per worker process.
 * Returns just the numeric index (e.g., "0", "1") for security simplicity.
 */
function getWorkerId(workerIndex: number): string {
  return String(workerIndex)
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
    const workerId = getWorkerId(testInfo.workerIndex)
    const apiToken = process.env.KEL_TEST_TOKEN || 'kel-test-token-001'
    const apiContext = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: {
        'X-Worker-Id': workerId,
        ...(apiToken && { 'X-Concatenator-Token': apiToken }),
      },
    })

    await use(apiContext)

    // Cleanup: close the context
    await apiContext.dispose()
  },

  // Override page fixture to add worker ID header and mock routes
  page: async ({ page }, use, testInfo) => {
    const workerId = getWorkerId(testInfo.workerIndex)
    // Add X-Worker-Id and auth token headers to all requests from the page
    const apiToken = process.env.KEL_TEST_TOKEN || 'kel-test-token-001'
    await page.setExtraHTTPHeaders({
      'X-Worker-Id': workerId,
      ...(apiToken && { 'X-Concatenator-Token': apiToken }),
    })

    // Also persist the token and workerId to sessionStorage so ApiClient can find them
    await page.addInitScript(
      ({ injectedToken, workerId }) => {
        window.sessionStorage.setItem('CONCATENATOR_TOKEN', injectedToken)
        window.sessionStorage.setItem('WORKER_ID', workerId)
      },
      { injectedToken: apiToken, workerId: testInfo.workerIndex.toString() }
    )

    // Mock /api/vfs to return an empty tree so tests start in a clean state
    await page.route('**/api/vfs', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tree: { name: 'root', path: '.', kind: 'directory', children: [] },
          partial: false,
        }),
      })
    })

    // Enable autoSaveIgnore guard-rail and showIgnored transparency by default for E2E tests
    await page.addInitScript(() => {
      window.localStorage.setItem('concat_auto_save_ignore', 'true')
      window.localStorage.setItem('concat_show_ignored', 'true')
    })

    await use(page)
  },
})

export { expect }

/**
 * Default ignore list items for resetting the ignore list in tests.
 * Matches the default values from core constants.
 */
export const DEFAULT_IGNORE_LIST = CORE_IGNORE_LIST

/**
 * Helper to reset the ignore list via API using the worker-specific context.
 * Includes retry logic for connection issues under high parallelism.
 *
 * @param apiContext - The API request context with worker ID header
 */
export async function resetIgnoreList(
  apiContext: APIRequestContext
): Promise<void> {
  const maxRetries = 3
  const baseDelay = 100

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await apiContext.post('/api/ignore-list', {
        data: DEFAULT_IGNORE_LIST,
        timeout: 10000,
      })

      if (response.ok()) {
        return
      }

      // If server error (5xx), retry
      if (response.status() >= 500 && attempt < maxRetries - 1) {
        await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)))
        continue
      }

      throw new Error(`Failed to reset ignore list — HTTP ${response.status()}`)
    } catch (error) {
      // Retry on network errors (including WebKit-specific "socket hang up")
      if (
        attempt < maxRetries - 1 &&
        error instanceof Error &&
        (error.message.includes('ECONNRESET') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('socket hang up'))
      ) {
        await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1) * 2))
        continue
      }
      throw error
    }
  }
}
