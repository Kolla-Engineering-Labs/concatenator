/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs'

/**
 * Checks if a directory is "tainted" (contains files other than system defaults).
 * Returns true if the path exists and is a file, or if it's a directory containing
 * more than 0 non-system files (.DS_Store, Thumbs.db).
 */
export function isDirectoryTainted(targetPath: string): boolean {
  if (!fs.existsSync(targetPath)) return false

  if (!fs.statSync(targetPath).isDirectory()) {
    // It's a file, definitely tainted
    return true
  }

  const files = fs
    .readdirSync(targetPath)
    .filter((file) => file !== '.DS_Store' && file !== 'Thumbs.db')

  return files.length > 0
}
