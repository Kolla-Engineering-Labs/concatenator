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
  // Wait for the UI to be ready by waiting for either the sidebar content
  // or the menu toggle button. This ensures hydration has finished.
  const aside = page.locator('aside')
  const openButton = page.getByTitle('Open menu')

  try {
    await Promise.race([
      aside.waitFor({ state: 'visible', timeout: 5000 }),
      openButton.waitFor({ state: 'visible', timeout: 5000 }),
    ])
  } catch {
    // If neither appears, we'll check visibility below and decide what to do
  }

  if (await openButton.isVisible()) {
    await jsClick(openButton)
    // Wait for sidebar to be visible and animation to finish
    await aside.waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForTimeout(500)
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

  // Wait for the UI to be ready by waiting for one of the toggle buttons.
  // This ensures hydration has finished before we decide whether to close.
  const openButton = page.getByTitle('Open menu')
  const closeButton = page.getByTitle('Close menu')

  try {
    await Promise.race([
      openButton.waitFor({ state: 'visible', timeout: 5000 }),
      closeButton.waitFor({ state: 'visible', timeout: 5000 }),
    ])
  } catch {
    // If neither is visible, the page might still be loading or it's not a mobile view.
    // We continue anyway and try to check visibility.
  }

  if (await closeButton.isVisible()) {
    await jsClick(closeButton)
    // Wait for sidebar to animate off-screen (has -translate-x-full class when closed)
    // Note: Playwright considers visibility:hidden elements as "visible" since they still take up layout space
    await page.waitForFunction(
      () => {
        const aside = document.querySelector('aside')
        return aside && aside.classList.contains('-translate-x-full')
      },
      { timeout: 10000 }
    )
    // Extra grace period for CSS transition/overlay to clear
    await page.waitForTimeout(500)
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
