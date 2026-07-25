import React from 'react'
import { render, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ModeProvider } from '../src/web/context/ModeContext'
import { ModeContext } from '../src/web/context/ModeContextCore'
import { ApiClient } from '../src/web/services/ApiClient'

// Mock ApiClient
vi.mock('../src/web/services/ApiClient', () => ({
  ApiClient: {
    getIgnoreList: vi.fn(),
    updateIgnoreList: vi.fn(),
    getVfsState: vi.fn(),
  },
}))

describe('ModeContext Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('fetches initial ignore list from server', async () => {
    const mockList = ['node_modules', 'dist']
    vi.mocked(ApiClient.getIgnoreList).mockResolvedValue(mockList)
    vi.mocked(ApiClient.getVfsState).mockResolvedValue({
      tree: { children: [] },
      partial: false,
    })

    let contextValue: any
    render(
      <ModeProvider>
        <ModeContext.Consumer>
          {(value) => {
            contextValue = value
            return null
          }}
        </ModeContext.Consumer>
      </ModeProvider>
    )

    await waitFor(() => {
      expect(ApiClient.getIgnoreList).toHaveBeenCalled()
    })

    expect(contextValue.ignoreList).toEqual(['dist', 'node_modules'])
  })

  it('handles server fetch error gracefully', async () => {
    vi.mocked(ApiClient.getIgnoreList).mockRejectedValue(
      new Error('Network error')
    )

    render(
      <ModeProvider>
        <div>Test</div>
      </ModeProvider>
    )

    await waitFor(() => {
      expect(ApiClient.getIgnoreList).toHaveBeenCalled()
    })
    // Should not crash
  })

  it('syncs ignore list back to server when auto-save is enabled', async () => {
    vi.mocked(ApiClient.getIgnoreList).mockResolvedValue([])

    let contextValue: any
    render(
      <ModeProvider>
        <ModeContext.Consumer>
          {(value) => {
            contextValue = value
            return null
          }}
        </ModeContext.Consumer>
      </ModeProvider>
    )

    await act(async () => {
      contextValue.setAutoSaveIgnore(true)
    })

    await act(async () => {
      contextValue.addIgnorePattern('new-pattern')
    })

    await waitFor(() => {
      expect(ApiClient.updateIgnoreList).toHaveBeenCalledWith(['new-pattern'])
    })
  })

  it('provides helpers like resetWorkbench and toggleMode', async () => {
    vi.mocked(ApiClient.getIgnoreList).mockResolvedValue([])

    let contextValue: any
    render(
      <ModeProvider>
        <ModeContext.Consumer>
          {(value) => {
            contextValue = value
            return null
          }}
        </ModeContext.Consumer>
      </ModeProvider>
    )

    await act(async () => {
      contextValue.setForceMode(true)
      contextValue.setVirtualFileSystem({ 'test.txt': 'content' })
    })

    expect(contextValue.forceMode).toBe(true)
    expect(contextValue.virtualFileSystem).toEqual({ 'test.txt': 'content' })

    await act(async () => {
      contextValue.resetWorkbench()
    })

    expect(contextValue.forceMode).toBe(false)
    expect(contextValue.virtualFileSystem).toEqual({})
  })

  it('covers remaining helpers: isIgnored, removeIgnorePattern, setMode', async () => {
    vi.mocked(ApiClient.getIgnoreList).mockResolvedValue(['existing'])

    let contextValue: any
    render(
      <ModeProvider>
        <ModeContext.Consumer>
          {(value) => {
            contextValue = value
            return null
          }}
        </ModeContext.Consumer>
      </ModeProvider>
    )

    await waitFor(() => expect(contextValue.ignoreList).toContain('existing'))

    act(() => {
      expect(contextValue.isIgnored('existing')).toBe(true)
      contextValue.removeIgnorePattern('existing')
    })
    expect(contextValue.ignoreList).not.toContain('existing')

    act(() => {
      contextValue.setMode('deconcatenate')
    })
    expect(contextValue.mode).toBe('deconcatenate')
  })
})
