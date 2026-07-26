/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs'
import { resolve } from 'node:path'
import { UnifiedCrawler } from '../Crawler.js'
import { IgnoreEngine } from '../ignore/IgnoreEngine.js'
import type { ConcatenateInputFile } from './contracts/IFormatter.js'
import type { IFilterStrategy } from './contracts/IFilterStrategy.js'
import type { IScanner, ScanOptions } from './contracts/IScanner.js'
import { normalizeInputFiles } from './BuilderUtils.js'

export type { ScanOptions } from './contracts/IScanner.js'

/**
 * VFS Traversal Scanner service for collecting input files for concatenation.
 * Accepts an array of IFilterStrategy implementations for decoupled file filtering.
 */
export class Scanner implements IScanner {
  private filterStrategies: IFilterStrategy[]

  constructor(filterStrategies: IFilterStrategy[] = []) {
    this.filterStrategies = filterStrategies
  }

  /**
   * Add a filter strategy to the scanner
   */
  public addFilterStrategy(strategy: IFilterStrategy): void {
    this.filterStrategies.push(strategy)
  }

  /**
   * Scan directory and collect readable text files as ConcatenateInputFile array
   */
  public scanDirectory(options: ScanOptions): ConcatenateInputFile[] {
    const rootPath = resolve(options.rootPath)
    const ignoreEngine =
      (options.ignoreEngine as IgnoreEngine) ?? new IgnoreEngine([])
    const crawler = new UnifiedCrawler({
      rootPath,
      ignoreEngine,
      followSymlinks: options.followSymlinks ?? false,
    })

    const activeFilters = [
      ...this.filterStrategies,
      ...(options.filterStrategies ?? []),
    ]

    const entries = crawler.collect(rootPath)
    const files: ConcatenateInputFile[] = []

    for (const entry of entries) {
      if (entry.kind === 'file' && entry.status === 'included') {
        let stats: fs.Stats | undefined
        try {
          stats = fs.statSync(entry.fullPath)
        } catch {
          // Ignore un-stattable entry
        }

        const shouldInclude = activeFilters.every((filter) =>
          filter.shouldInclude(entry.path, stats)
        )

        if (!shouldInclude) {
          continue
        }

        try {
          const content = fs.readFileSync(entry.fullPath, 'utf8')
          files.push({
            path: entry.path,
            content,
          })
        } catch {
          // Skip unreadable file gracefully
          continue
        }
      }
    }

    return files
  }

  /**
   * Normalize path separators and string content in an array of input files
   */
  public normalizeInputFiles(
    files: ConcatenateInputFile[]
  ): ConcatenateInputFile[] {
    return normalizeInputFiles(files)
  }
}
