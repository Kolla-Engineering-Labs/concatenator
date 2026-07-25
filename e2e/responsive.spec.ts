import { test, expect } from '@playwright/test'

test.describe('Responsive UI - Sidebar', () => {
  test.use({
    viewport: { width: 390, height: 844 }, // iPhone 14
  })

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.evaluate(() => localStorage.clear())
    await page.reload({ waitUntil: 'domcontentloaded' })
  })

  test('should hide sidebar by default and toggle correctly', async ({
    page,
  }) => {
    // Wait for the app to be ready
    const sidebar = page.getByTestId('sidebar')
    await expect(sidebar).toBeAttached()

    // Verify sidebar is hidden (should have -translate-x-full)
    await expect(sidebar).toHaveClass(/-translate-x-full/)

    // Open sidebar
    const toggleButton = page.getByTestId('sidebar-toggle')
    await toggleButton.click()

    // Verify sidebar is visible (should have translate-x-0)
    await expect(sidebar).toHaveClass(/translate-x-0/)

    // Verify backdrop exists and is visible
    const backdrop = page.locator('div.fixed.inset-0.bg-slate-900\\/50')
    await expect(backdrop).toBeVisible()

    // Click backdrop to close sidebar
    // Click backdrop to close sidebar - click on the right side to avoid sidebar interception
    await backdrop.click({ position: { x: 350, y: 400 } })

    // Verify sidebar is hidden again
    await expect(sidebar).toHaveClass(/-translate-x-full/)
  })

  test('should still intercept drag events even in touch/mobile view (Regression)', async ({
    page,
  }) => {
    // Wait for the upload zone to be ready
    const dropZone = page.getByTestId('upload-zone-container')
    await expect(dropZone).toBeVisible()

    // Dispatch a dragover event and check if it was prevented
    const isPrevented = await dropZone.evaluate((el) => {
      const event = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
      })
      el.dispatchEvent(event)
      return event.defaultPrevented
    })

    expect(isPrevented).toBe(true)
  })
})
