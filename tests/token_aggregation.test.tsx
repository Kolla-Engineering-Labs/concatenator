import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useTokenAggregation } from '../src/web/hooks/useTokenAggregation'
import { useFileTree } from '../src/web/features/concatenator/hooks/useFileTree'
import { FileItem } from '../src/core/types'

// Mock Worker
const mockInstances: any[] = []
class MockWorker {
  onmessage: any = null
  postMessage = vi.fn((data) => {
    // Simulate worker processing and returning results
    setTimeout(() => {
      if (this.onmessage) {
        this.onmessage({
          data: {
            results: data.files.map((f: any) => ({
              id: f.id,
              tokens: f.content.length, // Simple mock calculation
              success: true,
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

  it('provides immediate heuristic estimates', async () => {
    const { result } = renderHook(() => useTokenAggregation(files))

    expect(result.current.tokenMap['test.ts']).toBeDefined()
    expect(result.current.tokenMap['test.ts'].isPrecise).toBe(false)
    expect(result.current.tokenMap['test.ts'].tokens).toBe(Math.ceil(11 / 4))
  })

  it('updates to precise tokens via worker', async () => {
    const { result } = renderHook(() => useTokenAggregation(files))

    await waitFor(
      () => {
        expect(result.current.tokenMap['test.ts'].isPrecise).toBe(true)
      },
      { timeout: 2000 }
    )

    expect(result.current.tokenMap['test.ts'].tokens).toBe(11) // Our mock worker returns length
  })

  it('skips non-file items and empty content', async () => {
    const mixedFiles: any[] = [
      { name: 'dir', path: 'dir', kind: 'directory' },
      { name: 'empty.ts', path: 'empty.ts', kind: 'file', content: '' },
      { name: 'binary.ts', path: 'binary.ts', kind: 'file', content: null },
    ]
    const { result } = renderHook(() => useTokenAggregation(mixedFiles))

    expect(Object.keys(result.current.tokenMap).length).toBe(0)
  })

  it('debounces multiple worker messages', async () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => useTokenAggregation(files))

    // Access the internal worker instance
    const worker = mockInstances[mockInstances.length - 1]

    // Simulate multiple messages
    act(() => {
      worker.onmessage({
        data: { results: [{ id: 'test.ts', tokens: 10, success: true }] },
      })
      worker.onmessage({
        data: { results: [{ id: 'test.ts', tokens: 20, success: true }] },
      })
    })

    // Advance timer but not all the way
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current.tokenMap['test.ts'].isPrecise).toBe(false) // Still heuristic

    // Advance all the way
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current.tokenMap['test.ts'].tokens).toBe(20) // Final message won
    vi.useRealTimers()
  })

  it('uses hash cache for identical content', async () => {
    const { result, rerender } = renderHook(({ f }) => useTokenAggregation(f), {
      initialProps: { f: files },
    })

    // Wait for precise
    await waitFor(() =>
      expect(result.current.tokenMap['test.ts'].isPrecise).toBe(true)
    )
    const firstTokens = result.current.tokenMap['test.ts'].tokens

    // Swap files out and back in with same content
    rerender({ f: [] })
    rerender({ f: files })

    // Should be immediate precise now from cache
    expect(result.current.tokenMap['test.ts'].isPrecise).toBe(true)
    expect(result.current.tokenMap['test.ts'].tokens).toBe(firstTokens)
  })
})

describe('useFileTree Aggregation', () => {
  const files: FileItem[] = [
    { name: 'a.ts', path: 'src/a.ts', kind: 'file', size: 10 },
    { name: 'b.ts', path: 'src/b.ts', kind: 'file', size: 20 },
  ]
  const isIgnored = () => false

  it('aggregates token weights hierarchically', () => {
    const tokenMap = {
      'src/a.ts': { tokens: 5, isPrecise: true },
      'src/b.ts': { tokens: 10, isPrecise: false },
    }

    const { result } = renderHook(() => useFileTree(files, isIgnored, tokenMap))

    const root = result.current
    const srcDir = root.name === 'src' ? root : root.children?.[0]

    expect(srcDir?.tokenWeight).toBe(15)
    expect(srcDir?.isPrecise).toBe(false) // One child is imprecise
  })

  it('marks directory as precise when all children are precise', () => {
    const tokenMap = {
      'src/a.ts': { tokens: 5, isPrecise: true },
      'src/b.ts': { tokens: 10, isPrecise: true },
    }

    const { result } = renderHook(() => useFileTree(files, isIgnored, tokenMap))

    const root = result.current
    const srcDir = root.name === 'src' ? root : root.children?.[0]

    expect(srcDir?.tokenWeight).toBe(15)
    expect(srcDir?.isPrecise).toBe(true)
  })

  it('excludes ignored files from hierarchical aggregation', () => {
    const tokenMap = {
      'src/a.ts': { tokens: 5, isPrecise: true },
      'src/b.ts': { tokens: 10, isPrecise: true },
    }
    // Ignore src/b.ts
    const isIgnored = (path: string) => path === 'src/b.ts'

    const { result } = renderHook(() => useFileTree(files, isIgnored, tokenMap))

    const root = result.current
    const srcDir = root.name === 'src' ? root : root.children?.[0]

    // Only src/a.ts should contribute to srcDir's weight
    expect(srcDir?.tokenWeight).toBe(5)
    // However, the ignored node itself should still show its internal tokens for UI purposes
    const bNode = srcDir?.children?.find((c) => c.name === 'b.ts')
    expect(bNode?.tokenWeight).toBe(10)
    expect(bNode?.isIgnored).toBe(true)
  })
})
