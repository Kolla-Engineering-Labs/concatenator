/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ConcatenateInputFile } from './IFormatter.js'
import type { IFilterStrategy } from './IFilterStrategy.js'

export interface ScanOptions {
  rootPath: string
  ignoreEngine?: unknown
  followSymlinks?: boolean
  filterStrategies?: IFilterStrategy[]
}

/**
 * Interface contract for VFS directory traversal and scanning strategies.
 */
export interface IScanner {
  scanDirectory(options: ScanOptions): ConcatenateInputFile[]
  scanDirectoryStream?(
    options: ScanOptions
  ): AsyncGenerator<ConcatenateInputFile>
}
