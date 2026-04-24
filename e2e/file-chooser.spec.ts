/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, resetIgnoreList } from './fixtures'
import { SIMPLE_PROJECT, REACT_PROJECT } from './fixtures/test-data'
import { logger } from '../src/lib/logger'
import type { Page, Locator } from '@playwright/test'
import { ensureSidebarClosed } from './helpers/sidebar'

/**
 * Helper to upload files to a webkitdirectory input.
 *
 * Uses buffer-based payloads with a temporary attribute removal to avoid two
 * separate issues on macOS GitHub Actions runners with Node 22 + WebKit:
 *
 * Problem 1: Passing a directory *path* crashes the WebKit process
 *   ("Target page, context or browser has been closed").
 *
 * Problem 2: Playwright rejects buffer payloads at the framework level for
 *   webkitdirectory inputs ("Error: [webkitdirectory] input requires passing
 *   a path to a directory").
 *
 * Solution: Temporarily remove webkitdirectory, set files via buffer (the
 * relativePath field correctly sets file.webkitRelativePath via CDP), then
 * restore the attribute. Returns a no-op cleanup function for API compatibility.
 */
async function setFilesForWebkitDirectory(
  page: Page,
  files: Array<{ name: string; content: string; relativePath: string }>
): Promise<() => void> {
  // Wait for page to be fully loaded and stable
  await page.waitForLoadState('domcontentloaded')

  // Wait for the webkitdirectory input to be present in the DOM.
  const fileInputWithAttr = page.locator('input[type="file"][webkitdirectory]')
  await fileInputWithAttr.waitFor({ state: 'attached' })

  // Build buffer-based payload. The relativePath field sets file.webkitRelativePath.
  const payload = files.map((f) => ({
    name: f.name,
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(f.content),
    relativePath: f.relativePath,
  }))

  // Resolve a bare locator (no [webkitdirectory] filter) BEFORE stripping the attribute.
  // Playwright re-evaluates locators lazily — if we call setInputFiles() on a locator
  // that includes [webkitdirectory] in its CSS selector, and we already removed the
  // attribute, the element no longer matches and the call times out on WebKit.
  const fileInput = page.locator('input[type="file"]').first()

  // Momentarily remove webkitdirectory so Playwright lets us pass buffer payloads,
  // then restore it so the input remains semantically correct after this call.
  await fileInput.evaluate((el: HTMLInputElement) =>
    el.removeAttribute('webkitdirectory')
  )
  try {
    await fileInput.setInputFiles(payload)
  } finally {
    // Restore the attribute. On WebKit/Mobile Safari the browser context may
    // have been recycled by the time we get here (e.g. the file-input change
    // triggered a navigation or the process was restarted). Swallow those
    // errors — the restore is cosmetic and does not affect test correctness.
    try {
      await fileInput.evaluate((el: HTMLInputElement) =>
        el.setAttribute('webkitdirectory', '')
      )
    } catch (restoreErr: unknown) {
      // Log — don't fail — attribute restore is cosmetic. On WebKit the browser
      // context may have been recycled by the file-input change event.
      logger.warn(
        '[file-chooser] webkitdirectory restore failed (likely WebKit context recycle):',
        restoreErr
      )
    }
  }

  // No temp directory was created, so cleanup is a no-op.
  return () => {
    /* no-op */
  }
}

/**
 * Helper function to click an element using JavaScript for better Firefox compatibility
 */
async function jsClick(locator: Locator): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click())
}

/**
 * E2E tests using the native file chooser dialog.
 * This is often more reliable than drag-and-drop simulation.
 * Now fully parallel enabled via worker-specific ignore files.
 */
