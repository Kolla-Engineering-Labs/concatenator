/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AbsorptionToast } from '../src/web/components/Toast'

describe('AbsorptionToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders nothing when there are no absorptions', () => {
    const { container } = render(
      <AbsorptionToast absorptions={[]} onDismiss={() => {}} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders correctly with absorptions', async () => {
    const absorptions = [
      { child: 'src/components/Button.tsx', parent: 'src' },
      { child: 'src/hooks/useFetch.ts', parent: 'src' },
    ]
    render(<AbsorptionToast absorptions={absorptions} onDismiss={() => {}} />)

    // Initially might be invisible (opacity-0) but present in DOM
    expect(screen.getByText(/root pruning applied/i)).toBeDefined()
    expect(
      screen.getByText(/Merged 'Button.tsx, useFetch.ts' into 'src'/)
    ).toBeDefined()
  })

  it('calls onDismiss after the duration', () => {
    const onDismiss = vi.fn()
    const absorptions = [{ child: 'a', parent: 'b' }]

    render(
      <AbsorptionToast
        absorptions={absorptions}
        onDismiss={onDismiss}
        duration={1000}
      />
    )

    // Advance time past duration + transition buffer
    act(() => {
      vi.advanceTimersByTime(1500)
    })

    expect(onDismiss).toHaveBeenCalled()
  })

  it('calls onDismiss when close button is clicked', () => {
    const onDismiss = vi.fn()
    const absorptions = [{ child: 'a', parent: 'b' }]

    render(<AbsorptionToast absorptions={absorptions} onDismiss={onDismiss} />)

    const closeButton = screen.getByLabelText('Dismiss notification')
    fireEvent.click(closeButton)

    // Advance time for transition
    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(onDismiss).toHaveBeenCalled()
  })
})
