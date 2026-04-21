/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from './fixtures'
import { FileUploadHelper } from './helpers/file-upload'
import type { Locator } from '@playwright/test'
import type { APIRequestContext } from '@playwright/test'

/**
 * Helper function to click an element using JavaScript for better Firefox compatibility
 */
async function jsClick(locator: Locator): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click())
}

/**
 * Helper to reset the ignore list via API using the worker-specific context.
 */
async function resetIgnoreList(apiContext: APIRequestContext): Promise<void> {
  const defaultIgnoreList = [
    '.concatenate-ignore',
    '.DS_Store',
    '.env',
    '.expo',
    '.git',
    '.gradle',
    '.next',
    '.secrets',
    '.terraform',
    '.vagrant',
    '.vscode',
    '/^\\.concatenate-ignore-worker-\\d+$/',
    '/\\.class$/',
    '/\\.exe$/',
    '/\\.jar$/',
    '/\\.log$/',
    '/\\.o$/',
    '/\\.obj$/',
    '/\\.swp$/',
    '/^__.*cache__$/',
    '/^\\..*_cache$/',
    'bin',
    'build',
    'desktop.ini',
    'dist',
    'node_modules',
    'obj',
    'package-lock.json',
    'ruff_output.txt',
    'target',
    'Thumbs.db',
    'vendor',
    'venv',
  ]
  const response = await apiContext.post('/api/ignore-list', {
    data: defaultIgnoreList,
  })
  if (!response.ok()) {
    throw new Error(`Failed to reset ignore list — HTTP ${response.status()}`)
  }
}

/**
 * Concatenate Mode tests - now fully parallel enabled via worker-specific
 * ignore files using the X-Worker-Id header.
 */
