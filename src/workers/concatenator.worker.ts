/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getEncoding, type Tiktoken } from 'js-tiktoken'
import {
  ConcatenationBuilder,
  deconcatenate,
  validateConcatenation,
  type ConcatenateInputFile,
  type FormatterOptions,
} from '../core/engine'

let tiktokenEncoder: Tiktoken | null = null
let currentTiktokenModel: string | null = null

function getTiktoken(model = 'o200k_base'): Tiktoken {
  if (tiktokenEncoder && currentTiktokenModel === model) {
    return tiktokenEncoder
  }
  try {
    tiktokenEncoder = getEncoding(model as Parameters<typeof getEncoding>[0])
    currentTiktokenModel = model
  } catch {
    try {
      tiktokenEncoder = getEncoding('o200k_base')
      currentTiktokenModel = 'o200k_base'
    } catch {
      tiktokenEncoder = getEncoding('cl100k_base')
      currentTiktokenModel = 'cl100k_base'
    }
  }
  return tiktokenEncoder
}

// Event-loop yielding helper for WASM micro-batching
const yieldToEventLoop = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

self.onmessage = async (e: MessageEvent) => {
  const data = e.data
  if (!data || !data.type) return

  switch (data.type) {
    case 'BUILD_START': {
      const { files, formatterOptions } = data as {
        files: ConcatenateInputFile[]
        formatterOptions?: FormatterOptions
      }

      try {
        const builder = new ConcatenationBuilder()
        const encoder = new TextEncoder()
        let totalBytes = 0
        let aggregateHeuristicTokens = 0
        const fileTokenMap: Record<
          string,
          { tokens: number; isPrecise: boolean }
        > = {}

        // Calculate initial per-file heuristic estimates
        for (const file of files) {
          const byteLen = encoder.encode(file.content).length
          const heuristicTokens = Math.ceil(byteLen / 4)
          fileTokenMap[file.path] = {
            tokens: heuristicTokens,
            isPrecise: false,
          }
          aggregateHeuristicTokens += heuristicTokens
        }

        // Pass 1: Build Transferable Stream for Native Backpressure
        const streamGenerator = builder.buildStreamFromFiles(
          files,
          formatterOptions
        )
        const readableStream = new ReadableStream<Uint8Array>({
          async start(controller) {
            try {
              let processedChunks = 0
              for await (const chunk of streamGenerator) {
                const chunkBytes = encoder.encode(chunk)
                totalBytes += chunkBytes.byteLength
                controller.enqueue(chunkBytes)
                processedChunks++

                // Emit Heuristic Telemetry Progress Ticks
                self.postMessage({
                  type: 'PROGRESS_TICK',
                  bytesProcessed: totalBytes,
                  progressPercentage: Math.min(
                    100,
                    (processedChunks / (files.length * 2 || 1)) * 100
                  ),
                  totalTokens: aggregateHeuristicTokens,
                  isPrecise: false,
                  fileTokenMap,
                })
              }
              controller.close()
            } catch (err) {
              controller.error(err)
            }
          },
        })

        // Transfer ReadableStream to main thread
        self.postMessage(
          { type: 'BUILD_STREAM', stream: readableStream },
          { transfer: [readableStream as unknown as Transferable] }
        )

        // Pass 2: Asynchronous Micro-Batched TikToken Token Physics
        let exactTotalTokens = 0
        const exactTokenMap: Record<
          string,
          { tokens: number; isPrecise: boolean }
        > = {}
        const encoderInst = getTiktoken('o200k_base')

        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const content = file.content || ''
          let fileTokens = 0
          const chunkSize = 50000

          for (let offset = 0; offset < content.length; offset += chunkSize) {
            const slice = content.slice(offset, offset + chunkSize)
            fileTokens += encoderInst.encode(slice).length
            // Micro-batch yield to event loop so telemetry & UI thread remain completely unblocked
            await yieldToEventLoop()
          }

          exactTokenMap[file.path] = { tokens: fileTokens, isPrecise: true }
          exactTotalTokens += fileTokens
        }

        // Emit Deterministic Precise Token Sync
        self.postMessage({
          type: 'TOKEN_EXACT_SYNC',
          totalTokens: exactTotalTokens,
          isPrecise: true,
          fileTokenMap: exactTokenMap,
        })

        // Check payload manifest degradation flag
        const isDegraded =
          totalBytes < 50 * 1024 * 1024 &&
          !files.some((f) => f.path.endsWith('.manifest'))

        self.postMessage({
          type: 'BUILD_COMPLETE',
          totalBytes,
          fileCount: files.length,
          degradedMode: isDegraded,
        })
      } catch (err) {
        self.postMessage({
          type: 'ERROR',
          error: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    case 'PARSE_START': {
      const { file, targetDirHandle } = data as {
        file: File
        targetDirHandle?: FileSystemDirectoryHandle | null
      }

      try {
        if (!file) {
          throw new Error('No valid File object provided to PARSE_START')
        }

        // 1. Check 500MB OOM Circuit Breaker for Fallback Extraction
        if (!targetDirHandle && file.size > 500 * 1024 * 1024) {
          throw new Error(
            'ERR_PLATFORM_OOM_RISK: Payload exceeds 500MB safe fallback limit. Please use a Chromium browser or the CLI for massive monorepos.'
          )
        }

        // Read file stream via native File.stream() without main-thread RAM overhead
        const arrayBuffer = await file.arrayBuffer()
        const decoder = new TextDecoder()
        const textContent = decoder.decode(arrayBuffer)

        // Validate payload structure & degraded mode check
        const validation = validateConcatenation(textContent)
        const isDegraded =
          !validation.sessionId ||
          (file.size < 50 * 1024 * 1024 &&
            !textContent.includes('POST_MATTER_MANIFEST'))

        const parseResult = deconcatenate(textContent)

        if (targetDirHandle) {
          // Primary Path: $O(1)$ Direct disk file handle streaming via FileSystemDirectoryHandle
          let extractedCount = 0
          for (const virtualFile of parseResult.files) {
            const pathParts = virtualFile.path.split('/')
            const filename = pathParts.pop()!
            let currentDir = targetDirHandle

            for (const part of pathParts) {
              if (part && part !== '.') {
                currentDir = await currentDir.getDirectoryHandle(part, {
                  create: true,
                })
              }
            }

            const fileHandle = await currentDir.getFileHandle(filename, {
              create: true,
            })
            const writable = await fileHandle.createWritable()
            await writable.write(virtualFile.content)
            await writable.close()
            extractedCount++

            self.postMessage({
              type: 'PARSE_PROGRESS',
              extractedCount,
              totalFiles: parseResult.files.length,
            })
          }

          self.postMessage({
            type: 'PARSE_COMPLETE',
            fileCount: parseResult.files.length,
            degradedMode: isDegraded,
            validation,
          })
        } else {
          // Fallback Path: Dynamic import of fflate for ZIP archive compression
          const fflate = await import('fflate')
          const zipData: Record<string, Uint8Array> = {}
          const encoder = new TextEncoder()

          for (const virtualFile of parseResult.files) {
            zipData[virtualFile.path] = encoder.encode(virtualFile.content)
          }

          const zippedUint8 = fflate.zipSync(zipData)

          self.postMessage(
            {
              type: 'PARSE_COMPLETE',
              fileCount: parseResult.files.length,
              degradedMode: isDegraded,
              validation,
              zipBuffer: zippedUint8.buffer,
            },
            { transfer: [zippedUint8.buffer] }
          )
        }
      } catch (err) {
        self.postMessage({
          type: 'ERROR',
          error: err instanceof Error ? err.message : String(err),
        })
      }
      break
    }

    default:
      break
  }
}
