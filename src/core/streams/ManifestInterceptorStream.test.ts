/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, test } from 'vitest'
import { ManifestInterceptorStream } from './ManifestInterceptorStream.js'
import {
  PathTraversalError,
  SymlinkRejectedError,
  ManifestSizeExceededError,
} from '../errors.js'
import type { IVFSAdapter } from '../PathValidator.js'

describe('ManifestInterceptorStream', () => {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  async function collectStream(
    stream: ReadableStream<Uint8Array>
  ): Promise<string> {
    const reader = stream.getReader()
    let result = ''
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (value) {
          result += decoder.decode(value, { stream: true })
        }
      }
      result += decoder.decode()
      return result
    } finally {
      reader.releaseLock()
    }
  }

  it('validates manifest and cleanly passes through payload bytes', async () => {
    const mockVfs: IVFSAdapter = {
      lstat: vi.fn().mockResolvedValue({ isSymbolicLink: () => false }),
      realpath: vi.fn().mockImplementation(async (p: string) => p),
    }

    const interceptor = new ManifestInterceptorStream({
      rootDir: '/mock/jail',
      vfsAdapter: mockVfs,
    })

    const manifestChunk = encoder.encode(
      '<<<<< KEL_MANIFEST_START (ID: abc123) >>>>>\n' +
        'src/file1.ts|0644|hash1\n' +
        'src/file2.ts|0644|hash2\n' +
        '<<<<< KEL_MANIFEST_END >>>>>\n'
    )
    const file1Chunk = encoder.encode(
      '<<<<< FILE_START: src/file1.ts >>>>>\nconst a = 1;\n<<<<< FILE_END >>>>>\n'
    )
    const file2Chunk = encoder.encode(
      '<<<<< FILE_START: src/file2.ts >>>>>\nconst b = 2;\n<<<<< FILE_END >>>>>\n'
    )

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(manifestChunk)
        controller.enqueue(file1Chunk)
        controller.enqueue(file2Chunk)
        controller.close()
      },
    })

    const output = await collectStream(source.pipeThrough(interceptor))

    expect(output).toContain('<<<<< FILE_START: src/file1.ts >>>>>')
    expect(output).toContain('const a = 1;')
    expect(output).toContain('<<<<< FILE_START: src/file2.ts >>>>>')
    expect(output).toContain('const b = 2;')
    expect(mockVfs.lstat).toHaveBeenCalled()
  })

  it('correctly handles chunk-boundary splitting of KEL_MANIFEST_END delimiter', async () => {
    const mockVfs: IVFSAdapter = {
      lstat: vi.fn().mockResolvedValue({ isSymbolicLink: () => false }),
      realpath: vi.fn().mockImplementation(async (p: string) => p),
    }

    const interceptor = new ManifestInterceptorStream({
      rootDir: '/mock/jail',
      vfsAdapter: mockVfs,
    })

    const part1 = encoder.encode(
      '<<<<< KEL_MANIFEST_START >>>>>\n' +
        'src/main.ts|0644|none\n' +
        '<<<<< KEL_MANI'
    )
    const part2 = encoder.encode(
      'FEST_END >>>>>\n<<<<< FILE_START: src/main.ts >>>>>\nhello\n<<<<< FILE_END >>>>>\n'
    )

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(part1)
        controller.enqueue(part2)
        controller.close()
      },
    })

    const output = await collectStream(source.pipeThrough(interceptor))
    expect(output).toContain('<<<<< FILE_START: src/main.ts >>>>>')
    expect(output).toContain('hello')
  })

  it('triggers ManifestSizeExceededError when preamble exceeds MAX_MANIFEST_BYTES circuit breaker', async () => {
    const interceptor = new ManifestInterceptorStream({
      maxManifestBytes: 100, // Strict small limit for test
    })

    const largePreambleChunk = encoder.encode(
      '<<<<< KEL_MANIFEST_START >>>>>\n' + 'a'.repeat(200)
    )

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(largePreambleChunk)
        controller.close()
      },
    })

    await expect(
      collectStream(source.pipeThrough(interceptor))
    ).rejects.toThrow(ManifestSizeExceededError)
  })

  it('instantly aborts stream when path traversal is detected in manifest', async () => {
    const interceptor = new ManifestInterceptorStream({
      rootDir: '/mock/jail',
    })

    const maliciousManifest = encoder.encode(
      '<<<<< KEL_MANIFEST_START >>>>>\n' +
        '../../etc/shadow|0644|none\n' +
        '<<<<< KEL_MANIFEST_END >>>>>\n'
    )

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(maliciousManifest)
        controller.close()
      },
    })

    await expect(
      collectStream(source.pipeThrough(interceptor))
    ).rejects.toThrow(PathTraversalError)
  })

  it('instantly aborts stream when absolute path injection is detected', async () => {
    const interceptor = new ManifestInterceptorStream({
      rootDir: '/mock/jail',
    })

    const maliciousManifest = encoder.encode(
      '<<<<< KEL_MANIFEST_START >>>>>\n' +
        '/root/id_rsa|0600|none\n' +
        '<<<<< KEL_MANIFEST_END >>>>>\n'
    )

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(maliciousManifest)
        controller.close()
      },
    })

    await expect(
      collectStream(source.pipeThrough(interceptor))
    ).rejects.toThrow(PathTraversalError)
  })

  it('instantly aborts stream when symlink is detected via injected vfsAdapter', async () => {
    const mockVfs: IVFSAdapter = {
      lstat: vi.fn().mockResolvedValue({ isSymbolicLink: () => true }),
      realpath: vi.fn().mockImplementation(async (p: string) => p),
    }

    const interceptor = new ManifestInterceptorStream({
      rootDir: '/mock/jail',
      vfsAdapter: mockVfs,
    })

    const manifestChunk = encoder.encode(
      '<<<<< KEL_MANIFEST_START >>>>>\n' +
        'symlink-target.ts|0644|none\n' +
        '<<<<< KEL_MANIFEST_END >>>>>\n'
    )

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(manifestChunk)
        controller.close()
      },
    })

    await expect(
      collectStream(source.pipeThrough(interceptor))
    ).rejects.toThrow(SymlinkRejectedError)
  })

  it('validates manifest entries in bounded batches', async () => {
    const lstatSpy = vi.fn().mockResolvedValue({ isSymbolicLink: () => false })
    const mockVfs: IVFSAdapter = {
      lstat: lstatSpy,
      realpath: vi.fn().mockImplementation(async (p: string) => p),
    }

    const batchSize = 10
    const interceptor = new ManifestInterceptorStream({
      rootDir: '/mock/jail',
      vfsAdapter: mockVfs,
      batchSize,
    })

    let manifestLines = '<<<<< KEL_MANIFEST_START >>>>>\n'
    for (let i = 0; i < 25; i++) {
      manifestLines += `src/file_${i}.ts|0644|none\n`
    }
    manifestLines += '<<<<< KEL_MANIFEST_END >>>>>\n'

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(manifestLines))
        controller.close()
      },
    })

    await collectStream(source.pipeThrough(interceptor))
    expect(lstatSpy).toHaveBeenCalled()
  })

  test('Batch Concurrency: Throttles VFS validation to batchSize limits', async () => {
    let inFlight = 0
    let maxInFlight = 0

    // Synthetic IVFSAdapter that tracks parallel execution width
    const trackerVFS = {
      lstat: async (_path: string) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5)) // Artificial I/O delay
        inFlight--
        return { isSymbolicLink: () => false }
      },
    }

    const stream = new ManifestInterceptorStream({
      vfsAdapter: trackerVFS,
      batchSize: 64,
    })
    const writer = stream.writable.getWriter()

    // Generate a massive 1,000 file manifest
    let bigManifest = '<<<<< KEL_MANIFEST_START >>>>>\n'
    for (let i = 0; i < 1000; i++) bigManifest += `file${i}.ts|0644|hash\n`
    bigManifest += '<<<<< KEL_MANIFEST_END >>>>>\n'

    void writer.write(Buffer.from(bigManifest))
    void writer.close()

    // Consume stream via reader to trigger the validation and bypass TS DOM definitions
    const reader = stream.readable.getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }

    // If this equals 1000, Antigravity mapped the promises before slicing the batches
    expect(maxInFlight).toBeLessThanOrEqual(64)
    expect(maxInFlight).toBeGreaterThan(0)
  })
})
