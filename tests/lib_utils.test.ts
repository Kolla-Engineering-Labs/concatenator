import { describe, it, expect } from 'vitest'
import { estimateTokenCount, formatFileSize } from '../src/lib/utils'

describe('lib/utils', () => {
  it('estimates tokens for ArrayBuffer', () => {
    const buffer = new ArrayBuffer(40)
    expect(estimateTokenCount(buffer)).toBe(10)
  })

  it('formats large file sizes', () => {
    expect(formatFileSize(1024 * 1024 * 1024 * 2.5)).toBe('2.5 GB')
  })

  it('handles undefined bytes', () => {
    expect(formatFileSize(undefined)).toBe('-')
  })
})
