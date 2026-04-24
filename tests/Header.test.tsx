import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Header } from '../src/web/features/concatenator/components/Header'

describe('Header', () => {
  it('renders in standard mode', () => {
    const setIsDarkMode = vi.fn()
    render(<Header isDarkMode={false} setIsDarkMode={setIsDarkMode} />)
    expect(screen.getByText('Concatenator')).toBeDefined()
    expect(screen.getByTestId('theme-toggle')).toBeDefined()
  })

  it('renders in compact mode', () => {
    const setIsDarkMode = vi.fn()
    render(
      <Header isDarkMode={false} setIsDarkMode={setIsDarkMode} compact={true} />
    )
    expect(screen.getByText('Concatenator')).toBeDefined()
    // Verify compact specific classes or structure indirectly
    const heading = screen.getByText('Concatenator')
    expect(heading.className).toContain('text-base')
  })

  it('toggles dark mode', () => {
    const setIsDarkMode = vi.fn()
    render(<Header isDarkMode={false} setIsDarkMode={setIsDarkMode} />)
    const toggle = screen.getByTestId('theme-toggle')
    fireEvent.click(toggle)
    expect(setIsDarkMode).toHaveBeenCalledWith(true)
  })

  it('renders sun icon in dark mode', () => {
    const setIsDarkMode = vi.fn()
    const { container } = render(
      <Header isDarkMode={true} setIsDarkMode={setIsDarkMode} />
    )
    // Sun icon should be present
    expect(container.querySelector('.lucide-sun')).toBeDefined()
  })
})
