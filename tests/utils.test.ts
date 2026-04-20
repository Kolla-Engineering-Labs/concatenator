import { describe, it, expect } from 'vitest'
import { cn } from '../src/lib/utils'

describe('cn utility function', () => {
  it('merges simple class strings', () => {
    const result = cn('class1', 'class2')
    expect(result).toBe('class1 class2')
  })

  it('handles single class string', () => {
    const result = cn('single-class')
    expect(result).toBe('single-class')
  })

  it('filters out falsy values', () => {
    const shouldShow = false
    const result = cn(
      'class1',
      shouldShow && 'class2',
      'class3',
      null,
      undefined,
      0,
      ''
    )
    expect(result).toBe('class1 class3')
  })

  it('handles conditional classes with objects', () => {
    const isActive = true
    const isDisabled = false
    const result = cn('base-class', {
      'active-class': isActive,
      'disabled-class': isDisabled,
    })
    expect(result).toBe('base-class active-class')
  })

  it('handles arrays of classes', () => {
    const result = cn(['class1', 'class2'], 'class3')
    expect(result).toBe('class1 class2 class3')
  })

  it('handles nested arrays', () => {
    const result = cn(['class1', ['nested1', 'nested2']], 'class2')
    expect(result).toBe('class1 nested1 nested2 class2')
  })

  it('deduplicates conflicting Tailwind classes', () => {
    const result = cn('px-2 py-1', 'px-4')
    // tailwind-merge should keep the last conflicting class
    expect(result).toBe('py-1 px-4')
  })

  it('handles empty input', () => {
    const result = cn()
    expect(result).toBe('')
  })

  it('handles all falsy input', () => {
    const result = cn(false, null, undefined, 0, '')
    expect(result).toBe('')
  })

  it('merges Tailwind color classes correctly', () => {
    const result = cn('text-red-500', 'text-blue-500')
    expect(result).toBe('text-blue-500')
  })

  it('preserves non-conflicting Tailwind classes', () => {
    const result = cn('flex items-center', 'justify-between', 'gap-4')
    expect(result).toBe('flex items-center justify-between gap-4')
  })

  it('handles responsive modifiers', () => {
    const result = cn('w-full', 'md:w-1/2', 'lg:w-1/3')
    expect(result).toBe('w-full md:w-1/2 lg:w-1/3')
  })

  it('handles hover and focus states', () => {
    const result = cn('bg-blue-500', 'hover:bg-blue-600', 'focus:ring-2')
    expect(result).toBe('bg-blue-500 hover:bg-blue-600 focus:ring-2')
  })

  it('handles dark mode classes', () => {
    const result = cn(
      'bg-white',
      'dark:bg-slate-900',
      'text-slate-900',
      'dark:text-white'
    )
    expect(result).toBe(
      'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
    )
  })

  it('handles arbitrary values in Tailwind', () => {
    const result = cn('w-[100px]', 'h-[200px]')
    expect(result).toBe('w-[100px] h-[200px]')
  })

  it('handles mixed types in single call', () => {
    const condition = true
    const result = cn(
      'base',
      condition && 'conditional',
      { 'object-class': true },
      ['array-class'],
      null
    )
    expect(result).toBe('base conditional object-class array-class')
  })

  it('overrides previous padding with later padding', () => {
    const result = cn('p-4', 'p-2')
    expect(result).toBe('p-2')
  })

  it('overrides previous margin with later margin', () => {
    const result = cn('m-4', 'm-8')
    expect(result).toBe('m-8')
  })
})
