import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, createEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import React from 'react'
import { StatusBar } from '../src/web/components/StatusBar'
import { useWorkbench } from '../src/web/hooks/useWorkbench'

// Mock useWorkbench
vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: vi.fn(),
}))

describe('StatusBar Component', () => {
  const mockSetTokenBudget = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useWorkbench).mockReturnValue({
      tokenBudget: 128000,
      setTokenBudget: mockSetTokenBudget,
    } as any)
  })

  it('renders total tokens and tokens saved', () => {
    render(<StatusBar totalTokens={5000} tokensSaved={1000} isPrecise={true} />)

    expect(screen.getByText('5,000')).toBeInTheDocument()
    expect(screen.getByText('1,000')).toBeInTheDocument()
  })

  it('shows tilde for imprecise token counts', () => {
    render(
      <StatusBar totalTokens={5000} tokensSaved={1000} isPrecise={false} />
    )

    expect(screen.getByText('~')).toBeInTheDocument()
  })

  it('changes budget when a preset is selected', () => {
    render(<StatusBar totalTokens={5000} tokensSaved={1000} isPrecise={true} />)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '1000000' } })

    expect(mockSetTokenBudget).toHaveBeenCalledWith(1000000)
  })

  it('shows custom input when Custom is selected', () => {
    render(<StatusBar totalTokens={5000} tokensSaved={1000} isPrecise={true} />)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'custom' } })

    const input = screen.getByPlaceholderText('Budget')
    expect(input).toBeInTheDocument()
  })

  it('sanitizes custom budget input: rounds up and ensures positive', () => {
    render(<StatusBar totalTokens={5000} tokensSaved={1000} isPrecise={true} />)

    // First enable custom mode
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'custom' } })

    const input = screen.getByPlaceholderText('Budget')

    // Test decimal rounding up
    fireEvent.change(input, { target: { value: '500.1' } })
    expect(mockSetTokenBudget).toHaveBeenCalledWith(501)

    // Test negative conversion to positive
    fireEvent.change(input, { target: { value: '-1000' } })
    expect(mockSetTokenBudget).toHaveBeenCalledWith(1000)

    // Test negative decimal
    fireEvent.change(input, { target: { value: '-12.3' } })
    expect(mockSetTokenBudget).toHaveBeenCalledWith(13)
  })

  it('blocks non-integer keys on key down', () => {
    render(<StatusBar totalTokens={5000} tokensSaved={1000} isPrecise={true} />)

    // First enable custom mode
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'custom' } })

    const input = screen.getByPlaceholderText('Budget')

    const checkKey = (key: string) => {
      const event = createEvent.keyDown(input, { key })
      fireEvent(input, event)
      return event.defaultPrevented
    }

    expect(checkKey('.')).toBe(true)
    expect(checkKey('-')).toBe(true)
    expect(checkKey('e')).toBe(true)
    expect(checkKey('E')).toBe(true)
    expect(checkKey('+')).toBe(true)

    // Should NOT block normal numbers
    expect(checkKey('5')).toBe(false)
  })
})
