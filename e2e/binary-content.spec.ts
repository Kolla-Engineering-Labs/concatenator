/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from './fixtures'
import { FileUploadHelper } from './helpers/file-upload'
import {
  jsClick,
  ensureSidebarClosed,
  ensureSidebarOpen,
} from './helpers/sidebar'

test.describe('Binary Content Handling', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to page
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
  })

  test('should concatenate a mix of text and binary files without crashing', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      // Ensure we're in Concatenate mode (should be default, but be safe)
      await ensureSidebarOpen(page)
      await jsClick(
        page.getByRole('button', { name: 'Concatenate', exact: true }).first()
      )
      await ensureSidebarClosed(page)

      const files = [
        {
          name: 'README.md',
          path: 'README.md',
          content: '# This is a text file',
        },
        {
          name: 'logo.png',
          path: 'logo.png',
          content: 'fake-binary-content-data', // Extension .png triggers ArrayBuffer read
        },
      ]

      // Ensure sidebar is closed on mobile to see the file list
      await ensureSidebarClosed(page)

      // Upload files
      await uploadHelper.setFilesOnInput(files)

      // Wait for files to appear in the file list
      await expect(
        page
          .getByText('README.md', { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible({ timeout: 15000 })

      await expect(
        page
          .getByText('logo.png', { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible({ timeout: 15000 })

      // Verify file count
      await expect(page.getByText(/Selected Files.*2/)).toBeVisible({
        timeout: 10000,
      })

      // Locate the Concatenate & Download button
      const concatDownloadButton = page.getByRole('button', {
        name: /Concatenate & Download/,
      })
      await concatDownloadButton.waitFor({ state: 'visible', timeout: 10000 })
      await expect(concatDownloadButton).toBeEnabled({ timeout: 10000 })

      // Listen for console errors
      const errors: string[] = []
      page.on('pageerror', (err) => {
        errors.push(err.message)
      })

      // Trigger download
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        jsClick(concatDownloadButton),
      ])

      // Verify download happened
      expect(download.suggestedFilename()).toMatch(/concatenator.*\.markdown/)

      // Verify no crashes occurred
      expect(errors).toEqual([])

      // Verify the page is still interactive
      await expect(page.getByText('Selected Files')).toBeVisible()
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('should handle de-concatenation of binary files safely', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      // Switch to De-concatenate mode
      await ensureSidebarOpen(page)
      await jsClick(page.getByRole('button', { name: 'De-concatenate' }))
      await ensureSidebarClosed(page)

      const files = [
        {
          name: 'not-a-bundle.png',
          path: 'not-a-bundle.png',
          content: 'definitely not a text bundle',
        },
      ]

      // Upload binary file
      await uploadHelper.setFilesOnInput(files)

      // It should show an error
      await expect(
        page.getByText('Failed to read concatenated file.')
      ).toBeVisible({ timeout: 15000 })

      // Verify no crashes occurred
      // (pageerror listener would catch it if I added it here too)
    } finally {
      uploadHelper.cleanup()
    }
  })
})
