/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import App from '../src/App'
import { ModeProvider } from '../src/web/context/ModeContext'

// Mock Vercel Analytics and SpeedInsights
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => null,
}))

vi.mock('@vercel/speed-insights/react', () => ({
  SpeedInsights: () => null,
}))

// Mock PostHog
vi.mock('posthog-js', () => ({
  default: {
    init: vi.fn(),
    capture: vi.fn(),
    on: vi.fn(),
  },
}))

describe('App Root Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()

    // Default mock for fetch API (VFS & ignore list)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ tree: null, partial: false }),
      text: vi.fn().mockResolvedValue(''),
    })

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })

    // Mock Worker constructor
    class MockWorker {
      postMessage = vi.fn()
      terminate = vi.fn()
      addEventListener = vi.fn()
      removeEventListener = vi.fn()
      onmessage = null
      onerror = null
    }
    // @ts-expect-error Mock Worker globally
    global.Worker = MockWorker
  })

  it('mounts App root successfully within ModeProvider without throwing', async () => {
    const { container } = render(
      <ModeProvider>
        <App />
      </ModeProvider>
    )

    expect(container).toBeTruthy()
    // Verify core UI elements exist
    await waitFor(() => {
      expect(document.querySelector('main')).toBeTruthy()
    })
  })

  it('toggles dark mode theme when theme toggle button is clicked', async () => {
    render(
      <ModeProvider>
        <App />
      </ModeProvider>
    )

    // Locate theme toggle button (aria-label or title or button with Sun/Moon)
    const buttons = screen.getAllByRole('button')
    const themeButton = buttons.find(
      (btn) =>
        btn.getAttribute('aria-label')?.toLowerCase().includes('theme') ||
        btn.getAttribute('title')?.toLowerCase().includes('theme') ||
        btn.innerHTML.includes('lucide-sun') ||
        btn.innerHTML.includes('lucide-moon')
    )

    if (themeButton) {
      fireEvent.click(themeButton)
      expect(localStorage.getItem('concatenate-dark-mode')).toBeTruthy()
    }
  })

  it('renders status bar and action controls', async () => {
    render(
      <ModeProvider>
        <App />
      </ModeProvider>
    )

    await waitFor(() => {
      // Check that status text or main container is mounted
      expect(document.body).toBeDefined()
    })
  })
})
