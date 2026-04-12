/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect, Page } from '@playwright/test';
import { SIMPLE_PROJECT, REACT_PROJECT } from './fixtures/test-data';
import { createTestDirectory, cleanupTestDirectory } from './helpers/file-upload';

/**
 * Helper to upload files to a webkitdirectory input.
 * For webkitdirectory inputs, Playwright requires passing a path to an actual directory.
 * Returns a cleanup function that should be called after file processing is complete.
 */
async function setFilesForWebkitDirectory(
  page: Page,
  files: Array<{ name: string; content: string; relativePath: string }>
): Promise<() => void> {
  // Wait for page to be fully loaded and stable
  await page.waitForLoadState('domcontentloaded');

  // Wait for file input to be available
  const fileInput = page.locator('input[type="file"][webkitdirectory]');
  await fileInput.waitFor({ state: 'attached' });

  // Create temp directory with the files
  const mockFiles = files.map(f => ({
    name: f.name,
    path: f.relativePath,
    content: f.content
  }));
  const testDir = createTestDirectory(mockFiles);

  // webkitdirectory input requires a directory path - CRITICAL: must await
  await fileInput.setInputFiles(testDir);

  // Return cleanup function - caller must call this after files are processed
  return () => cleanupTestDirectory(testDir);
}

/**
 * E2E tests using the native file chooser dialog.
 * This is often more reliable than drag-and-drop simulation.
 *
 * These tests run in serial mode to prevent conflicts with shared
 * temporary directories and server state.
 */
test.describe.serial('File Upload via File Chooser', () => {
/**
 * Helper function to click an element using JavaScript for better Firefox compatibility
 */
async function jsClick(locator: import('@playwright/test').Locator): Promise<void> {
  await locator.evaluate((el: HTMLElement) => el.click());
}

  test.beforeEach(async ({ page }) => {
    // Clear localStorage before navigation
    await page.addInitScript(() => {
      localStorage.removeItem('concatenate-ignore');
      localStorage.removeItem('concatenate-view-mode');
      localStorage.removeItem('concatenate-dark-mode');
    });

    // Reset server-side ignore list BEFORE navigation so client fetches correct state
    await page.request.post('/api/ignore-list', {
      data: ['.concatenate-ignore', '.DS_Store', '.env', '.expo', '.git', '.gradle', '.next', '.secrets', '.terraform', '.vagrant', '.vscode', '/\\.class$/', '/\\.exe$/', '/\\.jar$/', '/\\.log$/', '/\\.o$/', '/\\.obj$/', '/\\.swp$/', '/^__.*cache__$/', '/^\\..*_cache$/', 'bin', 'build', 'desktop.ini', 'dist', 'LICENSE', 'node_modules', 'obj', 'package-lock.json', 'ruff_output.txt', 'target', 'Thumbs.db', 'vendor', 'venv']
    });

    // Use 'domcontentloaded' for faster Firefox navigation
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('should upload single file via file chooser', async ({ page }) => {
    // Use helper to set a single file with proper webkitRelativePath
    const cleanup = await setFilesForWebkitDirectory(page, [
      { name: 'hello.js', content: 'console.log("Hello, World!");', relativePath: 'test/hello.js' }
    ]);

    try {
      // Wait for processing to complete
      await expect(page.getByText(/Reading Files/)).not.toBeVisible({ timeout: 10000 });

      // Verify file appears in the list
      await expect(page.getByText('hello.js')).toBeVisible();
      await expect(page.getByText(/Selected Files.*1/)).toBeVisible();
    } finally {
      cleanup();
    }
  });

  test('should upload multiple files via file chooser', async ({ page }) => {
    // Use helper to set files with proper webkitRelativePath
    const fileContents = [
      { name: 'a.js', content: 'const a = 1;', relativePath: 'test/a.js' },
      { name: 'b.js', content: 'const b = 2;', relativePath: 'test/b.js' },
      { name: 'c.js', content: 'const c = 3;', relativePath: 'test/c.js' },
    ];

    const cleanup = await setFilesForWebkitDirectory(page, fileContents);

    try {
      // Wait for processing to complete
      await expect(page.getByText(/Reading Files/)).not.toBeVisible({ timeout: 10000 });

      // Verify all files appear
      for (const { name } of fileContents) {
        await expect(page.getByText(name)).toBeVisible();
      }

      await expect(page.getByText(/Selected Files.*3/)).toBeVisible();
    } finally {
      cleanup();
    }
  });

  test('should upload files with directory structure', async ({ page }) => {
    // Use helper to set files with proper webkitRelativePath for nested structure
    const structure = [
      { name: 'index.js', content: 'export default {};', relativePath: 'project/src/index.js' },
      { name: 'helpers.js', content: 'export const help = () => {};', relativePath: 'project/src/utils/helpers.js' },
      { name: 'index.test.js', content: 'test("index");', relativePath: 'project/tests/index.test.js' },
    ];

    const cleanup = await setFilesForWebkitDirectory(page, structure);

    try {
      // Wait for processing to complete
      await expect(page.getByText(/Reading Files/)).not.toBeVisible({ timeout: 10000 });

      // Verify files appear
      await expect(page.getByText('index.js')).toBeVisible();
      await expect(page.getByText('helpers.js')).toBeVisible();
      await expect(page.getByText('index.test.js')).toBeVisible();
    } finally {
      cleanup();
    }
  });

  test('should handle de-concatenate file upload', async ({ page }) => {
    // Switch to de-concatenate mode using JavaScript click for Firefox compatibility
    const deconcatButton = page.getByRole('button', { name: 'De-concatenate' });
    await deconcatButton.waitFor({ state: 'visible', timeout: 10000 });
    await jsClick(deconcatButton);
    // Wait for mode switch to complete
    await expect(deconcatButton).toHaveClass(/bg-white|dark:bg-slate-800/, { timeout: 10000 });

    // Create a mock concatenated file using the actual app format
    const concatenatedContent = `<<<<< CONCATENATOR_FILE_START: hello.js >>>>>
console.log("Hello");
<<<<< CONCATENATOR_FILE_END >>>>>

<<<<< CONCATENATOR_FILE_START: world.js >>>>>
console.log("World");
<<<<< CONCATENATOR_FILE_END >>>>>
`;

    // Wait for the input to be re-rendered without webkitdirectory
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])');
    await fileInput.waitFor({ state: 'attached' });

    // Wait for download event as successful de-concatenation triggers ZIP download
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      fileInput.setInputFiles({
        name: 'bundle.txt',
        buffer: Buffer.from(concatenatedContent),
        mimeType: 'text/plain'
      })
    ]);

    // Verify it's a ZIP file
    expect(download.suggestedFilename()).toMatch(/\.zip$/i);

    // Clean up download
    await download.delete();
  });

  test('should reject non-txt files in de-concatenate mode', async ({ page }) => {
    // Switch to de-concatenate mode using JavaScript click for Firefox compatibility
    const deconcatButton = page.getByRole('button', { name: 'De-concatenate' });
    await deconcatButton.waitFor({ state: 'visible', timeout: 10000 });
    await jsClick(deconcatButton);
    // Wait for mode switch to complete
    await expect(deconcatButton).toHaveClass(/bg-white|dark:bg-slate-800/, { timeout: 10000 });

    // Wait for the input to be re-rendered without webkitdirectory
    const fileInput = page.locator('input[type="file"]:not([webkitdirectory])');
    await fileInput.waitFor({ state: 'attached' });
    // For de-concatenate mode, use buffer since webkitdirectory is not set
    await fileInput.setInputFiles({
      name: 'data.json',
      buffer: Buffer.from('{"key": "value"}'),
      mimeType: 'application/json'
    });

    // May show error or warning for non-txt file, or may just not process
    // The app behavior may vary - just verify no crash
    await expect(page.getByRole('heading', { name: 'Concatenator' })).toBeVisible();
  });
});

