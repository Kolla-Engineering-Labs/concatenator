/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test, expect } from '@playwright/test';
import { FileUploadHelper } from './helpers/file-upload';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

/**
 * Creates a mock concatenated file content that the de-concatenator can parse.
 * Format uses the app's actual delimiters from constants.ts
 */
function createMockConcatenatedFile(files: Array<{ path: string; content: string }>): string {
  const lines: string[] = [];

  const now = new Date();
  const timestamp = now.toLocaleString();

  lines.push(`Concatenated on: ${timestamp}`);
  lines.push('');

  for (const file of files) {
    lines.push(`<<<<< CONCATENATOR_FILE_START: ${file.path} >>>>>`);
    lines.push(file.content);
    lines.push('<<<<< CONCATENATOR_FILE_END >>>>>');
    lines.push('');
  }

  return lines.join('\n');
}

/*
 * These tests modify application state (mode switching, file uploads)
 * and may interact with shared server resources.
 * Serial mode prevents cross-test interference.
 */
test.describe.serial('De-concatenate Mode', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before navigation to avoid interference from previous test runs
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

    // Wait for the mode toggle container to be fully rendered and stable
    const modeToggle = page.locator('.flex.p-1.bg-slate-200').first();
    await modeToggle.waitFor({ state: 'visible', timeout: 10000 });

    // Switch to de-concatenate mode using JavaScript click for Firefox compatibility
    const deconcatButton = page.getByRole('button', { name: 'De-concatenate', exact: true });
    await deconcatButton.waitFor({ state: 'visible', timeout: 10000 });

    // Use evaluate for more reliable clicking in Firefox
    await deconcatButton.evaluate((el: HTMLElement) => el.click());

    // Wait for the mode switch to complete by checking button state
    await expect(deconcatButton).toHaveClass(/bg-white|dark:bg-slate-800/, { timeout: 10000 });
  });

  test.describe('Mode Switching', () => {
    test('should switch to de-concatenate mode', async ({ page }) => {
      // Verify mode toggle shows both options
      await expect(page.getByRole('button', { name: 'Concatenate', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'De-concatenate', exact: true })).toBeVisible();

      // De-concatenate button should be active
      const deconcatButton = page.getByRole('button', { name: 'De-concatenate', exact: true });
      await expect(deconcatButton).toHaveClass(/bg-white|dark:bg-slate-800/);

      // Concatenate button should be inactive
      const concatButton = page.getByRole('button', { name: 'Concatenate', exact: true });
      await expect(concatButton).not.toHaveClass(/bg-white|dark:bg-slate-800/);
    });

    test('should clear files when switching modes', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        // Create a concatenated file
        const mockContent = createMockConcatenatedFile([
          { path: 'test.txt', content: 'Hello World' },
        ]);

        // Upload the file in concatenate mode first
        const concatButton = page.getByRole('button', { name: 'Concatenate', exact: true });
        await concatButton.evaluate((el: HTMLElement) => el.click());

        await uploadHelper.uploadSingleFile('concatenated.txt', mockContent);

        // Wait for file to appear (in concatenate mode, it would show files)
        // Now switch to de-concatenate mode using JavaScript click
        const deconcatButton = page.getByRole('button', { name: 'De-concatenate', exact: true });
        await deconcatButton.evaluate((el: HTMLElement) => el.click());

        // Wait for mode switch and verify we're in de-concatenate mode
        await expect(deconcatButton).toHaveClass(/bg-white|dark:bg-slate-800/, { timeout: 10000 });

        // The file list should be cleared
        // Verify we're in de-concatenate mode by checking the dropzone text
        await expect(page.getByText(/Drop concatenated \.txt file here/)).toBeVisible();
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('File Upload', () => {
    test('should accept concatenated text file via drag and drop', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        const mockContent = createMockConcatenatedFile([
          { path: 'readme.md', content: '# Project README\n\nThis is a test project.' },
          { path: 'src/index.js', content: 'console.log("Hello, World!");' },
          { path: 'package.json', content: '{"name": "test-project"}' },
        ]);

        // Wait for the download event (app auto-downloads ZIP after processing)
        // Mobile Safari needs more time for de-concatenation + ZIP creation
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          uploadHelper.uploadSingleFile('concatenated.txt', mockContent),
        ]);

        // Verify it's a ZIP file
        expect(download.suggestedFilename()).toMatch(/\.zip$/i);

        // Clean up download
        await download.delete();
      } finally {
        uploadHelper.cleanup();
      }
    });

    test('should show error for invalid file format', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        const invalidContent = 'This is not a valid concatenated file format.';
        await uploadHelper.uploadSingleFile('invalid.txt', invalidContent);

        // Should show an error message in the dropzone
        await expect(page.getByText(/No concatenated files were found/i)).toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('ZIP Download', () => {
    test('should download files as ZIP after de-concatenation', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      const files = [
        { path: 'document.md', content: '# Documentation\n\nProject docs here.' },
        { path: 'config.json', content: '{"version": "1.0.0"}' },
        { path: 'main.py', content: 'def main():\n    print("Hello")' },
      ];

      const mockContent = createMockConcatenatedFile(files);

      // Wait for the download event (app auto-downloads ZIP after processing)
      // Mobile Safari needs more time for de-concatenation + ZIP creation
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        uploadHelper.uploadSingleFile('project-bundle.txt', mockContent),
      ]);

      // Verify it's a ZIP file
      expect(download.suggestedFilename()).toMatch(/\.zip$/i);

      // Verify the download actually happened
      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();
      expect(fs.existsSync(downloadPath)).toBe(true);

      // Verify it's a valid ZIP with expected content
      if (downloadPath) {
        const zipContent = fs.readFileSync(downloadPath);
        const zip = await JSZip.loadAsync(zipContent);

        // Check for expected files in the ZIP (parallel extraction for speed)
        const extractionPromises = files.map(async (file) => {
          const zipFile = zip.file(file.path);
          expect(zipFile).toBeTruthy();

          if (zipFile) {
            const content = await zipFile.async('text');
            expect(content).toBe(file.content);
          }
        });
        await Promise.all(extractionPromises);

        // Clean up download file with retry to handle EBUSY race condition
        let retries = 5;
        while (retries > 0) {
          try {
            fs.unlinkSync(downloadPath);
            break;
          } catch (err: any) {
            if (err.code === 'EBUSY' && retries > 1) {
              retries--;
              await new Promise(r => setTimeout(r, 100));
            } else {
              throw err;
            }
          }
        }
      }

      uploadHelper.cleanup();
    });

    test('should preserve directory structure in ZIP', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      const files = [
        { path: 'src/components/Button.tsx', content: 'export const Button = () => <button />;' },
        { path: 'src/components/Input.tsx', content: 'export const Input = () => <input />;' },
        { path: 'src/utils/helpers.ts', content: 'export const helper = () => {};' },
        { path: 'tests/Button.test.tsx', content: 'test("button")' },
      ];

      const mockContent = createMockConcatenatedFile(files);

      // Wait for the download event (app auto-downloads ZIP after processing)
      // Mobile Safari needs more time for de-concatenation + ZIP creation
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        uploadHelper.uploadSingleFile('structured-bundle.txt', mockContent),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();

      if (downloadPath) {
        const zipContent = fs.readFileSync(downloadPath);
        const zip = await JSZip.loadAsync(zipContent);

        // Verify directory structure is preserved (parallel extraction)
        const extractionPromises = files.map(async (file) => {
          const zipFile = zip.file(file.path);
          expect(zipFile).toBeTruthy();
        });
        await Promise.all(extractionPromises);

        // Verify folder structure
        const folders = Object.keys(zip.files).filter(name => name.endsWith('/'));
        expect(folders.some(f => f.includes('src/'))).toBe(true);
        expect(folders.some(f => f.includes('src/components/'))).toBe(true);
        expect(folders.some(f => f.includes('src/utils/'))).toBe(true);
        expect(folders.some(f => f.includes('tests/'))).toBe(true);

        // Clean up download file with retry to handle EBUSY race condition
        let retries = 5;
        while (retries > 0) {
          try {
            fs.unlinkSync(downloadPath);
            break;
          } catch (err: any) {
            if (err.code === 'EBUSY' && retries > 1) {
              retries--;
              await new Promise(r => setTimeout(r, 100));
            } else {
              throw err;
            }
          }
        }
      }

      uploadHelper.cleanup();
    });

    test('should handle special characters in filenames', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      const files = [
        { path: 'file with spaces.txt', content: 'content with spaces' },
        { path: 'file-with-dashes.js', content: 'const x = 1;' },
        { path: 'file_with_underscores.py', content: 'print("hello")' },
        { path: 'file.multiple.dots.ts', content: 'const y: number = 2;' },
      ];

      const mockContent = createMockConcatenatedFile(files);

      // Wait for the download event (app auto-downloads ZIP after processing)
      // Mobile Safari needs more time for de-concatenation + ZIP creation
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        uploadHelper.uploadSingleFile('special-chars.txt', mockContent),
      ]);

      const downloadPath = await download.path();
      expect(downloadPath).toBeTruthy();

      if (downloadPath) {
        const zipContent = fs.readFileSync(downloadPath);
        const zip = await JSZip.loadAsync(zipContent);

        // Verify all files with special characters are present (parallel)
        const extractionPromises = files.map(async (file) => {
          const zipFile = zip.file(file.path);
          expect(zipFile).toBeTruthy();
        });
        await Promise.all(extractionPromises);

        // Clean up download file with retry to handle EBUSY race condition
        let retries = 5;
        while (retries > 0) {
          try {
            fs.unlinkSync(downloadPath);
            break;
          } catch (err: any) {
            if (err.code === 'EBUSY' && retries > 1) {
              retries--;
              await new Promise(r => setTimeout(r, 100));
            } else {
              throw err;
            }
          }
        }
      }

      uploadHelper.cleanup();
    });
  });

  test.describe('Large File Handling', () => {
    test('should handle large concatenated files', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        // Create a file with many entries
        const files = Array.from({ length: 100 }, (_, i) => ({
          path: `generated/file${i}.txt`,
          content: `Content for file ${i}: ${'x'.repeat(100)}`,
        }));

        const mockContent = createMockConcatenatedFile(files);

        // Wait for the download event (app auto-downloads ZIP after processing)
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          uploadHelper.uploadSingleFile('large-bundle.txt', mockContent),
        ]);

        // Verify it's a ZIP file
        expect(download.suggestedFilename()).toMatch(/\.zip$/i);

        // Clean up download
        await download.delete();
      } finally {
        uploadHelper.cleanup();
      }
    });

    test('should handle files with large content', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        const files = [
          {
            path: 'large-file.txt',
            content: 'Line content\n'.repeat(10000) // ~120KB of content
          },
        ];

        const mockContent = createMockConcatenatedFile(files);

        // Wait for the download event (app auto-downloads ZIP after processing)
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 30000 }),
          uploadHelper.uploadSingleFile('big-content.txt', mockContent),
        ]);

        const downloadPath = await download.path();
        if (downloadPath) {
          const zipContent = fs.readFileSync(downloadPath);
          const zip = await JSZip.loadAsync(zipContent);
          const zipFile = zip.file('large-file.txt');
          expect(zipFile).toBeTruthy();

          // Clean up download file with retry to handle EBUSY race condition
          let retries = 5;
          while (retries > 0) {
            try {
              fs.unlinkSync(downloadPath);
              break;
            } catch (err: any) {
              if (err.code === 'EBUSY' && retries > 1) {
                retries--;
                await new Promise(r => setTimeout(r, 100));
              } else {
                throw err;
              }
            }
          }
        }
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle empty concatenated file', async ({ page }) => {
      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.uploadSingleFile('empty.txt', '');

        // Should show appropriate error in the dropzone
        await expect(page.getByText(/No concatenated files were found/i)).toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });

    test('should handle malformed file markers', async ({ page }) => {
      const malformedContent = `
═══════════════════════════════════════════════════════════════════════════════
CONCATENATED FILES
═══════════════════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────────────────────
File: valid.txt
───────────────────────────────────────────────────────────────────────────────

This content is valid

This is not a valid marker format

Some random text without proper structure
`;

      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.uploadSingleFile('malformed.txt', malformedContent);

        // Should show error for invalid format
        await expect(page.getByText(/No concatenated files were found/i)).toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });

    test('should handle binary-looking content gracefully', async ({ page }) => {
      const binaryLikeContent = `
═══════════════════════════════════════════════════════════════════════════════
CONCATENATED FILES
═══════════════════════════════════════════════════════════════════════════════

───────────────────────────────────────────────────────────────────────────────
File: data.bin
───────────────────────────────────────────────────────────────────────────────

${Buffer.from([0x00, 0x01, 0x02, 0xFF, 0xFE]).toString('base64')}
`;

      const uploadHelper = new FileUploadHelper(page);

      try {
        await uploadHelper.uploadSingleFile('binary-ish.txt', binaryLikeContent);

        // Should show error for invalid format
        await expect(page.getByText(/No concatenated files were found/i)).toBeVisible({ timeout: 10000 });
      } finally {
        uploadHelper.cleanup();
      }
    });
  });

  test.describe('UI State', () => {
    test('should show appropriate dropzone message in de-concatenate mode', async ({ page }) => {
      // Dropzone should show de-concatenate specific message
      await expect(page.getByText(/Drop concatenated \.txt file here/)).toBeVisible();
    });

    test('should not show file view in de-concatenate mode initially', async ({ page }) => {
      // File view section should not be visible
      await expect(page.getByText('Selected Files')).not.toBeVisible();
    });
  });
});
