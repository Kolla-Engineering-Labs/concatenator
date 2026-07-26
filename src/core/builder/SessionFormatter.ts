/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  FILE_END_DELIMITER,
  MANIFEST_PREFIX,
  MANIFEST_SUFFIX,
} from '../constants.js'
import type {
  ConcatenateInputFile,
  FormatterOptions,
  IFormatter,
} from './contracts/IFormatter.js'
import {
  buildFileStartMarker,
  checkSessionIdCollision,
  generateCollisionFreeSessionId,
} from './BuilderUtils.js'

/**
 * Session-based concatenation formatting strategy implementing IFormatter.
 */
export class SessionFormatter implements IFormatter {
  public format(
    files: ConcatenateInputFile[],
    options?: FormatterOptions
  ): string {
    const ts = options?.timestamp || new Date().toLocaleString()
    const sid = options?.sessionId || generateCollisionFreeSessionId(files)

    // Validate provided session ID doesn't collide
    if (
      options?.sessionId &&
      checkSessionIdCollision(options.sessionId, files)
    ) {
      throw new Error(
        `Provided session ID '${options.sessionId}' collides with file content`
      )
    }

    let result = `${MANIFEST_PREFIX}${sid}${MANIFEST_SUFFIX}\n`
    result += `Concatenated on: ${ts}\n`
    if (options?.tokenBudget) {
      result += `Budget: ${options.tokenBudget.toLocaleString()}\n`
    }
    result += `\n`

    const totalFiles = files.length
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i]
      result += `${buildFileStartMarker(file.path, sid)}\n`
      result += typeof file.content === 'string' ? file.content : ''
      result += `\n${FILE_END_DELIMITER}\n\n`

      if (options?.onProgress) {
        options.onProgress(Math.round(((i + 1) / totalFiles) * 100))
      }
    }

    return result
  }
}