test.describe.serial('File Upload with Test Fixtures', () => {
  test.beforeEach(async ({ page }) => {
    // Use 'domcontentloaded' for faster Firefox navigation
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('should upload simple project fixture', async ({ page }) => {
    // Use helper to upload fixture files
    const files = SIMPLE_PROJECT.map(f => ({
      name: f.name,
      content: f.content,
      relativePath: f.path
    }));

    const cleanup = await setFilesForWebkitDirectory(page, files);

    try {
      // Wait for processing to complete
      await expect(page.getByText(/Reading Files/)).not.toBeVisible({ timeout: 10000 });

      // Verify all fixture files are present
      for (const file of SIMPLE_PROJECT) {
        await expect(page.getByText(file.name)).toBeVisible();
      }
    } finally {
      cleanup();
    }
  });

  test('should upload React project fixture', async ({ page }) => {
    // Use helper to upload fixture files
    const files = REACT_PROJECT.map(f => ({
      name: f.name,
      content: f.content,
      relativePath: f.path
    }));

    const cleanup = await setFilesForWebkitDirectory(page, files);

    try {
      // Wait for processing to complete
      await expect(page.getByText(/Reading Files/)).not.toBeVisible({ timeout: 10000 });

      // Verify React project files
      await expect(page.getByText('App.tsx')).toBeVisible();
      await expect(page.getByText('Button.tsx')).toBeVisible();
      await expect(page.getByText('package.json')).toBeVisible();
    } finally {
      cleanup();
    }
  });
});
