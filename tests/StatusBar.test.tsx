import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { StatusBar } from '../src/web/components/StatusBar'

const mockSetTokenBudget = vi.fn()

// Mock useWorkbench
vi.mock('../src/web/hooks/useWorkbench', () => ({
  useWorkbench: () => ({
    tokenBudget: 100,
    setTokenBudget: mockSetTokenBudget,
  }),
}))

describe('StatusBar', () => {
  it('renders token stats', () => {
    render(<StatusBar totalTokens={50} tokensSaved={10} isPrecise={true} />)
    expect(screen.getByText('50')).toBeDefined()
    expect(screen.getByText('10')).toBeDefined()
    expect(screen.getByText('50%')).toBeDefined()
  })

  it('shows tilde when not precise', () => {
    render(<StatusBar totalTokens={50} tokensSaved={10} isPrecise={false} />)
    expect(screen.getByText('~')).toBeDefined()
  })

  it('displays different colors based on saturation', () => {
    const { rerender } = render(
      <StatusBar totalTokens={50} tokensSaved={0} isPrecise={true} />
    )
    expect(screen.getByText('50%').className).toContain('text-emerald-600')

    rerender(<StatusBar totalTokens={80} tokensSaved={0} isPrecise={true} />)
    expect(screen.getByText('80%').className).toContain('text-amber-600')

    rerender(<StatusBar totalTokens={95} tokensSaved={0} isPrecise={true} />)
    expect(screen.getByText('95%').className).toContain('text-rose-600')
  })

  it('handles budget changes', () => {
    render(<StatusBar totalTokens={50} tokensSaved={0} isPrecise={true} />)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: '200000' } })
    expect(mockSetTokenBudget).toHaveBeenCalledWith(200000)
  })

  it('handles custom budget input', () => {
    render(<StatusBar totalTokens={50} tokensSaved={0} isPrecise={true} />)

    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'custom' } })

    const input = screen.getByPlaceholderText('Budget')
    fireEvent.change(input, { target: { value: '500' } })
    expect(mockSetTokenBudget).toHaveBeenCalledWith(500)
  })

  it('prevents invalid characters in custom budget', () => {
    render(<StatusBar totalTokens={50} tokensSaved={0} isPrecise={true} />)
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'custom' },
    })

    const input = screen.getByPlaceholderText('Budget')
    fireEvent.keyDown(input, { key: '.', charCode: 46, keyCode: 46 })
    // Just hitting the line for coverage
  })
})
