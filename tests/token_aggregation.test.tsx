/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTokenAggregation } from '../src/web/hooks/useTokenAggregation'
import { useFileTree } from '../src/web/features/concatenator/hooks/useFileTree'
import { FileItem } from '../src/core/types'
import { TokenService } from '../src/core/TokenService'

// Mock Worker
const mockInstances: any[] = []
class MockWorker {
  onmessage: any = null
  postMessage = vi.fn((data) => {
    if ((globalThis as any).disableAutomaticWorkerResponse) {
      return
    }
    // Simulate worker processing and returning results
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({
          data: {
            results: data.files.map((f: any) => ({
              id: f.id,
              tokens: f.content.length,
              isPrecise: true,
              success: true,
              hash: f.hash,
            })),
          },
        })
      }
    }, 10)
  })
  terminate = vi.fn()
  constructor() {
    mockInstances.push(this)
  }
}
global.Worker = MockWorker as any

describe('useTokenAggregation Hook', () => {
  const files: FileItem[] = [
    {
      name: 'test.ts',
      path: 'test.ts',
      kind: 'file',
      content: 'hello world',
      size: 11,
    },
  ]

  beforeEach(() => {
    ;(globalThis as any).disableAutomaticWorkerResponse = false
  })

  it('provides immediate heuristic estimates', async () => {
    const { result } = renderHook(() => useTokenAggregation(files))

    await waitFor(
      () => {
        expect(result.current.tokenMap['test.ts']).toBeDefined()
      },
      { timeout: 2000 }
    )

    expect(result.current.tokenMap['test.ts'].isPrecise).toBe(false)
    expect(result.current.tokenMap['test.ts'].tokens).toBe(Math.ceil(11 / 4))
  })

  it('updates to precise tokens via worker', async () => {
    const { result } = renderHook(() => useTokenAggregation(files))

    await waitFor(
      () => {
        expect(result.current.tokenMap['test.ts']?.isPrecise).toBe(true)
      },
      { timeout: 5000 }
    )

    expect(result.current.tokenMap['test.ts'].tokens).toBe(11)
  })

  it('skips non-file items and empty content', async () => {
    const mixedFiles: any[] = [
      { name: 'dir', path: 'dir', kind: 'directory' },
      { name: 'empty.ts', path: 'empty.ts', kind: 'file', content: '' },
      { name: 'binary.ts', path: 'binary.ts', kind: 'file', content: null },
    ]
    const { result } = renderHook(() => useTokenAggregation(mixedFiles))

    // Give it a moment to run effects
    await new Promise((r) => setTimeout(r, 100))
    expect(Object.keys(result.current.tokenMap).length).toBe(2)
  })

  it('debounces multiple worker messages', async () => {
    ;(globalThis as any).disableAutomaticWorkerResponse = true
    const { result } = renderHook(() => useTokenAggregation(files))

    await waitFor(
      () => {
        expect(result.current.tokenMap['test.ts']).toBeDefined()
      },
      { timeout: 2000 }
    )

    const worker = mockInstances[mockInstances.length - 1]
    const hash = TokenService.hashContent(files[0].content as string)

    // Simulate multiple messages
    act(() => {
      worker.onmessage({
        data: {
          results: [
            { id: 'test.ts', tokens: 10, success: true, isPrecise: true, hash },
          ],
        },
      })
      worker.onmessage({
        data: {
          results: [
            { id: 'test.ts', tokens: 20, success: true, isPrecise: true, hash },
          ],
        },
      })
    })

    // Wait for the debounce to settle and state to update
    await waitFor(
      () => {
        expect(result.current.tokenMap['test.ts'].tokens).toBe(20)
      },
      { timeout: 2000 }
    )

    expect(result.current.tokenMap['test.ts'].isPrecise).toBe(true)
    ;(globalThis as any).disableAutomaticWorkerResponse = false
  })

  it('uses hash cache for identical content', async () => {
    const { result, rerender } = renderHook(({ f }) => useTokenAggregation(f), {
      initialProps: { f: files },
    })

    // Wait for precise
    await waitFor(
      () => expect(result.current.tokenMap['test.ts']?.isPrecise).toBe(true),
      { timeout: 5000 }
    )
    const firstTokens = result.current.tokenMap['test.ts'].tokens

    // Swap files out
    act(() => {
      rerender({ f: [] })
    })

    await waitFor(() => {
      expect(Object.keys(result.current.tokenMap).length).toBe(0)
    })

    // Swap back in with same content
    act(() => {
      rerender({ f: files })
    })

    // Should be immediate precise now from cache
    await waitFor(() => {
      expect(result.current.tokenMap['test.ts']?.isPrecise).toBe(true)
    })
    expect(result.current.tokenMap['test.ts'].tokens).toBe(firstTokens)
  })
})

describe('useFileTree Aggregation', () => {
  const files: FileItem[] = [
    {
      name: 'a.ts',
      path: 'src/a.ts',
      kind: 'file',
      size: 10,
      content: 'a',
      tokens: 1,
      isPrecise: true,
    },
    {
      name: 'b.ts',
      path: 'src/b.ts',
      kind: 'file',
      size: 20,
      content: 'bb',
      tokens: 2,
      isPrecise: true,
    },
  ]

  it('aggregates token weights hierarchically', () => {
    const { result } = renderHook(() =>
      useFileTree(
        files,
        () => false,
        () => ({ ignored: false }),
        () => false,
        {}
      )
    )
    expect(result.current.tokenWeight).toBe(3)
  })

  it('marks directory as precise when all children are precise', () => {
    const { result } = renderHook(() =>
      useFileTree(
        files,
        () => false,
        () => ({ ignored: false }),
        () => false,
        {}
      )
    )
    expect(result.current.isPrecise).toBe(true)
  })

  it('excludes ignored files from hierarchical aggregation', () => {
    const isIgnored = (path: string) => path === 'src/b.ts'
    const { result } = renderHook(() =>
      useFileTree(
        files,
        isIgnored,
        (path) => ({ ignored: isIgnored(path) }),
        () => false,
        {}
      )
    )
    expect(result.current.tokenWeight).toBe(1)
  })
})
