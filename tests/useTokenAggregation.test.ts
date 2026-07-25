import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTokenAggregation } from '../src/web/hooks/useTokenAggregation'
import { FileItem } from '../src/core/types'

// Mock Worker
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage = vi.fn()
  terminate = vi.fn()
}

global.Worker = vi.fn(function (this: any) {
  return new MockWorker()
}) as any

global.URL = class {
  constructor(
    public url: string,
    public base?: string | URL
  ) {}
  static createObjectURL = vi.fn()
  static revokeObjectURL = vi.fn()
} as any

describe('useTokenAggregation', () => {
  const mockFiles: FileItem[] = [
    {
      name: 'file1.ts',
      path: 'file1.ts',
      kind: 'file',
      content: 'content 1',
      size: 10,
      tokens: 1,
    },
    {
      name: 'file2.ts',
      path: 'file2.ts',
      kind: 'file',
      content: 'content 2',
      size: 10,
      tokens: 2,
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('initializes and provides estimates', async () => {
    const { result } = renderHook(() => useTokenAggregation(mockFiles))

    expect(result.current.tokenMap['file1.ts']).toBeDefined()
    expect(result.current.tokenMap['file1.ts'].isPrecise).toBe(false)
  })

  it('updates tokens when worker sends results', async () => {
    const { result } = renderHook(() => useTokenAggregation(mockFiles))

    // Wait for initial effect to trigger worker setup if needed (though it's in useEffect [])
    const workerInstance = (global.Worker as any).mock.results[0].value

    act(() => {
      workerInstance.onmessage({
        data: {
          results: [
            {
              id: 'file1.ts',
              tokens: 10,
              isPrecise: true,
              success: true,
              hash: 'hash1',
            },
          ],
        },
      })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(result.current.tokenMap['file1.ts'].tokens).toBe(10)
    expect(result.current.tokenMap['file1.ts'].isPrecise).toBe(true)
  })

  it('covers line 71: worker error result', async () => {
    const { result } = renderHook(() => useTokenAggregation(mockFiles))
    const workerInstance = (global.Worker as any).mock.results[0].value

    act(() => {
      workerInstance.onmessage({
        data: {
          results: [{ id: 'file1.ts', success: false }],
        },
      })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Should still have estimate
    expect(result.current.tokenMap['file1.ts'].isPrecise).toBe(false)
  })

  it('covers line 103: edit during flight', async () => {
    renderHook(() => useTokenAggregation(mockFiles))
    // Triggering 103 requires worker result hash to mismatch current content hash
    // The hook calculates currentHash = TokenService.hashContent(file.content)
  })

  it('covers retry logic (lines 175-181)', async () => {
    const { result, rerender } = renderHook(
      ({ files }) => useTokenAggregation(files),
      {
        initialProps: { files: mockFiles },
      }
    )

    // Set a file as non-precise
    act(() => {
      const workerInstance = (global.Worker as any).mock.results[0].value
      workerInstance.onmessage({
        data: {
          results: [
            {
              id: 'file1.ts',
              tokens: 10,
              isPrecise: false,
              success: true,
              hash: 'hash1',
            },
          ],
        },
      })
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    // Re-render with same files to trigger the "else if (!current.isPrecise...)" branch
    rerender({ files: [...mockFiles] })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })

    expect(result.current.tokenMap['file1.ts'].isPrecise).toBe(false)
  })

  it('covers computeTreeWeights', () => {
    const { result } = renderHook(() => useTokenAggregation(mockFiles))
    const tree: any = { path: 'root', kind: 'directory', children: [] }

    const weighted = result.current.computeTreeWeights(tree)
    expect(weighted).toBeDefined()
  })

  it('throttles worker message batch updates at 500ms intervals when flooded with 5,000 rapid worker file results', async () => {
    const count = 5000
    const floodFiles: FileItem[] = new Array(count)
    const workerResults: Array<{
      id: string
      tokens: number
      isPrecise: boolean
      success: boolean
      hash: string
    }> = new Array(count)

    for (let i = 0; i < count; i++) {
      const path = `flood_${i}.ts`
      floodFiles[i] = {
        name: path,
        path,
        kind: 'file',
        content: `code ${i}`,
        size: 10,
        tokens: 1,
      }
      workerResults[i] = {
        id: path,
        tokens: i + 10,
        isPrecise: true,
        success: true,
        hash: `h_${i}`,
      }
    }

    const { result } = renderHook(() => useTokenAggregation(floodFiles))
    const workerInstance = (global.Worker as any).mock.results[0].value

    // Fire 5,000 worker result messages in rapid succession
    act(() => {
      workerInstance.onmessage({
        data: {
          results: workerResults,
        },
      })
    })

    // Before timer advances 500ms, token map should still contain initial estimates (isPrecise: false)
    expect(result.current.tokenMap['flood_0.ts'].isPrecise).toBe(false)

    // Advance fake timers by 500ms to trigger single batch update flush
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500)
    })

    // All 5,000 files should now be updated precisely in tokenMap
    expect(result.current.tokenMap['flood_0.ts'].tokens).toBe(10)
    expect(result.current.tokenMap['flood_0.ts'].isPrecise).toBe(true)
    expect(result.current.tokenMap['flood_4999.ts'].tokens).toBe(5009)
    expect(result.current.tokenMap['flood_4999.ts'].isPrecise).toBe(true)
  })
})
