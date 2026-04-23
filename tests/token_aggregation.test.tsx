import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useTokenAggregation } from '../src/web/hooks/useTokenAggregation'
import { useFileTree } from '../src/web/features/concatenator/hooks/useFileTree'
import { FileItem } from '../src/core/types'

// Mock Worker
class MockWorker {
  onmessage: (e: any) => void = () => {}
  postMessage = vi.fn((data) => {
    // Simulate worker processing and returning results
    setTimeout(() => {
      this.onmessage({
        data: {
          results: data.files.map((f: any) => ({
            id: f.id,
            tokens: f.content.length, // Simple mock calculation
            success: true,
          })),
        },
      })
    }, 10)
  })
  terminate = vi.fn()
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
})
