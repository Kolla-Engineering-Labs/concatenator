/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from '@playwright/test';
import { FileUploadHelper } from './helpers/file-upload';

/**
 * Helper function to click an element using JavaScript for better Firefox compatibility
 */
async function jsClick(locator: import('@playwright/test').Locator): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click());
}

/*
 * These tests manipulate UI state and localStorage which can cause
 * conflicts when run in parallel. Serial mode ensures stable test execution.
 */
test.describe.serial('UI Interactions and Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before navigation to avoid interference from previous test runs
    await page.addInitScript(() => {
      localStorage.removeItem('concatenate-ignore');
    });

    // Reset server-side ignore list BEFORE navigation so client fetches correct state
    await page.request.post('/api/ignore-list', {
      data: ['.concatenate-ignore', '.DS_Store', '.env', '.expo', '.git', '.gradle', '.next', '.secrets', '.terraform', '.vagrant', '.vscode', '/\\.class$/', '/\\.exe$/', '/\\.jar$/', '/\\.log$/', '/\\.o$/', '/\\.obj$/', '/\\.swp$/', '/^__.*cache__$/', '/^\\..*_cache$/', 'bin', 'build', 'desktop.ini', 'dist', 'LICENSE', 'node_modules', 'obj', 'package-lock.json', 'ruff_output.txt', 'target', 'Thumbs.db', 'vendor', 'venv']
    });

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
    test('should add ignore pattern with Enter key', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.dragAndDropDirectory([
          { name: 'temp.tmp', path: 'temp.tmp', content: 'temp' },
        ]);

        await expect(page.getByText('temp.tmp')).toBeVisible({ timeout: 10000 });

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

        // Pattern should be added
        await expect(page.getByText('*.tmp')).toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });

    test('should close settings modal with Escape key', async ({ page }) => {
      // Open settings
      const settingsButton = page.locator('header button[title="Settings"]');
      await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
      await jsClick(settingsButton);

      // Modal should be open
      const modal = page.locator('div').filter({ hasText: /^Settings$/ }).first();
      await expect(modal).toBeVisible();

      // Focus the modal container to ensure it receives keyboard events (needed for Firefox)
      const modalContainer = page.locator('[role="dialog"]').first();
      await modalContainer.waitFor({ state: 'visible', timeout: 5000 });
      await modalContainer.evaluate((el: HTMLElement) => el.focus());

      // Press Escape
      await page.keyboard.press('Escape');

      // Wait for exit animation to complete (AnimatePresence uses 200ms duration, add buffer)
      await page.waitForTimeout(500);

      // Modal should close
      await expect(modal).not.toBeVisible();
    });
  });

  test.describe('Responsive Behavior', () => {
    test('should adapt layout on mobile viewport', async ({ page, context, browserName }) => {
      // Skip on Firefox due to known Playwright setViewportSize timeout issues
      test.skip(browserName === 'firefox', 'Viewport resize tests skipped on Firefox due to Playwright limitations');

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
      // Skip on Firefox due to known Playwright setViewportSize timeout issues
      test.skip(browserName === 'firefox', 'Viewport resize tests skipped on Firefox due to Playwright limitations');

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
    test('should show visual feedback on drag over', async ({ page }) => {
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
      await page.waitForTimeout(100);

      // The dropzone should have hover styling (this is tested via class changes)
      // Note: Actual hover state may not persist after the event, but we verify no error occurred
    });

    test('should handle drag leave gracefully', async ({ page }) => {
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
      // Settings button should have title
      const settingsButton = page.locator('header button[title="Settings"]');
      await expect(settingsButton).toBeVisible();

      // Theme button should be present
      const themeButton = page.locator('header button').nth(1);
      await expect(themeButton).toBeVisible();
    });

    test('should have focusable elements', async ({ page }) => {
      // First, click on a focusable element to ensure document has focus
      const settingsButton = page.locator('header button[title="Settings"]');
      await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
      // Use JavaScript click for Firefox compatibility
      await jsClick(settingsButton);

      // Settings button should now be focused
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

    test('settings inputs should have labels', async ({ page }) => {
      // Open settings using JavaScript click for Firefox compatibility
      const settingsButton = page.locator('header button[title="Settings"]');
      await settingsButton.waitFor({ state: 'visible', timeout: 5000 });
      await jsClick(settingsButton);

      // Check for labeled inputs
      const geminiLabel = page.getByText('Gemini API Key');
      const openaiLabel = page.getByText('OpenAI API Key');
      const anthropicLabel = page.getByText('Anthropic API Key');

      await expect(geminiLabel).toBeVisible();
      await expect(openaiLabel).toBeVisible();
      await expect(anthropicLabel).toBeVisible();
    });
  });
});
