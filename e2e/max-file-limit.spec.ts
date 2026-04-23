/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, resetIgnoreList } from './fixtures'
import { FileUploadHelper } from './helpers/file-upload'
import { ensureSidebarOpen } from './helpers/sidebar'
import type { Locator } from '@playwright/test'

/**
 * Helper function to click an element using JavaScript for better Firefox compatibility
 */
async function jsClick(locator: Locator): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click())
}

/**
 * E2E tests for Max File Limit feature
 * Tests the dropdown UI, persistence, and enforcement during concatenation.
 * Now fully parallel enabled via worker-specific ignore files.
 */
test.describe('Max File Limit Feature', () => {
  test.beforeEach(async ({ page, apiContext }) => {
    // Clear localStorage before navigation to avoid interference from previous test runs
    // Note: concatenator-max-files is NOT cleared here to allow persistence testing
    await page.addInitScript(() => {
      localStorage.removeItem('concatenate-ignore')
      localStorage.removeItem('concatenate-view-mode')
      localStorage.removeItem('concatenate-dark-mode')
      localStorage.removeItem('concat_mode')
      localStorage.removeItem('concat_view')
      localStorage.removeItem('concat_ignore')
    })

    // Reset server-side ignore list BEFORE navigation so client fetches correct state.
    // Uses worker-specific ignore file via X-Worker-Id header from apiContext fixture.
    await resetIgnoreList(apiContext)

    // Use 'domcontentloaded' for faster Firefox navigation
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Ensure sidebar is open to access controls
    await ensureSidebarOpen(page)
  })

  test.describe('UI Visibility', () => {
    test('should show max file limit dropdown in concatenate mode', async ({
      page,
    }) => {
      // Ensure we're in concatenate mode
      const concatenateButton = page.getByRole('button', {
        name: 'Concatenate',
        exact: true,
      })
      await expect(concatenateButton).toHaveClass(/bg-brand-600/, {
        timeout: 10000,
      })

      // Check that the dropdown is visible
      const maxFileLimitSelect = page.locator('select#max-file-limit')
      await expect(maxFileLimitSelect).toBeVisible({ timeout: 10000 })

      // Check that the label is visible
      const label = page.locator('label[for="max-file-limit"]')
      await expect(label).toBeVisible({ timeout: 10000 })
      await expect(label).toHaveText('Performance')
    })

    test('should hide max file limit dropdown in deconcatenate mode', async ({
      page,
    }) => {
      // Switch to deconcatenate mode and wait for the transition to complete
      const deconcatenateButton = page.getByRole('button', {
        name: 'De-concatenate',
        exact: true,
      })
      await jsClick(deconcatenateButton)
      await expect(deconcatenateButton).toHaveClass(/bg-brand-600/, {
        timeout: 5000,
      })

      // Check that the dropdown is hidden
      const maxFileLimitSelect = page.locator('select#max-file-limit')
      await expect(maxFileLimitSelect).not.toBeVisible({ timeout: 10000 })

      // Check that the label is also hidden
      const label = page.locator('label[for="max-file-limit"]')
      await expect(label).not.toBeVisible({ timeout: 10000 })
    })

    test('should show dropdown again when switching back to concatenate mode', async ({
      page,
    }) => {
      // First switch to deconcatenate mode and confirm
      const deconcatenateButton = page.getByRole('button', {
        name: 'De-concatenate',
        exact: true,
      })
      await jsClick(deconcatenateButton)
      await expect(deconcatenateButton).toHaveClass(/bg-brand-600/, {
        timeout: 5000,
      })

      // Then switch back to concatenate mode and confirm
      const concatenateButton = page.getByRole('button', {
        name: 'Concatenate',
        exact: true,
      })
      await jsClick(concatenateButton)
      await expect(concatenateButton).toHaveClass(/bg-brand-600/, {
        timeout: 5000,
      })

      // Check that the dropdown is visible again
      const maxFileLimitSelect = page.locator('select#max-file-limit')
      await expect(maxFileLimitSelect).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Dropdown Options', () => {
    test('should have correct options in dropdown', async ({ page }) => {
      const maxFileLimitSelect = page.locator('select#max-file-limit')
      await expect(maxFileLimitSelect).toBeVisible({ timeout: 10000 })

      // Get all options
      const options = maxFileLimitSelect.locator('option')
      await expect(options).toHaveCount(6)

      // Verify option values and labels
      const expectedOptions = [
        { value: '500', label: '500' },
        { value: '1000', label: '1,000' },
        { value: '2500', label: '2,500' },
        { value: '5000', label: '5,000' },
        { value: '10000', label: '10,000' },
        { value: '20000', label: '20,000' },
      ]

      for (let i = 0; i < expectedOptions.length; i++) {
        const option = options.nth(i)
        await expect(option).toHaveAttribute('value', expectedOptions[i].value)
        await expect(option).toHaveText(new RegExp(expectedOptions[i].label))
      }
    })

    test('should default to 10000', async ({ page }) => {
      const maxFileLimitSelect = page.locator('select#max-file-limit')
      await expect(maxFileLimitSelect).toBeVisible({ timeout: 10000 })

      // Check default value
      await expect(maxFileLimitSelect).toHaveValue('10000')
    })
  })

  test.describe('Persistence', () => {
    test('should persist selected value to localStorage', async ({ page }) => {
      const maxFileLimitSelect = page.locator('select#max-file-limit')
      await expect(maxFileLimitSelect).toBeVisible({ timeout: 10000 })

      // Select 500
      await maxFileLimitSelect.selectOption('500')

      // Wait for localStorage to be updated
      await page.waitForTimeout(300)

      // Verify localStorage value
      const localStorageValue = await page.evaluate(() => {
        return localStorage.getItem('concatenator-max-files')
      })
      expect(localStorageValue).toBe('500')
    })

    test('should restore value from localStorage on page reload', async ({
      page,
      browserName,
    }) => {
      // Skip on WebKit - localStorage persistence across reloads behaves inconsistently
      test.skip(
        browserName === 'webkit',
        'localStorage persistence test skipped on WebKit'
      )

      // Set localStorage value via evaluate on current page
      await page.evaluate(() => {
        localStorage.setItem('concatenator-max-files', '2500')
      })

      // Reload the page
      await page.reload({ waitUntil: 'domcontentloaded' })

      // Check that the value is restored from localStorage
      const restoredSelect = page.locator('select#max-file-limit')
      await expect(restoredSelect).toHaveValue('2500', { timeout: 10000 })
    })
  })

  test.describe('Enforcement', () => {
    test('should show error when file count exceeds selected limit', async ({
      page,
    }) => {
      test.setTimeout(60000)
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Set limit to 500
        const maxFileLimitSelect = page.locator('select#max-file-limit')
        await maxFileLimitSelect.selectOption('500')
        await page.waitForTimeout(300)

        // Create 501 files (over the limit)
        const files = Array.from({ length: 501 }, (_, i) => ({
          name: `file-${i}.txt`,
          path: `project/file-${i}.txt`,
          content: `content ${i}`,
        }))

        // Upload files
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to be processed
        await expect(page.getByText(/Selected Files.*\(501\)/)).toBeVisible({
          timeout: 15000,
        })

        // Try to concatenate
        const concatenateButton = page.getByRole('button', {
          name: /Concatenate & Download/,
        })
        await jsClick(concatenateButton)

        // Check for error message with correct limit
        const errorMessage = page.locator(
          'text=Warning: You are attempting to concatenate over 500 files'
        )
        await expect(errorMessage).toBeVisible({ timeout: 10000 })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should allow concatenation when file count is within limit', async ({
      page,
    }) => {
      test.setTimeout(60000)
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Set limit to 1000
        const maxFileLimitSelect = page.locator('select#max-file-limit')
        await maxFileLimitSelect.selectOption('1000')
        await page.waitForTimeout(300)

        // Create 500 files (under the limit)
        const files = Array.from({ length: 500 }, (_, i) => ({
          name: `file-${i}.txt`,
          path: `project/file-${i}.txt`,
          content: `content ${i}`,
        }))

        // Upload files
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to be processed
        await expect(page.getByText(/Selected Files.*\(500\)/)).toBeVisible({
          timeout: 15000,
        })

        // Try to concatenate
        const concatenateButton = page.getByRole('button', {
          name: /Concatenate & Download/,
        })
        await jsClick(concatenateButton)

        // Wait a bit for download to start
        await page.waitForTimeout(500)

        // No error should be shown for files under limit
        const errorMessage = page.locator(
          'text=Warning: You are attempting to concatenate'
        )
        await expect(errorMessage).not.toBeVisible({ timeout: 5000 })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should use correct limit after changing dropdown value', async ({
      page,
      browserName,
    }) => {
      test.setTimeout(60000)
      // Skip on WebKit due to timeout - simpler tests already cover the core functionality
      test.skip(
        browserName === 'webkit',
        'Complex multi-upload test skipped on WebKit due to performance'
      )

      const uploadHelper = new FileUploadHelper(page)

      try {
        // Upload 600 files
        const files = Array.from({ length: 600 }, (_, i) => ({
          name: `file-${i}.txt`,
          path: `project/file-${i}.txt`,
          content: `content ${i}`,
        }))

        await uploadHelper.setFilesOnInput(files)
        await expect(
          page.getByText(/Selected Files \(\s*600\s*\)/)
        ).toBeVisible({
          timeout: 30000,
        })

        // With default limit (10000), concatenation should work
        const concatenateButton = page.getByRole('button', {
          name: /Concatenate & Download/,
        })
        await jsClick(concatenateButton)
        await page.waitForTimeout(500)

        // No error should be shown
        const errorMessage = page.locator(
          'text=Warning: You are attempting to concatenate'
        )
        await expect(errorMessage).not.toBeVisible({ timeout: 5000 })

        // Clear the files by switching modes — wait for the transition to confirm
        const deconcatenateButton = page.getByRole('button', {
          name: 'De-concatenate',
          exact: true,
        })
        await jsClick(deconcatenateButton)
        await expect(deconcatenateButton).toHaveClass(/bg-brand-600/, {
          timeout: 5000,
        })

        const concatenateModeButton = page.getByRole('button', {
          name: 'Concatenate',
          exact: true,
        })
        await jsClick(concatenateModeButton)
        await expect(concatenateModeButton).toHaveClass(/bg-brand-600/, {
          timeout: 5000,
        })

        // Change limit to 500
        const maxFileLimitSelect = page.locator('select#max-file-limit')
        await maxFileLimitSelect.selectOption('500')
        await page.waitForTimeout(300)

        // Re-upload the same 600 files (or verify they are still there)
        await uploadHelper.setFilesOnInput(files)
        await expect(
          page.getByText(/Selected Files \(\s*600\s*\)/)
        ).toBeVisible({
          timeout: 30000,
        })

        // Try to concatenate - should now fail with 500 limit
        await jsClick(concatenateButton)

        const newErrorMessage = page.getByText(
          /Warning: You are attempting to concatenate over 500 files/i
        )
        await expect(newErrorMessage).toBeVisible({ timeout: 15000 })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })
})
