/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, test } from 'vitest'
import { NeutralizationStream } from './NeutralizationStream.js'
import { ManifestInterceptorStream } from './ManifestInterceptorStream.js'
import { IVFSAdapter } from '../PathValidator.js'

async function streamToString(
  stream: ReadableStream<Uint8Array>
): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  result += decoder.decode()
  return result
}

// Provide a zero-op passthrough VFS for the state machine test
const mockVFS: IVFSAdapter = {
  lstat: async () => ({ isSymbolicLink: () => false }),
  realpath: async (p) => p,
  exists: async () => true,
}

describe('NeutralizationStream', () => {
  it('passes chunks through unmodified when enableNeutralization is false', async () => {
    const encoder = new TextEncoder()
    const transform = new NeutralizationStream(false)
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('```hello```'))
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const result = await streamToString(outputStream)
    expect(result).toBe('```hello```')
  })

  it('neutralizes triple backticks within a single chunk', async () => {
    const encoder = new TextEncoder()
    const transform = new NeutralizationStream(true)
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('const code = ```js\nconsole.log("hi");\n```;')
        )
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const result = await streamToString(outputStream)
    expect(result).toBe(
      'const code = \\`\\`\\`js\nconsole.log("hi");\n\\`\\`\\`;'
    )
  })

  it('neutralizes triple backticks split across chunk boundaries (2 backticks + 1 backtick)', async () => {
    const encoder = new TextEncoder()
    const transform = new NeutralizationStream(true)
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('prefix ``'))
        controller.enqueue(encoder.encode('`suffix'))
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const result = await streamToString(outputStream)
    expect(result).toBe('prefix \\`\\`\\`suffix')
  })

  it('neutralizes triple backticks split across 3 chunks (1 + 1 + 1 backticks)', async () => {
    const encoder = new TextEncoder()
    const transform = new NeutralizationStream(true)
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('start `'))
        controller.enqueue(encoder.encode('`'))
        controller.enqueue(encoder.encode('` end'))
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const result = await streamToString(outputStream)
    expect(result).toBe('start \\`\\`\\` end')
  })

  it('handles multi-byte UTF-8 characters split across chunk boundaries', async () => {
    const encoder = new TextEncoder()
    const emojiBytes = encoder.encode('Hello 🚀 World') // 🚀 is 4 bytes: 0xF0 0x9F 0x99 0x80

    // Split in the middle of emoji bytes
    const chunk1 = emojiBytes.slice(0, 8) // 'Hello ' (6) + first 2 bytes of emoji
    const chunk2 = emojiBytes.slice(8) // remaining 2 bytes of emoji + ' World'

    const transform = new NeutralizationStream(true)
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(chunk1)
        controller.enqueue(chunk2)
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const result = await streamToString(outputStream)
    expect(result).toBe('Hello 🚀 World')
  })
  it('flush() drains tail buffer when stream ends with 1 orphaned backtick', async () => {
    // Regression guard for the EOF two-source drain in flush().
    // Input ends with a single ` that was held in `tail` pending a possible triple.
    // On stream close, flush() must emit it as a literal backtick (not suppress it).
    const encoder = new TextEncoder()
    const transform = new NeutralizationStream(true)
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('text `'))
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const result = await streamToString(outputStream)
    expect(result).toBe('text `')
  })

  it('flush() drains tail buffer when stream ends with 2 orphaned backticks', async () => {
    // Regression guard for the EOF two-source drain in flush().
    // Input ends with `` that was held in `tail`. flush() must emit both
    // as literal backticks (they cannot form a triple at EOF).
    const encoder = new TextEncoder()
    const transform = new NeutralizationStream(true)
    const readable = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('text ``'))
        controller.close()
      },
    })

    const outputStream = readable.pipeThrough(transform)
    const result = await streamToString(outputStream)
    expect(result).toBe('text ``')
  })

  test('State Machine Transition: Preserves exact byte alignment on PASSTHROUGH', async () => {
    const stream = new ManifestInterceptorStream({ vfsAdapter: mockVFS })
    const writer = stream.writable.getWriter()
    const reader = stream.readable.getReader()

    // Construct a payload where the exact byte following the newline is 0xAA
    const preamble = Buffer.from(
      '<<<<< KEL_MANIFEST_START >>>>>\nfile.txt|0644|hash\n<<<<< KEL_MANIFEST_END >>>>>\n'
    )
    const payload = Buffer.from([0xaa, 0xbb, 0xcc])
    const combined = Buffer.concat([preamble, payload])

    // Intentional slice right down the middle of the END delimiter to stress the chunk accumulator
    const sliceIndex = preamble.length - 5
    void writer.write(combined.subarray(0, sliceIndex))
    void writer.write(combined.subarray(sliceIndex))
    void writer.close()

    const { value } = await reader.read()

    // If Antigravity missed a +1 on the index slice, this will be the '>' character (0x3E) instead of 0xAA
    expect(value).toBeDefined()
    expect(value![0]).toBe(0xaa)
    expect(value!.length).toBe(3)
  })
})