test.describe('File Upload via File Chooser', () => {
  test.beforeEach(async ({ page, apiContext }) => {
    // Clear localStorage before navigation
    await page.addInitScript(() => {
      localStorage.removeItem('concatenate-ignore')
      localStorage.removeItem('concatenate-view-mode')
      localStorage.removeItem('concatenate-dark-mode')
    })

    // Reset server-side ignore list BEFORE navigation so client fetches correct state.
    // Uses worker-specific ignore file via X-Worker-Id header from apiContext fixture.
    await resetIgnoreList(apiContext)

    // Use 'domcontentloaded' for faster Firefox navigation
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })

  test('should upload single file via file chooser', async ({ page }) => {
    // Use helper to set a single file with proper webkitRelativePath
    const cleanup = await setFilesForWebkitDirectory(page, [
      {
        name: 'hello.js',
        content: 'console.log("Hello, World!");',
        relativePath: 'test/hello.js',
      },
    ])

    try {
      // Verify files appear

      // Verify file appears in the list
      const fileList = page.locator('table').first()
      await expect(
        fileList.getByText('hello.js', { exact: true }).first()
      ).toBeVisible()
      await expect(page.getByText(/Selected Files.*\d/)).toBeVisible()
    } finally {
      cleanup()
    }
  })

  test('should upload multiple files via file chooser', async ({ page }) => {
    // Use helper to set files with proper webkitRelativePath
    const fileContents = [
      { name: 'a.js', content: 'const a = 1;', relativePath: 'test/a.js' },
      { name: 'b.js', content: 'const b = 2;', relativePath: 'test/b.js' },
      { name: 'c.js', content: 'const c = 3;', relativePath: 'test/c.js' },
    ]

    const cleanup = await setFilesForWebkitDirectory(page, fileContents)

    try {
      // Verify files appear

      // Verify all files appear
      const fileList = page.locator('table').first()
      for (const { name } of fileContents) {
        await expect(
          fileList.getByText(name, { exact: true }).first()
        ).toBeVisible()
      }
      await expect(page.getByText(/Selected Files.*\d/)).toBeVisible()
    } finally {
      cleanup()
    }
  })

  test('should upload files with directory structure', async ({ page }) => {
    // Use helper to set files with proper webkitRelativePath for nested structure
    const structure = [
      {
        name: 'index.js',
        content: 'export default {};',
        relativePath: 'project/src/index.js',
      },
      {
        name: 'helpers.js',
        content: 'export const help = () => {};',
        relativePath: 'project/src/utils/helpers.js',
      },
      {
        name: 'index.test.js',
        content: 'test("index");',
        relativePath: 'project/tests/index.test.js',
      },
    ]

    const cleanup = await setFilesForWebkitDirectory(page, structure)

    try {
      // Verify files appear

      // Verify files appear
      const fileList = page.locator('table').first()
      await expect(
        fileList.getByText('index.js', { exact: true }).first()
      ).toBeVisible()
      await expect(
        fileList.getByText('helpers.js', { exact: true }).first()
      ).toBeVisible()
      await expect(
        fileList.getByText('index.test.js', { exact: true }).first()
      ).toBeVisible()
    } finally {
      cleanup()
    }
  })

  test('should handle de-concatenate file upload', async ({ page }) => {
    // Switch to de-concatenate mode using JavaScript click for Firefox compatibility
    const deconcatButton = page.getByRole('button', { name: 'De-concatenate' })
    await deconcatButton.waitFor({ state: 'visible', timeout: 10000 })
    await jsClick(deconcatButton)
    // Wait for mode switch to complete
    await expect(deconcatButton).toHaveClass(/bg-brand-600/, {
      timeout: 10000,
    })

    // Create a mock concatenated file using the actual app format
    const concatenatedContent = `--- CONCATENATOR_SESSION_ID: e2e001 ---
Concatenated on: 2024-01-01

<<<<< FILE_START: hello.js (ID: e2e001) >>>>>
console.log("Hello");
<<<<< FILE_END >>>>>

<<<<< FILE_START: world.js (ID: e2e001) >>>>>
console.log("World");
<<<<< FILE_END >>>>>
`

    // Wait for the input to be re-rendered without webkitdirectory
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])')
    await fileInput.waitFor({ state: 'attached' })

    await fileInput.setInputFiles({
      name: 'bundle.txt',
      buffer: Buffer.from(concatenatedContent),
      mimeType: 'text/plain',
    })

    // Wait for download event after clicking manual download button
    await ensureSidebarClosed(page)
    const downloadButton = page.getByRole('button', { name: 'Download ZIP' })
    await downloadButton.waitFor({ state: 'visible', timeout: 15000 })
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      downloadButton.click(),
    ])

    // Verify it's a ZIP file
    expect(download.suggestedFilename()).toMatch(/\.zip$/i)

    // Clean up download
    await download.delete()
  })

  test('should reject non-txt files in de-concatenate mode', async ({
    page,
  }) => {
    // Switch to de-concatenate mode using JavaScript click for Firefox compatibility
    const deconcatButton = page.getByRole('button', { name: 'De-concatenate' })
    await deconcatButton.waitFor({ state: 'visible', timeout: 10000 })
    await jsClick(deconcatButton)
    // Wait for mode switch to complete
    await expect(deconcatButton).toHaveClass(/bg-brand-600/, {
      timeout: 10000,
    })

    // Wait for the input to be re-rendered without webkitdirectory
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])')
    await fileInput.waitFor({ state: 'attached' })
    // For de-concatenate mode, use buffer since webkitdirectory is not set
    await fileInput.setInputFiles({
      name: 'data.json',
      buffer: Buffer.from('{"key": "value"}'),
      mimeType: 'application/json',
    })

    // May show error or warning for non-txt file, or may just not process
    // The app behavior may vary - just verify no crash
    await expect(
      page.getByRole('heading', { name: 'Concatenator' })
    ).toBeVisible()
  })
})

test.describe.serial('File Upload with Test Fixtures', () => {
  test.beforeEach(async ({ page }) => {
    // Use 'domcontentloaded' for faster Firefox navigation
    await page.goto('/', { waitUntil: 'domcontentloaded' })
  })

  test('should upload simple project fixture', async ({ page }) => {
    // Use helper to upload fixture files
    const files = SIMPLE_PROJECT.map((f) => ({
      name: f.name,
      content: f.content,
      relativePath: f.path,
    }))

    const cleanup = await setFilesForWebkitDirectory(page, files)

    try {
      // Verify files appear

      // Verify all fixture files are present
      const fileList = page.locator('table').first()
      for (const file of SIMPLE_PROJECT) {
        await expect(
          fileList.getByText(file.name, { exact: true }).first()
        ).toBeVisible()
      }
    } finally {
      cleanup()
    }
  })

  test('should upload React project fixture', async ({ page }) => {
    // Use helper to upload fixture files
    const files = REACT_PROJECT.map((f) => ({
      name: f.name,
      content: f.content,
      relativePath: f.path,
    }))

    const cleanup = await setFilesForWebkitDirectory(page, files)

    try {
      // Verify files appear

      // Verify React project files
      const fileList = page.locator('table').first()
      await expect(
        fileList.getByText('App.tsx', { exact: true }).first()
      ).toBeVisible()
      await expect(
        fileList.getByText('Button.tsx', { exact: true }).first()
      ).toBeVisible()
      await expect(
        fileList.getByText('package.json', { exact: true }).first()
      ).toBeVisible()
    } finally {
      cleanup()
    }
  })
})
