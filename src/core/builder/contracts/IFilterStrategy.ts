/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as fs from 'node:fs'

/**
 * Interface contract for VFS filtering strategies in the builder pipeline.
 */
export interface IFilterStrategy {
  /**
   * Evaluates whether a file should be included in concatenation.
   *
   * @param filePath - Relative path of the file
   * @param stats - Optional filesystem stats object
   * @returns true if file should be included, false if excluded
   */
  shouldInclude(filePath: string, stats?: fs.Stats): boolean
}
