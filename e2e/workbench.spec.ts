/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from './fixtures'
import { FileUploadHelper } from './helpers/file-upload'
import { jsClick, ensureSidebarClosed } from './helpers/sidebar'

test.describe('Workbench Features', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage
    await page.addInitScript(() => {
      localStorage.clear()
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await ensureSidebarClosed(page)
  })

  test('should display token estimates for uploaded files', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      const files = [
        {
          name: 'test.js',
          path: 'test.js',
          content: 'console.log("hello world");',
        }, // 27 chars -> ~7 tokens
      ]
      await uploadHelper.setFilesOnInput(files)

      // Wait for file to appear in the table
      await expect(
        page
          .getByText('test.js', { exact: true })
          .filter({ visible: true })
          .first()
      ).toBeVisible({
        timeout: 10000,
      })

      // Check for token count in header
      // Header format: "Selected Files (1) | [~]N [tokens|PRECISE TOKENS]"
      const workbenchHeader = page.getByRole('heading', {
        name: /Selected Files/,
      })
      await expect(workbenchHeader).toBeVisible({ timeout: 10000 })
      await expect(workbenchHeader).toContainText(/tokens|Precision|Heuristic/i)
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('should transition from approximate to precise token counts', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      // Use a slightly more complex string to ensure processing time is visible
      const files = [
        {
          name: 'precise.ts',
          path: 'precise.ts',
          content: 'export const x = 1234567890; '.repeat(10),
        },
      ]
      await uploadHelper.setFilesOnInput(files)

      // Use a more specific locator for the workbench header
      const workbenchHeader = page.getByRole('heading', {
        name: /Selected Files/,
      })

      // Wait for background worker to complete and show the Precision label
      await expect(workbenchHeader).toContainText('Precision', {
        timeout: 15000,
      })
      await expect(workbenchHeader).not.toContainText('Heuristic')
      await expect(workbenchHeader).toContainText('Selected Files (1)')
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('should open Quick Look preview for a file', async ({ page }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      const files = [
        {
          name: 'preview.js',
          path: 'preview.js',
          content: 'const x = "quick look content";',
        },
      ]
      await uploadHelper.setFilesOnInput(files)

      // Wait for file to appear
      const fileRow = page
        .getByTestId('file-row')
        .filter({ visible: true })
        .first()
      await expect(fileRow).toBeVisible({ timeout: 10000 })

      // Hover only on desktop where actions are hidden by default
      if (page.viewportSize() && page.viewportSize()!.width >= 640) {
        await fileRow.hover()
      }
      const quickLookButton = fileRow.locator(
        '[data-testid="quick-look-button"]'
      )
      await jsClick(quickLookButton)

      // Verify modal is open
      const modal = page.locator('.fixed.inset-0.z-\\[100\\]')
      await expect(modal).toBeVisible({ timeout: 10000 })

      // Verify content in modal
      await expect(
        modal.getByText('const x = "quick look content"')
      ).toBeVisible()
      await expect(
        modal.getByRole('heading', { name: 'preview.js' })
      ).toBeVisible()

      // Close modal
      const closeButton = modal.locator('button').filter({ hasText: /^Close$/ })
      await jsClick(closeButton)

      // Verify modal is closed
      await expect(modal).not.toBeVisible({ timeout: 10000 })
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('should handle SVG previews in Quick Look', async ({ page }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      const svgContent =
        '<svg><circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" /></svg>'
      const files = [
        { name: 'icon.svg', path: 'icon.svg', content: svgContent },
      ]
      await uploadHelper.setFilesOnInput(files)

      // Open Quick Look - scope button to the visible row to avoid strict mode violations
      const visibleRow = page
        .getByTestId('file-row')
        .filter({ visible: true })
        .first()
      // Hover only on desktop where actions are hidden by default
      if (page.viewportSize() && page.viewportSize()!.width >= 640) {
        await visibleRow.hover()
      }
      await jsClick(visibleRow.locator('[data-testid="quick-look-button"]'))

      // Verify SVG is rendered (the one in the content area, not the icons)
      const modal = page.locator('.fixed.inset-0.z-\\[100\\]')
      const previewArea = modal.locator('.flex-1.overflow-auto')
      await expect(previewArea.locator('svg')).toBeVisible({ timeout: 10000 })
      await expect(modal.getByText('Image Preview')).toBeVisible()
    } finally {
      uploadHelper.cleanup()
    }
  })
})
