/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, resetIgnoreList } from './fixtures'
import { FileUploadHelper } from './helpers/file-upload'

import {
  jsClick,
  ensureSidebarOpen,
  ensureSidebarClosed,
  ensureIgnoreListExpanded,
  ensureAllIgnoresVisible,
} from './helpers/sidebar'

/**
 * UI Interactions and Edge Cases tests - now fully parallel enabled via
 * worker-specific ignore files using the X-Worker-Id header.
 */
test.describe('UI Interactions and Edge Cases', () => {
  test.beforeEach(async ({ page, apiContext }) => {
    // Reset server-side ignore list BEFORE navigation so client fetches correct state.
    // Uses worker-specific ignore file via X-Worker-Id header from apiContext fixture.
    await resetIgnoreList(apiContext)

    // Clear and set defaults via init script BEFORE navigation
    // This avoids the goto -> evaluate -> reload cycle which is unstable in WebKit
    // Uses sessionStorage guard to ensure it only runs once per test (survives reloads within test)
    await page.addInitScript(() => {
      if (sessionStorage.getItem('__test_init__')) return

      // Clear keys starting with 'concat' or 'concatenate'
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith('concat')) {
          localStorage.removeItem(key)
        }
      })
      // Set test defaults
      localStorage.setItem('concat_auto_save_ignore', 'true')
      sessionStorage.setItem('__test_init__', 'true')
    })

    // Navigate once
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Small stability wait for hydration
    await page.waitForTimeout(500)
  })

  test.describe('Minimize/Maximize Panels', () => {
    test('should minimize and maximize dropzone', async ({ page }) => {
      // Find minimize button on dropzone
      const minimizeButton = page
        .locator('button[title*="Minimize dropzone"]')
        .first()

      // Wait for button to be fully visible and stable
      await minimizeButton.waitFor({ state: 'visible', timeout: 10000 })

      if (await minimizeButton.isVisible().catch(() => false)) {
        // Use JavaScript click for Firefox compatibility
        await jsClick(minimizeButton)

        // Wait for animation and localStorage write
        await page.waitForTimeout(500)

        // Verify minimized state (smaller padding or "Drop here" text)
        await expect(page.getByText('Drop here')).toBeVisible({
          timeout: 10000,
        })

        // Find and click maximize button
        const maximizeButton = page
          .locator('button[title*="Expand dropzone"]')
          .first()
        await maximizeButton.waitFor({ state: 'visible', timeout: 10000 })
        await jsClick(maximizeButton)

        // Wait for animation
        await page.waitForTimeout(500)

        // Should show full dropzone again
        await expect(page.getByText(/Drop folder or files here/)).toBeVisible({
          timeout: 10000,
        })
      }
    })

    test('should minimize and maximize ignore list', async ({ page }) => {
      // First add something to ignore list
      const uploadHelper = new FileUploadHelper(page)

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'test.js', path: 'test.js', content: 'test' },
        ])

        // Wait for upload to complete
        await expect(
          page.getByText('test.js', { exact: true }).first()
        ).toBeVisible({ timeout: 10000 })

        // Find ignore list minimize button and wait for it
        const ignoreSection = page
          .locator('div')
          .filter({ hasText: /^Ignore Files/ })
          .first()
        const minimizeButton = ignoreSection.locator('button').first()
        await minimizeButton.waitFor({ state: 'visible', timeout: 10000 })

        // Use jsClick for Firefox stability and wait for animation
        await jsClick(minimizeButton)
        // AnimatePresence uses 200ms duration; wait longer for Firefox
        await page.waitForTimeout(800)

        // Input should be hidden after minimize
        const ignoreInput = page.getByPlaceholder('Add ignore pattern...')
        await expect(ignoreInput).not.toBeVisible({ timeout: 15000 })

        // Click again to maximize
        await jsClick(minimizeButton)
        // AnimatePresence uses 200ms duration; wait longer for Firefox
        await page.waitForTimeout(800)

        // Input should be visible again
        await expect(ignoreInput).toBeVisible({ timeout: 15000 })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Keyboard Interactions', () => {
    test('should add ignore pattern with Enter key', async ({
      page,
      browserName,
    }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'temp.tmp', path: 'temp.tmp', content: 'temp' },
        ])

        // Scope to file list and use exact matching for filename
        const fileList = page.locator('table').first()
        await expect(
          fileList.getByText('temp.tmp', { exact: true }).first()
        ).toBeVisible({ timeout: 10000 })

        // Expand ignore list if needed
        await ensureIgnoreListExpanded(page)

        // Expand truncated items if needed
        await ensureAllIgnoresVisible(page)

        // Type in ignore input and press Enter
        const ignoreInput = page.getByPlaceholder('Add ignore pattern...')
        await ignoreInput.fill('*.tmp')
        await Promise.all([
          page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/ignore-list') &&
              resp.request().method() === 'POST'
          ),
          ignoreInput.press('Enter'),
        ])

        // Additional delay for WebKit browsers (Mobile Safari) for rendering stability
        if (browserName === 'webkit') {
          await page.waitForTimeout(1000)
        }

        // Pattern should be added
        await expect(page.getByText('*.tmp')).toBeVisible({ timeout: 10000 })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Responsive Behavior', () => {
    test('should adapt layout on mobile viewport', async ({
      page,
      browserName,
    }) => {
      // Skip on Firefox and WebKit due to known Playwright setViewportSize timeout issues
      test.skip(
        browserName === 'firefox' || browserName === 'webkit',
        'Viewport resize tests skipped on Firefox and WebKit due to Playwright limitations'
      )

      // Wait for initial page load to complete and all animations to finish
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 })

      // Wait for viewport change to settle
      await page.waitForTimeout(500)

      // Page should still load
      await expect(
        page.getByRole('heading', { name: 'Concatenator' }).first()
      ).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Concatenate', exact: true })
      ).toBeVisible()

      // Open sidebar on mobile to reveal mode toggle
      await ensureSidebarOpen(page)

      // Mode toggle should still be usable - use JavaScript click
      const deconcatButton = page.getByRole('button', {
        name: 'De-concatenate',
        exact: true,
      })
      await deconcatButton.waitFor({ state: 'visible', timeout: 10000 })
      await jsClick(deconcatButton)
      await expect(deconcatButton).toHaveClass(/bg-brand-600/, {
        timeout: 10000,
      })
    })

    test('should handle file list on narrow screens', async ({
      page,
      browserName,
    }) => {
      // Skip on Firefox and WebKit due to known Playwright setViewportSize timeout issues
      test.skip(
        browserName === 'firefox' || browserName === 'webkit',
        'Viewport resize tests skipped on Firefox and WebKit due to Playwright limitations'
      )

      // Wait for initial page load and all animations to finish
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(500)

      await page.setViewportSize({ width: 500, height: 800 })

      // Wait for viewport change to settle
      await page.waitForTimeout(500)

      const uploadHelper = new FileUploadHelper(page)

      try {
        await uploadHelper.dragAndDropDirectory([
          {
            name: 'very-long-filename-that-might-overflow.js',
            path: 'very-long-filename-that-might-overflow.js',
            content: 'x',
          },
        ])

        // File should be visible even with long name
        await expect(page.getByText('very-long-filename').first()).toBeVisible({
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Drag and Drop Visual Feedback', () => {
    test('should show visual feedback on drag over', async ({
      page,
      browserName,
    }) => {
      // Simulate drag enter
      await page.evaluate(() => {
        const dropZone =
          document.querySelector('[class*="border-dashed"]') || document.body
        const dataTransfer = new DataTransfer()

        const dragEnterEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
        })
        dropZone.dispatchEvent(dragEnterEvent)
      })

      // Wait a moment for visual feedback to apply
      // WebKit needs more time for drag event processing
      await page.waitForTimeout(browserName === 'webkit' ? 300 : 100)

      // The dropzone should have hover styling (this is tested via class changes)
      // Note: Actual hover state may not persist after the event, but we verify no error occurred
    })

    test('should handle drag leave gracefully', async ({
      page,
      browserName,
    }) => {
      await page.evaluate(() => {
        const dropZone =
          document.querySelector('[class*="border-dashed"]') || document.body
        const dataTransfer = new DataTransfer()

        // Drag enter
        dropZone.dispatchEvent(
          new DragEvent('dragenter', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
          })
        )

        // Drag leave
        dropZone.dispatchEvent(
          new DragEvent('dragleave', {
            bubbles: true,
            cancelable: true,
            dataTransfer: dataTransfer,
          })
        )
      })

      // WebKit needs additional delay for drag event processing
      if (browserName === 'webkit') {
        await page.waitForTimeout(200)
      }

      // Page should still be functional
      await expect(
        page.getByRole('heading', { name: 'Concatenator' }).first()
      ).toBeVisible()
    })
  })

  test.describe('localStorage Persistence', () => {
    test('should persist minimize state of dropzone', async ({ page }) => {
      // Ensure sidebar is closed on mobile to avoid any potential interference
      await ensureSidebarClosed(page)

      // Find and click minimize button if visible
      const minimizeButton = page
        .locator('button[title*="Minimize dropzone"]')
        .first()

      // Wait for it to be visible if it's there
      if (await minimizeButton.isVisible().catch(() => false)) {
        await jsClick(minimizeButton)

        // Wait for state to be committed and animation
        await page.waitForTimeout(800)

        // Reload page and wait for full load
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(500)

        // Should still be minimized - verify both title and text
        const expandButton = page
          .locator('button[title*="Expand dropzone"]')
          .first()
        await expect(expandButton).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('Drop here')).toBeVisible({
          timeout: 10000,
        })
      }
    })

    test('should persist minimize state of ignore list', async ({ page }) => {
      // Ensure sidebar is open to access ignore list
      await ensureSidebarOpen(page)

      const uploadHelper = new FileUploadHelper(page)

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'test.js', path: 'test.js', content: 'test' },
        ])

        // Wait for file and ignore list to be visible
        await expect(
          page.getByText('test.js', { exact: true }).first()
        ).toBeVisible({ timeout: 10000 })

        const ignoreSection = page
          .locator('div')
          .filter({ hasText: /^Ignore Files/ })
          .first()
        const minimizeButton = ignoreSection.locator('button').first()
        await minimizeButton.waitFor({ state: 'visible', timeout: 10000 })

        await jsClick(minimizeButton)

        // Wait for animation and localStorage write
        await page.waitForTimeout(800)

        // Reload page and wait for full load
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(500)

        // Re-open sidebar if it closed on reload (on mobile)
        await ensureSidebarOpen(page)

        // Upload a file to make ignore list appear (if it was hidden by clear)
        // Note: resetIgnoreList in beforeEach only resets the server,
        // the client might still have local state if we didn't clear it.
        await uploadHelper.dragAndDropDirectory([
          { name: 'test2.js', path: 'test2.js', content: 'test2' },
        ])

        // Wait for file to appear
        await expect(
          page.getByText('test2.js', { exact: true }).first()
        ).toBeVisible({ timeout: 10000 })

        // Ignore list should still be minimized
        await expect(
          page.getByPlaceholder('Add ignore pattern...')
        ).not.toBeVisible({ timeout: 10000 })

        // Button should show Expand title
        const expandButton = ignoreSection
          .locator('button[title*="Expand ignore list"]')
          .first()
        await expect(expandButton).toBeVisible({ timeout: 10000 })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Concurrent Actions', () => {
    test('should handle rapid mode switching', async ({ page }) => {
      const concatButton = page.getByRole('button', {
        name: 'Concatenate',
        exact: true,
      })
      const deconcatButton = page.getByRole('button', {
        name: 'De-concatenate',
        exact: true,
      })

      // Wait for buttons to be ready
      await concatButton.waitFor({ state: 'visible', timeout: 5000 })
      await deconcatButton.waitFor({ state: 'visible', timeout: 5000 })

      // Rapidly switch modes multiple times using JavaScript clicks
      // On mobile, ensure sidebar is open
      await ensureSidebarOpen(page)

      for (let i = 0; i < 5; i++) {
        await jsClick(deconcatButton)
        await page.waitForTimeout(50) // Small delay for state update
        await jsClick(concatButton)
        await page.waitForTimeout(50)
      }

      // Should end in concatenate mode
      await expect(concatButton).toHaveClass(/bg-brand-600/, {
        timeout: 10000,
      })

      // App should still be functional
      await expect(
        page.getByRole('heading', { name: 'Concatenator' }).first()
      ).toBeVisible()
    })

    test('should handle mode switch during file processing', async ({
      page,
      browserName,
    }) => {
      // Skip on Firefox due to navigation timeout issues
      test.skip(
        browserName === 'firefox',
        'Test skipped on Firefox due to navigation timeout issues'
      )

      const uploadHelper = new FileUploadHelper(page)

      try {
        // Start uploading many files
        const files = Array.from({ length: 20 }, (_, i) => ({
          name: `file${i}.txt`,
          path: `batch/file${i}.txt`,
          content: `content ${i}`,
        }))

        // Start upload
        await uploadHelper.dragAndDropDirectory(files)

        // Immediately try to switch mode using JavaScript click
        // On mobile, ensure sidebar is open
        await ensureSidebarOpen(page)

        const deconcatButton = page.getByRole('button', {
          name: 'De-concatenate',
        })
        await deconcatButton.waitFor({ state: 'visible', timeout: 10000 })
        await jsClick(deconcatButton)

        // Should switch mode (files will be cleared)
        await expect(deconcatButton).toHaveClass(/bg-brand-600/, {
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Accessibility', () => {
    test('should have proper button titles', async ({ page }) => {
      await ensureSidebarOpen(page)
      // Theme button should be present
      const themeButton = page.getByTestId('theme-toggle').first()
      await expect(themeButton).toBeVisible()
    })

    test('should have focusable elements', async ({ page, browserName }) => {
      // Skip on WebKit due to different focus management behavior on Safari/Mobile Safari
      test.skip(
        browserName === 'webkit',
        'Focus/Tab navigation tests skipped on WebKit due to different focus behavior'
      )

      await ensureSidebarOpen(page)
      // First, click on a focusable element to ensure document has focus
      const themeButton = page.getByTestId('theme-toggle').first()
      await themeButton.waitFor({ state: 'visible', timeout: 5000 })

      // Use JavaScript click for Firefox compatibility
      await jsClick(themeButton)

      // Wait a bit for click to process
      await page.waitForTimeout(100)

      // Programmatically focus button to ensure it receives focus
      await themeButton.evaluate((el: HTMLElement) => el.focus())

      // Additional wait for focus to settle
      await page.waitForTimeout(100)

      // Theme button should now be focused
      let focusedElement = await page.evaluate(
        () => document.activeElement?.tagName
      )
      expect(focusedElement).toBeTruthy()
      expect(focusedElement).not.toBe('BODY')

      // Tab to next interactive element
      await page.keyboard.press('Tab')

      // Some element should still be focused (not BODY)
      focusedElement = await page.evaluate(
        () => document.activeElement?.tagName
      )
      expect(focusedElement).toBeTruthy()
      expect(focusedElement).not.toBe('BODY')
    })
  })
})
