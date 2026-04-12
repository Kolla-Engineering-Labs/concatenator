/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Global setup for Playwright tests.
 * Cleans up test-results directory before each test run.
 */
async function globalSetup(): Promise<void> {
  const testResultsDir = path.join(process.cwd(), 'test-results');

  // Clean up old test results to prevent file accumulation
  if (fs.existsSync(testResultsDir)) {
    try {
      fs.rmSync(testResultsDir, { recursive: true, force: true });
      console.log('[global-setup] Cleaned up test-results directory');
    } catch (error) {
      console.warn('[global-setup] Failed to clean test-results:', error);
    }
  }

  // Ensure downloads directories exist
  const downloadDirs = ['chromium', 'firefox', 'webkit', 'mobile-chrome', 'mobile-safari'];
  for (const dir of downloadDirs) {
    const dirPath = path.join(testResultsDir, 'downloads', dir);
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export default globalSetup;
