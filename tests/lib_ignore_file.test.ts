import { describe, it, expect } from 'vitest'
import { mergeIgnoreFileWithComments } from '../src/lib/ignore-file'

describe('mergeIgnoreFileWithComments', () => {
  it('merges new patterns into empty content', () => {
    const result = mergeIgnoreFileWithComments('', ['node_modules', 'dist'])
    expect(result).toBe('node_modules\ndist\n')
  })

  it('preserves header comments', () => {
    const existing = '# Header\n# More Header\n\nnode_modules\n'
    const result = mergeIgnoreFileWithComments(existing, [
      'node_modules',
      'dist',
    ])
    expect(result).toBe('# Header\n# More Header\n\nnode_modules\ndist\n')
  })

  it('removes patterns and their associated comments', () => {
    const existing = '# Pattern 1\nfile1.txt\n\n# Pattern 2\nfile2.txt\n'
    const result = mergeIgnoreFileWithComments(existing, ['file1.txt'])
    expect(result).toBe('# Pattern 1\nfile1.txt\n')
  })

  it('preserves footer comments if they contain #', () => {
    const existing = 'node_modules\n\n# Footer comment\n'
    const result = mergeIgnoreFileWithComments(existing, ['node_modules'])
    expect(result).toBe('node_modules\n\n# Footer comment\n')
  })

  it('drops footer comments if they are just blank lines', () => {
    const existing = 'node_modules\n\n\n'
    const result = mergeIgnoreFileWithComments(existing, ['node_modules'])
    expect(result).toBe('node_modules\n')
  })

  it('handles negated patterns', () => {
    const result = mergeIgnoreFileWithComments('!dist\n', ['!dist', 'src'])
    expect(result).toBe('!dist\nsrc\n')
  })

  it('keeps mid-file patterns and their comments', () => {
    const existing = 'node_modules\n\n# Mid comment\ndist\n'
    const result = mergeIgnoreFileWithComments(existing, [
      'node_modules',
      'dist',
    ])
    expect(result).toBe('node_modules\n\n# Mid comment\ndist\n')
  })
})
