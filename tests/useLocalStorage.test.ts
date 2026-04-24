import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useLocalStorage } from '../src/web/hooks/useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('initializes with value from localStorage if exists', () => {
    localStorage.setItem('test-key', JSON.stringify('stored-value'))
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    expect(result.current[0]).toBe('stored-value')
  })

  it('initializes with default value if localStorage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('handles non-JSON strings in localStorage for string types', () => {
    localStorage.setItem('test-key', 'raw-string')
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    expect(result.current[0]).toBe('raw-string')
  })

  it('returns default value if localStorage contains invalid JSON for non-string types', () => {
    localStorage.setItem('test-key', 'invalid-json')
    const { result } = renderHook(() => useLocalStorage('test-key', { a: 1 }))
    expect(result.current[0]).toEqual({ a: 1 })
  })

  it('returns default value if parsed JSON type does not match initialValue type (corrupted/legacy)', () => {
    // Expected object, got string
    localStorage.setItem('test-key', JSON.stringify('not-an-object'))
    const { result } = renderHook(() =>
      useLocalStorage('test-key', { key: 'val' })
    )
    expect(result.current[0]).toEqual({ key: 'val' })
  })

  it('updates localStorage when value changes', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    act(() => {
      result.current[1]('new-value')
    })
    expect(result.current[0]).toBe('new-value')
    expect(localStorage.getItem('test-key')).toBe('new-value')
  })

  it('handles localStorage errors during initialization', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage blocked')
    })
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    expect(result.current[0]).toBe('default')
    expect(console.error).toHaveBeenCalled()
  })

  it('handles localStorage errors during update (e.g. QuotaExceededError)', () => {
    const { result } = renderHook(() => useLocalStorage('test-key', 'default'))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Quota exceeded')
    })
    act(() => {
      result.current[1]('too-large')
    })
    expect(result.current[0]).toBe('too-large')
    expect(console.error).toHaveBeenCalled()
  })

  it('supports number types', () => {
    localStorage.setItem('test-key', JSON.stringify(42))
    const { result } = renderHook(() => useLocalStorage('test-key', 0))
    expect(result.current[0]).toBe(42)
  })

  it('supports boolean types', () => {
    localStorage.setItem('test-key', JSON.stringify(true))
    const { result } = renderHook(() => useLocalStorage('test-key', false))
    expect(result.current[0]).toBe(true)
  })
})
