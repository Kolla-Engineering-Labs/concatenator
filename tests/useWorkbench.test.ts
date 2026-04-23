import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useWorkbench } from '../src/web/hooks/useWorkbench'

describe('useWorkbench', () => {
  it('throws error when used outside of ModeProvider', () => {
    // Suppress console error for expected error
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => renderHook(() => useWorkbench())).toThrow(
      'useWorkbench must be used within a ModeProvider'
    )

    consoleSpy.mockRestore()
  })
})
