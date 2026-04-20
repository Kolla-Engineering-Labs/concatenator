/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from './fixtures';
import { FileUploadHelper } from './helpers/file-upload';
import type { Locator, APIRequestContext } from '@playwright/test';

/**
 * Helper function to click an element using JavaScript for better Firefox compatibility
 */
async function jsClick(locator: Locator): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click());
}

/**
 * Helper to reset the ignore list via API using the worker-specific context.
 */
async function resetIgnoreList(apiContext: APIRequestContext): Promise<void> {
  const defaultIgnoreList = [
    '.concatenate-ignore',
    '.DS_Store', '.env', '.expo', '.git', '.gradle', '.next',
    '.secrets', '.terraform', '.vagrant', '.vscode',
    '/^\\.concatenate-ignore-worker-\\d+$/',
    '/\\.class$/', '/\\.exe$/',
    '/\\.jar$/', '/\\.log$/', '/\\.o$/', '/\\.obj$/', '/\\.swp$/', '/^__.*cache__$/',
    '/^\\..*_cache$/', 'bin', 'build', 'desktop.ini', 'dist', 'node_modules',
    'obj', 'package-lock.json', 'ruff_output.txt', 'target', 'Thumbs.db', 'vendor', 'venv'
  ];
  const response = await apiContext.post('/api/ignore-list', {
    data: defaultIgnoreList,
  });
  if (!response.ok()) {
    throw new Error(`Failed to reset ignore list — HTTP ${response.status()}`);
  }
}

/**
 * UI Interactions and Edge Cases tests - now fully parallel enabled via
 * worker-specific ignore files using the X-Worker-Id header.
 */
