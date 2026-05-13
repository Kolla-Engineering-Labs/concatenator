/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getEncoding, type Tiktoken } from 'js-tiktoken'
import { logger } from '../../lib/logger'

let encoder: Tiktoken | null = null

self.onmessage = async (e: MessageEvent) => {
  const { files } = e.data as { files: Array<{ id: string; content: string }> }
  try {
    if (!encoder) {
      // o200k_base is the standard for GPT-4o
      encoder = getEncoding('o200k_base')
    }

    const results = files.map((file) => {
      try {
        const tokens = encoder?.encode(file.content).length || 0
        return {
          id: file.id,
          tokens,
          isPrecise: true,
          success: true,
        }
      } catch (err) {
        return {
          id: file.id,
          tokens: Math.ceil(file.content.length / 4),
          isPrecise: false,
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })

    self.postMessage({ results })
  } catch (err) {
    logger.error(
      '[Worker] Fatal error:',
      err instanceof Error ? err : new Error(String(err))
    )
    self.postMessage({
      results: files.map((f) => ({
        id: f.id,
        tokens: Math.ceil(f.content.length / 4),
        isPrecise: false,
        success: false,
      })),
    })
  }
}
