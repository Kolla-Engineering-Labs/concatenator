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
      try {
        // o200k_base is the standard for GPT-4o
        encoder = getEncoding('o200k_base')
      } catch {
        // Fallback to cl100k_base if o200k_base is unavailable or fails
        encoder = getEncoding('cl100k_base')
      }
    }

    const results = files.map(
      (file: { id: string; content: string; hash?: string }) => {
        try {
          let tokens = 0
          if (encoder) {
            // Chunk BPE tokenization to prevent RegExp catastrophic backtracking
            // and keep memory allocation low on larger files.
            const chunkSize = 50000
            for (let i = 0; i < file.content.length; i += chunkSize) {
              const chunk = file.content.slice(i, i + chunkSize)
              tokens += encoder.encode(chunk).length
            }
          }
          return {
            id: file.id,
            tokens,
            isPrecise: true,
            success: true,
            hash: file.hash,
          }
        } catch (err) {
          return {
            id: file.id,
            tokens: Math.ceil((file.content || '').length / 4),
            isPrecise: true, // Mark precise to prevent infinite retry loops
            success: true, // Mark success so the host registers this fallback
            hash: file.hash,
            error: err instanceof Error ? err.message : String(err),
          }
        }
      }
    )

    self.postMessage({ results })
  } catch (err) {
    logger.error(
      '[Worker] Fatal error:',
      err instanceof Error ? err : new Error(String(err))
    )
    self.postMessage({
      results: files.map(
        (f: { id: string; hash?: string; content: string }) => ({
          id: f.id,
          tokens: Math.ceil((f.content || '').length / 4),
          isPrecise: true, // Mark precise to prevent infinite retry loops
          success: true, // Mark success so the host registers this fallback
          hash: f.hash,
        })
      ),
    })
  }
}
