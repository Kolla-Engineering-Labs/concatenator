/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  DeconcatenateResult,
  VirtualFile,
  TelemetryPayload,
} from '../engine.js'
import type { IContextParser } from './IContextParser.js'
import { extractSessionId, processExtractedFile } from './ParserUtils.js'

/**
 * Parser strategy for header-style concatenated content (--- FILE: path/to/file ---)
 */
export class HeaderParser implements IContextParser {
  /**
   * Evaluate if content matches header protocol without a session ID or standard start delimiter
   */
  canParse(content: string): boolean {
    return (
      !extractSessionId(content) &&
      !content.includes('<<<<< FILE_START:') &&
      content.includes('--- FILE:')
    )
  }

  /**
   * Extract files using header format regex matching
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

    const startRegex = /--- FILE: (.+?) ---/g
    let match: RegExpExecArray | null
    const matches: { path: string; start: number; end: number }[] = []

    while ((match = startRegex.exec(content)) !== null) {
      matches.push({
        path: match[1].trim(),
        start: match.index,
        end: match.index + match[0].length,
      })
    }

    for (let i = 0; i < matches.length; i++) {
      const startPos = matches[i].end
      const nextStartPos =
        i < matches.length - 1 ? matches[i + 1].start : content.length

      let fileContent = content.substring(startPos, nextStartPos)

      fileContent = fileContent.replace(/[\r\n]+---[\r\n]*$/, '')
      fileContent = fileContent.replace(/^[\r\n]+|[\r\n]+$/g, '')

      processExtractedFile(
        matches[i].path,
        fileContent,
        rootDir,
        files,
        skippedPaths,
        addedPaths,
        telemetry
      )
    }

    return { files, skippedPaths, foundAny: files.length > 0, telemetry }
  }
}