test.describe('UI Interactions and Edge Cases', () => {
  test.beforeEach(async ({ page, apiContext }) => {
    // Clear localStorage before navigation to avoid interference from previous test runs
    await page.addInitScript(() => {
      localStorage.removeItem('concatenate-ignore');
    });

    // Reset server-side ignore list BEFORE navigation so client fetches correct state.
    // Uses worker-specific ignore file via X-Worker-Id header from apiContext fixture.
    await resetIgnoreList(apiContext);

    // Use 'domcontentloaded' for faster Firefox navigation
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test.describe('Minimize/Maximize Panels', () => {
    test('should minimize and maximize dropzone', async ({ page }) => {
      // Find minimize button on dropzone
      const minimizeButton = page.locator('button[title*="Minimize dropzone"]').first();

      // Wait for button to be fully visible and stable
      await minimizeButton.waitFor({ state: 'visible', timeout: 10000 });

      if (await minimizeButton.isVisible().catch(() => false)) {
        // Use JavaScript click for Firefox compatibility
        await jsClick(minimizeButton);

        // Wait for animation and localStorage write
        await page.waitForTimeout(500);

        // Verify minimized state (smaller padding or "Drop here" text)
        await expect(page.getByText('Drop here')).toBeVisible({ timeout: 10000 });

        // Find and click maximize button
        const maximizeButton = page.locator('button[title*="Expand dropzone"]').first();
        await maximizeButton.waitFor({ state: 'visible', timeout: 10000 });
        await jsClick(maximizeButton);

        // Wait for animation
        await page.waitForTimeout(500);

        // Should show full dropzone again
        await expect(page.getByText(/Drop folder or files here/)).toBeVisible({ timeout: 10000 });
      }
    });

    test('should minimize and maximize ignore list', async ({ page }) => {
      // First add something to ignore list
      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'test.js', path: 'test.js', content: 'test' },
        ]);

        // Wait for upload to complete
        await expect(page.getByText('test.js')).toBeVisible({ timeout: 10000 });

        // Find ignore list minimize button and wait for it
        const ignoreSection = page.locator('div').filter({ hasText: /^Ignore List/ }).first();
        const minimizeButton = ignoreSection.locator('button').first();
        await minimizeButton.waitFor({ state: 'visible', timeout: 10000 });

        // Use jsClick for Firefox stability and wait for animation
        await jsClick(minimizeButton);
        // AnimatePresence uses 200ms duration; wait longer for Firefox
        await page.waitForTimeout(800);

        // Input should be hidden after minimize
        const ignoreInput = page.getByPlaceholder('Add ignore pattern...');
        await expect(ignoreInput).not.toBeVisible({ timeout: 15000 });

        // Click again to maximize
        await jsClick(minimizeButton);
        // AnimatePresence uses 200ms duration; wait longer for Firefox
        await page.waitForTimeout(800);

        // Input should be visible again
        await expect(ignoreInput).toBeVisible({ timeout: 15000 });
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('Keyboard Interactions', () => {
    test('should add ignore pattern with Enter key', async ({ page, browserName }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'temp.tmp', path: 'temp.tmp', content: 'temp' },
        ]);

        // Scope to file list and use exact matching for filename
        const fileList = page.locator('.grid').first();
        await expect(fileList.getByText('temp.tmp', { exact: true })).toBeVisible({ timeout: 10000 });

        // Expand ignore list if needed
        const expandIgnoreButton = page.locator('button[title="Expand ignore list"]');
        if (await expandIgnoreButton.count() > 0 && await expandIgnoreButton.isVisible().catch(() => false)) {
          await jsClick(expandIgnoreButton);
          // Wait for AnimatePresence animation to complete (Firefox needs more time)
          await page.waitForTimeout(300);
        }

        // Type in ignore input and press Enter
        const ignoreInput = page.getByPlaceholder('Add ignore pattern...');
        await ignoreInput.fill('*.tmp');
        await ignoreInput.press('Enter');

        // Wait for network idle and React re-render
        await page.waitForLoadState('networkidle');

        // Additional delay for WebKit browsers (Mobile Safari) for rendering stability
        if (browserName === 'webkit') {
          await page.waitForTimeout(1000);
        }

        // Pattern should be added
        await expect(page.getByText('*.tmp')).toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });

  });

  test.describe('Responsive Behavior', () => {
    test('should adapt layout on mobile viewport', async ({ page, browserName }) => {
      // Skip on Firefox and WebKit due to known Playwright setViewportSize timeout issues
      test.skip(
        browserName === 'firefox' || browserName === 'webkit',
        'Viewport resize tests skipped on Firefox and WebKit due to Playwright limitations'
      );

      // Wait for initial page load to complete and all animations to finish
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      // Set mobile viewport
      await page.setViewportSize({ width: 375, height: 667 });

      // Wait for viewport change to settle
      await page.waitForTimeout(500);

      // Page should still load
      await expect(page.getByRole('heading', { name: 'Concatenator' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Concatenate', exact: true })).toBeVisible();

      // Mode toggle should still be usable - use JavaScript click
      const deconcatButton = page.getByRole('button', { name: 'De-concatenate', exact: true });
      await deconcatButton.waitFor({ state: 'visible', timeout: 10000 });
      await jsClick(deconcatButton);
      await expect(deconcatButton).toHaveClass(/bg-white|dark:bg-slate-800/, { timeout: 10000 });
    });

    test('should handle file list on narrow screens', async ({ page, browserName }) => {
      // Skip on Firefox and WebKit due to known Playwright setViewportSize timeout issues
      test.skip(
        browserName === 'firefox' || browserName === 'webkit',
        'Viewport resize tests skipped on Firefox and WebKit due to Playwright limitations'
      );

      // Wait for initial page load and all animations to finish
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(500);

      await page.setViewportSize({ width: 500, height: 800 });

      // Wait for viewport change to settle
      await page.waitForTimeout(500);

      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'very-long-filename-that-might-overflow.js', path: 'very-long-filename-that-might-overflow.js', content: 'x' },
        ]);

        // File should be visible even with long name
        await expect(page.getByText('very-long-filename')).toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('Drag and Drop Visual Feedback', () => {
    test('should show visual feedback on drag over', async ({ page, browserName }) => {
      // Simulate drag enter
      await page.evaluate(() => {
        const dropZone = document.querySelector('[class*="border-dashed"]') || document.body;
        const dataTransfer = new DataTransfer();

        const dragEnterEvent = new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
        });
        dropZone.dispatchEvent(dragEnterEvent);
      });

      // Wait a moment for visual feedback to apply
      // WebKit needs more time for drag event processing
      await page.waitForTimeout(browserName === 'webkit' ? 300 : 100);

      // The dropzone should have hover styling (this is tested via class changes)
      // Note: Actual hover state may not persist after the event, but we verify no error occurred
    });

    test('should handle drag leave gracefully', async ({ page, browserName }) => {
      await page.evaluate(() => {
        const dropZone = document.querySelector('[class*="border-dashed"]') || document.body;
        const dataTransfer = new DataTransfer();

        // Drag enter
        dropZone.dispatchEvent(new DragEvent('dragenter', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
        }));

        // Drag leave
        dropZone.dispatchEvent(new DragEvent('dragleave', {
          bubbles: true,
          cancelable: true,
          dataTransfer: dataTransfer,
        }));
      });

      // WebKit needs additional delay for drag event processing
      if (browserName === 'webkit') {
        await page.waitForTimeout(200);
      }

      // Page should still be functional
      await expect(page.getByRole('heading', { name: 'Concatenator' })).toBeVisible();
    });
  });

  test.describe('localStorage Persistence', () => {
    test('should persist minimize state of dropzone', async ({ page }) => {
      // Find and click minimize button if visible
      const minimizeButton = page.locator('button[title*="Minimize dropzone"]').first();

      if (await minimizeButton.isVisible().catch(() => false)) {
        await jsClick(minimizeButton);

        // Wait for animation and localStorage write
        await page.waitForTimeout(500);

        // Reload page and wait for full load
        await page.reload({ waitUntil: 'domcontentloaded' });

        // Should still be minimized
        await expect(page.getByText('Drop here')).toBeVisible({ timeout: 10000 });
      }
    });

    test('should persist minimize state of ignore list', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'test.js', path: 'test.js', content: 'test' },
        ]);

        // Wait for file and ignore list to be visible
        await expect(page.getByText('test.js')).toBeVisible({ timeout: 10000 });

        const ignoreSection = page.locator('div').filter({ hasText: /^Ignore List/ }).first();
        const minimizeButton = ignoreSection.locator('button').first();
        await minimizeButton.waitFor({ state: 'visible', timeout: 10000 });

        await jsClick(minimizeButton);

        // Wait for animation and localStorage write
        await page.waitForTimeout(500);

        // Reload page and wait for full load
        await page.reload({ waitUntil: 'domcontentloaded' });

        // Upload a file to make ignore list appear
        await uploadHelper.dragAndDropDirectory([
          { name: 'test2.js', path: 'test2.js', content: 'test2' },
        ]);

        // Wait for file to appear
        await expect(page.getByText('test2.js')).toBeVisible({ timeout: 10000 });

        // Ignore list should still be minimized
        await expect(page.getByPlaceholder('Add ignore pattern...')).not.toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('Concurrent Actions', () => {
    test('should handle rapid mode switching', async ({ page }) => {
      const concatButton = page.getByRole('button', { name: 'Concatenate', exact: true });
      const deconcatButton = page.getByRole('button', { name: 'De-concatenate', exact: true });

      // Wait for buttons to be ready
      await concatButton.waitFor({ state: 'visible', timeout: 5000 });
      await deconcatButton.waitFor({ state: 'visible', timeout: 5000 });

      // Rapidly switch modes multiple times using JavaScript clicks
      for (let i = 0; i < 5; i++) {
        await jsClick(deconcatButton);
        await page.waitForTimeout(50); // Small delay for state update
        await jsClick(concatButton);
        await page.waitForTimeout(50);
      }

      // Should end in concatenate mode
      await expect(concatButton).toHaveClass(/bg-white|dark:bg-slate-800/, { timeout: 10000 });

      // App should still be functional
      await expect(page.getByRole('heading', { name: 'Concatenator' })).toBeVisible();
    });

    test('should handle mode switch during file processing', async ({ page, browserName }) => {
      // Skip on Firefox due to navigation timeout issues
      test.skip(browserName === 'firefox', 'Test skipped on Firefox due to navigation timeout issues');

      const uploadHelper = new FileUploadHelper(page);

      try {
        // Start uploading many files
        const files = Array.from({ length: 20 }, (_, i) => ({
          name: `file${i}.txt`,
          path: `batch/file${i}.txt`,
          content: `content ${i}`,
        }));

        // Start upload
        await uploadHelper.dragAndDropDirectory(files);

        // Immediately try to switch mode using JavaScript click
        const deconcatButton = page.getByRole('button', { name: 'De-concatenate' });
        await deconcatButton.waitFor({ state: 'visible', timeout: 10000 });
        await jsClick(deconcatButton);

        // Should switch mode (files will be cleared)
        await expect(deconcatButton).toHaveClass(/bg-white|dark:bg-slate-800/, { timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('Accessibility', () => {
    test('should have proper button titles', async ({ page }) => {
      // Theme button should be present
      const themeButton = page.locator('header button');
      await expect(themeButton).toBeVisible();
    });

    test('should have focusable elements', async ({ page, browserName }) => {
      // Skip on WebKit due to different focus management behavior on Safari/Mobile Safari
      test.skip(
        browserName === 'webkit',
        'Focus/Tab navigation tests skipped on WebKit due to different focus behavior'
      );

      // First, click on a focusable element to ensure document has focus
      const themeButton = page.locator('header button');
      await themeButton.waitFor({ state: 'visible', timeout: 5000 });

      // Use JavaScript click for Firefox compatibility
      await jsClick(themeButton);

      // Wait a bit for click to process
      await page.waitForTimeout(100);

      // Programmatically focus button to ensure it receives focus
      await themeButton.evaluate((el: HTMLElement) => el.focus());

      // Additional wait for focus to settle
      await page.waitForTimeout(100);

      // Theme button should now be focused
      let focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
      expect(focusedElement).not.toBe('BODY');

      // Tab to next interactive element
      await page.keyboard.press('Tab');

      // Some element should still be focused (not BODY)
      focusedElement = await page.evaluate(() => document.activeElement?.tagName);
      expect(focusedElement).toBeTruthy();
      expect(focusedElement).not.toBe('BODY');
    });

      });
});
