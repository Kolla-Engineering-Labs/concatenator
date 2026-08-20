/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest'
import { NeutralizationStream } from './NeutralizationStream.js'

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
})
