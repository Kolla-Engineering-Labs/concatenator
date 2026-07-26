/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ConcatenateInputFile,
  FormatterOptions,
  IFormatter,
} from './contracts/IFormatter.js'
import type { INeutralizer } from '../shared/contracts/INeutralizer.js'
import type { IScanner, ScanOptions } from './contracts/IScanner.js'
import { SessionFormatter } from './SessionFormatter.js'
import { Neutralizer } from '../shared/Neutralizer.js'
import { normalizeInputFiles } from './BuilderUtils.js'

export interface ConcatenationBuilderOptions {
  formatter?: IFormatter
  neutralizer?: INeutralizer
  scanner?: IScanner
}

/**
 * ConcatenationBuilder acts as the Orchestrator for scanning, neutralizing, and formatting file bundles.
 */
export class ConcatenationBuilder {
  private formatter: IFormatter
  private neutralizer: INeutralizer
  private scanner?: IScanner

  constructor(options?: ConcatenationBuilderOptions) {
    this.formatter = options?.formatter ?? new SessionFormatter()
    this.neutralizer = options?.neutralizer ?? new Neutralizer()
    this.scanner = options?.scanner
  }

  /**
   * Scan files from directory, apply neutralization, and format bundle
   */
  public buildFromDirectory(
    scanOptions: ScanOptions,
    formatterOptions?: FormatterOptions
  ): string {
    if (!this.scanner) {
      throw new Error(
        'Scanner strategy instance is required for directory scanning.'
      )
    }
    const rawFiles = this.scanner.scanDirectory(scanOptions)
    return this.buildFromFiles(rawFiles, formatterOptions)
  }

  /**
   * Apply neutralization to provided files and build formatted bundle string
   */
  public buildFromFiles(
    files: ConcatenateInputFile[],
    formatterOptions?: FormatterOptions
  ): string {
    const normalizedFiles = normalizeInputFiles(files)
    const neutralizedFiles = normalizedFiles.map((file) => ({
      path: file.path,
      content: this.neutralizer.neutralize(file.content),
    }))

    return this.formatter.format(neutralizedFiles, formatterOptions)
  }
}

/**
 * Top-level backward-compatible concatenate orchestrator function
 */
export function concatenate(
  files: ConcatenateInputFile[],
  timestamp?: string,
  sessionId?: string,
  onProgress?: (progress: number) => void,
  tokenBudget?: number
): string {
  const orchestrator = new ConcatenationBuilder()
  return orchestrator.buildFromFiles(files, {
    timestamp,
    sessionId,
    onProgress,
    tokenBudget,
  })
}
