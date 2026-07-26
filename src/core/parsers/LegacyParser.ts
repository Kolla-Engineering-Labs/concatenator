/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  START_DELIMITER,
  END_DELIMITER,
  FILE_END_DELIMITER,
} from '../constants.js'
import type {
  DeconcatenateResult,
  VirtualFile,
  TelemetryPayload,
} from '../engine.js'
import type { IContextParser } from './IContextParser.js'
import { extractSessionId, processExtractedFile } from './ParserUtils.js'

/**
 * Parser strategy for legacy concatenated content (without session IDs)
 */
export class LegacyParser implements IContextParser {
  /**
   * Evaluate if content matches legacy delimiter format without a session ID manifest
   */
  canParse(content: string): boolean {
    return !extractSessionId(content) && content.includes('<<<<< FILE_START:')
  }

  /**
   * Extract files using legacy position-based parsing
   */
  parse(content: string, rootDir = '.'): DeconcatenateResult {
    const files: VirtualFile[] = []
    const skippedPaths: string[] = []
    const addedPaths = new Set<string>()
    const telemetry: TelemetryPayload = {
      skipped: [],
      symlinksRejected: 0,
      pathTraversalsRejected: 0,
    }

    let searchIndex = 0
    let foundAny = false

    while (true) {
      const startIndex = content.indexOf(START_DELIMITER, searchIndex)
      if (startIndex === -1) break

      const pathStart = startIndex + START_DELIMITER.length
      const pathEnd = content.indexOf(END_DELIMITER, pathStart)
      if (pathEnd === -1) break

      const nextStartDelimiter = content.indexOf(START_DELIMITER, pathStart)
      const contentStartRaw = pathEnd + END_DELIMITER.length
      const fileEndIndex = content.indexOf(FILE_END_DELIMITER, contentStartRaw)

      const path = content.substring(pathStart, pathEnd).trim()

      if (
        fileEndIndex === -1 ||
        (nextStartDelimiter !== -1 && nextStartDelimiter < fileEndIndex)
      ) {
        skippedPaths.push(path || '(unknown path)')
        telemetry.skipped.push({
          path: path || '(unknown path)',
          reason: 'Missing End Delimiter',
        })
        searchIndex =
          nextStartDelimiter !== -1 ? nextStartDelimiter : content.length
        continue
      }

      let fileContent = content.substring(contentStartRaw, fileEndIndex)
      fileContent = fileContent.replace(/^[\r\n]+|[\r\n]+$/g, '')

      if (
        processExtractedFile(
          path,
          fileContent,
          rootDir,
          files,
          skippedPaths,
          addedPaths,
          telemetry
        )
      ) {
        foundAny = true
      }

      searchIndex = fileEndIndex + FILE_END_DELIMITER.length
    }

    return { files, skippedPaths, foundAny, telemetry }
  }
}
