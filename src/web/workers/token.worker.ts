/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TokenService } from '../../core/TokenService'

/**
 * Background worker for precise token counting.
 * Prevents main thread blocking during massive project scans.
 */
self.onmessage = (e: MessageEvent) => {
  const { files } = e.data as { files: Array<{ id: string; content: string }> }

  const results = files.map((file) => {
    try {
      return {
        id: file.id,
        tokens: TokenService.getPreciseTokenCount(file.content),
        success: true,
      }
    } catch (err) {
      return {
        id: file.id,
        tokens: 0,
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  })

  self.postMessage({ results })
}
