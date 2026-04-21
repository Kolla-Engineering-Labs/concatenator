/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Page, Locator } from '@playwright/test'

/**
 * Helper function to click an element using JavaScript for better cross-browser compatibility
 */
export async function jsClick(locator: Locator): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click())
}

/**
 * Ensures the sidebar is open.
 * On mobile, clicks the toggle if needed.
 * On desktop, ensures state is consistent.
 */
export async function ensureSidebarOpen(page: Page): Promise<void> {
  const isMobile = page.viewportSize()
    ? page.viewportSize()!.width < 1024
    : false

  if (isMobile) {
    const openButton = page.getByTitle('Open menu')
    if (await openButton.isVisible()) {
      await jsClick(openButton)
      // Wait for sidebar to be visible and animation to finish
      await page.locator('aside').waitFor({ state: 'visible', timeout: 5000 })
      await page.waitForTimeout(600)
    }
  } else {
    // On desktop, we might still need to toggle if it was manually closed
    // but the app design usually keeps it open.
    // If there's an open button, click it.
    const openButton = page.getByTitle('Open menu')
    if (await openButton.isVisible()) {
      await jsClick(openButton)
      await page.waitForTimeout(600)
    }
  }
}

/**
 * Ensures the sidebar is closed.
 * On mobile, clicks the close button.
 * On desktop, does nothing as the sidebar is part of the layout.
 */
export async function ensureSidebarClosed(page: Page): Promise<void> {
  const isMobile = page.viewportSize()
    ? page.viewportSize()!.width < 1024
    : false
  if (!isMobile) return

  const closeButton = page.getByTitle('Close menu')
  if (await closeButton.isVisible()) {
    await jsClick(closeButton)
    // Wait for sidebar to be hidden and animation to finish
    await page.locator('aside').waitFor({ state: 'hidden', timeout: 5000 })
    await page.waitForTimeout(600)
  }
}

/**
 * Expands the ignore list section if it is minimized.
 */
export async function ensureIgnoreListExpanded(page: Page): Promise<void> {
  const expandButton = page.getByTitle('Expand ignore list')
  if (await expandButton.isVisible()) {
    await jsClick(expandButton)
    await page.waitForTimeout(500)
  }
}

/**
 * Clicks the "+N more" button in the ignore list if it is visible.
 */
export async function ensureAllIgnoresVisible(page: Page): Promise<void> {
  const showMoreButton = page.locator('text=/\\+\\d+ more/')
  if (await showMoreButton.isVisible()) {
    await jsClick(showMoreButton)
    await page.waitForTimeout(300)
  }
}