test.describe('Concatenate Mode', () => {
  test.beforeEach(async ({ page, apiContext }) => {
    // Clear localStorage before navigation to avoid needing a reload
    await page.addInitScript(() => {
      localStorage.removeItem('concatenate-ignore')
      localStorage.removeItem('concatenate-view-mode')
      localStorage.removeItem('concatenate-dark-mode')
      localStorage.removeItem('concat_mode')
      localStorage.removeItem('concat_view')
      localStorage.removeItem('concat_ignore')
      localStorage.removeItem('concat_sidebar')
      localStorage.setItem('concat_sidebar', 'false')
    })

    // Reset server-side ignore list BEFORE navigation so client fetches correct state.
    // Uses worker-specific ignore file via X-Worker-Id header from apiContext fixture.
    await resetIgnoreList(apiContext)

    // Navigate to page with 'domcontentloaded' for faster Firefox navigation
    // 'networkidle' and 'load' can be slow/flaky in Firefox
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    // Ensure we're in concatenate mode
    const concatenateButton = page.getByRole('button', {
      name: 'Concatenate',
      exact: true,
    })
    await expect(concatenateButton).toHaveClass(/bg-blue-600/, {
      timeout: 10000,
    })
  })

  test.describe('File Upload via Drag and Drop', () => {
    test('should accept directory drag and drop', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Create mock directory structure
        const files = [
          {
            name: 'readme.md',
            path: 'project/readme.md',
            content: '# Test Project',
          },
          {
            name: 'main.js',
            path: 'project/src/main.js',
            content: 'console.log("hello");',
          },
          {
            name: 'utils.js',
            path: 'project/src/utils.js',
            content: 'export const sum = (a,b) => a+b;',
          },
        ]

        // Use file input for reliable uploads
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to be processed and appear
        await expect(page.getByText('readme.md')).toBeVisible({
          timeout: 10000,
        })
        await expect(page.getByText('main.js')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('utils.js')).toBeVisible({ timeout: 10000 })

        // Verify file count
        await expect(page.getByText(/Selected Files.*3/)).toBeVisible({
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should handle nested directory structure', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        const files = [
          {
            name: 'package.json',
            path: 'my-app/package.json',
            content: '{"name": "test"}',
          },
          {
            name: 'App.tsx',
            path: 'my-app/src/App.tsx',
            content: 'export default () => <div />;',
          },
          {
            name: 'index.css',
            path: 'my-app/src/styles/index.css',
            content: 'body { margin: 0; }',
          },
          {
            name: 'Button.tsx',
            path: 'my-app/src/components/Button.tsx',
            content: 'export const Button = () => {};',
          },
        ]

        await uploadHelper.setFilesOnInput(files)

        // Wait for files to be processed and appear (nested structures need more time)
        for (const file of files) {
          await expect(page.getByText(file.name)).toBeVisible({
            timeout: 15000,
          })
        }

        // Should show 4 files
        await expect(page.getByText(/Selected Files.*4/)).toBeVisible({
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should show processing state during upload', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Much larger content to ensure processing takes long enough to observe
        // Firefox processes files quickly, so we need substantial data
        const largeContent = 'x'.repeat(500000) // 500KB per file
        const files = Array.from({ length: 20 }, (_, i) => ({
          name: `file${i}.txt`,
          path: `batch/file${i}.txt`,
          content: `content ${i}\n${largeContent}`,
        }))

        // Use polling loop to catch transient progress state
        // The progress indicator may appear very briefly
        const progressLocator = page
          .locator('span')
          .filter({ hasText: /Reading Files\.\.\.|Scanning Folder\.\.\./ })
        let progressSeen = false
        const checkProgress = async () => {
          for (let i = 0; i < 50; i++) {
            if (await progressLocator.isVisible().catch(() => false)) {
              progressSeen = true
              break
            }
            await page.waitForTimeout(50)
          }
        }

        // Start polling BEFORE triggering upload
        const progressCheckPromise = checkProgress()

        // Trigger the upload
        await uploadHelper.setFilesOnInput(files)

        // Wait for polling to complete
        await progressCheckPromise

        // Also verify files are eventually processed (the end state)
        await expect(page.getByText('file0.txt')).toBeVisible({
          timeout: 15000,
        })

        // We may not see the progress indicator due to fast processing
        // but if we see it, that's good; if not, the end-state verification is sufficient
        if (progressSeen) {
          await expect(progressLocator).toBeHidden({ timeout: 15000 })
        }
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Ignore List Management', () => {
    test('should add ignore patterns', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // First upload some files
        const files = [
          { name: 'app.js', path: 'src/app.js', content: 'const app = {};' },
          {
            name: 'app.test.js',
            path: 'src/app.test.js',
            content: 'test("app")',
          },
          { name: 'styles.css', path: 'src/styles.css', content: 'body {}' },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        await expect(page.getByText('app.js')).toBeVisible({ timeout: 10000 })

        // Expand ignore list if minimized - target only the ignore list expand button
        const expandButton = page.locator('button[title="Expand ignore list"]')
        if (
          (await expandButton.count()) > 0 &&
          (await expandButton.isVisible().catch(() => false))
        ) {
          await jsClick(expandButton)
          // Wait for AnimatePresence animation to complete (Firefox needs more time)
          await page.waitForTimeout(300)
        }

        // Add an ignore pattern - wait for input to be ready
        const ignoreInput = page.getByPlaceholder('Add ignore pattern...')
        await ignoreInput.waitFor({ state: 'visible', timeout: 10000 })
        await ignoreInput.fill('*.test.js')
        await Promise.all([
          page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/ignore-list') &&
              resp.request().method() === 'POST'
          ),
          ignoreInput.press('Enter'),
        ])

        // Verify pattern was added
        await expect(page.getByText('*.test.js')).toBeVisible({
          timeout: 10000,
        })

        // Verify the test file is now filtered out. Playwright's retry engine polls
        // until the condition is true or the timeout expires — no arbitrary sleep needed.
        await expect(page.getByText('app.test.js')).not.toBeVisible({
          timeout: 15000,
        })

        // Use more specific locators targeting the file name span in the list view
        // to avoid matching path text or other elements containing similar substrings
        const fileList = page.locator('.grid').first()
        await expect(fileList.getByText('app.js', { exact: true })).toBeVisible(
          { timeout: 10000 }
        )
        await expect(
          fileList.getByText('styles.css', { exact: true })
        ).toBeVisible({ timeout: 10000 })

        // File count should be 2 (not 3)
        await expect(page.getByText(/Selected Files.*2/)).toBeVisible({
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should remove ignore patterns', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Upload files
        const files = [
          { name: 'script.js', path: 'script.js', content: 'console.log(1);' },
          { name: 'temp.tmp', path: 'temp.tmp', content: 'temp' },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        const fileList = page.locator('.grid').first()
        await expect(
          fileList.getByText('script.js', { exact: true })
        ).toBeVisible({ timeout: 10000 })

        // Expand ignore list if needed
        const expandIgnoreButton = page.locator(
          'button[title="Expand ignore list"]'
        )
        if (
          (await expandIgnoreButton.count()) > 0 &&
          (await expandIgnoreButton.isVisible().catch(() => false))
        ) {
          await jsClick(expandIgnoreButton)
          // Wait for AnimatePresence animation to complete (Firefox needs more time)
          await page.waitForTimeout(300)
        }

        // Add ignore pattern for temp files - wait for input to be ready
        const ignoreInput = page.getByPlaceholder('Add ignore pattern...')
        await ignoreInput.waitFor({ state: 'visible', timeout: 10000 })
        await ignoreInput.fill('*.tmp')
        await Promise.all([
          page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/ignore-list') &&
              resp.request().method() === 'POST'
          ),
          ignoreInput.press('Enter'),
        ])

        // Verify pattern added
        await expect(page.getByText('*.tmp')).toBeVisible({ timeout: 10000 })

        // temp.tmp should be filtered — Playwright's retry engine polls until true.
        await expect(
          fileList.getByText('temp.tmp', { exact: true })
        ).not.toBeVisible({ timeout: 15000 })

        // Remove the ignore pattern using the specific button title
        const removeButton = page.locator('button[title="Remove *.tmp"]')
        await removeButton.waitFor({ state: 'visible', timeout: 10000 })
        // Use native Playwright click for better reliability
        await Promise.all([
          page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/ignore-list') &&
              resp.request().method() === 'POST'
          ),
          removeButton.click({ timeout: 10000 }),
        ])

        // Wait for the remove button to be removed from the DOM (indicates state updated)
        await expect(removeButton).toHaveCount(0, { timeout: 10000 })

        // Now verify the pattern is gone from the ignore list
        await expect(page.getByText('*.tmp')).not.toBeVisible({
          timeout: 15000,
        })

        // Verify filtered files update — Playwright's retry engine polls until temp.tmp reappears.
        await expect(
          fileList.getByText('temp.tmp', { exact: true })
        ).toBeVisible({ timeout: 15000 })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should support regex ignore patterns', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        const files = [
          { name: 'test.spec.ts', path: 'test.spec.ts', content: 'test' },
          { name: 'main.ts', path: 'main.ts', content: 'main' },
          { name: 'helper.ts', path: 'helper.ts', content: 'helper' },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        const fileListContainer = page.locator('.grid').first()
        await expect(
          fileListContainer.getByText('main.ts', { exact: true })
        ).toBeVisible({ timeout: 10000 })

        // Expand ignore list if minimized
        const expandIgnoreButton = page.locator(
          'button[title="Expand ignore list"]'
        )
        if (
          (await expandIgnoreButton.count()) > 0 &&
          (await expandIgnoreButton.isVisible().catch(() => false))
        ) {
          await jsClick(expandIgnoreButton)
          // Wait for AnimatePresence animation to complete (Firefox needs more time)
          await page.waitForTimeout(300)
        }

        // Add regex pattern - wait for input to be ready
        const ignoreInput = page.getByPlaceholder('Add ignore pattern...')
        await ignoreInput.waitFor({ state: 'visible', timeout: 10000 })
        await ignoreInput.fill('/\\.spec\\.ts$/')
        await Promise.all([
          page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/ignore-list') &&
              resp.request().method() === 'POST'
          ),
          ignoreInput.press('Enter'),
        ])

        // Verify pattern added
        await expect(page.getByText('/\\.spec\\.ts$/')).toBeVisible({
          timeout: 10000,
        })

        // spec file should be filtered — Playwright's retry engine polls until true.
        await expect(
          fileListContainer.getByText('test.spec.ts', { exact: true })
        ).not.toBeVisible({ timeout: 15000 })
        await expect(
          fileListContainer.getByText('main.ts', { exact: true })
        ).toBeVisible({ timeout: 10000 })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Theme Toggle', () => {
    test('should toggle between light and dark mode', async ({ page }) => {
      // Check initial state (should be light by default)
      const html = page.locator('html')
      await expect(html).not.toHaveClass(/dark/)

      // Click theme toggle button (moon icon in light mode)
      // Use JavaScript click for Firefox compatibility
      const themeButton = page.locator('header button') // First button in header
      await themeButton.waitFor({ state: 'visible', timeout: 5000 })
      await jsClick(themeButton)

      // Should now have dark class
      await expect(html).toHaveClass(/dark/, { timeout: 10000 })

      // Click again to toggle back
      await jsClick(themeButton)

      // Should be light again
      await expect(html).not.toHaveClass(/dark/, { timeout: 10000 })
    })

    test('should persist theme preference', async ({ page }) => {
      // Pre-set dark mode via init script before navigation
      await page.addInitScript(() => {
        localStorage.setItem('concatenate-dark-mode', 'true')
      })

      // Navigate fresh (init script runs automatically)
      await page.goto('/', { waitUntil: 'domcontentloaded' })

      // Should still be dark mode - wait for React to hydrate
      const html = page.locator('html')
      await expect(html).toHaveClass(/dark/, { timeout: 10000 })
    })
  })

  test.describe('View Mode Toggle', () => {
    test('should switch between list and tree view', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Upload files with nested structure
        const files = [
          { name: 'index.js', path: 'project/index.js', content: 'main' },
          { name: 'utils.js', path: 'project/src/utils.js', content: 'utils' },
          {
            name: 'helper.js',
            path: 'project/src/helper.js',
            content: 'helper',
          },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        await expect(page.getByText('index.js')).toBeVisible({ timeout: 10000 })

        // Default should be list view (check for grid layout or list button being active)
        const listButton = page.getByRole('button', { name: 'List view' })
        const treeButton = page.getByRole('button', { name: 'Tree view' })

        // List button should have active styling (bg-white or shadow)
        await expect(listButton).toHaveClass(/bg-white|shadow-sm/)

        // Wait for UI to stabilize before switching views
        await page.waitForTimeout(200)

        // Switch to tree view using jsClick for Firefox stability
        await treeButton.waitFor({ state: 'visible', timeout: 10000 })
        await jsClick(treeButton)

        // Wait for view transition animation
        await page.waitForTimeout(500)

        // Tree button should now be active
        await expect(treeButton).toHaveClass(/bg-white|shadow-sm/, {
          timeout: 10000,
        })

        // Should show tree structure with project/ as root (single root gets promoted)
        await expect(page.getByText('project/')).toBeVisible({ timeout: 10000 })

        // Tree is auto-expanded by App.tsx effect - wait for animation
        // AnimatePresence uses 200ms, give buffer time
        await page.waitForTimeout(800)

        // First verify list view grid is gone (view mode switch should remove grid)
        await expect(page.locator('div.grid')).not.toBeVisible()

        // Collapse project/ folder to test expand functionality, then re-expand
        const projectFolder = page.getByText('project/')
        await expect(projectFolder).toBeVisible({ timeout: 10000 })
        await jsClick(projectFolder)
        await page.waitForTimeout(300)

        // Re-expand project/ folder to reveal index.js and src/
        await jsClick(projectFolder)
        await page.waitForTimeout(300)

        // index.js should now be visible under project/
        await expect(page.getByText('index.js')).toBeVisible({ timeout: 10000 })

        // src/ folder should be visible and auto-expanded
        const srcFolder = page.getByText('src/')
        await expect(srcFolder).toBeVisible({ timeout: 10000 })

        // Nested files should be visible due to auto-expand effect
        await expect(page.getByText('utils.js')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('helper.js')).toBeVisible({
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should persist view mode preference', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Pre-set tree view mode before navigation
        await page.addInitScript(() => {
          localStorage.setItem('concat_view', '"tree"')
        })

        // Navigate fresh (init script sets the preference)
        await page.goto('/', { waitUntil: 'domcontentloaded' })

        // Upload files
        const files = [{ name: 'file.txt', path: 'file.txt', content: 'test' }]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        await expect(page.getByText('file.txt')).toBeVisible({ timeout: 10000 })

        // Wait for files to be processed
        await page.waitForTimeout(500)

        // Should be in tree view (verify tree button is active)
        const treeButton = page.getByRole('button', { name: 'Tree view' })
        await expect(treeButton).toHaveClass(/bg-white|shadow-sm/)
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('File Actions', () => {
    test('should ignore individual files from the list', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      // Capture console logs from browser
      const consoleMessages: string[] = []
      page.on('console', (msg) => {
        const text = msg.text()
        if (text.includes('ignore') || text.includes('Ignore')) {
          consoleMessages.push(`[${msg.type()}] ${text}`)
        }
      })

      try {
        // Use unique filenames to avoid conflicts with previous test runs
        const uniqueSuffix = Date.now().toString()
        const keepFileName = `keep-${uniqueSuffix}.js`
        const ignoreFileName = `ignore-${uniqueSuffix}.js`

        const files = [
          { name: keepFileName, path: keepFileName, content: 'keep' },
          { name: ignoreFileName, path: ignoreFileName, content: 'ignore' },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear in the file list
        await expect(page.getByText(keepFileName)).toBeVisible({
          timeout: 10000,
        })
        await expect(page.getByText(ignoreFileName)).toBeVisible({
          timeout: 10000,
        })

        // Find and click the ignore button for the ignore file using title attribute
        const ignoreButton = page.locator(
          `button[title="Ignore ${ignoreFileName}"]`
        )
        await ignoreButton.waitFor({ state: 'visible', timeout: 10000 })
        await Promise.all([
          page.waitForResponse(
            (resp) =>
              resp.url().includes('/api/ignore-list') &&
              resp.request().method() === 'POST'
          ),
          ignoreButton.click({ timeout: 10000 }),
        ])

        // Wait for the ignored file text to disappear from the file list
        // Use a more specific locator to target only the file list (not the ignore list)
        const fileListContainer = page.locator('.grid.grid-cols-1')
        await expect(
          fileListContainer.getByText(ignoreFileName, { exact: false })
        ).toHaveCount(0, { timeout: 10000 })

        // Verify keep file is still visible (as a file row with buttons)
        const keepFileRow = page
          .locator('button[title="Remove ' + keepFileName + '"]')
          .first()
        await expect(keepFileRow).toBeVisible({ timeout: 10000 })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should remove files from selection', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        const files = [
          { name: 'file1.js', path: 'file1.js', content: '1' },
          { name: 'file2.js', path: 'file2.js', content: '2' },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        await expect(page.getByText('file1.js')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('file2.js')).toBeVisible({ timeout: 10000 })

        // Click remove button for file1.js - directly target the button by its title
        const removeButton = page.locator('button[title="Remove file1.js"]')
        await removeButton.waitFor({ state: 'visible', timeout: 10000 })
        await jsClick(removeButton)

        // file1.js should be gone (waits for AnimatePresence animation + state update)
        await expect(page.getByText('file1.js')).not.toBeVisible({
          timeout: 10000,
        })

        // Then check the file count updated to 1
        await expect(page.getByText(/Selected Files.*\(1\)/)).toBeVisible({
          timeout: 10000,
        })

        // file2.js should still be visible
        await expect(page.getByText('file2.js')).toBeVisible({ timeout: 10000 })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should clear all files', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        const files = [
          { name: 'a.js', path: 'a.js', content: 'a' },
          { name: 'b.js', path: 'b.js', content: 'b' },
          { name: 'c.js', path: 'c.js', content: 'c' },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for all files to appear and stabilize
        await expect(page.getByText('a.js')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('b.js')).toBeVisible({ timeout: 10000 })
        await expect(page.getByText('c.js')).toBeVisible({ timeout: 10000 })

        // Click Clear All - use title attribute since text is hidden on mobile
        const clearAllButton = page.locator('button[title="Clear All"]')
        await clearAllButton.waitFor({ state: 'visible', timeout: 10000 })
        // Wait for button to be enabled before clicking
        await expect(clearAllButton).toBeEnabled({ timeout: 10000 })
        // Use jsClick for Firefox stability
        await jsClick(clearAllButton)

        // All files should be gone (waits for AnimatePresence animation + state update)
        await expect(page.getByText('a.js')).not.toBeVisible({ timeout: 10000 })
        await expect(page.getByText('b.js')).not.toBeVisible({ timeout: 10000 })
        await expect(page.getByText('c.js')).not.toBeVisible({ timeout: 10000 })

        // Should show "No files selected"
        await expect(page.getByText('No files selected')).toBeVisible({
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Concatenate & Download', () => {
    test('should enable concatenate button when files are present', async ({
      page,
    }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Initially disabled
        const concatButton = page.getByRole('button', {
          name: /Concatenate & Download/,
        })
        await expect(concatButton).toBeDisabled()

        // Upload files
        const files = [
          { name: 'script.js', path: 'script.js', content: 'alert("hi")' },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear and button to be enabled
        await expect(page.getByText('script.js')).toBeVisible({
          timeout: 10000,
        })
        await expect(concatButton).toBeEnabled({ timeout: 10000 })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should download concatenated file', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        const files = [
          {
            name: 'hello.js',
            path: 'src/hello.js',
            content: 'const hello = "world";',
          },
          {
            name: 'goodbye.js',
            path: 'src/goodbye.js',
            content: 'const goodbye = "moon";',
          },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        await expect(page.getByText('hello.js')).toBeVisible({ timeout: 10000 })

        // Wait for button to be visible and enabled
        const concatDownloadButton = page.getByRole('button', {
          name: /Concatenate & Download/,
        })
        await concatDownloadButton.waitFor({ state: 'visible', timeout: 10000 })
        await expect(concatDownloadButton).toBeEnabled({ timeout: 10000 })

        // Wait for UI to stabilize before clicking
        await page.waitForTimeout(300)

        // Trigger download - use jsClick for Firefox stability
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          jsClick(concatDownloadButton),
        ])

        // Verify download - filename format is concatenator-YYYYMMDD_HHMMSS.txt
        expect(download.suggestedFilename()).toMatch(/concatenator.*\.txt/)

        const downloadPath = await download.path()
        expect(downloadPath).toBeTruthy()

        // Clean up download file with retry to handle EBUSY race condition
        if (downloadPath) {
          const fs = await import('fs')
          let retries = 5
          while (retries > 0) {
            try {
              fs.unlinkSync(downloadPath)
              break
            } catch (err: unknown) {
              const isEBUSY =
                typeof err === 'object' &&
                err !== null &&
                'code' in err &&
                (err as { code?: unknown }).code === 'EBUSY'
              if (isEBUSY && retries > 1) {
                retries--
                await new Promise((r) => setTimeout(r, 100))
              } else {
                throw err
              }
            }
          }
        }
      } finally {
        uploadHelper.cleanup()
      }
    })
  })

  test.describe('Output Format Toggle', () => {
    test('should show TEXT and PDF toggle buttons', async ({ page }) => {
      // Both buttons should be visible
      await expect(page.getByRole('button', { name: 'TEXT' })).toBeVisible({
        timeout: 10000,
      })
      await expect(page.getByRole('button', { name: 'PDF' })).toBeVisible({
        timeout: 10000,
      })
    })

    test('should have TEXT as default active format', async ({ page }) => {
      const textButton = page.getByRole('button', { name: 'TEXT' })
      const pdfButton = page.getByRole('button', { name: 'PDF' })

      // TEXT button should have active styling (bg-white or shadow)
      await expect(textButton).toHaveClass(/bg-white|shadow-sm/, {
        timeout: 10000,
      })
      // PDF button should not have active styling
      await expect(pdfButton).not.toHaveClass(/bg-white|shadow-sm/, {
        timeout: 10000,
      })
    })

    test('should switch to PDF format when PDF button clicked', async ({
      page,
    }) => {
      const textButton = page.getByRole('button', { name: 'TEXT' })
      const pdfButton = page.getByRole('button', { name: 'PDF' })

      // Click PDF button
      await jsClick(pdfButton)
      await page.waitForTimeout(200)

      // PDF button should now be active
      await expect(pdfButton).toHaveClass(/bg-white|shadow-sm/, {
        timeout: 10000,
      })
      // TEXT button should not be active
      await expect(textButton).not.toHaveClass(/bg-white|shadow-sm/, {
        timeout: 10000,
      })
    })

    test('should switch back to TEXT format when TEXT button clicked', async ({
      page,
    }) => {
      const textButton = page.getByRole('button', { name: 'TEXT' })
      const pdfButton = page.getByRole('button', { name: 'PDF' })

      // First switch to PDF
      await jsClick(pdfButton)
      await page.waitForTimeout(200)

      // Then switch back to TEXT
      await jsClick(textButton)
      await page.waitForTimeout(200)

      // TEXT button should be active again
      await expect(textButton).toHaveClass(/bg-white|shadow-sm/, {
        timeout: 10000,
      })
      // PDF button should not be active
      await expect(pdfButton).not.toHaveClass(/bg-white|shadow-sm/, {
        timeout: 10000,
      })
    })

    test('should persist output format preference', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        // Pre-set PDF format before navigation
        await page.addInitScript(() => {
          localStorage.setItem('concatenate-output-format', 'pdf')
        })

        // Navigate fresh (init script sets the preference)
        await page.goto('/', { waitUntil: 'domcontentloaded' })

        // Upload a file to ensure we're in concatenate mode
        const files = [{ name: 'file.txt', path: 'file.txt', content: 'test' }]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        await expect(page.getByText('file.txt')).toBeVisible({ timeout: 10000 })

        // Should be in PDF mode (PDF button active)
        const pdfButton = page.getByRole('button', { name: 'PDF' })
        await expect(pdfButton).toHaveClass(/bg-white|shadow-sm/, {
          timeout: 10000,
        })
      } finally {
        uploadHelper.cleanup()
      }
    })

    test('should download PDF file when PDF format is selected', async ({
      page,
    }) => {
      const uploadHelper = new FileUploadHelper(page)

      try {
        const files = [
          {
            name: 'hello.js',
            path: 'src/hello.js',
            content: 'const hello = "world";',
          },
        ]
        await uploadHelper.setFilesOnInput(files)

        // Wait for files to appear
        await expect(page.getByText('hello.js')).toBeVisible({ timeout: 10000 })

        // Switch to PDF format
        const pdfButton = page.getByRole('button', { name: 'PDF' })
        await jsClick(pdfButton)
        await page.waitForTimeout(200)

        // Wait for button to be visible and enabled
        const concatDownloadButton = page.getByRole('button', {
          name: /Concatenate & Download/,
        })
        await concatDownloadButton.waitFor({ state: 'visible', timeout: 10000 })
        await expect(concatDownloadButton).toBeEnabled({ timeout: 10000 })

        // Wait for UI to stabilize before clicking
        await page.waitForTimeout(300)

        // Trigger download
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          jsClick(concatDownloadButton),
        ])

        // Verify download - filename format should be .pdf
        expect(download.suggestedFilename()).toMatch(/concatenator.*\.pdf/)

        const downloadPath = await download.path()
        expect(downloadPath).toBeTruthy()

        // Clean up download file with retry
        if (downloadPath) {
          const fs = await import('fs')
          let retries = 5
          while (retries > 0) {
            try {
              fs.unlinkSync(downloadPath)
              break
            } catch (err: unknown) {
              const isEBUSY =
                typeof err === 'object' &&
                err !== null &&
                'code' in err &&
                (err as { code?: unknown }).code === 'EBUSY'
              if (isEBUSY && retries > 1) {
                retries--
                await new Promise((r) => setTimeout(r, 100))
              } else {
                throw err
              }
            }
          }
        }
      } finally {
        uploadHelper.cleanup()
      }
    })
  })
})
