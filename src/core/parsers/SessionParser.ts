/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FILE_END_DELIMITER } from '../constants.js'
import type {
  DeconcatenateResult,
  VirtualFile,
  TelemetryPayload,
} from '../engine.js'
import type { IContextParser } from './IContextParser.js'
import {
  extractSessionId,
  buildFileStartRegex,
  processExtractedFile,
} from './ParserUtils.js'

/**
 * Parser strategy for session-aware concatenated content
 */
export class SessionParser implements IContextParser {
  /**
   * Evaluate if content contains a session ID manifest header
   */
  canParse(content: string): boolean {
    return extractSessionId(content) !== null
  }

  /**
   * Extract files using session-aware delimiters
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

    const sessionId = extractSessionId(content)
    if (!sessionId) {
      return { files, skippedPaths, foundAny: false, telemetry }
    }

    const fileStartRegex = buildFileStartRegex(sessionId)
    const fileEndDelimiter = FILE_END_DELIMITER

    const matches: Array<{
      path: string
      contentStart: number
      fullMatchEnd: number
      index: number
    }> = []
    let match: RegExpExecArray | null

    while ((match = fileStartRegex.exec(content)) !== null) {
      matches.push({
        path: match[1].trim(),
        contentStart: match.index + match[0].length,
        fullMatchEnd: match.index + match[0].length,
        index: match.index,
      })
    }

    let foundAny = false
    const totalMatches = matches.length

    for (let i = 0; i < totalMatches; i++) {
      const { path, contentStart } = matches[i]
      const nextMatchStart = i < totalMatches - 1 ? matches[i + 1].index : null

      const fileEndIndex = content.indexOf(fileEndDelimiter, contentStart)

      if (
        fileEndIndex === -1 ||
        (nextMatchStart !== null && fileEndIndex > nextMatchStart)
      ) {
        skippedPaths.push(path || '(unknown path)')
        telemetry.skipped.push({
          path: path || '(unknown path)',
          reason: 'Missing End Delimiter',
        })
        continue
      }

      let fileContent = content.substring(contentStart, fileEndIndex)
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
    }

    return { files, skippedPaths, foundAny, telemetry }
  }
}
