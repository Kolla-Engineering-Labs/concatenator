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

  test('should display red Gas Gauge overage state when token budget is exceeded', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      // 1. Select the lowest budget preset (GPT-4o at 128,000 tokens)
      const budgetSelect = page
        .locator('select')
        .filter({ has: page.locator('option[value="128000"]') })
      await expect(budgetSelect).toBeVisible({ timeout: 10000 })
      await budgetSelect.selectOption('128000')

      // 2. Generate a synthetic payload in memory and upload it to exceed 128k budget
      const heavyPayload = 'hello '.repeat(150000) // approx 150k tokens
      await ensureSidebarClosed(page)
      await uploadHelper.setFilesOnInput([
        {
          name: 'synthetic-overload.txt',
          path: 'synthetic-overload.txt',
          content: heavyPayload,
        },
      ])

      // 3. Verify the Gas Gauge transition to red overage state
      // Wait for the overage text to show the correct layout (e.g. "X / 128,000" where X > 128,000)
      const overageText = page
        .locator('div.tabular-nums')
        .filter({ hasText: /^\d[\d,]*\s*\/\s*128,000$/ })
        .first()
      await expect(overageText).toBeVisible({ timeout: 25000 })
      await expect(overageText).toHaveClass(/text-red-500/)

      // Assert that the .bg-red-500 class is applied to the saturation bar
      const saturationBar = page.locator('div.h-1\\.5 > div').first()
      await expect(saturationBar).toHaveClass(/bg-red-500/)

      // Assert that the static warning triangle is visible
      const warningIcon = page.locator('svg.text-red-500').first()
      await expect(warningIcon).toBeVisible({ timeout: 10000 })
    } finally {
      uploadHelper.cleanup()
    }
  })

  test('should display reason badge for default ignored directories like node_modules', async ({
    page,
  }) => {
    const uploadHelper = new FileUploadHelper(page)

    try {
      await ensureSidebarClosed(page)
      // Upload a file within a default ignored directory (node_modules) resembling /node_modules/test.js
      await uploadHelper.setFilesOnInput([
        {
          name: 'test.js',
          path: 'node_modules/test.js',
          content: 'console.log("test");',
        },
      ])

      // Verify the file is listed and recognized as ignored
      const testRow = page
        .locator('[data-path="node_modules/test.js"]')
        .filter({ visible: true })
        .first()
      await expect(testRow).toBeVisible({ timeout: 15000 })
      await expect(testRow).toHaveAttribute('data-ignored', 'true')

      // Assert the row renders the inline badge containing the text node_modules and (default)
      const badge = testRow.locator('span.font-mono')
      await expect(badge).toBeVisible({ timeout: 10000 })
      await expect(badge).toContainText('node_modules')
      await expect(badge).toContainText('(default)')
    } finally {
      uploadHelper.cleanup()
    }
  })
})
