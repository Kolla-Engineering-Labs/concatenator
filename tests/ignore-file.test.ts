import { describe, it, expect } from 'vitest'
import { mergeIgnoreFileWithComments } from '../src/lib/ignore-file'

describe('mergeIgnoreFileWithComments', () => {
  it('creates a new ignore file from patterns', () => {
    const patterns = ['node_modules', 'dist']
    const result = mergeIgnoreFileWithComments('', patterns)
    expect(result).toBe('node_modules\ndist\n')
  })

  it('preserves header comments even if no patterns follow', () => {
    const existing = '# Header\n# Another line\n\n'
    const patterns: string[] = []
    const result = mergeIgnoreFileWithComments(existing, patterns)
    expect(result).toBe('# Header\n# Another line\n')
  })

  it('keeps comments associated with a pattern when the pattern is kept', () => {
    const existing = '# Node dependencies\nnode_modules\n# Build output\ndist'
    const patterns = ['node_modules', 'dist']
    const result = mergeIgnoreFileWithComments(existing, patterns)
    expect(result).toBe(
      '# Node dependencies\nnode_modules\n# Build output\ndist\n'
    )
  })

  it('drops comments associated with a pattern when the pattern is removed', () => {
    const existing = '# Node dependencies\nnode_modules\n# Build output\ndist'
    const patterns = ['dist']
    const result = mergeIgnoreFileWithComments(existing, patterns)
    // # Node dependencies is treated as a header because it's at the top
    expect(result).toBe('# Node dependencies\n# Build output\ndist\n')
  })

  it('preserves header comments when patterns are added', () => {
    const existing = '# Custom Ignore File'
    const patterns = ['node_modules']
    const result = mergeIgnoreFileWithComments(existing, patterns)
    expect(result).toBe('# Custom Ignore File\nnode_modules\n')
  })

  it('appends new patterns at the end of the file', () => {
    const existing = 'node_modules'
    const patterns = ['node_modules', 'dist']
    const result = mergeIgnoreFileWithComments(existing, patterns)
    expect(result).toBe('node_modules\ndist\n')
  })

  it('handles negation patterns correctly', () => {
    const patterns = ['node_modules', '!node_modules/keep-me']
    const result = mergeIgnoreFileWithComments('', patterns)
    expect(result).toBe('node_modules\n!node_modules/keep-me\n')
  })

  it('preserves footer comments containing #', () => {
    const existing = 'node_modules\n# This is a footer comment'
    const patterns = ['node_modules']
    const result = mergeIgnoreFileWithComments(existing, patterns)
    expect(result).toBe('node_modules\n# This is a footer comment\n')
  })

  it('drops empty line footers', () => {
    const existing = 'node_modules\n\n\n'
    const patterns = ['node_modules']
    const result = mergeIgnoreFileWithComments(existing, patterns)
    expect(result).toBe('node_modules\n')
  })

  it('handles reordering: existing patterns stay in place, new ones appended', () => {
    const existing = 'b\na'
    const patterns = ['a', 'b', 'c']
    const result = mergeIgnoreFileWithComments(existing, patterns)
    // b and a should stay in their original relative order
    expect(result).toBe('b\na\nc\n')
  })
})
