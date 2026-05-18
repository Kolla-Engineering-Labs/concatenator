/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  beforeAll,
  afterAll,
} from 'vitest'

// We will setup global self mocking
const originalSelf = (globalThis as any).self
let postMessageMock = vi.fn()
let onmessageHandler: any = null

// Mock js-tiktoken to allow injecting failures for coverage of fallback branches
vi.mock('js-tiktoken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('js-tiktoken')>()
  return {
    ...actual,
    getEncoding: vi.fn((encodingName) => {
      if (
        encodingName === 'o200k_base' &&
        (globalThis as any).mockO200kBaseFail
      ) {
        throw new Error('o200k_base mock failure')
      }
      if (
        encodingName === 'cl100k_base' &&
        (globalThis as any).mockCl100kBaseNull
      ) {
        return null as any
      }

      const encoderInstance = actual.getEncoding(encodingName)
      const originalEncode = encoderInstance.encode.bind(encoderInstance)
      encoderInstance.encode = vi.fn((text) => {
        if ((globalThis as any).mockEncodeFailString) {
          throw 'encode failed string'
        }
        return originalEncode(text)
      })
      return encoderInstance
    }),
  }
})

describe('token.worker', () => {
  beforeAll(() => {
    // Create a mock self object
    const mockSelf = {
      isMockSelf: true,
      postMessage: (data: any) => {
        if ((globalThis as any).mockPostMessageFail) {
          ;(globalThis as any).mockPostMessageFail = false // clear flag so second call inside catch block works
          throw new Error('mock postMessage failure')
        }
        if ((globalThis as any).mockPostMessageFailString) {
          ;(globalThis as any).mockPostMessageFailString = false // clear flag
          throw 'fatal postMessage string failure'
        }
        postMessageMock(data)
      },
      get onmessage() {
        return onmessageHandler
      },
      set onmessage(handler) {
        onmessageHandler = handler
      },
    }

    // Attach to globalThis.self
    Object.defineProperty(globalThis, 'self', {
      value: mockSelf,
      writable: true,
      configurable: true,
    })
  })

  afterAll(() => {
    // Restore self
    Object.defineProperty(globalThis, 'self', {
      value: originalSelf,
      writable: true,
      configurable: true,
    })
  })

  beforeEach(() => {
    postMessageMock = vi.fn()
    onmessageHandler = null
    // Reset our custom mock flags
    delete (globalThis as any).mockO200kBaseFail
    delete (globalThis as any).mockCl100kBaseNull
    delete (globalThis as any).mockEncodeFailString
    delete (globalThis as any).mockPostMessageFail
    delete (globalThis as any).mockPostMessageFailString

    // Clear module cache so each test gets a fresh, clean instance of token.worker.ts with encoder = null
    vi.resetModules()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should register onmessage handler and process files (and cover o200k_base and already-defined encoder branches)', async () => {
    // Import the worker to execute its module setup and register the handler
    await import('../src/web/workers/token.worker')

    // Confirm that the worker registered self.onmessage
    expect(onmessageHandler).toBeDefined()
    expect(typeof onmessageHandler).toBe('function')

    // Mock a message event
    const event = {
      data: {
        files: [{ id: 'file1.txt', content: 'Hello World', hash: 'abc' }],
      },
    } as MessageEvent

    // Trigger the worker's handler the first time (sets up encoder)
    await onmessageHandler(event)
    expect(postMessageMock).toHaveBeenCalledTimes(1)

    // Trigger the worker's handler the second time (covers line 14 false branch when encoder is already defined)
    await onmessageHandler(event)
    expect(postMessageMock).toHaveBeenCalledTimes(2)

    const callArgs = postMessageMock.mock.calls[1][0]
    expect(callArgs.results[0].tokens).toBeGreaterThan(0)
  })

  it('should fallback to cl100k_base when o200k_base is unavailable (covers line 20)', async () => {
    // Trigger getEncoding('o200k_base') failure
    ;(globalThis as any).mockO200kBaseFail = true

    await import('../src/web/workers/token.worker')

    const event = {
      data: {
        files: [
          {
            id: 'file1.txt',
            content: 'Fallback testing content',
            hash: 'fallback',
          },
        ],
      },
    } as MessageEvent

    await onmessageHandler(event)

    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const callArgs = postMessageMock.mock.calls[0][0]
    expect(callArgs.results[0].tokens).toBeGreaterThan(0)
  })

  it('should fallback to char/4 heuristic when content is missing or not a string', async () => {
    await import('../src/web/workers/token.worker')

    const badEvent = {
      data: {
        files: [{ id: 'badfile.txt', content: undefined, hash: 'bad' }],
      },
    } as any

    await onmessageHandler(badEvent)

    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const callArgs = postMessageMock.mock.calls[0][0]
    expect(callArgs.results[0]).toEqual({
      id: 'badfile.txt',
      tokens: 0,
      isPrecise: true,
      success: true,
      hash: 'bad',
      error: expect.any(String),
    })
  })

  it('should handle chunking large files', async () => {
    await import('../src/web/workers/token.worker')

    // Create a very long string to cross the 50,000 chunkSize boundary
    const longString = 'a '.repeat(60000)

    const event = {
      data: {
        files: [{ id: 'largefile.txt', content: longString, hash: 'large' }],
      },
    } as MessageEvent

    await onmessageHandler(event)

    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const callArgs = postMessageMock.mock.calls[0][0]
    expect(callArgs.results[0].tokens).toBeGreaterThan(0)
  })

  it('should skip tokenizing if encoder is falsy (covers line 28 else branch)', async () => {
    // Both o200k_base fails and cl100k_base returns null
    ;(globalThis as any).mockO200kBaseFail = true
    ;(globalThis as any).mockCl100kBaseNull = true

    await import('../src/web/workers/token.worker')

    const event = {
      data: {
        files: [
          { id: 'noencoder.txt', content: 'No encoder loaded', hash: 'noenc' },
        ],
      },
    } as MessageEvent

    await onmessageHandler(event)

    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const callArgs = postMessageMock.mock.calls[0][0]
    expect(callArgs.results[0]).toEqual({
      id: 'noencoder.txt',
      tokens: 0,
      isPrecise: true,
      success: true,
      hash: 'noenc',
    })
  })

  it('should handle non-Error exceptions in encoder (covers line 51 else branch)', async () => {
    ;(globalThis as any).mockEncodeFailString = true

    await import('../src/web/workers/token.worker')

    const event = {
      data: {
        files: [
          { id: 'stringerr.txt', content: 'Trigger string error', hash: 'str' },
        ],
      },
    } as MessageEvent

    await onmessageHandler(event)

    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const callArgs = postMessageMock.mock.calls[0][0]
    expect(callArgs.results[0]).toEqual({
      id: 'stringerr.txt',
      tokens: 5, // Math.ceil(Trigger string error.length / 4)
      isPrecise: true,
      success: true,
      hash: 'str',
      error: 'encode failed string',
    })
  })

  it('should trigger fatal catch block on Error postMessage failure (covers line 61 then and line 67 truthy/falsy branches)', async () => {
    ;(globalThis as any).mockPostMessageFail = true

    await import('../src/web/workers/token.worker')

    // Pass multiple files: one with content, one with undefined content to cover truthy/falsy branches on line 67
    const event = {
      data: {
        files: [
          {
            id: 'testfile.txt',
            content: 'Testing fatal fallback',
            hash: 'fatal',
          },
          { id: 'badfile.txt', content: undefined, hash: 'bad' },
        ],
      },
    } as MessageEvent

    await onmessageHandler(event)

    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const callArgs = postMessageMock.mock.calls[0][0]
    expect(callArgs.results).toHaveLength(2)
    expect(callArgs.results[0]).toEqual({
      id: 'testfile.txt',
      tokens: expect.any(Number),
      isPrecise: true,
      success: true,
      hash: 'fatal',
    })
    expect(callArgs.results[1]).toEqual({
      id: 'badfile.txt',
      tokens: 0,
      isPrecise: true,
      success: true,
      hash: 'bad',
    })
  })

  it('should trigger fatal catch block on non-Error postMessage failure (covers line 61 else branch)', async () => {
    ;(globalThis as any).mockPostMessageFailString = true

    await import('../src/web/workers/token.worker')

    const event = {
      data: {
        files: [
          {
            id: 'testfile.txt',
            content: 'Testing string fallback',
            hash: 'fatalstring',
          },
        ],
      },
    } as MessageEvent

    await onmessageHandler(event)

    expect(postMessageMock).toHaveBeenCalledTimes(1)
    const callArgs = postMessageMock.mock.calls[0][0]
    expect(callArgs.results[0]).toEqual({
      id: 'testfile.txt',
      tokens: expect.any(Number),
      isPrecise: true,
      success: true,
      hash: 'fatalstring',
    })
  })
})
