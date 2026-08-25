import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useConcatenationConfig } from './useConcatenationConfig'

describe('useConcatenationConfig', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('initializes with default KEL Protocol configuration values', () => {
    const { result } = renderHook(() => useConcatenationConfig())

    expect(result.current.format).toBe('markdown')
    expect(result.current.neutralize).toBe(true)
    expect(result.current.manifest).toBe(true)
    expect(result.current.stripComments).toBe(false)

    expect(result.current.getPayloadMatrix()).toEqual({
      outputFormat: 'markdown',
      enableNeutralization: true,
      injectPostMatterManifest: true,
      stripComments: false,
    })
  })

  it('loads persistent configuration state from localStorage if present', () => {
    window.localStorage.setItem('kel:config_format', JSON.stringify('xml'))
    window.localStorage.setItem('kel:config_neutralize', JSON.stringify(false))
    window.localStorage.setItem('kel:config_manifest', JSON.stringify(false))
    window.localStorage.setItem(
      'kel:config_strip_comments',
      JSON.stringify(true)
    )

    const { result } = renderHook(() => useConcatenationConfig())

    expect(result.current.format).toBe('xml')
    expect(result.current.neutralize).toBe(false)
    expect(result.current.manifest).toBe(false)
    expect(result.current.stripComments).toBe(true)

    expect(result.current.getPayloadMatrix()).toEqual({
      outputFormat: 'xml',
      enableNeutralization: false,
      injectPostMatterManifest: false,
      stripComments: true,
    })
  })

  it('updates format state and syncs to localStorage', () => {
    const { result } = renderHook(() => useConcatenationConfig())

    act(() => {
      result.current.setFormat('xml')
    })

    expect(result.current.format).toBe('xml')
    expect(window.localStorage.getItem('kel:config_format')).toBe(
      JSON.stringify('xml')
    )
    expect(result.current.getPayloadMatrix().outputFormat).toBe('xml')
  })

  it('updates neutralize state and syncs to localStorage', () => {
    const { result } = renderHook(() => useConcatenationConfig())

    act(() => {
      result.current.setNeutralize(false)
    })

    expect(result.current.neutralize).toBe(false)
    expect(window.localStorage.getItem('kel:config_neutralize')).toBe(
      JSON.stringify(false)
    )
    expect(result.current.getPayloadMatrix().enableNeutralization).toBe(false)
  })

  it('updates manifest state and syncs to localStorage', () => {
    const { result } = renderHook(() => useConcatenationConfig())

    act(() => {
      result.current.setManifest(false)
    })

    expect(result.current.manifest).toBe(false)
    expect(window.localStorage.getItem('kel:config_manifest')).toBe(
      JSON.stringify(false)
    )
    expect(result.current.getPayloadMatrix().injectPostMatterManifest).toBe(
      false
    )
  })

  it('updates stripComments state and syncs to localStorage', () => {
    const { result } = renderHook(() => useConcatenationConfig())

    act(() => {
      result.current.setStripComments(true)
    })

    expect(result.current.stripComments).toBe(true)
    expect(window.localStorage.getItem('kel:config_strip_comments')).toBe(
      JSON.stringify(true)
    )
    expect(result.current.getPayloadMatrix().stripComments).toBe(true)
  })
})
