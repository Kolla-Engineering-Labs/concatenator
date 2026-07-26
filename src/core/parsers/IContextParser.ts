/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DeconcatenateResult } from '../engine.js'

/**
 * Strategy contract for context extraction from concatenated content payloads
 */
export interface IContextParser {
  /**
   * Determines whether the given content signature matches this strategy
   */
  canParse(content: string): boolean

  /**
   * Parses content into extracted files, skipped paths, and telemetry payload
   */
  parse(content: string, rootDir?: string): DeconcatenateResult
}
