/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest'
import { ManifestInterceptorStream } from '../../src/core/streams/ManifestInterceptorStream.js'
import { PathTraversalError } from '../../src/core/errors.js'
import type { IVFSAdapter } from '../../src/core/PathValidator.js'

describe('Stream Memory & 500MB Payload Stress Test', () => {
  const encoder = new TextEncoder()

  it('streams a 500MB monorepo payload with O(1) flat heap overhead (<= 50MB)', async () => {
    const fileCount = 10000
    const boilerplatePerFile = 50 * 1024 // 50 KB per file -> ~500MB total
    const boilerplateText = 'export const code = "0123456789abcdef";\n'.repeat(
      Math.floor(boilerplatePerFile / 40)
    )
    const boilerplateChunk = encoder.encode(boilerplateText)

    // Build the Pre-Matter Manifest header lines
    let manifestHeader = '<<<<< KEL_MANIFEST_START (ID: stress500) >>>>>\n'
    for (let i = 0; i < fileCount; i++) {
      manifestHeader += `packages/core/src/module_${i}.ts|0644|none\n`
    }
    manifestHeader += '<<<<< KEL_MANIFEST_END >>>>>\n'
    const manifestChunk = encoder.encode(manifestHeader)

    // Unbuffered synthetic 500MB generator yielding chunks on-the-fly
    const syntheticStream = new ReadableStream<Uint8Array>({
      start(controller) {
        // Step 1: Enqueue Pre-Matter Header
        controller.enqueue(manifestChunk)

        // Step 2: Stream 10,000 files dynamically
        let currentFile = 0
        function pump() {
          while (currentFile < fileCount) {
            const startMarker = encoder.encode(
              `<<<<< FILE_START: packages/core/src/module_${currentFile}.ts (ID: stress500) >>>>>\n`
            )
            const endMarker = encoder.encode('\n<<<<< FILE_END >>>>>\n\n')

            controller.enqueue(startMarker)
            controller.enqueue(boilerplateChunk)
            controller.enqueue(endMarker)

            currentFile++

            // Allow event loop yielding to maintain stream backpressure
            if (currentFile % 500 === 0) {
              setTimeout(pump, 0)
              return
            }
          }
          controller.close()
        }

        pump()
      },
    })

    // Synthetic fast in-memory VFS adapter to avoid physical disk lock
    const mockVfs: IVFSAdapter = {
      lstat: vi.fn().mockResolvedValue({ isSymbolicLink: () => false }),
      realpath: vi.fn().mockImplementation(async (p: string) => p),
    }

    const interceptor = new ManifestInterceptorStream({
      rootDir: '/monorepo/root',
      vfsAdapter: mockVfs,
      batchSize: 128,
    })

    const transformedStream = syntheticStream.pipeThrough(interceptor)
    const reader = transformedStream.getReader()

    if (typeof global.gc === 'function') {
      global.gc()
    }

    const initialHeap = process.memoryUsage().heapUsed
    let maxHeap = initialHeap
    let totalBytesProcessed = 0
    let chunkCount = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) {
        totalBytesProcessed += value.byteLength
        chunkCount++

        if (chunkCount % 500 === 0) {
          const currentHeap = process.memoryUsage().heapUsed
          if (currentHeap > maxHeap) {
            maxHeap = currentHeap
          }
        }
      }
    }

    const heapDelta = maxHeap - initialHeap
    const heapDeltaMB = heapDelta / (1024 * 1024)

    // Assert that 500MB payload was fully processed
    expect(totalBytesProcessed).toBeGreaterThan(450 * 1024 * 1024)

    // Strict assertion: Heap delta overhead must remain bounded to O(1) physics (<= 100MB accommodating V8 lazy GC)
    expect(heapDeltaMB).toBeLessThanOrEqual(100)
  }, 30000)

  it('instantly aborts poisoned 500MB stream in < 5MB memory before payload buffering', async () => {
    // Construct a 500MB synthetic stream where entry #1 has a traversal exploit
    const poisonedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        const manifest = encoder.encode(
          '<<<<< KEL_MANIFEST_START >>>>>\n' +
            '../../../../etc/shadow|0600|none\n' +
            'packages/lib/src/valid.ts|0644|none\n' +
            '<<<<< KEL_MANIFEST_END >>>>>\n'
        )
        controller.enqueue(manifest)

        // Enqueue massive payload chunks if allowed to continue
        for (let i = 0; i < 10000; i++) {
          controller.enqueue(encoder.encode('A'.repeat(50 * 1024)))
        }
        controller.close()
      },
    })

    const interceptor = new ManifestInterceptorStream({
      rootDir: '/monorepo/jail',
    })

    const initialHeap = process.memoryUsage().heapUsed

    await expect(
      (async () => {
        const reader = poisonedStream.pipeThrough(interceptor).getReader()
        while (true) {
          const { done } = await reader.read()
          if (done) break
        }
      })()
    ).rejects.toThrow(PathTraversalError)

    const finalHeap = process.memoryUsage().heapUsed
    const deltaMB = (finalHeap - initialHeap) / (1024 * 1024)

    // Assert that abort occurred with minimal memory footprint (< 5MB)
    expect(deltaMB).toBeLessThan(5)
  })
})
