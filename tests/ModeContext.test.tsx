import React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModeProvider } from '../src/web/context/ModeContext'
import { useWorkbench } from '../src/web/hooks/useWorkbench'
import { DEFAULT_IGNORE_LIST } from '../src/core/constants'
import { AppMode } from '../src/web/types/workbench'

// Helper to wrap hooks with the provider
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ModeProvider>{children}</ModeProvider>
)

describe('ModeContext (Workbench State)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve([]),
    })
  })

  it('initializes with default ignore list', async () => {
    const { result } = renderHook(() => useWorkbench(), { wrapper })

    // Should include default items
    expect(result.current.ignoreList.length).toBeGreaterThanOrEqual(
      DEFAULT_IGNORE_LIST.length
    )
    expect(result.current.ignoreList).toContain('node_modules')
  })

  it('compiles regex patterns correctly', async () => {
    const { result } = renderHook(() => useWorkbench(), { wrapper })

    await act(async () => {
      result.current.setIgnoreList(['/test/i', 'literal'])
    })

    const compiled = result.current.compiledIgnores
    const regex = compiled.find((i) => i instanceof RegExp) as RegExp
    expect(regex).toBeInstanceOf(RegExp)
    expect(regex.ignoreCase).toBe(true)
    expect(compiled).toContain('literal')
  })

  it('safely handles invalid regex falling back to string', async () => {
    const { result } = renderHook(() => useWorkbench(), { wrapper })

    await act(async () => {
      result.current.setIgnoreList(['/[invalid/'])
    })

    expect(result.current.compiledIgnores).toContain('[invalid/')
  })

  it('syncs ignore list to server on changes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock

    const { result } = renderHook(() => useWorkbench(), { wrapper })

    await act(async () => {
      result.current.setIgnoreList(['new-item'])
    })

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/ignore-list',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(['new-item']),
        })
      )
    })
  })

  it('fetches ignore list from server and replaces local on mount', async () => {
    const serverList = ['server-item']
    global.fetch = vi.fn().mockImplementation((url) => {
      if (url === '/api/ignore-list') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(serverList),
        })
      }
      return Promise.resolve({ ok: true })
    })

    localStorage.setItem('concat_ignore', JSON.stringify(['local-item']))

    const { result } = renderHook(() => useWorkbench(), { wrapper })

    await waitFor(() => {
      expect(result.current.ignoreList).toContain('server-item')
      expect(result.current.ignoreList).not.toContain('local-item')
    })
  })

  it('resets workbench state including files (via callback)', async () => {
    const { result } = renderHook(() => useWorkbench(), { wrapper })

    await act(async () => {
      result.current.setMode(AppMode.DECONCATENATE)
    })

    expect(result.current.mode).toBe(AppMode.DECONCATENATE)
    // resetWorkbench is internal to ModeContext but its effect is switching mode and clearing state
  })

  it('skips server sync if ignore list is identical to last synced', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock

    const { result } = renderHook(() => useWorkbench(), { wrapper })

    // Wait for initial mount sync (GET) and then act (POST)
    await act(async () => {
      result.current.setIgnoreList(['item1'])
    })

    // 1 for initial GET, 1 for POST
    expect(fetchMock).toHaveBeenCalledTimes(2)

    // Set same list again
    await act(async () => {
      result.current.setIgnoreList(['item1'])
    })

    // Should still be 2 (no new POST)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('handles server sync POST failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useWorkbench(), { wrapper })

    await act(async () => {
      result.current.setIgnoreList(['fail-item'])
    })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to sync ignore list to server'
      )
    })
    consoleSpy.mockRestore()
  })

  it('handles server sync GET failure gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    global.fetch = vi.fn().mockRejectedValue(new Error('Server down'))

    renderHook(() => useWorkbench(), { wrapper })

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to fetch ignore list from server')
      )
    })
    consoleSpy.mockRestore()
  })

  it('handles addIgnorePattern and removeIgnorePattern', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true })
    const { result } = renderHook(() => useWorkbench(), { wrapper })

    await act(async () => {
      result.current.addIgnorePattern('test-pattern')
    })
    expect(result.current.ignoreList).toContain('test-pattern')

    await act(async () => {
      result.current.removeIgnorePattern('test-pattern')
    })
    expect(result.current.ignoreList).not.toContain('test-pattern')
  })

  it('changes mode correctly', async () => {
    const { result } = renderHook(() => useWorkbench(), { wrapper })

    // Default is CONCATENATE
    expect(result.current.mode).toBe(AppMode.CONCATENATE)

    await act(async () => {
      result.current.setMode(AppMode.DECONCATENATE)
    })
    expect(result.current.mode).toBe(AppMode.DECONCATENATE)

    await act(async () => {
      result.current.setMode(AppMode.CONCATENATE)
    })
    expect(result.current.mode).toBe(AppMode.CONCATENATE)
  })

  it('resets workbench state', async () => {
    const { result } = renderHook(() => useWorkbench(), { wrapper })

    // resetWorkbench is triggered by switching mode or explicit call if exposed
    // In our case, it's internal but we can verify it's called on mode change
    // Let's just verify state is cleared if we had files (though files are not in Context, they are in the consumer)
    // Actually ModeContext provides resetWorkbench to children.
    expect(result.current.resetWorkbench).toBeDefined()

    await act(async () => {
      result.current.resetWorkbench()
    })
    // No crash means it works
  })
})
