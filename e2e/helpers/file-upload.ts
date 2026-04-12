/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Page } from '@playwright/test';
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
   * Creates files on disk and uses Playwright's setInputFiles for reliable uploads.
   * This properly handles FileReader and webkitRelativePath in the browser.
   */
  async setFilesOnInput(files: MockFile[]): Promise<void> {
    // Use Playwright's native file upload which properly handles webkitdirectory
    const fileInput = this.page.locator('input[type="file"]').first();

    // Check if this is a webkitdirectory input
    const hasWebkitDirectory = await fileInput.evaluate(el => el.hasAttribute('webkitdirectory'));

    if (hasWebkitDirectory) {
      // For directory inputs, create a subdirectory to ensure consistent root name
      // This prevents the random temp dir name from appearing in the tree
      const uploadDir = path.join(this.tempDir, 'upload');
      fs.mkdirSync(uploadDir, { recursive: true });

      // Create files inside the upload subdirectory
      for (const file of files) {
        const fullPath = path.join(uploadDir, file.path);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, file.content);
      }

      // Upload the subdirectory (browser will use 'upload' as the root name)
      await fileInput.setInputFiles(uploadDir);
    } else {
      // For regular file inputs, create files directly in temp dir
      for (const file of files) {
        const fullPath = path.join(this.tempDir, file.path);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, file.content);
      }

      // Pass individual file paths
      const filePaths = files.map(file => path.join(this.tempDir, file.path));
      await fileInput.setInputFiles(filePaths);
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
      // For directory inputs, create upload subdirectory for consistent root name
      const dirPath = path.join(this.tempDir, 'upload');
      fs.mkdirSync(dirPath, { recursive: true });
      const targetPath = path.join(dirPath, name);
      fs.writeFileSync(targetPath, content);
      await fileInput.setInputFiles(dirPath);
    } else {
      // For regular file inputs, pass the file path directly
      const filePath = path.join(this.tempDir, name);
      fs.writeFileSync(filePath, content);
      await fileInput.setInputFiles(filePath);
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
