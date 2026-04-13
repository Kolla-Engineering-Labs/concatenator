/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Page, Locator } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface MockFile {
  name: string;
  path: string;
  content: string;
}

/**
 * Helper class for simulating file uploads in Playwright tests.
 * Uses Playwright's native setInputFiles for reliable file handling.
 */
export class FileUploadHelper {
  private tempDir: string;

  constructor(private page: Page) {
    // Create a temp directory for this helper instance
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concatenator-test-'));
  }

  /**
   * Clean up temporary files created by this helper.
   */
  cleanup(): void {
    try {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Detects if the current browser is WebKit (Safari).
   */
  private async isWebKit(): Promise<boolean> {
    return this.page.evaluate(() => {
      const ua = navigator.userAgent.toLowerCase();
      return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
    });
  }

  /**
   * Sets files on a webkitdirectory input using a buffer-based payload to avoid
   * two separate problems on CI runners:
   *
   * Problem 1: Passing a directory *path* to setInputFiles() on a webkitdirectory
   *   input crashes the WebKit/Mobile Safari process on macOS CI runners with Node 22
   *   ("Target page, context or browser has been closed").
   *
   * Problem 2: Playwright enforces at the framework level that webkitdirectory inputs
   *   can ONLY receive a directory path — buffer payloads are rejected before the call
   *   even reaches the browser ("[webkitdirectory] input requires passing a path to a
   *   directory").
   *
   * Problem 3: Playwright's buffer payload `relativePath` field does NOT set
   *   file.webkitRelativePath in any browser. It is a browser security restriction
   *   that webkitRelativePath is only populated during a real directory-picker flow.
   *
   * Solution: Temporarily remove webkitdirectory, inject a capture-phase DOM listener
   *   that patches each File object's webkitRelativePath via Object.defineProperty
   *   (own properties shadow the read-only prototype getter), then call setInputFiles
   *   with the buffer payload, and finally restore the attribute.
   */
  private async setInputFilesViaBuffer(
    fileInput: Locator,
    payload: Array<{ name: string; mimeType: string; buffer: Buffer; relativePath?: string }>
  ): Promise<void> {
    const isWebKit = await this.isWebKit();
    const timeout = isWebKit ? 45000 : 30000;

    await fileInput.waitFor({ state: 'attached', timeout });

    // Playwright's buffer-based setInputFiles payload does NOT populate
    // file.webkitRelativePath in any browser (Chromium, Firefox, or WebKit).
    // This is a browser security restriction: webkitRelativePath is only set
    // by the browser when the user picks a directory through a webkitdirectory
    // input — programmatic injection via CDP bypasses that path.
    //
    // Fix: inject a capture-phase one-shot change-event listener BEFORE
    // stripping the attribute. It patches each File object's webkitRelativePath
    // via Object.defineProperty (own properties shadow the read-only prototype
    // getter) so that React's handler reads the correct directory path.
    const pathMap = payload.map(f => f.relativePath ?? f.name);
    await this.page.evaluate((map) => {
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (!input) return;
      const onceHandler = (e: Event) => {
        input.removeEventListener('change', onceHandler, true);
        const files = (e.target as HTMLInputElement).files;
        if (!files) return;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const relativePath = (map as string[])[i] ?? file.name;
          try {
            Object.defineProperty(file, 'webkitRelativePath', {
              value: relativePath,
              writable: false,
              configurable: true,
            });
          } catch {
            // Already non-configurable on this platform; skip silently.
          }
        }
      };
      // Capture phase: runs before React's bubble-phase synthetic event handler.
      input.addEventListener('change', onceHandler, true);
    }, pathMap);

    // Temporarily strip webkitdirectory so Playwright's framework-level guard
    // doesn't reject the buffer payload. The interceptor above has already been
    // registered and will fire when the change event is dispatched.
    await fileInput.evaluate((el: HTMLInputElement) => el.removeAttribute('webkitdirectory'));
    try {
      await fileInput.setInputFiles(payload, { timeout });
    } finally {
      // Restore the attribute so the input stays correct for subsequent uses.
      // On WebKit/Mobile Safari the browser context may be recycled by the time
      // we get here — swallow those errors, the restore is cosmetic.
      try {
        await fileInput.evaluate((el: HTMLInputElement) => el.setAttribute('webkitdirectory', ''));
      } catch {
        // Ignore "Target page, context or browser has been closed" on WebKit.
      }
    }
  }

  /**
   * Creates files on disk and uses Playwright's setInputFiles for reliable uploads.
   * This properly handles FileReader and webkitRelativePath in the browser.
   *
   * Uses buffer-based payloads instead of directory paths to prevent WebKit
   * from crashing on macOS GitHub Actions runners (Node 22 regression).
   */
  async setFilesOnInput(files: MockFile[]): Promise<void> {
    // Use Playwright's native file upload which properly handles webkitdirectory
    const fileInput = this.page.locator('input[type="file"]').first();

    // Check if this is a webkitdirectory input
    const hasWebkitDirectory = await fileInput.evaluate(el => el.hasAttribute('webkitdirectory'));

    if (hasWebkitDirectory) {
      // Build buffer-based payload so WebKit never needs to scan a directory on disk.
      // relativePath simulates webkitRelativePath; the caller's file.path
      // is used directly so the tree view sees the expected root directory.
      const payload = files.map(file => ({
        name: file.name,
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(file.content),
        relativePath: file.path,
      }));

      await this.setInputFilesViaBuffer(fileInput, payload);
    } else {
      // For regular (non-directory) file inputs, use on-disk paths as before.
      for (const file of files) {
        const fullPath = path.join(this.tempDir, file.path);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, file.content);
      }

      const filePaths = files.map(file => path.join(this.tempDir, file.path));
      const isWebKit = await this.isWebKit();
      const timeout = isWebKit ? 45000 : 30000;
      await fileInput.waitFor({ state: 'attached', timeout });
      await fileInput.setInputFiles(filePaths, { timeout });
    }
  }

