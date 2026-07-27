/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ConcatenatorWorkerClient } from '../src/web/services/concatenatorWorkerClient'

// Create a MockWorker class to simulate Web Worker postMessage RPC
class MockWorker {
  public onmessage: ((e: MessageEvent) => void) | null = null
  public onerror: ((e: Event) => void) | null = null
  private listeners: Map<string, EventListener[]> = new Map()

  public addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, [])
    }
    this.listeners.get(type)!.push(listener)
  }

  public removeEventListener(type: string, listener: EventListener) {
    const list = this.listeners.get(type)
    if (list) {
      this.listeners.set(
        type,
        list.filter((l) => l !== listener)
      )
    }
  }

  public dispatchToClient(data: unknown) {
    const event = { data } as MessageEvent
    if (this.onmessage) this.onmessage(event)
    const list = this.listeners.get('message') || []
    list.forEach((l) => (l as unknown as (e: MessageEvent) => void)(event))
  }

  public postMessage(message: unknown) {
    const data = message as {
      type: string
      file?: File
      targetDirHandle?: unknown
    }
    if (data.type === 'BUILD_START') {
      setTimeout(() => {
        this.dispatchToClient({
          type: 'PROGRESS_TICK',
          bytesProcessed: 100,
          progressPercentage: 50,
          totalTokens: 25,
          isPrecise: false,
          fileTokenMap: { 'test.ts': { tokens: 25, isPrecise: false } },
        })
        this.dispatchToClient({
          type: 'TOKEN_EXACT_SYNC',
          totalTokens: 20,
          isPrecise: true,
          fileTokenMap: { 'test.ts': { tokens: 20, isPrecise: true } },
        })
        this.dispatchToClient({
          type: 'BUILD_COMPLETE',
          totalBytes: 100,
          fileCount: 1,
          degradedMode: false,
        })
      }, 10)
    } else if (data.type === 'PARSE_START') {
      setTimeout(() => {
        if (
          !data.targetDirHandle &&
          data.file &&
          data.file.size > 500 * 1024 * 1024
        ) {
          this.dispatchToClient({
            type: 'ERROR',
            error:
              'ERR_PLATFORM_OOM_RISK: Payload exceeds 500MB safe fallback limit. Please use a Chromium browser or the CLI for massive monorepos.',
          })
        } else {
          this.dispatchToClient({
            type: 'PARSE_COMPLETE',
            fileCount: 1,
            degradedMode: false,
          })
        }
      }, 10)
    }
  }

  public terminate() {
    this.listeners.clear()
  }
}

describe('concatenator.worker & ConcatenatorWorkerClient', () => {
  const originalWorker = globalThis.Worker

  beforeEach(() => {
    vi.restoreAllMocks()
    ;(globalThis as unknown as { Worker: unknown }).Worker = MockWorker
  })

  afterEach(() => {
    ;(globalThis as unknown as { Worker: unknown }).Worker = originalWorker
  })

  it('should instantiate ConcatenatorWorkerClient cleanly', () => {
    const client = new ConcatenatorWorkerClient()
    expect(client).toBeDefined()
    client.terminate()
  })

  it('should handle exportConcatenation user-gesture stream fallback gracefully', async () => {
    const client = new ConcatenatorWorkerClient()
    const files = [
      { path: 'test.ts', content: 'console.log("hello world")', mode: '0644' },
    ]
    const onProgress = vi.fn()
    const onSync = vi.fn()
    const onComplete = vi.fn()

    const win = window as unknown as Window & {
      showSaveFilePicker?: (...args: unknown[]) => Promise<unknown>
    }
    win.showSaveFilePicker = vi.fn().mockRejectedValue(new Error('AbortError'))

    await client.exportConcatenation(
      files,
      {},
      {
        onProgressTick: onProgress,
        onTokenExactSync: onSync,
        onBuildComplete: onComplete,
      }
    )

    expect(onProgress).toHaveBeenCalled()
    expect(onSync).toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalled()

    client.terminate()
  })

  it('should enforce 500MB circuit breaker on fallback parse extraction', async () => {
    const client = new ConcatenatorWorkerClient()
    const largeFile = new File(['a'.repeat(100)], 'large.txt', {
      type: 'text/plain',
    })
    Object.defineProperty(largeFile, 'size', { value: 600 * 1024 * 1024 })

    const onError = vi.fn()

    await expect(client.extractBundle(largeFile, { onError })).rejects.toThrow(
      'ERR_PLATFORM_OOM_RISK'
    )

    client.terminate()
  })
})
