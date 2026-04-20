/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'
import * as path from 'path'
import { logger } from '../src/lib/logger'

/**
 * Global setup for Playwright tests.
 * Cleans up test-results directory before each test run.
 */
async function globalSetup(): Promise<void> {
  const testResultsDir = path.join(process.cwd(), 'test-results')

  // Clean up old test results to prevent file accumulation
  if (fs.existsSync(testResultsDir)) {
    try {
      fs.rmSync(testResultsDir, { recursive: true, force: true })
      logger.info('[global-setup] Cleaned up test-results directory')
    } catch (error) {
      logger.error('[global-setup] Failed to clean test-results:', error)
    }
  }

  // Ensure downloads directories exist
  const downloadDirs = [
    'chromium',
    'firefox',
    'webkit',
    'mobile-chrome',
    'mobile-safari',
  ]
  for (const dir of downloadDirs) {
    const dirPath = path.join(testResultsDir, 'downloads', dir)
    fs.mkdirSync(dirPath, { recursive: true })
  }

  // Clean up any leftover worker-specific ignore files from previous runs
  const cwd = process.cwd()
  const files = fs.readdirSync(cwd)
  for (const file of files) {
    if (file.startsWith('.concatenate-ignore-worker-')) {
      try {
        fs.unlinkSync(path.join(cwd, file))
      } catch (error) {
        logger.error(`[global-setup] Failed to clean up ${file}:`, error)
      }
    }
  }
}

export default globalSetup
