/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ConcatenateInputFile {
  path: string
  content: string
}

export interface FormatterOptions {
  timestamp?: string
  sessionId?: string
  onProgress?: (progress: number) => void
  tokenBudget?: number
}

/**
 * Interface contract for bundle formatting strategies in the builder pipeline.
 */
export interface IFormatter {
  format(files: ConcatenateInputFile[], options?: FormatterOptions): string
}
