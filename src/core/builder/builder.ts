/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Writable } from 'node:stream'
import type {
  ConcatenateInputFile,
  FormatterOptions,
  IFormatter,
} from './contracts/IFormatter.js'
import type { INeutralizer } from '../shared/contracts/INeutralizer.js'
import type { IScanner, ScanOptions } from './contracts/IScanner.js'
import { SessionFormatter } from './SessionFormatter.js'
import { Neutralizer } from '../shared/Neutralizer.js'
import {
  normalizeInputFiles,
  generateSessionId,
  generateCollisionFreeSessionId,
  checkSessionIdCollision,
  buildFileStartMarker,
  computeHash,
  formatPostMatterManifest,
  type PostMatterLedgerItem,
} from './BuilderUtils.js'
import {
  MANIFEST_PREFIX,
  MANIFEST_SUFFIX,
  FILE_END_DELIMITER,
} from '../constants.js'

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
    const ledger: PostMatterLedgerItem[] = []

    const neutralizedFiles = normalizedFiles.map((file) => {
      const hash = file.hash || computeHash(file.content)
      const mode = file.mode || '0644'
      ledger.push({ path: file.path, mode, hash })
      return {
        ...file,
        content: this.neutralizer.neutralize(file.content),
      }
    })

    const sid =
      formatterOptions?.sessionId ||
      generateCollisionFreeSessionId(normalizedFiles)

    const formattedContent = this.formatter.format(neutralizedFiles, {
      ...formatterOptions,
      sessionId: sid,
    })

    const postMatterManifest = formatPostMatterManifest(ledger, sid)
    return `${formattedContent}${postMatterManifest}`
  }

  /**
   * Stream scanning, neutralization, formatting chunks, and Post-Matter manifest from directory
   */
  public async *buildStreamFromDirectory(
    scanOptions: ScanOptions,
    formatterOptions?: FormatterOptions
  ): AsyncGenerator<string> {
    if (!this.scanner) {
      throw new Error(
        'Scanner strategy instance is required for directory scanning.'
      )
    }

    const fileStream = this.scanner.scanDirectoryStream
      ? this.scanner.scanDirectoryStream(scanOptions)
      : this.scanner.scanDirectory(scanOptions)

    for await (const chunk of this.buildStreamFromFiles(
      fileStream,
      formatterOptions
    )) {
      yield chunk
    }
  }

  /**
   * Stream file concatenation chunks as an AsyncGenerator, ending with Post-Matter EOF Manifest
   */
  public async *buildStreamFromFiles(
    files:
      | ConcatenateInputFile[]
      | AsyncIterable<ConcatenateInputFile>
      | Iterable<ConcatenateInputFile>,
    formatterOptions?: FormatterOptions
  ): AsyncGenerator<string> {
    const inputFilesArray: ConcatenateInputFile[] = Array.isArray(files)
      ? files
      : []

    const sid =
      formatterOptions?.sessionId ||
      (inputFilesArray.length > 0
        ? generateCollisionFreeSessionId(inputFilesArray)
        : generateSessionId())

    if (
      formatterOptions?.sessionId &&
      inputFilesArray.length > 0 &&
      checkSessionIdCollision(formatterOptions.sessionId, inputFilesArray)
    ) {
      throw new Error(
        `Provided session ID '${formatterOptions.sessionId}' collides with file content`
      )
    }

    const ts = formatterOptions?.timestamp || new Date().toLocaleString()
    let header = `${MANIFEST_PREFIX}${sid}${MANIFEST_SUFFIX}\n`
    header += `Concatenated on: ${ts}\n`
    if (formatterOptions?.tokenBudget) {
      header += `Budget: ${formatterOptions.tokenBudget.toLocaleString()}\n`
    }
    header += `\n`

    yield header

    const ledger: PostMatterLedgerItem[] = []
    const iterableFiles:
      AsyncIterable<ConcatenateInputFile> | Iterable<ConcatenateInputFile> =
      files

    for await (const rawFile of iterableFiles) {
      const path = rawFile.path.replace(/\\/g, '/')
      const hash = rawFile.hash || computeHash(rawFile.content)
      const mode = rawFile.mode || '0644'

      ledger.push({ path, mode, hash })

      const neutralized = this.neutralizer.neutralize(rawFile.content)
      let fileChunk = `${buildFileStartMarker(path, sid)}\n`
      fileChunk += typeof neutralized === 'string' ? neutralized : ''
      fileChunk += `\n${FILE_END_DELIMITER}\n\n`

      yield fileChunk
    }

    // Flush Post-Matter EOF Manifest as the final chunk
    yield formatPostMatterManifest(ledger, sid)
  }

  /**
   * Stream scanning and formatting chunks directly to a Writable stream
   */
  public async buildToWritableFromDirectory(
    writable: Writable,
    scanOptions: ScanOptions,
    formatterOptions?: FormatterOptions
  ): Promise<void> {
    for await (const chunk of this.buildStreamFromDirectory(
      scanOptions,
      formatterOptions
    )) {
      if (!writable.write(chunk)) {
        await new Promise<void>((res) => writable.once('drain', res))
      }
    }
  }

  /**
   * Stream files and formatting chunks directly to a Writable stream
   */
  public async buildToWritable(
    writable: Writable,
    files:
      | ConcatenateInputFile[]
      | AsyncIterable<ConcatenateInputFile>
      | Iterable<ConcatenateInputFile>,
    formatterOptions?: FormatterOptions
  ): Promise<void> {
    for await (const chunk of this.buildStreamFromFiles(
      files,
      formatterOptions
    )) {
      if (!writable.write(chunk)) {
        await new Promise<void>((res) => writable.once('drain', res))
      }
    }
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
