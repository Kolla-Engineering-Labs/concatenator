/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, devices } from '@playwright/test'

// Use iPhone 14 for touch device simulation
test.use({ ...devices['iPhone 14'] })

/**
 * E2E tests for the Adaptive File Input system.
 * Verifies that the UI adapts correctly on touch devices.
 */
test.describe('Adaptive File Input', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })

  test('should display touch-specific labels on mobile', async ({ page }) => {
    // Verify the primary label
    await expect(page.getByText(/Tap to select folder or files/i)).toBeVisible({
      timeout: 10000,
    })

    // Verify the secondary helper text
    await expect(page.getByText(/Browse local or cloud storage/i)).toBeVisible()
  })

  test('should trigger native file picker on tap', async ({ page }) => {
    // Start listening for the file chooser event before clicking
    const fileChooserPromise = page.waitForEvent('filechooser')

    // Tap the Drop Zone container (targeted by the test ID)
    await page.getByTestId('upload-zone-container').click()

    // If the click() method on the hidden input was triggered,
    // Playwright will catch the filechooser event
    const fileChooser = await fileChooserPromise
    expect(fileChooser).toBeDefined()

    // Check that it's a multiple-file input as configured
    expect(fileChooser.isMultiple()).toBe(true)
  })

  test('should apply active scale effect on tap', async ({ page }) => {
    const dropZone = page.getByTestId('upload-zone-container')

    // We can check if the class for active state is present,
    // though :active only applies during the click.
    // Our implementation adds 'active:scale-95' class.
    await expect(dropZone).toHaveClass(/active:scale-95/)
  })
})
