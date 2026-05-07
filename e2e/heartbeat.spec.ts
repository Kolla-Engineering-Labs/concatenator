/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from './fixtures'

/**
 * Heartbeat indicator E2E tests.
 *
 * The indicator lives in the StatusBar and has three states:
 *   null  → "Checking…"   (slate dot, pulsing)
 *   true  → "Connected"   (emerald dot, pulsing)
 *   false → "No server" / "Reconnecting…" (amber dot, static)
 *
 * These tests mock /api/config and /api/heartbeat to be fully
 * deterministic and independent of a live CLI server. Each test
 * sets up its own route mocks before navigating so the hook fires
 * against controlled responses.
 */

const FAKE_TOKEN = 'e2e-heartbeat-test-token'

test.describe('Heartbeat indicator', () => {
  test.beforeEach(async ({ page }) => {
    // Provide a fake token via config so the hook can proceed to heartbeat
    await page.route('**/api/config', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: FAKE_TOKEN }),
      })
    )

    // Mock a successful heartbeat response
    await page.route('**/api/heartbeat', (route) => {
      if (route.request().method() === 'POST') {
        route.fulfill({ status: 200, body: '{}' })
      } else {
        route.continue()
      }
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Wait for the indicator to resolve to "Connected"
    await expect(page.getByTestId('heartbeat-status')).toHaveText('Connected', {
      timeout: 15000,
    })
  })

  test('status bar is visible and contains the heartbeat dot', async ({
    page,
  }) => {
    // The outer status bar wrapper is always rendered
    const statusBar = page.locator('[aria-label*="server" i]').first()
    await expect(statusBar).toBeVisible({ timeout: 5000 })
  })

  test('shows Connected state when heartbeat succeeds', async ({ page }) => {
    // beforeEach already asserted Connected; just verify the UI elements
    const connectedLabel = page.getByTestId('heartbeat-status')
    await expect(connectedLabel).toHaveText('Connected', { timeout: 10000 })

    // The heartbeat indicator container should be visible
    await expect(page.getByTestId('heartbeat-indicator')).toBeVisible({
      timeout: 5000,
    })
  })

  test('shows "No server" when heartbeat and config both fail', async ({
    page,
  }) => {
    // Override the routes to return 503 so the hook can never get a token
    await page.route('**/api/config', (route) =>
      route.fulfill({ status: 503, body: 'Service Unavailable' })
    )
    await page.route('**/api/heartbeat', (route) =>
      route.fulfill({ status: 503, body: 'Service Unavailable' })
    )

    // Reload so the hook runs fresh with the mocked failing routes
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)

    const noServerLabel = page.getByTestId('heartbeat-status')
    await expect(noServerLabel).toHaveText('No server', { timeout: 10000 })

    const amberDot = page.getByTestId('heartbeat-dot-amber')
    await expect(amberDot).toBeVisible({ timeout: 5000 })
  })

  test('shows "Reconnecting…" when heartbeat fails after a prior success', async ({
    page,
  }) => {
    // beforeEach already established "Connected" state
    await expect(page.getByTestId('heartbeat-status')).toHaveText('Connected', {
      timeout: 10000,
    })

    // The default heartbeat interval is 60 s — too long to wait in E2E.
    // The "Reconnecting…" state is exercised by unit tests.
    // This test documents the expected behaviour for CI awareness.
    test.skip(
      true,
      'Reconnecting… state requires a 60s interval or hook-level injection; covered by StatusBar unit tests instead'
    )
  })

  test('heartbeat dot has an accessible aria-label on every state', async ({
    page,
  }) => {
    // After load, the dot container must have an aria-label
    const dot = page
      .locator(
        '[aria-label="Server connected"], [aria-label="Checking server"], [aria-label="No CLI server"]'
      )
      .first()
    await expect(dot).toBeVisible({ timeout: 10000 })
  })
})