  /**
   * Upload a single file using Playwright's setInputFiles.
   */
  async uploadSingleFile(name: string, content: string): Promise<void> {
    const fileInput = this.page.locator('input[type="file"]').first();

    // Check if this is a webkitdirectory input
    const hasWebkitDirectory = await fileInput.evaluate(el => el.hasAttribute('webkitdirectory'));

    if (hasWebkitDirectory) {
      // Use buffer-based payload to avoid WebKit crashes on macOS CI runners
      await this.setInputFilesViaBuffer(fileInput, [{
        name,
        mimeType: 'application/octet-stream',
        buffer: Buffer.from(content),
        relativePath: name,
      }]);
    } else {
      // For regular file inputs, pass the file path directly
      const filePath = path.join(this.tempDir, name);
      fs.writeFileSync(filePath, content);
      const isWebKit = await this.isWebKit();
      const timeout = isWebKit ? 45000 : 30000;
      await fileInput.waitFor({ state: 'attached', timeout });
      await fileInput.setInputFiles(filePath, { timeout });
    }
  }

  /**
   * Simulates dragging and dropping a directory of files.
   * Falls back to setInputFiles for reliability.
   */
  async dragAndDropDirectory(files: MockFile[]): Promise<void> {
    // For drag-and-drop, we use the same approach as setFilesOnInput
    // since true drag-and-drop simulation is unreliable across browsers
    await this.setFilesOnInput(files);
  }
}

/**
 * Creates a test directory structure on disk for file upload tests.
 * Returns the path to the created directory.
 */
export function createTestDirectory(files: MockFile[]): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'concatenator-test-'));
  
  for (const file of files) {
    const filePath = path.join(tempDir, file.path);
    const dir = path.dirname(filePath);
    
    // Create nested directories
    fs.mkdirSync(dir, { recursive: true });
    
    // Write file content
    fs.writeFileSync(filePath, file.content);
  }
  
  return tempDir;
}

/**
 * Cleans up a test directory.
 */
export function cleanupTestDirectory(dirPath: string): void {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
