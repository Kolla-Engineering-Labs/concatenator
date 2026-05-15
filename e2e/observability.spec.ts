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

test.describe('Observability & Negation Discovery', () => {
  test.slow()
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page, apiContext }) => {
    await resetIgnoreList(apiContext)
    await page.addInitScript(() => {
      localStorage.clear()
      localStorage.setItem('concat_mode', '"concatenate"')
      localStorage.setItem('concat_view', '"list"')
      localStorage.setItem('concat_show_ignored', 'true')
      localStorage.setItem('concat_sidebar', 'true')
      localStorage.setItem('concat_auto_save_ignore', 'false')
    })

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2000)
    await ensureSidebarOpen(page)
    await ensureIgnoreListExpanded(page)
  })

  test('should discover negated files within ignored directories (Observability)', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      const ignoreInput = page.getByPlaceholder('Add ignore pattern...')
      const addButton = page.getByTitle('Add ignore pattern')

      const pattern = 'obs-tests'
      await ignoreInput.fill(pattern)
      await addButton.click()

      await ensureAllIgnoresVisible(page)
      await expect(
        page.locator(`[data-testid="ignore-item-${pattern}"]`).first()
      ).toBeVisible({ timeout: 15000 })

      await ignoreInput.fill('!core')
      await addButton.click()
      await ensureAllIgnoresVisible(page)
      await expect(
        page.locator('[data-testid="ignore-item-!core"]').first()
      ).toBeVisible({ timeout: 15000 })

      await ensureSidebarClosed(page)
      await uploadHelper.setFilesOnInput([
        {
          name: 'main.ts',
          path: `${pattern}/core/main.ts`,
          content: 'console.log("negated");',
        },
        {
          name: 'other.ts',
          path: `${pattern}/other.ts`,
          content: 'console.log("ignored");',
        },
      ])

      const fileList = page.getByTestId('file-table')
      await expect(fileList).toBeVisible({ timeout: 15000 })

      const mainFile = fileList
        .locator(`[data-path="${pattern}/core/main.ts"]`)
        .filter({ visible: true })
        .first()
      const otherFile = fileList
        .locator(`[data-path="${pattern}/other.ts"]`)
        .filter({ visible: true })
        .first()

      await expect(mainFile).toBeVisible({ timeout: 15000 })
      await expect(otherFile).toBeVisible({ timeout: 15000 })

      await expect(mainFile.locator('.ph-no-capture').first()).not.toHaveClass(
        /line-through/
      )
      await expect(otherFile.locator('.ph-no-capture').first()).toHaveClass(
        /line-through/
      )

      await expect(
        page.getByRole('main').getByText('Precision').first()
      ).toBeVisible({ timeout: 15000 })
      const tokensText = await page
        .locator('h2:has-text("Selected Files")')
        .locator('span.font-mono')
        .first()
        .textContent()
      expect(Number(tokensText?.replace(/,/g, ''))).toBeGreaterThan(0)
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('should toggle visibility of ignored files using the eye icon', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      const ignoreInput = page.getByPlaceholder('Add ignore pattern...')
      const addButton = page.getByTitle('Add ignore pattern')
      // Exact filename to ensure it matches
      const pattern = 'vis-ignored.ts'
      await ignoreInput.fill(pattern)
      await addButton.click()
      await ensureAllIgnoresVisible(page)
      await expect(
        page.locator(`[data-testid="ignore-item-${pattern}"]`).first()
      ).toBeVisible({ timeout: 15000 })

      await ensureSidebarClosed(page)
      await uploadHelper.setFilesOnInput([
        { name: 'vis-ignored.ts', path: 'vis-ignored.ts', content: 'content' },
        { name: 'active.ts', path: 'active.ts', content: 'code' },
      ])

      const fileList = page.getByTestId('file-table')
      // Ensure the file is correctly identified as ignored
      const ignoredFile = fileList
        .locator('[data-path="vis-ignored.ts"]')
        .filter({ visible: true })
        .first()
      await expect(ignoredFile).toHaveAttribute('data-ignored', 'true', {
        timeout: 15000,
      })
      await expect(ignoredFile).toBeVisible({ timeout: 15000 })

      // Toggle off (Hide Ignored)
      await jsClick(page.getByTitle('Hide Ignored Files').first())
      await expect(ignoredFile).not.toBeVisible({ timeout: 10000 })

      // Toggle on (Show Ignored)
      await jsClick(page.getByTitle('Show Ignored Files').first())
      await expect(ignoredFile).toBeVisible({ timeout: 10000 })
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('should update token counts correctly when toggling ignore state', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      await ensureSidebarClosed(page)
      await uploadHelper.setFilesOnInput([
        { name: 'file1.ts', path: 'file1.ts', content: 'content one' },
        { name: 'file2.ts', path: 'file2.ts', content: 'content two' },
      ])

      await expect(
        page.getByRole('main').getByText('Precision').first()
      ).toBeVisible({ timeout: 15000 })
      const tokenCount = page
        .locator('h2:has-text("Selected Files")')
        .locator('span.font-mono')
        .first()
      const initialText = await tokenCount.textContent()
      const initial = Number(initialText?.replace(/,/g, ''))

      const row = page
        .locator('[data-path="file1.ts"]')
        .filter({ visible: true })
        .first()
      const ignoreButton = row
        .getByTestId('ignore-file-button')
        .filter({ visible: true })
        .first()
      await jsClick(ignoreButton)

      await expect(async () => {
        const text = await tokenCount.textContent()
        expect(Number(text?.replace(/,/g, ''))).toBeLessThan(initial)
      }).toPass({ timeout: 10000 })

      await jsClick(ignoreButton)

      await expect(async () => {
        const text = await tokenCount.textContent()
        expect(Number(text?.replace(/,/g, ''))).toBe(initial)
      }).toPass({ timeout: 15000 })
    } finally {
      uploadHelper.cleanup()
    }
  })
})
